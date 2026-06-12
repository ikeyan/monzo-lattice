/**
 * 発音コントローラ (仕様 §5.6)。アルペジオモード (§6.7) のときだけ、
 * log 周波数直線と格子の間に表示する。
 *
 * - リズムボタン: 押している間、全ノートを発音する (発音中のノートはそのまま)。
 *   離すと全ノートの発音を停止する。太鼓のように叩くとリズムを作れる。
 * - グライドボタン: 押している間だけ「セル移動時のノート」(§6.4) をグライドにする。
 */

import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { ensureAudioReady } from "../lib/audio.ts";
import { settingsAtom } from "../state/settings.ts";
import { glideHeldAtom, SOUNDING_NONE, soundingAtom } from "../state/sounding.ts";

const capturePointer = (e: React.PointerEvent<HTMLButtonElement>): void => {
  // 合成イベント (テスト) では capture に失敗してよい
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // noop
  }
};

export const SoundControl = () => {
  const settings = useAtomValue(settingsAtom);
  const [sounding, setSounding] = useAtom(soundingAtom);
  const [glideHeld, setGlideHeld] = useAtom(glideHeldAtom);
  const isArpeggio = settings.playMode === "arpeggio";

  // モードを離れる (アンマウントされる) ときに押下状態を確実に解除する
  useEffect(() => {
    if (!isArpeggio) return;
    return () => {
      setSounding(SOUNDING_NONE);
      setGlideHeld(false);
    };
  }, [isArpeggio, setSounding, setGlideHeld]);

  if (!isArpeggio) return null;

  return (
    <div className="sound-control">
      <button
        type="button"
        className={sounding.all ? "control-button held" : "control-button"}
        onPointerDown={(e) => {
          e.preventDefault();
          capturePointer(e);
          ensureAudioReady();
          setSounding((prev) => ({ ...prev, all: true }));
        }}
        onPointerUp={() => setSounding(SOUNDING_NONE)}
        onPointerCancel={() => setSounding(SOUNDING_NONE)}
      >
        リズム
      </button>
      <button
        type="button"
        className={glideHeld ? "control-button held" : "control-button"}
        onPointerDown={(e) => {
          e.preventDefault();
          capturePointer(e);
          setGlideHeld(true);
        }}
        onPointerUp={() => setGlideHeld(false)}
        onPointerCancel={() => setGlideHeld(false)}
      >
        グライド
      </button>
    </div>
  );
};
