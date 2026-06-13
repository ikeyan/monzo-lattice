import { assert, assertEquals } from "@std/assert";
import fc from "fast-check";
import { cellAtPoint, PAN_ZERO, type ViewGeometry } from "./lattice_view.ts";
import { cellWithMargin, sameTarget, type TouchTarget } from "./touch.ts";

/** テスト用ジオメトリ: 横長 800x600、セル 100px。原点セル中心は (400, 300) */
const GEO: ViewGeometry = { width: 800, height: 600, cellSizePx: 100, pan: PAN_ZERO, isWide: true };

const arbCell: fc.Arbitrary<TouchTarget> = fc.record({
  x3: fc.integer({ min: -3, max: 3 }),
  yp: fc.integer({ min: -2, max: 2 }),
});

Deno.test("cellWithMargin は現在のセルか点のあるセルのどちらかを返し、冪等", () => {
  fc.assert(
    fc.property(
      arbCell,
      fc.double({ min: 0, max: 800, noNaN: true }),
      fc.double({ min: 0, max: 600, noNaN: true }),
      (current, px, py) => {
        const result = cellWithMargin(GEO, current, px, py, 0.03);
        assert(
          sameTarget(result, current) || sameTarget(result, cellAtPoint(GEO, px, py)),
          "結果は現在のセルか点のあるセル",
        );
        // 冪等: 移動判定後にもう一度判定しても変わらない
        assertEquals(cellWithMargin(GEO, result, px, py, 0.03), result);
      },
    ),
  );
});

Deno.test("cellWithMargin: マージンより深い点は必ずそのセルに移る", () => {
  fc.assert(
    fc.property(
      arbCell,
      arbCell,
      fc.double({ min: 0.05, max: 0.95, noNaN: true }),
      fc.double({ min: 0.05, max: 0.95, noNaN: true }),
      (current, target, u, v) => {
        // セル (target) の内側 5%〜95% の点 (マージン 3% より深い)
        const px = 400 + target.x3 * 100 - 50 + u * 100;
        const py = 300 - target.yp * 100 - 50 + v * 100;
        assertEquals(cellWithMargin(GEO, current, px, py, 0.03), target);
      },
    ),
  );
});
