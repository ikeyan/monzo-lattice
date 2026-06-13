/**
 * 格子のジェスチャ認識 (仕様 §6.8)。
 *
 * pointer イベント列を畳み込み、永続的な和音の編集アクションとパン量を出す
 * 純粋な状態機械。ロングタップ判定のタイマーは呼び出し側が longPressAt に
 * 合わせて tick を注入する (バッチではなく、単に押しっぱなしの検出)。
 *
 * ジェスチャ (§6):
 * - タップ (動かず離す): monzo の存在をトグル。最初の monzo が底音。
 * - 二本指タップ / ロングタップ: そのセルを底音化。すでに底音なら、底音制約を
 *   外したときコスト最適なセルを底音にする (optimizeBass)。豆はロングタップのみ。
 * - 一本指スライド (monzo の上から): その monzo を平行移動 (離した先で確定)。
 * - 二本指スライド (monzo の上から): 和音全体を平行移動 (マージン考慮)。
 * - 二本指スライド (monzo のないセルから): 格子をパン。
 */

import { cellWithMargin, sameCell, type TouchTarget } from "./touch.ts";
import type { ViewGeometry } from "./lattice_view.ts";

export type LatticeGestureEvent =
  | Readonly<
    { type: "down"; pointerId: number; x: number; y: number; at: number; target: TouchTarget }
  >
  | Readonly<{ type: "move"; pointerId: number; x: number; y: number; at: number }>
  | Readonly<{ type: "up"; pointerId: number; at: number }>
  | Readonly<{ type: "tick"; at: number }>;

/** 和音の編集アクション (呼び出し側が chord_edit に適用する) */
export type LatticeAction =
  | Readonly<{ type: "toggle"; target: TouchTarget }>
  | Readonly<{ type: "setBass"; target: TouchTarget }>
  | Readonly<{ type: "optimizeBass" }>
  | Readonly<{ type: "moveNote"; from: TouchTarget; to: TouchTarget }>
  | Readonly<{ type: "translate"; dx3: number; dyp: number }>;

export type LatticeGestureConfig = Readonly<{
  geo: ViewGeometry;
  /** セル移動判定のマージン (§6.4) */
  marginFrac: number;
  /** ロングタップとみなす押下時間 (ms) */
  longPressMs: number;
  /** スライド開始とみなす移動距離 (px) */
  slopPx: number;
  /** その target が現在の和音の構成音か */
  hasTarget: (target: TouchTarget) => boolean;
  /** そのセルに (豆も含め) 構成音があるか */
  cellHasMonzo: (x3: number, yp: number) => boolean;
  /** その target が現在の底音か */
  isBass: (target: TouchTarget) => boolean;
}>;

type Cell = Readonly<{ x3: number; yp: number }>;

type Ptr = Readonly<{
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  startTarget: TouchTarget;
  /** 一本指 monzo スライドの現在の移動先セル */
  destCell: Cell;
  /** タップでなくなった (動いた・消費された) か */
  moved: boolean;
  /** タップ/ロングタップを抑止する (スライド昇格・多指・発火済み) */
  consumed: boolean;
  /** 一本指 monzo スライド中か */
  dragging: boolean;
}>;

type Multi = Readonly<{
  refId: number;
  /** 二本指タップの底音化対象 (最初の指の開始 target) */
  anchorTarget: TouchTarget;
  /** ジェスチャが monzo の上で始まったか (真ならスライドで和音移動、偽ならパン) */
  onMonzo: boolean;
  mode: "undecided" | "chordMove" | "pan";
  /** 和音移動用: 基準指の現在セル */
  lastCell: Cell;
  /** パン用: 基準指の現在位置 */
  lastX: number;
  lastY: number;
}>;

export type LatticeGestureState = Readonly<{
  pointers: ReadonlyMap<number, Ptr>;
  multi: Multi | null;
  /** ロングタップの期限 (単一指のみ)。呼び出し側がここに合わせて tick する */
  longPressAt: number | null;
}>;

export const INITIAL_LATTICE_GESTURE: LatticeGestureState = {
  pointers: new Map(),
  multi: null,
  longPressAt: null,
};

export type LatticeGestureResult = Readonly<{
  state: LatticeGestureState;
  actions: readonly LatticeAction[];
  panDelta: Readonly<{ dx: number; dy: number }> | null;
}>;

const cellOf = (t: TouchTarget): Cell => ({ x3: t.x3, yp: t.yp });

