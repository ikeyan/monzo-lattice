/**
 * 設定モデル (仕様 §10)。
 *
 * 検証・正規化は純粋関数 sanitizeSettings に集約する。localStorage から
 * 読んだ未知の値も UI からの書き込みも、必ずこれを通して正規な Settings にする。
 */

import { LATTICE_PRIMES, type LatticePrime } from "./monzo.ts";

export const TIMBRES = ["sine", "triangle", "guitar", "xylophone"] as const;
export type Timbre = (typeof TIMBRES)[number];

/** セル移動時のノートの扱い (仕様 §6.4) */
export const NOTE_MOVE_MODES = ["retrigger", "glide"] as const;
export type NoteMoveMode = (typeof NOTE_MOVE_MODES)[number];

/** 和音遷移時のボイシングの引き継ぎ方 (仕様 §7.4) */
export const CHORD_TRANSITION_MODES = [
  "independent",
  "sameMonzoFixed",
  "sameFingerOctave",
] as const;
export type ChordTransitionMode = (typeof CHORD_TRANSITION_MODES)[number];

export type Adsr = Readonly<{
  attackMs: number;
  decayMs: number;
  /** サスティンの音量 (0〜1) */
  sustainLevel: number;
  releaseMs: number;
}>;

export type Reverb = Readonly<{
  /** dry/wet ミックス (0〜1) */
  mix: number;
  decaySec: number;
}>;

export type Settings = Readonly<{
  /** 基準ピッチ (Hz)。88 鍵の範囲 (§2.1) */
  f0Hz: number;
  /** ベース機能 (§2.3) */
  bassEnabled: boolean;
  /** ベース音域の下端 (f0 比)。幅は 1 オクターブ固定なので上端はこの 2 倍 (§2.2) */
  bassMinRatio: number;
  /** 中音域の下端 (f0 比) (§2.2) */
  midMinRatio: number;
  /** 中音域の上端 (f0 比)。幅 1 オクターブ以上 (midMinRatio の 2 倍以上) (§2.2) */
  midMaxRatio: number;
  /** 格子の縦軸の素数 p (§2.4) */
  latticePrime: LatticePrime;
  /** 格子セルの一辺 (cm) (§3) */
  cellSizeCm: number;
  /** タッチイベントのバッチ期間 (ms、10 ms 単位) (§6.2) */
  batchPeriodMs: number;
  /** パン判定距離 (cm) (§6.6) */
  panThresholdCm: number;
  /** ボイシングの広がりすぎペナルティ係数 (§7.2) */
  spreadPenaltyCoeff: number;
  /** セル移動時のノートの扱い (§6.4) */
  noteMoveMode: NoteMoveMode;
  /** f0 変更時 (§2.1) とグライド移動 (§6.4) の音高遷移にかける時間 (ms) */
  glideTimeMs: number;
  /** 音色 (§8) */
  timbre: Timbre;
  adsr: Adsr;
  reverb: Reverb;
  chordTransitionMode: ChordTransitionMode;
}>;

/** 88 鍵ピアノの音域 (§2.1)。log 周波数直線の表示範囲でもある (§5.3) */
export const F0_MIN_HZ = 27.5;
export const F0_MAX_HZ = 4186.0;

/** 音域比の許容範囲: f0 の ±6 オクターブ。制約 (§2.2) を常に満たせるよう段階的に上限を設ける */
const RATIO_MIN = 1 / 64;
const BASS_MIN_RATIO_MAX = 16;
const MID_MIN_RATIO_MAX = 32;
const MID_MAX_RATIO_MAX = 64;

