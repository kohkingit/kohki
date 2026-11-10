import { addDevice } from "@/lib/notify";
import { errorResponse, ok, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    await addDevice(body.subscription);
    return ok();
  } catch (e) {
    return errorResponse(e);
  }
}
