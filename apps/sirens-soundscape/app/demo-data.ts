import type {
  OneShot,
  Scene,
  UploadedAudioLayer,
  YouTubeLayer,
  YouTubePlaylist,
} from "./types";

const defaultYouTubeLayers: YouTubeLayer[] = [
  {
    id: "yt-battle",
    title: "Battle Music",
    videoId: "M7lc1UVf-VE",
    videoIds: ["M7lc1UVf-VE"],
    playlistId: "PLynG8gQD-n8Bu8HjOa-FD3yZ7BZI6fhmj",
    sourceKind: "playlist",
    role: "music",
    privacy: "private",
    itemCount: 18,
    volume: 75,
    loopMode: "playlist",
    playback: "stopped",
  },
  {
    id: "yt-rooftops",
    title: "Rainy Rooftops",
    videoId: "M7lc1UVf-VE",
    sourceKind: "video",
    role: "ambient",
    privacy: "unlisted",
    volume: 60,
    loopMode: "video",
    playback: "stopped",
  },
  {
    id: "yt-fire",
    title: "Tavern Fire",
    videoId: "M7lc1UVf-VE",
    sourceKind: "video",
    role: "ambient",
    privacy: "public",
    volume: 55,
    loopMode: "video",
    playback: "stopped",
  },
  {
    id: "yt-thunder",
    title: "Distant Thunder",
    videoId: "M7lc1UVf-VE",
    sourceKind: "video",
    role: "ambient",
    privacy: "public",
    volume: 40,
    loopMode: "video",
    playback: "stopped",
  },
];

export const demoUploadedLayers: UploadedAudioLayer[] = [
  {
    id: "upload-rain",
    name: "Rain on Slate",
    role: "ambient",
    durationLabel: "04:36",
    volume: 68,
    loop: true,
    playback: "stopped",
    icon: "rain",
  },
  {
    id: "upload-hearth",
    name: "Crackling Hearth",
    role: "ambient",
    durationLabel: "12:18",
    volume: 45,
    loop: true,
    playback: "stopped",
    icon: "fire",
  },
  {
    id: "upload-crowd",
    name: "Crowd Murmur",
    role: "ambient",
    durationLabel: "08:42",
    volume: 50,
    loop: true,
    playback: "stopped",
    icon: "crowd",
  },
];

export const demoOneShots: OneShot[] = [
  { id: "shot-door", name: "Door Slam", volume: 80, icon: "door" },
  { id: "shot-swords", name: "Sword Clash", volume: 76, icon: "swords" },
  { id: "shot-thunder", name: "Thunder", volume: 85, icon: "thunder" },
  { id: "shot-wolf", name: "Wolf Howl", volume: 72, icon: "wolf" },
  { id: "shot-magic", name: "Magic Burst", volume: 78, icon: "spark" },
  { id: "shot-cheer", name: "Crowd Cheer", volume: 68, icon: "crowd" },
];

function sceneDefinition(youtubeLayers: YouTubeLayer[] = defaultYouTubeLayers) {
  return {
    youtubeLayers: youtubeLayers.map((layer) => ({ ...layer })),
    uploadedLayers: demoUploadedLayers.map((layer) => ({ ...layer })),
    oneShots: demoOneShots.map((sound) => ({ ...sound })),
    masterVolume: 80,
  };
}

export const demoScenes: Scene[] = [
  {
    id: "scene-tavern",
    name: "Tavern at Dusk",
    description: "Warm hearth, low conversation, and distant rain.",
    definition: sceneDefinition(defaultYouTubeLayers.slice(1, 3)),
  },
  {
    id: "scene-goblin",
    name: "Goblin King’s Keep",
    description: "Battle-ready music and a restless underground court.",
    definition: sceneDefinition(),
  },
  {
    id: "scene-manor",
    name: "Haunted Manor",
    description: "A cold house with creaking timbers and worsening weather.",
    definition: sceneDefinition(defaultYouTubeLayers.slice(2)),
  },
  {
    id: "scene-lair",
    name: "Dragon’s Lair",
    description: "Stone, fire, and the scrape of something enormous.",
    definition: sceneDefinition(defaultYouTubeLayers.slice(0, 1)),
  },
];

export const demoPlaylists: YouTubePlaylist[] = [
  {
    id: "PLynG8gQD-n8Bu8HjOa-FD3yZ7BZI6fhmj",
    title: "Battle & Pursuit",
    itemCount: 18,
    privacy: "private",
    updatedLabel: "Updated 2 days ago",
    description: "Driving combat music and urgent travel cues.",
  },
  {
    id: "quiet-roads",
    title: "Quiet Roads",
    itemCount: 12,
    privacy: "private",
    updatedLabel: "Updated 1 week ago",
    description: "Measured travel themes for time between encounters.",
  },
  {
    id: "villains",
    title: "Villains & Revelations",
    itemCount: 9,
    privacy: "private",
    updatedLabel: "Updated 3 weeks ago",
    description: "Tension, discoveries, and dangerous conversations.",
  },
];
