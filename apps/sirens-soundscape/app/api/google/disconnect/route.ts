import { jsonResponse, withApiErrors } from "../../../../lib/server/api";
import { disconnectGoogle } from "../../../../lib/server/google";
import { requireOwner } from "../../../../lib/server/owner";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const revoked = await disconnectGoogle(owner);
    return jsonResponse({ ok: true, revoked });
  });
}
