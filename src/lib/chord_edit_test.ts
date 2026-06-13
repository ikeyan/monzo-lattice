import { assert, assertEquals } from "@std/assert";
import fc from "fast-check";
import { moveNote, optimalBassTarget, setBass, toggleNote, translateChord } from "./chord_edit.ts";
import { type Chord, sameTarget, type TouchTarget } from "./touch.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";

const cell = (x3: number, yp: number): TouchTarget => ({ x3, yp });

Deno.test("toggleNote: 空からの追加は底音になり、消すと null に戻る", () => {
  const a = toggleNote(null, cell(0, 0), 1);
  assertEquals(a, { notes: [{ target: cell(0, 0), fingerIds: [1] }], bass: cell(0, 0) });
  assertEquals(toggleNote(a, cell(0, 0), 2), null);
});

Deno.test("toggleNote: 既存ノートのトグルは追加と削除を往復する (べき等な対合)", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({ x3: fc.integer({ min: -2, max: 2 }), yp: fc.integer({ min: -2, max: 2 }) }),
        {
          minLength: 1,
          maxLength: 6,
        },
      ),
      (targets) => {
        // 一意なセルだけ畳み込んで和音を作る
        let chord: Chord | null = null;
        let id = 0;
        const seen: TouchTarget[] = [];
        for (const t of targets) {
          if (!seen.some((s) => sameTarget(s, t))) {
            seen.push(t);
            chord = toggleNote(chord, t, id++);
          }
        }
        if (chord === null) return;
        // 任意の構成音を 2 回トグルすると元に戻る
        const target = seen[0]!;
        const once = toggleNote(chord, target, 99);
        const twice = toggleNote(once, target, 100);
        // 構成 monzo の集合が一致する
        assert(twice !== null);
        assertEquals(
          new Set(twice.notes.map((n) => `${n.target.x3},${n.target.yp}`)),
          new Set(chord.notes.map((n) => `${n.target.x3},${n.target.yp}`)),
        );
      },
    ),
  );
});

Deno.test("toggleNote: 底音を消すと残りのどれかが底音になる", () => {
  let chord = toggleNote(null, cell(0, 0), 1);
  chord = toggleNote(chord, cell(1, 0), 2);
  chord = toggleNote(chord, cell(0, 1), 3);
  const without = toggleNote(chord, cell(0, 0), 4); // 底音を消す
  assert(without !== null);
  assert(without.notes.some((n) => sameTarget(n.target, without.bass)), "底音は構成音");
  assert(!sameTarget(without.bass, cell(0, 0)), "消した底音は残らない");
});

Deno.test("setBass: 構成音なら底音になり、非構成音なら不変", () => {
  let chord = toggleNote(null, cell(0, 0), 1)!;
  chord = toggleNote(chord, cell(1, 0), 2)!;
  assertEquals(setBass(chord, cell(1, 0)).bass, cell(1, 0));
  assertEquals(setBass(chord, cell(5, 5)), chord);
});

Deno.test("moveNote: 空きへの移動は monzo を移し、id を保つ", () => {
  let chord = toggleNote(null, cell(0, 0), 7)!;
  chord = toggleNote(chord, cell(1, 0), 8)!;
  const moved = moveNote(chord, cell(0, 0), cell(0, 1));
  assert(moved !== null);
  const note = moved.notes.find((n) => sameTarget(n.target, cell(0, 1)));
  assertEquals(note?.fingerIds, [7], "id を引き継ぐ");
  assertEquals(moved.bass, cell(0, 1), "底音も移動先へ");
});

Deno.test("moveNote: 移動先に同じ monzo があれば重複として消える", () => {
  let chord = toggleNote(null, cell(0, 0), 1)!;
  chord = toggleNote(chord, cell(1, 0), 2)!;
  const moved = moveNote(chord, cell(0, 0), cell(1, 0));
  assert(moved !== null);
  assertEquals(moved.notes.length, 1, "重複した分が消える");
  assertEquals(moved.notes[0]?.target, cell(1, 0));
  assertEquals(moved.bass, cell(1, 0), "底音は移動先の既存ノート");
});

Deno.test("translateChord: 全構成音と底音を同じだけずらし、構成数を保つ", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -5, max: 5 }),
      fc.integer({ min: -5, max: 5 }),
      (dx3, dyp) => {
        let chord = toggleNote(null, cell(0, 0), 1)!;
        chord = toggleNote(chord, cell(2, -1), 2)!;
        chord = toggleNote(chord, cell(-1, 1), 3)!;
        const t = translateChord(chord, dx3, dyp);
        assertEquals(t.notes.length, chord.notes.length);
        assertEquals(t.bass, { x3: dx3, yp: dyp });
        for (const n of chord.notes) {
          assert(
            t.notes.some((m) =>
              sameTarget(m.target, { x3: n.target.x3 + dx3, yp: n.target.yp + dyp })
            ),
          );
        }
        // 逆向きで元に戻る
        assertEquals(translateChord(t, -dx3, -dyp), chord);
      },
    ),
  );
});

Deno.test("optimalBassTarget: 返す底音は構成音で、どの底音案よりコストが低い", () => {
  let chord = toggleNote(null, cell(0, 0), 1)!;
  chord = toggleNote(chord, cell(1, 0), 2)!;
  chord = toggleNote(chord, cell(0, 1), 3)!;
  const best = optimalBassTarget(chord, DEFAULT_SETTINGS.latticePrime, DEFAULT_SETTINGS);
  assert(chord.notes.some((n) => sameTarget(n.target, best)), "底音は構成音");
});
