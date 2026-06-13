/**
 * 豆のドラッグ&ドロップ (仕様 §4.2)。
 *
 * - パレット → セル: コピー / セル → セル: 移動 / セル → 格子の外: 削除
 * - セル上の豆へのタッチはまずタップ/ロングタップの候補になり (§6)、閾値を超えて
 *   動いたらドラッグに昇格する。昇格時は合成 up でその指の和音編集を取り消す。
 */

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { addBean, beanCapacity, moveBean, removeBean } from "../lib/beans.ts";
import { cellAtPoint, CSS_PX_PER_CM } from "../lib/lattice_view.ts";
import { beanBoardAtom, beanDragAtom, beanDragCandidateAtom } from "../state/beans.ts";
import { gestureBus } from "../state/gesture_bus.ts";
import { latticeViewAtom } from "../state/lattice_view.ts";
import { settingsAtom } from "../state/settings.ts";

export const BeanDragLayer = () => {
  const candidate = useAtomValue(beanDragCandidateAtom);
  const drag = useAtomValue(beanDragAtom);
  const view = useAtomValue(latticeViewAtom);
  const settings = useAtomValue(settingsAtom);
  const setCandidate = useSetAtom(beanDragCandidateAtom);
  const setDrag = useSetAtom(beanDragAtom);
  const setBoard = useSetAtom(beanBoardAtom);
  const viewRef = useRef(view);
  viewRef.current = view;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // セルの豆に触れた指がドラッグへ昇格するかを監視する
  useEffect(() => {
    if (candidate === null) return;
    const threshold = settingsRef.current.panThresholdCm * CSS_PX_PER_CM;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== candidate.pointerId) return;
      if (Math.hypot(e.clientX - candidate.startX, e.clientY - candidate.startY) > threshold) {
        // 昇格: この指のタップ/ロングタップを取り消す (§6)
        gestureBus.next({ type: "up", pointerId: candidate.pointerId, at: performance.now() });
        setDrag({
          pointerId: candidate.pointerId,
          prime: candidate.prime,
          from: candidate.from,
          x: e.clientX,
          y: e.clientY,
        });
        setCandidate(null);
      }
    };
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId === candidate.pointerId) setCandidate(null);
    };
    globalThis.addEventListener("pointermove", onMove);
    globalThis.addEventListener("pointerup", onEnd);
    globalThis.addEventListener("pointercancel", onEnd);
    return () => {
      globalThis.removeEventListener("pointermove", onMove);
      globalThis.removeEventListener("pointerup", onEnd);
      globalThis.removeEventListener("pointercancel", onEnd);
    };
  }, [candidate, setCandidate, setDrag]);

  // ドラッグ本体
  useEffect(() => {
    if (drag === null) return;
    const relativePoint = (e: PointerEvent) => {
      const { originX, originY } = viewRef.current;
      return { x: e.clientX - originX, y: e.clientY - originY };
    };
    const insideLattice = (p: { x: number; y: number }) => {
      const { geo } = viewRef.current;
      return p.x >= 0 && p.x <= geo.width && p.y >= 0 && p.y <= geo.height;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      setDrag({ ...drag, x: e.clientX, y: e.clientY });
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const p = relativePoint(e);
      const s = settingsRef.current;
      const capacity = beanCapacity(s.cellSizeCm);
      const from = drag.from;
      if (insideLattice(p)) {
        const cell = cellAtPoint(viewRef.current.geo, p.x, p.y);
        setBoard((b) =>
          from === null
            ? addBean(b, cell.x3, cell.yp, drag.prime, capacity)
            : moveBean(b, from, cell, drag.prime, capacity)
        );
      } else if (from !== null) {
        setBoard((b) => removeBean(b, from.x3, from.yp, drag.prime));
      }
      setDrag(null);
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      setDrag(null);
    };
    globalThis.addEventListener("pointermove", onMove);
    globalThis.addEventListener("pointerup", onUp);
    globalThis.addEventListener("pointercancel", onCancel);
    return () => {
      globalThis.removeEventListener("pointermove", onMove);
      globalThis.removeEventListener("pointerup", onUp);
      globalThis.removeEventListener("pointercancel", onCancel);
    };
  }, [drag, setDrag, setBoard]);

  if (drag === null) return null;
  const pxPerCm = view.geo.cellSizePx / settings.cellSizeCm;
  return (
    <span
      className="bean bean-ghost"
      style={{
        left: drag.x,
        top: drag.y,
        width: pxPerCm,
        height: pxPerCm * 0.6,
      }}
    >
      {drag.prime}
    </span>
  );
};
