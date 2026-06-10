/** ヘッダ (仕様 §5.2): p 入力・音色・豆パレット・設定ボタンを同じ高さで並べる */

import { useAtom, useSetAtom } from "jotai";
import { LATTICE_PRIMES, type LatticePrime } from "../lib/monzo.ts";
import { type Timbre, TIMBRES } from "../lib/settings.ts";
import { settingsAtom } from "../state/settings.ts";
import { settingsOpenAtom } from "../state/ui.ts";

/** 音色の絵文字表示 (§5.2)。将来 SVG アイコンに置き換えてよい */
export const TIMBRE_ICONS: Readonly<Record<Timbre, string>> = {
  sine: "🌊",
  triangle: "🔺",
  guitar: "🎸",
  xylophone: "🪘",
};

export const TIMBRE_NAMES: Readonly<Record<Timbre, string>> = {
  sine: "正弦波",
  triangle: "三角波",
  guitar: "ギター",
  xylophone: "木琴",
};

export const Header = () => {
  const [settings, updateSettings] = useAtom(settingsAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  return (
    <header className="header">
      <label className="header-item">
        p↕
        <select
          value={settings.latticePrime}
          onChange={(e) =>
            updateSettings({ latticePrime: Number(e.currentTarget.value) as LatticePrime })}
        >
          {LATTICE_PRIMES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="header-item">
        音色
        <select
          value={settings.timbre}
          onChange={(e) => updateSettings({ timbre: e.currentTarget.value as Timbre })}
        >
          {TIMBRES.map((t) => (
            <option key={t} value={t} title={TIMBRE_NAMES[t]}>
              {TIMBRE_ICONS[t]} {TIMBRE_NAMES[t]}
            </option>
          ))}
        </select>
      </label>
      {/* 豆パレット (§4.1): ドラッグ&ドロップはステップ 7 で実装 */}
      <div className="header-item bean-palette" title="豆パレット (実装予定)">
        ✊
      </div>
      <button
        type="button"
        className="header-item settings-button"
        aria-label="設定"
        onClick={() => setSettingsOpen(true)}
      >
        ⚙️
      </button>
    </header>
  );
};
