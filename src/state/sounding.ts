/** アルペジオモード (仕様 §6.7) の発音指定。永続化しない */

import { atom } from "jotai";

export type Sounding = Readonly<{
  /** リズムボタン (§5.6) を押している間 true (全ノートを発音) */
  all: boolean;
  /** log 周波数直線のタッチで個別に発音開始したノートのキー (voicedNoteKey) */
  noteKeys: ReadonlySet<string>;
}>;

export const SOUNDING_NONE: Sounding = { all: false, noteKeys: new Set() };

export const soundingAtom = atom<Sounding>(SOUNDING_NONE);

/** グライドボタン (§5.6) を押している間 true (セル移動時のノートをグライドにする) */
export const glideHeldAtom = atom(false);
