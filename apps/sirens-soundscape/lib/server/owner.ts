import { ApiError } from "./api";
import {
  VERIFIED_OWNER_EMAIL_HEADER,
  VERIFIED_OWNER_ID_HEADER,
} from "./verified-owner";

export type OwnerIdentity = {
  id: string;
  email: string;
};

export function requireOwner(request: Request): OwnerIdentity {
  const id = request.headers.get(VERIFIED_OWNER_ID_HEADER)?.trim();
  const email = request.headers
    .get(VERIFIED_OWNER_EMAIL_HEADER)
    ?.trim()
    .toLowerCase();

  if (id && email) return { id, email };

  throw new ApiError(
    401,
    "authentication_required",
    "Sign in to access this private soundscape.",
  );
}
