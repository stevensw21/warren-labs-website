import { ApiError } from "./api";

export const MAXIMUM_AUDIO_BYTES = 90 * 1024 * 1024;

const ALLOWED_AUDIO_TYPES = new Map<string, ReadonlySet<string>>([
  ["audio/mpeg", new Set(["mp3", "mpeg"])],
  ["audio/mp3", new Set(["mp3"])],
  ["audio/mp4", new Set(["m4a"])],
  ["audio/m4a", new Set(["m4a"])],
  ["audio/x-m4a", new Set(["m4a"])],
  ["audio/aac", new Set(["aac"])],
  ["audio/x-aac", new Set(["aac"])],
  ["audio/x-hx-aac-adts", new Set(["aac"])],
  ["audio/wav", new Set(["wav"])],
  ["audio/x-wav", new Set(["wav"])],
  ["audio/vnd.wave", new Set(["wav"])],
]);

export type UploadRow = {
  id: string;
  owner_id: string;
  object_key: string;
  name: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

export type UploadRecord = {
  id: string;
  name: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  streamUrl: string;
  createdAt: string;
};

export function uploadFromRow(row: UploadRow): UploadRecord {
  return {
    id: row.id,
    name: row.name,
    originalName: row.original_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    streamUrl: `/api/uploads/${encodeURIComponent(row.id)}/stream`,
    createdAt: row.created_at,
  };
}

export function validateAudioFile(
  unsafeName: string,
  unsafeContentType: string,
): { originalName: string; displayName: string; contentType: string } {
  const originalName = sanitizeFilename(unsafeName);
  const contentType = unsafeContentType.split(";", 1)[0].trim().toLowerCase();
  const allowedExtensions = ALLOWED_AUDIO_TYPES.get(contentType);
  const extension = originalName.includes(".")
    ? originalName.split(".").pop()?.toLowerCase() ?? ""
    : "";

  if (!allowedExtensions || !allowedExtensions.has(extension)) {
    throw new ApiError(
      415,
      "unsupported_audio_type",
      "Upload an MP3, M4A, AAC, or WAV audio file.",
      { contentType, extension },
    );
  }

  const displayName = originalName.slice(0, -(extension.length + 1)).trim();
  return {
    originalName,
    displayName: displayName.slice(0, 160) || "Untitled audio",
    contentType,
  };
}

export function validateUploadSize(sizeBytes: number): number {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new ApiError(
      400,
      "invalid_upload_size",
      "The audio file is empty or its size is unavailable.",
    );
  }
  if (sizeBytes > MAXIMUM_AUDIO_BYTES) {
    throw new ApiError(
      413,
      "upload_too_large",
      "Audio files must be 90 MB or smaller.",
      { maximumBytes: MAXIMUM_AUDIO_BYTES },
    );
  }
  return sizeBytes;
}

export function contentDisposition(filename: string): string {
  const fallback = filename
    .replace(/[^A-Za-z0-9._ -]/gu, "_")
    .replaceAll('"', "_")
    .slice(0, 100);
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
    filename,
  )}`;
}

function sanitizeFilename(value: string): string {
  let decoded = value;
  if (value.includes("%")) {
    try {
      decoded = decodeURIComponent(value);
    } catch {
      decoded = value;
    }
  }

  const leaf = decoded.split(/[\\/]/u).pop() ?? "";
  const sanitized = leaf
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim()
    .slice(0, 255);
  if (!sanitized) {
    throw new ApiError(400, "invalid_filename", "The audio filename is invalid.");
  }
  return sanitized;
}
