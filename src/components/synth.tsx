/** ボイシング結果 (§7) を音響合成 (§8) につなぐ。描画はしない */

import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { getAudioContext } from "../lib/audio.ts";
import { selectionContains } from "../lib/pitch_line.ts";
import { createSynth, type Synth as SynthHandle } from "../lib/synth.ts";
import { voicedNoteKey } from "../lib/voicing.ts";
import { settingsAtom } from "../state/settings.ts";
import { glideHeldAtom, pitchSelectionsAtom, rhythmHeldAtom } from "../state/sounding.ts";
import { voicingAtom } from "../state/voicing.ts";

export const Synth = () => {
  const voicing = useAtomValue(voicingAtom);
  const settings = useAtomValue(settingsAtom);
  const rhythmHeld = useAtomValue(rhythmHeldAtom);
  const glideHeld = useAtomValue(glideHeldAtom);
  const selections = useAtomValue(pitchSelectionsAtom);
  const synthRef = useRef<SynthHandle | null>(null);

  // アルペジオモード (§6.7): 発音する ⇔ いずれかの指の選択に含まれる ∨ リズム ∨ グライド
  const gatedVoicing = useMemo(() => {
    if (settings.playMode !== "arpeggio" || voicing === null) return voicing;
    if (rhythmHeld || glideHeld) return voicing;
    const sels = [...selections.values()];
    return {
      ...voicing,
      notes: voicing.notes.filter((v) =>
        sels.some((sel) => selectionContains(sel, voicedNoteKey(v), settings.f0Hz * v.finalRatio))
      ),
    };
  }, [voicing, settings.playMode, settings.f0Hz, rhythmHeld, glideHeld, selections]);

  // グライドボタン (§5.6) を押している間はセル移動時のノートをグライドにする
  const effectiveSettings = useMemo(
    () => (glideHeld ? { ...settings, noteMoveMode: "glide" as const } : settings),
    [settings, glideHeld],
  );

  useEffect(() => {
    // AudioContext は最初のタッチ (§6.1) で作られる。それまで voicing も null
    const ctx = getAudioContext();
    if (ctx === null) return;
    if (synthRef.current === null) synthRef.current = createSynth(ctx);
    synthRef.current.update(gatedVoicing, effectiveSettings);
  }, [gatedVoicing, effectiveSettings]);

  useEffect(
    () => () => {
      synthRef.current?.dispose();
      synthRef.current = null;
    },
    [],
  );

  return null;
};
