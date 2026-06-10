/** 永続化しない UI 状態 */

import { atom } from "jotai";

/** 設定画面 (§5.4) の開閉 */
export const settingsOpenAtom = atom(false);
