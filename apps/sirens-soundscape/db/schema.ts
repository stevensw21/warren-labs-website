import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const scenes = sqliteTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    definitionJson: text("definition_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_scenes_owner_updated").on(table.ownerId, table.updatedAt),
  ],
);

export const uploads = sqliteTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    objectKey: text("object_key").notNull().unique(),
    name: text("name").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_uploads_owner_created").on(table.ownerId, table.createdAt),
  ],
);

export const googleConnections = sqliteTable("google_connections", {
  ownerId: text("owner_id").primaryKey(),
  googleEmail: text("google_email").notNull(),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  accessTokenExpiresAt: text("access_token_expires_at").notNull(),
  scopes: text("scopes").notNull(),
  connectedAt: text("connected_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const googleOauthStates = sqliteTable(
  "google_oauth_states",
  {
    state: text("state").primaryKey(),
    ownerId: text("owner_id").notNull(),
    codeVerifier: text("code_verifier").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    returnPath: text("return_path").notNull().default("/"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_google_oauth_states_owner_expires").on(
      table.ownerId,
      table.expiresAt,
    ),
  ],
);
