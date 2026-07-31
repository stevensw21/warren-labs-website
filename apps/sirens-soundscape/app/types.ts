export type LoopMode = "off" | "video" | "playlist";

export type SourceRole = "music" | "ambient" | "one-shot";

export type PlaybackState = "playing" | "paused" | "stopped";

export interface YouTubeLayer {
  id: string;
  title: string;
  videoId?: string;
  videoIds?: string[];
  playlistId?: string;
  sourceKind: "video" | "playlist";
  role: Exclude<SourceRole, "one-shot">;
  privacy?: "public" | "unlisted" | "private";
  itemCount?: number;
  volume: number;
  loopMode: LoopMode;
  playback: PlaybackState;
  error?: string;
}

export interface UploadedAudioLayer {
  id: string;
  name: string;
  role: Exclude<SourceRole, "music">;
  streamUrl?: string;
  durationLabel?: string;
  volume: number;
  loop: boolean;
  playback: PlaybackState;
  icon: "rain" | "fire" | "crowd" | "door" | "spark" | "wolf";
}

export interface OneShot {
  id: string;
  name: string;
  streamUrl?: string;
  volume: number;
  icon: "door" | "swords" | "thunder" | "wolf" | "spark" | "crowd";
}

export interface SceneDefinition {
  youtubeLayers: YouTubeLayer[];
  uploadedLayers: UploadedAudioLayer[];
  oneShots: OneShot[];
  masterVolume: number;
}

export interface Scene {
  id: string;
  name: string;
  description?: string;
  definition: SceneDefinition;
  createdAt?: string;
  updatedAt?: string;
}

export interface YouTubePlaylist {
  id: string;
  title: string;
  itemCount: number;
  privacy: "public" | "unlisted" | "private";
  updatedLabel?: string;
  thumbnailUrl?: string;
  description?: string;
}

export interface LibraryUpload {
  id: string;
  name: string;
  originalName?: string;
  contentType?: string;
  sizeBytes?: number;
  streamUrl: string;
  createdAt?: string;
}

export interface GoogleConnection {
  configured: boolean;
  connected: boolean;
  email?: string;
  connectedAt?: string;
}
