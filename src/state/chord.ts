/** 現在発音中の和音 (仕様 §6.3)。音響合成 (§8) とボイシング (§7) がこれを購読する */

import { atom } from "jotai";
import type { Chord } from "../lib/touch.ts";

export const chordAtom = atom<Chord | null>(null);
