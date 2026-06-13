/**
 * 格子ジェスチャ機械への合成イベントの注入口。
 *
 * 豆がドラッグ (§4.2) に昇格したとき、その指のタップ/ロングタップを取り消すため
 * 合成 up を注入する (豆はドラッグ中、和音編集の対象から外れる)。
 */

import { Subject } from "rxjs";
import type { LatticeGestureEvent } from "../lib/lattice_gesture.ts";

export const gestureBus = new Subject<LatticeGestureEvent>();
