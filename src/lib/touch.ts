/**
 * タッチ処理の純粋ロジック (仕様 §6)。
 *
 * pointer イベント列 (タイムスタンプ付き) を畳み込む状態機械。時刻は
 * イベントの引数で受け取り、バッチ期限のタイマーは呼び出し側 (RxJS アダプタ) が
 * windowEndsAt に合わせて tick イベントを注入する。
 *
 * - バッチ化 (§6.2): 最初の down/up から batchMs の間、和音の変更を保留する。
 *   窓の中のイベントは窓を延長しない。窓の終わりに正味の状態を確定 (発音) する。
 * - 底音 (§6.3, §6.5): 指ごとに最初のタッチ時刻を記憶し、タッチ中で最古の指が底音。
 *   記憶は和音が完全に終わる (idle に戻る) まで保持するので、再タッチした指は
 *   元の時刻で底音を取り戻す。
 * - セル移動 (§6.4): 移動先セルの枠から 3% より中に入って初めて移動と判定。
 *   発音中の移動は即時に和音を変える (バッチしない)。
 * - パン (§6.6): タッチなしの状態から開いた窓の間に、単独の指が閾値を超えて
 *   動いたら和音を作らずパンに切り替える。
 */

import { cellAtPoint, cellRect, type ViewGeometry } from "./lattice_view.ts";

/** タッチ対象。今はセルのみ (豆 (§4) の実装時に素数の追加を拡張する) */
export type TouchTarget = Readonly<{ x3: number; yp: number }>;

export const sameTarget = (a: TouchTarget, b: TouchTarget): boolean =>
  a.x3 === b.x3 && a.yp === b.yp;

export type Chord = Readonly<{
  /** 発音する対象 (同一セルの重複は除く) */
  notes: readonly TouchTarget[];
  /** 底音 (notes のいずれか) */
  bass: TouchTarget;
}>;

export type GestureMode = "idle" | "pending" | "sounding" | "panning";

export type GestureState = Readonly<{
  mode: GestureMode;
  /** バッチ窓の期限。pending のときのみ非 null */
  windowEndsAt: number | null;
  /** 指 (pointerId) ごとの最初のタッチ時刻 (§6.5)。idle に戻るときリセット */
  firstTouchTimes: ReadonlyMap<number, number>;
  /** タッチ中の指 → 対象セル */
  active: ReadonlyMap<number, TouchTarget>;
  /** 発音中の和音 (バッチ確定済み)。§6.4 の移動だけは即時反映される */
  committed: Chord | null;
  /** この窓が §6.6 のパン開始になりうるか (idle から単指で開いた窓のみ) */
  panEligible: boolean;
  /** 窓を開いた最初の down の位置 (パン判定の基準) */
  firstDown: Readonly<{ pointerId: number; x: number; y: number }> | null;
  /** パン中の指と最後の位置 */
  panLast: Readonly<{ pointerId: number; x: number; y: number }> | null;
}>;

export const INITIAL_GESTURE: GestureState = {
  mode: "idle",
  windowEndsAt: null,
  firstTouchTimes: new Map(),
  active: new Map(),
  committed: null,
  panEligible: false,
  firstDown: null,
  panLast: null,
};

export type GestureEvent =
  | Readonly<{ type: "down"; pointerId: number; x: number; y: number; at: number }>
  | Readonly<{ type: "move"; pointerId: number; x: number; y: number; at: number }>
  | Readonly<{ type: "up"; pointerId: number; at: number }>
  | Readonly<{ type: "tick"; at: number }>;

export type GestureConfig = Readonly<{
  batchMs: number;
  panThresholdPx: number;
  /** セル移動判定のマージン (セルサイズ比、§6.4 では 0.03) */
  marginFrac: number;
  geo: ViewGeometry;
}>;

/** §6.4 のセル移動判定マージン */
export const CELL_MOVE_MARGIN = 0.03;

export type GestureResult = Readonly<{
  state: GestureState;
  /** パンによる画面移動量 (px)。パンでなければ null */
  panDelta: Readonly<{ dx: number; dy: number }> | null;
}>;

const mapSet = <K, V>(m: ReadonlyMap<K, V>, k: K, v: V): ReadonlyMap<K, V> => new Map(m).set(k, v);

const mapDelete = <K, V>(m: ReadonlyMap<K, V>, k: K): ReadonlyMap<K, V> => {
  const next = new Map(m);
  next.delete(k);
  return next;
};

const still = (state: GestureState): GestureResult => ({ state, panDelta: null });

/** タッチ中の指から和音を導く。底音は最初のタッチ時刻が最古の指 (§6.3, §6.5) */
export const chordOf = (
  active: ReadonlyMap<number, TouchTarget>,
  firstTouchTimes: ReadonlyMap<number, number>,
): Chord | null => {
  const ids = [...active.keys()];
  if (ids.length === 0) return null;
  const bassId = ids.reduce((best, id) => {
    const t = firstTouchTimes.get(id) ?? Infinity;
    const tBest = firstTouchTimes.get(best) ?? Infinity;
    return t < tBest || (t === tBest && id < best) ? id : best;
  });
  const bass = active.get(bassId);
  if (bass === undefined) return null;
  const values = [...active.values()];
  const notes = values.filter((t, i) => values.findIndex((u) => sameTarget(u, t)) === i);
  return { notes, bass };
};

