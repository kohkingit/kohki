import { parseMetrics, recordInsight } from "@/lib/actions";
import { errorResponse, ok, readJson, target } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const { row, date } = target(body);
    const metrics = parseMetrics(body.metrics);
    await recordInsight(row, date, metrics);
    return ok();
  } catch (e) {
    return errorResponse(e);
  }
}
