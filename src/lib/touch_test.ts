import { assert, assertEquals } from "@std/assert";
import fc from "fast-check";
import { cellAtPoint, PAN_ZERO, type ViewGeometry } from "./lattice_view.ts";
import {
  cellWithMargin,
  chordOf,
  type GestureConfig,
  type GestureEvent,
  type GestureResult,
  type GestureState,
  INITIAL_GESTURE,
  reduceGesture,
  sameTarget,
  type TouchTarget,
} from "./touch.ts";

/** テスト用ジオメトリ: 横長 800x600、セル 100px。原点セル中心は (400, 300) */
const GEO: ViewGeometry = { width: 800, height: 600, cellSizePx: 100, pan: PAN_ZERO, isWide: true };
const CONFIG: GestureConfig = { batchMs: 100, panThresholdPx: 50, marginFrac: 0.03, geo: GEO };

/** セル (x3, yp) の中心の画面座標 */
const center = (x3: number, yp: number): { x: number; y: number } => ({
  x: 400 + x3 * 100,
  y: 300 - yp * 100,
});

const down = (id: number, x3: number, yp: number, at: number): GestureEvent => ({
  type: "down",
  pointerId: id,
  ...center(x3, yp),
  at,
  target: { x3, yp },
});
const downAt = (id: number, x: number, y: number, at: number): GestureEvent => ({
  type: "down",
  pointerId: id,
  x,
  y,
  at,
  target: cellAtPoint(GEO, x, y),
});
const downBean = (id: number, x3: number, yp: number, bean: 5 | 7, at: number): GestureEvent => ({
  type: "down",
  pointerId: id,
  ...center(x3, yp),
  at,
  target: { x3, yp, bean },
});
const moveAt = (id: number, x: number, y: number, at: number): GestureEvent => ({
  type: "move",
  pointerId: id,
  x,
  y,
  at,
});
const up = (id: number, at: number): GestureEvent => ({ type: "up", pointerId: id, at });
const tick = (at: number): GestureEvent => ({ type: "tick", at });

type RunResult = Readonly<{ state: GestureState; pans: readonly { dx: number; dy: number }[] }>;

const run = (events: readonly GestureEvent[], config = CONFIG): RunResult =>
  events.reduce<RunResult>(
    (acc, e) => {
      const r = reduceGesture(acc.state, e, config);
      return { state: r.state, pans: r.panDelta === null ? acc.pans : [...acc.pans, r.panDelta] };
    },
    { state: INITIAL_GESTURE, pans: [] },
  );

Deno.test("単一タッチはバッチ期間の経過後に和音として確定する (§6.2)", () => {
  const before = run([down(1, 0, 0, 0), tick(99)]);
  assertEquals(before.state.mode, "pending");
  assertEquals(before.state.committed, null);
  const after = run([down(1, 0, 0, 0), tick(100)]);
  assertEquals(after.state.mode, "sounding");
  assertEquals(after.state.committed, {
    notes: [{ target: { x3: 0, yp: 0 }, fingerIds: [1] }],
    bass: { x3: 0, yp: 0 },
  });
});

Deno.test("バッチ期間内の複数タッチは 1 つの和音にまとまり、最初の指が底音 (§6.2, §6.3)", () => {
  const { state } = run([down(1, 1, 0, 0), down(2, 0, 1, 50), tick(100)]);
  assertEquals(state.mode, "sounding");
  assertEquals(state.committed?.notes.length, 2);
  assertEquals(state.committed?.bass, { x3: 1, yp: 0 });
});

Deno.test("底音の指を離すと、残りで最初にタッチしていた指が底音を引き継ぐ (§6.5)", () => {
  const { state } = run([
    down(1, 0, 0, 0),
    down(2, 1, 0, 50),
    down(3, 0, 1, 60),
    tick(100),
    up(1, 200),
    tick(300),
  ]);
  assertEquals(state.mode, "sounding");
  assertEquals(state.committed?.bass, { x3: 1, yp: 0 });
});

Deno.test("再タッチした指は元のタッチ時刻で底音を取り戻す (§6.5)", () => {
  const { state } = run([
    down(1, 0, 0, 0),
    down(2, 1, 0, 50),
    tick(100),
    up(1, 200), // 底音 1 を離す → 2 が底音に
    tick(300),
    down(1, 2, 0, 400), // 1 を再タッチ (時刻 0 の記憶が勝つ)
    tick(500),
  ]);
  assertEquals(state.committed?.bass, { x3: 2, yp: 0 });
});

Deno.test("全部離して和音が終わるとタッチ時刻の記憶はリセットされる", () => {
  const { state } = run([
    down(1, 0, 0, 0),
    tick(100),
    up(1, 200),
    tick(300), // idle に戻る
    down(2, 1, 0, 400),
    down(1, 0, 0, 450), // 指 1 の古い時刻は忘れられている
    tick(500),
  ]);
  assertEquals(state.committed?.bass, { x3: 1, yp: 0 });
});

