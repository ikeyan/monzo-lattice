/**
 * log 周波数直線 (仕様 §5.3)。
 *
 * 88 鍵の範囲 (§2.1) を log スケールで表示し、f0・ベース音域・中音域を示す。
 * 横長画面では左に縦線、縦長画面では下に横線 (§5.1)。
 * f0 や音域のドラッグ操作、ボイシング結果の表示は後のステップで実装する。
 */

import { useAtomValue } from "jotai";
import { F0_MAX_HZ, F0_MIN_HZ } from "../lib/settings.ts";
import { isLandscapeAtom } from "../state/orientation.ts";
import { settingsAtom } from "../state/settings.ts";

/** 周波数 → 表示範囲内の位置 (0 = 最低音, 1 = 最高音) */
const logFraction = (hz: number): number =>
  (Math.log2(hz) - Math.log2(F0_MIN_HZ)) / (Math.log2(F0_MAX_HZ) - Math.log2(F0_MIN_HZ));

/** 位置 → SVG 座標 (%)。縦線では上が高音、横線では右が高音 */
const toPercent = (fraction: number, isLandscape: boolean): string =>
  `${((isLandscape ? 1 - fraction : fraction) * 100).toFixed(3)}%`;

/** オクターブ目盛: A0 (27.5 Hz) 〜 A7 */
const OCTAVE_TICKS = Array.from({ length: 8 }, (_, k) => ({
  label: `A${k}`,
  hz: F0_MIN_HZ * 2 ** k,
}));

type Band = Readonly<{ className: string; minHz: number; maxHz: number }>;

const BandRect = ({ band, isLandscape }: { band: Band; isLandscape: boolean }) => {
  const lo = toPercent(logFraction(band.minHz), isLandscape);
  const hi = toPercent(logFraction(band.maxHz), isLandscape);
  // 縦線では高音側 (hi) が小さい座標になる
  const [start, end] = isLandscape ? [hi, lo] : [lo, hi];
  const size = `${Math.abs(parseFloat(end) - parseFloat(start)).toFixed(3)}%`;
  return isLandscape
    ? <rect className={band.className} x="0" width="100%" y={start} height={size} />
    : <rect className={band.className} y="0" height="100%" x={start} width={size} />;
};

export const PitchLine = () => {
  const settings = useAtomValue(settingsAtom);
  const isLandscape = useAtomValue(isLandscapeAtom);
  const { f0Hz } = settings;

  const bands: readonly Band[] = [
    ...(settings.bassEnabled
      ? [
        {
          className: "band-bass",
          minHz: f0Hz * settings.bassMinRatio,
          maxHz: f0Hz * settings.bassMinRatio * 2,
        },
      ]
      : []),
    {
      className: "band-mid",
      minHz: f0Hz * settings.midMinRatio,
      maxHz: f0Hz * settings.midMaxRatio,
    },
  ];

  const axis = isLandscape
    ? { x1: "50%", y1: "0%", x2: "50%", y2: "100%" }
    : { x1: "0%", y1: "50%", x2: "100%", y2: "50%" };

  return (
    <svg className="pitch-line" role="img" aria-label="log 周波数直線">
      {bands.map((band) => <BandRect key={band.className} band={band} isLandscape={isLandscape} />)}
      <line className="pitch-axis" {...axis} />
      {OCTAVE_TICKS.map(({ label, hz }) => {
        const pos = toPercent(logFraction(hz), isLandscape);
        return isLandscape
          ? (
            <g key={label}>
              <line className="pitch-tick" x1="35%" x2="65%" y1={pos} y2={pos} />
              <text className="pitch-tick-label" x="68%" y={pos} dominantBaseline="middle">
                {label}
              </text>
            </g>
          )
          : (
            <g key={label}>
              <line className="pitch-tick" y1="35%" y2="65%" x1={pos} x2={pos} />
              <text className="pitch-tick-label" x={pos} y="30%" textAnchor="middle">
                {label}
              </text>
            </g>
          );
      })}
      {(() => {
        const pos = toPercent(logFraction(f0Hz), isLandscape);
        return isLandscape
          ? (
            <g>
              <line className="pitch-f0" x1="15%" x2="85%" y1={pos} y2={pos} />
              <text className="pitch-f0-label" x="15%" y={pos} dy="-0.3em">
                f0
              </text>
            </g>
          )
          : (
            <g>
              <line className="pitch-f0" y1="15%" y2="85%" x1={pos} x2={pos} />
              <text className="pitch-f0-label" x={pos} y="95%" dx="0.3em">
                f0
              </text>
            </g>
          );
      })()}
    </svg>
  );
};
