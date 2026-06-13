/**
 * ジェスチャ機械への合成イベントの注入口。
 *
 * 豆の D&D (§4.2) が使う:
 * - 直接モードでは「ドラッグ中の豆が完全にセルに入った/出た」を down/up として
 *   注入し、通常のタッチと同じバッチ化・底音規則で発音させる。
 * - ドラッグへの昇格時はその指の合成 up を注入し、和音編集を取り消す。
 *
 * 直接モード (GestureEvent) とアルペジオモード (LatticeGestureEvent) の
 * イベント型は構造的に同一なので、共通のチャネルとして GestureEvent で扱う。
 */

import { Subject } from "rxjs";
import type { GestureEvent } from "../lib/touch.ts";

export const gestureBus = new Subject<GestureEvent>();
