/**
 * 永続的な和音の編集 (仕様 §6)。
 *
 * 格子のタッチは monzo の存在をトグルし、底音化・平行移動などで和音を編集する。
 * すべて純粋関数で、和音 (Chord) を受け取って新しい和音 (または空なら null) を返す。
 * 各ノートは安定 id (fingerIds) を持ち、移動・平行移動でも引き継いでグライド
 * (§6.4) やボイシング遷移 (§7.4) の対応付けに使う。
 */

import { type Chord, sameTarget, type TouchTarget } from "./touch.ts";
import { chordToVoicingInput, solveVoicing } from "./voicing.ts";
import type { LatticePrime } from "./monzo.ts";
import type { Settings } from "./settings.ts";

/** ノートの存在をトグルする (§6)。最初に追加したノートが底音になる */
export const toggleNote = (chord: Chord | null, target: TouchTarget, id: number): Chord | null => {
  if (chord === null) return { notes: [{ target, fingerIds: [id] }], bass: target };
  const idx = chord.notes.findIndex((n) => sameTarget(n.target, target));
  if (idx === -1) {
    return { ...chord, notes: [...chord.notes, { target, fingerIds: [id] }] };
  }
  const notes = chord.notes.filter((_, i) => i !== idx);
  if (notes.length === 0) return null;
  // 底音を消したら、残りで一番古いノートが底音を引き継ぐ
  const bass = sameTarget(chord.bass, target) ? (notes[0]?.target ?? chord.bass) : chord.bass;
  return { notes, bass };
};

/** target を底音にする (§6)。target が和音の構成音でなければ何もしない */
export const setBass = (chord: Chord, target: TouchTarget): Chord =>
  chord.notes.some((n) => sameTarget(n.target, target)) ? { ...chord, bass: target } : chord;

/**
 * ノートを from から to へ平行移動する (§6, 一本指スライド)。
 * 移動先に同じ monzo があれば重複するので、移動するノートを消す (dedup)。
 */
export const moveNote = (chord: Chord, from: TouchTarget, to: TouchTarget): Chord | null => {
  if (sameTarget(from, to)) return chord;
  const idx = chord.notes.findIndex((n) => sameTarget(n.target, from));
  if (idx === -1) return chord;
  const occupied = chord.notes.some((n, i) => i !== idx && sameTarget(n.target, to));
  const notes = occupied
    ? chord.notes.filter((_, i) => i !== idx)
    : chord.notes.map((n, i) => (i === idx ? { ...n, target: to } : n));
  if (notes.length === 0) return null;
  // 移動したのが底音なら、底音は移動先 (重複時は元からあったノート) になる
  const bass = sameTarget(chord.bass, from) ? to : chord.bass;
  return { notes, bass };
};

/** 和音全体を平行移動する (§6, 二本指スライド)。重複は生じない (id は保つ) */
export const translateChord = (chord: Chord, dx3: number, dyp: number): Chord => {
  const shift = (t: TouchTarget): TouchTarget => ({ ...t, x3: t.x3 + dx3, yp: t.yp + dyp });
  return {
    notes: chord.notes.map((n) => ({ ...n, target: shift(n.target) })),
    bass: shift(chord.bass),
  };
};

/**
 * 底音制約を外したときコスト最適になる底音 (§6)。
 * 各ノートを底音と仮定してボイシングを解き、最小コストの底音の target を返す。
 */
export const optimalBassTarget = (
  chord: Chord,
  p: LatticePrime,
  settings: Settings,
): TouchTarget => {
  let best = chord.bass;
  let bestCost = Infinity;
  for (const n of chord.notes) {
    const voicing = solveVoicing(chordToVoicingInput({ ...chord, bass: n.target }, p), settings);
    if (voicing !== null && voicing.cost < bestCost) {
      bestCost = voicing.cost;
      best = n.target;
    }
  }
  return best;
};
