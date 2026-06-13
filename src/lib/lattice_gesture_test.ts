import { assert, assertEquals } from "@std/assert";
import fc from "fast-check";
import { PAN_ZERO, type ViewGeometry } from "./lattice_view.ts";
import {
  INITIAL_LATTICE_GESTURE,
  type LatticeAction,
  type LatticeGestureConfig,
  type LatticeGestureEvent,
  type LatticeGestureState,
  reduceLatticeGesture,
} from "./lattice_gesture.ts";
import { type Chord, sameTarget, type TouchTarget } from "./touch.ts";
import { toggleNote } from "./chord_edit.ts";

const GEO: ViewGeometry = { width: 800, height: 600, cellSizePx: 100, pan: PAN_ZERO, isWide: true };
const center = (x3: number, yp: number) => ({ x: 400 + x3 * 100, y: 300 - yp * 100 });

/** 和音スナップショットから config を組む */
const configFor = (chord: Chord | null): LatticeGestureConfig => ({
  geo: GEO,
  marginFrac: 0.03,
  longPressMs: 400,
  slopPx: 10,
  hasTarget: (t) => chord?.notes.some((n) => sameTarget(n.target, t)) ?? false,
  cellHasMonzo: (x3, yp) =>
    chord?.notes.some((n) => n.target.x3 === x3 && n.target.yp === yp) ?? false,
  isBass: (t) => chord !== null && sameTarget(chord.bass, t),
});

const down = (id: number, x3: number, yp: number, at: number): LatticeGestureEvent => ({
  type: "down",
  pointerId: id,
  ...center(x3, yp),
  at,
  target: { x3, yp },
});
const moveAt = (id: number, x: number, y: number, at: number): LatticeGestureEvent => ({
  type: "move",
  pointerId: id,
  x,
  y,
  at,
});
const up = (id: number, at: number): LatticeGestureEvent => ({ type: "up", pointerId: id, at });
const tick = (at: number): LatticeGestureEvent => ({ type: "tick", at });

type Run = Readonly<
  { state: LatticeGestureState; actions: LatticeAction[]; pans: { dx: number; dy: number }[] }
>;

const run = (events: readonly LatticeGestureEvent[], config: LatticeGestureConfig): Run =>
  events.reduce<Run>(
    (acc, e) => {
      const r = reduceLatticeGesture(acc.state, e, config);
      return {
        state: r.state,
        actions: [...acc.actions, ...r.actions],
        pans: r.panDelta === null ? acc.pans : [...acc.pans, r.panDelta],
      };
    },
    { state: INITIAL_LATTICE_GESTURE, actions: [], pans: [] },
  );

Deno.test("タップは monzo の存在をトグルする (§6)", () => {
  const r = run([down(1, 0, 0, 0), up(1, 50)], configFor(null));
  assertEquals(r.actions, [{ type: "toggle", target: { x3: 0, yp: 0 } }]);
});

Deno.test("ロングタップは底音化する (§6)", () => {
  const chord = toggleNote(toggleNote(null, { x3: 0, yp: 0 }, 1), { x3: 1, yp: 0 }, 2);
  // (1,0) は底音でない → setBass
  const r = run([down(1, 1, 0, 0), tick(500)], configFor(chord));
  assertEquals(r.actions, [{ type: "setBass", target: { x3: 1, yp: 0 } }]);
});

Deno.test("ロングタップが現在の底音なら底音を最適化する (§6)", () => {
  const chord = toggleNote(null, { x3: 0, yp: 0 }, 1); // (0,0) が底音
  const r = run([down(1, 0, 0, 0), tick(500)], configFor(chord));
  assertEquals(r.actions, [{ type: "optimizeBass" }]);
});

Deno.test("ロングタップ前に離せばタップ (トグル) になる (§6)", () => {
  const chord = toggleNote(null, { x3: 0, yp: 0 }, 1);
  const r = run([down(1, 0, 0, 0), up(1, 100), tick(500)], configFor(chord));
  assertEquals(r.actions, [{ type: "toggle", target: { x3: 0, yp: 0 } }]);
});

Deno.test("二本指タップはセルを底音化する (§6)", () => {
  const chord = toggleNote(toggleNote(null, { x3: 0, yp: 0 }, 1), { x3: 1, yp: 0 }, 2);
  const r = run([down(1, 1, 0, 0), down(2, 1, 0, 20), up(1, 60), up(2, 70)], configFor(chord));
  assertEquals(r.actions, [{ type: "setBass", target: { x3: 1, yp: 0 } }]);
});

Deno.test("一本指スライドは monzo を移動先で確定する (§6)", () => {
  const chord = toggleNote(null, { x3: 0, yp: 0 }, 1);
  const r = run([
    down(1, 0, 0, 0),
    moveAt(1, 500, 300, 50), // セル (1,0) の中心まで
    up(1, 100),
  ], configFor(chord));
  assertEquals(r.actions, [{ type: "moveNote", from: { x3: 0, yp: 0 }, to: { x3: 1, yp: 0 } }]);
});

