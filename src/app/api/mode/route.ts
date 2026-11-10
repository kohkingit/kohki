import { switchMode } from "@/lib/actions";
import { errorResponse, ok, readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const to = body.to === "test" || body.to === "live" ? body.to : null;
    if (!to) throw new AppError("invalid", "切り替え先が分かりませんでした。「最新にする」を押してください。", 400);
    await switchMode(String(body.shown ?? ""), to);
    return ok();
  } catch (e) {
    return errorResponse(e);
  }
}
