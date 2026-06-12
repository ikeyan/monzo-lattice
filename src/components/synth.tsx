/** ボイシング結果 (§7) を音響合成 (§8) につなぐ。描画はしない */

import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { getAudioContext } from "../lib/audio.ts";
import { createSynth, type Synth as SynthHandle } from "../lib/synth.ts";
import { voicedNoteKey } from "../lib/voicing.ts";
import { settingsAtom } from "../state/settings.ts";
import { glideHeldAtom, heldNoteKeysAtom, rhythmHeldAtom } from "../state/sounding.ts";
import { voicingAtom } from "../state/voicing.ts";

export const Synth = () => {
  const voicing = useAtomValue(voicingAtom);
  const settings = useAtomValue(settingsAtom);
  const rhythmHeld = useAtomValue(rhythmHeldAtom);
  const glideHeld = useAtomValue(glideHeldAtom);
  const heldNotes = useAtomValue(heldNoteKeysAtom);
  const synthRef = useRef<SynthHandle | null>(null);

  // アルペジオモード (§6.7): 発音する ⇔ ノートをタッチ中 ∨ リズム ∨ グライド (OR)
  const gatedVoicing = useMemo(() => {
    if (settings.playMode !== "arpeggio" || voicing === null) return voicing;
    if (rhythmHeld || glideHeld) return voicing;
    const held = new Set(heldNotes.values());
    return { ...voicing, notes: voicing.notes.filter((v) => held.has(voicedNoteKey(v))) };
  }, [voicing, settings.playMode, rhythmHeld, glideHeld, heldNotes]);

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
