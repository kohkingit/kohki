import { sendTest } from "@/lib/notify";
import { errorResponse, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await sendTest();
    return ok();
  } catch (e) {
    return errorResponse(e);
  }
}
