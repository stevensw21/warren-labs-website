import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type SirensBindings = {
  DB?: D1Database;
  AUDIO?: R2Bucket;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  OWNER_GOOGLE_EMAIL?: string;
};

const runtimeEnv = env as unknown as SirensBindings;

export function getDb() {
  return drizzle(getRawDb(), { schema });
}

export function getRawDb(): D1Database {
  if (!runtimeEnv.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure it in wrangler.jsonc before using the database."
    );
  }

  return runtimeEnv.DB;
}

export function getAudioBucket(): R2Bucket {
  if (!runtimeEnv.AUDIO) {
    throw new Error(
      "Cloudflare R2 binding `AUDIO` is unavailable. Configure it in wrangler.jsonc.",
    );
  }

  return runtimeEnv.AUDIO;
}

export function getRuntimeValue(name: keyof SirensBindings): string | null {
  const value = runtimeEnv[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const schemaPromises = new WeakMap<object, Promise<void>>();

export async function ensureDatabase(): Promise<D1Database> {
  const database = getRawDb();
  let pending = schemaPromises.get(database as object);

  if (!pending) {
    pending = initializeSchema(database).catch((error) => {
      schemaPromises.delete(database as object);
      throw error;
    });
    schemaPromises.set(database as object, pending);
  }

  await pending;
  return database;
}

async function initializeSchema(database: D1Database): Promise<void> {
  await database.batch([
    database.prepare(`
      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        definition_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    database.prepare(`
      CREATE INDEX IF NOT EXISTS idx_scenes_owner_updated
      ON scenes (owner_id, updated_at)
    `),
    database.prepare(`
      CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `),
    database.prepare(`
      CREATE INDEX IF NOT EXISTS idx_uploads_owner_created
      ON uploads (owner_id, created_at)
    `),
    database.prepare(`
      CREATE TABLE IF NOT EXISTS google_connections (
        owner_id TEXT PRIMARY KEY NOT NULL,
        google_email TEXT NOT NULL,
        encrypted_access_token TEXT NOT NULL,
        encrypted_refresh_token TEXT,
        access_token_expires_at TEXT NOT NULL,
        scopes TEXT NOT NULL,
        connected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    database.prepare(`
      CREATE TABLE IF NOT EXISTS google_oauth_states (
        state TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        return_path TEXT NOT NULL DEFAULT '/',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `),
    database.prepare(`
      CREATE INDEX IF NOT EXISTS idx_google_oauth_states_owner_expires
      ON google_oauth_states (owner_id, expires_at)
    `),
    database.prepare("PRAGMA optimize"),
  ]);
}
