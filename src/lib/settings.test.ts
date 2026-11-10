import { describe, expect, it } from "vitest";
import { parseSettings, postTime, ruleValue } from "./settings";
import { buildDashboard } from "./model";

export const SETTINGS = [
  ["項目", "値", "説明", "更新日"],
  ["テスト期間", "ON", "説明", "2026/11/10"],
  ["", "", " "],
  ["ルール", "テスト期間ON", "テスト期間OFF（本番）"],
  ["投稿本数", "週3本（カルーセル）", "週7本（季節4・通年3）"],
  ["投稿曜日・時刻", "月・水・金 20:00", "毎日 21:30"],
  ["宿の紹介", "しない", "おまけ程度に入れてよい"],
];

describe("設定タブ", () => {
  it("ON はテスト期間中、書き込み先は B2 と D2", () => {
    const s = parseSettings(SETTINGS);
    expect(s.mode).toBe("test");
    expect(s.warning).toBeNull();
    expect(s.cells).toEqual({ value: "B2", updated: "D2" });
    expect(s.rules.map((r) => r.name)).toEqual(["投稿本数", "投稿曜日・時刻", "宿の紹介"]);
    expect(ruleValue(s, "投稿本数")).toBe("週3本（カルーセル）");
    expect(postTime(s)).toEqual({ hour: 20, minute: 0 });
  });
  it("OFF は本番運用、ルールは本番の列", () => {
    const s = parseSettings(SETTINGS.map((r, i) => (i === 1 ? ["テスト期間", "off", "", ""] : r)));
    expect(s.mode).toBe("live");
    expect(ruleValue(s, "宿の紹介")).toBe("おまけ程度に入れてよい");
    expect(postTime(s)).toEqual({ hour: 21, minute: 30 });
  });
  it("ON/OFF 以外ならテスト期間中として出して注意", () => {
    const s = parseSettings(SETTINGS.map((r, i) => (i === 1 ? ["テスト期間", "たぶん", "", ""] : r)));
    expect(s.mode).toBe("test");
    expect(s.warning).toMatch("設定タブを確認してください");
  });
  it("タブが読めないときもテスト期間中として出して注意", () => {
    const s = parseSettings(null);
    expect(s.mode).toBe("test");
    expect(s.warning).toMatch("設定タブを確認してください");
    expect(s.cells).toBeNull();
  });
  it("投稿時刻を設定から取って、投稿URLの判定に使う", () => {
    const head = ["投稿日", "ステータス", "投稿形式", "地域", "スポット", "切り口（1行目のフック）", "キャプション", "ハッシュタグ", "デザインURL", "投稿URL", "メモ"];
    const cal = [head, ["2026/11/10", "承認済み"]];
    const off = SETTINGS.map((r, i) => (i === 1 ? ["テスト期間", "OFF", "", ""] : r));
    const now = { today: 20261110, hour: 21, minute: 0 };
    expect(buildDashboard(cal, [], [], now, SETTINGS).url.length).toBe(1); // 20:00 を過ぎた
    const live = buildDashboard(cal, [], [], now, off);
    expect(live.url.length).toBe(0); // 本番は 21:30 なのでまだ
    expect(live.schedule).toEqual({ days: "毎日 21:30", count: "週7本（季節4・通年3）", time: "21:30" });
  });
});
