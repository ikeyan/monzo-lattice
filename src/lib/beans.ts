/**
 * 豆 (仕様 §4): 3 と p 以外の 17 以下の奇素数を格子セルに追加する。
 *
 * 盤面 (セル → 素数列) の純粋な操作と、セル内での整列 (§4.3)・当たり判定を提供する。
 * 盤面には任意の素数を保持し、現在の p と同じ素数の豆は effectiveBeans で
 * 無効化する (p を戻すと豆も復活する)。
 */

import { cellAtPoint, cellRect, type ViewGeometry } from "./lattice_view.ts";
import type { LatticePrime } from "./monzo.ts";
import type { TouchTarget } from "./touch.ts";

/** セルの識別キー */
export const cellKey = (x3: number, yp: number): string => `${x3},${yp}`;

/** セル → 豆の素数列 (整列済み) */
export type BeanBoard = Readonly<Record<string, readonly LatticePrime[]>>;

export const EMPTY_BOARD: BeanBoard = {};

/** 豆の形 (§4.1): 長径 1 cm の豆形 (楕円) */
export const BEAN_LONG_CM = 1;
export const BEAN_SHORT_CM = 0.6;

/** セルに収まる豆の数 (§4.3: あふれたら一番素数が大きい豆を消す) */
export const beanCapacity = (cellSizeCm: number): number =>
  Math.max(1, Math.floor(cellSizeCm / BEAN_LONG_CM)) *
  Math.max(1, Math.floor(cellSizeCm / BEAN_SHORT_CM));

/** 整列 (§4.3): 素数の昇順、重複除去、容量超過は大きい素数から消す */
export const normalizeBeans = (
  primes: readonly LatticePrime[],
  capacity: number,
): readonly LatticePrime[] =>
  [...new Set(primes)].toSorted((a, b) => a - b).slice(0, Math.max(0, capacity));

/** 現在の p で有効な豆 (§4: 対象は {3,5,7,11,13,17} ∖ {3, p}) */
export const effectiveBeans = (
  primes: readonly LatticePrime[],
  p: LatticePrime,
): readonly LatticePrime[] => primes.filter((q) => q !== p);

export const beansAt = (board: BeanBoard, x3: number, yp: number): readonly LatticePrime[] =>
  board[cellKey(x3, yp)] ?? [];

export const addBean = (
  board: BeanBoard,
  x3: number,
  yp: number,
  q: LatticePrime,
  capacity: number,
): BeanBoard => ({
  ...board,
  [cellKey(x3, yp)]: normalizeBeans([...beansAt(board, x3, yp), q], capacity),
});

export const removeBean = (
  board: BeanBoard,
  x3: number,
  yp: number,
  q: LatticePrime,
): BeanBoard => ({
  ...board,
  [cellKey(x3, yp)]: beansAt(board, x3, yp).filter((b) => b !== q),
});

export const moveBean = (
  board: BeanBoard,
  from: { x3: number; yp: number },
  to: { x3: number; yp: number },
  q: LatticePrime,
  capacity: number,
): BeanBoard =>
  cellKey(from.x3, from.yp) === cellKey(to.x3, to.yp)
    ? board
    : addBean(removeBean(board, from.x3, from.yp, q), to.x3, to.yp, q, capacity);

/** セル内の豆の中心位置 (cm)。左から右、下から上 (§4.3) */
export const beanPositionsCm = (
  cellSizeCm: number,
  count: number,
): readonly { x: number; y: number }[] => {
  const cols = Math.max(1, Math.floor(cellSizeCm / BEAN_LONG_CM));
  return Array.from({ length: count }, (_, i) => ({
    x: ((i % cols) + 0.5) * BEAN_LONG_CM,
    y: cellSizeCm - (Math.floor(i / cols) + 0.5) * BEAN_SHORT_CM,
  }));
};

/**
 * タッチ位置の対象 (§4.4): 豆の上なら豆つきの対象、そうでなければセル。
 * 豆は上に重なって描画される後のもの (大きい素数) を優先して判定する。
 */
export const targetAtPoint = (
  geo: ViewGeometry,
  board: BeanBoard,
  p: LatticePrime,
  cellSizeCm: number,
  px: number,
  py: number,
): TouchTarget => {
  const cell = cellAtPoint(geo, px, py);
  const beans = effectiveBeans(beansAt(board, cell.x3, cell.yp), p);
  if (beans.length === 0) return cell;
  const { left, top } = cellRect(geo, cell.x3, cell.yp);
  const pxPerCm = geo.cellSizePx / cellSizeCm;
  const positions = beanPositionsCm(cellSizeCm, beans.length);
  const cmX = (px - left) / pxPerCm;
  const cmY = (py - top) / pxPerCm;
  for (let i = beans.length - 1; i >= 0; i--) {
    const pos = positions[i];
    const q = beans[i];
    if (pos === undefined || q === undefined) continue;
    const dx = (cmX - pos.x) / (BEAN_LONG_CM / 2);
    const dy = (cmY - pos.y) / (BEAN_SHORT_CM / 2);
    if (dx * dx + dy * dy <= 1) return { ...cell, bean: q };
  }
  return cell;
};

/** 豆 (中心 px, py) がセルに完全に入っているか (§4.2 のドラッグ中発音条件) */
export const beanFullyInsideCell = (
  geo: ViewGeometry,
  cellSizeCm: number,
  px: number,
  py: number,
): TouchTarget | null => {
  const cell = cellAtPoint(geo, px, py);
  const { left, top } = cellRect(geo, cell.x3, cell.yp);
  const pxPerCm = geo.cellSizePx / cellSizeCm;
  const halfW = (BEAN_LONG_CM / 2) * pxPerCm;
  const halfH = (BEAN_SHORT_CM / 2) * pxPerCm;
  const s = geo.cellSizePx;
  const inside = px - halfW >= left && px + halfW <= left + s && py - halfH >= top &&
    py + halfH <= top + s;
  return inside ? cell : null;
};
