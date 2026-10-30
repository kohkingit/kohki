// パスコード認証。正しいパスコードを入れると、署名つきの Cookie を渡す。
// middleware（Edge）と API（Node）の両方で動くように Web Crypto だけを使う。

export const COOKIE_NAME = "tsugidoko_auth";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180日

const enc = new TextEncoder();

async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function authConfigured(): boolean {
  return !!process.env.APP_PASSCODE?.trim() && !!process.env.AUTH_SECRET?.trim();
}

/** Cookie に入れる値。パスコードか AUTH_SECRET を変えると、今のログインは全部無効になる */
export async function sessionToken(): Promise<string> {
  const pass = process.env.APP_PASSCODE?.trim() ?? "";
  const secret = process.env.AUTH_SECRET?.trim() ?? "";
  return hmacHex(secret, `v1:${pass}`);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function isValidSession(cookie: string | undefined): Promise<boolean> {
  if (!cookie || !authConfigured()) return false;
  return safeEqual(cookie, await sessionToken());
}

export async function checkPasscode(input: string): Promise<boolean> {
  if (!authConfigured()) return false;
  const secret = process.env.AUTH_SECRET!.trim();
  // 長さの違いで時間差が出ないよう、ハッシュどうしで比べる
  const [a, b] = await Promise.all([hmacHex(secret, input.trim()), hmacHex(secret, process.env.APP_PASSCODE!.trim())]);
  return safeEqual(a, b);
}
