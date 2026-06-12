/**
 * アルペジオモード (仕様 §6.7) の発音状態。永続化しない。
 *
 * すべて「押している間」の状態として持ち、ノートが発音されるかは
 * いずれかの指の選択に含まれる ∨ リズムボタン押下中 ∨ グライドボタン押下中
 * の OR で決まる。
 */

import { atom } from "jotai";
import type { PitchSelection } from "../lib/pitch_line.ts";

/** リズムボタン (§5.6) を押している間 true (全ノートを発音) */
export const rhythmHeldAtom = atom(false);

/** グライドボタン (§5.6) を押している間 true (全ノートを発音 + セル移動をグライドに) */
export const glideHeldAtom = atom(false);

/** log 周波数直線上の指ごとの選択 (§6.7): pointerId → 単音または範囲 */
export const pitchSelectionsAtom = atom<ReadonlyMap<number, PitchSelection>>(new Map());
