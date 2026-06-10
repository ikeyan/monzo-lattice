import { assert, assertEquals } from "@std/assert";
import fc from "fast-check";
import { chordDissonance, pairDissonance, TIMBRE_SPECTRA } from "./spectrum.ts";
import {
  bassRangeOctave,
  octaveCandidates,
  solveVoicing,
  solveVoicingTransition,
  type Voicing,
  voicingCost,
  type VoicingInput,
  type VoicingNote,
} from "./voicing.ts";

// --- スペクトル ---

Deno.test("pairDissonance: 同一周波数で 0、常に非負", () => {
  fc.assert(
    fc.property(
      fc.double({ min: 30, max: 4000, noNaN: true }),
      fc.double({ min: 30, max: 4000, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      (f1, f2, a1, a2) => {
        assertEquals(pairDissonance(f1, a1, f1, a2), 0);
        assert(pairDissonance(f1, a1, f2, a2) >= 0);
      },
    ),
  );
});

Deno.test("chordDissonance: 倍音を持つ音色ではオクターブはわずかにずれたオクターブより協和", () => {
  // 正弦波には倍音がないのでオクターブの特別な協和性はない。倍音列を持つギターで検証する
  const spectrum = TIMBRE_SPECTRA.guitar;
  const octave = chordDissonance([220, 440], spectrum);
  const detuned = chordDissonance([220, 440 * 1.03], spectrum);
  assert(octave < detuned, `octave=${octave} detuned=${detuned}`);
});

// --- オクターブ候補 ---

/** 格子セル相当の f0 比: 3^x * 5^y */
const arbRatio: fc.Arbitrary<number> = fc
  .record({ x: fc.integer({ min: -3, max: 3 }), y: fc.integer({ min: -3, max: 3 }) })
  .map(({ x, y }) => 3 ** x * 5 ** y);

Deno.test("octaveCandidates: 候補はすべて範囲内で、1 オクターブ以上の範囲なら必ず存在する", () => {
  fc.assert(
    fc.property(
      arbRatio,
      fc.double({ min: 1 / 32, max: 16, noNaN: true }),
      fc.double({ min: 2, max: 4, noNaN: true }),
      (r, min, widthFactor) => {
        const max = min * widthFactor;
        const candidates = octaveCandidates(r, min, max);
        assert(candidates.length >= 1, `候補なし: r=${r}, [${min}, ${max}]`);
        for (const n of candidates) {
          const freq = r * 2 ** n;
          assert(freq >= min && freq <= max, `範囲外: ${freq} not in [${min}, ${max}]`);
        }
      },
    ),
  );
});

Deno.test("bassRangeOctave: r * 2^n は [bassMin, bassMin*2) に入る", () => {
  fc.assert(
    fc.property(arbRatio, fc.double({ min: 1 / 32, max: 8, noNaN: true }), (r, bassMin) => {
      const n = bassRangeOctave(r, bassMin);
      const freq = r * 2 ** n;
      assert(freq >= bassMin && freq < bassMin * 2, `${freq} not in [${bassMin}, ${bassMin * 2})`);
    }),
  );
});

// --- ソルバ ---

const arbNotes: fc.Arbitrary<readonly VoicingNote[]> = fc
  .uniqueArray(
    fc.record({ x: fc.integer({ min: -3, max: 3 }), y: fc.integer({ min: -2, max: 2 }) }),
    {
      minLength: 1,
      maxLength: 4,
      selector: (c) => `${c.x},${c.y}`,
    },
  )
  .map((cells) =>
    cells.map((c, i) => ({
      ratio: 3 ** c.x * 5 ** c.y,
      monzoKey: `3^${c.x}5^${c.y}`,
      fingerIds: [i + 1],
    }))
  );

const arbVoicingSettings = fc.record({
  f0Hz: fc.constant(220),
  timbre: fc.constantFrom(...(["sine", "triangle", "guitar", "xylophone"] as const)),
  spreadPenaltyCoeff: fc.double({ min: 0, max: 10, noNaN: true }),
  bassEnabled: fc.boolean(),
  bassMinRatio: fc.double({ min: 1 / 8, max: 1, noNaN: true }),
  midMinRatio: fc.double({ min: 2, max: 4, noNaN: true }),
  midMaxRatio: fc.double({ min: 8, max: 32, noNaN: true }),
});

Deno.test("solveVoicing の結果は §7.3 の制約をすべて満たす", () => {
  fc.assert(
    fc.property(arbNotes, arbVoicingSettings, (notes, settings) => {
      const result = solveVoicing({ notes, bassIndex: 0 }, settings);
      if (settings.bassEnabled) {
        assert(result !== null, "ベース有効時は必ず解ける");
      }
      if (result === null) return;
      const eps = 1e-9;
      const bassRangeNotes = result.notes.filter((v) => v.isBassRange);
      for (const v of result.notes) {
        if (v.isBassRange) {
          assert(
            v.finalRatio >= settings.bassMinRatio - eps &&
              v.finalRatio < settings.bassMinRatio * 2 + eps,
            "ベース音域",
          );
        } else {
          assert(
            v.finalRatio >= settings.midMinRatio - eps &&
              v.finalRatio <= settings.midMaxRatio + eps,
            "中音域",
          );
        }
      }
      const lowest = Math.min(...result.notes.map((v) => v.finalRatio));
      if (settings.bassEnabled) {
        assertEquals(bassRangeNotes.length, 1, "ベース音域のノートはちょうど 1 つ");
        assert(bassRangeNotes[0] !== undefined && bassRangeNotes[0].finalRatio <= lowest + eps);
      } else {
        assertEquals(bassRangeNotes.length, 0);
        const bassVoiced = result.notes[0];
        assert(bassVoiced !== undefined && bassVoiced.finalRatio <= lowest + eps, "底音が最低音");
      }
    }),
  );
});

Deno.test("solveVoicing はどの実行可能な割り当てよりもコストが低い (最適性)", () => {
  fc.assert(
    fc.property(
      arbNotes,
      arbVoicingSettings.map((s) => ({ ...s, bassEnabled: true })),
      fc.infiniteStream(fc.nat({ max: 1000 })),
      (notes, settings, picks) => {
        const result = solveVoicing({ notes, bassIndex: 0 }, settings);
        assert(result !== null);
        // ランダムな実行可能割り当てを作る
        const octaves = notes.map((n) => {
          const cands = octaveCandidates(n.ratio, settings.midMinRatio, settings.midMaxRatio);
          const pick = picks.next().value as number;
          return cands[pick % cands.length] ?? 0;
        });
        const bassNote = notes[0];
        assert(bassNote !== undefined);
        const ratios = [
          ...notes.map((n, i) => n.ratio * 2 ** (octaves[i] ?? 0)),
          bassNote.ratio * 2 ** bassRangeOctave(bassNote.ratio, settings.bassMinRatio),
        ];
        const randomCost = voicingCost(ratios, settings);
        assert(result.cost <= randomCost + 1e-9, `${result.cost} > ${randomCost}`);
      },
    ),
  );
});

Deno.test("遷移モード sameMonzoFixed: 同じ和音を解き直すとオクターブが維持される", () => {
  fc.assert(
    fc.property(
      arbNotes,
      arbVoicingSettings.map((s) => ({ ...s, bassEnabled: true })),
      (notes, settings) => {
        const input: VoicingInput = { notes, bassIndex: 0 };
        const first = solveVoicing(input, settings);
        assert(first !== null);
        const second = solveVoicingTransition(input, settings, "sameMonzoFixed", first);
        assert(second !== null);
        const firstOctaves = new Map(
          first.notes.filter((v) => !v.isBassRange).map((v) => [v.note.monzoKey, v.octave]),
        );
        for (const v of second.notes) {
          if (!v.isBassRange) {
            assertEquals(v.octave, firstOctaves.get(v.note.monzoKey));
          }
        }
      },
    ),
  );
});

Deno.test("遷移モード sameFingerOctave: 共通の指の相対オクターブは一定 (またはフォールバック)", () => {
  fc.assert(
    fc.property(
      arbNotes,
      arbNotes,
      arbVoicingSettings.map((s) => ({ ...s, bassEnabled: true })),
      (notesA, notesB, settings) => {
        const prev = solveVoicing({ notes: notesA, bassIndex: 0 }, settings);
        assert(prev !== null);
        const result = solveVoicingTransition(
          { notes: notesB, bassIndex: 0 },
          settings,
          "sameFingerOctave",
          prev,
        );
        assert(result !== null);
        const prevByFinger = new Map<number, number>();
        for (const v of prev.notes) {
          if (!v.isBassRange) {
            for (const f of v.note.fingerIds) prevByFinger.set(f, v.octave);
          }
        }
        const shifts = result.notes
          .filter((v) => !v.isBassRange)
          .flatMap((v) => {
            const f = v.note.fingerIds.find((id) => prevByFinger.has(id));
            return f === undefined ? [] : [v.octave - (prevByFinger.get(f) ?? 0)];
          });
        const consistent = shifts.every((m) => m === shifts[0]);
        const fallback: Voicing | null = solveVoicing({ notes: notesB, bassIndex: 0 }, settings);
        assert(
          consistent || (fallback !== null && result.cost === fallback.cost),
          "相対オクターブが一定か、自由解へのフォールバック",
        );
      },
    ),
  );
});
