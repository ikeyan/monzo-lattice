import { BeanDragLayer } from "./components/bean_drag.tsx";
import { Header } from "./components/header.tsx";
import { Lattice } from "./components/lattice.tsx";
import { PitchLine } from "./components/pitch_line.tsx";
import { SettingsDialog } from "./components/settings_dialog.tsx";
import { SoundControl } from "./components/sound_control.tsx";
import { Synth } from "./components/synth.tsx";

/** 全体レイアウト (仕様 §5.1)。配置は index.html の CSS grid (orientation メディアクエリ) で行う */
export const App = () => (
  <div className="app">
    <Header />
    <PitchLine />
    <SoundControl />
    <Lattice />
    <SettingsDialog />
    <BeanDragLayer />
    <Synth />
  </div>
);
