import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CellUpdate, SheetsBackend } from "./sheets";

// シートを差し替えて、書き込みルールを確かめる
let grids: Record<string, string[][]>;
const writes: CellUpdate[][] = [];
const backend: SheetsBackend = {
  async batchGet(ranges) {
    return ranges.map((r) => {
      const m = r.match(/^'(.+)'!A(\d+):AZ(\d+)?$/)!;
      const g = grids[m[1]];
      const from = +m[2] - 1;
      const to = m[3] ? +m[3] : g.length;
      return g.slice(from, to);
    });
  },
  async batchUpdate(data) {
    writes.push(data);
  },
};
vi.mock("./sheets", async (orig) => ({ ...(await orig<typeof import("./sheets")>()), sheets: () => backend }));
vi.mock("./jst", async (orig) => ({ ...(await orig<typeof import("./jst")>()), jstNow: () => ({ today: 20261101, hour: 21, minute: 0 }) }));

const { markScheduled, savePostUrl, recordInsight, parseMetrics } = await import("./actions");

const CAL_HEAD = ["投稿日", "曜日", "ステータス", "投稿形式", "地域", "スポット", "テーマ・季節", "切り口（1行目のフック）", "キャプション", "ハッシュタグ", "素材URL", "素材の出典・権利", "デザインURL", "投稿URL", "メモ"];
const LOG_HEAD = ["投稿日", "スポット", "投稿形式", "リーチ", "いいね", "保存", "シェア", "コメント", "プロフィールアクセス", "フォロー増", "保存率", "エンゲージ率", "記録日"];
const M = { reach: "100", like: "10", save: "5", share: "1", comment: "0", profile: "3", follow: "1" };

beforeEach(() => {
  writes.length = 0;
  grids = {
    投稿カレンダー: [
      CAL_HEAD,
      ["2026/11/03", "火", "承認待ち", "カルーセル", "長野", "上高地"],
      ["2026/10/29", "木", "承認済み", "カルーセル", "岐阜", "=白川郷"],
      ["2026/10/25", "日", "投稿済み", "リール", "京都", "嵐山", "", "", "", "", "", "", "", "https://www.instagram.com/p/X/"],
    ],
    分析ログ: [LOG_HEAD, ["2026/10/20", "a", "b", "1", "1", "1", "1", "1", "1", "1", "1%", "1%", "2026/10/24"], ["", "", "", "", "", "", "", "", "", "", "0%", "0%", ""]],
    許諾管理: [[]],
  };
});

describe("承認済みにする", () => {
  it("ステータスのセルだけ書く", async () => {
    await markScheduled(2, 20261103);
    expect(writes).toEqual([[{ range: "'投稿カレンダー'!C2", values: [["承認済み"]] }]]);
  });
  it("投稿日が違えば書かない", async () => {
    await expect(markScheduled(2, 20261104)).rejects.toMatchObject({ code: "changed" });
    expect(writes).toEqual([]);
  });
  it("見出しがなければ書かない", async () => {
    grids["投稿カレンダー"][0] = CAL_HEAD.map((h) => (h === "ステータス" ? "状態" : h));
    await expect(markScheduled(2, 20261103)).rejects.toThrow("ステータス");
    expect(writes).toEqual([]);
  });
});

describe("投稿URL", () => {
  it("URLとステータスだけ書く", async () => {
    await savePostUrl(3, 20261029, "https://www.instagram.com/p/ABC/");
    expect(writes).toEqual([[
      { range: "'投稿カレンダー'!N3", values: [["https://www.instagram.com/p/ABC/"]] },
      { range: "'投稿カレンダー'!C3", values: [["投稿済み"]] },
    ]]);
  });
  it("Instagram以外のURLはエラー", async () => {
    await expect(savePostUrl(3, 20261029, "https://example.com/p/ABC/")).rejects.toMatchObject({ code: "invalid" });
    expect(writes).toEqual([]);
  });
});

describe("インサイト", () => {
  it("最初の空き行に A〜J と M だけ書く（K・Lは触らない）", async () => {
    await recordInsight(4, 20261025, parseMetrics(M));
    const ranges = writes[0].map((w) => w.range);
    expect(ranges).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "M"].map((c) => `'分析ログ'!${c}3`));
    expect(writes[0].map((w) => w.values[0][0])).toEqual(["2026/10/25", "嵐山", "リール", 100, 10, 5, 1, 0, 3, 1, "2026/11/01"]);
  });
  it("同じ投稿日があれば書かない", async () => {
    grids["分析ログ"].push(["2026/10/25"]);
    await expect(recordInsight(4, 20261025, parseMetrics(M))).rejects.toMatchObject({ code: "duplicate" });
    expect(writes).toEqual([]);
  });
  it("数式に見える文字は文字として書く", async () => {
    grids["投稿カレンダー"][2][2] = "投稿済み";
    await recordInsight(3, 20261029, parseMetrics(M));
    expect(writes[0][1].values[0][0]).toBe("'=白川郷");
  });
  it("数字が欠けていたらエラー", () => {
    expect(() => parseMetrics({ ...M, follow: "" })).toThrow("フォロー増");
    expect(() => parseMetrics({ ...M, like: "-1" })).toThrow("いいね");
    expect(parseMetrics({ ...M, reach: "１,２００" }).reach).toBe(1200);
  });
});
