/** ボイシング結果 (§7) を音響合成 (§8) につなぐ。描画はしない */

import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { getAudioContext } from "../lib/audio.ts";
import { createSynth, type Synth as SynthHandle } from "../lib/synth.ts";
import { settingsAtom } from "../state/settings.ts";
import { voicingAtom } from "../state/voicing.ts";

export const Synth = () => {
  const voicing = useAtomValue(voicingAtom);
  const settings = useAtomValue(settingsAtom);
  const synthRef = useRef<SynthHandle | null>(null);

  useEffect(() => {
    // AudioContext は最初のタッチ (§6.1) で作られる。それまで voicing も null
    const ctx = getAudioContext();
    if (ctx === null) return;
    if (synthRef.current === null) synthRef.current = createSynth(ctx);
    synthRef.current.update(voicing, settings);
  }, [voicing, settings]);

  useEffect(
    () => () => {
      synthRef.current?.dispose();
      synthRef.current = null;
    },
    [],
  );

  return null;
};