Deno.test("バッチ期間中に単独の指が閾値を超えて動くとパンになり和音は鳴らない (§6.6)", () => {
  const result = run([
    downAt(1, 400, 300, 0),
    moveAt(1, 460, 300, 50), // 60px > 50px
    tick(100),
    moveAt(1, 480, 310, 150),
    up(1, 200),
  ]);
  assertEquals(result.state.mode, "idle");
  assertEquals(result.state.committed, null);
  assertEquals(result.pans, [{ dx: 60, dy: 0 }, { dx: 20, dy: 10 }]);
});

Deno.test("閾値未満の移動ではパンにならず和音が確定する (§6.6)", () => {
  const result = run([downAt(1, 400, 300, 0), moveAt(1, 430, 300, 50), tick(100)]);
  assertEquals(result.state.mode, "sounding");
  assertEquals(result.pans, []);
});

Deno.test("2 本以上タッチした窓ではパンに切り替わらない (§6.6)", () => {
  const result = run([
    downAt(1, 400, 300, 0),
    down(2, 1, 1, 30),
    moveAt(1, 600, 300, 50), // 大きく動かしてもパンしない
    tick(100),
  ]);
  assertEquals(result.state.mode, "sounding");
  assertEquals(result.pans, []);
});

Deno.test("発音中のセル移動はバッチされ、窓の終わりに和音が変わる (§6.2, §6.4)", () => {
  const slide = [
    down(1, 0, 0, 0),
    tick(100),
    moveAt(1, 510, 300, 200), // セル (1,0) の枠から 10px (3% = 3px 以上) 内側
  ];
  const during = run([...slide, tick(250)]); // 窓 (200〜300) の途中
  assertEquals(during.state.mode, "pending");
  assertEquals(during.state.committed?.notes, [{ target: { x3: 0, yp: 0 }, fingerIds: [1] }]);
  const after = run([...slide, tick(300)]);
  assertEquals(after.state.mode, "sounding");
  assertEquals(after.state.committed?.notes, [{ target: { x3: 1, yp: 0 }, fingerIds: [1] }]);
});

Deno.test("移動で開いた窓は後続の移動で延長されない (§6.2)", () => {
  const { state } = run([
    down(1, 0, 0, 0),
    tick(100),
    moveAt(1, 510, 300, 200), // (1,0) へ。窓は 200〜300
    moveAt(1, 610, 300, 290), // 窓の中でさらに (2,0) へ
    tick(300),
  ]);
  assertEquals(state.mode, "sounding");
  assertEquals(state.committed?.notes, [{ target: { x3: 2, yp: 0 }, fingerIds: [1] }]);
});

Deno.test("マージンより浅い移動ではセルが変わらず窓も開かない (§6.4)", () => {
  const shallow = run([
    down(1, 0, 0, 0),
    tick(100),
    moveAt(1, 452, 300, 200), // セル (1,0) に入ったが枠から 2px (< 3px)
  ]);
  assertEquals(shallow.state.mode, "sounding");
  assertEquals(shallow.state.committed?.notes, [{ target: { x3: 0, yp: 0 }, fingerIds: [1] }]);
});

Deno.test("発音中の down/up で開く窓の間は前の和音が鳴り続ける (§6.2)", () => {
  const { state } = run([down(1, 0, 0, 0), tick(100), down(2, 1, 0, 200), tick(250)]);
  // 2 本目の down 直後〜窓の終わりまでは前の和音のまま
  assertEquals(state.committed?.notes, [{ target: { x3: 0, yp: 0 }, fingerIds: [1] }]);
  const after = run([down(1, 0, 0, 0), tick(100), down(2, 1, 0, 200), tick(300)]);
  assertEquals(after.state.committed?.notes.length, 2);
});

// --- cellWithMargin のプロパティ ---

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

// --- 状態機械の不変条件 (ランダムなイベント列) ---

type Command = Readonly<
  { kind: "down" | "move" | "up" | "tick"; id: number; x: number; y: number; dt: number }
>;

const arbCommands: fc.Arbitrary<readonly Command[]> = fc.array(
  fc.record({
    kind: fc.constantFrom("down", "move", "up", "tick") as fc.Arbitrary<Command["kind"]>,
    id: fc.integer({ min: 1, max: 3 }),
    x: fc.double({ min: 0, max: 800, noNaN: true }),
    y: fc.double({ min: 0, max: 600, noNaN: true }),
    dt: fc.integer({ min: 0, max: 120 }),
  }),
  { maxLength: 40 },
);

