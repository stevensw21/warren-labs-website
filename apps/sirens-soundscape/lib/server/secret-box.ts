import { getRuntimeValue } from "../../db";
import { ApiError } from "./api";
import { base64UrlDecode, base64UrlEncode } from "./encoding";

const VERSION = "v1";

export async function encryptSecret(
  plaintext: string,
  context: string,
): Promise<string> {
  const key = await encryptionKey();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(context),
    },
    key,
    new TextEncoder().encode(plaintext),
  );

  return `${VERSION}.${base64UrlEncode(iv)}.${base64UrlEncode(
    new Uint8Array(ciphertext),
  )}`;
}

export async function decryptSecret(
  sealedValue: string,
  context: string,
): Promise<string> {
  const [version, encodedIv, encodedCiphertext, extra] = sealedValue.split(".");
  if (version !== VERSION || !encodedIv || !encodedCiphertext || extra) {
    throw new ApiError(
      500,
      "stored_secret_invalid",
      "A stored Google connection cannot be read. Reconnect Google to continue.",
    );
  }

  try {
    const iv = Uint8Array.from(base64UrlDecode(encodedIv));
    const ciphertext = Uint8Array.from(base64UrlDecode(encodedCiphertext));
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(context),
      },
      await encryptionKey(),
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "stored_secret_invalid",
      "A stored Google connection cannot be read. Reconnect Google to continue.",
    );
  }
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = getRuntimeValue("TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) {
    throw new ApiError(
      503,
      "google_not_configured",
      "Google connection is not configured for this site.",
      { missing: ["TOKEN_ENCRYPTION_KEY"] },
    );
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
