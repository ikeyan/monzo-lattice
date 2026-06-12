/**
 * 発音コントローラ (仕様 §5.6)。アルペジオモード (§6.7) のときだけ、
 * log 周波数直線と格子の間に表示する。
 *
 * どちらのボタンも「押している間、全ノートを発音する」(§6.7 の OR の項になる)。
 * 太鼓のように叩くとリズムを作れる。グライドボタンはさらに、押している間だけ
 * 「セル移動時のノート」(§6.4) をグライドにする。
 */

import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { ensureAudioReady } from "../lib/audio.ts";
import { settingsAtom } from "../state/settings.ts";
import { glideHeldAtom, rhythmHeldAtom } from "../state/sounding.ts";

const capturePointer = (e: React.PointerEvent<HTMLButtonElement>): void => {
  // 合成イベント (テスト) では capture に失敗してよい
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // noop
  }
};

const HoldButton = (
  { label, held, onHold }: { label: string; held: boolean; onHold: (held: boolean) => void },
) => (
  <button
    type="button"
    className={held ? "control-button held" : "control-button"}
    onPointerDown={(e) => {
      e.preventDefault();
      capturePointer(e);
      ensureAudioReady();
      onHold(true);
    }}
    onPointerUp={() => onHold(false)}
    onPointerCancel={() => onHold(false)}
  >
    {label}
  </button>
);

export const SoundControl = () => {
  const settings = useAtomValue(settingsAtom);
  const [rhythmHeld, setRhythmHeld] = useAtom(rhythmHeldAtom);
  const [glideHeld, setGlideHeld] = useAtom(glideHeldAtom);
  const isArpeggio = settings.playMode === "arpeggio";

  // モードを離れる (アンマウントされる) ときに押下状態を確実に解除する
  useEffect(() => {
    if (!isArpeggio) return;
    return () => {
      setRhythmHeld(false);
      setGlideHeld(false);
    };
  }, [isArpeggio, setRhythmHeld, setGlideHeld]);

  if (!isArpeggio) return null;

  return (
    <div className="sound-control">
      <HoldButton label="リズム" held={rhythmHeld} onHold={setRhythmHeld} />
      <HoldButton label="グライド" held={glideHeld} onHold={setGlideHeld} />
    </div>
  );
};
