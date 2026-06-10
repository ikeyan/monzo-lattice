import { assert, assertEquals } from "@std/assert";
import fc from "fast-check";
import {
  applyPanDelta,
  cellAtPoint,
  PAN_ZERO,
  type ViewGeometry,
  visibleCells,
} from "./lattice_view.ts";

const arbGeometry: fc.Arbitrary<ViewGeometry> = fc.record({
  width: fc.double({ min: 50, max: 800, noNaN: true }),
  height: fc.double({ min: 50, max: 800, noNaN: true }),
  cellSizePx: fc.double({ min: 30, max: 200, noNaN: true }),
  pan: fc.record({
    a3: fc.double({ min: -1000, max: 1000, noNaN: true }),
    ap: fc.double({ min: -1000, max: 1000, noNaN: true }),
  }),
  isWide: fc.boolean(),
});

/** セル中心はセル境界から最も遠く、浮動小数点誤差で隣のセルに化けない */
const center = (c: { left: number; top: number }, s: number): readonly [number, number] => [
  c.left + s / 2,
  c.top + s / 2,
];

Deno.test("可視セルはすべてビューポートと交差する", () => {
  fc.assert(
    fc.property(arbGeometry, (geo) => {
      const s = geo.cellSizePx;
      for (const c of visibleCells(geo)) {
        assert(c.left <= geo.width && c.left + s >= 0, `x 方向: ${JSON.stringify(c)}`);
        assert(c.top <= geo.height && c.top + s >= 0, `y 方向: ${JSON.stringify(c)}`);
      }
    }),
  );
});

Deno.test("可視セルの中心を cellAtPoint に通すと同じセルに戻る", () => {
  fc.assert(
    fc.property(arbGeometry, (geo) => {
      for (const c of visibleCells(geo).slice(0, 30)) {
        const [px, py] = center(c, geo.cellSizePx);
        assertEquals(cellAtPoint(geo, px, py), { x3: c.x3, yp: c.yp });
      }
    }),
  );
});

Deno.test("ビューポート内の任意の点は可視セルのどれかに属する", () => {
  fc.assert(
    fc.property(
      arbGeometry,
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      (geo, tx, ty) => {
        const px = geo.width * tx;
        const py = geo.height * ty;
        const { x3, yp } = cellAtPoint(geo, px, py);
        assert(
          visibleCells(geo).some((c) => c.x3 === x3 && c.yp === yp),
          `(${px}, ${py}) → (${x3}, ${yp}) が可視セルにない`,
        );
      },
    ),
  );
});

Deno.test("パンを軸方向にセル 1 個分ずらすと同じ点が指すセルが 1 ずれる (並進同変性)", () => {
  fc.assert(
    fc.property(arbGeometry, (geo) => {
      const s = geo.cellSizePx;
      for (const c of visibleCells(geo).slice(0, 30)) {
        const [px, py] = center(c, s);
        const shifted3 = cellAtPoint({ ...geo, pan: { ...geo.pan, a3: geo.pan.a3 + s } }, px, py);
        assertEquals(shifted3, { x3: c.x3 - 1, yp: c.yp });
        const shiftedP = cellAtPoint({ ...geo, pan: { ...geo.pan, ap: geo.pan.ap + s } }, px, py);
        assertEquals(shiftedP, { x3: c.x3, yp: c.yp - 1 });
      }
    }),
  );
});

Deno.test("applyPanDelta: 格子平面はドラッグに追従する (動かした点が同じセルを指す)", () => {
  fc.assert(
    fc.property(
      arbGeometry,
      fc.integer({ min: -300, max: 300 }),
      fc.integer({ min: -300, max: 300 }),
      (geo, dx, dy) => {
        const s = geo.cellSizePx;
        const panned = { ...geo, pan: applyPanDelta(geo.pan, dx, dy, geo.isWide) };
        for (const c of visibleCells(geo).slice(0, 10)) {
          const [px, py] = center(c, s);
          assertEquals(cellAtPoint(panned, px + dx, py + dy), { x3: c.x3, yp: c.yp });
        }
      },
    ),
  );
});

Deno.test("applyPanDelta: 逆向きのドラッグで元に戻る", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -1000, max: 1000 }),
      fc.integer({ min: -1000, max: 1000 }),
      fc.boolean(),
      (dx, dy, isWide) => {
        const moved = applyPanDelta(PAN_ZERO, dx, dy, isWide);
        assertEquals(applyPanDelta(moved, -dx, -dy, isWide), PAN_ZERO);
      },
    ),
  );
});
