import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import fc from "fast-check";
import {
  cellMonzo,
  equals,
  inverse,
  LATTICE_PRIMES,
  type Monzo,
  mul,
  normalize,
  type Prime,
  PRIMES,
  ratioValue,
  UNIT,
} from "./monzo.ts";

const arbMonzo: fc.Arbitrary<Monzo> = fc
  .record(
    Object.fromEntries(PRIMES.map((p) => [p, fc.integer({ min: -6, max: 6 })])) as Record<
      Prime,
      fc.Arbitrary<number>
    >,
  )
  .map(normalize);

const arbLatticePrime: fc.Arbitrary<(typeof LATTICE_PRIMES)[number]> = fc.constantFrom(
  ...LATTICE_PRIMES,
);

/** 比の値は浮動小数点なので相対誤差で比較する */
const assertRatioEquals = (actual: number, expected: number): void =>
  assertAlmostEquals(actual / expected, 1, 1e-12);

Deno.test("mul は比の乗算に対応する", () => {
  fc.assert(
    fc.property(arbMonzo, arbMonzo, (a, b) => {
      assertRatioEquals(ratioValue(mul(a, b)), ratioValue(a) * ratioValue(b));
    }),
  );
});

Deno.test("(Monzo, mul) は可換群: 結合律・交換律", () => {
  fc.assert(
    fc.property(arbMonzo, arbMonzo, arbMonzo, (a, b, c) => {
      assertEquals(mul(mul(a, b), c), mul(a, mul(b, c)));
      assertEquals(mul(a, b), mul(b, a));
    }),
  );
});

Deno.test("(Monzo, mul) は可換群: 単位元と逆元", () => {
  fc.assert(
    fc.property(arbMonzo, (a) => {
      assertEquals(mul(a, UNIT), a);
      assertEquals(mul(a, inverse(a)), UNIT);
    }),
  );
});

Deno.test("mul の結果は正規形 (指数 0 のエントリを持たない)", () => {
  fc.assert(
    fc.property(arbMonzo, arbMonzo, (a, b) => {
      assert(Object.values(mul(a, b)).every((e) => e !== 0));
    }),
  );
});

Deno.test("equals は正規形での構造的等価と一致する", () => {
  // 正規形のキーは数値文字列なので JS の数値順キー列挙により順序が一意になる
  fc.assert(
    fc.property(arbMonzo, arbMonzo, (a, b) => {
      assertEquals(equals(a, b), JSON.stringify(a) === JSON.stringify(b));
    }),
  );
});

Deno.test("cellMonzo(x, y, p) は 3^x * p^y を表す", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -6, max: 6 }),
      fc.integer({ min: -6, max: 6 }),
      arbLatticePrime,
      (x, y, p) => {
        assertRatioEquals(ratioValue(cellMonzo(x, y, p)), 3 ** x * p ** y);
      },
    ),
  );
});
