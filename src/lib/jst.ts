// 日付はすべて日本時間（Asia/Tokyo）で扱う。
// 日付は yyyymmdd の数値キー（例 20261102）で比較する。

const JST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 864e5;
const WEEKDAYS = "日月火水木金土";

export type DateKey = number;

export interface JstNow {
  today: DateKey;
  hour: number;
  minute: number;
}

export function jstNow(now: Date = new Date()): JstNow {
  const d = new Date(now.getTime() + JST_OFFSET_MS);
  return {
    today: d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** 「2026/11/02」「2026-11-2」などを日付キーにする。読めなければ null */
export function parseDate(s: unknown): DateKey | null {
  const m = String(s ?? "").match(/(\d{4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y * 10000 + mo * 100 + d;
}

function keyToUTC(k: DateKey): number {
  return Date.UTC(Math.floor(k / 10000), (Math.floor(k / 100) % 100) - 1, k % 100);
}

/** b - a の日数 */
export function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((keyToUTC(b) - keyToUTC(a)) / DAY_MS);
}

/** 11/2（月） */
export function fmtDate(k: DateKey): string {
  const d = new Date(keyToUTC(k));
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAYS[d.getUTCDay()]}）`;
}

/** 2026/11/02 */
export function fmtSheetDate(k: DateKey): string {
  const y = Math.floor(k / 10000);
  const m = Math.floor(k / 100) % 100;
  const d = k % 100;
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

export interface PostTime {
  hour: number;
  minute: number;
}

/** 投稿時刻の初期値（設定タブに書かれていないとき） */
export const DEFAULT_POST_TIME: PostTime = { hour: 20, minute: 0 };

export const fmtTime = (t: PostTime) => `${t.hour}:${String(t.minute).padStart(2, "0")}`;

/** 投稿日の投稿時刻（初期値 20:00）を過ぎているか */
export function isAfterPostTime(date: DateKey, now: JstNow, t: PostTime = DEFAULT_POST_TIME): boolean {
  return date < now.today || (date === now.today && now.hour * 60 + now.minute >= t.hour * 60 + t.minute);
}
