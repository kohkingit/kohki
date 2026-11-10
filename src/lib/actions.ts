import "server-only";
// シートへの読み書き。書き込むのは次の3つだけ：
//   投稿カレンダーの「ステータス」「投稿URL」、分析ログの新しい行。
// 書く直前に必ずその行を読み直し、投稿日が画面に出ていたものと同じか確かめる。
import { AppError, MSG_CHANGED } from "./errors";
import { fmtSheetDate, jstNow, parseDate, type DateKey } from "./jst";
import { buildDashboard, INSTAGRAM_POST_RE, type Dashboard } from "./model";
import { a1, CAL_HEADERS, colLetter, findCols, LOG_HEADERS, METRICS, normHeader, TAB_CAL, TAB_LOG, TAB_PERMIT, TAB_SETTINGS, type Grid, type MetricKey } from "./schema";
import { modeFromRaw, modeLabel, modeRaw, parseSettings, postTime, type Mode } from "./settings";
import { hoursSince, normTiming, pairKey, parseLoggedPairs, parseTimings, timingName } from "./timing";
import { safeText, sheets, type CellUpdate } from "./sheets";

const LAST_COL = "AZ";

/** 設定タブを読む。読めなければ null（画面は「テスト期間中」として出し、注意を出す） */
async function readSettingsGrid(): Promise<Grid | null> {
  try {
    const [g] = await sheets().batchGet([a1(TAB_SETTINGS, "A1:Z100")]);
    return g;
  } catch (e) {
    console.warn("設定タブが読めません", e);
    return null;
  }
}

export async function loadDashboard(): Promise<Dashboard> {
  const [[cal, log, permit], settings] = await Promise.all([
    sheets().batchGet([a1(TAB_CAL, `A1:${LAST_COL}`), a1(TAB_LOG, `A1:${LAST_COL}`), a1(TAB_PERMIT, `A1:${LAST_COL}`)]),
    readSettingsGrid(),
  ]);
  return buildDashboard(cal, log, permit, jstNow(), settings);
}

/**
 * テスト期間の ON/OFF を切り替える。書くのは「テスト期間」の行の 値（B2）と 更新日（D2）だけ。
 * 書く直前に読み直し、画面に出ていた値と違えば書かない。
 */
export async function switchMode(shownRaw: string, to: Mode): Promise<void> {
  const [grid] = await sheets().batchGet([a1(TAB_SETTINGS, "A1:Z100")]);
  const s = parseSettings(grid);
  if (!s.cells)
    throw new AppError("header", `設定タブを確認してください。${s.warning ?? ""}（このままでは書き込みません）`, 500);
  const cur = (s.raw ?? "").normalize("NFKC").trim().toUpperCase();
  if (!modeFromRaw(cur))
    throw new AppError("header", `設定タブを確認してください。「テスト期間」の値が「${s.raw || "空"}」です。シートで ON か OFF に直してください（このままでは書き込みません）。`, 500);
  if (cur !== shownRaw.normalize("NFKC").trim().toUpperCase()) throw new AppError("changed", MSG_CHANGED, 409);
  if (modeFromRaw(cur) === to) throw new AppError("changed", `もう「${modeLabel(to)}」になっています。「最新にする」を押してください。`, 409);
  await sheets().batchUpdate([
    { range: a1(TAB_SETTINGS, s.cells.value), values: [[modeRaw(to)]] },
    { range: a1(TAB_SETTINGS, s.cells.updated), values: [[fmtSheetDate(jstNow().today)]] },
  ]);
}

/** 投稿カレンダーの見出しと1行を読み直し、投稿日が同じか確かめる */
async function readCalRow(row: number, expectDate: DateKey) {
  if (!Number.isInteger(row) || row < 2 || row > 100000) throw new AppError("invalid", "行番号がおかしいです。「最新にする」を押してください。", 400);
  const [head, line] = await sheets().batchGet([a1(TAB_CAL, `A1:${LAST_COL}1`), a1(TAB_CAL, `A${row}:${LAST_COL}${row}`)]);
  const c = findCols(TAB_CAL, head[0], CAL_HEADERS);
  const r = line[0] ?? [];
  const get = (i: number) => String(r[i] ?? "").trim();
  if (parseDate(get(c.date)) !== expectDate || /記入例/.test(get(c.memo))) throw new AppError("changed", MSG_CHANGED, 409);
  return {
    cols: c,
    status: get(c.status),
    url: get(c.url),
    spots: get(c.spots),
    type: get(c.type),
  };
}

