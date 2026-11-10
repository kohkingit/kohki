import { NextResponse } from "next/server";
import { vapidPublicKey } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** 通知の公開鍵（端末の登録に使う）。未設定なら null */
export async function GET() {
  return NextResponse.json({ publicKey: vapidPublicKey(), cron: !!process.env.CRON_SECRET?.trim() }, { headers: { "Cache-Control": "no-store" } });
}
