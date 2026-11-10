import { describe, expect, it } from "vitest";
import { buildDashboard, cleanCaption, copyText, INSTAGRAM_POST_RE, safeLink } from "./model";
import { colLetter, findCols, HeaderError } from "./schema";
import { jstNow, parseDate } from "./jst";

const CAL_HEAD = ["投稿日", "曜日", "ステータス", "投稿形式", "地域", "スポット", "テーマ・季節", "切り口（1行目のフック）", "キャプション", "ハッシュタグ", "素材URL", "素材の出典・権利", "デザインURL", "投稿URL", "メモ"];
const LOG_HEAD = ["投稿日", "スポット", "投稿形式", "リーチ", "いいね", "保存", "シェア", "コメント", "プロフィールアクセス", "フォロー増", "保存率", "エンゲージ率", "記録日", "計測タイミング"];
const PERMIT_HEAD = ["依頼日", "スポット", "相手", "種別", "連絡手段", "連絡先・URL", "写真URL", "ステータス", "利用条件", "クレジット表記", "証拠の保存先", "メモ", "Canva素材名", "依頼ID", "再利用可否"];

// 2026/11/01（日）18:00 JST
const NOW = { today: 20261101, hour: 18, minute: 0 };
const cal = (date: string, status: string, extra: Partial<Record<string, string>> = {}) => {
  const r = Array(15).fill("");
  r[0] = date; r[2] = status; r[3] = "カルーセル"; r[4] = "長野"; r[5] = "上高地";
  for (const [k, v] of Object.entries(extra)) r[CAL_HEAD.indexOf(k)] = v!;
  return r;
};

describe("jst", () => {
  it("UTCの夜は日本時間の翌日", () => {
    expect(jstNow(new Date("2026-11-01T15:30:00Z"))).toEqual({ today: 20261102, hour: 0, minute: 30 });
  });
  it("日付を読む", () => {
    expect(parseDate("2026/11/02")).toBe(20261102);
    expect(parseDate("2026-1-2")).toBe(20260102);
    expect(parseDate("")).toBeNull();
  });
});

describe("schema", () => {
  it("見出しがなければエラー", () => {
    expect(() => findCols("x", ["投稿日"], { a: "投稿日", b: "ステータス" })).toThrow(HeaderError);
  });
  it("列の位置が変わっても見出しで探す", () => {
    expect(findCols("x", ["メモ", "投稿日"], { d: "投稿日", m: "メモ" })).toEqual({ d: 1, m: 0 });
  });
  it("列記号", () => {
    expect([0, 25, 26, 51].map(colLetter)).toEqual(["A", "Z", "AA", "AZ"]);
  });
});

describe("caption", () => {
  it("前後の \" を取り除いて、空行をはさんでハッシュタグ", () => {
    expect(cleanCaption('"こんにちは\n2行目"')).toBe("こんにちは\n2行目");
    expect(copyText('"本文"', "#a #b")).toBe("本文\n\n#a #b");
    expect(copyText("本文", "")).toBe("本文");
  });
});

describe("links", () => {
  it("InstagramのURLだけ通す", () => {
    expect(INSTAGRAM_POST_RE.test("https://www.instagram.com/p/AbC_1-2/")).toBe(true);
    expect(INSTAGRAM_POST_RE.test("https://www.instagram.com/reel/AbC/?igsh=xx")).toBe(true);
    expect(INSTAGRAM_POST_RE.test("https://instagram.com/p/AbC")).toBe(true);
    expect(INSTAGRAM_POST_RE.test("http://www.instagram.com/p/AbC/")).toBe(false);
    expect(INSTAGRAM_POST_RE.test("https://www.instagram.com/tsugi_doko47/")).toBe(false);
    expect(INSTAGRAM_POST_RE.test("https://example.com/p/AbC/")).toBe(false);
  });
  it("javascript: などはリンクにしない", () => {
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("@izu_trip")).toBe("https://www.instagram.com/izu_trip/");
  });
});

