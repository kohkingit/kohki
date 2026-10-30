import { NextResponse } from "next/server";
import { loadDashboard } from "@/lib/actions";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await loadDashboard();
    return NextResponse.json({ data, loadedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
