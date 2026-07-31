import { ensureDatabase, getAudioBucket } from "../../../../../db";
import {
  ApiError,
  jsonResponse,
  withApiErrors,
} from "../../../../../lib/server/api";
import { requireOwner } from "../../../../../lib/server/owner";
import { validateRecordId } from "../../../../../lib/server/scenes";
import {
  contentDisposition,
  type UploadRow,
} from "../../../../../lib/server/uploads";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type ByteRange = { offset: number; length: number; end: number };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return streamAudio(request, context, false);
}

export async function HEAD(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return streamAudio(request, context, true);
}

function streamAudio(
  request: Request,
  context: RouteContext,
  headOnly: boolean,
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

    const rangeHeader = request.headers.get("range");
    const range = rangeHeader ? parseByteRange(rangeHeader, row.size_bytes) : null;
    if (rangeHeader && !range) {
      const response = jsonResponse(
        {
          error: {
            code: "invalid_range",
            message: "The requested audio byte range is invalid.",
          },
        },
        { status: 416 },
      );
      response.headers.set("content-range", `bytes */${row.size_bytes}`);
      return response;
    }

    const bucket = getAudioBucket();
    const object = headOnly
      ? await bucket.head(row.object_key)
      : await bucket.get(
          row.object_key,
          range ? { range: { offset: range.offset, length: range.length } } : {},
        );

    if (!object) {
      throw new ApiError(
        410,
        "audio_bytes_missing",
        "The audio metadata exists, but its stored file is missing.",
      );
    }

    const headers = new Headers({
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
      "content-disposition": contentDisposition(row.original_name),
      "content-type": row.content_type,
      "x-content-type-options": "nosniff",
    });
    if (object.httpEtag) headers.set("etag", object.httpEtag);

    if (range) {
      headers.set("content-length", String(range.length));
      headers.set(
        "content-range",
        `bytes ${range.offset}-${range.end}/${row.size_bytes}`,
      );
    } else {
      headers.set("content-length", String(row.size_bytes));
    }

    const body = headOnly ? null : (object as R2ObjectBody).body;
    return new Response(body, { status: range ? 206 : 200, headers });
  });
}

function parseByteRange(value: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    const length = Math.min(suffixLength, size);
    return { offset: size - length, length, end: size - 1 };
  }

  const offset = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(requestedEnd) ||
    offset < 0 ||
    requestedEnd < offset ||
    offset >= size
  ) {
    return null;
  }

  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1, end };
}
