import { NextResponse } from "next/server";
import { runNotify } from "@/lib/notify";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Vercel の定期実行（vercel.json の crons）から呼ばれる。
// Vercel は Authorization: Bearer <CRON_SECRET> を付けて呼ぶので、それを確かめる。
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: { message: "unauthorized" } }, { status: 401 });
  try {
    return NextResponse.json(await runNotify(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
