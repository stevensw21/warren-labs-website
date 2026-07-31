import { ApiError } from "./api";
import { getGoogleAccessToken } from "./google";
import type { OwnerIdentity } from "./owner";

const YOUTUBE_API_ROOT = "https://www.googleapis.com/youtube/v3";

type ThumbnailSet = Record<
  string,
  { url?: string; width?: number; height?: number } | undefined
>;

type PlaylistResource = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    thumbnails?: ThumbnailSet;
  };
  contentDetails?: { itemCount?: number };
  status?: { privacyStatus?: string };
};

type PlaylistItemResource = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    position?: number;
    thumbnails?: ThumbnailSet;
    resourceId?: { videoId?: string };
  };
  contentDetails?: { videoId?: string };
};

type VideoResource = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    liveBroadcastContent?: string;
    thumbnails?: ThumbnailSet;
  };
  contentDetails?: { duration?: string };
  status?: {
    privacyStatus?: string;
    uploadStatus?: string;
    embeddable?: boolean;
  };
};

type ListResponse<T> = {
  items?: T[];
  nextPageToken?: string;
  error?: { message?: string; errors?: Array<{ reason?: string }> };
};

export async function listYouTubePlaylists(owner: OwnerIdentity): Promise<{
  playlists: Array<{
    id: string;
    title: string;
    description: string;
    thumbnailUrl: string | null;
    itemCount: number;
    privacyStatus: string;
  }>;
  truncated: boolean;
}> {
  const playlists: PlaylistResource[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const query = new URLSearchParams({
      part: "snippet,contentDetails,status",
      mine: "true",
      maxResults: "50",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await youtubeGet<ListResponse<PlaylistResource>>(
      owner,
      "/playlists",
      query,
    );
    playlists.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    pages += 1;
  } while (pageToken && pages < 10);

  return {
    playlists: playlists.flatMap((playlist) =>
      playlist.id
        ? [
            {
              id: playlist.id,
              title: playlist.snippet?.title?.trim() || "Untitled playlist",
              description: playlist.snippet?.description ?? "",
              thumbnailUrl: preferredThumbnail(playlist.snippet?.thumbnails),
              itemCount: playlist.contentDetails?.itemCount ?? 0,
              privacyStatus: playlist.status?.privacyStatus ?? "unknown",
            },
          ]
        : [],
    ),
    truncated: Boolean(pageToken),
  };
}

export async function listYouTubePlaylistItems(
  owner: OwnerIdentity,
  playlistId: string,
): Promise<{
  playlist: { id: string; title: string };
  items: Array<{
    videoId: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string | null;
    duration: string | null;
    position: number;
  }>;
  skipped: Array<{
    videoId?: string;
    title?: string;
    reason:
      | "private_video"
      | "embedding_disabled"
      | "unavailable"
      | "not_ready"
      | "upcoming_livestream";
  }>;
  truncated: boolean;
}> {
  if (!/^[A-Za-z0-9_-]{5,200}$/u.test(playlistId)) {
    throw new ApiError(400, "invalid_playlist_id", "The playlist id is invalid.");
  }

  const [playlistResponse, channelResponse] = await Promise.all([
    youtubeGet<ListResponse<PlaylistResource>>(
      owner,
      "/playlists",
      new URLSearchParams({
        part: "snippet,contentDetails,status",
        id: playlistId,
        maxResults: "1",
      }),
    ),
    youtubeGet<ListResponse<{ id?: string }>>(
      owner,
      "/channels",
      new URLSearchParams({ part: "id", mine: "true", maxResults: "50" }),
    ),
  ]);
  const playlist = playlistResponse.items?.[0];
  if (!playlist?.id) {
    throw new ApiError(404, "playlist_not_found", "YouTube playlist not found.");
  }

  const ownedChannelIds = new Set(
    (channelResponse.items ?? []).flatMap((channel) =>
      channel.id ? [channel.id] : [],
    ),
  );
  if (
    !playlist.snippet?.channelId ||
    !ownedChannelIds.has(playlist.snippet.channelId)
  ) {
    throw new ApiError(
      403,
      "playlist_not_owned",
      "This playlist does not belong to the connected YouTube account.",
    );
  }

  const playlistItems: PlaylistItemResource[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const query = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await youtubeGet<ListResponse<PlaylistItemResource>>(
      owner,
      "/playlistItems",
      query,
    );
    playlistItems.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    pages += 1;
  } while (pageToken && pages < 40);

  const videoIds = [
    ...new Set(
      playlistItems.flatMap((item) => {
        const videoId =
          item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
        return videoId ? [videoId] : [];
      }),
    ),
  ];
  const videos = new Map<string, VideoResource>();
  for (let start = 0; start < videoIds.length; start += 50) {
    const batch = videoIds.slice(start, start + 50);
    const response = await youtubeGet<ListResponse<VideoResource>>(
      owner,
      "/videos",
      new URLSearchParams({
        part: "snippet,contentDetails,status",
        id: batch.join(","),
        maxResults: "50",
      }),
    );
    for (const video of response.items ?? []) {
      if (video.id) videos.set(video.id, video);
    }
  }

  const items: Array<{
    videoId: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string | null;
    duration: string | null;
    position: number;
  }> = [];
  const skipped: Array<{
    videoId?: string;
    title?: string;
    reason:
      | "private_video"
      | "embedding_disabled"
      | "unavailable"
      | "not_ready"
      | "upcoming_livestream";
  }> = [];

  for (const [fallbackPosition, item] of playlistItems.entries()) {
    const videoId =
      item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
    if (!videoId) {
      skipped.push({ title: item.snippet?.title, reason: "unavailable" });
      continue;
    }
    const video = videos.get(videoId);
    if (!video) {
      skipped.push({ videoId, title: item.snippet?.title, reason: "unavailable" });
      continue;
    }
    if (video.status?.privacyStatus === "private") {
      skipped.push({ videoId, title: video.snippet?.title, reason: "private_video" });
      continue;
    }
    if (video.status?.embeddable !== true) {
      skipped.push({
        videoId,
        title: video.snippet?.title,
        reason: "embedding_disabled",
      });
      continue;
    }
    if (video.status?.uploadStatus && video.status.uploadStatus !== "processed") {
      skipped.push({ videoId, title: video.snippet?.title, reason: "not_ready" });
      continue;
    }
    if (video.snippet?.liveBroadcastContent === "upcoming") {
      skipped.push({
        videoId,
        title: video.snippet.title,
        reason: "upcoming_livestream",
      });
      continue;
    }

    items.push({
      videoId,
      title: video.snippet?.title?.trim() || "Untitled video",
      channelTitle: video.snippet?.channelTitle ?? "",
      thumbnailUrl: preferredThumbnail(video.snippet?.thumbnails),
      duration: video.contentDetails?.duration ?? null,
      position: item.snippet?.position ?? fallbackPosition,
    });
  }

  return {
    playlist: {
      id: playlist.id,
      title: playlist.snippet?.title?.trim() || "Untitled playlist",
    },
    items,
    skipped,
    truncated: Boolean(pageToken),
  };
}

async function youtubeGet<T>(
  owner: OwnerIdentity,
  pathname: string,
  query: URLSearchParams,
): Promise<T> {
  let accessToken = await getGoogleAccessToken(owner);
  let response = await fetch(`${YOUTUBE_API_ROOT}${pathname}?${query}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 401) {
    accessToken = await getGoogleAccessToken(owner, true);
    response = await fetch(`${YOUTUBE_API_ROOT}${pathname}?${query}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
  }

  let payload: ListResponse<unknown> = {};
  try {
    payload = (await response.json()) as ListResponse<unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const reason = payload.error?.errors?.[0]?.reason;
    throw new ApiError(
      response.status === 403 ? 403 : 502,
      "youtube_api_error",
      payload.error?.message || "YouTube could not load this playlist.",
      reason ? { reason } : undefined,
    );
  }
  return payload as T;
}

function preferredThumbnail(thumbnails?: ThumbnailSet): string | null {
  if (!thumbnails) return null;
  for (const key of ["maxres", "standard", "high", "medium", "default"]) {
    const url = thumbnails[key]?.url;
    if (url) return url;
  }
  return null;
}
