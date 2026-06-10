/** 豆 (§4) の状態 */

import { atom } from "jotai";
import { type BeanBoard, EMPTY_BOARD } from "../lib/beans.ts";
import type { TouchTarget } from "../lib/touch.ts";
import type { LatticePrime } from "../lib/monzo.ts";

/** 盤面: セル → 豆の素数列 */
export const beanBoardAtom = atom<BeanBoard>(EMPTY_BOARD);

/** ドラッグ中の豆 (§4.2)。from が null ならパレット発 */
export type BeanDrag = Readonly<{
  pointerId: number;
  prime: LatticePrime;
  from: TouchTarget | null;
  x: number;
  y: number;
}>;

export const beanDragAtom = atom<BeanDrag | null>(null);

/** セル上の豆に触れた指 (動けばドラッグに昇格する候補) */
export type BeanDragCandidate = Readonly<{
  pointerId: number;
  prime: LatticePrime;
  from: TouchTarget;
  startX: number;
  startY: number;
}>;

export const beanDragCandidateAtom = atom<BeanDragCandidate | null>(null);
