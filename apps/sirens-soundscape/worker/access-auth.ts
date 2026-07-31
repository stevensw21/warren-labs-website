import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import {
  VERIFIED_OWNER_EMAIL_HEADER,
  VERIFIED_OWNER_ID_HEADER,
} from "../lib/server/verified-owner";

export type AccessEnvironment = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_ALLOWED_EMAIL?: string;
  SOUNDSCAPE_OWNER_ID?: string;
  PUBLIC_APP_ORIGIN?: string;
  LOCAL_AUTH_BYPASS?: string;
};

type AccessJwks = JWTVerifyGetKey;

const remoteJwksByUrl = new Map<string, AccessJwks>();
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const untrustedIdentityHeaders = [
  "oai-authenticated-user-id",
  "oai-authenticated-user-email",
  "oai-authenticated-user-full-name",
  "cf-access-authenticated-user-email",
  VERIFIED_OWNER_ID_HEADER,
  VERIFIED_OWNER_EMAIL_HEADER,
];

export async function authenticateAccessRequest(
  request: Request,
  env: AccessEnvironment,
  jwksOverride?: AccessJwks,
): Promise<Request | Response> {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (isLoopbackHostname(hostname) && env.LOCAL_AUTH_BYPASS === "true") {
    return verifiedRequest(request, {
      id: cleanValue(env.SOUNDSCAPE_OWNER_ID) ?? "local-development-owner",
      email:
        normalizeEmail(env.ACCESS_ALLOWED_EMAIL) ??
        "local-owner@sirens-soundscape.invalid",
    });
  }

  const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const audience = cleanValue(env.ACCESS_AUD);
  const allowedEmail = normalizeEmail(env.ACCESS_ALLOWED_EMAIL);
  const ownerId = cleanValue(env.SOUNDSCAPE_OWNER_ID);
  const publicOrigin = normalizeOrigin(env.PUBLIC_APP_ORIGIN);

  if (!teamDomain || !audience || !allowedEmail || !ownerId || !publicOrigin) {
    return denied(503, "Soundscape authentication is not configured.");
  }

  if (unsafeMethods.has(request.method.toUpperCase())) {
    const requestOrigin = normalizeOrigin(request.headers.get("origin"));
    if (requestOrigin !== publicOrigin) {
      return denied(403, "This request is not allowed.");
    }
  }

  const token = request.headers.get("cf-access-jwt-assertion")?.trim();
  if (!token) {
    return denied(403, "A valid Soundscape sign-in is required.");
  }

  try {
    const jwks = jwksOverride ?? remoteJwks(teamDomain);
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
      issuer: teamDomain,
      audience,
    });
    const email = normalizeEmail(payload.email);

    if (
      payload.type !== "app" ||
      !cleanValue(payload.sub) ||
      !email ||
      email !== allowedEmail ||
      !isFiniteNumber(payload.iat) ||
      !isFiniteNumber(payload.nbf) ||
      !isFiniteNumber(payload.exp)
    ) {
      return denied(403, "A valid Soundscape sign-in is required.");
    }

    return verifiedRequest(request, { id: ownerId, email });
  } catch {
    return denied(403, "A valid Soundscape sign-in is required.");
  }
}

function remoteJwks(teamDomain: string): AccessJwks {
  const url = `${teamDomain}/cdn-cgi/access/certs`;
  let jwks = remoteJwksByUrl.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    remoteJwksByUrl.set(url, jwks);
  }
  return jwks;
}

function verifiedRequest(
  request: Request,
  identity: { id: string; email: string },
): Request {
  const headers = new Headers(request.headers);
  for (const header of untrustedIdentityHeaders) headers.delete(header);
  headers.delete("cf-access-jwt-assertion");
  headers.set(VERIFIED_OWNER_ID_HEADER, identity.id);
  headers.set(VERIFIED_OWNER_EMAIL_HEADER, identity.email);
  return new Request(request, { headers });
}

function denied(status: number, message: string): Response {
  return Response.json(
    { error: { code: "access_denied", message } },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}

function normalizeTeamDomain(value: unknown): string | null {
  const origin = normalizeOrigin(value);
  if (!origin) return null;
  const url = new URL(origin);
  return url.protocol === "https:" &&
    url.hostname.endsWith(".cloudflareaccess.com")
    ? origin
    : null;
}

function normalizeOrigin(value: unknown): string | null {
  const cleaned = cleanValue(value);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    return url.username || url.password || url.search || url.hash
      ? null
      : url.origin;
  } catch {
    return null;
  }
}

function normalizeEmail(value: unknown): string | null {
  const cleaned = cleanValue(value)?.toLowerCase();
  return cleaned && cleaned.includes("@") ? cleaned : null;
}

function cleanValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}
