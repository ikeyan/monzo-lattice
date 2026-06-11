/**
 * log 周波数直線 (仕様 §5.3)。
 *
 * 88 鍵の範囲 (§2.1) を log スケールで表示し、f0・ベース音域・中音域を示す。
 * 横長画面では左に縦線、縦長画面では下に横線 (§5.1)。
 * f0 と音域はドラッグで指定できる (§2.1, §2.2)。当たり判定とドラッグの数式は
 * lib/pitch_line.ts の純粋関数に置き、ここでは pointer イベントの配線だけを行う。
 */

import { useAtomValue, useSetAtom } from "jotai";
import { useRef } from "react";
import {
  applyPitchDrag,
  fractionToHz,
  logFraction,
  pickPitchDrag,
  type PitchDrag,
  SPAN_OCTAVES,
} from "../lib/pitch_line.ts";
import { F0_MAX_HZ, F0_MIN_HZ } from "../lib/settings.ts";
import { isLandscapeAtom } from "../state/orientation.ts";
import { settingsAtom } from "../state/settings.ts";
import { voicingAtom } from "../state/voicing.ts";

/** ハンドルの当たり判定の許容距離 (px)。指でつかめる程度に広く */
const GRAB_TOLERANCE_PX = 14;

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

/** つかめる中音域の端の印 */
const EdgeMark = ({ hz, isLandscape }: { hz: number; isLandscape: boolean }) => {
  const pos = toPercent(logFraction(hz), isLandscape);
  return isLandscape
    ? <line className="band-edge" x1="0" x2="100%" y1={pos} y2={pos} />
    : <line className="band-edge" y1="0" y2="100%" x1={pos} x2={pos} />;
};

export const PitchLine = () => {
  const settings = useAtomValue(settingsAtom);
  const updateSettings = useSetAtom(settingsAtom);
  const isLandscape = useAtomValue(isLandscapeAtom);
  const voicing = useAtomValue(voicingAtom);
  const { f0Hz } = settings;

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<(PitchDrag & { pointerId: number }) | null>(null);
  // pointer イベントはレンダーをまたぐので、最新の設定を ref 経由で参照する
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /** イベント位置 → 直線上の周波数と当たり判定の許容距離 (オクターブ) */
  const eventHz = (
    e: React.PointerEvent<SVGSVGElement>,
  ): { hz: number; tolOct: number } | null => {
    const svg = svgRef.current;
    if (svg === null) return null;
    const rect = svg.getBoundingClientRect();
    const lengthPx = isLandscape ? rect.height : rect.width;
    if (lengthPx <= 0) return null;
    const fraction = isLandscape
      ? 1 - (e.clientY - rect.top) / lengthPx
      : (e.clientX - rect.left) / lengthPx;
    return { hz: fractionToHz(fraction), tolOct: (GRAB_TOLERANCE_PX / lengthPx) * SPAN_OCTAVES };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    const point = eventHz(e);
    if (point === null) return;
    const drag = pickPitchDrag(settingsRef.current, point.hz, point.tolOct);
    if (drag === null) return;
    dragRef.current = { ...drag, pointerId: e.pointerId };
    // 合成イベント (テスト) では capture に失敗してよい
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // noop
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== e.pointerId) return;
    const point = eventHz(e);
    if (point === null) return;
    updateSettings(applyPitchDrag(settingsRef.current, drag, point.hz));
  };

  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

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
    <svg
      ref={svgRef}
      className="pitch-line"
      role="img"
      aria-label="log 周波数直線"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {bands.map((band) => <BandRect key={band.className} band={band} isLandscape={isLandscape} />)}
      <EdgeMark hz={f0Hz * settings.midMinRatio} isLandscape={isLandscape} />
      <EdgeMark hz={f0Hz * settings.midMaxRatio} isLandscape={isLandscape} />
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
      {/* ボイシング結果 (§7.5): 現在鳴っている各音の音高 */}
      {voicing?.notes.map((v, i) => {
        const hz = f0Hz * v.finalRatio;
        if (hz < F0_MIN_HZ || hz > F0_MAX_HZ) return null;
        const pos = toPercent(logFraction(hz), isLandscape);
        const className = v.isBassRange ? "voiced-note voiced-bass" : "voiced-note";
        return isLandscape
          ? <circle key={i} className={className} cx="50%" cy={pos} r="5" />
          : <circle key={i} className={className} cx={pos} cy="50%" r="5" />;
      })}
    </svg>
  );
};
