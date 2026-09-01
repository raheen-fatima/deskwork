export const URDU_MAP = {
  // Lowercase letters
  a: '\u0627',
  // ا
  b: '\u0628',
  // ب
  c: '\u0686',
  // چ
  d: '\u062F',
  // د
  e: '\u0639',
  // ع
  f: '\u0641',
  // ف
  g: '\u06AF',
  // گ
  h: '\u06C1',
  // ہ
  i: '\u06CC',
  // ی
  j: '\u062C',
  // ج
  k: '\u06A9',
  // ک
  l: '\u0644',
  // ل
  m: '\u0645',
  // م
  n: '\u0646',
  // ن
  o: '\u06BE',
  // ھ
  p: '\u067E',
  // پ
  q: '\u0642',
  // ق
  r: '\u0631',
  // ر
  s: '\u0633',
  // س
  t: '\u062A',
  // ت
  u: '\u064F',
  // ُ
  v: '\u0637',
  // ط
  w: '\u0648',
  // و
  x: '\u064B',
  // ً
  y: '\u06CC',
  // ی
  z: '\u0632',
  // ز
  // Shift / uppercase letters
  A: '\u0622',
  // آ
  B: '\u062B',
  // ث
  C: '\u0635',
  // ص
  D: '\u0688',
  // ڈ
  E: '\u0621',
  // ء
  F: '\u0636',
  // ض
  G: '\u063A',
  // غ
  H: '\u062D',
  // ح
  I: '\u0626',
  // ئ
  J: '\u0698',
  // ژ
  K: '\u062E',
  // خ
  L: '\u0644',
  // ل
  M: '\u0645',
  // م
  N: '\u06BA',
  // ں
  O: '\u06C3',
  // ۃ
  P: '\u067E',
  // پ
  Q: '\u0642',
  // ق
  R: '\u0691',
  // ڑ
  S: '\u0634',
  // ش
  T: '\u0679',
  // ٹ
  U: '\u064C',
  // ٌ
  V: '\u0638',
  // ظ
  W: '\u0624',
  // ؤ
  X: '\u064D',
  // ٍ
  Y: '\u06D2',
  // ے
  Z: '\u0630',
  // ذ
  // Document punctuation
  ',': '\u060C',
  // ،
  '.': '\u06D4',
  // ۔
  ';': '\u061B',
  // ؛
  '?': '\u061F',
  // ؟
  '[': '\u064E',
  // َ
  ']': '\u0650',
  // ِ
  '\\': '\u064F',
  // ُ
  '`': '\u0651' // ّ
};

export function isAsciiLetter(ch) {
  return ch.length === 1 && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
}

export function mapKeyForTarget(key, lang, lettersOnly) {
  if (lang !== 'ur') return key;
  if (lettersOnly && !isAsciiLetter(key)) return key;
  return Object.prototype.hasOwnProperty.call(URDU_MAP, key) ? URDU_MAP[key] : key;
}
