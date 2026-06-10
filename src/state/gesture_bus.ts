/**
 * ジェスチャ状態機械への合成イベントの注入口。
 *
 * 豆の D&D (§4.2) が「ドラッグ中の豆がセルに完全に入った/出た」を
 * down/up イベントとして注入し、通常のタッチと同じバッチ化・底音規則で発音させる。
 */

import { Subject } from "rxjs";
import type { GestureEvent } from "../lib/touch.ts";

export const gestureBus = new Subject<GestureEvent>();
