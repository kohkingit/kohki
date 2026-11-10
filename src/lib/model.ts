// シートの中身から「こうきのやること」を組み立てる（純粋関数。テストしやすいようにI/Oなし）。
import { daysBetween, fmtDate, fmtTime, isAfterPostTime, parseDate, type DateKey, type JstNow } from "./jst";
import { parseSettings, postTime, ruleValue, type Settings } from "./settings";
import { CAL_HEADERS, findCols, HeaderError, LOG_HEADERS, PERMIT_HEADERS, TAB_CAL, TAB_LOG, TAB_PERMIT } from "./schema";
import type { Grid } from "./schema";

export const BS_URL = "https://business.facebook.com/latest/content_calendar";
export const GMAIL_DRAFTS = "https://mail.google.com/mail/u/0/#drafts";
export const CANVA_FOLDER = "https://www.canva.com/folder/FAHZeg43jOc";

export interface CalRow {
  row: number; // シートの行番号（1始まり）
  date: DateKey;
  dateStr: string;
  status: string;
  type: string;
  area: string;
  spots: string;
  hook: string;
  caption: string;
  tags: string;
  design: string;
  url: string;
  memo: string;
}

const isSample = (memo: string) => /記入例/.test(memo);
const cell = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");

export function parseCalendar(grid: Grid): CalRow[] {
  const [head, ...rows] = grid;
  const c = findCols(TAB_CAL, head, CAL_HEADERS);
  const out: CalRow[] = [];
  rows.forEach((r, i) => {
    const memo = cell(r, c.memo);
    const date = parseDate(cell(r, c.date));
    if (!date || isSample(memo)) return;
    out.push({
      row: i + 2,
      date,
      dateStr: cell(r, c.date),
      status: cell(r, c.status),
      type: cell(r, c.type),
      area: cell(r, c.area),
      spots: cell(r, c.spots),
      hook: cell(r, c.hook),
      caption: String(r[c.caption] ?? ""),
      tags: cell(r, c.tags),
      design: cell(r, c.design),
      url: cell(r, c.url),
      memo,
    });
  });
  return out;
}

/** 分析ログに記録済みの投稿日 */
export function parseLoggedDates(grid: Grid): Set<DateKey> {
  const [head, ...rows] = grid;
  const c = findCols(TAB_LOG, head, LOG_HEADERS);
  const s = new Set<DateKey>();
  for (const r of rows) {
    const k = parseDate(cell(r, c.date));
    if (k) s.add(k);
  }
  return s;
}

/** キャプションの先頭・末尾に付いた余計な「"」を取り除く */
export function cleanCaption(t: string): string {
  return t.trim().replace(/^["“”]+/, "").replace(/["“”]+$/, "").trim();
}

/** コピーする文字列 ＝ キャプション + 空行 + ハッシュタグ */
export function copyText(caption: string, tags: string): string {
  const cap = cleanCaption(caption);
  const t = tags.trim();
  return cap && t ? `${cap}\n\n${t}` : cap || t;
}

export const INSTAGRAM_POST_RE = /^https:\/\/(www\.)?instagram\.com\/(p|reel|reels)\/[A-Za-z0-9_-]+\/?(\?[^\s]*)?$/;

/** https のURLだけリンクにする。@handle は Instagram のURLにする */
export function safeLink(s: string): string | null {
  const v = s.trim();
  if (/^https:\/\/\S+$/i.test(v)) return v;
  const h = v.match(/^@([A-Za-z0-9._]{1,30})$/);
  if (h) return `https://www.instagram.com/${h[1]}/`;
  if (/^(www\.)?instagram\.com\/\S+$/i.test(v)) return `https://${v}`;
  return null;
}

// ---------- 画面に出すデータ ----------

