import "server-only";
// プッシュ通知。
// 「通知」タブに、通知を送る端末（種類＝端末）と、送った内容（種類＝送信済み）を1行ずつ書く。
// このアプリが「通知」タブ以外に通知のことで書き込むことはない。
import webpush from "web-push";
import { loadDashboard } from "./actions";
import { AppError } from "./errors";
import { jstNow } from "./jst";
import { buildMessage, collectItems, type PushMessage } from "./notify-model";
import { a1, colLetter, findCols, normHeader, type Grid } from "./schema";
import { sheets } from "./sheets";

export const TAB_NOTIFY = "通知";
const HEADERS = { kind: "種類", value: "値", at: "日時" } as const;
const KIND_DEVICE = "端末";
const KIND_SENT = "送信済み";

function vapid() {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv)
    throw new AppError("config", "通知の鍵（VAPID_PUBLIC_KEY・VAPID_PRIVATE_KEY）が設定されていません。アプリの「通知」欄の「通知の鍵を作る」で作って、Vercel の Environment Variables に入れてください。", 500);
  return { pub, priv, subject: process.env.VAPID_SUBJECT?.trim() || "mailto:info.tsugidoko@gmail.com" };
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function nowStr() {
  const d = new Date(Date.now() + 9 * 3600e3);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

interface NotifyState {
  grid: Grid;
  cols: { kind: number; value: number; at: number };
  devices: { row: number; sub: webpush.PushSubscription }[];
  sent: Set<string>;
}

/** 「通知」タブを読む。なければ作って見出しを書く */
async function readState(): Promise<NotifyState> {
  let grid: Grid;
  try {
    [grid] = await sheets().batchGet([a1(TAB_NOTIFY, "A1:C5000")]);
  } catch (e) {
    try {
      await sheets().addSheet(TAB_NOTIFY);
    } catch {
      throw e;
    }
    grid = [];
  }
  if (!grid.length || grid[0].every((c) => !String(c ?? "").trim())) {
    await sheets().batchUpdate([{ range: a1(TAB_NOTIFY, "A1:C1"), values: [[HEADERS.kind, HEADERS.value, HEADERS.at]] }]);
    grid = [[HEADERS.kind, HEADERS.value, HEADERS.at]];
  }
  const cols = findCols(TAB_NOTIFY, grid[0], HEADERS);
  const devices: NotifyState["devices"] = [];
  const sent = new Set<string>();
  grid.slice(1).forEach((r, i) => {
    const kind = normHeader(r[cols.kind]);
    const value = String(r[cols.value] ?? "").trim();
    if (!value) return;
    if (kind === KIND_DEVICE) {
      try {
        const sub = JSON.parse(value) as webpush.PushSubscription;
        if (sub?.endpoint?.startsWith("https://")) devices.push({ row: i + 2, sub });
      } catch {
        /* 読めない行は無視 */
      }
    } else if (kind === KIND_SENT) sent.add(value);
  });
  return { grid, cols, devices, sent };
}

/** 空いている行（種類・値・日時がすべて空）を順に返す */
function emptyRows(st: NotifyState, n: number): number[] {
  const out: number[] = [];
  const { kind, value, at } = st.cols;
  st.grid.slice(1).forEach((r, i) => {
    if (out.length < n && [kind, value, at].every((c) => !String(r[c] ?? "").trim())) out.push(i + 2);
  });
  let next = st.grid.length + 1;
  while (out.length < n) out.push(next++);
  return out;
}

function rowWrite(st: NotifyState, row: number, values: [string, string, string]) {
  const { kind, value, at } = st.cols;
  return ([kind, value, at] as const).map((c, i) => ({ range: a1(TAB_NOTIFY, `${colLetter(c)}${row}`), values: [[values[i]]] }));
}

/** この端末を通知先として登録する */
export async function addDevice(input: unknown): Promise<void> {
  const sub = input as webpush.PushSubscription;
  if (!sub || typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth)
    throw new AppError("invalid", "通知の登録情報が読めませんでした。もう一度「通知をオンにする」を押してください。", 400);
  const st = await readState();
  if (st.devices.some((d) => d.sub.endpoint === sub.endpoint)) return; // 登録済み
  const [row] = emptyRows(st, 1);
  const clean = { endpoint: sub.endpoint, expirationTime: sub.expirationTime ?? null, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
  await sheets().batchUpdate(rowWrite(st, row, [KIND_DEVICE, JSON.stringify(clean), nowStr()]));
}

/** 全端末に送る。期限切れの端末は「通知」タブから消す。届いた端末の数を返す */
async function sendAll(st: NotifyState, msg: PushMessage): Promise<number> {
  if (!st.devices.length) return 0;
  const v = vapid();
  webpush.setVapidDetails(v.subject, v.pub, v.priv);
  let ok = 0;
  const gone: number[] = [];
  await Promise.all(
    st.devices.map(async (d) => {
      try {
        await webpush.sendNotification(d.sub, JSON.stringify(msg), { TTL: 6 * 3600, urgency: "normal" });
        ok++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(d.row);
        else console.error("通知を送れませんでした", code, e);
      }
    }),
  );
  if (gone.length) await sheets().batchUpdate(gone.flatMap((row) => rowWrite(st, row, ["", "", ""])));
  return ok;
}

/** 今のやることのうち、まだ通知していないものを1通にまとめて送る（定期実行から呼ぶ） */
export async function runNotify(): Promise<{ sent: boolean; devices: number; items: number }> {
  const [d, st] = await Promise.all([loadDashboard(), readState()]);
  const items = collectItems(d, jstNow().today);
  const msg = buildMessage(items, st.sent, d);
  if (!msg || !st.devices.length) return { sent: false, devices: st.devices.length, items: 0 };
  const delivered = await sendAll(st, msg);
  if (delivered > 0) {
    // 送ったものを覚えておく（次からは送らない）
    const fresh = items.filter((i) => !st.sent.has(i.key));
    const rows = emptyRows(st, fresh.length);
    const at = nowStr();
    await sheets().batchUpdate(fresh.flatMap((i, n) => rowWrite(st, rows[n], [KIND_SENT, i.key, at])));
  }
  return { sent: delivered > 0, devices: delivered, items: items.filter((i) => !st.sent.has(i.key)).length };
}

/** テスト通知 */
export async function sendTest(): Promise<number> {
  const st = await readState();
  if (!st.devices.length) throw new AppError("invalid", "通知を受け取る端末がまだありません。先に「通知をオンにする」を押してください。", 400);
  const n = await sendAll(st, { title: "こうきのやること", body: "テスト通知です。届いていれば準備OK 👍", url: "/", tag: "tsugidoko-test" });
  if (!n) throw new AppError("network", "通知を送れませんでした。もう一度「通知をオンにする」を押してから試してください。", 502);
  return n;
}
