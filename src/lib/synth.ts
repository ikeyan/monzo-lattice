/**
 * 音響合成 (仕様 §8)。
 *
 * 各ノートは音色のスペクトル (spectrum.ts、ボイシングのコスト関数と同じ定義) を
 * 正弦波の加算合成で鳴らし、ADSR エンベロープとコンボルバによる
 * リバーブ (指数減衰ノイズのインパルス応答) をかける。
 *
 * WebAudio のノード管理は本質的に副作用なので、このモジュールだけは
 * 純粋関数スタイルの外に置く。ボイシング結果の差分で声部を起動・解放する。
 */

import type { Settings } from "./settings.ts";
import { TIMBRE_SPECTRA } from "./spectrum.ts";
import type { Voicing } from "./voicing.ts";

export type Synth = Readonly<{
  update: (voicing: Voicing | null, settings: Settings) => void;
  dispose: () => void;
}>;

type Voice = Readonly<{
  gain: GainNode;
  oscillators: readonly Readonly<{ osc: OscillatorNode; partialRatio: number }>[];
  finalRatio: number;
  /** 現在向かっているサスティン音量 (和音サイズの正規化 × sustainLevel) */
  sustainTarget: number;
}>;

/** 指数減衰する 2ch ノイズのインパルス応答 (-60 dB @ seconds) */
const buildImpulse = (ctx: AudioContext, seconds: number): AudioBuffer => {
  const length = Math.max(1, Math.floor(seconds * ctx.sampleRate));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp((-6.9 * i) / length);
    }
  }
  return buffer;
};

const startVoice = (
  ctx: AudioContext,
  out: AudioNode,
  finalRatio: number,
  amplitude: number,
  settings: Settings,
  now: number,
): Voice => {
  const freqHz = settings.f0Hz * finalRatio;
  const { attackMs, decayMs, sustainLevel } = settings.adsr;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(amplitude, now + attackMs / 1000);
  gain.gain.linearRampToValueAtTime(
    amplitude * sustainLevel,
    now + (attackMs + decayMs) / 1000,
  );
  gain.connect(out);
  const partials = TIMBRE_SPECTRA[settings.timbre];
  const ampSum = partials.reduce((a, p) => a + p.amplitude, 0);
  const oscillators = partials.map((p) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freqHz * p.ratio;
    const partialGain = ctx.createGain();
    partialGain.gain.value = p.amplitude / ampSum;
    osc.connect(partialGain);
    partialGain.connect(gain);
    osc.start(now);
    return { osc, partialRatio: p.ratio };
  });
  return { gain, oscillators, finalRatio, sustainTarget: amplitude * sustainLevel };
};

/** スケジュール済みのランプを現在値で打ち切る */
const holdParam = (param: AudioParam, now: number): void => {
  // cancelAndHoldAtTime は未対応ブラウザがある (Firefox 等は実装が新しい)
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(now);
  } else {
    param.cancelScheduledValues(now);
  }
};

const releaseVoice = (voice: Voice, settings: Settings, now: number): void => {
  const releaseSec = Math.max(0.005, settings.adsr.releaseMs / 1000);
  const param = voice.gain.gain;
  holdParam(param, now);
  param.setTargetAtTime(0, now, releaseSec / 5);
  for (const { osc } of voice.oscillators) osc.stop(now + releaseSec + 0.1);
  const first = voice.oscillators[0];
  if (first !== undefined) {
    first.osc.onended = () => voice.gain.disconnect();
  }
};

export const createSynth = (ctx: AudioContext): Synth => {
  const master = ctx.createGain();
  master.gain.value = 0.25;
  const dryGain = ctx.createGain();
  const convolver = ctx.createConvolver();
  const wetGain = ctx.createGain();
  master.connect(dryGain);
  dryGain.connect(ctx.destination);
  master.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(ctx.destination);

  let impulseSeconds = -1;
  const voices = new Map<string, Voice>();
  let lastSettings: Settings | null = null;

  const update = (voicing: Voicing | null, settings: Settings): void => {
    lastSettings = settings;
    if (Math.abs(settings.reverb.decaySec - impulseSeconds) > 1e-9) {
      impulseSeconds = settings.reverb.decaySec;
      convolver.buffer = impulseSeconds < 0.01 ? null : buildImpulse(ctx, impulseSeconds);
    }
    dryGain.gain.value = 1 - settings.reverb.mix;
    wetGain.gain.value = settings.reverb.mix;

    const now = ctx.currentTime;
    const targets = voicing?.notes ?? [];
    // 音色も含めたキー: 音色が変わると全声部を張り替える
    const keyOf = (finalRatio: number): string => `${settings.timbre}:${finalRatio}`;
    const targetKeys = new Set(targets.map((v) => keyOf(v.finalRatio)));
    for (const [key, voice] of voices) {
      if (!targetKeys.has(key)) {
        releaseVoice(voice, settings, now);
        voices.delete(key);
      }
    }
    const amplitude = 0.9 / Math.sqrt(Math.max(1, targets.length));
    for (const v of targets) {
      const key = keyOf(v.finalRatio);
      const existing = voices.get(key);
      if (existing === undefined) {
        voices.set(key, startVoice(ctx, master, v.finalRatio, amplitude, settings, now));
      } else {
        // 維持される声部は f0 の変更に追従して再調律する (§2.1: f0 を動かすと音も動く)
        for (const { osc, partialRatio } of existing.oscillators) {
          const freq = settings.f0Hz * existing.finalRatio * partialRatio;
          if (Math.abs(osc.frequency.value - freq) > 1e-6) {
            osc.frequency.setTargetAtTime(freq, now, 0.02);
          }
        }
        // 和音サイズ (正規化) や sustainLevel の変化にも音量を追従させる
        const desired = amplitude * settings.adsr.sustainLevel;
        if (Math.abs(desired - existing.sustainTarget) > 1e-6) {
          holdParam(existing.gain.gain, now);
          existing.gain.gain.setTargetAtTime(desired, now, 0.05);
          voices.set(key, { ...existing, sustainTarget: desired });
        }
      }
    }
  };

  const dispose = (): void => {
    const now = ctx.currentTime;
    for (const [key, voice] of voices) {
      if (lastSettings !== null) releaseVoice(voice, lastSettings, now);
      voices.delete(key);
    }
    master.disconnect();
    dryGain.disconnect();
    convolver.disconnect();
    wetGain.disconnect();
  };

  return { update, dispose };
};
