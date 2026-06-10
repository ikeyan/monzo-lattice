/** 現在のボイシング結果 (仕様 §7)。log 周波数直線の表示 (§7.5) と音響合成 (§8) が使う */

import { atom } from "jotai";
import type { Voicing } from "../lib/voicing.ts";

export const voicingAtom = atom<Voicing | null>(null);
