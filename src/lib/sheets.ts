import "server-only";
import { JWT } from "google-auth-library";
import { AppError, sheetsHttpError, toAppError } from "./errors";
import { createMockBackend } from "./mock";

export type { Grid } from "./schema";
import type { Grid } from "./schema";

export interface CellUpdate {
  /** A1表記（シート名つき） */
  range: string;
  values: (string | number)[][];
}

export interface SheetsBackend {
  /** 複数範囲をまとめて読む（表示用の文字列で返す） */
  batchGet(ranges: string[]): Promise<Grid[]>;
  /** 複数セルをまとめて書く（ユーザーが入力したのと同じ扱い） */
  batchUpdate(data: CellUpdate[]): Promise<void>;
  /** タブを1つ追加する（「通知」タブがないときだけ使う） */
  addSheet(title: string): Promise<void>;
}

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const TIMEOUT_MS = 15000;

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim())
    throw new AppError("config", `環境変数 ${name} が設定されていません。.env.local（Vercelでは Environment Variables）に追加してください。`, 500);
  return v.trim();
}

export function spreadsheetId(): string {
  return process.env.SPREADSHEET_ID?.trim() || "1TqcoHaZjGDk1VMWm5O0uQKHCFJte1Q5oE_Gj6tjF_7U";
}

let jwt: JWT | null = null;
function client(): JWT {
  if (jwt) return jwt;
  const email = env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  // .env では改行を \n と書くので、本物の改行に戻す
  const key = env("GOOGLE_PRIVATE_KEY").replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  jwt = new JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return jwt;
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  let token: string | null | undefined;
  try {
    token = (await client().getAccessToken()).token;
  } catch (e) {
    throw toAppError(e);
  }
  if (!token) throw new AppError("auth", "Googleのアクセストークンが取れませんでした。サービスアカウントの設定を確認してください。", 502);

  let res: Response;
  try {
    res = await fetch(`${API}/${encodeURIComponent(spreadsheetId())}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))
      throw new AppError("network", "Google Sheets の応答がありませんでした（時間切れ）。電波を確認して「最新にする」を押してください。", 504);
    throw toAppError(e);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      detail = j.error?.message ?? "";
    } catch {
      /* 本文なし */
    }
    throw sheetsHttpError(res.status, detail);
  }
  return res.json();
}

const realBackend: SheetsBackend = {
  async addSheet(title) {
    await call(`:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }) });
  },
  async batchGet(ranges) {
    const q = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE", majorDimension: "ROWS" });
    ranges.forEach((r) => q.append("ranges", r));
    const j = (await call(`/values:batchGet?${q}`)) as { valueRanges?: { values?: unknown[][] }[] };
    return ranges.map((_, i) => (j.valueRanges?.[i]?.values ?? []).map((row) => row.map((c) => String(c ?? ""))));
  },
  async batchUpdate(data) {
    await call(`/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: data.map((d) => ({ ...d, majorDimension: "ROWS" })) }),
    });
  },
};

let mock: SheetsBackend | null = null;
export function sheets(): SheetsBackend {
  if (process.env.SHEETS_MOCK === "1") {
    if (process.env.VERCEL_ENV === "production")
      throw new AppError("config", "本番環境で SHEETS_MOCK=1 になっています。Vercel の Environment Variables から SHEETS_MOCK を消してください。", 500);
    return (mock ??= createMockBackend());
  }
  return realBackend;
}

/**
 * USER_ENTERED で書くとき、文字列が数式として解釈されないようにする。
 * 「=」「+」「-」「@」で始まる文字列は先頭に ' を付けて文字として書く。
 */
export function safeText(s: string): string {
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}