const toEvent = (c: Command, at: number): GestureEvent =>
  c.kind === "down"
    ? { type: "down", pointerId: c.id, x: c.x, y: c.y, at, target: cellAtPoint(GEO, c.x, c.y) }
    : c.kind === "move"
    ? { type: "move", pointerId: c.id, x: c.x, y: c.y, at }
    : c.kind === "up"
    ? { type: "up", pointerId: c.id, at }
    : { type: "tick", at };

const assertInvariants = (s: GestureState): void => {
  assertEquals(s.mode === "pending", s.windowEndsAt !== null, "pending ⇔ 窓が開いている");
  if (s.mode === "idle") {
    assertEquals(s.active.size, 0);
    assertEquals(s.committed, null);
    assertEquals(s.firstTouchTimes.size, 0);
  }
  if (s.mode === "panning") {
    assertEquals(s.active.size, 0);
    assertEquals(s.committed, null);
    assert(s.panLast !== null);
  }
  if (s.mode === "sounding") {
    assert(s.committed !== null && s.active.size > 0);
  }
  if (s.committed !== null) {
    const { notes, bass } = s.committed;
    assert(notes.some((n) => sameTarget(n.target, bass)), "底音は和音の構成音");
    assert(
      notes.every((n, i) => notes.findIndex((m) => sameTarget(m.target, n.target)) === i),
      "構成音は重複しない",
    );
  }
  for (const id of s.active.keys()) {
    assert(s.firstTouchTimes.has(id), "タッチ中の指は最初のタッチ時刻を持つ");
  }
  if (s.panEligible) assertEquals(s.mode, "pending");
};

Deno.test("どんなイベント列でも状態機械の不変条件が保たれる", () => {
  fc.assert(
    fc.property(arbCommands, (commands) => {
      let result: GestureResult = { state: INITIAL_GESTURE, panDelta: null };
      let at = 0;
      for (const c of commands) {
        at += c.dt;
        result = reduceGesture(result.state, toEvent(c, at), CONFIG);
        assertInvariants(result.state);
      }
    }),
  );
});

Deno.test("chordOf: 底音はタッチ中で最初のタッチ時刻が最古の指", () => {
  const arbTouches = fc
    .uniqueArray(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 8 })
    .chain((ids) =>
      fc.record({
        ids: fc.constant(ids),
        times: fc.array(fc.integer({ min: 0, max: 1000 }), {
          minLength: ids.length,
          maxLength: ids.length,
        }),
        cells: fc.array(arbCell, { minLength: ids.length, maxLength: ids.length }),
      })
    );
  fc.assert(
    fc.property(arbTouches, ({ ids, times, cells }) => {
      const firstTouchTimes = new Map(ids.map((id, i) => [id, times[i] ?? 0]));
      const active = new Map(ids.map((id, i) => [id, cells[i] ?? { x3: 0, yp: 0 }]));
      const chord = chordOf(active, firstTouchTimes);
      assert(chord !== null);
      const minTime = Math.min(...times);
      const earliest = ids.filter((id) => firstTouchTimes.get(id) === minTime);
      assert(
        earliest.some((id) => {
          const target = active.get(id);
          return target !== undefined && sameTarget(chord.bass, target);
        }),
        "底音は最古の指のセル",
      );
      // 各指はちょうど 1 つの構成音に属し、その構成音は指のセルと一致する
      for (const [id, target] of active) {
        const owners = chord.notes.filter((n) => n.fingerIds.includes(id));
        assertEquals(owners.length, 1);
        assert(owners[0] !== undefined && sameTarget(owners[0].target, target));
      }
    }),
  );
});

// --- 豆のタッチ (§4.4) ---

Deno.test("豆のタッチは豆つきの対象として和音に入る (§4.4)", () => {
  const { state } = run([down(1, 0, 0, 0), downBean(2, 1, 0, 7, 50), tick(100)]);
  assertEquals(state.committed?.notes.length, 2);
  assert(
    state.committed?.notes.some((n) => n.target.bean === 7 && n.target.x3 === 1),
    "豆 7 の構成音がある",
  );
});

Deno.test("豆の上から始まったタッチは大きく動いてもパンにならない", () => {
  const result = run([
    downBean(1, 0, 0, 5, 0),
    moveAt(1, 600, 300, 50),
    tick(100),
  ]);
  assert(result.state.mode !== "panning");
  assertEquals(result.pans, []);
});

Deno.test("豆つきの指がセル内で動いても豆は外れない (§6.4)", () => {
  const { state } = run([
    downBean(1, 0, 0, 5, 0),
    tick(100),
    moveAt(1, 420, 320, 200), // セル (0,0) 内の移動
  ]);
  assertEquals(state.committed?.notes[0]?.target, { x3: 0, yp: 0, bean: 5 });
});
