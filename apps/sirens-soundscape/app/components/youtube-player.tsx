"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  useYouTubeApi,
  YOUTUBE_PLAYER_STATE,
  type YouTubeIframeEvent,
  type YouTubeIframePlayer,
  type YouTubeIframePlayerState,
} from "@/app/hooks/use-youtube-api";
import {
  AUTOPLAY_BLOCKED_ERROR,
  describeYouTubeError,
  normalizeYouTubeSource,
  type YouTubeLoopMode,
  type YouTubePlaybackState,
  type YouTubePlayerError,
  type YouTubeSource,
} from "@/lib/youtube";

export interface YouTubePlayerHandle {
  mute(): void;
  pause(): void;
  play(): void;
  setVolume(volume: number): void;
  stop(): void;
  toggle(): void;
  unmute(): void;
}

export interface YouTubePlayerProps {
  source: string | YouTubeSource;
  title: string;
  playback?: YouTubePlaybackState;
  volume?: number;
  muted?: boolean;
  loopMode?: YouTubeLoopMode;
  showControls?: boolean;
  className?: string;
  onPlaybackChange?: (state: YouTubePlaybackState) => void;
  onVolumeChange?: (volume: number) => void;
  onMutedChange?: (muted: boolean) => void;
  onLoopModeChange?: (loopMode: YouTubeLoopMode) => void;
  onError?: (error: YouTubePlayerError) => void;
  onReady?: () => void;
}

const playerShellStyle: CSSProperties = {
  color: "var(--ss-text, #f4f1eb)",
  background: "var(--ss-surface, #1c2228)",
  border: "1px solid var(--ss-border, #3b4650)",
  borderRadius: 10,
  overflow: "hidden",
  fontFamily:
    "var(--font-sans, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif)",
};

const compactRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 48,
  padding: "8px 10px",
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--ss-border-strong, #53616d)",
  borderRadius: 7,
  minHeight: 34,
  padding: "6px 11px",
  background: "var(--ss-control, #252d34)",
  color: "inherit",
  font: "inherit",
  fontSize: 13,
  fontWeight: 650,
  lineHeight: 1,
  cursor: "pointer",
};

const frameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  minWidth: 200,
  minHeight: 200,
  aspectRatio: "16 / 9",
  background: "#000",
  borderTop: "1px solid var(--ss-border, #3b4650)",
  borderBottom: "1px solid var(--ss-border, #3b4650)",
};

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 75;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function sourceKey(source: string | YouTubeSource): string {
  return typeof source === "string"
    ? source.trim()
    : `${source.videoId ?? ""}|${source.playlistId ?? ""}|${source.videoIds?.join(",") ?? ""}`;
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export const YouTubePlayer = forwardRef<
  YouTubePlayerHandle,
  YouTubePlayerProps
>(function YouTubePlayer(
  {
    source,
    title,
    playback,
    volume = 75,
    muted = false,
    loopMode = "off",
    showControls = true,
    className,
    onPlaybackChange,
    onVolumeChange,
    onMutedChange,
    onLoopModeChange,
    onError,
    onReady,
  },
  forwardedRef,
) {
  const parsedSource = useMemo(
    () => normalizeYouTubeSource(source),
    // The source key gives object callers stable dependency semantics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceKey(source)],
  );
  const parsedVideoId = parsedSource.ok ? parsedSource.source.videoId : undefined;
  const parsedPlaylistId = parsedSource.ok
    ? parsedSource.source.playlistId
    : undefined;
  const materializedVideoIds = parsedSource.ok
    ? (parsedSource.source.videoIds ?? [])
    : [];
  const materializedVideoIdsKey = materializedVideoIds.join(",");
  const initialVideoId = materializedVideoIds[0] ?? parsedVideoId;
  // A materialized private playlist must never be passed to the iframe by its
  // private playlist ID. Its already-authorized eligible video IDs are the
  // complete playback source instead.
  const iframePlaylistId =
    materializedVideoIds.length > 0 ? undefined : parsedPlaylistId;
  const remainingMaterializedVideoIds = materializedVideoIds.slice(1);
  const hasPlaylistQueue =
    Boolean(iframePlaylistId) || materializedVideoIds.length > 1;
  const parsedKey = `${initialVideoId ?? ""}|${iframePlaylistId ?? ""}|${materializedVideoIdsKey}`;

  const { api, status: apiStatus, error: apiError } = useYouTubeApi();
  const playerHostRef = useRef<HTMLDivElement>(null);
  const frameShellRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubeIframePlayer | null>(null);
  const playerReadyRef = useRef(false);
  const queuedPlayRef = useRef(false);
  const previousControlledPlaybackRef = useRef(playback);
  const observedControlledPlaybackRef = useRef(false);

  const [playerReady, setPlayerReady] = useState(false);
  const [actualPlayback, setActualPlayback] =
    useState<YouTubePlaybackState>("stopped");
  const [pendingPlay, setPendingPlay] = useState(false);
  const [localVolume, setLocalVolume] = useState(() => clampVolume(volume));
  const [localMuted, setLocalMuted] = useState(muted);
  const [localLoopMode, setLocalLoopMode] =
    useState<YouTubeLoopMode>(loopMode);
  const [lastError, setLastError] = useState<YouTubePlayerError | null>(null);

  const playbackCallbackRef = useLatest(onPlaybackChange);
  const volumeCallbackRef = useLatest(onVolumeChange);
  const mutedCallbackRef = useLatest(onMutedChange);
  const loopCallbackRef = useLatest(onLoopModeChange);
  const errorCallbackRef = useLatest(onError);
  const readyCallbackRef = useLatest(onReady);
  const loopModeRef = useLatest(localLoopMode);
  const volumeRef = useLatest(localVolume);
  const mutedRef = useLatest(localMuted);
  const titleRef = useLatest(title);

  const revealFrame = useCallback(() => {
    if (frameShellRef.current) {
      frameShellRef.current.hidden = false;
      frameShellRef.current.style.display = "block";
    }
  }, []);

  const reportError = useCallback(
    (error: YouTubePlayerError) => {
      queuedPlayRef.current = false;
      setPendingPlay(false);
      setLastError(error);
      setActualPlayback("stopped");
      playbackCallbackRef.current?.("stopped");
      errorCallbackRef.current?.(error);
    },
    [errorCallbackRef, playbackCallbackRef],
  );

  const play = useCallback(() => {
    if (!parsedSource.ok) {
      reportError(parsedSource.error);
      return;
    }

    if (document.visibilityState === "hidden") {
      setActualPlayback("paused");
      playbackCallbackRef.current?.("paused");
      return;
    }

    queuedPlayRef.current = true;
    setPendingPlay(true);
    setLastError(null);
    revealFrame();

    if (playerReadyRef.current && playerRef.current) {
      playerRef.current.playVideo();
    }
  }, [parsedSource, playbackCallbackRef, reportError, revealFrame]);

  const pause = useCallback(() => {
    queuedPlayRef.current = false;
    setPendingPlay(false);
    playerRef.current?.pauseVideo();

    if (!playerRef.current || !playerReadyRef.current) {
      setActualPlayback("paused");
      playbackCallbackRef.current?.("paused");
    }
  }, [playbackCallbackRef]);

  const stop = useCallback(() => {
    queuedPlayRef.current = false;
    setPendingPlay(false);
    playerRef.current?.stopVideo();
    setActualPlayback("stopped");
    playbackCallbackRef.current?.("stopped");
  }, [playbackCallbackRef]);

  const setPlayerVolume = useCallback(
    (nextVolume: number) => {
      const next = clampVolume(nextVolume);
      setLocalVolume(next);
      playerRef.current?.setVolume(next);
      volumeCallbackRef.current?.(next);
    },
    [volumeCallbackRef],
  );

  const setPlayerMuted = useCallback(
    (nextMuted: boolean) => {
      setLocalMuted(nextMuted);
      if (nextMuted) {
        playerRef.current?.mute();
      } else {
        playerRef.current?.unMute();
      }
      mutedCallbackRef.current?.(nextMuted);
    },
    [mutedCallbackRef],
  );

  const toggle = useCallback(() => {
    if (actualPlayback === "playing" || pendingPlay) {
      pause();
    } else {
      play();
    }
  }, [actualPlayback, pause, pendingPlay, play]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      mute: () => setPlayerMuted(true),
      pause,
      play,
      setVolume: setPlayerVolume,
      stop,
      toggle,
      unmute: () => setPlayerMuted(false),
    }),
    [pause, play, setPlayerMuted, setPlayerVolume, stop, toggle],
  );

  useEffect(() => {
    const next = clampVolume(volume);
    setLocalVolume(next);
    playerRef.current?.setVolume(next);
  }, [volume]);

  useEffect(() => {
    setLocalMuted(muted);
    if (muted) {
      playerRef.current?.mute();
    } else {
      playerRef.current?.unMute();
    }
  }, [muted]);

  useEffect(() => {
    setLocalLoopMode(loopMode);
    playerRef.current?.setLoop(loopMode === "playlist");
  }, [loopMode]);

  useEffect(() => {
    if (observedControlledPlaybackRef.current) {
      const previous = previousControlledPlaybackRef.current;
      previousControlledPlaybackRef.current = playback;

      if (playback === previous || playback === undefined) return;
      if (playback === "playing") play();
      if (playback === "paused") pause();
      if (playback === "stopped") stop();
      return;
    }

    // Deliberately ignore an initial `playing` value: mounting a player never
    // starts media without a post-mount user action.
    observedControlledPlaybackRef.current = true;
    previousControlledPlaybackRef.current = playback;
  }, [pause, play, playback, stop]);

  useEffect(() => {
    if (parsedSource.ok) return;
    reportError(parsedSource.error);
  }, [parsedSource, reportError]);

  useEffect(() => {
    if (apiStatus !== "error") return;
    reportError({
      code: "API_LOAD_FAILED",
      message: apiError?.message ?? "YouTube's player API could not be loaded.",
      recoverable: true,
    });
  }, [apiError, apiStatus, reportError]);

  useEffect(() => {
    if (!api || !parsedSource.ok || !playerHostRef.current) return;

    const hostContainer = playerHostRef.current;
    hostContainer.replaceChildren();
    const mountNode = document.createElement("div");
    hostContainer.appendChild(mountNode);

    setPlayerReady(false);
    playerReadyRef.current = false;
    setActualPlayback("stopped");
    setPendingPlay(false);
    queuedPlayRef.current = false;

    const handleStateChange = (
      event: YouTubeIframeEvent<YouTubeIframePlayerState>,
    ) => {
      switch (event.data) {
        case YOUTUBE_PLAYER_STATE.PLAYING:
          if (document.visibilityState === "hidden") {
            queuedPlayRef.current = false;
            setPendingPlay(false);
            event.target.pauseVideo();
            setActualPlayback("paused");
            playbackCallbackRef.current?.("paused");
            break;
          }
          queuedPlayRef.current = false;
          setPendingPlay(false);
          setLastError(null);
          setActualPlayback("playing");
          playbackCallbackRef.current?.("playing");
          break;
        case YOUTUBE_PLAYER_STATE.PAUSED:
          queuedPlayRef.current = false;
          setPendingPlay(false);
          setActualPlayback("paused");
          playbackCallbackRef.current?.("paused");
          break;
        case YOUTUBE_PLAYER_STATE.BUFFERING:
          setPendingPlay(true);
          revealFrame();
          break;
        case YOUTUBE_PLAYER_STATE.ENDED:
          if (document.visibilityState === "hidden") {
            queuedPlayRef.current = false;
            setPendingPlay(false);
            setActualPlayback("paused");
            playbackCallbackRef.current?.("paused");
            break;
          }
          if (
            loopModeRef.current === "video" ||
            (loopModeRef.current === "playlist" && !hasPlaylistQueue)
          ) {
            queuedPlayRef.current = true;
            setPendingPlay(true);
            revealFrame();
            event.target.seekTo(0, true);
            event.target.playVideo();
          } else if (
            loopModeRef.current === "playlist" &&
            hasPlaylistQueue
          ) {
            queuedPlayRef.current = true;
            setPendingPlay(true);
            revealFrame();
            event.target.playVideoAt(0);
          } else {
            queuedPlayRef.current = false;
            setPendingPlay(false);
            setActualPlayback("stopped");
            playbackCallbackRef.current?.("stopped");
          }
          break;
        default:
          break;
      }
    };

    const nextPlayer = new api.Player(mountNode, {
      width: "100%",
      height: "100%",
      ...(initialVideoId ? { videoId: initialVideoId } : {}),
      playerVars: {
        autoplay: 0,
        controls: 1,
        enablejsapi: 1,
        playsinline: 1,
        rel: 0,
        origin: window.location.origin,
        ...(remainingMaterializedVideoIds.length > 0
          ? { playlist: remainingMaterializedVideoIds.join(",") }
          : iframePlaylistId
            ? { listType: "playlist", list: iframePlaylistId }
          : {}),
      },
      events: {
        onReady: (event) => {
          playerRef.current = event.target;
          playerReadyRef.current = true;
          setPlayerReady(true);
          event.target.setVolume(volumeRef.current);
          if (mutedRef.current) event.target.mute();
          else event.target.unMute();
          if (materializedVideoIds.length > 1) {
            // `cuePlaylist` makes the full materialized queue—including the
            // first eligible video—a single loopable playlist without playing
            // it. The iframe still uses autoplay=0 and only starts after play().
            event.target.cuePlaylist(materializedVideoIds, 0, 0);
          }
          event.target.setLoop(loopModeRef.current === "playlist");
          event.target.getIframe().title = `YouTube player: ${titleRef.current}`;
          readyCallbackRef.current?.();

          if (
            queuedPlayRef.current &&
            document.visibilityState !== "hidden"
          ) {
            revealFrame();
            event.target.playVideo();
          }
        },
        onStateChange: handleStateChange,
        onError: (event) => reportError(describeYouTubeError(event.data)),
        onAutoplayBlocked: () => reportError(AUTOPLAY_BLOCKED_ERROR),
      },
    });

    playerRef.current = nextPlayer;

    return () => {
      queuedPlayRef.current = false;
      playerReadyRef.current = false;
      playerRef.current = null;
      try {
        nextPlayer.destroy();
      } finally {
        hostContainer.replaceChildren();
      }
    };
    // Callback and live setting refs intentionally keep the player instance
    // stable when parent callbacks, volume, mute, title, or loop mode change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, parsedKey]);

  useEffect(() => {
    const pauseForHiddenDocument = () => {
      if (document.visibilityState !== "hidden") return;

      const player = playerRef.current;
      const wasActive =
        pendingPlay ||
        actualPlayback === "playing" ||
        player?.getPlayerState() === YOUTUBE_PLAYER_STATE.PLAYING ||
        player?.getPlayerState() === YOUTUBE_PLAYER_STATE.BUFFERING;

      queuedPlayRef.current = false;
      setPendingPlay(false);
      player?.pauseVideo();

      if (wasActive) {
        setActualPlayback("paused");
        playbackCallbackRef.current?.("paused");
      }
    };

    document.addEventListener("visibilitychange", pauseForHiddenDocument);
    return () =>
      document.removeEventListener("visibilitychange", pauseForHiddenDocument);
  }, [actualPlayback, pendingPlay, playbackCallbackRef]);

  const frameVisible = pendingPlay || actualPlayback === "playing";
  const busy = apiStatus === "loading" || (!playerReady && parsedSource.ok);

  const changeLoopMode = (next: YouTubeLoopMode) => {
    setLocalLoopMode(next);
    playerRef.current?.setLoop(next === "playlist");
    loopCallbackRef.current?.(next);
  };

  return (
    <article className={className} style={playerShellStyle} data-youtube-player>
      <div style={compactRowStyle}>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div
            style={{
              overflow: "hidden",
              color: "inherit",
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.25,
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
          <div
            aria-live="polite"
            style={{
              marginTop: 3,
              color: lastError
                ? "var(--ss-danger, #ef9b87)"
                : "var(--ss-muted, #9eabb4)",
              fontSize: 12,
              lineHeight: 1.25,
            }}
          >
            {lastError?.message ??
              (busy
                ? "Loading YouTube player…"
                : actualPlayback === "playing" || pendingPlay
                  ? "Playing — video visible"
                  : actualPlayback === "paused"
                    ? "Paused"
                    : "Ready")}
          </div>
        </div>

        {showControls ? (
          <button
            type="button"
            style={buttonStyle}
            onClick={toggle}
            disabled={Boolean(lastError && !lastError.recoverable)}
            aria-label={
              actualPlayback === "playing" || pendingPlay
                ? `Pause ${title}`
                : `Play ${title}`
            }
          >
            {actualPlayback === "playing" || pendingPlay ? "Pause" : "Play"}
          </button>
        ) : null}
      </div>

      <div
        ref={frameShellRef}
        hidden={!frameVisible}
        style={{ ...frameStyle, display: frameVisible ? "block" : "none" }}
        aria-label={`Visible YouTube video for ${title}`}
      >
        <div
          ref={playerHostRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      </div>

      {showControls && (frameVisible || actualPlayback === "paused") ? (
        <div
          style={{
            ...compactRowStyle,
            flexWrap: "wrap",
            borderTop: frameVisible
              ? undefined
              : "1px solid var(--ss-border, #3b4650)",
          }}
        >
          <button type="button" style={buttonStyle} onClick={stop}>
            Stop
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => setPlayerMuted(!localMuted)}
            aria-pressed={localMuted}
          >
            {localMuted ? "Unmute" : "Mute"}
          </button>
          <label
            style={{
              display: "flex",
              flex: "1 1 150px",
              alignItems: "center",
              gap: 8,
              minWidth: 150,
              fontSize: 12,
              fontWeight: 650,
            }}
          >
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              value={localVolume}
              onChange={(event) => setPlayerVolume(Number(event.target.value))}
              style={{ flex: 1, accentColor: "var(--ss-accent, #bd7049)" }}
            />
            <span style={{ width: 28, textAlign: "right" }}>{localVolume}</span>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12,
              fontWeight: 650,
            }}
          >
            <span>Loop</span>
            <select
              value={localLoopMode}
              onChange={(event) =>
                changeLoopMode(event.target.value as YouTubeLoopMode)
              }
              style={{
                ...buttonStyle,
                minHeight: 34,
                paddingRight: 28,
              }}
            >
              <option value="off">Off</option>
              <option value="video">Video</option>
              <option value="playlist">Playlist</option>
            </select>
          </label>
        </div>
      ) : null}
    </article>
  );
});