/**
 * セル移動のマージン判定 (§6.4)。
 * 点が現在のセルの外でも、移動先セルの枠から marginFrac · セルサイズ
 * より中に入っていなければ現在のセルに留まる。
 */
export const cellWithMargin = (
  geo: ViewGeometry,
  current: TouchTarget,
  px: number,
  py: number,
  marginFrac: number,
): TouchTarget => {
  const hit = cellAtPoint(geo, px, py);
  if (sameTarget(hit, current)) return current;
  const s = geo.cellSizePx;
  const { left, top } = cellRect(geo, hit.x3, hit.yp);
  const depth = Math.min(px - left, left + s - px, py - top, top + s - py);
  return depth >= marginFrac * s ? hit : current;
};

const onDown = (
  state: GestureState,
  event: Extract<GestureEvent, { type: "down" }>,
  config: GestureConfig,
): GestureResult => {
  if (state.mode === "panning" || state.active.has(event.pointerId)) return still(state);
  const firstTouchTimes = state.firstTouchTimes.has(event.pointerId)
    ? state.firstTouchTimes
    : mapSet(state.firstTouchTimes, event.pointerId, event.at);
  const active = mapSet(
    state.active,
    event.pointerId,
    cellAtPoint(config.geo, event.x, event.y),
  );
  if (state.mode === "idle") {
    return still({
      ...state,
      mode: "pending",
      windowEndsAt: event.at + config.batchMs,
      firstTouchTimes,
      active,
      panEligible: true,
      firstDown: { pointerId: event.pointerId, x: event.x, y: event.y },
    });
  }
  if (state.mode === "pending") {
    // 窓は延長しない (§6.2 は「最初の」イベントから)
    return still({ ...state, firstTouchTimes, active, panEligible: false });
  }
  // sounding: 新しい窓を開く
  return still({
    ...state,
    mode: "pending",
    windowEndsAt: event.at + config.batchMs,
    firstTouchTimes,
    active,
    panEligible: false,
    firstDown: null,
  });
};

const onUp = (
  state: GestureState,
  event: Extract<GestureEvent, { type: "up" }>,
  config: GestureConfig,
): GestureResult => {
  if (state.mode === "panning") {
    return state.panLast?.pointerId === event.pointerId ? still(INITIAL_GESTURE) : still(state);
  }
  if (!state.active.has(event.pointerId)) return still(state);
  const active = mapDelete(state.active, event.pointerId);
  if (state.mode === "pending") {
    return still({ ...state, active, panEligible: false });
  }
  // sounding: 新しい窓を開く (窓の間は前の和音が鳴り続ける)
  return still({
    ...state,
    mode: "pending",
    windowEndsAt: event.at + config.batchMs,
    active,
    panEligible: false,
    firstDown: null,
  });
};

const onMove = (
  state: GestureState,
  event: Extract<GestureEvent, { type: "move" }>,
  config: GestureConfig,
): GestureResult => {
  if (state.mode === "panning") {
    if (state.panLast?.pointerId !== event.pointerId) return still(state);
    const panDelta = { dx: event.x - state.panLast.x, dy: event.y - state.panLast.y };
    return {
      state: { ...state, panLast: { pointerId: event.pointerId, x: event.x, y: event.y } },
      panDelta,
    };
  }
  const current = state.active.get(event.pointerId);
  if (current === undefined) return still(state);
  // §6.6: タッチなしから開いた窓の間、単独の指が閾値を超えて動いたらパンに切り替え
  if (
    state.mode === "pending" &&
    state.panEligible &&
    state.firstDown !== null &&
    state.firstDown.pointerId === event.pointerId &&
    state.active.size === 1
  ) {
    const dx = event.x - state.firstDown.x;
    const dy = event.y - state.firstDown.y;
    if (Math.hypot(dx, dy) > config.panThresholdPx) {
      return {
        state: {
          ...INITIAL_GESTURE,
          mode: "panning",
          panLast: { pointerId: event.pointerId, x: event.x, y: event.y },
        },
        panDelta: { dx, dy },
      };
    }
  }
  const next = cellWithMargin(config.geo, current, event.x, event.y, config.marginFrac);
  if (sameTarget(next, current)) return still(state);
  const active = mapSet(state.active, event.pointerId, next);
  if (state.mode === "sounding") {
    // §6.4: 発音中の移動は即時反映
    return still({ ...state, active, committed: chordOf(active, state.firstTouchTimes) });
  }
  return still({ ...state, active });
};

const onTick = (
  state: GestureState,
  event: Extract<GestureEvent, { type: "tick" }>,
): GestureResult => {
  if (state.windowEndsAt === null || event.at < state.windowEndsAt) return still(state);
  if (state.active.size === 0) {
    // 和音の完全な終了。最初のタッチ時刻の記憶もここでリセットする
    return still(INITIAL_GESTURE);
  }
  return still({
    ...state,
    mode: "sounding",
    windowEndsAt: null,
    committed: chordOf(state.active, state.firstTouchTimes),
    panEligible: false,
    firstDown: null,
  });
};

export const reduceGesture = (
  state: GestureState,
  event: GestureEvent,
  config: GestureConfig,
): GestureResult => {
  switch (event.type) {
    case "down":
      return onDown(state, event, config);
    case "up":
      return onUp(state, event, config);
    case "move":
      return onMove(state, event, config);
    case "tick":
      return onTick(state, event);
  }
};
