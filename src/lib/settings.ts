// 「設定」タブを読む（純粋関数）。
//   1行目：項目 / 値 / 説明 / 更新日
//   「テスト期間」の行：値＝ON（テスト期間中）か OFF（本番運用）
//   「ルール」の行から下：ルール / テスト期間ON / テスト期間OFF（本番）
import { colLetter, findCols, normHeader, SETTING_TEST_MODE, SETTINGS_HEADERS, TAB_SETTINGS, type Grid } from "./schema";

export type Mode = "test" | "live";

export interface Rule {
  name: string;
  test: string;
  live: string;
}

export interface Settings {
  /** 画面に出すモード。読めないときは test */
  mode: Mode;
  /** シートの値（ON / OFF）。読めないときは null */
  raw: string | null;
  /** 値が ON/OFF でない・タブが読めないなどのときの注意 */
  warning: string | null;
  updated: string;
  rules: Rule[];
  /** 書き込み先（ON/OFF と更新日）。書けない状態なら null */
  cells: { value: string; updated: string } | null;
}

export const SETTINGS_WARNING_PREFIX = "設定タブを確認してください。";

export function modeFromRaw(raw: string): Mode | null {
  const v = raw.normalize("NFKC").trim().toUpperCase();
  if (v === "ON") return "test";
  if (v === "OFF") return "live";
  return null;
}

export const modeLabel = (m: Mode) => (m === "test" ? "テスト期間中" : "本番運用");
export const modeRaw = (m: Mode) => (m === "test" ? "ON" : "OFF");

function fallback(reason: string, rules: Rule[] = []): Settings {
  return { mode: "test", raw: null, warning: `${SETTINGS_WARNING_PREFIX}${reason}（「テスト期間中」として表示しています）`, updated: "", rules, cells: null };
}

/** ルール表（「ルール」と書かれた行から下）を読む */
export function parseRules(grid: Grid): Rule[] {
  const at = grid.findIndex((r) => normHeader(r[0]) === "ルール");
  if (at < 0) return [];
  const head = grid[at].map(normHeader);
  const on = head.findIndex((h) => /^テスト期間ON/i.test(h));
  const off = head.findIndex((h) => /^テスト期間OFF/i.test(h));
  if (on < 0 || off < 0) return [];
  const out: Rule[] = [];
  for (const r of grid.slice(at + 1)) {
    const name = String(r[0] ?? "").trim();
    if (!name) break; // 空行で表は終わり
    out.push({ name, test: String(r[on] ?? "").trim(), live: String(r[off] ?? "").trim() });
  }
  return out;
}

export function parseSettings(grid: Grid | null): Settings {
  if (!grid) return fallback("設定タブが読めませんでした。");
  const rules = parseRules(grid);
  let c;
  try {
    c = findCols(TAB_SETTINGS, grid[0], SETTINGS_HEADERS);
  } catch {
    return fallback("1行目の見出し（項目・値・更新日）が見つかりません。", rules);
  }
  const i = grid.findIndex((r, idx) => idx > 0 && normHeader(r[c.item]) === normHeader(SETTING_TEST_MODE));
  if (i < 0) return fallback("「テスト期間」の行が見つかりません。", rules);
  const row = i + 1;
  const raw = String(grid[i][c.value] ?? "").trim();
  const cells = { value: `${colLetter(c.value)}${row}`, updated: `${colLetter(c.updated)}${row}` };
  const updated = String(grid[i][c.updated] ?? "").trim();
  const mode = modeFromRaw(raw);
  if (!mode) return { ...fallback(`「テスト期間」の値が「${raw || "空"}」になっています。ON か OFF にしてください。`, rules), raw, updated, cells };
  const warning = rules.length ? null : `${SETTINGS_WARNING_PREFIX}ルール表（「ルール」の行から下）が読めませんでした。`;
  return { mode, raw, warning, updated, rules, cells };
}

/** 今のモードのルールの値 */
export function ruleValue(s: Settings, name: string): string | null {
  const r = s.rules.find((x) => normHeader(x.name) === normHeader(name));
  if (!r) return null;
  return (s.mode === "test" ? r.test : r.live) || null;
}

/** 「月・水・金 20:00」などから投稿時刻を取り出す。なければ 20:00 */
export function postTime(s: Settings): { hour: number; minute: number } {
  const v = ruleValue(s, "投稿曜日・時刻") ?? "";
  const m = v.normalize("NFKC").match(/(\d{1,2})\s*[:時]\s*(\d{2})?/);
  if (m) {
    const hour = +m[1], minute = m[2] ? +m[2] : 0;
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }
  return { hour: 20, minute: 0 };
}
