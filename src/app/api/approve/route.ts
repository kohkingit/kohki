import { markScheduled } from "@/lib/actions";
import { errorResponse, ok, readJson, target } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { row, date } = target(await readJson(req));
    await markScheduled(row, date);
    return ok();
  } catch (e) {
    return errorResponse(e);
  }
}