export interface ApproveTask {
  row: number; date: DateKey; dateLabel: string; type: string; area: string;
  daysLeft: number; urgent: boolean; hook: string; spots: string;
  designUrl: string | null; copyText: string;
}
export interface UrlTask { row: number; date: DateKey; dateLabel: string; type: string; area: string; spots: string; status: string }
export interface InsightTask {
  row: number; date: DateKey; dateLabel: string; type: string; area: string; spots: string;
  daysSince: number; urgent: boolean; postUrl: string | null;
}
export interface PermitTask { kind: "gmail" | "dm" | "dm-wait" | "upload"; title: string; sub: string; link: string | null; linkText: string }
export interface UpcomingItem { row: number; dateLabel: string; label: string; status: string; scheduled: boolean }

export interface Dashboard {
  approve: ApproveTask[];
  url: UrlTask[];
  insight: InsightTask[];
  insightError: string | null;
  permit: PermitTask[];
  permitError: string | null;
  upcoming: UpcomingItem[];
  summary: { total: number; unscheduledSoon: number; nextScheduled: string | null };
  settings: Settings;
  /** 今のモードの「投稿曜日・時刻」「投稿本数」（毎週の流れに出す） */
  schedule: { days: string | null; count: string | null; time: string };
}

const PREP_STATUSES = ["アイデア", "下書き", "画像作成中", "承認済み"];
const PERMIT_DONE = ["依頼済み", "許可", "条件付き許可", "断られた", "返信なし"];

export function buildPermitTasks(grid: Grid, cal: CalRow[], now: JstNow): PermitTask[] {
  const out: PermitTask[] = [];
  const [head, ...rows] = grid;
  const c = findCols(TAB_PERMIT, head, PERMIT_HEADERS);
  for (const r of rows) {
    const g = (k: keyof typeof c) => cell(r, c[k]);
    const memo = g("memo");
    if (isSample(memo) || !g("spot")) continue;
    const status = g("status");
    const isDM = /instagram\s*dm/i.test(g("via").normalize("NFKC"));
    const contact = safeLink(g("contact"));
    // メールの下書きができているのに、まだ送っていない（依頼済み以降のステータスになっていない）
    if (/Gmail下書き作成済み/.test(memo) && !PERMIT_DONE.includes(status)) {
      out.push({ kind: "gmail", title: `メールの下書きを送信：${g("spot")}`, sub: g("who") ? `宛先 ${g("who")}。送ったら許諾管理のステータスを「依頼済み」に` : "送ったら許諾管理のステータスを「依頼済み」に", link: GMAIL_DRAFTS, linkText: "Gmailの下書き" });
    }
    if (isDM && status === "候補") {
      out.push({ kind: "dm", title: `DMで許諾をお願いする：${g("spot")}`, sub: `${g("who") || "相手"}　文面はAIがメモに用意。送ったらチャットで「DM送った」と伝える`, link: contact, linkText: "相手のInstagram" });
    }
    if (isDM && status === "依頼済み") {
      const k = parseDate(g("date"));
      if (k && daysBetween(k, now.today) >= 5) {
        out.push({ kind: "dm-wait", title: `DMの返事は来た？：${g("spot")}`, sub: `${g("who") || "相手"}　依頼から${daysBetween(k, now.today)}日。来ていたらスクショをチャットに送る`, link: contact, linkText: "相手のInstagram" });
      }
    }
  }
  for (const r of cal) {
    for (const m of r.memo.matchAll(/写真がCanvaにない\s*[:：]\s*([^\n。]+)/g)) {
      out.push({ kind: "upload", title: `Canvaに写真をアップロード：${m[1].trim()}`, sub: `${fmtDate(r.date)}の投稿用。「次どこ行く_許可済み写真」フォルダへ、許諾管理のCanva素材名で`, link: CANVA_FOLDER, linkText: "Canvaのフォルダ" });
    }
  }
  return out;
}