describe("buildDashboard", () => {
  const grid = [
    CAL_HEAD,
    cal("2026/10/01", "投稿済み", { メモ: "記入例" }),
    cal("2026/10/20", "投稿済み", { 投稿URL: "https://www.instagram.com/p/A/" }), // 12日前・未記録 → インサイト（目立たせる）
    cal("2026/10/27", "投稿済み", { 投稿URL: "https://www.instagram.com/p/B/" }), // 記録済み
    cal("2026/10/29", "承認済み"), // 投稿時刻を過ぎた・URLなし → URL / 3日前 & URLなし → インサイト対象外
    cal("2026/11/01", "承認済み"), // 今日だけど20時前 → まだ
    cal("2026/11/03", "承認待ち", { キャプション: '"本文"', ハッシュタグ: "#x" }), // 2日後 → 目立つ
    cal("2026/11/09", "承認待ち"), // 8日後 → 普通
    cal("2026/11/04", "画像作成中"), // 3日以内・未予約
    cal("2026/11/06", "アイデア", { メモ: "写真がCanvaにない: 大正池" }),
    cal("2026/11/07", "見送り"),
  ];
  const log = [LOG_HEAD, ["2026/10/27", "上高地", "カルーセル", "100"]];
  const permit = [
    PERMIT_HEAD,
    ["", "A滝", "観光協会", "", "メール", "a@example.jp", "", "候補", "", "", "", "Gmail下書き作成済み"],
    ["", "B池", "観光協会", "", "メール", "", "", "依頼済み", "", "", "", "Gmail下書き作成済み"],
    ["", "C山", "@c_photo", "", "Instagram DM", "@c_photo", "", "候補"],
    ["2026/10/25", "D湖", "@d", "", "Instagram DM", "https://www.instagram.com/d/", "", "依頼済み"],
    ["2026/10/30", "E川", "@e", "", "Instagram DM", "", "", "依頼済み"],
    ["", "F", "", "", "Instagram DM", "", "", "候補", "", "", "", "記入例"],
  ];
  const d = buildDashboard(grid, log, permit, NOW);

  it("確認して予約する：承認待ちを日付順、3日以内は目立たせる", () => {
    expect(d.approve.map((a) => [a.date, a.daysLeft, a.urgent])).toEqual([[20261103, 2, true], [20261109, 8, false]]);
    expect(d.approve[0].dateLabel).toBe("11/3（火） 20:00");
    expect(d.approve[0].copyText).toBe("本文\n\n#x");
  });
  it("投稿URLを入れる：20:00を過ぎてURLが空", () => {
    expect(d.url.map((u) => u.date)).toEqual([20261029]);
    const after = buildDashboard(grid, log, permit, { ...NOW, hour: 20 });
    expect(after.url.map((u) => u.date)).toEqual([20261029, 20261101]);
  });
  it("インサイト：投稿済みかURLあり、過ぎたタイミングで未記録のもの", () => {
    expect(d.insight.map((i) => [i.date, i.daysSince, i.urgent])).toEqual([[20261020, 12, true]]);
    // 12日たっているので 7d を記録。24h・72h は過ぎたので省略。10/27 は 72h 記録済み（タイミング空＝72h扱い）で 7d はまだ
    expect(d.insight[0]).toMatchObject({ timing: "7d", skipped: ["24h", "72h"] });
  });
  it("許諾まわり", () => {
    expect(d.permit.map((p) => p.kind + ":" + p.title)).toEqual([
      "gmail:メールの下書きを送信：A滝",
      "dm:DMで許諾をお願いする：C山",
      "dm-wait:DMの返事は来た？：D湖",
      "upload:Canvaに写真をアップロード：大正池",
    ]);
    expect(d.permit[1].link).toBe("https://www.instagram.com/c_photo/");
  });
  it("AIが準備中：今日以降の4ステータス、承認済みは予約済み", () => {
    expect(d.upcoming.map((u) => [u.dateLabel, u.status])).toEqual([
      ["11/1（日）", "予約済み"], ["11/4（水）", "画像作成中"], ["11/6（金）", "アイデア"],
    ]);
  });
  it("サマリー", () => {
    expect(d.summary).toEqual({ total: 2 + 1 + 1 + 4, unscheduledSoon: 2, nextScheduled: "11/1（日） 20:00" });
  });
  it("投稿カレンダーの見出しがなければエラー", () => {
    expect(() => buildDashboard([CAL_HEAD.filter((h) => h !== "ステータス")], log, permit, NOW)).toThrow(HeaderError);
  });
  it("分析ログの見出しがなければ、その欄だけエラー", () => {
    const x = buildDashboard(grid, [["投稿日"]], permit, NOW);
    expect(x.insightError).toMatch("リーチ");
    expect(x.approve.length).toBe(2);
  });
});

describe("計測タイミング", () => {
  const head = ["投稿日", "ステータス", "投稿形式", "地域", "スポット", "切り口（1行目のフック）", "キャプション", "ハッシュタグ", "デザインURL", "投稿URL", "メモ"];
  const cal = [head, ["2026/11/01", "投稿済み", "カルーセル"]];
  const log = (...t: string[]) => [LOG_HEAD, ...t.map((x) => ["2026/11/01", "", "", "", "", "", "", "", "", "", "", "", "", x])];
  const at = (day: number, hour: number) => ({ today: 20261100 + day, hour, minute: 0 });
  const due = (l: string[][], now: { today: number; hour: number; minute: number }) =>
    buildDashboard(cal, l, [PERMIT_HEAD], now).insight.map((i) => [i.timing, i.urgent]);
  it("24時間たつまでは出ない", () => expect(due(log(), at(2, 19))).toEqual([]));
  it("24時間で24h", () => expect(due(log(), at(2, 20))).toEqual([["24h", false]]));
  it("24hを入れたら72hまで出ない", () => expect(due(log("24h"), at(3, 20))).toEqual([]));
  it("72時間で72h", () => expect(due(log("24h"), at(4, 20))).toEqual([["72h", false]]));
  it("7日で7d、1日遅れで目立たせる", () => expect(due(log("24h", "72h"), at(9, 21))).toEqual([["7d", true]]));
  it("全部入れたら出ない", () => expect(due(log("24h", "72h", "7d"), at(20, 0))).toEqual([]));
});
