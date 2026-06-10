import { useAtomValue } from "jotai";
import { atomWithObservable } from "jotai/utils";
import { fromEvent, map, merge, scan, startWith } from "rxjs";
import { cellMonzo, ratioValue } from "./lib/monzo.ts";

/**
 * 仮実装: pointer イベント → rxjs → jotai (atomWithObservable) → react の
 * 配線を確認するためのデモ。本実装で置き換える。
 */
const activePointerCountAtom = atomWithObservable(() =>
  merge(
    fromEvent(window, "pointerdown").pipe(map(() => +1)),
    fromEvent(window, "pointerup").pipe(map(() => -1)),
    fromEvent(window, "pointercancel").pipe(map(() => -1)),
  ).pipe(
    scan((count, delta) => Math.max(0, count + delta), 0),
    startWith(0),
  )
);

export const App = () => {
  const activePointers = useAtomValue(activePointerCountAtom);
  return (
    <main>
      <h1>Monzo Lattice</h1>
      <p>格子で音楽を作るアプリ (仕様: docs/spec.md)。実装はこれから。</p>
      <p>タッチ中のポインタ数: {activePointers}</p>
      <p>例: セル (x=1, y=1), p=5 の比 = {ratioValue(cellMonzo(1, 1, 5))}</p>
    </main>
  );
};
