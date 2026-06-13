/**
 * 格子のタッチ対象と和音の型、セル移動のマージン判定 (仕様 §3, §6)。
 *
 * 旧来の「触れて即発音」のジェスチャ機械はやめ、格子のタッチは monzo の存在を
 * トグルする永続的な和音編集になった (§6)。和音の編集ロジックは chord_edit.ts、
 * ジェスチャ認識は lattice_gesture.ts に分ける。ここには両者と下流 (voicing §7 等)
 * が共有する型と、セル移動のマージン判定だけを置く。
 */

import { cellAtPoint, cellRect, type ViewGeometry } from "./lattice_view.ts";
import type { LatticePrime } from "./monzo.ts";

/** タッチ対象: セル、または豆 (§4.4: セル (x,y) の豆 q は 3^x · p^y · q) */
export type TouchTarget = Readonly<{ x3: number; yp: number; bean?: LatticePrime }>;

export const sameCell = (a: TouchTarget, b: TouchTarget): boolean => a.x3 === b.x3 && a.yp === b.yp;

export const sameTarget = (a: TouchTarget, b: TouchTarget): boolean =>
  sameCell(a, b) && a.bean === b.bean;

export type ChordNote = Readonly<{
  target: TouchTarget;
  /** この音の安定 id (ボイシングの遷移モード §7.4・グライド §6.4 の対応付けに使う) */
  fingerIds: readonly number[];
}>;

export type Chord = Readonly<{
  /** 発音する対象 (同一 target の重複はない) */
  notes: readonly ChordNote[];
  /** 底音 (notes のいずれかの target) */
  bass: TouchTarget;
}>;

/** §6.4 のセル移動判定マージン (セルサイズ比) */
export const CELL_MOVE_MARGIN = 0.03;

/**
 * セル移動のマージン判定 (§6.4)。
 * 点が現在のセルの外でも、移動先セルの枠から marginFrac · セルサイズ
 * より中に入っていなければ現在のセルに留まる。
 */
export const cellWithMargin = (
  geo: ViewGeometry,
  current: TouchTarget,
  px: number,
  py: number,
  marginFrac: number,
): TouchTarget => {
  const hit = cellAtPoint(geo, px, py);
  if (sameCell(hit, current)) return current;
  const s = geo.cellSizePx;
  const { left, top } = cellRect(geo, hit.x3, hit.yp);
  const depth = Math.min(px - left, left + s - px, py - top, top + s - py);
  return depth >= marginFrac * s ? hit : current;
};