export function buildDashboard(calGrid: Grid, logGrid: Grid, permitGrid: Grid, now: JstNow, settingsGrid: Grid | null = null): Dashboard {
  const settings = parseSettings(settingsGrid);
  const time = postTime(settings); // 投稿時刻は設定タブの「投稿曜日・時刻」から（なければ 20:00）
  const pt = fmtTime(time);
  const cal = parseCalendar(calGrid); // 見出しがなければここで HeaderError（画面全体をエラーに）
  const byDate = (a: CalRow, b: CalRow) => a.date - b.date || a.row - b.row;

  const approve: ApproveTask[] = cal
    .filter((r) => r.status === "承認待ち")
    .sort(byDate)
    .map((r) => {
      const daysLeft = daysBetween(now.today, r.date);
      return {
        row: r.row, date: r.date, dateLabel: `${fmtDate(r.date)} ${pt}`, type: r.type || "カルーセル", area: r.area,
        daysLeft, urgent: daysLeft <= 3, hook: r.hook, spots: r.spots,
        designUrl: safeLink(r.design), copyText: copyText(r.caption, r.tags),
      };
    });

  const url: UrlTask[] = cal
    .filter((r) => (r.status === "承認済み" || r.status === "投稿済み") && isAfterPostTime(r.date, now, time) && !r.url)
    .sort(byDate)
    .map((r) => ({ row: r.row, date: r.date, dateLabel: `${fmtDate(r.date)} ${pt}`, type: r.type || "カルーセル", area: r.area, spots: r.spots, status: r.status }));

  let insight: InsightTask[] = [];
  let insightError: string | null = null;
  try {
    const logged = parseLoggedDates(logGrid);
    insight = cal
      .filter((r) => (r.status === "投稿済み" || !!r.url) && r.status !== "見送り" && daysBetween(r.date, now.today) >= 3 && !logged.has(r.date))
      .sort(byDate)
      .map((r) => {
        const d = daysBetween(r.date, now.today);
        return { row: r.row, date: r.date, dateLabel: fmtDate(r.date), type: r.type || "カルーセル", area: r.area, spots: r.spots, daysSince: d, urgent: d >= 7, postUrl: safeLink(r.url) };
      });
  } catch (e) {
    if (!(e instanceof HeaderError)) throw e;
    insightError = e.message;
  }

  let permit: PermitTask[] = [];
  let permitError: string | null = null;
  try {
    permit = buildPermitTasks(permitGrid, cal, now);
  } catch (e) {
    if (!(e instanceof HeaderError)) throw e;
    permitError = e.message;
  }

  const upcoming: UpcomingItem[] = cal
    .filter((r) => r.date >= now.today && PREP_STATUSES.includes(r.status))
    .sort(byDate)
    .slice(0, 8)
    .map((r) => ({
      row: r.row, dateLabel: fmtDate(r.date),
      label: [r.area, r.spots].filter(Boolean).join("｜"),
      status: r.status === "承認済み" ? "予約済み" : r.status, scheduled: r.status === "承認済み",
    }));

  // 3日以内（今日〜3日後、過ぎたものも含む）に投稿日が来るのに、まだ予約されていない投稿
  const unscheduledSoon = cal.filter(
    (r) => daysBetween(now.today, r.date) <= 3 && !isAfterPostTime(r.date, now, time) && !["承認済み", "投稿済み", "見送り"].includes(r.status),
  ).length;

  const next = cal
    .filter((r) => r.status === "承認済み" && !isAfterPostTime(r.date, now, time))
    .sort(byDate)[0];

  return {
    approve, url, insight, insightError, permit, permitError, upcoming, settings,
    schedule: { days: ruleValue(settings, "投稿曜日・時刻"), count: ruleValue(settings, "投稿本数"), time: pt },
    summary: {
      total: approve.length + url.length + insight.length + permit.length,
      unscheduledSoon,
      nextScheduled: next ? `${fmtDate(next.date)} ${pt}` : null,
    },
  };
}