const none = (state: LatticeGestureState): LatticeGestureResult => ({
  state,
  actions: [],
  panDelta: null,
});

const mapSet = (m: ReadonlyMap<number, Ptr>, id: number, p: Ptr): Map<number, Ptr> =>
  new Map(m).set(id, p);

/** 底音化アクション: すでに底音なら最適化、そうでなければ底音にする */
const bassAction = (config: LatticeGestureConfig, target: TouchTarget): readonly LatticeAction[] =>
  config.hasTarget(target)
    ? [config.isBass(target) ? { type: "optimizeBass" } : { type: "setBass", target }]
    : [];

const onDown = (
  state: LatticeGestureState,
  event: Extract<LatticeGestureEvent, { type: "down" }>,
  config: LatticeGestureConfig,
): LatticeGestureResult => {
  if (state.pointers.has(event.pointerId)) return none(state);
  const ptr: Ptr = {
    startX: event.x,
    startY: event.y,
    curX: event.x,
    curY: event.y,
    startTarget: event.target,
    destCell: cellOf(event.target),
    moved: false,
    consumed: false,
    dragging: false,
  };

  if (state.pointers.size === 0) {
    // 1 本目: ロングタップのタイマーを張る
    return none({
      pointers: mapSet(state.pointers, event.pointerId, ptr),
      multi: null,
      longPressAt: event.at + config.longPressMs,
    });
  }

  if (state.pointers.size === 1 && state.multi === null) {
    // 2 本目: 二本指ジェスチャを開始 (タップ抑止・ロングタップ解除)
    const [firstId, first] = [...state.pointers.entries()][0]!;
    const onMonzo = config.cellHasMonzo(first.startTarget.x3, first.startTarget.yp) ||
      config.cellHasMonzo(event.target.x3, event.target.yp);
    const pointers = new Map<number, Ptr>();
    pointers.set(firstId, { ...first, consumed: true });
    pointers.set(event.pointerId, { ...ptr, consumed: true });
    return none({
      pointers,
      multi: {
        refId: firstId,
        anchorTarget: first.startTarget,
        onMonzo,
        mode: "undecided",
        lastCell: cellOf(first.startTarget),
        lastX: first.curX,
        lastY: first.curY,
      },
      longPressAt: null,
    });
  }

  // 3 本目以降: 追跡のみ (消費)
  return none({
    ...state,
    pointers: mapSet(state.pointers, event.pointerId, { ...ptr, consumed: true }),
    longPressAt: null,
  });
};

const onMove = (
  state: LatticeGestureState,
  event: Extract<LatticeGestureEvent, { type: "move" }>,
  config: LatticeGestureConfig,
): LatticeGestureResult => {
  const ptr = state.pointers.get(event.pointerId);
  if (ptr === undefined) return none(state);
  const moved = { ...ptr, curX: event.x, curY: event.y };
  const pointers = mapSet(state.pointers, event.pointerId, moved);

  // 二本指ジェスチャ: 基準指の移動で和音移動またはパン
  if (state.multi !== null) {
    const multi = state.multi;
    if (event.pointerId !== multi.refId) return none({ ...state, pointers });
    let mode = multi.mode;
    if (mode === "undecided") {
      const farEnough = Math.hypot(event.x - moved.startX, event.y - moved.startY) > config.slopPx;
      if (!farEnough) return none({ ...state, pointers });
      mode = multi.onMonzo ? "chordMove" : "pan";
    }
    if (mode === "chordMove") {
      const next = cellWithMargin(
        config.geo,
        { x3: multi.lastCell.x3, yp: multi.lastCell.yp },
        event.x,
        event.y,
        config.marginFrac,
      );
      if (sameCell(next, multi.lastCell)) {
        return none({ ...state, pointers, multi: { ...multi, mode } });
      }
      return {
        state: { ...state, pointers, multi: { ...multi, mode, lastCell: cellOf(next) } },
        actions: [{
          type: "translate",
          dx3: next.x3 - multi.lastCell.x3,
          dyp: next.yp - multi.lastCell.yp,
        }],
        panDelta: null,
      };
    }
    // pan
    return {
      state: {
        ...state,
        pointers,
        multi: { ...multi, mode, lastX: event.x, lastY: event.y },
      },
      actions: [],
      panDelta: { dx: event.x - multi.lastX, dy: event.y - multi.lastY },
    };
  }

  // 一本指
  if (moved.consumed) return none({ ...state, pointers });
  if (moved.dragging) {
    // monzo スライド継続: 移動先セルだけ更新 (確定は up)
    const next = cellWithMargin(
      config.geo,
      { x3: moved.destCell.x3, yp: moved.destCell.yp },
      event.x,
      event.y,
      config.marginFrac,
    );
    return none({
      ...state,
      pointers: mapSet(pointers, event.pointerId, { ...moved, destCell: cellOf(next) }),
      longPressAt: null,
    });
  }
  const newCell = cellWithMargin(
    config.geo,
    { x3: moved.startTarget.x3, yp: moved.startTarget.yp },
    event.x,
    event.y,
    config.marginFrac,
  );
  const crossed = !sameCell(newCell, cellOf(moved.startTarget));
  const farEnough = Math.hypot(event.x - moved.startX, event.y - moved.startY) > config.slopPx;
  if (!crossed && !farEnough) return none({ ...state, pointers });
  // 動いた → タップではない。monzo (平セル) の上からならスライド昇格
  const startsOnMonzo = moved.startTarget.bean === undefined && config.hasTarget(moved.startTarget);
  const next: Ptr = startsOnMonzo && crossed
    ? { ...moved, moved: true, dragging: true, destCell: cellOf(newCell) }
    : { ...moved, moved: true };
  return none({
    ...state,
    pointers: mapSet(pointers, event.pointerId, next),
    longPressAt: null,
  });
};

