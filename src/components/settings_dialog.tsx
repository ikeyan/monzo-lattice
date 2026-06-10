/** 設定画面 (仕様 §5.4): 全設定項目 (§10) と全画面トグル、リセット (§9) */

import { useAtom, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { LATTICE_PRIMES, type LatticePrime } from "../lib/monzo.ts";
import {
  CHORD_TRANSITION_MODES,
  type ChordTransitionMode,
  F0_MAX_HZ,
  F0_MIN_HZ,
  NOTE_MOVE_MODES,
  type NoteMoveMode,
  type Timbre,
  TIMBRES,
} from "../lib/settings.ts";
import { resetSettingsAtom, settingsAtom } from "../state/settings.ts";
import { settingsOpenAtom } from "../state/ui.ts";
import { TIMBRE_ICONS, TIMBRE_NAMES } from "./header.tsx";

const TRANSITION_LABELS: Readonly<Record<ChordTransitionMode, string>> = {
  independent: "つながりを考慮しない",
  sameMonzoFixed: "同 monzo 固定",
  sameFingerOctave: "同指オクターブ維持",
};

const NOTE_MOVE_LABELS: Readonly<Record<NoteMoveMode, string>> = {
  retrigger: "別ノート",
  glide: "グライド",
};

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * 数値入力。入力途中に clamp が走らないよう blur / Enter で確定する。
 * 外部から値が変わったとき (リセット等) は key による再マウントで表示を更新する。
 */
const NumberField = (
  { value, onCommit, ...inputProps }: {
    value: number;
    onCommit: (x: number) => void;
    min?: number;
    max?: number;
    step?: number;
  },
) => (
  <input
    type="number"
    key={value}
    defaultValue={round3(value)}
    onBlur={(e) => {
      const x = e.currentTarget.valueAsNumber;
      if (Number.isFinite(x) && x !== value) onCommit(x);
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter") e.currentTarget.blur();
    }}
    {...inputProps}
  />
);

const SliderField = (
  { value, onCommit, unit, ...inputProps }: {
    value: number;
    onCommit: (x: number) => void;
    unit: string;
    min: number;
    max: number;
    step: number;
  },
) => (
  <span className="slider-field">
    <input
      type="range"
      value={value}
      onChange={(e) => onCommit(e.currentTarget.valueAsNumber)}
      {...inputProps}
    />
    <span className="slider-value">{round3(value)} {unit}</span>
  </span>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="settings-row">
    <span>{label}</span>
    {children}
  </label>
);

export const SettingsDialog = () => {
  const [open, setOpen] = useAtom(settingsOpenAtom);
  const [settings, updateSettings] = useAtom(settingsAtom);
  const resetSettings = useSetAtom(resetSettingsAtom);
  if (!open) return null;

  const { f0Hz, adsr, reverb } = settings;
  const toggleFullscreen = () => {
    if (document.fullscreenElement === null) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  return (
    <div className="settings-overlay" onClick={() => setOpen(false)}>
      <section className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="settings-header">
          <h2>設定</h2>
          <button type="button" aria-label="閉じる" onClick={() => setOpen(false)}>✕</button>
        </header>

        <h3>ピッチ (§2)</h3>
        <Row label="f0 (Hz)">
          <NumberField
            value={f0Hz}
            min={F0_MIN_HZ}
            max={F0_MAX_HZ}
            step={0.1}
            onCommit={(x) => updateSettings({ f0Hz: x })}
          />
        </Row>
        <Row label="ベース機能">
          <input
            type="checkbox"
            checked={settings.bassEnabled}
            onChange={(e) => updateSettings({ bassEnabled: e.currentTarget.checked })}
          />
        </Row>
        {settings.bassEnabled && (
          <Row label="ベース音域 下端 (Hz、幅 1 oct)">
            <NumberField
              value={f0Hz * settings.bassMinRatio}
              onCommit={(hz) => updateSettings({ bassMinRatio: hz / f0Hz })}
            />
          </Row>
        )}
        <Row label="中音域 下端 (Hz)">
          <NumberField
            value={f0Hz * settings.midMinRatio}
            onCommit={(hz) => updateSettings({ midMinRatio: hz / f0Hz })}
          />
        </Row>
        <Row label="中音域 上端 (Hz)">
          <NumberField
            value={f0Hz * settings.midMaxRatio}
            onCommit={(hz) => updateSettings({ midMaxRatio: hz / f0Hz })}
          />
        </Row>
        <Row label="p">
          <select
            value={settings.latticePrime}
            onChange={(e) =>
              updateSettings({ latticePrime: Number(e.currentTarget.value) as LatticePrime })}
          >
            {LATTICE_PRIMES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Row>

        <h3>操作 (§3, §6)</h3>
        <Row label="格子セルサイズ">
          <SliderField
            value={settings.cellSizeCm}
            min={2}
            max={4}
            step={0.1}
            unit="cm"
            onCommit={(x) => updateSettings({ cellSizeCm: x })}
          />
        </Row>
        <Row label="バッチ期間">
          <SliderField
            value={settings.batchPeriodMs}
            min={50}
            max={250}
            step={10}
            unit="ms"
            onCommit={(x) => updateSettings({ batchPeriodMs: x })}
          />
        </Row>
        <Row label="パン判定距離">
          <SliderField
            value={settings.panThresholdCm}
            min={0.1}
            max={3}
            step={0.1}
            unit="cm"
            onCommit={(x) => updateSettings({ panThresholdCm: x })}
          />
        </Row>
        <Row label="セル移動時のノート">
          <select
            value={settings.noteMoveMode}
            onChange={(e) =>
              updateSettings({ noteMoveMode: e.currentTarget.value as NoteMoveMode })}
          >
            {NOTE_MOVE_MODES.map((m) => <option key={m} value={m}>{NOTE_MOVE_LABELS[m]}</option>)}
          </select>
        </Row>
        <Row label="グライド時間">
          <SliderField
            value={settings.glideTimeMs}
            min={0}
            max={2000}
            step={10}
            unit="ms"
            onCommit={(x) => updateSettings({ glideTimeMs: x })}
          />
        </Row>

        <h3>ボイシング (§7)</h3>
        <Row label="広がりすぎペナルティ係数">
          <SliderField
            value={settings.spreadPenaltyCoeff}
            min={0}
            max={10}
            step={0.1}
            unit=""
            onCommit={(x) => updateSettings({ spreadPenaltyCoeff: x })}
          />
        </Row>
        <Row label="和音遷移モード">
          <select
            value={settings.chordTransitionMode}
            onChange={(e) =>
              updateSettings({
                chordTransitionMode: e.currentTarget.value as ChordTransitionMode,
              })}
          >
            {CHORD_TRANSITION_MODES.map((m) => (
              <option key={m} value={m}>{TRANSITION_LABELS[m]}</option>
            ))}
          </select>
        </Row>

        <h3>音 (§8)</h3>
        <Row label="音色">
          <select
            value={settings.timbre}
            onChange={(e) => updateSettings({ timbre: e.currentTarget.value as Timbre })}
          >
            {TIMBRES.map((t) => (
              <option key={t} value={t}>{TIMBRE_ICONS[t]} {TIMBRE_NAMES[t]}</option>
            ))}
          </select>
        </Row>
        <Row label="アタック (ms)">
          <NumberField
            value={adsr.attackMs}
            min={0}
            max={2000}
            onCommit={(x) => updateSettings({ adsr: { ...adsr, attackMs: x } })}
          />
        </Row>
        <Row label="ディケイ (ms)">
          <NumberField
            value={adsr.decayMs}
            min={0}
            max={5000}
            onCommit={(x) => updateSettings({ adsr: { ...adsr, decayMs: x } })}
          />
        </Row>
        <Row label="サスティン">
          <SliderField
            value={adsr.sustainLevel}
            min={0}
            max={1}
            step={0.01}
            unit=""
            onCommit={(x) => updateSettings({ adsr: { ...adsr, sustainLevel: x } })}
          />
        </Row>
        <Row label="リリース (ms)">
          <NumberField
            value={adsr.releaseMs}
            min={0}
            max={5000}
            onCommit={(x) => updateSettings({ adsr: { ...adsr, releaseMs: x } })}
          />
        </Row>
        <Row label="リバーブ ミックス">
          <SliderField
            value={reverb.mix}
            min={0}
            max={1}
            step={0.01}
            unit=""
            onCommit={(x) => updateSettings({ reverb: { ...reverb, mix: x } })}
          />
        </Row>
        <Row label="リバーブ 長さ">
          <SliderField
            value={reverb.decaySec}
            min={0}
            max={10}
            step={0.1}
            unit="s"
            onCommit={(x) => updateSettings({ reverb: { ...reverb, decaySec: x } })}
          />
        </Row>

        <h3>画面</h3>
        <div className="settings-row">
          <span>全画面</span>
          <button type="button" onClick={toggleFullscreen}>切り替え</button>
        </div>

        <footer className="settings-footer">
          <button type="button" className="reset-button" onClick={() => resetSettings()}>
            デフォルトにリセット
          </button>
        </footer>
      </section>
    </div>
  );
};
