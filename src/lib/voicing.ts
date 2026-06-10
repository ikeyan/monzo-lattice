/**
 * ボイシング最適化 (仕様 §7)。
 *
 * 和音の各構成音 (f0 比、オクターブ除き) に 2 の ± 累乗をかけて音高を決める。
 * 制約 (§7.3):
 * - ベース有効時: 底音はベース音域 (幅 1 オクターブ → 候補は一意) のノートと
 *   中音域のノートに複製される
 * - ベース無効時: 底音は中音域かつ全ノートの最低音
 * - 底音以外: 中音域
 * コスト (§7.2) = スペクトルに基づく不協和度 + 広がりすぎペナルティ
 * (log2 周波数の分散 × 係数)。候補空間は小さいので全探索で厳密に最小化する。
 */

import { cellMonzo, formatMonzo, type LatticePrime, mul, normalize, ratioValue } from "./monzo.ts";
import type { Settings } from "./settings.ts";
import { chordDissonance, TIMBRE_SPECTRA } from "./spectrum.ts";
import { type Chord, sameTarget } from "./touch.ts";

export type VoicingNote = Readonly<{
  /** f0 比 (2 の累乗を除いた monzo の値)。> 0 */
  ratio: number;
  /** monzo の同一性キー (§7.4 遷移モード 2 用) */
  monzoKey: string;
  /** この音を押さえている指 (§7.4 遷移モード 3 用) */
  fingerIds: readonly number[];
}>;

export type VoicingInput = Readonly<{
  notes: readonly VoicingNote[];
  /** notes 内の底音の添字 */
  bassIndex: number;
}>;

export type VoicedNote = Readonly<{
  note: VoicingNote;
  /** 2 の指数 */
  octave: number;
  /** 最終的な f0 比 = note.ratio * 2^octave */
  finalRatio: number;
  /** ベース音域に複製されたノートか (§7.3) */
  isBassRange: boolean;
}>;

export type Voicing = Readonly<{
  notes: readonly VoicedNote[];
  cost: number;
}>;

/** r * 2^n が [min, max] に入る整数 n を列挙する */
export const octaveCandidates = (r: number, min: number, max: number): readonly number[] => {
  if (!(r > 0) || !(min > 0) || !(max >= min)) return [];
  const lo = Math.ceil(Math.log2(min / r) - 1e-9);
  const hi = Math.floor(Math.log2(max / r) + 1e-9);
  return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i).filter(
    (n) => r * 2 ** n >= min && r * 2 ** n <= max,
  );
};

/** ベース音域 [bassMin, bassMin * 2) に入る一意のオクターブ */
export const bassRangeOctave = (r: number, bassMin: number): number => {
  const n = Math.floor(Math.log2((bassMin * 2) / r) - 1e-9);
  return r * 2 ** n >= bassMin ? n : n + 1;
};

/** タッチの和音 (§6.3) をボイシング入力に変換する。豆 (§4.4) は monzo に素数を掛ける */
export const chordToVoicingInput = (chord: Chord, p: LatticePrime): VoicingInput => {
  const notes = chord.notes.map((n) => {
    const cell = cellMonzo(n.target.x3, n.target.yp, p);
    const monzo = n.target.bean === undefined ? cell : mul(cell, normalize({ [n.target.bean]: 1 }));
    return { ratio: ratioValue(monzo), monzoKey: formatMonzo(monzo), fingerIds: n.fingerIds };
  });
  const bassIndex = chord.notes.findIndex((n) => sameTarget(n.target, chord.bass));
  return { notes, bassIndex: Math.max(0, bassIndex) };
};

const variance = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length;
};

export const voicingCost = (
  finalRatios: readonly number[],
  settings: Pick<Settings, "f0Hz" | "timbre" | "spreadPenaltyCoeff">,
): number => {
  const freqs = finalRatios.map((r) => settings.f0Hz * r);
  return (
    chordDissonance(freqs, TIMBRE_SPECTRA[settings.timbre]) +
    settings.spreadPenaltyCoeff * variance(freqs.map(Math.log2))
  );
};

type SearchNote = Readonly<{
  note: VoicingNote;
  candidates: readonly number[];
  isBassRange: boolean;
  /** ベース無効時の底音 (全ノートの最低音制約) か */
  mustBeLowest: boolean;
}>;

