import { savePostUrl } from "@/lib/actions";
import { errorResponse, ok, readJson, target } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const { row, date } = target(body);
    await savePostUrl(row, date, String(body.url ?? ""));
    return ok();
  } catch (e) {
    return errorResponse(e);
  }
}
