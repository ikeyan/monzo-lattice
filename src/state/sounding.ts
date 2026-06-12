/**
 * アルペジオモード (仕様 §6.7) の発音状態。永続化しない。
 *
 * すべて「押している間」の状態として持ち、ノートが発音されるかは
 * ノートをタッチ中 ∨ リズムボタン押下中 ∨ グライドボタン押下中 の OR で決まる。
 */

import { atom } from "jotai";

/** リズムボタン (§5.6) を押している間 true (全ノートを発音) */
export const rhythmHeldAtom = atom(false);

/** グライドボタン (§5.6) を押している間 true (全ノートを発音 + セル移動をグライドに) */
export const glideHeldAtom = atom(false);

/** log 周波数直線上でタッチ中のノート: pointerId → voicedNoteKey */
export const heldNoteKeysAtom = atom<ReadonlyMap<number, string>>(new Map());
