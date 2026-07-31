import { withApiErrors } from "../../../../../lib/server/api";
import { createGoogleAuthorization } from "../../../../../lib/server/google";
import { requireOwner } from "../../../../../lib/server/owner";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const authorizationUrl = await createGoogleAuthorization(request, owner);
    return Response.redirect(authorizationUrl, 302);
  });
}
