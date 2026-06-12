/**
 * 音色セレクタ (仕様 §5.2, §8)。
 *
 * 選択肢はテキストラベルを置かず、SVG アイコンのみのボタン群で表示する。
 * 名前は title / aria-label (ツールチップ・読み上げ) にだけ残す。
 */

import type { ReactNode } from "react";
import { type Timbre, TIMBRES } from "../lib/settings.ts";

export const TIMBRE_NAMES: Readonly<Record<Timbre, string>> = {
  sine: "正弦波",
  triangle: "三角波",
  guitar: "ギター",
  xylophone: "木琴",
};

/** 波形は波形そのもの、楽器はシルエットで描く */
const TIMBRE_ICON_PATHS: Readonly<Record<Timbre, ReactNode>> = {
  sine: <path d="M2 12 C 5 4, 9 4, 12 12 S 19 20, 22 12" fill="none" />,
  triangle: <path d="M2 12 L7 5 L17 19 L22 12" fill="none" />,
  guitar: (
    <>
      <circle cx="8" cy="16" r="4.6" fill="none" />
      <circle cx="12" cy="11.5" r="3" fill="none" />
      <line x1="14" y1="9.4" x2="20.2" y2="3.2" />
      <line x1="18.8" y1="2.2" x2="21.6" y2="5" />
      <circle cx="9.6" cy="14.4" r="1.3" fill="none" />
    </>
  ),
  xylophone: (
    <>
      <rect x="3" y="5" width="3.2" height="14" rx="1" stroke="none" />
      <rect x="8" y="6.5" width="3.2" height="11" rx="1" stroke="none" />
      <rect x="13" y="8" width="3.2" height="8" rx="1" stroke="none" />
      <rect x="18" y="9.5" width="3.2" height="5" rx="1" stroke="none" />
      <line x1="14" y1="21.5" x2="20.5" y2="17.5" />
      <circle cx="13" cy="22" r="1.6" stroke="none" />
    </>
  ),
};

export const TimbreIcon = ({ timbre }: { timbre: Timbre }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {TIMBRE_ICON_PATHS[timbre]}
  </svg>
);

export const TimbreSelector = (
  { value, onChange }: { value: Timbre; onChange: (t: Timbre) => void },
) => (
  <div className="timbre-group" role="radiogroup" aria-label="音色">
    {TIMBRES.map((t) => (
      <button
        key={t}
        type="button"
        role="radio"
        aria-checked={t === value}
        className={t === value ? "timbre-button selected" : "timbre-button"}
        title={TIMBRE_NAMES[t]}
        aria-label={TIMBRE_NAMES[t]}
        onClick={() => onChange(t)}
      >
        <TimbreIcon timbre={t} />
      </button>
    ))}
  </div>
);
