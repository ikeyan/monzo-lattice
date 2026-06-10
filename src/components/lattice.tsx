/**
 * monzo 格子 (仕様 §3) とタッチ処理 (§6) の配線。
 *
 * pointer イベントを RxJS で集め、純粋な状態機械 reduceGesture (lib/touch.ts) に
 * 畳み込む。バッチ期限は windowEndsAt に合わせて tick イベントを注入する。
 * 設定やジオメトリは ref 経由でイベント時点の最新値を使う。
 */

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { fromEvent, map, merge, scan, Subject } from "rxjs";
import { ensureAudioReady } from "../lib/audio.ts";
import {
  applyPanDelta,
  CSS_PX_PER_CM,
  type ViewGeometry,
  visibleCells,
} from "../lib/lattice_view.ts";
import { cellMonzo, formatMonzo } from "../lib/monzo.ts";
import {
  CELL_MOVE_MARGIN,
  type GestureConfig,
  type GestureEvent,
  type GestureResult,
  INITIAL_GESTURE,
  reduceGesture,
  sameTarget,
} from "../lib/touch.ts";
import { chordAtom } from "../state/chord.ts";
import { panAtom } from "../state/lattice.ts";
import { isLandscapeAtom } from "../state/orientation.ts";
import { settingsAtom } from "../state/settings.ts";

export const Lattice = () => {
  const settings = useAtomValue(settingsAtom);
  const isWide = useAtomValue(isLandscapeAtom);
  const pan = useAtomValue(panAtom);
  const setPan = useSetAtom(panAtom);
  const setChord = useSetAtom(chordAtom);
  const chord = useAtomValue(chordAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const cellSizePx = settings.cellSizeCm * CSS_PX_PER_CM;
  const geo: ViewGeometry = { ...size, cellSizePx, pan, isWide };

  // イベント時点の最新設定・ジオメトリを参照するための ref
  const configRef = useRef<GestureConfig>({
    batchMs: settings.batchPeriodMs,
    panThresholdPx: settings.panThresholdCm * CSS_PX_PER_CM,
    marginFrac: CELL_MOVE_MARGIN,
    geo,
  });
  configRef.current = {
    batchMs: settings.batchPeriodMs,
    panThresholdPx: settings.panThresholdCm * CSS_PX_PER_CM,
    marginFrac: CELL_MOVE_MARGIN,
    geo,
  };

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

  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;

    const relative = (e: PointerEvent): { x: number; y: number } => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const tick$ = new Subject<GestureEvent>();
    const down$ = fromEvent<PointerEvent>(el, "pointerdown").pipe(
      map((e): GestureEvent => {
        // 合成イベント (テスト) では capture に失敗してよい
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // noop
        }
        ensureAudioReady();
        return { type: "down", pointerId: e.pointerId, ...relative(e), at: performance.now() };
      }),
    );
    const move$ = fromEvent<PointerEvent>(el, "pointermove").pipe(
      map((e): GestureEvent => ({
        type: "move",
        pointerId: e.pointerId,
        ...relative(e),
        at: performance.now(),
      })),
    );
    const up$ = merge(
      fromEvent<PointerEvent>(el, "pointerup"),
      fromEvent<PointerEvent>(el, "pointercancel"),
    ).pipe(
      map((e): GestureEvent => ({ type: "up", pointerId: e.pointerId, at: performance.now() })),
    );

    let timer: number | undefined;
    const subscription = merge(down$, move$, up$, tick$)
      .pipe(
        scan<GestureEvent, GestureResult>(
          (acc, ev) => reduceGesture(acc.state, ev, configRef.current),
          { state: INITIAL_GESTURE, panDelta: null },
        ),
      )
      .subscribe(({ state, panDelta }) => {
        if (panDelta !== null) {
          setPan((prev) =>
            applyPanDelta(prev, panDelta.dx, panDelta.dy, configRef.current.geo.isWide)
          );
        }
        setChord(state.committed);
        clearTimeout(timer);
        if (state.windowEndsAt !== null) {
          const delay = Math.max(0, state.windowEndsAt - performance.now());
          timer = setTimeout(() => tick$.next({ type: "tick", at: performance.now() }), delay);
        }
      });
    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [setPan, setChord]);

  const cells = size.width > 0 && size.height > 0 ? visibleCells(geo) : [];

  return (
    <div ref={containerRef} className="lattice">
      {cells.map((c) => {
        const isActive = chord?.notes.some((n) => sameTarget(n, c)) ?? false;
        const isBass = chord !== null && sameTarget(chord.bass, c);
        const classes = [
          "lattice-cell",
          c.x3 === 0 && c.yp === 0 ? "origin" : "",
          isActive ? "active" : "",
          isBass ? "bass" : "",
        ].filter((s) => s !== "").join(" ");
        return (
          <div
            key={`${c.x3},${c.yp}`}
            className={classes}
            style={{ left: c.left, top: c.top, width: cellSizePx, height: cellSizePx }}
          >
            {formatMonzo(cellMonzo(c.x3, c.yp, settings.latticePrime))}
          </div>
        );
      })}
    </div>
  );
};
