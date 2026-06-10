/** 格子のジオメトリと画面上の位置。豆の D&D レイヤ (§4.2) がドロップ判定に使う */

import { atom } from "jotai";
import { PAN_ZERO, type ViewGeometry } from "../lib/lattice_view.ts";

export type LatticeView = Readonly<{
  geo: ViewGeometry;
  /** 格子要素の左上の client 座標 */
  originX: number;
  originY: number;
}>;

export const latticeViewAtom = atom<LatticeView>({
  geo: { width: 0, height: 0, cellSizePx: 1, pan: PAN_ZERO, isWide: true },
  originX: 0,
  originY: 0,
});
