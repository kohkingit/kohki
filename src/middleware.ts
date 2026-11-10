import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, isValidSession } from "@/lib/auth";

// ログインなしで開けるもの
const PUBLIC = ["/login", "/api/login", "/api/cron/notify", "/manifest.webmanifest", "/sw.js", "/favicon.ico", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/icon.svg"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();

  // 書き込みは JSON の POST だけ受け付ける（他サイトのフォームから送らせない）
  if (req.method !== "GET" && req.method !== "HEAD" && !req.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: { code: "invalid", message: "不正なリクエストです。" } }, { status: 415 });
  }

  if (await isValidSession(req.cookies.get(COOKIE_NAME)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "ログインが切れました。ページを読み込み直して、パスコードを入れてください。" } },
      { status: 401 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
