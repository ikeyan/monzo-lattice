/**
 * log 周波数直線上のドラッグ操作 (仕様 §2.1, §2.2, §5.3) の純粋ロジック。
 *
 * 直線上の位置は「表示範囲 (88 鍵) 内の割合」(0 = 最低音, 1 = 最高音) で扱い、
 * 距離は log2 (オクターブ) 単位で測る。ドラッグはつかんだ点とハンドルの
 * log2 オフセットを保持して追従させるので、ハンドルの端をつかんでも飛ばない。
 *
 * つかむ対象の優先順位は f0 > 中音域の端 > ベース帯 > 中音域帯。
 * f0 は一番目立つハンドルで操作頻度も高いので最優先にする。既定値のように
 * f0 と中音域下端が重なって端をつかめないときは、帯の内部をドラッグして
 * 帯ごとずらせば端が f0 から離れる (音域は f0 比なので、f0 をドラッグしても
 * 帯との相対位置は変わらないことに注意)。
 *
 * 各ハンドルの可動範囲は sanitizeSettings (§2.2) と同じ制約に収め、ドラッグ中の
 * ハンドルが他の音域を押し動かさないようにする。
 */

import {
  BASS_MIN_RATIO_MAX,
  F0_MAX_HZ,
  F0_MIN_HZ,
  MID_MAX_RATIO_MAX,
  MID_MIN_RATIO_MAX,
  RATIO_MIN,
  type Settings,
} from "./settings.ts";

/** ドラッグ操作に関わる設定の部分集合 */
export type PitchRanges = Pick<
  Settings,
  "f0Hz" | "bassEnabled" | "bassMinRatio" | "midMinRatio" | "midMaxRatio"
>;

export type PitchDragKind = "f0" | "bassBand" | "midMin" | "midMax" | "midBand";

export type PitchDrag = Readonly<{
  kind: PitchDragKind;
  /** つかんだ点からハンドル位置への log2 オフセット (ドラッグ中一定) */
  grabLog2: number;
}>;

const LOG_MIN = Math.log2(F0_MIN_HZ);
const LOG_MAX = Math.log2(F0_MAX_HZ);

/** 表示範囲の全長 (オクターブ) */
export const SPAN_OCTAVES = LOG_MAX - LOG_MIN;

/** 周波数 → 表示範囲内の位置 (0 = 最低音, 1 = 最高音) */
export const logFraction = (hz: number): number => (Math.log2(hz) - LOG_MIN) / SPAN_OCTAVES;

/** 位置 (0〜1) → 周波数 */
export const fractionToHz = (fraction: number): number => 2 ** (LOG_MIN + fraction * SPAN_OCTAVES);

const clamp = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));

const octDistance = (aHz: number, bHz: number): number => Math.abs(Math.log2(aHz) - Math.log2(bHz));

/**
 * hz から log2 距離 tolOct 以内で最も近い候補の添字。なければ -1。
 * アルペジオモード (§6.7) のノートタッチの当たり判定に使う。
 */
export const nearestIndexWithin = (
  candidatesHz: readonly number[],
  hz: number,
  tolOct: number,
): number => {
  let best = -1;
  let bestDist = tolOct;
  for (let i = 0; i < candidatesHz.length; i++) {
    const c = candidatesHz[i];
    if (c === undefined || !(c > 0)) continue;
    const dist = octDistance(c, hz);
    if (dist <= bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
};

const grab = (kind: PitchDragKind, anchorHz: number, hz: number): PitchDrag => ({
  kind,
  grabLog2: Math.log2(anchorHz) - Math.log2(hz),
});

/**
 * 点 hz でつかめるハンドルを決める。tolOct は許容距離 (オクターブ単位)。
 * どれにも当たらなければ null (直線の空き地は何もしない)。
 */
export const pickPitchDrag = (
  ranges: PitchRanges,
  hz: number,
  tolOct: number,
): PitchDrag | null => {
  const { f0Hz } = ranges;
  const midLoHz = f0Hz * ranges.midMinRatio;
  const midHiHz = f0Hz * ranges.midMaxRatio;
  if (octDistance(hz, f0Hz) <= tolOct) return grab("f0", f0Hz, hz);
  const edges = [
    { kind: "midMin" as const, hz: midLoHz },
    { kind: "midMax" as const, hz: midHiHz },
  ].filter((e) => octDistance(hz, e.hz) <= tolOct);
  const edge = edges.reduce<typeof edges[number] | null>(
    (best, e) => best === null || octDistance(hz, e.hz) < octDistance(hz, best.hz) ? e : best,
    null,
  );
  if (edge !== null) return grab(edge.kind, edge.hz, hz);
  if (ranges.bassEnabled) {
    const bassLoHz = f0Hz * ranges.bassMinRatio;
    if (hz >= bassLoHz && hz <= bassLoHz * 2) return grab("bassBand", bassLoHz, hz);
  }
  if (hz >= midLoHz && hz <= midHiHz) return grab("midBand", midLoHz, hz);
  return null;
};

/**
 * ドラッグ中の点 hz に対する設定の部分更新。
 * 結果は sanitizeSettings の制約 (§2.2) を満たし、他の音域を変えない。
 */
export const applyPitchDrag = (
  ranges: PitchRanges,
  drag: PitchDrag,
  hz: number,
): Partial<Settings> => {
  const anchorHz = 2 ** (Math.log2(hz) + drag.grabLog2);
  const { f0Hz } = ranges;
  switch (drag.kind) {
    case "f0":
      // 音域は f0 比 (§2.2) なので f0 と一緒に動く
      return { f0Hz: clamp(anchorHz, F0_MIN_HZ, F0_MAX_HZ) };
    case "bassBand":
      return {
        bassMinRatio: clamp(
          anchorHz / f0Hz,
          RATIO_MIN,
          Math.min(BASS_MIN_RATIO_MAX, ranges.midMinRatio / 2),
        ),
      };
    case "midMin":
      return {
        midMinRatio: clamp(
          anchorHz / f0Hz,
          ranges.bassMinRatio * 2,
          Math.min(MID_MIN_RATIO_MAX, ranges.midMaxRatio / 2),
        ),
      };
    case "midMax":
      return {
        midMaxRatio: clamp(anchorHz / f0Hz, ranges.midMinRatio * 2, MID_MAX_RATIO_MAX),
      };
    case "midBand": {
      // 幅を保ったまま帯ごと動かす
      const width = ranges.midMaxRatio / ranges.midMinRatio;
      const midMinRatio = clamp(
        anchorHz / f0Hz,
        ranges.bassMinRatio * 2,
        Math.min(MID_MIN_RATIO_MAX, MID_MAX_RATIO_MAX / width),
      );
      // 丸め誤差で上限を超えないようにもう一度収める
      return {
        midMinRatio,
        midMaxRatio: clamp(midMinRatio * width, midMinRatio * 2, MID_MAX_RATIO_MAX),
      };
    }
  }
};
