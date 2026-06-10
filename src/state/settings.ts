/** 設定の jotai atom (localStorage 永続化、仕様 §9) */

import { atom } from "jotai";
import { atomWithStorage, createJSONStorage, RESET } from "jotai/utils";
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from "../lib/settings.ts";

const STORAGE_KEY = "monzo-lattice.settings";

const jsonStorage = createJSONStorage<Settings>(() => localStorage);

/** localStorage の内容が壊れていても必ず正規な Settings を返す storage */
const sanitizedStorage: typeof jsonStorage = {
  ...jsonStorage,
  getItem: (key, initialValue) => sanitizeSettings(jsonStorage.getItem(key, initialValue)),
};

const storedSettingsAtom = atomWithStorage<Settings>(
  STORAGE_KEY,
  DEFAULT_SETTINGS,
  sanitizedStorage,
  { getOnInit: true },
);

/** アプリ設定。書き込みは部分更新で、常に sanitizeSettings を通る */
export const settingsAtom = atom(
  (get) => get(storedSettingsAtom),
  (get, set, update: Partial<Settings>) =>
    set(storedSettingsAtom, sanitizeSettings({ ...get(storedSettingsAtom), ...update })),
);

/** 設定をデフォルトにリセットする (localStorage のエントリも消す、仕様 §9) */
export const resetSettingsAtom = atom(null, (_get, set) => set(storedSettingsAtom, RESET));
