import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWTVerifyGetKey,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  VERIFIED_OWNER_EMAIL_HEADER,
  VERIFIED_OWNER_ID_HEADER,
} from "../lib/server/verified-owner";
import {
  authenticateAccessRequest,
  type AccessEnvironment,
} from "../worker/access-auth";

const TEAM_DOMAIN = "https://warren-labs.cloudflareaccess.com";
const AUDIENCE = "test-application-audience";
const OWNER_EMAIL = "owner@example.com";
const OWNER_ID = "soundscape-owner-v1";

const environment: AccessEnvironment = {
  ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
  ACCESS_AUD: AUDIENCE,
  ACCESS_ALLOWED_EMAIL: OWNER_EMAIL,
  SOUNDSCAPE_OWNER_ID: OWNER_ID,
  PUBLIC_APP_ORIGIN: "https://soundscape.warren-labs.com",
};

let privateKey: CryptoKey;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  jwks = createLocalJWKSet({
    keys: [{ ...publicJwk, alg: "RS256", kid: "soundscape-test-key" }],
  });
});

describe("Cloudflare Access authentication", () => {
  it("accepts a valid owner token and replaces untrusted identity headers", async () => {
    const request = authenticatedRequest(await signToken(), {
      "oai-authenticated-user-id": "forged-oai-owner",
      "oai-authenticated-user-email": "attacker@example.com",
      [VERIFIED_OWNER_ID_HEADER]: "forged-internal-owner",
      [VERIFIED_OWNER_EMAIL_HEADER]: "attacker@example.com",
    });

    const result = await authenticateAccessRequest(request, environment, jwks);

    expect(result).toBeInstanceOf(Request);
    if (!(result instanceof Request)) return;
    expect(result.headers.get(VERIFIED_OWNER_ID_HEADER)).toBe(OWNER_ID);
    expect(result.headers.get(VERIFIED_OWNER_EMAIL_HEADER)).toBe(OWNER_EMAIL);
    expect(result.headers.get("oai-authenticated-user-id")).toBeNull();
    expect(result.headers.get("cf-access-jwt-assertion")).toBeNull();
  });

  it.each([
    ["wrong issuer", { issuer: "https://other.cloudflareaccess.com" }],
    ["wrong audience", { audience: "another-application" }],
    ["wrong email", { email: "attacker@example.com" }],
    ["missing email", { email: null }],
    ["missing subject", { subject: null }],
    ["global session token", { type: "org" }],
    ["service token", { email: null, subject: "" }],
    ["expired token", { expiresAt: -30 }],
    ["future token", { notBefore: 300 }],
  ])("rejects a %s", async (_name, overrides) => {
    const result = await authenticateAccessRequest(
      authenticatedRequest(await signToken(overrides)),
      environment,
      jwks,
    );

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) expect(result.status).toBe(403);
  });

  it("rejects a token signed by an untrusted key", async () => {
    const otherPair = await generateKeyPair("RS256");
    const result = await authenticateAccessRequest(
      authenticatedRequest(
        await signToken({ signingKey: otherPair.privateKey }),
      ),
      environment,
      jwks,
    );

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) expect(result.status).toBe(403);
  });

  it("fails closed when required production configuration is missing", async () => {
    const result = await authenticateAccessRequest(
      authenticatedRequest(await signToken()),
      {},
      jwks,
    );

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) expect(result.status).toBe(503);
  });

  it("rejects forged headers when no signed Access token is present", async () => {
    const result = await authenticateAccessRequest(
      new Request("https://soundscape.warren-labs.com/api/scenes", {
        headers: {
          [VERIFIED_OWNER_ID_HEADER]: "forged-owner",
          [VERIFIED_OWNER_EMAIL_HEADER]: OWNER_EMAIL,
        },
      }),
      environment,
      jwks,
    );

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) expect(result.status).toBe(403);
  });

  it("requires the production origin for unsafe requests", async () => {
    const result = await authenticateAccessRequest(
      authenticatedRequest(await signToken(), {}, "POST"),
      environment,
      jwks,
    );

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) expect(result.status).toBe(403);
  });

  it("allows local development only with an explicit loopback bypass", async () => {
    const localRequest = new Request("http://localhost:3000/api/scenes");
    const denied = await authenticateAccessRequest(localRequest, {}, jwks);
    const allowed = await authenticateAccessRequest(
      localRequest,
      { LOCAL_AUTH_BYPASS: "true" },
      jwks,
    );
    const remote = await authenticateAccessRequest(
      new Request("https://soundscape.warren-labs.com/api/scenes"),
      { LOCAL_AUTH_BYPASS: "true" },
      jwks,
    );

    expect(denied).toBeInstanceOf(Response);
    expect(allowed).toBeInstanceOf(Request);
    expect(remote).toBeInstanceOf(Response);
  });
});

function authenticatedRequest(
  token: string,
  extraHeaders: HeadersInit = {},
  method = "GET",
): Request {
  const headers = new Headers(extraHeaders);
  headers.set("cf-access-jwt-assertion", token);
  return new Request("https://soundscape.warren-labs.com/api/scenes", {
    method,
    headers,
  });
}

type TokenOverrides = {
  issuer?: string;
  audience?: string;
  email?: string | null;
  subject?: string | null;
  type?: string;
  expiresAt?: number;
  notBefore?: number;
  signingKey?: CryptoKey;
};

async function signToken(overrides: TokenOverrides = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const token = new SignJWT({
    type: overrides.type ?? "app",
    ...(overrides.email === null
      ? {}
      : { email: overrides.email ?? OWNER_EMAIL }),
  })
    .setProtectedHeader({ alg: "RS256", kid: "soundscape-test-key" })
    .setIssuer(overrides.issuer ?? TEAM_DOMAIN)
    .setAudience(overrides.audience ?? AUDIENCE)
    .setIssuedAt(now)
    .setNotBefore(now + (overrides.notBefore ?? -1))
    .setExpirationTime(now + (overrides.expiresAt ?? 300));

  if (overrides.subject !== null) {
    token.setSubject(overrides.subject ?? "access-user-subject");
  }

  return token.sign(overrides.signingKey ?? privateKey);
}
