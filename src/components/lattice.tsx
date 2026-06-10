/**
 * monzo 格子 (仕様 §3) とタッチ処理 (§6)、豆の表示 (§4) の配線。
 *
 * pointer イベントを RxJS で集め、純粋な状態機械 reduceGesture (lib/touch.ts) に
 * 畳み込む。バッチ期限は windowEndsAt に合わせて tick イベントを注入する。
 * 豆の D&D (§4.2) からの合成イベントは gestureBus 経由で同じ機械に流れ込む。
 * 設定やジオメトリは ref 経由でイベント時点の最新値を使う。
 */

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { filter, fromEvent, map, merge, scan, Subject } from "rxjs";
import { ensureAudioReady } from "../lib/audio.ts";
import { beanPositionsCm, beansAt, effectiveBeans, targetAtPoint } from "../lib/beans.ts";
import {
  applyPanDelta,
  CSS_PX_PER_CM,
  type ViewGeometry,
  visibleCells,
} from "../lib/lattice_view.ts";
import { cellMonzo, formatMonzo } from "../lib/monzo.ts";
import {
  CELL_MOVE_MARGIN,
  type Chord,
  type GestureConfig,
  type GestureEvent,
  type GestureResult,
  INITIAL_GESTURE,
  reduceGesture,
  sameCell,
} from "../lib/touch.ts";
import { chordToVoicingInput, solveVoicingTransition } from "../lib/voicing.ts";
import { beanBoardAtom, beanDragAtom, beanDragCandidateAtom } from "../state/beans.ts";
import { chordAtom } from "../state/chord.ts";
import { gestureBus } from "../state/gesture_bus.ts";
import { panAtom } from "../state/lattice.ts";
import { latticeViewAtom } from "../state/lattice_view.ts";
import { isLandscapeAtom } from "../state/orientation.ts";
import { settingsAtom } from "../state/settings.ts";
import { voicingAtom } from "../state/voicing.ts";

export const Lattice = () => {
  const settings = useAtomValue(settingsAtom);
  const isWide = useAtomValue(isLandscapeAtom);
  const pan = useAtomValue(panAtom);
  const board = useAtomValue(beanBoardAtom);
  const beanDrag = useAtomValue(beanDragAtom);
  const beanCandidate = useAtomValue(beanDragCandidateAtom);
  const setPan = useSetAtom(panAtom);
  const setChord = useSetAtom(chordAtom);
  const setVoicing = useSetAtom(voicingAtom);
  const setLatticeView = useSetAtom(latticeViewAtom);
  const setBeanCandidate = useSetAtom(beanDragCandidateAtom);
  const chord = useAtomValue(chordAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const cellSizePx = settings.cellSizeCm * CSS_PX_PER_CM;
  const geo: ViewGeometry = { ...size, cellSizePx, pan, isWide };

  // イベント時点の最新設定・ジオメトリ・盤面を参照するための ref
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
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const boardRef = useRef(board);
  boardRef.current = board;
  const beanDragRef = useRef(beanDrag);
  beanDragRef.current = beanDrag;
  const beanCandidateRef = useRef(beanCandidate);
  beanCandidateRef.current = beanCandidate;

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

  // D&D レイヤのために格子のジオメトリと位置を公開する
  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    setLatticeView({ geo, originX: rect.left, originY: rect.top });
  }, [size.width, size.height, pan, isWide, cellSizePx, setLatticeView]);

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
        const point = relative(e);
        const s = settingsRef.current;
        const target = targetAtPoint(
          configRef.current.geo,
          boardRef.current,
          s.latticePrime,
          s.cellSizeCm,
          point.x,
          point.y,
        );
        // セル上の豆に触れた指はドラッグ昇格の候補にする (§4.2)
        if (target.bean !== undefined) {
          setBeanCandidate({
            pointerId: e.pointerId,
            prime: target.bean,
            from: { x3: target.x3, yp: target.yp },
            startX: e.clientX,
            startY: e.clientY,
          });
        }
        return { type: "down", pointerId: e.pointerId, ...point, at: performance.now(), target };
      }),
    );
    const move$ = fromEvent<PointerEvent>(el, "pointermove").pipe(
      // 豆の D&D に昇格した指、および昇格しうる候補の指の生 move は無視する。
      // さもないと cellWithMargin が豆なしのセルを発音させてしまう
      // (候補も除外するのは、閾値を跨ぐ move が BeanDragLayer の window リスナより
      // 先に格子要素へ届くレースがあるため)。発音は §4.2 の合成 down/up が担う
      filter((e) =>
        beanDragRef.current?.pointerId !== e.pointerId &&
        beanCandidateRef.current?.pointerId !== e.pointerId
      ),
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
    let lastCommitted: Chord | null = null;
    const subscription = merge(down$, move$, up$, tick$, gestureBus)
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
        if (state.committed !== lastCommitted) {
          lastCommitted = state.committed;
          setChord(state.committed);
        }
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
  }, [setPan, setChord, setVoicing, setBeanCandidate]);

  // ボイシング (§7) は和音と設定から導く。和音の変化だけでなく、発音中の
  // 設定変更 (p・音域・音色・f0 等) にも追従する。遷移は前回の結果を参照 (§7.4)
  useEffect(() => {
    setVoicing((prev) =>
      chord === null ? null : solveVoicingTransition(
        chordToVoicingInput(chord, settings.latticePrime),
        settings,
        settings.chordTransitionMode,
        prev,
      )
    );
  }, [chord, settings, setVoicing]);

  const cells = size.width > 0 && size.height > 0 ? visibleCells(geo) : [];
  const pxPerCm = cellSizePx / settings.cellSizeCm;

  return (
    <div ref={containerRef} className="lattice">
      {cells.map((c) => {
        const isActive = chord?.notes.some((n) => sameCell(n.target, c)) ?? false;
        const isBass = chord !== null && sameCell(chord.bass, c);
        const classes = [
          "lattice-cell",
          c.x3 === 0 && c.yp === 0 ? "origin" : "",
          isActive ? "active" : "",
          isBass ? "bass" : "",
        ].filter((s) => s !== "").join(" ");
        // ドラッグで持ち上げている豆は元のセルに描かない (§4.2 の移動)
        const beans = effectiveBeans(beansAt(board, c.x3, c.yp), settings.latticePrime)
          .filter((q) =>
            !(beanDrag !== null && beanDrag.from !== null &&
              sameCell(beanDrag.from, c) && beanDrag.prime === q)
          );
        const positions = beanPositionsCm(settings.cellSizeCm, beans.length);
        return (
          <div
            key={`${c.x3},${c.yp}`}
            className={classes}
            style={{ left: c.left, top: c.top, width: cellSizePx, height: cellSizePx }}
          >
            {formatMonzo(cellMonzo(c.x3, c.yp, settings.latticePrime))}
            {beans.map((q, i) => {
              const pos = positions[i];
              if (pos === undefined) return null;
              return (
                <span
                  key={q}
                  className="bean"
                  style={{
                    left: pos.x * pxPerCm,
                    top: pos.y * pxPerCm,
                    width: pxPerCm,
                    height: pxPerCm * 0.6,
                  }}
                >
                  {q}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
