import { ensureDatabase } from "../../../../db";
import {
  ApiError,
  jsonResponse,
  readJsonObject,
  withApiErrors,
} from "../../../../lib/server/api";
import { requireOwner } from "../../../../lib/server/owner";
import {
  parseSceneInput,
  sceneFromRow,
  type SceneRow,
  validateRecordId,
} from "../../../../lib/server/scenes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const id = validateRecordId((await context.params).id);
    const database = await ensureDatabase();
    const row = await database
      .prepare(
        `SELECT id, owner_id, name, description, definition_json, created_at, updated_at
         FROM scenes
         WHERE id = ? AND owner_id = ?`,
      )
      .bind(id, owner.id)
      .first<SceneRow>();

    if (!row) throw new ApiError(404, "scene_not_found", "Scene not found.");
    return jsonResponse({ scene: sceneFromRow(row) });
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const id = validateRecordId((await context.params).id);
    const input = parseSceneInput(await readJsonObject(request), true);
    const database = await ensureDatabase();
    const existing = await database
      .prepare(
        `SELECT id, owner_id, name, description, definition_json, created_at, updated_at
         FROM scenes
         WHERE id = ? AND owner_id = ?`,
      )
      .bind(id, owner.id)
      .first<SceneRow>();

    if (!existing) {
      throw new ApiError(404, "scene_not_found", "Scene not found.");
    }

    const updatedAt = new Date().toISOString();
    await database
      .prepare(
        `UPDATE scenes
         SET name = ?, description = ?, definition_json = ?, updated_at = ?
         WHERE id = ? AND owner_id = ?`,
      )
      .bind(
        input.name ?? existing.name,
        input.description ?? existing.description,
        input.definitionJson ?? existing.definition_json,
        updatedAt,
        id,
        owner.id,
      )
      .run();

    return jsonResponse({
      scene: sceneFromRow({
        ...existing,
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        definition_json: input.definitionJson ?? existing.definition_json,
        updated_at: updatedAt,
      }),
    });
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const id = validateRecordId((await context.params).id);
    const database = await ensureDatabase();
    const result = await database
      .prepare("DELETE FROM scenes WHERE id = ? AND owner_id = ?")
      .bind(id, owner.id)
      .run();

    if (!result.meta.changes) {
      throw new ApiError(404, "scene_not_found", "Scene not found.");
    }

    return jsonResponse({ ok: true });
  });
}
