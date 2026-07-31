import { ensureDatabase, getRuntimeValue } from "../../db";
import { ApiError } from "./api";
import { randomBase64Url, sha256Base64Url } from "./encoding";
import type { OwnerIdentity } from "./owner";
import { decryptSecret, encryptSecret } from "./secret-box";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_REVOCATION_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const YOUTUBE_READONLY_SCOPE =
  "https://www.googleapis.com/auth/youtube.readonly";
const REQUESTED_SCOPES = ["openid", "email", YOUTUBE_READONLY_SCOPE];

type GoogleConnectionRow = {
  owner_id: string;
  google_email: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
  access_token_expires_at: string;
  scopes: string;
  connected_at: string;
  updated_at: string;
};

export type GoogleOauthStateRow = {
  state: string;
  owner_id: string;
  code_verifier: string;
  redirect_uri: string;
  return_path: string;
  expires_at: string;
  created_at: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
};

export function googleConfigurationStatus(): {
  configured: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!getRuntimeValue("GOOGLE_CLIENT_ID")) missing.push("GOOGLE_CLIENT_ID");
  if (!getRuntimeValue("GOOGLE_CLIENT_SECRET")) {
    missing.push("GOOGLE_CLIENT_SECRET");
  }
  const encryptionKey = getRuntimeValue("TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey || encryptionKey.length < 32) {
    missing.push("TOKEN_ENCRYPTION_KEY");
  }
  return { configured: missing.length === 0, missing };
}

export async function getGoogleStatus(owner: OwnerIdentity): Promise<{
  configured: boolean;
  connected: boolean;
  email?: string;
  connectedAt?: string;
  needsReconnect?: boolean;
}> {
  const configuration = googleConfigurationStatus();
  const connection = await getConnection(owner.id);
  return {
    configured: configuration.configured,
    connected: Boolean(connection),
    ...(connection
      ? {
          email: connection.google_email,
          connectedAt: connection.connected_at,
          needsReconnect:
            new Date(connection.access_token_expires_at).getTime() <= Date.now() &&
            !connection.encrypted_refresh_token,
        }
      : {}),
  };
}

