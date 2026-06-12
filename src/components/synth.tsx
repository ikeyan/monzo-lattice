/** ボイシング結果 (§7) を音響合成 (§8) につなぐ。描画はしない */

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { getAudioContext } from "../lib/audio.ts";
import { createSynth, type Synth as SynthHandle } from "../lib/synth.ts";
import { voicedNoteKey } from "../lib/voicing.ts";
import { settingsAtom } from "../state/settings.ts";
import { glideHeldAtom, soundingAtom } from "../state/sounding.ts";
import { voicingAtom } from "../state/voicing.ts";

export const Synth = () => {
  const voicing = useAtomValue(voicingAtom);
  const settings = useAtomValue(settingsAtom);
  const sounding = useAtomValue(soundingAtom);
  const setSounding = useSetAtom(soundingAtom);
  const glideHeld = useAtomValue(glideHeldAtom);
  const synthRef = useRef<SynthHandle | null>(null);

  // アルペジオモード (§6.7): 発音指定されたノートだけを合成に渡す
  const gatedVoicing = useMemo(() => {
    if (settings.playMode !== "arpeggio" || voicing === null) return voicing;
    return {
      ...voicing,
      notes: voicing.notes.filter((v) => sounding.all || sounding.noteKeys.has(voicedNoteKey(v))),
    };
  }, [voicing, settings.playMode, sounding]);

  // グライドボタン (§5.6) を押している間はセル移動時のノートをグライドにする
  const effectiveSettings = useMemo(
    () => (glideHeld ? { ...settings, noteMoveMode: "glide" as const } : settings),
    [settings, glideHeld],
  );

  // 和音が変わって消えたノートの発音指定は捨てる (§6.7)
  useEffect(() => {
    setSounding((prev) => {
      if (prev.noteKeys.size === 0) return prev;
      const valid = new Set((voicing?.notes ?? []).map(voicedNoteKey));
      const kept = [...prev.noteKeys].filter((k) => valid.has(k));
      return kept.length === prev.noteKeys.size ? prev : { ...prev, noteKeys: new Set(kept) };
    });
  }, [voicing, setSounding]);

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
