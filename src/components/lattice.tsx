/**
 * monzo 格子 (仕様 §3)。
 *
 * セルは 3^x · p^y の monzo を表示する。長辺方向が 3 の軸、短辺方向が p の軸。
 * パン操作 (§6.6) は現状ドラッグで常に発動する。和音タッチとの排他
 * (バッチ期間中の判定) はタッチ処理のステップで RxJS パイプラインに統合する。
 */

import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { applyPanDelta, CSS_PX_PER_CM, visibleCells } from "../lib/lattice_view.ts";
import { cellMonzo, formatMonzo } from "../lib/monzo.ts";
import { isLandscapeAtom } from "../state/orientation.ts";
import { panAtom } from "../state/lattice.ts";
import { settingsAtom } from "../state/settings.ts";

type DragState = Readonly<{ pointerId: number; lastX: number; lastY: number }>;

export const Lattice = () => {
  const settings = useAtomValue(settingsAtom);
  const isWide = useAtomValue(isLandscapeAtom);
  const [pan, setPan] = useAtom(panAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cellSizePx = settings.cellSizeCm * CSS_PX_PER_CM;
  const geo = { ...size, cellSizePx, pan, isWide };
  const cells = size.width > 0 && size.height > 0 ? visibleCells(geo) : [];

  return (
    <div
      ref={containerRef}
      className="lattice"
      onPointerDown={(e) => {
        if (dragRef.current !== null) return;
        dragRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        if (drag === null || drag.pointerId !== e.pointerId) return;
        const dx = e.clientX - drag.lastX;
        const dy = e.clientY - drag.lastY;
        dragRef.current = { ...drag, lastX: e.clientX, lastY: e.clientY };
        setPan((prev) => applyPanDelta(prev, dx, dy, isWide));
      }}
      onPointerUp={(e) => {
        if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
      }}
      onPointerCancel={(e) => {
        if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
      }}
    >
      {cells.map((c) => (
        <div
          key={`${c.x3},${c.yp}`}
          className={c.x3 === 0 && c.yp === 0 ? "lattice-cell origin" : "lattice-cell"}
          style={{ left: c.left, top: c.top, width: cellSizePx, height: cellSizePx }}
        >
          {formatMonzo(cellMonzo(c.x3, c.yp, settings.latticePrime))}
        </div>
      ))}
    </div>
  );
};
