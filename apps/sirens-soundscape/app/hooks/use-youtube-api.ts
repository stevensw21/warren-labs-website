"use client";

import { useEffect, useState } from "react";

export const YOUTUBE_PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export type YouTubeIframePlayerState =
  (typeof YOUTUBE_PLAYER_STATE)[keyof typeof YOUTUBE_PLAYER_STATE];

export interface YouTubeIframePlayer {
  cuePlaylist(
    playlist: string | string[],
    index?: number,
    startSeconds?: number,
    suggestedQuality?: string,
  ): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
  getPlayerState(): number;
  getPlaylistIndex(): number;
  getVolume(): number;
  isMuted(): boolean;
  mute(): void;
  pauseVideo(): void;
  playVideo(): void;
  playVideoAt(index: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setLoop(loopPlaylists: boolean): void;
  setShuffle(shufflePlaylist: boolean): void;
  setVolume(volume: number): void;
  stopVideo(): void;
  unMute(): void;
}

export interface YouTubeIframeEvent<T = undefined> {
  data: T;
  target: YouTubeIframePlayer;
}

export interface YouTubeIframePlayerOptions {
  width?: number | string;
  height?: number | string;
  videoId?: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: (event: YouTubeIframeEvent) => void;
    onStateChange?: (
      event: YouTubeIframeEvent<YouTubeIframePlayerState>,
    ) => void;
    onError?: (event: YouTubeIframeEvent<number>) => void;
    onAutoplayBlocked?: (event: YouTubeIframeEvent) => void;
  };
}

export interface YouTubeIframeApi {
  Player: new (
    element: HTMLElement | string,
    options: YouTubeIframePlayerOptions,
  ) => YouTubeIframePlayer;
  PlayerState: typeof YOUTUBE_PLAYER_STATE;
}

declare global {
  interface Window {
    YT?: YouTubeIframeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeIframeApi> | null = null;

function hasLoadedApi(): boolean {
  return typeof window !== "undefined" && typeof window.YT?.Player === "function";
}

export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("The YouTube player can only load in a browser."),
    );
  }

  if (hasLoadedApi()) {
    return Promise.resolve(window.YT as YouTubeIframeApi);
  }

  if (apiPromise) {
    return apiPromise;
  }

  apiPromise = new Promise<YouTubeIframeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    let settled = false;

    const finish = () => {
      if (settled) return;
      if (!hasLoadedApi()) {
        fail(new Error("YouTube's player API loaded without a Player object."));
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      resolve(window.YT as YouTubeIframeApi);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      apiPromise = null;
      reject(error);
    };

    window.onYouTubeIframeAPIReady = () => {
      try {
        previousReady?.();
      } finally {
        finish();
      }
    };

    const timeoutId = window.setTimeout(() => {
      fail(new Error("YouTube's player API did not load in time."));
    }, 20_000);

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );

    if (existingScript) {
      existingScript.addEventListener(
        "error",
        () => fail(new Error("YouTube's player API could not be loaded.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.dataset.sirensYoutubeApi = "true";
    script.addEventListener(
      "error",
      () => fail(new Error("YouTube's player API could not be loaded.")),
      { once: true },
    );
    document.head.appendChild(script);
  });

  return apiPromise;
}

export type YouTubeApiStatus = "loading" | "ready" | "error";

export interface YouTubeApiState {
  api: YouTubeIframeApi | null;
  status: YouTubeApiStatus;
  error: Error | null;
}

export function useYouTubeApi(): YouTubeApiState {
  const [state, setState] = useState<YouTubeApiState>({
    api: null,
    status: "loading",
    error: null,
  });

  useEffect(() => {
    let active = true;

    loadYouTubeIframeApi().then(
      (api) => {
        if (active) {
          setState({ api, status: "ready", error: null });
        }
      },
      (error: unknown) => {
        if (active) {
          setState({
            api: null,
            status: "error",
            error:
              error instanceof Error
                ? error
                : new Error("YouTube's player API could not be loaded."),
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, []);

  return state;
}
