export interface YouTubeSource {
  videoId?: string;
  playlistId?: string;
  /** Eligible video IDs materialized from an authorized private playlist. */
  videoIds?: string[];
}

export type YouTubeLoopMode = "off" | "video" | "playlist";

export type YouTubePlaybackState = "playing" | "paused" | "stopped";

export type YouTubePlayerErrorCode =
  | 2
  | 5
  | 100
  | 101
  | 150
  | "AUTOPLAY_BLOCKED"
  | "API_LOAD_FAILED"
  | "INVALID_SOURCE";

export interface YouTubePlayerError {
  code: YouTubePlayerErrorCode;
  message: string;
  recoverable: boolean;
}

export type YouTubeSourceParseResult =
  | { ok: true; source: YouTubeSource }
  | { ok: false; error: YouTubePlayerError };

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{10,128}$/;
const YOUTUBE_HOST_PATTERN = /(^|\.)youtube(?:-nocookie)?\.com$/i;

function cleanId(value: string | null | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

export function isYouTubeVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value.trim());
}

export function isYouTubePlaylistId(value: string): boolean {
  return PLAYLIST_ID_PATTERN.test(value.trim());
}

function sourceFromIds(
  videoId?: string,
  playlistId?: string,
  videoIds?: string[],
): YouTubeSourceParseResult {
  const cleanVideoId = cleanId(videoId);
  const cleanPlaylistId = cleanId(playlistId);
  const cleanVideoIds = [
    ...new Set(
      (videoIds ?? [])
        .map((id) => cleanId(id))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (cleanVideoId && !isYouTubeVideoId(cleanVideoId)) {
    return invalidSource("That YouTube video ID is not valid.");
  }

  if (cleanPlaylistId && !isYouTubePlaylistId(cleanPlaylistId)) {
    return invalidSource("That YouTube playlist ID is not valid.");
  }

  const invalidMaterializedId = cleanVideoIds.find(
    (id) => !isYouTubeVideoId(id),
  );
  if (invalidMaterializedId) {
    return invalidSource(
      `The materialized playlist contains an invalid video ID: ${invalidMaterializedId}.`,
    );
  }

  if (!cleanVideoId && !cleanPlaylistId && cleanVideoIds.length === 0) {
    return invalidSource(
      "Enter a YouTube video URL, playlist URL, video ID, or playlist ID.",
    );
  }

  return {
    ok: true,
    source: {
      ...(cleanVideoId ? { videoId: cleanVideoId } : {}),
      ...(cleanPlaylistId ? { playlistId: cleanPlaylistId } : {}),
      ...(cleanVideoIds.length > 0 ? { videoIds: cleanVideoIds } : {}),
    },
  };
}

function invalidSource(message: string): YouTubeSourceParseResult {
  return {
    ok: false,
    error: {
      code: "INVALID_SOURCE",
      message,
      recoverable: true,
    },
  };
}

function parseYouTubeUrl(value: string): YouTubeSourceParseResult | null {
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./i, "");
  const isShortHost = /(^|\.)youtu\.be$/i.test(host);
  const isYouTubeHost = YOUTUBE_HOST_PATTERN.test(host);

  if (!isShortHost && !isYouTubeHost) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase();
  let videoId = cleanId(url.searchParams.get("v"));
  const playlistId = cleanId(url.searchParams.get("list"));

  if (isShortHost) {
    videoId = cleanId(segments[0]);
  } else if (
    firstSegment === "embed" ||
    firstSegment === "shorts" ||
    firstSegment === "live" ||
    firstSegment === "v"
  ) {
    videoId = cleanId(segments[1]);
  }

  return sourceFromIds(videoId, playlistId);
}

/**
 * Parses standard YouTube URLs, shortened URLs, bare video IDs, and bare
 * playlist IDs. A watch URL containing both `v` and `list` preserves both so
 * callers can begin the playlist at that video.
 */
export function parseYouTubeSource(input: string): YouTubeSourceParseResult {
  const value = input.trim();
  if (!value) {
    return invalidSource(
      "Enter a YouTube video URL, playlist URL, video ID, or playlist ID.",
    );
  }

  const urlResult = parseYouTubeUrl(value);
  if (urlResult) {
    return urlResult;
  }

  if (value.startsWith("v=")) {
    return sourceFromIds(value.slice(2));
  }

  if (value.startsWith("list=")) {
    return sourceFromIds(undefined, value.slice(5));
  }

  if (isYouTubeVideoId(value)) {
    return sourceFromIds(value);
  }

  if (isYouTubePlaylistId(value)) {
    return sourceFromIds(undefined, value);
  }

  return invalidSource(
    "That does not look like a supported YouTube URL, video ID, or playlist ID.",
  );
}

export function normalizeYouTubeSource(
  source: string | YouTubeSource,
): YouTubeSourceParseResult {
  return typeof source === "string"
    ? parseYouTubeSource(source)
    : sourceFromIds(source.videoId, source.playlistId, source.videoIds);
}

export function describeYouTubeError(code: number): YouTubePlayerError {
  switch (code) {
    case 2:
      return {
        code,
        message: "YouTube rejected this video or playlist ID.",
        recoverable: true,
      };
    case 5:
      return {
        code,
        message: "This browser could not play the video in YouTube's HTML5 player.",
        recoverable: true,
      };
    case 100:
      return {
        code,
        message: "This video is private, removed, or otherwise unavailable.",
        recoverable: false,
      };
    case 101:
      return {
        code,
        message: "The video owner does not allow this video to be embedded.",
        recoverable: false,
      };
    case 150:
      return {
        code,
        message: "The video owner does not allow this video to be embedded.",
        recoverable: false,
      };
    default:
      return {
        code: 5,
        message: "YouTube could not play this source.",
        recoverable: true,
      };
  }
}

export const AUTOPLAY_BLOCKED_ERROR: YouTubePlayerError = {
  code: "AUTOPLAY_BLOCKED",
  message: "Your browser blocked playback. Press play again to start this source.",
  recoverable: true,
};
