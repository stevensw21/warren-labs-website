import { jsonResponse, withApiErrors } from "../../../../lib/server/api";
import { requireOwner } from "../../../../lib/server/owner";
import { listYouTubePlaylists } from "../../../../lib/server/youtube";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    return jsonResponse(await listYouTubePlaylists(owner));
  });
}