/** 候補の直積を全探索して最小コストの割り当てを返す */
const searchBest = (
  searchNotes: readonly SearchNote[],
  settings: Pick<Settings, "f0Hz" | "timbre" | "spreadPenaltyCoeff">,
): Voicing | null => {
  let best: Voicing | null = null;
  const chosen: number[] = [];
  const visit = (i: number): void => {
    if (i === searchNotes.length) {
      const voiced = searchNotes.map((sn, k) => {
        const octave = chosen[k] ?? 0;
        return {
          note: sn.note,
          octave,
          finalRatio: sn.note.ratio * 2 ** octave,
          isBassRange: sn.isBassRange,
        };
      });
      // ベース無効時の底音は全ノートの最低音 (§7.3)
      const lowest = Math.min(...voiced.map((v) => v.finalRatio));
      const ok = voiced.every((v, k) =>
        !(searchNotes[k]?.mustBeLowest ?? false) || v.finalRatio <= lowest + 1e-12
      );
      if (ok) {
        const cost = voicingCost(voiced.map((v) => v.finalRatio), settings);
        if (best === null || cost < best.cost) best = { notes: voiced, cost };
      }
      return;
    }
    for (const n of searchNotes[i]?.candidates ?? []) {
      chosen[i] = n;
      visit(i + 1);
    }
  };
  visit(0);
  return best;
};

type VoicingSettings = Pick<
  Settings,
  | "f0Hz"
  | "timbre"
  | "spreadPenaltyCoeff"
  | "bassEnabled"
  | "bassMinRatio"
  | "midMinRatio"
  | "midMaxRatio"
>;

/**
 * ボイシングを解く (pins は添字 → 固定オクターブ)。
 * 候補のないノートや、固定値が中音域を外れる場合は null。
 */
const solveWithPins = (
  input: VoicingInput,
  settings: VoicingSettings,
  pins: ReadonlyMap<number, number>,
): Voicing | null => {
  const bass = input.notes[input.bassIndex];
  if (bass === undefined) return null;
  const midCandidates = (r: number) =>
    octaveCandidates(r, settings.midMinRatio, settings.midMaxRatio);
  const searchNotes: SearchNote[] = input.notes.map((note, i) => {
    const candidates = midCandidates(note.ratio);
    const pin = pins.get(i);
    return {
      note,
      candidates: pin === undefined ? candidates : candidates.filter((n) => n === pin),
      isBassRange: false,
      mustBeLowest: !settings.bassEnabled && i === input.bassIndex,
    };
  });
  if (settings.bassEnabled) {
    // 底音をベース音域 (候補は一意) に複製する (§7.3)
    searchNotes.push({
      note: bass,
      candidates: [bassRangeOctave(bass.ratio, settings.bassMinRatio)],
      isBassRange: true,
      mustBeLowest: false,
    });
  }
  if (searchNotes.some((sn) => sn.candidates.length === 0)) return null;
  return searchBest(searchNotes, settings);
};

/** ボイシングを前の和音と独立に解く (§7.4 モード 1) */
export const solveVoicing = (input: VoicingInput, settings: VoicingSettings): Voicing | null =>
  solveWithPins(input, settings, new Map());

/**
 * 和音遷移を考慮してボイシングを解く (§7.4)。
 *
 * - sameMonzoFixed: 前の和音と同じ monzo のノートは前のオクターブに固定
 * - sameFingerOctave: 前の和音と共通の指のノートは相対オクターブを揃える
 *   (共通のずらし量 m を全探索して最良を選ぶ)
 * 固定が制約 (§7.3) と両立しない場合は固定を諦めて自由に解く
 * (§7.4 の TODO にある矛盾はこのフォールバックで回避する)。
 */
export const solveVoicingTransition = (
  input: VoicingInput,
  settings: VoicingSettings,
  mode: Settings["chordTransitionMode"],
  previous: Voicing | null,
): Voicing | null => {
  if (mode === "independent" || previous === null) return solveVoicing(input, settings);
  if (mode === "sameMonzoFixed") {
    const prevOctaves = new Map(
      previous.notes.filter((v) => !v.isBassRange).map((v) => [v.note.monzoKey, v.octave]),
    );
    const pins = new Map(
      input.notes.flatMap((n, i) => {
        const octave = prevOctaves.get(n.monzoKey);
        return octave === undefined ? [] : [[i, octave] as const];
      }),
    );
    return solveWithPins(input, settings, pins) ?? solveVoicing(input, settings);
  }
  // sameFingerOctave
  const fingerOctaves = new Map<number, number>();
  for (const v of previous.notes) {
    if (!v.isBassRange) {
      for (const f of v.note.fingerIds) fingerOctaves.set(f, v.octave);
    }
  }
  let best: Voicing | null = null;
  for (let m = -6; m <= 6; m++) {
    const pins = new Map(
      input.notes.flatMap((n, i) => {
        const finger = n.fingerIds.find((id) => fingerOctaves.has(id));
        if (finger === undefined) return [];
        return [[i, (fingerOctaves.get(finger) ?? 0) + m] as const];
      }),
    );
    if (pins.size === 0) break; // 共通の指がなければ自由に解くのと同じ
    const result = solveWithPins(input, settings, pins);
    if (result !== null && (best === null || result.cost < best.cost)) best = result;
  }
  return best ?? solveVoicing(input, settings);
};
