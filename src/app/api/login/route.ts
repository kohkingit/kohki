import { NextResponse } from "next/server";
import { authConfigured, checkPasscode, COOKIE_MAX_AGE, COOKIE_NAME, sessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: { message: "パスコードが設定されていません。.env.local（Vercelでは Environment Variables）に APP_PASSCODE と AUTH_SECRET を入れてください。" } },
      { status: 500 },
    );
  }
  let pass = "";
  try {
    pass = String(((await req.json()) as { passcode?: unknown }).passcode ?? "");
  } catch {
    /* 空として扱う */
  }
  if (!(await checkPasscode(pass))) {
    await new Promise((r) => setTimeout(r, 800)); // 総当たり対策で少し待たせる
    return NextResponse.json({ error: { message: "パスコードが違います。" } }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
