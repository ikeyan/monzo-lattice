/**
 * monzo (素数の指数ベクトル) の純粋関数群。
 *
 * monzo は素数→指数の写像で、有理数 Π prime^exponent を表す。
 * 指数 0 のエントリを持たない「正規形」で扱う (normalize を通す)。
 */

/** このアプリで扱う素数。2 はボイシング (オクターブ) 専用。 */
export const PRIMES = [2, 3, 5, 7, 11, 13, 17] as const;
export type Prime = (typeof PRIMES)[number];

/** 格子の縦軸に指定できる素数 p (仕様 §2.4) */
export const LATTICE_PRIMES = [5, 7, 11, 13, 17] as const;
export type LatticePrime = (typeof LATTICE_PRIMES)[number];

export type Monzo = Readonly<Partial<Record<Prime, number>>>;

/** 比 1 を表す monzo */
export const UNIT: Monzo = Object.freeze({});

/** 指数 0 のエントリを取り除いた正規形にする */
export const normalize = (m: Partial<Record<Prime, number>>): Monzo =>
  Object.fromEntries(Object.entries(m).filter(([, e]) => e !== 0)) as Monzo;

/** 素数 p の指数 (エントリがなければ 0) */
export const exponent = (m: Monzo, p: Prime): number => m[p] ?? 0;

/** monzo の積 (指数ごとの和)。比としては乗算。 */
export const mul = (a: Monzo, b: Monzo): Monzo =>
  normalize(Object.fromEntries(PRIMES.map((p) => [p, exponent(a, p) + exponent(b, p)])));

/** 逆数 (指数の符号反転) */
export const inverse = (m: Monzo): Monzo =>
  normalize(Object.fromEntries(PRIMES.map((p) => [p, -exponent(m, p)])));

export const equals = (a: Monzo, b: Monzo): boolean =>
  PRIMES.every((p) => exponent(a, p) === exponent(b, p));

/** monzo が表す比の数値 */
export const ratioValue = (m: Monzo): number =>
  PRIMES.reduce((acc, p) => acc * p ** exponent(m, p), 1);

/** 格子セル (x, y) の monzo: 3^x * p^y (仕様 §3) */
export const cellMonzo = (x: number, y: number, p: LatticePrime): Monzo =>
  normalize({ 3: x, [p]: y });

const SUPERSCRIPT_CHARS: Readonly<Record<string, string>> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

const superscript = (n: number): string =>
  String(n)
    .split("")
    .map((c) => SUPERSCRIPT_CHARS[c] ?? c)
    .join("");

/** セル表示用の monzo 文字列 (§3)。例: "1", "3·5⁻²", "3⁻¹·7" */
export const formatMonzo = (m: Monzo): string => {
  const entries = Object.entries(m).filter(([, e]) => e !== 0);
  if (entries.length === 0) return "1";
  return entries.map(([p, e]) => (e === 1 ? p : `${p}${superscript(e)}`)).join("·");
};
