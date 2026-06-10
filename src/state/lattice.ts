/** 格子ビューの状態 (永続化しない) */

import { atom } from "jotai";
import { PAN_ZERO, type PanOffset } from "../lib/lattice_view.ts";

/** パン位置 (§6.6)。原点セル中心の画面中央からのずれ */
export const panAtom = atom<PanOffset>(PAN_ZERO);
