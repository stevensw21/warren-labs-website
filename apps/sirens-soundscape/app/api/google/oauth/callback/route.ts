import { ApiError, withApiErrors } from "../../../../../lib/server/api";
import {
  completeGoogleAuthorization,
  consumeGoogleOauthState,
} from "../../../../../lib/server/google";
import { requireOwner } from "../../../../../lib/server/owner";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const url = new URL(request.url);
    const stateValue = url.searchParams.get("state") ?? "";
    const oauthState = await consumeGoogleOauthState(stateValue, owner);
    const googleError = url.searchParams.get("error");
    if (googleError) {
      throw new ApiError(
        400,
        "google_authorization_denied",
        "Google authorization was cancelled or denied.",
        { reason: googleError },
      );
    }

    await completeGoogleAuthorization(
      url.searchParams.get("code") ?? "",
      oauthState,
      owner,
    );

    const destination = new URL(oauthState.return_path, request.url);
    destination.searchParams.set("google", "connected");
    return Response.redirect(destination.toString(), 303);
  });
}
