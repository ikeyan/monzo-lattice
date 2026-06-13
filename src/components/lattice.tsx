/**
 * monzo 格子 (仕様 §3) とジェスチャ (§6)、豆の表示 (§4) の配線。
 *
 * 格子のタッチは monzo の存在をトグルする永続的な和音編集 (§6)。pointer
 * イベントを RxJS で集め、純粋な認識機械 reduceLatticeGesture (lib/lattice_gesture.ts)
 * に畳み込んでアクション (トグル・底音化・移動・平行移動) とパン量を得て、
 * chord_edit で chordAtom を更新する。ロングタップ期限は longPressAt に合わせて
 * tick を注入する。豆の D&D (§4.2) の昇格は gestureBus 経由で指のタップを取り消す。
 */

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { filter, fromEvent, map, merge, scan, Subject } from "rxjs";
import { ensureAudioReady } from "../lib/audio.ts";
import { beanPositionsCm, beansAt, effectiveBeans, targetAtPoint } from "../lib/beans.ts";
import {
  moveNote,
  optimalBassTarget,
  setBass,
  toggleNote,
  translateChord,
} from "../lib/chord_edit.ts";
import {
  INITIAL_LATTICE_GESTURE,
  type LatticeGestureConfig,
  type LatticeGestureEvent,
  reduceLatticeGesture,
} from "../lib/lattice_gesture.ts";
import {
  applyPanDelta,
  CSS_PX_PER_CM,
  type ViewGeometry,
  visibleCells,
} from "../lib/lattice_view.ts";
import { cellMonzo, formatMonzo } from "../lib/monzo.ts";
import { CELL_MOVE_MARGIN, sameCell, sameTarget } from "../lib/touch.ts";
import { chordToVoicingInput, solveVoicingTransition } from "../lib/voicing.ts";
import { beanBoardAtom, beanDragAtom, beanDragCandidateAtom } from "../state/beans.ts";
import { chordAtom } from "../state/chord.ts";
import { gestureBus } from "../state/gesture_bus.ts";
import { panAtom } from "../state/lattice.ts";
import { latticeViewAtom } from "../state/lattice_view.ts";
import { isLandscapeAtom } from "../state/orientation.ts";
import { settingsAtom } from "../state/settings.ts";
import { voicingAtom } from "../state/voicing.ts";

/** ロングタップ (底音化 §6) とみなす押下時間 (ms) */
const LONG_PRESS_MS = 450;
/** スライド開始とみなす移動距離 (px) */
const SLOP_PX = 8;

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

  // イベント時点の最新の和音・設定・ジオメトリ・盤面を参照するための ref
  const config: LatticeGestureConfig = {
    geo,
    marginFrac: CELL_MOVE_MARGIN,
    longPressMs: LONG_PRESS_MS,
    slopPx: SLOP_PX,
    hasTarget: (t) => chord?.notes.some((n) => sameTarget(n.target, t)) ?? false,
    cellHasMonzo: (x3, yp) =>
      chord?.notes.some((n) => n.target.x3 === x3 && n.target.yp === yp) ?? false,
    isBass: (t) => chord !== null && sameTarget(chord.bass, t),
  };
  const configRef = useRef(config);
  configRef.current = config;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const boardRef = useRef(board);
  boardRef.current = board;
  const beanDragRef = useRef(beanDrag);
  beanDragRef.current = beanDrag;
  const beanCandidateRef = useRef(beanCandidate);
  beanCandidateRef.current = beanCandidate;
  const nextIdRef = useRef(1);

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
    const tick$ = new Subject<LatticeGestureEvent>();
    const down$ = fromEvent<PointerEvent>(el, "pointerdown").pipe(
      map((e): LatticeGestureEvent => {
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
      // 豆の D&D に昇格した指・昇格しうる候補の指の生 move は無視する (§4.2)。
      // 豆の移動は BeanDragLayer が盤面を編集する
      filter((e) =>
        beanDragRef.current?.pointerId !== e.pointerId &&
        beanCandidateRef.current?.pointerId !== e.pointerId
      ),
      map((e): LatticeGestureEvent => ({
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
      map((e): LatticeGestureEvent => ({
        type: "up",
        pointerId: e.pointerId,
        at: performance.now(),
      })),
    );

    let timer: number | undefined;
    const subscription = merge(down$, move$, up$, tick$, gestureBus)
      .pipe(
        scan(
          (acc, ev) => reduceLatticeGesture(acc.state, ev, configRef.current),
          { state: INITIAL_LATTICE_GESTURE, actions: [], panDelta: null } as ReturnType<
            typeof reduceLatticeGesture
          >,
        ),
      )
      .subscribe(({ state, actions, panDelta }) => {
        for (const a of actions) {
          switch (a.type) {
            case "toggle": {
              const id = nextIdRef.current++;
              setChord((c) => toggleNote(c, a.target, id));
              break;
            }
            case "setBass":
              setChord((c) => (c === null ? c : setBass(c, a.target)));
              break;
            case "optimizeBass": {
              const s = settingsRef.current;
              setChord((
                c,
              ) => (c === null ? c : setBass(c, optimalBassTarget(c, s.latticePrime, s))));
              break;
            }
            case "moveNote":
              setChord((c) => (c === null ? c : moveNote(c, a.from, a.to)));
              break;
            case "translate":
              setChord((c) => (c === null ? c : translateChord(c, a.dx3, a.dyp)));
              break;
          }
        }
        if (panDelta !== null) {
          setPan((prev) =>
            applyPanDelta(prev, panDelta.dx, panDelta.dy, configRef.current.geo.isWide)
          );
        }
        clearTimeout(timer);
        if (state.longPressAt !== null) {
          const delay = Math.max(0, state.longPressAt - performance.now());
          timer = setTimeout(() => tick$.next({ type: "tick", at: performance.now() }), delay);
        }
      });
    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [setPan, setChord, setBeanCandidate]);

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
        // 平セル (豆なし) の構成音・底音だけをセルの強調に使う (豆は別に強調する)
        const plainActive = chord?.notes.some((n) =>
          n.target.bean === undefined && sameCell(n.target, c)
        ) ?? false;
        const plainBass = chord !== null && chord.bass.bean === undefined &&
          sameCell(chord.bass, c);
        const classes = [
          "lattice-cell",
          c.x3 === 0 && c.yp === 0 ? "origin" : "",
          plainActive ? "active" : "",
          plainBass ? "bass" : "",
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
              const beanTarget = { x3: c.x3, yp: c.yp, bean: q };
              const beanActive = chord?.notes.some((n) => sameTarget(n.target, beanTarget)) ??
                false;
              const beanBass = chord !== null && sameTarget(chord.bass, beanTarget);
              const beanClass = ["bean", beanActive ? "active" : "", beanBass ? "bass" : ""]
                .filter((s) =>
                  s !== ""
                ).join(" ");
              return (
                <span
                  key={q}
                  className={beanClass}
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
