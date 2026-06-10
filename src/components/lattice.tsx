/**
 * monzo 格子の領域 (仕様 §3)。
 *
 * セル描画とパン操作はステップ 3 で実装する。いまは領域の確保と
 * 軸の割り当て (長辺方向が 3、短辺方向が p、§3) の表示のみ。
 */

import { useAtomValue } from "jotai";
import { isLandscapeAtom } from "../state/orientation.ts";
import { settingsAtom } from "../state/settings.ts";

export const Lattice = () => {
  const settings = useAtomValue(settingsAtom);
  const isLandscape = useAtomValue(isLandscapeAtom);
  const axis3 = isLandscape ? "→" : "↑";
  const axisP = isLandscape ? "↑" : "→";
  return (
    <div className="lattice">
      <p className="lattice-placeholder">
        格子 (実装予定): {axis3} 3 の累乗、{axisP} {settings.latticePrime} の累乗
      </p>
    </div>
  );
};
