import { ensureDatabase, getAudioBucket } from "../../../../db";
import { ApiError, jsonResponse, withApiErrors } from "../../../../lib/server/api";
import { requireOwner } from "../../../../lib/server/owner";
import { validateRecordId } from "../../../../lib/server/scenes";
import type { UploadRow } from "../../../../lib/server/uploads";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const id = validateRecordId((await context.params).id);
    const database = await ensureDatabase();
    const row = await database
      .prepare(
        `SELECT id, owner_id, object_key, name, original_name, content_type, size_bytes, created_at
         FROM uploads
         WHERE id = ? AND owner_id = ?`,
      )
      .bind(id, owner.id)
      .first<UploadRow>();

    if (!row) throw new ApiError(404, "upload_not_found", "Audio file not found.");

    await getAudioBucket().delete(row.object_key);
    await database
      .prepare("DELETE FROM uploads WHERE id = ? AND owner_id = ?")
      .bind(id, owner.id)
      .run();

    return jsonResponse({ ok: true });
  });
}