const onUp = (
  state: LatticeGestureState,
  event: Extract<LatticeGestureEvent, { type: "up" }>,
  config: LatticeGestureConfig,
): LatticeGestureResult => {
  const ptr = state.pointers.get(event.pointerId);
  const pointers = new Map(state.pointers);
  pointers.delete(event.pointerId);
  if (ptr === undefined) {
    return none(pointers.size === 0 ? INITIAL_LATTICE_GESTURE : { ...state, pointers });
  }

  if (state.multi !== null) {
    const multi = state.multi;
    // 動かずに離した二本指 = 二本指タップ → 底音化
    const actions = multi.mode === "undecided" ? bassAction(config, multi.anchorTarget) : [];
    // 残る指は消費して、後続のタップを抑止する
    for (const [pid, p] of pointers) pointers.set(pid, { ...p, consumed: true });
    return {
      state: pointers.size === 0
        ? INITIAL_LATTICE_GESTURE
        : { pointers, multi: null, longPressAt: null },
      actions,
      panDelta: null,
    };
  }

  // 一本指
  const actions: LatticeAction[] = [];
  if (!ptr.consumed) {
    if (ptr.dragging && ptr.moved) {
      const to: TouchTarget = { x3: ptr.destCell.x3, yp: ptr.destCell.yp };
      if (!sameCell(to, ptr.startTarget)) {
        actions.push({ type: "moveNote", from: ptr.startTarget, to });
      } else {
        actions.push({ type: "toggle", target: ptr.startTarget });
      }
    } else if (!ptr.moved) {
      actions.push({ type: "toggle", target: ptr.startTarget });
    }
  }
  return {
    state: pointers.size === 0
      ? INITIAL_LATTICE_GESTURE
      : { pointers, multi: state.multi, longPressAt: state.longPressAt },
    actions,
    panDelta: null,
  };
};

const onTick = (
  state: LatticeGestureState,
  event: Extract<LatticeGestureEvent, { type: "tick" }>,
  config: LatticeGestureConfig,
): LatticeGestureResult => {
  if (state.longPressAt === null || event.at < state.longPressAt) return none(state);
  if (state.pointers.size !== 1 || state.multi !== null) {
    return none({ ...state, longPressAt: null });
  }
  const [id, ptr] = [...state.pointers.entries()][0]!;
  if (ptr.moved || ptr.consumed) return none({ ...state, longPressAt: null });
  // ロングタップ: 底音化 (monzo のない場所では何もしないが、タップにもしない)
  const actions = bassAction(config, ptr.startTarget);
  return {
    state: {
      pointers: mapSet(state.pointers, id, { ...ptr, consumed: true, moved: true }),
      multi: null,
      longPressAt: null,
    },
    actions,
    panDelta: null,
  };
};

export const reduceLatticeGesture = (
  state: LatticeGestureState,
  event: LatticeGestureEvent,
  config: LatticeGestureConfig,
): LatticeGestureResult => {
  switch (event.type) {
    case "down":
      return onDown(state, event, config);
    case "move":
      return onMove(state, event, config);
    case "up":
      return onUp(state, event, config);
    case "tick":
      return onTick(state, event, config);
  }
};
