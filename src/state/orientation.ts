/** 画面の向き。格子の軸の割り当て (§3) と log 周波数直線の配置 (§5.1) が依存する */

import { atomWithObservable } from "jotai/utils";
import { fromEvent, map, startWith } from "rxjs";

export const isLandscapeAtom = atomWithObservable(() => {
  const query = matchMedia("(orientation: landscape)");
  return fromEvent(query, "change").pipe(
    map(() => query.matches),
    startWith(query.matches),
  );
});