export const DEFAULT_SETTINGS: Settings = {
  f0Hz: 220,
  bassEnabled: true,
  bassMinRatio: 0.5,
  midMinRatio: 1,
  midMaxRatio: 4,
  latticePrime: 5,
  cellSizeCm: 3,
  batchPeriodMs: 100,
  panThresholdCm: 0.5,
  spreadPenaltyCoeff: 1,
  noteMoveMode: "retrigger",
  glideTimeMs: 100,
  timbre: "sine",
  adsr: { attackMs: 10, decayMs: 200, sustainLevel: 0.7, releaseMs: 300 },
  reverb: { mix: 0.2, decaySec: 1.5 },
  chordTransitionMode: "independent",
};

const clamp = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

const pick = <T extends string | number>(v: unknown, options: readonly T[], fallback: T): T =>
  (options as readonly unknown[]).includes(v) ? (v as T) : fallback;

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === "object" && v !== null;

/**
 * 未知の値を正規な Settings に直す。
 *
 * - 型が合わないフィールドは既定値に置き換える
 * - 数値は範囲に収め、バッチ期間は 10 ms 単位に丸める
 * - 音域は §2.2 の制約 (ベース上端 <= 中音域下端 <= 中音域上端 / 2) を満たすよう順に正規化する
 */
export const sanitizeSettings = (input: unknown): Settings => {
  const d = DEFAULT_SETTINGS;
  const v = isRecord(input) ? input : {};
  const adsr = isRecord(v["adsr"]) ? v["adsr"] : {};
  const reverb = isRecord(v["reverb"]) ? v["reverb"] : {};
  const bassMinRatio = clamp(num(v["bassMinRatio"], d.bassMinRatio), RATIO_MIN, BASS_MIN_RATIO_MAX);
  const midMinRatio = clamp(
    num(v["midMinRatio"], d.midMinRatio),
    bassMinRatio * 2,
    MID_MIN_RATIO_MAX,
  );
  const midMaxRatio = clamp(
    num(v["midMaxRatio"], d.midMaxRatio),
    midMinRatio * 2,
    MID_MAX_RATIO_MAX,
  );
  return {
    f0Hz: clamp(num(v["f0Hz"], d.f0Hz), F0_MIN_HZ, F0_MAX_HZ),
    bassEnabled: bool(v["bassEnabled"], d.bassEnabled),
    bassMinRatio,
    midMinRatio,
    midMaxRatio,
    latticePrime: pick<LatticePrime>(v["latticePrime"], LATTICE_PRIMES, d.latticePrime),
    cellSizeCm: clamp(num(v["cellSizeCm"], d.cellSizeCm), 2, 4),
    batchPeriodMs: clamp(Math.round(num(v["batchPeriodMs"], d.batchPeriodMs) / 10) * 10, 50, 250),
    panThresholdCm: clamp(num(v["panThresholdCm"], d.panThresholdCm), 0.1, 3),
    spreadPenaltyCoeff: clamp(num(v["spreadPenaltyCoeff"], d.spreadPenaltyCoeff), 0, 10),
    noteMoveMode: pick<NoteMoveMode>(v["noteMoveMode"], NOTE_MOVE_MODES, d.noteMoveMode),
    glideTimeMs: clamp(num(v["glideTimeMs"], d.glideTimeMs), 0, 2000),
    timbre: pick<Timbre>(v["timbre"], TIMBRES, d.timbre),
    adsr: {
      attackMs: clamp(num(adsr["attackMs"], d.adsr.attackMs), 0, 2000),
      decayMs: clamp(num(adsr["decayMs"], d.adsr.decayMs), 0, 5000),
      sustainLevel: clamp(num(adsr["sustainLevel"], d.adsr.sustainLevel), 0, 1),
      releaseMs: clamp(num(adsr["releaseMs"], d.adsr.releaseMs), 0, 5000),
    },
    reverb: {
      mix: clamp(num(reverb["mix"], d.reverb.mix), 0, 1),
      decaySec: clamp(num(reverb["decaySec"], d.reverb.decaySec), 0, 10),
    },
    chordTransitionMode: pick<ChordTransitionMode>(
      v["chordTransitionMode"],
      CHORD_TRANSITION_MODES,
      d.chordTransitionMode,
    ),
  };
};
