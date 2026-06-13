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
import { cellAtPoint, type ViewGeometry } from "./lattice_view.ts";

export type LatticeGestureEvent =
  | Readonly<
    { type: "down"; pointerId: number; x: number; y: number; at: number; target: TouchTarget }
  >
  | Readonly<{ type: "move"; pointerId: number; x: number; y: number; at: number }>
  | Readonly<{ type: "up"; pointerId: number; at: number }>
  // cancel は指のタップ/ロングタップを取り消す (豆が D&D に昇格したとき §4.2)
  | Readonly<{ type: "cancel"; pointerId: number; at: number }>
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
  /** ジェスチャを成す 2 本の指。どちらの指が動いても重心で追従する */
  ids: readonly number[];
  /** 二本指タップの底音化対象 (最初の指の開始 target) */
  anchorTarget: TouchTarget;
  /** ジェスチャが monzo の上で始まったか (真ならスライドで和音移動、偽ならパン) */
  onMonzo: boolean;
  mode: "undecided" | "chordMove" | "pan";
  /** スライド開始判定の基準 (開始時の 2 指の重心) */
  startX: number;
  startY: number;
  /** 和音移動用: 直近の重心セル */
  lastCell: Cell;
  /** パン用: 直近の重心位置 */
  lastX: number;
  lastY: number;
}>;

/** 指 ids の重心 (現在位置) */
const centroidOf = (
  pointers: ReadonlyMap<number, Ptr>,
  ids: readonly number[],
): { cx: number; cy: number } => {
  const ps = ids.map((id) => pointers.get(id)).filter((p): p is Ptr => p !== undefined);
  const n = Math.max(1, ps.length);
  return {
    cx: ps.reduce((s, p) => s + p.curX, 0) / n,
    cy: ps.reduce((s, p) => s + p.curY, 0) / n,
  };
};

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
    const cx = (first.curX + event.x) / 2;
    const cy = (first.curY + event.y) / 2;
    return none({
      pointers,
      multi: {
        ids: [firstId, event.pointerId],
        anchorTarget: first.startTarget,
        onMonzo,
        mode: "undecided",
        startX: cx,
        startY: cy,
        lastCell: cellAtPoint(config.geo, cx, cy),
        lastX: cx,
        lastY: cy,
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

  // 二本指ジェスチャ: どちらの指が動いても 2 指の重心で和音移動またはパン
  if (state.multi !== null) {
    const multi = state.multi;
    if (!multi.ids.includes(event.pointerId)) return none({ ...state, pointers });
    const { cx, cy } = centroidOf(pointers, multi.ids);
    let mode = multi.mode;
    if (mode === "undecided") {
      const farEnough = Math.hypot(cx - multi.startX, cy - multi.startY) > config.slopPx;
      if (!farEnough) return none({ ...state, pointers });
      mode = multi.onMonzo ? "chordMove" : "pan";
    }
    if (mode === "chordMove") {
      const next = cellWithMargin(
        config.geo,
        { x3: multi.lastCell.x3, yp: multi.lastCell.yp },
        cx,
        cy,
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
        multi: { ...multi, mode, lastX: cx, lastY: cy },
      },
      actions: [],
      panDelta: { dx: cx - multi.lastX, dy: cy - multi.lastY },
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
      // スライドが別セルで終わったら移動。元のセルに戻って終わったら何もしない
      // (中断したドラッグで誤ってノートを消さない)
      const to: TouchTarget = { x3: ptr.destCell.x3, yp: ptr.destCell.yp };
      if (!sameCell(to, ptr.startTarget)) {
        actions.push({ type: "moveNote", from: ptr.startTarget, to });
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

/** 取り消し: その指を外し、タップ/ロングタップを発火しない (§4.2 の豆 D&D 昇格) */
const onCancel = (
  state: LatticeGestureState,
  event: Extract<LatticeGestureEvent, { type: "cancel" }>,
): LatticeGestureResult => {
  const ptr = state.pointers.get(event.pointerId);
  const pointers = new Map(state.pointers);
  pointers.delete(event.pointerId);
  if (ptr === undefined) {
    return none(pointers.size === 0 ? INITIAL_LATTICE_GESTURE : { ...state, pointers });
  }
  if (state.multi !== null && state.multi.ids.includes(event.pointerId)) {
    // 二本指の片方が取り消されたらジェスチャ終了 (底音化はしない)
    for (const [pid, p] of pointers) pointers.set(pid, { ...p, consumed: true });
    return none(
      pointers.size === 0 ? INITIAL_LATTICE_GESTURE : { pointers, multi: null, longPressAt: null },
    );
  }
  return none(
    pointers.size === 0
      ? INITIAL_LATTICE_GESTURE
      : { pointers, multi: state.multi, longPressAt: state.longPressAt },
  );
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
    case "cancel":
      return onCancel(state, event);
    case "tick":
      return onTick(state, event, config);
  }
};
