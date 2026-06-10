import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import fc from "fast-check";
import {
  applyPitchDrag,
  fractionToHz,
  logFraction,
  pickPitchDrag,
  type PitchDragKind,
} from "./pitch_line.ts";
import { F0_MAX_HZ, F0_MIN_HZ, sanitizeSettings, type Settings } from "./settings.ts";

/** sanitizeSettings を通した正規な設定 (音域制約 §2.2 を満たす) */
const arbSettings: fc.Arbitrary<Settings> = fc
  .record({
    f0Hz: fc.double({ min: F0_MIN_HZ, max: F0_MAX_HZ, noNaN: true }),
    bassEnabled: fc.boolean(),
    bassMinRatio: fc.double({ min: 1 / 64, max: 16, noNaN: true }),
    midMinRatio: fc.double({ min: 1 / 64, max: 32, noNaN: true }),
    midMaxRatio: fc.double({ min: 1 / 64, max: 64, noNaN: true }),
  })
  .map((r) => sanitizeSettings(r));

const arbKind: fc.Arbitrary<PitchDragKind> = fc.constantFrom(
  "f0",
  "bassBand",
  "midMin",
  "midMax",
  "midBand",
);

/** 表示範囲の少し外まで含む点 */
const arbHz: fc.Arbitrary<number> = fc
  .double({ min: -0.2, max: 1.2, noNaN: true })
  .map(fractionToHz);

const relClose = (a: number, b: number): boolean =>
  Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1);

Deno.test("logFraction と fractionToHz は互いに逆写像", () => {
  fc.assert(
    fc.property(fc.double({ min: F0_MIN_HZ, max: F0_MAX_HZ, noNaN: true }), (hz) => {
      assertAlmostEquals(fractionToHz(logFraction(hz)), hz, hz * 1e-12);
    }),
  );
  assertEquals(logFraction(F0_MIN_HZ), 0);
  assertEquals(logFraction(F0_MAX_HZ), 1);
});

Deno.test("pickPitchDrag: f0 の上では常に f0、離れた中音域の端では端をつかむ", () => {
  fc.assert(
    fc.property(arbSettings, (s) => {
      const tol = 0.1;
      const pick = (hz: number) => pickPitchDrag(s, hz, tol);
      assertEquals(pick(s.f0Hz)?.kind, "f0");
      // 幅は 1 オクターブ以上なので tol 0.1 oct では両端が同時に当たらない
      if (Math.abs(Math.log2(s.midMinRatio)) > tol) {
        assertEquals(pick(s.f0Hz * s.midMinRatio)?.kind, "midMin");
      }
      if (Math.abs(Math.log2(s.midMaxRatio)) > tol) {
        assertEquals(pick(s.f0Hz * s.midMaxRatio)?.kind, "midMax");
      }
    }),
  );
});

Deno.test("f0 と重なった中音域下端は、帯ごと動かせば f0 から離せる", () => {
  // 既定値では midMin = f0 (比 1) で端をつかめない。帯の内部 (比 2) をつかんで
  // 帯ごと上へずらすと、midMin が f0 から離れて端としてつかめるようになる
  const s = sanitizeSettings({ midMinRatio: 1, midMaxRatio: 4 });
  const tol = 0.1;
  assertEquals(pickPitchDrag(s, s.f0Hz * s.midMinRatio, tol)?.kind, "f0");
  const inside = pickPitchDrag(s, s.f0Hz * 2, tol);
  assertEquals(inside?.kind, "midBand");
  const moved = {
    ...s,
    ...applyPitchDrag(s, inside ?? { kind: "midBand", grabLog2: 0 }, s.f0Hz * 3),
  };
  assertEquals(pickPitchDrag(moved, moved.f0Hz * moved.midMinRatio, tol)?.kind, "midMin");
});

Deno.test("pickPitchDrag: 端から離れた f0・帯の内部・空き地", () => {
  const s = sanitizeSettings({
    f0Hz: 220,
    bassMinRatio: 0.25,
    midMinRatio: 2,
    midMaxRatio: 16,
    bassEnabled: true,
  });
  const tol = 0.1;
  assertEquals(pickPitchDrag(s, 220, tol)?.kind, "f0");
  assertEquals(pickPitchDrag(s, 220 * 0.35, tol)?.kind, "bassBand"); // ベース帯 [0.25, 0.5] の中
  assertEquals(pickPitchDrag(s, 220 * 6, tol)?.kind, "midBand"); // 中音域 [2, 16] の中
  assertEquals(pickPitchDrag(s, 220 * 0.0625, tol), null); // どの帯からも遠い
  assertEquals(pickPitchDrag({ ...s, bassEnabled: false }, 220 * 0.35, tol), null);
});

Deno.test("applyPitchDrag の結果は sanitize で変わらない (制約 §2.2 を満たす)", () => {
  fc.assert(
    fc.property(
      arbSettings,
      arbKind,
      fc.double({ min: -2, max: 2, noNaN: true }),
      arbHz,
      (s, kind, grabLog2, hz) => {
        const merged = { ...s, ...applyPitchDrag(s, { kind, grabLog2 }, hz) };
        const san = sanitizeSettings(merged);
        for (
          const key of ["f0Hz", "bassMinRatio", "midMinRatio", "midMaxRatio"] as const
        ) {
          assert(relClose(san[key], merged[key]), `${kind} のドラッグ後 ${key} が安定`);
        }
      },
    ),
  );
});

Deno.test("ドラッグは対象のハンドル以外の音域を動かさない", () => {
  fc.assert(
    fc.property(
      arbSettings,
      arbKind,
      fc.double({ min: -2, max: 2, noNaN: true }),
      arbHz,
      (s, kind, grabLog2, hz) => {
        const update = applyPitchDrag(s, { kind, grabLog2 }, hz);
        const expectedKeys: Readonly<Record<PitchDragKind, readonly string[]>> = {
          f0: ["f0Hz"],
          bassBand: ["bassMinRatio"],
          midMin: ["midMinRatio"],
          midMax: ["midMaxRatio"],
          midBand: ["midMinRatio", "midMaxRatio"],
        };
        assertEquals(Object.keys(update).sort(), [...expectedKeys[kind]].sort());
        if (kind === "midBand") {
          // 帯の幅 (オクターブ) は保たれる
          const width = s.midMaxRatio / s.midMinRatio;
          const newWidth = (update.midMaxRatio ?? NaN) / (update.midMinRatio ?? NaN);
          assert(relClose(width, newWidth), "帯の幅が保たれる");
        }
      },
    ),
  );
});

Deno.test("可動範囲内ではハンドルはつかんだ点に正確に追従する", () => {
  fc.assert(
    fc.property(arbSettings, arbHz, (s, hz) => {
      // 例: 中音域上端。可動範囲 [midMin*2, 64] 内なら anchor がそのまま反映される
      const target = hz / s.f0Hz;
      fc.pre(target >= s.midMinRatio * 2 && target <= 64);
      const update = applyPitchDrag(s, { kind: "midMax", grabLog2: 0 }, hz);
      assert(relClose(update.midMaxRatio ?? NaN, target));
    }),
  );
});
