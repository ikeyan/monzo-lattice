/**
 * 楽器のスペクトルと不協和度 (仕様 §7.2)。
 *
 * スペクトルはアタック直後の部分音の組で表す。ボイシングのコスト関数と
 * 音響合成 (§8 の加算合成) の両方がこの定義を使う。
 * 不協和度は Plomp–Levelt 曲線の Sethares による定式化:
 * 部分音の全ペアについて、臨界帯域内の周波数差が生むうなりの強さを足し合わせる。
 */

import type { Timbre } from "./settings.ts";

export type SpectrumPartial = Readonly<{
  /** 基音に対する周波数比 */
  ratio: number;
  /** 振幅 (基音 = 1) */
  amplitude: number;
}>;

export const TIMBRE_SPECTRA: Readonly<Record<Timbre, readonly SpectrumPartial[]>> = {
  sine: [{ ratio: 1, amplitude: 1 }],
  // 三角波: 奇数次倍音、振幅 1/n^2
  triangle: [1, 3, 5, 7, 9].map((n) => ({ ratio: n, amplitude: 1 / (n * n) })),
  // ギター (撥弦): 倍音列、振幅 1/n
  guitar: [1, 2, 3, 4, 5, 6].map((n) => ({ ratio: n, amplitude: 1 / n })),
  // 木琴 (棒鳴): 非整数次の部分音
  xylophone: [
    { ratio: 1, amplitude: 1 },
    { ratio: 2.756, amplitude: 0.6 },
    { ratio: 5.404, amplitude: 0.35 },
    { ratio: 8.933, amplitude: 0.2 },
  ],
};

// Sethares (1993) の定数
const D_STAR = 0.24;
const S1 = 0.0207;
const S2 = 18.96;
const B1 = 3.51;
const B2 = 5.75;

/** 2 つの純音の不協和度 (0 以上。同じ周波数で 0、臨界帯域の約 1/4 差で最大) */
export const pairDissonance = (f1: number, a1: number, f2: number, a2: number): number => {
  const fmin = Math.min(f1, f2);
  const d = Math.abs(f2 - f1);
  const s = D_STAR / (S1 * fmin + S2);
  return Math.min(a1, a2) * (Math.exp(-B1 * s * d) - Math.exp(-B2 * s * d));
};

/**
 * 和音全体の不協和度: 全部分音 (音をまたぐペアも同じ音の中のペアも) の総和。
 * 各音は基音周波数 (Hz) で与え、音色のスペクトルを展開して評価する。
 */
export const chordDissonance = (
  fundamentals: readonly number[],
  spectrum: readonly SpectrumPartial[],
): number => {
  const partials = fundamentals.flatMap((f) =>
    spectrum.map((p) => ({ freq: f * p.ratio, amplitude: p.amplitude }))
  );
  let total = 0;
  for (let i = 0; i < partials.length; i++) {
    for (let j = i + 1; j < partials.length; j++) {
      const a = partials[i];
      const b = partials[j];
      if (a !== undefined && b !== undefined) {
        total += pairDissonance(a.freq, a.amplitude, b.freq, b.amplitude);
      }
    }
  }
  return total;
};
