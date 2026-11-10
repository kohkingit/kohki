// シートのタブ名と見出し。列は見出し名で探す（列番号を決め打ちしない）。

export const TAB_CAL = "投稿カレンダー";
export const TAB_LOG = "分析ログ";
export const TAB_PERMIT = "許諾管理";

export const CAL_HEADERS = {
  date: "投稿日",
  status: "ステータス",
  type: "投稿形式",
  area: "地域",
  spots: "スポット",
  hook: "切り口（1行目のフック）",
  caption: "キャプション",
  tags: "ハッシュタグ",
  design: "デザインURL",
  url: "投稿URL",
  memo: "メモ",
} as const;

export const METRICS = [
  { key: "reach", header: "リーチ" },
  { key: "like", header: "いいね" },
  { key: "save", header: "保存" },
  { key: "share", header: "シェア" },
  { key: "comment", header: "コメント" },
  { key: "profile", header: "プロフィールアクセス" },
  { key: "follow", header: "フォロー増" },
] as const;
export type MetricKey = (typeof METRICS)[number]["key"];

export const LOG_HEADERS = {
  date: "投稿日",
  spots: "スポット",
  type: "投稿形式",
  reach: "リーチ",
  like: "いいね",
  save: "保存",
  share: "シェア",
  comment: "コメント",
  profile: "プロフィールアクセス",
  follow: "フォロー増",
  recorded: "記録日",
} as const;

export const PERMIT_HEADERS = {
  date: "依頼日",
  spot: "スポット",
  who: "相手",
  via: "連絡手段",
  contact: "連絡先・URL",
  status: "ステータス",
  memo: "メモ",
} as const;

export class HeaderError extends Error {
  constructor(public tab: string, public missing: string[]) {
    super(
      `「${tab}」タブの1行目に見出し「${missing.join("」「")}」が見つかりません。` +
        `シートの見出しが変わっていないか確認してください（このままでは書き込みません）。`,
    );
  }
}

/** 見出しの表記ゆれ（全角/半角・空白）を吸収して比べる */
export function normHeader(s: unknown): string {
  return String(s ?? "").normalize("NFKC").replace(/\s+/g, "").trim();
}

export type Cols<T extends Record<string, string>> = { [K in keyof T]: number };

/** 見出し行から列番号（0始まり）を探す。1つでもなければ HeaderError */
export function findCols<T extends Record<string, string>>(
  tab: string,
  headerRow: unknown[] | undefined,
  spec: T,
): Cols<T> {
  const heads = (headerRow ?? []).map(normHeader);
  const out = {} as Cols<T>;
  const missing: string[] = [];
  for (const [k, name] of Object.entries(spec)) {
    const want = normHeader(name);
    let i = heads.indexOf(want);
    // 「切り口（1行目のフック）」のような長い見出しは、括弧の前の部分でも探す
    if (i < 0) {
      const short = want.replace(/\(.*$/, "");
      if (short && short !== want) i = heads.findIndex((h) => h.replace(/\(.*$/, "") === short);
    }
    if (i < 0) missing.push(name);
    (out as Record<string, number>)[k] = i;
  }
  if (missing.length) throw new HeaderError(tab, missing);
  return out;
}

/** 0始まりの列番号 → A, B, …, Z, AA, … */
export function colLetter(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** シート名入りのA1表記（'投稿カレンダー'!C5） */
export function a1(tab: string, ref: string): string {
  return `'${tab.replace(/'/g, "''")}'!${ref}`;
}

/** シートから読んだ値（行 × 列、すべて文字列） */
export type Grid = string[][];

export const TAB_SETTINGS = "設定";

export const SETTINGS_HEADERS = {
  item: "項目",
  value: "値",
  updated: "更新日",
} as const;

/** 設定タブで「テスト期間」の行を探すときの項目名 */
export const SETTING_TEST_MODE = "テスト期間";