export async function createGoogleAuthorization(
  request: Request,
  owner: OwnerIdentity,
): Promise<string> {
  const configuration = requireGoogleConfiguration();
  const callbackUrl = new URL("/api/google/oauth/callback", request.url);
  validateCallbackOrigin(callbackUrl);

  const state = randomBase64Url(32);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const returnPath = safeReturnPath(new URL(request.url).searchParams.get("return_to"));
  const database = await ensureDatabase();

  await database.batch([
    database
      .prepare("DELETE FROM google_oauth_states WHERE expires_at <= ? OR owner_id = ?")
      .bind(now.toISOString(), owner.id),
    database
      .prepare(
        `INSERT INTO google_oauth_states (
           state, owner_id, code_verifier, redirect_uri, return_path, expires_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        state,
        owner.id,
        codeVerifier,
        callbackUrl.toString(),
        returnPath,
        expiresAt,
        now.toISOString(),
      ),
  ]);

  const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  authorizationUrl.search = new URLSearchParams({
    client_id: configuration.clientId,
    redirect_uri: callbackUrl.toString(),
    response_type: "code",
    scope: REQUESTED_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();

  return authorizationUrl.toString();
}

export async function consumeGoogleOauthState(
  state: string,
  owner: OwnerIdentity,
): Promise<GoogleOauthStateRow> {
  if (!/^[A-Za-z0-9_-]{20,200}$/u.test(state)) {
    throw new ApiError(400, "invalid_oauth_state", "The Google connection state is invalid.");
  }

  const database = await ensureDatabase();
  const stored = await database
    .prepare(
      `SELECT state, owner_id, code_verifier, redirect_uri, return_path, expires_at, created_at
       FROM google_oauth_states
       WHERE state = ?`,
    )
    .bind(state)
    .first<GoogleOauthStateRow>();

  if (!stored || stored.owner_id !== owner.id) {
    throw new ApiError(
      400,
      "invalid_oauth_state",
      "The Google connection state is invalid or has already been used.",
    );
  }

  await database
    .prepare("DELETE FROM google_oauth_states WHERE state = ?")
    .bind(state)
    .run();

  if (new Date(stored.expires_at).getTime() <= Date.now()) {
    throw new ApiError(
      400,
      "expired_oauth_state",
      "The Google connection request expired. Start the connection again.",
    );
  }

  return stored;
}

export async function completeGoogleAuthorization(
  code: string,
  oauthState: GoogleOauthStateRow,
  owner: OwnerIdentity,
): Promise<void> {
  if (!code || code.length > 4096) {
    throw new ApiError(400, "missing_oauth_code", "Google did not return an authorization code.");
  }

  const configuration = requireGoogleConfiguration();
  const tokens = await requestGoogleTokens(
    new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      code,
      code_verifier: oauthState.code_verifier,
      grant_type: "authorization_code",
      redirect_uri: oauthState.redirect_uri,
    }),
  );

  if (!tokens.access_token || !tokens.expires_in) {
    throw new ApiError(
      502,
      "google_token_error",
      "Google did not return a usable access token.",
    );
  }

  const userInfoResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const userInfo = (await safeJson(userInfoResponse)) as GoogleUserInfo;
  const googleEmail = userInfo.email?.trim().toLowerCase();
  if (!userInfoResponse.ok || !googleEmail || userInfo.email_verified !== true) {
    await revokeGoogleToken(tokens.refresh_token ?? tokens.access_token);
    throw new ApiError(
      502,
      "google_identity_error",
      "Google did not return a verified account email.",
    );
  }

  const allowedEmail = getRuntimeValue("OWNER_GOOGLE_EMAIL")?.toLowerCase();
  if (allowedEmail && googleEmail !== allowedEmail) {
    await revokeGoogleToken(tokens.refresh_token ?? tokens.access_token);
    throw new ApiError(
      403,
      "google_account_not_allowed",
      `Connect the approved Google account (${allowedEmail}).`,
    );
  }

  const database = await ensureDatabase();
  const existing = await getConnection(owner.id);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const encryptedAccessToken = await encryptSecret(
    tokens.access_token,
    `google-access:${owner.id}`,
  );
  const encryptedRefreshToken = tokens.refresh_token
    ? await encryptSecret(tokens.refresh_token, `google-refresh:${owner.id}`)
    : existing?.encrypted_refresh_token ?? null;

  await database
    .prepare(
      `INSERT INTO google_connections (
         owner_id, google_email, encrypted_access_token, encrypted_refresh_token,
         access_token_expires_at, scopes, connected_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET
         google_email = excluded.google_email,
         encrypted_access_token = excluded.encrypted_access_token,
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         access_token_expires_at = excluded.access_token_expires_at,
         scopes = excluded.scopes,
         updated_at = excluded.updated_at`,
    )
    .bind(
      owner.id,
      googleEmail,
      encryptedAccessToken,
      encryptedRefreshToken,
      expiresAt,
      tokens.scope ?? REQUESTED_SCOPES.join(" "),
      existing?.connected_at ?? now,
      now,
    )
    .run();
}

export async function getGoogleAccessToken(
  owner: OwnerIdentity,
  forceRefresh = false,
): Promise<string> {
  const connection = await getConnection(owner.id);
  if (!connection) {
    throw new ApiError(
      409,
      "google_not_connected",
      "Connect Google before loading private YouTube playlists.",
    );
  }

  const expiresAt = new Date(connection.access_token_expires_at).getTime();
  if (!forceRefresh && expiresAt > Date.now() + 2 * 60 * 1000) {
    return decryptSecret(
      connection.encrypted_access_token,
      `google-access:${owner.id}`,
    );
  }

  if (!connection.encrypted_refresh_token) {
    throw new ApiError(
      409,
      "google_reconnect_required",
      "Reconnect Google to refresh access to private playlists.",
    );
  }

  const configuration = requireGoogleConfiguration();
  const refreshToken = await decryptSecret(
    connection.encrypted_refresh_token,
    `google-refresh:${owner.id}`,
  );
  const tokens = await requestGoogleTokens(
    new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  );

  if (!tokens.access_token || !tokens.expires_in) {
    throw new ApiError(
      409,
      "google_reconnect_required",
      "Google access could not be refreshed. Reconnect Google to continue.",
    );
  }

  const encryptedAccessToken = await encryptSecret(
    tokens.access_token,
    `google-access:${owner.id}`,
  );
  const expiresAtUpdated = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();
  await (await ensureDatabase())
    .prepare(
      `UPDATE google_connections
       SET encrypted_access_token = ?, access_token_expires_at = ?, scopes = ?, updated_at = ?
       WHERE owner_id = ?`,
    )
    .bind(
      encryptedAccessToken,
      expiresAtUpdated,
      tokens.scope ?? connection.scopes,
      new Date().toISOString(),
      owner.id,
    )
    .run();

  return tokens.access_token;
}

export async function disconnectGoogle(owner: OwnerIdentity): Promise<boolean> {
  const database = await ensureDatabase();
  const connection = await getConnection(owner.id);
  let revoked = false;

  if (connection) {
    try {
      const sealed =
        connection.encrypted_refresh_token ?? connection.encrypted_access_token;
      const context = connection.encrypted_refresh_token
        ? `google-refresh:${owner.id}`
        : `google-access:${owner.id}`;
      revoked = await revokeGoogleToken(await decryptSecret(sealed, context));
    } catch {
      revoked = false;
    }
  }

  await database.batch([
    database
      .prepare("DELETE FROM google_connections WHERE owner_id = ?")
      .bind(owner.id),
    database
      .prepare("DELETE FROM google_oauth_states WHERE owner_id = ?")
      .bind(owner.id),
  ]);
  return revoked;
}

async function getConnection(ownerId: string): Promise<GoogleConnectionRow | null> {
  return (await ensureDatabase())
    .prepare(
      `SELECT owner_id, google_email, encrypted_access_token, encrypted_refresh_token,
              access_token_expires_at, scopes, connected_at, updated_at
       FROM google_connections
       WHERE owner_id = ?`,
    )
    .bind(ownerId)
    .first<GoogleConnectionRow>();
}

async function requestGoogleTokens(
  body: URLSearchParams,
): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await safeJson(response)) as GoogleTokenResponse;
  if (!response.ok) {
    throw new ApiError(
      payload.error === "invalid_grant" ? 409 : 502,
      payload.error === "invalid_grant"
        ? "google_reconnect_required"
        : "google_token_error",
      payload.error === "invalid_grant"
        ? "Google access expired or was revoked. Reconnect Google to continue."
        : "Google could not complete the connection.",
      payload.error ? { reason: payload.error } : undefined,
    );
  }
  return payload;
}

async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(GOOGLE_REVOCATION_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function requireGoogleConfiguration(): {
  clientId: string;
  clientSecret: string;
} {
  const status = googleConfigurationStatus();
  if (!status.configured) {
    throw new ApiError(
      503,
      "google_not_configured",
      "Google connection is not configured for this site.",
      { missing: status.missing },
    );
  }

  return {
    clientId: getRuntimeValue("GOOGLE_CLIENT_ID")!,
    clientSecret: getRuntimeValue("GOOGLE_CLIENT_SECRET")!,
  };
}

function validateCallbackOrigin(callbackUrl: URL): void {
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    callbackUrl.hostname.toLowerCase(),
  );
  if (callbackUrl.protocol !== "https:" && !(local && callbackUrl.protocol === "http:")) {
    throw new ApiError(
      400,
      "invalid_callback_origin",
      "Google connections require HTTPS outside local development.",
    );
  }
}

function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://sirens.local");
    return url.origin === "https://sirens.local"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
}
