import { Header } from "./components/header.tsx";
import { Lattice } from "./components/lattice.tsx";
import { PitchLine } from "./components/pitch_line.tsx";
import { SettingsDialog } from "./components/settings_dialog.tsx";

/** 全体レイアウト (仕様 §5.1)。配置は index.html の CSS grid (orientation メディアクエリ) で行う */
export const App = () => (
  <div className="app">
    <Header />
    <PitchLine />
    <Lattice />
    <SettingsDialog />
  </div>
);
