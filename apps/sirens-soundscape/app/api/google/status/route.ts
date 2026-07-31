import { jsonResponse, withApiErrors } from "../../../../lib/server/api";
import { getGoogleStatus } from "../../../../lib/server/google";
import { requireOwner } from "../../../../lib/server/owner";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    return jsonResponse(await getGoogleStatus(owner));
  });
}
