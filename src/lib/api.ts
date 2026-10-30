import "server-only";
import { NextResponse } from "next/server";
import { AppError, toAppError } from "./errors";
import { HeaderError } from "./schema";
import { parseDate, type DateKey } from "./jst";

export function errorResponse(e: unknown) {
  const err = e instanceof HeaderError ? new AppError("header", e.message, 500) : toAppError(e);
  if (err.code === "unknown") console.error(e);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status, headers: { "Cache-Control": "no-store" } });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    if (j && typeof j === "object") return j as Record<string, unknown>;
  } catch {
    /* fallthrough */
  }
  throw new AppError("invalid", "送られてきたデータが読めませんでした。ページを読み込み直してください。", 400);
}

/** 画面に出ていた行番号と投稿日 */
export function target(body: Record<string, unknown>): { row: number; date: DateKey } {
  const row = Number(body.row);
  // 日付は 20261102（数値）でも "2026/11/02" でも受け付ける
  const n = Number(body.date);
  const date = Number.isInteger(n) && n > 19000101 && n < 30000101 ? parseDate(`${Math.floor(n / 10000)}/${Math.floor(n / 100) % 100}/${n % 100}`) : parseDate(body.date);
  if (!Number.isInteger(row) || !date) throw new AppError("invalid", "どの投稿か分かりませんでした。「最新にする」を押してください。", 400);
  return { row, date };
}

export const ok = () => NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
