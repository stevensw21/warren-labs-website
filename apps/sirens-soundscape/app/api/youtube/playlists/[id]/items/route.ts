import { jsonResponse, withApiErrors } from "../../../../../../lib/server/api";
import { requireOwner } from "../../../../../../lib/server/owner";
import { listYouTubePlaylistItems } from "../../../../../../lib/server/youtube";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const { id } = await context.params;
    return jsonResponse(await listYouTubePlaylistItems(owner, id));
  });
}