Deno.test("monzo のないセルからの一本指スライドは何もしない (§6)", () => {
  const r = run([down(1, 0, 0, 0), moveAt(1, 500, 300, 50), up(1, 100)], configFor(null));
  assertEquals(r.actions, []);
});

Deno.test("monzo の上からの二本指スライドは和音全体を平行移動する (§6)", () => {
  const chord = toggleNote(null, { x3: 0, yp: 0 }, 1);
  // 2 指の重心が 1 セル動くよう、片方を 2 セル分動かす
  const r = run([
    down(1, 0, 0, 0),
    down(2, 0, 0, 20),
    moveAt(1, 600, 300, 50), // 重心は (0,0)→(1,0)
  ], configFor(chord));
  assertEquals(r.actions, [{ type: "translate", dx3: 1, dyp: 0 }]);
  assertEquals(r.pans, []);
});

Deno.test("二本指スライドは第二指を動かしても平行移動する (§6)", () => {
  const chord = toggleNote(null, { x3: 0, yp: 0 }, 1);
  const r = run([
    down(1, 0, 0, 0),
    down(2, 0, 0, 20),
    moveAt(2, 600, 300, 50), // 基準指でなく第二指を動かす
  ], configFor(chord));
  assertEquals(r.actions, [{ type: "translate", dx3: 1, dyp: 0 }]);
});

Deno.test("monzo のないセルからの二本指スライドはパンする (§6)", () => {
  const r = run([
    down(1, 0, 0, 0),
    down(2, 0, 0, 20),
    moveAt(1, 460, 300, 50), // 60px 動かす
  ], configFor(null));
  assertEquals(r.actions, []);
  assertEquals(r.pans.length, 1);
  assert(r.pans[0]!.dx > 0);
});

Deno.test("スライドが元のセルに戻って終わったらトグルしない (中断したドラッグ) (§6)", () => {
  const chord = toggleNote(null, { x3: 0, yp: 0 }, 1);
  const r = run([
    down(1, 0, 0, 0),
    moveAt(1, 500, 300, 30), // (1,0) へ → ドラッグ昇格
    moveAt(1, 400, 300, 60), // (0,0) へ戻る
    up(1, 100),
  ], configFor(chord));
  assertEquals(r.actions, []); // 移動も削除もしない
});

Deno.test("cancel は指を外すがトグル/底音化しない (豆 D&D 昇格 §4.2)", () => {
  const r = run(
    [down(1, 0, 0, 0), { type: "cancel", pointerId: 1, at: 50 }],
    configFor(null),
  );
  assertEquals(r.actions, []);
  assertEquals(r.state.pointers.size, 0);
});

// --- 不変条件 (ランダムなイベント列) ---

type Cmd = Readonly<
  { kind: "down" | "move" | "up" | "cancel" | "tick"; id: number; x: number; y: number; dt: number }
>;

const arbCommands = fc.array(
  fc.record({
    kind: fc.constantFrom("down", "move", "up", "cancel", "tick") as fc.Arbitrary<Cmd["kind"]>,
    id: fc.integer({ min: 1, max: 3 }),
    x: fc.double({ min: 0, max: 800, noNaN: true }),
    y: fc.double({ min: 0, max: 600, noNaN: true }),
    dt: fc.integer({ min: 0, max: 200 }),
  }),
  { maxLength: 40 },
);

const cellAt = (x: number, y: number): TouchTarget => ({
  x3: Math.round((x - 400) / 100),
  yp: Math.round((300 - y) / 100),
});

Deno.test("どんなイベント列でも状態機械の不変条件が保たれる", () => {
  fc.assert(
    fc.property(arbCommands, (commands) => {
      const config = configFor(null);
      let state = INITIAL_LATTICE_GESTURE;
      let at = 0;
      for (const c of commands) {
        at += c.dt;
        const event: LatticeGestureEvent = c.kind === "down"
          ? { type: "down", pointerId: c.id, x: c.x, y: c.y, at, target: cellAt(c.x, c.y) }
          : c.kind === "move"
          ? { type: "move", pointerId: c.id, x: c.x, y: c.y, at }
          : c.kind === "up"
          ? { type: "up", pointerId: c.id, at }
          : c.kind === "cancel"
          ? { type: "cancel", pointerId: c.id, at }
          : { type: "tick", at };
        state = reduceLatticeGesture(state, event, config).state;
        // 指がなければ完全な初期状態
        if (state.pointers.size === 0) {
          assertEquals(state.multi, null);
          assertEquals(state.longPressAt, null);
        }
        // multi は 2 本以上の指があるときのみ
        if (state.multi !== null) assert(state.pointers.size >= 1);
        // longPressAt は単一指のときのみ張られる
        if (state.longPressAt !== null) assert(state.pointers.size >= 1);
      }
    }),
  );
});
