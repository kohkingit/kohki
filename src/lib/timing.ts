// インサイトの計測タイミング（24h・72h・7d など）。設定タブのルール「インサイト記録」から読む。
import { daysBetween, parseDate, type DateKey, type JstNow, type PostTime } from "./jst";
import { findCols, LOG_HEADERS, TAB_LOG, type Grid } from "./schema";
import { ruleValue, type Settings } from "./settings";

export interface Timing {
  /** 分析ログの「計測タイミング」に書く文字（24h / 72h / 7d） */
  label: string;
  hours: number;
}

export const DEFAULT_TIMINGS: Timing[] = [
  { label: "24h", hours: 24 },
  { label: "72h", hours: 72 },
  { label: "7d", hours: 168 },
];

/** 「24h・72h・7dの3回」→ [24h, 72h, 7d]。読めなければ初期値 */
export function parseTimings(s: Settings): Timing[] {
  const v = (ruleValue(s, "インサイト記録") ?? "").normalize("NFKC");
  const out: Timing[] = [];
  for (const m of v.matchAll(/(\d+)\s*(h|d|時間|日)/gi)) {
    const n = +m[1];
    const day = /^(d|日)$/i.test(m[2]);
    const t = { label: `${n}${day ? "d" : "h"}`, hours: day ? n * 24 : n };
    if (t.hours > 0 && !out.some((x) => x.hours === t.hours)) out.push(t);
  }
  return out.length ? out.sort((a, b) => a.hours - b.hours) : DEFAULT_TIMINGS;
}

/** 表記ゆれをそろえる（「24H」「24時間」→「24h」、「7日」→「7d」） */
export function normTiming(s: unknown): string {
  const v = String(s ?? "").normalize("NFKC").trim().toLowerCase();
  const m = v.match(/^(\d+)\s*(h|d|時間|日)/);
  if (!m) return v;
  return `${+m[1]}${/^(d|日)$/.test(m[2]) ? "d" : "h"}`;
}

/** 計測タイミングが空の古い行は、以前の「3日後に1回」の記録として 72h 扱い */
const LEGACY = "72h";

export const pairKey = (date: DateKey, label: string) => `${date}|${normTiming(label)}`;

/** 分析ログに記録済みの（投稿日, タイミング） */
export function parseLoggedPairs(grid: Grid): Set<string> {
  const [head, ...rows] = grid;
  const c = findCols(TAB_LOG, head, LOG_HEADERS);
  const s = new Set<string>();
  for (const r of rows) {
    const k = parseDate(r[c.date]);
    if (k) s.add(pairKey(k, String(r[c.timing] ?? "").trim() || LEGACY));
  }
  return s;
}

/** 投稿時刻からの経過時間（時間） */
export function hoursSince(date: DateKey, t: PostTime, now: JstNow): number {
  return daysBetween(date, now.today) * 24 + (now.hour * 60 + now.minute - (t.hour * 60 + t.minute)) / 60;
}

/**
 * 今記録すべきタイミング。過ぎたもののうち、まだ記録していない一番新しいもの。
 * それより前の記録していないタイミングは、数字が変わってしまうので「省略」にする。
 */
export function dueTiming(timings: Timing[], elapsed: number, logged: (label: string) => boolean): { due: Timing; skipped: Timing[] } | null {
  const passed = timings.filter((t) => elapsed >= t.hours);
  const lastLogged = passed.reduce((i, t, idx) => (logged(t.label) ? idx : i), -1);
  const open = passed.slice(lastLogged + 1);
  if (!open.length) return null;
  return { due: open[open.length - 1], skipped: open.slice(0, -1) };
}

/** 24h → 「24時間後」、7d → 「7日後」 */
export function timingName(t: Timing): string {
  return t.label.endsWith("d") ? `${t.hours / 24}日後` : `${t.hours}時間後`;
}
