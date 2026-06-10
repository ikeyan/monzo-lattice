import { assert, assertEquals } from "@std/assert";
import fc from "fast-check";
import {
  addBean,
  BEAN_LONG_CM,
  BEAN_SHORT_CM,
  beanCapacity,
  beanPositionsCm,
  beansAt,
  effectiveBeans,
  EMPTY_BOARD,
  moveBean,
  normalizeBeans,
  removeBean,
  targetAtPoint,
} from "./beans.ts";
import { cellRect, PAN_ZERO, type ViewGeometry } from "./lattice_view.ts";
import { LATTICE_PRIMES, type LatticePrime } from "./monzo.ts";

const arbPrime: fc.Arbitrary<LatticePrime> = fc.constantFrom(...LATTICE_PRIMES);
const arbPrimes = fc.array(arbPrime, { maxLength: 10 });

Deno.test("normalizeBeans: 昇順・重複なし・容量以内で、あふれは大きい素数から消える (§4.3)", () => {
  fc.assert(
    fc.property(arbPrimes, fc.integer({ min: 0, max: 8 }), (primes, capacity) => {
      const result = normalizeBeans(primes, capacity);
      assert(result.every((q, i) => i === 0 || (result[i - 1] ?? 0) < q), "昇順かつ重複なし");
      assert(result.length <= capacity, "容量以内");
      const unique = [...new Set(primes)].toSorted((a, b) => a - b);
      assertEquals(result, unique.slice(0, capacity), "残るのは小さい素数から");
    }),
  );
});

Deno.test("normalizeBeans は冪等", () => {
  fc.assert(
    fc.property(arbPrimes, fc.integer({ min: 0, max: 8 }), (primes, capacity) => {
      const once = normalizeBeans(primes, capacity);
      assertEquals(normalizeBeans(once, capacity), once);
    }),
  );
});

Deno.test("addBean / removeBean / moveBean の盤面操作", () => {
  const cap = beanCapacity(3);
  const b1 = addBean(EMPTY_BOARD, 0, 0, 7, cap);
  assertEquals(beansAt(b1, 0, 0), [7]);
  const b2 = addBean(b1, 0, 0, 5, cap);
  assertEquals(beansAt(b2, 0, 0), [5, 7], "昇順に整列");
  const b3 = addBean(b2, 0, 0, 5, cap);
  assertEquals(beansAt(b3, 0, 0), [5, 7], "重複は消える (§4.3)");
  const b4 = moveBean(b3, { x3: 0, yp: 0 }, { x3: 1, yp: 0 }, 7, cap);
  assertEquals(beansAt(b4, 0, 0), [5]);
  assertEquals(beansAt(b4, 1, 0), [7]);
  const b5 = removeBean(b4, 1, 0, 7);
  assertEquals(beansAt(b5, 1, 0), []);
});

Deno.test("effectiveBeans は p と同じ素数の豆を無効にする (§4)", () => {
  fc.assert(
    fc.property(arbPrimes, arbPrime, (primes, p) => {
      const result = effectiveBeans(primes, p);
      assert(!result.includes(p));
      assertEquals(result, primes.filter((q) => q !== p));
    }),
  );
});

Deno.test("beanPositionsCm: 豆はセル内に収まり、左→右・下→上の順", () => {
  fc.assert(
    fc.property(
      fc.double({ min: 2, max: 4, noNaN: true }),
      fc.integer({ min: 0, max: 6 }),
      (cellSizeCm, count) => {
        const positions = beanPositionsCm(cellSizeCm, count);
        assertEquals(positions.length, count);
        for (const [i, pos] of positions.entries()) {
          assert(pos.x >= BEAN_LONG_CM / 2 - 1e-9 && pos.x <= cellSizeCm - BEAN_LONG_CM / 2 + 1e-9);
          assert(pos.y >= BEAN_SHORT_CM / 2 - 1e-9 && pos.y <= cellSizeCm + 1e-9);
          const prev = positions[i - 1];
          if (prev !== undefined) {
            // 後の豆は右か、上の段 (y が小さい方が上ではなく…画面座標では y 大が下なので上の段は y 小)
            assert(pos.x > prev.x || pos.y < prev.y, "左→右・下→上");
          }
        }
      },
    ),
  );
});

Deno.test("targetAtPoint: 豆の中心は豆を、豆のない場所はセルを返す (§4.4)", () => {
  const geo: ViewGeometry = {
    width: 800,
    height: 600,
    cellSizePx: 113.4, // 3cm
    pan: PAN_ZERO,
    isWide: true,
  };
  const cellSizeCm = 3;
  const cap = beanCapacity(cellSizeCm);
  const board = addBean(addBean(EMPTY_BOARD, 0, 0, 7, cap), 0, 0, 13, cap);
  const { left, top } = cellRect(geo, 0, 0);
  const pxPerCm = geo.cellSizePx / cellSizeCm;
  const positions = beanPositionsCm(cellSizeCm, 2);
  // 豆 7 (1 番目) の中心
  const p0 = positions[0];
  assert(p0 !== undefined);
  assertEquals(
    targetAtPoint(geo, board, 5, cellSizeCm, left + p0.x * pxPerCm, top + p0.y * pxPerCm),
    { x3: 0, yp: 0, bean: 7 },
  );
  // セル中央 (豆なし)
  assertEquals(
    targetAtPoint(geo, board, 5, cellSizeCm, left + geo.cellSizePx / 2, top + geo.cellSizePx / 2),
    { x3: 0, yp: 0 },
  );
  // p = 7 にすると豆 7 は無効になり、同じ場所は 13 でなければセル
  const t = targetAtPoint(geo, board, 7, cellSizeCm, left + p0.x * pxPerCm, top + p0.y * pxPerCm);
  assertEquals(t, { x3: 0, yp: 0, bean: 13 }, "豆 7 が消えて 13 が先頭の位置に来る");
});
