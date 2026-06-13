/**
 * 豆のドラッグ&ドロップ (仕様 §4.2)。
 *
 * - パレット → セル: コピー / セル → セル: 移動 / セル → 格子の外: 削除
 * - セル上の豆へのタッチは、直接モードでは和音 (§6.2)、アルペジオモードでは
 *   タップ/ロングタップ (§6) の候補になり、閾値を超えて動いたらドラッグに
 *   昇格する。昇格時は合成 up でその指の発音/編集を取り消す。
 * - 直接モードでは、ドラッグ中に豆が完全にセル内へ入ったら合成 down (豆つき対象)
 *   を注入して発音し (§4.2)、出たら合成 up で止める。
 */

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { addBean, beanCapacity, beanFullyInsideCell, moveBean, removeBean } from "../lib/beans.ts";
import { cellAtPoint, CSS_PX_PER_CM } from "../lib/lattice_view.ts";
import { sameCell, type TouchTarget } from "../lib/touch.ts";
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
  /** 直接モードでドラッグ中の豆が完全に入っているセル (合成 down 済み) */
  const containedRef = useRef<TouchTarget | null>(null);

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
    const releaseContained = () => {
      if (containedRef.current !== null) {
        gestureBus.next({ type: "up", pointerId: drag.pointerId, at: performance.now() });
        containedRef.current = null;
      }
    };
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
      // 直接モードのみ: 豆が完全にセルへ入ったら発音する (§4.2)
      if (settingsRef.current.playMode !== "direct") return;
      const p = relativePoint(e);
      const contained = insideLattice(p)
        ? beanFullyInsideCell(viewRef.current.geo, settingsRef.current.cellSizeCm, p.x, p.y)
        : null;
      const prev = containedRef.current;
      if (prev !== null && contained !== null && sameCell(prev, contained)) return;
      releaseContained();
      if (contained !== null) {
        gestureBus.next({
          type: "down",
          pointerId: drag.pointerId,
          x: p.x,
          y: p.y,
          at: performance.now(),
          target: { ...contained, bean: drag.prime },
        });
        containedRef.current = contained;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      releaseContained();
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
      releaseContained();
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
