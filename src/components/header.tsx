/** ヘッダ (仕様 §5.2): p 入力・音色・演奏モード・豆パレット・設定ボタンを同じ高さで並べる */

import { useAtom, useSetAtom } from "jotai";
import { ensureAudioReady } from "../lib/audio.ts";
import { LATTICE_PRIMES, type LatticePrime } from "../lib/monzo.ts";
import { PLAY_MODES, type PlayMode } from "../lib/settings.ts";
import { beanDragAtom } from "../state/beans.ts";
import { settingsAtom } from "../state/settings.ts";
import { pitchSelectionsAtom } from "../state/sounding.ts";
import { settingsOpenAtom } from "../state/ui.ts";
import { TimbreSelector } from "./timbre_icons.tsx";

export const PLAY_MODE_LABELS: Readonly<Record<PlayMode, string>> = {
  direct: "直接演奏",
  arpeggio: "アルペジオ",
};

export const Header = () => {
  const [settings, updateSettings] = useAtom(settingsAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setBeanDrag = useSetAtom(beanDragAtom);
  const setSelections = useSetAtom(pitchSelectionsAtom);
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
      <TimbreSelector
        value={settings.timbre}
        onChange={(timbre) => updateSettings({ timbre })}
      />
      {
        /* 演奏モード (§6.7)。切り替え時に指の選択をクリアする
          (リズム・グライドの押下状態は SoundControl のアンマウントで解除される) */
      }
      <label className="header-item" title="演奏モード">
        <select
          value={settings.playMode}
          onChange={(e) => {
            updateSettings({ playMode: e.currentTarget.value as PlayMode });
            setSelections(new Map());
          }}
        >
          {PLAY_MODES.map((m) => (
            <option key={m} value={m}>
              {PLAY_MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      {/* 豆パレット (§4.1, §4.2): ここから格子へドラッグしてコピー */}
      <div className="header-item bean-palette" title="豆パレット">
        ✊
        {LATTICE_PRIMES.filter((q) => q !== settings.latticePrime).map((q) => (
          <span
            key={q}
            className="bean palette-bean"
            onPointerDown={(e) => {
              e.preventDefault();
              // 最初の操作がパレットのドラッグでも §4.2 のドラッグ中発音が
              // 鳴るよう、ユーザージェスチャのうちに音声を初期化する (§6.1)
              ensureAudioReady();
              setBeanDrag({
                pointerId: e.pointerId,
                prime: q,
                from: null,
                x: e.clientX,
                y: e.clientY,
              });
            }}
          >
            {q}
          </span>
        ))}
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
