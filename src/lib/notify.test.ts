import { beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import type { CellUpdate, SheetsBackend } from "./sheets";
import { buildDashboard } from "./model";
import { buildMessage, collectItems } from "./notify-model";

// ---- 送る内容 ----
const CAL_HEAD = ["投稿日", "ステータス", "投稿形式", "地域", "スポット", "切り口（1行目のフック）", "キャプション", "ハッシュタグ", "デザインURL", "投稿URL", "メモ"];
const LOG_HEAD = ["投稿日", "スポット", "投稿形式", "リーチ", "いいね", "保存", "シェア", "コメント", "プロフィールアクセス", "フォロー増", "保存率", "エンゲージ率", "記録日", "計測タイミング"];
const PERMIT_HEAD = ["依頼日", "スポット", "相手", "種別", "連絡手段", "連絡先・URL", "写真URL", "ステータス", "利用条件", "クレジット表記", "証拠の保存先", "メモ"];
const NOW = { today: 20261110, hour: 20, minute: 30 };
const cal = [
  CAL_HEAD,
  ["2026/11/09", "投稿済み", "カルーセル", "栃木", "日光、華厳の滝", "", "", "", "", "https://www.instagram.com/p/A/"],
  ["2026/11/12", "承認待ち", "カルーセル", "山梨", "河口湖"],
];

describe("通知の内容", () => {
  const d = buildDashboard(cal, [LOG_HEAD], [PERMIT_HEAD], NOW);
  const items = collectItems(d, NOW.today);
  it("やることを全部拾う", () => {
    expect(items.map((i) => i.key)).toEqual(["approve|20261112|3", "unscheduled|2026/11/10", "insight|20261109|24h"]);
  });
  it("まとめて1通、送ったものは次から送らない", () => {
    const m = buildMessage(items, new Set(), d)!;
    expect(m.title).toBe("こうきのやること：新しく3件");
    expect(m.body.split("\n")).toEqual(["確認して予約：11/12（木） 山梨", "3日以内で未予約が1件あります", "インサイト（24時間後）：11/9（月） 栃木"]);
    expect(m.url).toBe("/#approve");
    expect(buildMessage(items, new Set(items.map((i) => i.key)), d)).toBeNull();
  });
});

// ---- 「通知」タブへの書き込み ----
let grids: Record<string, string[][]>;
const writes: CellUpdate[][] = [];
const backend: SheetsBackend = {
  async batchGet(ranges) {
    return ranges.map((r) => {
      const tab = r.match(/^'(.+)'!/)![1];
      if (!grids[tab]) throw new Error("no tab");
      return grids[tab];
    });
  },
  async batchUpdate(data) {
    writes.push(data);
    for (const u of data) {
      const m = u.range.match(/^'(.+)'!([A-Z])(\d+)/)!;
      const g = grids[m[1]];
      const row = +m[3] - 1, col = m[2].charCodeAt(0) - 65;
      while (g.length <= row) g.push([]);
      u.values[0].forEach((v, j) => (g[row][col + j] = String(v)));
    }
  },
  async addSheet(title) {
    grids[title] = [];
  },
};
vi.mock("./sheets", async (orig) => ({ ...(await orig<typeof import("./sheets")>()), sheets: () => backend }));
vi.mock("./jst", async (orig) => ({ ...(await orig<typeof import("./jst")>()), jstNow: () => NOW }));
const send = vi.spyOn(webpush, "sendNotification");
const { addDevice, runNotify } = await import("./notify");

const SUB = { endpoint: "https://web.push.apple.com/abc", keys: { p256dh: "p", auth: "a" } };

beforeEach(() => {
  writes.length = 0;
  send.mockReset();
  send.mockResolvedValue({} as webpush.SendResult);
  grids = { 投稿カレンダー: cal, 分析ログ: [LOG_HEAD], 許諾管理: [PERMIT_HEAD] };
  const kp = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = kp.publicKey;
  process.env.VAPID_PRIVATE_KEY = kp.privateKey;
});

describe("通知タブ", () => {
  it("タブがなければ作って、端末を登録。二度目は登録しない", async () => {
    await addDevice(SUB);
    await addDevice(SUB);
    expect(grids["通知"][0]).toEqual(["種類", "値", "日時"]);
    expect(grids["通知"].filter((r) => r[0] === "端末").length).toBe(1);
  });
  it("送ったら送信済みを書き、2回目は送らない", async () => {
    await addDevice(SUB);
    expect(await runNotify()).toMatchObject({ sent: true, devices: 1, items: 3 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(grids["通知"].filter((r) => r[0] === "送信済み").length).toBe(3);
    expect(await runNotify()).toMatchObject({ sent: false });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("期限切れの端末は消し、送信済みにしない", async () => {
    await addDevice(SUB);
    send.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
    expect(await runNotify()).toMatchObject({ sent: false });
    expect(grids["通知"].some((r) => r[0] === "端末")).toBe(false);
    expect(grids["通知"].some((r) => r[0] === "送信済み")).toBe(false);
  });
  it("書き込むのは「通知」タブだけ", async () => {
    await addDevice(SUB);
    await runNotify();
    expect(writes.flat().every((w) => w.range.startsWith("'通知'!"))).toBe(true);
  });
});
