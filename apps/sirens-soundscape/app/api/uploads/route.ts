import { ensureDatabase, getAudioBucket } from "../../../db";
import {
  ApiError,
  jsonResponse,
  parseContentLength,
  withApiErrors,
} from "../../../lib/server/api";
import { sha256Hex } from "../../../lib/server/encoding";
import { requireOwner } from "../../../lib/server/owner";
import {
  uploadFromRow,
  validateAudioFile,
  validateUploadSize,
  type UploadRow,
} from "../../../lib/server/uploads";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const database = await ensureDatabase();
    const result = await database
      .prepare(
        `SELECT id, owner_id, object_key, name, original_name, content_type, size_bytes, created_at
         FROM uploads
         WHERE owner_id = ?
         ORDER BY created_at DESC, id ASC`,
      )
      .bind(owner.id)
      .all<UploadRow>();

    return jsonResponse({ uploads: result.results.map(uploadFromRow) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const owner = requireOwner(request);
    const requestType = request.headers.get("content-type") ?? "";

    let filename: string;
    let contentType: string;
    let expectedSize: number;
    let body: ReadableStream | Blob;

    if (requestType.toLowerCase().startsWith("multipart/form-data")) {
      const declaredLength = parseContentLength(
        request.headers.get("content-length"),
      );
      if (declaredLength !== null) validateUploadSize(declaredLength);
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new ApiError(
          400,
          "file_required",
          "Provide the audio file in the file form field.",
        );
      }
      filename = file.name;
      contentType = file.type;
      expectedSize = validateUploadSize(file.size);
      body = file;
    } else {
      filename = request.headers.get("x-file-name") ?? "";
      contentType = requestType;
      const declaredSize =
        parseContentLength(request.headers.get("x-file-size")) ??
        parseContentLength(request.headers.get("content-length"));
      if (declaredSize === null) {
        throw new ApiError(
          411,
          "upload_size_required",
          "The upload must include its size in x-file-size.",
        );
      }
      expectedSize = validateUploadSize(declaredSize);
      if (!request.body) {
        throw new ApiError(400, "file_required", "Provide an audio file body.");
      }
      body = request.body;
    }

    const file = validateAudioFile(filename, contentType);
    const id = crypto.randomUUID();
    const ownerPrefix = (await sha256Hex(owner.id)).slice(0, 32);
    const objectKey = `owners/${ownerPrefix}/${id}`;
    const bucket = getAudioBucket();
    const stored = await bucket.put(objectKey, body, {
      httpMetadata: { contentType: file.contentType },
      customMetadata: {
        owner: ownerPrefix,
        originalName: encodeURIComponent(file.originalName),
      },
    });

    if (!stored) {
      throw new ApiError(
        502,
        "upload_failed",
        "The audio file could not be stored.",
      );
    }

    if (stored.size > 90 * 1024 * 1024) {
      await bucket.delete(objectKey);
      throw new ApiError(
        413,
        "upload_too_large",
        "Audio files must be 90 MB or smaller.",
      );
    }

    if (stored.size !== expectedSize) {
      await bucket.delete(objectKey);
      throw new ApiError(
        400,
        "upload_size_mismatch",
        "The received audio size did not match the declared file size.",
      );
    }

    const database = await ensureDatabase();
    const createdAt = new Date().toISOString();
    try {
      await database
        .prepare(
          `INSERT INTO uploads (
             id, owner_id, object_key, name, original_name, content_type, size_bytes, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          owner.id,
          objectKey,
          file.displayName,
          file.originalName,
          file.contentType,
          stored.size,
          createdAt,
        )
        .run();
    } catch (error) {
      await bucket.delete(objectKey);
      throw error;
    }

    return jsonResponse(
      {
        upload: uploadFromRow({
          id,
          owner_id: owner.id,
          object_key: objectKey,
          name: file.displayName,
          original_name: file.originalName,
          content_type: file.contentType,
          size_bytes: stored.size,
          created_at: createdAt,
        }),
      },
      { status: 201 },
    );
  });
}