/** 承認待ち → 承認済み */
export async function markScheduled(row: number, date: DateKey): Promise<void> {
  const cur = await readCalRow(row, date);
  if (cur.status === "承認済み") return; // もう承認済み（二度押しなど）
  if (cur.status !== "承認待ち") throw new AppError("changed", MSG_CHANGED, 409);
  await sheets().batchUpdate([{ range: a1(TAB_CAL, `${colLetter(cur.cols.status)}${row}`), values: [["承認済み"]] }]);
}

/** 投稿URLを書いて、ステータスを投稿済みにする */
export async function savePostUrl(row: number, date: DateKey, url: string): Promise<void> {
  const v = url.trim();
  if (!INSTAGRAM_POST_RE.test(v))
    throw new AppError("invalid", "InstagramのURL（https://www.instagram.com/p/… または /reel/…）を貼ってください。Instagramで投稿の「…」→「リンクをコピー」で取れます。", 400);
  const cur = await readCalRow(row, date);
  if (cur.status !== "承認済み" && cur.status !== "投稿済み") throw new AppError("changed", MSG_CHANGED, 409);
  if (cur.url && cur.url !== v) throw new AppError("changed", "この投稿にはもう別の投稿URLが入っています。「最新にする」を押して確認してください。", 409);
  await sheets().batchUpdate([
    { range: a1(TAB_CAL, `${colLetter(cur.cols.url)}${row}`), values: [[v]] },
    { range: a1(TAB_CAL, `${colLetter(cur.cols.status)}${row}`), values: [["投稿済み"]] },
  ]);
}

export type Metrics = Record<MetricKey, number>;

export function parseMetrics(input: unknown): Metrics {
  const src = (input ?? {}) as Record<string, unknown>;
  const out = {} as Metrics;
  const bad: string[] = [];
  for (const m of METRICS) {
    const raw = String(src[m.key] ?? "").normalize("NFKC").replace(/,/g, "").trim();
    if (!/^\d{1,9}$/.test(raw)) bad.push(m.header);
    else out[m.key] = Number(raw);
  }
  if (bad.length) throw new AppError("invalid", `「${bad.join("」「")}」に0以上の整数を入れてください（0でもOK）。`, 400);
  return out;
}

/** 分析ログの最初の空き行に1行書く（保存率・エンゲージ率などの数式列は触らない） */
export async function recordInsight(row: number, date: DateKey, timing: string, metrics: Metrics): Promise<void> {
  const cur = await readCalRow(row, date);
  if (cur.status !== "投稿済み" && !cur.url) throw new AppError("changed", MSG_CHANGED, 409);

  // 計測タイミングは設定タブのルール「インサイト記録」にあるものだけ。まだその時間になっていなければ書かない
  const settings = parseSettings(await readSettingsGrid());
  const t = parseTimings(settings).find((x) => x.label === normTiming(timing));
  if (!t) throw new AppError("changed", MSG_CHANGED, 409);
  if (hoursSince(date, postTime(settings), jstNow()) < t.hours)
    throw new AppError("invalid", `まだ投稿から${timingName(t)}になっていません。時間がたってから記録してください。`, 400);

  const [log] = await sheets().batchGet([a1(TAB_LOG, `A1:${LAST_COL}`)]);
  const c = findCols(TAB_LOG, log[0], LOG_HEADERS);
  // 念のため：書く列が数式列（保存率・エンゲージ率）と重なっていないか
  const formulaCols = (log[0] ?? []).map(normHeader).flatMap((h, i) => (h === "保存率" || h === "エンゲージ率" ? [i] : []));
  if (Object.values(c).some((i) => formulaCols.includes(i)))
    throw new AppError("header", "分析ログの見出しがおかしいです（数式の列と重なっています）。シートを確認してください。", 500);

  // 書く直前に、同じ投稿日・同じタイミングがないか再確認（二重記録しない）
  const rows = log.slice(1);
  if (parseLoggedPairs(log).has(pairKey(date, t.label)))
    throw new AppError("duplicate", `この投稿の${t.label}はもう分析ログに記録されています。「最新にする」を押してください。`, 409);

  // 最初の空き行：このアプリが書く列がすべて空の行
  const writeCols = Object.values(c);
  let idx = rows.findIndex((r) => writeCols.every((i) => !String(r[i] ?? "").trim()));
  if (idx < 0) idx = rows.length;
  const target = idx + 2;

  const values: [number, string | number][] = [
    [c.date, fmtSheetDate(date)],
    [c.spots, safeText(cur.spots)],
    [c.type, safeText(cur.type || "カルーセル")],
    ...METRICS.map((m) => [c[m.key], metrics[m.key]] as [number, number]),
    [c.recorded, fmtSheetDate(jstNow().today)],
    [c.timing, t.label],
  ];
  const data: CellUpdate[] = values.map(([col, v]) => ({ range: a1(TAB_LOG, `${colLetter(col)}${target}`), values: [[v]] }));
  await sheets().batchUpdate(data);
}
