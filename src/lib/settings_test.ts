import { assert, assertEquals } from "@std/assert";
import fc from "fast-check";
import { LATTICE_PRIMES } from "./monzo.ts";
import {
  CHORD_TRANSITION_MODES,
  DEFAULT_SETTINGS,
  F0_MAX_HZ,
  F0_MIN_HZ,
  NOTE_MOVE_MODES,
  PLAY_MODES,
  sanitizeSettings,
  type Settings,
  TIMBRES,
} from "./settings.ts";

/** sanitizeSettings の出力が常に満たすべき不変条件 */
const assertValidSettings = (s: Settings): void => {
  const inRange = (x: number, min: number, max: number) =>
    Number.isFinite(x) && min <= x && x <= max;
  assert(inRange(s.f0Hz, F0_MIN_HZ, F0_MAX_HZ), `f0Hz: ${s.f0Hz}`);
  assert(inRange(s.bassMinRatio, 1 / 64, 16), `bassMinRatio: ${s.bassMinRatio}`);
  assert(inRange(s.midMinRatio, 1 / 32, 32), `midMinRatio: ${s.midMinRatio}`);
  assert(inRange(s.midMaxRatio, 1 / 16, 64), `midMaxRatio: ${s.midMaxRatio}`);
  // §2.2: ベース上端 <= 中音域下端 <= 中音域上端 / 2
  assert(s.bassMinRatio * 2 <= s.midMinRatio, "ベース上端 <= 中音域下端");
  assert(s.midMinRatio * 2 <= s.midMaxRatio, "中音域の幅 >= 1 オクターブ");
  assert((LATTICE_PRIMES as readonly number[]).includes(s.latticePrime));
  assert(inRange(s.cellSizeCm, 2, 4));
  assert(inRange(s.batchPeriodMs, 50, 250) && s.batchPeriodMs % 10 === 0);
  assert(inRange(s.panThresholdCm, 0.1, 3));
  assert(inRange(s.spreadPenaltyCoeff, 0, 10));
  assert((NOTE_MOVE_MODES as readonly string[]).includes(s.noteMoveMode));
  assert(inRange(s.glideTimeMs, 0, 2000));
  assert((TIMBRES as readonly string[]).includes(s.timbre));
  assert(inRange(s.adsr.attackMs, 0, 2000));
  assert(inRange(s.adsr.decayMs, 0, 5000));
  assert(inRange(s.adsr.sustainLevel, 0, 1));
  assert(inRange(s.adsr.releaseMs, 0, 5000));
  assert(inRange(s.reverb.mix, 0, 1));
  assert(inRange(s.reverb.decaySec, 0, 10));
  assert((CHORD_TRANSITION_MODES as readonly string[]).includes(s.chordTransitionMode));
  assert((PLAY_MODES as readonly string[]).includes(s.playMode));
};

/** 不変条件を満たす Settings を生成する (音域は制約に従い段階的に決める) */
const arbValidSettings: fc.Arbitrary<Settings> = fc
  .record({
    f0Hz: fc.double({ min: F0_MIN_HZ, max: F0_MAX_HZ, noNaN: true }),
    bassEnabled: fc.boolean(),
    bassMinRatio: fc.double({ min: 1 / 64, max: 16, noNaN: true }),
    latticePrime: fc.constantFrom(...LATTICE_PRIMES),
    cellSizeCm: fc.double({ min: 2, max: 4, noNaN: true }),
    batchPeriodMs: fc.integer({ min: 5, max: 25 }).map((n) => n * 10),
    panThresholdCm: fc.double({ min: 0.1, max: 3, noNaN: true }),
    spreadPenaltyCoeff: fc.double({ min: 0, max: 10, noNaN: true }),
    noteMoveMode: fc.constantFrom(...NOTE_MOVE_MODES),
    glideTimeMs: fc.double({ min: 0, max: 2000, noNaN: true }),
    timbre: fc.constantFrom(...TIMBRES),
    adsr: fc.record({
      attackMs: fc.double({ min: 0, max: 2000, noNaN: true }),
      decayMs: fc.double({ min: 0, max: 5000, noNaN: true }),
      sustainLevel: fc.double({ min: 0, max: 1, noNaN: true }),
      releaseMs: fc.double({ min: 0, max: 5000, noNaN: true }),
    }),
    reverb: fc.record({
      mix: fc.double({ min: 0, max: 1, noNaN: true }),
      decaySec: fc.double({ min: 0, max: 10, noNaN: true }),
    }),
    chordTransitionMode: fc.constantFrom(...CHORD_TRANSITION_MODES),
    playMode: fc.constantFrom(...PLAY_MODES),
  })
  .chain((s) =>
    fc
      .double({ min: s.bassMinRatio * 2, max: 32, noNaN: true })
      .chain((midMinRatio) =>
        fc
          .double({ min: midMinRatio * 2, max: 64, noNaN: true })
          .map((midMaxRatio) => ({ ...s, midMinRatio, midMaxRatio }))
      )
  );

Deno.test("既定値は不変条件を満たし、sanitize で変化しない", () => {
  assertValidSettings(DEFAULT_SETTINGS);
  assertEquals(sanitizeSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
});

Deno.test("sanitizeSettings はどんな入力にも不変条件を満たす設定を返す", () => {
  fc.assert(
    fc.property(fc.anything(), (junk) => {
      assertValidSettings(sanitizeSettings(junk));
    }),
  );
});

Deno.test("sanitizeSettings は冪等", () => {
  fc.assert(
    fc.property(fc.anything(), (junk) => {
      const once = sanitizeSettings(junk);
      assertEquals(sanitizeSettings(once), once);
    }),
  );
});

Deno.test("不変条件を満たす設定は sanitize を素通りする", () => {
  fc.assert(
    fc.property(arbValidSettings, (s) => {
      assertEquals(sanitizeSettings(s), s);
    }),
  );
});

Deno.test("数値フィールドの範囲外の値は範囲内に収められる (一部既定値に依らない)", () => {
  fc.assert(
    fc.property(
      fc.record({
        f0Hz: fc.double({ noNaN: true }),
        batchPeriodMs: fc.double({ noNaN: true }),
      }),
      (partial) => {
        const s = sanitizeSettings(partial);
        assertValidSettings(s);
      },
    ),
  );
});
