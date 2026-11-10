// 通知に出す内容を組み立てる（純粋関数）。
// 一度通知したものは「送信済み」として覚えておき、同じことを何度も送らない。
// ただし「3日以内で未予約」は大事なので、1日1回まで毎日送る。
import type { Dashboard } from "./model";
import { fmtSheetDate, type DateKey } from "./jst";
import { modeLabel } from "./settings";

export interface NotifyItem {
  /** 送信済みかどうかを見分けるキー */
  key: string;
  /** 通知の本文に出す1行 */
  line: string;
}

export function collectItems(d: Dashboard, today: DateKey): NotifyItem[] {
  const out: NotifyItem[] = [];
  const spot = (s: string) => (s ? s.split("、")[0] : "");

  for (const t of d.approve)
    out.push({ key: `approve|${t.date}|${t.row}`, line: `確認して予約：${t.dateLabel.split(" ")[0]} ${t.area || spot(t.spots)}`.trim() });

  if (d.summary.unscheduledSoon > 0)
    out.push({ key: `unscheduled|${fmtSheetDate(today)}`, line: `3日以内で未予約が${d.summary.unscheduledSoon}件あります` });

  for (const t of d.url) out.push({ key: `url|${t.date}|${t.row}`, line: `投稿URLを入れる：${t.dateLabel.split(" ")[0]} ${t.area || spot(t.spots)}`.trim() });

  for (const t of d.insight)
    out.push({ key: `insight|${t.date}|${t.timing}`, line: `インサイト（${t.timingName}）：${t.dateLabel} ${t.area || spot(t.spots)}`.trim() });

  for (const t of d.permit) out.push({ key: `permit|${t.kind}|${t.title}`, line: t.title });

  return out;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** まだ送っていないものだけで、1通にまとめる。なければ null */
export function buildMessage(items: NotifyItem[], sent: Set<string>, d: Dashboard): PushMessage | null {
  const fresh = items.filter((i) => !sent.has(i.key));
  if (!fresh.length) return null;
  const lines = fresh.slice(0, 4).map((i) => i.line);
  if (fresh.length > 4) lines.push(`ほか${fresh.length - 4}件`);
  const mode = d.settings.mode === "live" ? `【${modeLabel("live")}】` : "";
  // 一番上に出したいセクションを開く
  const first = fresh[0].key.split("|")[0];
  const anchor = first === "insight" ? "#insight" : first === "url" ? "#url" : first === "permit" ? "#permit" : "#approve";
  return {
    title: `${mode}こうきのやること：新しく${fresh.length}件`,
    body: lines.join("\n"),
    url: `/${anchor}`,
    tag: "tsugidoko-todo",
  };
}
