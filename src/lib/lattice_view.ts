/**
 * 格子ビューの幾何 (仕様 §3)。
 *
 * 格子平面の座標は (x3, yp): セル (x3, yp) は 3^x3 · p^yp に対応する。
 * 画面上では長辺方向に 3 の軸、短辺方向に p の軸を割り当てる:
 * - 横長 (isWide): 画面右 = +x3、画面上 = +yp
 * - 縦長: 画面上 = +x3、画面右 = +yp
 */

export type PanOffset = Readonly<{
  /** 原点セル中心の画面中央からのずれ (px)。3 の軸方向 (+ は軸の正方向) */
  a3: number;
  /** 同じく p の軸方向 */
  ap: number;
}>;

export const PAN_ZERO: PanOffset = { a3: 0, ap: 0 };

/** CSS px / cm。CSS の 1cm = 96px / 2.54 (§11 の通り物理寸法とは一致しないことがある) */
export const CSS_PX_PER_CM = 96 / 2.54;

export type ViewGeometry = Readonly<{
  width: number;
  height: number;
  cellSizePx: number;
  pan: PanOffset;
  isWide: boolean;
}>;

export type CellPlacement = Readonly<{
  x3: number;
  yp: number;
  /** セル矩形の画面位置 (px) */
  left: number;
  top: number;
}>;

/** 原点セル中心の画面座標 */
const originCenter = ({ width, height, pan, isWide }: ViewGeometry): { cx: number; cy: number } =>
  isWide
    ? { cx: width / 2 + pan.a3, cy: height / 2 - pan.ap }
    : { cx: width / 2 + pan.ap, cy: height / 2 - pan.a3 };

/** セル (x3, yp) の中心の画面座標 */
const cellCenter = (geo: ViewGeometry, x3: number, yp: number): { cx: number; cy: number } => {
  const o = originCenter(geo);
  const s = geo.cellSizePx;
  return geo.isWide
    ? { cx: o.cx + x3 * s, cy: o.cy - yp * s }
    : { cx: o.cx + yp * s, cy: o.cy - x3 * s };
};

/** セル (x3, yp) の矩形の左上の画面座標 */
export const cellRect = (
  geo: ViewGeometry,
  x3: number,
  yp: number,
): { left: number; top: number } => {
  const { cx, cy } = cellCenter(geo, x3, yp);
  return { left: cx - geo.cellSizePx / 2, top: cy - geo.cellSizePx / 2 };
};

/** 画面座標が属するセル */
export const cellAtPoint = (
  geo: ViewGeometry,
  px: number,
  py: number,
): { x3: number; yp: number } => {
  const o = originCenter(geo);
  const s = geo.cellSizePx;
  const u = Math.round((px - o.cx) / s);
  const v = Math.round((o.cy - py) / s);
  return geo.isWide ? { x3: u, yp: v } : { x3: v, yp: u };
};

/** [lo, hi] と交差するセル中心インデックスの範囲 (中心 ± s/2 が範囲に触れるもの) */
const indexRange = (center0: number, s: number, lo: number, hi: number): readonly number[] => {
  const first = Math.ceil((lo - center0 - s / 2) / s);
  const last = Math.floor((hi - center0 + s / 2) / s);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
};

/** ビューポートに (部分的にでも) 見えるセルの一覧 */
export const visibleCells = (geo: ViewGeometry): readonly CellPlacement[] => {
  const { width, height, cellSizePx: s, isWide } = geo;
  const o = originCenter(geo);
  // 画面 x 方向・y 方向のセルインデックス (横長: x→x3, y→-yp / 縦長: x→yp, y→-x3)
  const xs = indexRange(o.cx, s, 0, width);
  const ys = indexRange(o.cy, s, 0, height);
  return xs.flatMap((u) =>
    ys.map((w) => {
      const [x3, yp] = isWide ? [u, -w] : [-w, u];
      const { cx, cy } = cellCenter(geo, x3, yp);
      return { x3, yp, left: cx - s / 2, top: cy - s / 2 };
    })
  );
};

/** ドラッグの画面移動量 (px) をパンに適用する */
export const applyPanDelta = (
  pan: PanOffset,
  dxScreen: number,
  dyScreen: number,
  isWide: boolean,
): PanOffset =>
  isWide
    ? { a3: pan.a3 + dxScreen, ap: pan.ap - dyScreen }
    : { a3: pan.a3 - dyScreen, ap: pan.ap + dxScreen };
