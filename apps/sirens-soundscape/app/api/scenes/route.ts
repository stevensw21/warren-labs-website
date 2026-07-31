import { ensureDatabase } from "../../../db";
import { jsonResponse, readJsonObject, withApiErrors } from "../../../lib/server/api";
import { requireOwner } from "../../../lib/server/owner";
import {
  parseSceneInput,
  sceneFromRow,
  type SceneRow,
} from "../../../lib/server/scenes";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const database = await ensureDatabase();
    const result = await database
      .prepare(
        `SELECT id, owner_id, name, description, definition_json, created_at, updated_at
         FROM scenes
         WHERE owner_id = ?
         ORDER BY updated_at DESC, id ASC`,
      )
      .bind(owner.id)
      .all<SceneRow>();

    return jsonResponse({ scenes: result.results.map(sceneFromRow) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const input = parseSceneInput(await readJsonObject(request));
    const database = await ensureDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await database
      .prepare(
        `INSERT INTO scenes (
           id, owner_id, name, description, definition_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        owner.id,
        input.name,
        input.description,
        input.definitionJson,
        now,
        now,
      )
      .run();

    return jsonResponse(
      {
        scene: {
          id,
          name: input.name,
          description: input.description,
          definition: JSON.parse(input.definitionJson ?? "{}"),
          createdAt: now,
          updatedAt: now,
        },
      },
      { status: 201 },
    );
  });
}
