"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { demoOneShots, demoPlaylists, demoScenes, demoUploadedLayers } from "../demo-data";
import type {
  GoogleConnection,
  LibraryUpload,
  LoopMode,
  OneShot,
  PlaybackState,
  Scene,
  SceneDefinition,
  UploadedAudioLayer,
  YouTubeLayer,
  YouTubePlaylist,
} from "../types";
import { BrandMark, Icon, type IconName } from "./icons";
import { YouTubePlayer, type YouTubePlayerHandle } from "./youtube-player";

type AppTab = "session" | "library";
type LibraryCategory = "youtube" | "ambient" | "one-shots" | "favorites";
type SaveStatus = "saved" | "saving" | "unsaved" | "error";

const PLAYER_CAPS = { desktop: 4, tablet: 2, phone: 1 } as const;

function cloneDefinition(definition: SceneDefinition): SceneDefinition {
  return {
    ...definition,
    youtubeLayers: definition.youtubeLayers.map((layer) => ({ ...layer, playback: "stopped" })),
    uploadedLayers: definition.uploadedLayers.map((layer) => ({ ...layer, playback: "stopped" })),
    oneShots: definition.oneShots.map((sound) => ({ ...sound })),
  };
}

function isSceneDefinition(value: unknown): value is SceneDefinition {
  if (!value || typeof value !== "object") return false;
  const definition = value as Partial<SceneDefinition>;
  return (
    Array.isArray(definition.youtubeLayers) &&
    Array.isArray(definition.uploadedLayers) &&
    Array.isArray(definition.oneShots) &&
    typeof definition.masterVolume === "number"
  );
}

function stopDefinition(definition: SceneDefinition): SceneDefinition {
  return {
    ...definition,
    youtubeLayers: definition.youtubeLayers.map((layer) => ({ ...layer, playback: "stopped" })),
    uploadedLayers: definition.uploadedLayers.map((layer) => ({ ...layer, playback: "stopped" })),
  };
}

function persistedDefinition(definition: SceneDefinition): SceneDefinition {
  return stopDefinition(definition);
}

function getPlayerCap() {
  if (typeof window === "undefined") return PLAYER_CAPS.desktop;
  if (window.matchMedia("(max-width: 700px)").matches) return PLAYER_CAPS.phone;
  if (window.matchMedia("(max-width: 1120px)").matches) return PLAYER_CAPS.tablet;
  return PLAYER_CAPS.desktop;
}

function normalizeRemoteScene(scene: Record<string, unknown>): Scene | null {
  if (typeof scene.id !== "string" || typeof scene.name !== "string") return null;
  let definition = scene.definition;
  if (typeof definition === "string") {
    try {
      definition = JSON.parse(definition);
    } catch {
      return null;
    }
  }
  if (!isSceneDefinition(definition)) return null;
  return {
    id: scene.id,
    name: scene.name,
    description: typeof scene.description === "string" ? scene.description : undefined,
    definition: stopDefinition(definition),
    createdAt: typeof scene.createdAt === "string" ? scene.createdAt : undefined,
    updatedAt: typeof scene.updatedAt === "string" ? scene.updatedAt : undefined,
  };
}

function parseYouTubeInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return {};
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const list = url.searchParams.get("list") || undefined;
    const video =
      url.searchParams.get("v") ||
      (url.hostname.includes("youtu.be") ? url.pathname.split("/").filter(Boolean)[0] : undefined);
    return { videoId: video || undefined, playlistId: list };
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return { videoId: trimmed };
    if (/^PL[a-zA-Z0-9_-]+$/.test(trimmed)) return { playlistId: trimmed };
    return {};
  }
}

function useAudioElements(masterVolume: number) {
  const elements = useRef(new Map<string, HTMLAudioElement>());

  const setRef = useCallback((id: string, element: HTMLAudioElement | null) => {
    if (element) elements.current.set(id, element);
    else elements.current.delete(id);
  }, []);

  const sync = useCallback(
    (id: string, playback: PlaybackState, volume: number, loop: boolean) => {
      const audio = elements.current.get(id);
      if (!audio) return;
      audio.volume = Math.min(1, Math.max(0, (volume / 100) * (masterVolume / 100)));
      audio.loop = loop;
      if (playback === "playing") {
        void audio.play().catch(() => undefined);
      } else {
        audio.pause();
        if (playback === "stopped") audio.currentTime = 0;
      }
    },
    [masterVolume],
  );

  const stopAll = useCallback(() => {
    elements.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }, []);

  const restart = useCallback(
    (id: string, volume: number) => {
      const audio = elements.current.get(id);
      if (!audio) return false;
      audio.volume = Math.min(1, Math.max(0, (volume / 100) * (masterVolume / 100)));
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
      return true;
    },
    [masterVolume],
  );

  return { setRef, sync, stopAll, restart };
}

export function SoundscapeApp() {
  const [tab, setTab] = useState<AppTab>("session");
  const [scenes, setScenes] = useState<Scene[]>(demoScenes.map((scene) => ({ ...scene, definition: cloneDefinition(scene.definition) })));
  const [selectedSceneId, setSelectedSceneId] = useState(demoScenes[1].id);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [playerCap, setPlayerCap] = useState<
    (typeof PLAYER_CAPS)[keyof typeof PLAYER_CAPS]
  >(PLAYER_CAPS.desktop);
  const [toast, setToast] = useState<string | null>(null);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [libraryCategory, setLibraryCategory] = useState<LibraryCategory>("youtube");
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>(demoPlaylists);
  const [uploads, setUploads] = useState<LibraryUpload[]>([]);
  const [connection, setConnection] = useState<GoogleConnection>({ configured: false, connected: false });
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(demoPlaylists[0].id);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const remoteSceneIds = useRef(new Set<string>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const currentScene = useMemo(
    () => scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0],
    [scenes, selectedSceneId],
  );
  const definition = currentScene.definition;
  const audio = useAudioElements(definition.masterVolume);

  useEffect(() => {
    const updateCap = () => setPlayerCap(getPlayerCap());
    updateCap();
    window.addEventListener("resize", updateCap);
    return () => window.removeEventListener("resize", updateCap);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    definition.uploadedLayers.forEach((layer) =>
      audio.sync(layer.id, layer.playback, layer.volume, layer.loop),
    );
  }, [audio, definition.uploadedLayers]);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = window.localStorage.getItem("sirens-soundscape-scenes");
        const parsed = stored ? (JSON.parse(stored) as unknown[]) : [];
        const localScenes = parsed
          .map((scene) => scene && typeof scene === "object" ? normalizeRemoteScene(scene as Record<string, unknown>) : null)
          .filter((scene): scene is Scene => Boolean(scene));
        if (localScenes.length) {
          setScenes(localScenes);
          setSelectedSceneId(localScenes[0].id);
        }
      } catch {
        window.localStorage.removeItem("sirens-soundscape-scenes");
      }

      const [scenesResult, uploadsResult, statusResult] = await Promise.allSettled([
        fetch("/api/scenes", { headers: { accept: "application/json" } }),
        fetch("/api/uploads", { headers: { accept: "application/json" } }),
        fetch("/api/google/status", { headers: { accept: "application/json" } }),
      ]);

      if (scenesResult.status === "fulfilled" && scenesResult.value.ok) {
        const payload = (await scenesResult.value.json()) as { scenes?: Record<string, unknown>[] };
        const remoteScenes = (payload.scenes ?? [])
          .map(normalizeRemoteScene)
          .filter((scene): scene is Scene => Boolean(scene));
        if (remoteScenes.length) {
          remoteSceneIds.current = new Set(remoteScenes.map((scene) => scene.id));
          setScenes(remoteScenes);
          setSelectedSceneId(remoteScenes[0].id);
        }
      }

      if (uploadsResult.status === "fulfilled" && uploadsResult.value.ok) {
        const payload = (await uploadsResult.value.json()) as { uploads?: LibraryUpload[] };
        setUploads(payload.uploads ?? []);
      }

      if (statusResult.status === "fulfilled" && statusResult.value.ok) {
        const payload = (await statusResult.value.json()) as GoogleConnection;
        setConnection(payload);
        if (payload.connected) void refreshPlaylists(false);
      }
    };
    void load();
    // Initial hydration only; refreshPlaylists intentionally uses the current demo fallback.
  }, []);

  const updateCurrentDefinition = useCallback(
    (updater: (current: SceneDefinition) => SceneDefinition, persist = true) => {
      setScenes((currentScenes) =>
        currentScenes.map((scene) =>
          scene.id === selectedSceneId
            ? { ...scene, definition: updater(scene.definition), updatedAt: new Date().toISOString() }
            : scene,
        ),
      );
      if (persist) setSaveStatus("unsaved");
    },
    [selectedSceneId],
  );

  useEffect(() => {
    if (saveStatus !== "unsaved") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      const scene = scenes.find((candidate) => candidate.id === selectedSceneId);
      if (!scene) return;

      if (!remoteSceneIds.current.has(scene.id)) {
        window.localStorage.setItem("sirens-soundscape-scenes", JSON.stringify(scenes));
        setSaveStatus("saved");
        return;
      }

      try {
        const response = await fetch(`/api/scenes/${encodeURIComponent(scene.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: scene.name,
            description: scene.description,
            definition: persistedDefinition(scene.definition),
          }),
        });
        if (!response.ok) throw new Error("Scene save failed");
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [saveStatus, scenes, selectedSceneId]);

  const selectScene = (id: string) => {
    if (id === selectedSceneId) return;
    audio.stopAll();
    setScenes((currentScenes) =>
      currentScenes.map((scene) =>
        scene.id === selectedSceneId || scene.id === id
          ? { ...scene, definition: stopDefinition(scene.definition) }
          : scene,
      ),
    );
    setSelectedSceneId(id);
    setSaveStatus("saved");
  };

  const createScene = async () => {
    const number = scenes.length + 1;
    const localScene: Scene = {
      id: `local-${crypto.randomUUID()}`,
      name: `New Scene ${number}`,
      description: "A new scene, cued and ready to arrange.",
      definition: {
        youtubeLayers: [],
        uploadedLayers: [],
        oneShots: demoOneShots.map((sound) => ({ ...sound })),
        masterVolume: 80,
      },
    };

    try {
      const response = await fetch("/api/scenes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: localScene.name,
          description: localScene.description,
          definition: localScene.definition,
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { scene?: Record<string, unknown> };
        const created = payload.scene ? normalizeRemoteScene(payload.scene) : null;
        if (created) {
          remoteSceneIds.current.add(created.id);
          setScenes((current) => [...current, created]);
          setSelectedSceneId(created.id);
          setToast("New scene created");
          return;
        }
      }
    } catch {
      // Local-first fallback keeps the soundboard useful without a configured database.
    }

    setScenes((current) => [...current, localScene]);
    setSelectedSceneId(localScene.id);
    setToast("New scene created locally");
  };

  const stopAll = useCallback(() => {
    audio.stopAll();
    updateCurrentDefinition(stopDefinition, false);
    setToast("All sound stopped");
  }, [audio, updateCurrentDefinition]);

  const updateYouTubeLayer = (id: string, patch: Partial<YouTubeLayer>, persist = true) => {
    updateCurrentDefinition(
      (current) => ({
        ...current,
        youtubeLayers: current.youtubeLayers.map((layer) =>
          layer.id === id ? { ...layer, ...patch } : layer,
        ),
      }),
      persist,
    );
  };

  const toggleYouTube = (layer: YouTubeLayer) => {
    if (layer.playback === "playing") {
      updateYouTubeLayer(layer.id, { playback: "paused" }, false);
      return;
    }
    const activeCount = definition.youtubeLayers.filter((item) => item.playback === "playing").length;
    if (activeCount >= playerCap) {
      setToast(`This screen supports ${playerCap} active YouTube ${playerCap === 1 ? "player" : "players"}. Stop one to start another.`);
      return;
    }
    updateYouTubeLayer(layer.id, { playback: "playing", error: undefined }, false);
  };

  const updateUploadedLayer = (
    id: string,
    patch: Partial<UploadedAudioLayer>,
    persist = true,
  ) => {
    updateCurrentDefinition(
      (current) => ({
        ...current,
        uploadedLayers: current.uploadedLayers.map((layer) =>
          layer.id === id ? { ...layer, ...patch } : layer,
        ),
      }),
      persist,
    );
  };

  const toggleUploaded = (layer: UploadedAudioLayer) => {
    updateUploadedLayer(
      layer.id,
      { playback: layer.playback === "playing" ? "paused" : "playing" },
      false,
    );
  };

  const triggerOneShot = (sound: OneShot) => {
    audio.restart(`shot-${sound.id}`, sound.volume);
    setActiveShotId(sound.id);
    window.setTimeout(() => setActiveShotId((current) => (current === sound.id ? null : current)), 460);
  };

  async function refreshPlaylists(showMessage = true) {
    try {
      const response = await fetch("/api/youtube/playlists", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("Could not refresh playlists");
      const payload = (await response.json()) as { playlists?: Array<Record<string, unknown>> };
      const next = (payload.playlists ?? []).map((playlist) => ({
        id: String(playlist.id ?? ""),
        title: String(playlist.title ?? "Untitled playlist"),
        itemCount: Number(playlist.itemCount ?? playlist.videoCount ?? 0),
        privacy: ((playlist.privacy ?? playlist.privacyStatus) === "public" || (playlist.privacy ?? playlist.privacyStatus) === "unlisted"
          ? (playlist.privacy ?? playlist.privacyStatus)
          : "private") as YouTubePlaylist["privacy"],
        updatedLabel: typeof playlist.updatedLabel === "string" ? playlist.updatedLabel : undefined,
        thumbnailUrl: typeof playlist.thumbnailUrl === "string" ? playlist.thumbnailUrl : undefined,
        description: typeof playlist.description === "string" ? playlist.description : undefined,
      })).filter((playlist) => playlist.id);
      if (next.length) {
        setPlaylists(next);
        setSelectedPlaylistId((current) => current ?? next[0].id);
      }
      if (showMessage) setToast("YouTube playlists refreshed");
    } catch {
      if (showMessage) setToast("Could not refresh YouTube playlists");
    }
  }

  const addPlaylistToScene = async (playlist: YouTubePlaylist, role: "music" | "ambient" = "music") => {
    if (definition.youtubeLayers.some((layer) => layer.playlistId === playlist.id)) {
      setToast("That playlist is already in this scene");
      return;
    }
    try {
      const response = await fetch(`/api/youtube/playlists/${encodeURIComponent(playlist.id)}/items`, {
        headers: { accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        items?: Array<{ videoId?: string }>;
        skipped?: Array<{ reason?: string }>;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(payload.error?.message || "Could not inspect this playlist");
      const videoIds = (payload.items ?? []).flatMap((item) => item.videoId ? [item.videoId] : []);
      if (!videoIds.length) {
        setToast("This playlist has no public or unlisted videos that allow embedding");
        return;
      }
      const layer: YouTubeLayer = {
        id: `yt-${crypto.randomUUID()}`,
        title: playlist.title,
        videoIds,
        sourceKind: "playlist",
        role,
        privacy: playlist.privacy,
        itemCount: videoIds.length,
        volume: 70,
        loopMode: "playlist",
        playback: "stopped",
      };
      updateCurrentDefinition((current) => ({
        ...current,
        youtubeLayers: [...current.youtubeLayers, layer],
      }));
      const skipped = payload.skipped?.length ?? 0;
      setToast(skipped
        ? `${playlist.title} added with ${skipped} unavailable ${skipped === 1 ? "item" : "items"} skipped`
        : `${playlist.title} added to ${currentScene.name}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not add this playlist");
    }
  };

  const addUploadedToScene = (upload: LibraryUpload, role: "ambient" | "one-shot") => {
    if (role === "one-shot") {
      const sound: OneShot = {
        id: `shot-${upload.id}`,
        name: upload.name || upload.originalName || "Uploaded sound",
        streamUrl: upload.streamUrl,
        volume: 75,
        icon: "spark",
      };
      updateCurrentDefinition((current) => ({
        ...current,
        oneShots: current.oneShots.some((item) => item.streamUrl === upload.streamUrl)
          ? current.oneShots
          : [...current.oneShots, sound],
      }));
    } else {
      const layer: UploadedAudioLayer = {
        id: `layer-${upload.id}`,
        name: upload.name || upload.originalName || "Uploaded ambience",
        streamUrl: upload.streamUrl,
        role: "ambient",
        volume: 65,
        loop: true,
        playback: "stopped",
        icon: "wave" as never,
      };
      updateCurrentDefinition((current) => ({
        ...current,
        uploadedLayers: current.uploadedLayers.some((item) => item.streamUrl === upload.streamUrl)
          ? current.uploadedLayers
          : [...current.uploadedLayers, { ...layer, icon: "rain" }],
      }));
    }
    setToast(`${upload.name} added to ${currentScene.name}`);
  };

  const uploadAudio = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 90 * 1024 * 1024) {
      setToast("Audio files must be 90 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-file-name": file.name,
          "x-file-size": String(file.size),
        },
        body: file,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message || "Upload failed");
      }
      const payload = (await response.json()) as { upload: LibraryUpload };
      setUploads((current) => [payload.upload, ...current]);
      setLibraryCategory("ambient");
      setToast(`${file.name} uploaded`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const addManualSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = String(form.get("source") ?? "");
    const parsed = parseYouTubeInput(input);
    if (!parsed.videoId && !parsed.playlistId) {
      setToast("Enter a YouTube video or playlist URL");
      return;
    }
    const kind = parsed.playlistId ? "playlist" : "video";
    const layer: YouTubeLayer = {
      id: `yt-${crypto.randomUUID()}`,
      title: String(form.get("title") || (kind === "playlist" ? "YouTube Playlist" : "YouTube Video")),
      ...parsed,
      sourceKind: kind,
      role: form.get("role") === "music" ? "music" : "ambient",
      volume: 65,
      loopMode: kind === "playlist" ? "playlist" : "video",
      playback: "stopped",
    };
    updateCurrentDefinition((current) => ({ ...current, youtubeLayers: [...current.youtubeLayers, layer] }));
    setShowSourceForm(false);
    setToast(`${layer.title} added`);
  };

  const activeYouTube = definition.youtubeLayers.filter((layer) => layer.playback === "playing");
  const idleYouTube = definition.youtubeLayers.filter((layer) => layer.playback !== "playing");

  return (
    <div className="soundscape-shell">
      <header className="app-header">
        <button className="brand" type="button" onClick={() => setTab("session")} aria-label="Siren’s Soundscape home">
          <BrandMark />
          <span>Siren’s Soundscape</span>
        </button>

        <nav className="primary-tabs" aria-label="Primary navigation">
          <button className={tab === "session" ? "active" : ""} onClick={() => setTab("session")}>
            Session
          </button>
          <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
            Library
          </button>
        </nav>

        <div className="scene-title" title={currentScene.name}>{currentScene.name}</div>

        {tab === "session" ? (
          <div className="header-actions">
            <label className="master-volume">
              <span>Master Volume</span>
              <Icon name="volume" />
              <input
                aria-label="Master volume"
                type="range"
                min="0"
                max="100"
                value={definition.masterVolume}
                onChange={(event) =>
                  updateCurrentDefinition((current) => ({ ...current, masterVolume: Number(event.target.value) }))
                }
              />
              <output>{definition.masterVolume}%</output>
            </label>
            <div className={`save-state ${saveStatus}`} aria-live="polite">
              <span className="save-icon"><Icon name={saveStatus === "error" ? "info" : "check"} /></span>
              {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving" : saveStatus === "error" ? "Save failed" : "Unsaved"}
            </div>
            <button className="stop-all" type="button" onClick={stopAll}>
              <Icon name="square" /> Stop All
            </button>
          </div>
        ) : (
          <div className="library-account">
            <span className={connection.connected ? "connected" : "muted"}>
              {connection.connected ? "YouTube Connected" : connection.configured ? "YouTube Disconnected" : "YouTube Setup Needed"}
            </span>
            <span className="account-divider" />
            <span className="user-badge"><Icon name="user" /></span>
            <span className="account-name">{connection.email || "Owner"}</span>
            <Icon name="chevron-down" />
          </div>
        )}
      </header>

      {tab === "session" ? (
        <SessionView
          scenes={scenes}
          currentScene={currentScene}
          playerCap={playerCap}
          activeYouTube={activeYouTube}
          idleYouTube={idleYouTube}
          selectedSceneId={selectedSceneId}
          activeShotId={activeShotId}
          audioRef={audio.setRef}
          onSceneSelect={selectScene}
          onNewScene={createScene}
          onAddYouTube={() => setShowSourceForm(true)}
          onToggleYouTube={toggleYouTube}
          onYouTubePlayback={(id, playback) => updateYouTubeLayer(id, { playback }, false)}
          onYouTubeVolume={(id, volume) => updateYouTubeLayer(id, { volume })}
          onYouTubeLoop={(id, loopMode) => updateYouTubeLayer(id, { loopMode })}
          onYouTubeError={(id, error) => updateYouTubeLayer(id, { playback: "stopped", error }, false)}
          onToggleUploaded={toggleUploaded}
          onUploadedVolume={(id, volume) => updateUploadedLayer(id, { volume })}
          onUploadedLoop={(id, loop) => updateUploadedLayer(id, { loop })}
          onTriggerOneShot={triggerOneShot}
          onOpenLibrary={(category) => {
            setLibraryCategory(category);
            setTab("library");
          }}
        />
      ) : (
        <LibraryView
          category={libraryCategory}
          playlists={playlists}
          uploads={uploads}
          search={search}
          selectedPlaylistId={selectedPlaylistId}
          connection={connection}
          uploading={uploading}
          currentSceneName={currentScene.name}
          onCategoryChange={setLibraryCategory}
          onSearchChange={setSearch}
          onPlaylistSelect={setSelectedPlaylistId}
          onRefresh={() => void refreshPlaylists()}
          onConnect={() => { window.location.href = "/api/google/oauth/start"; }}
          onDisconnect={async () => {
            await fetch("/api/google/disconnect", { method: "POST" });
            setConnection((current) => ({ ...current, connected: false, email: undefined }));
            setPlaylists(demoPlaylists);
            setToast("YouTube disconnected");
          }}
          onUpload={() => fileInput.current?.click()}
          onAddPlaylist={addPlaylistToScene}
          onAddUpload={addUploadedToScene}
          onReturnToSession={() => setTab("session")}
        />
      )}

      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,.mp3,.m4a,.aac,.wav"
        onChange={uploadAudio}
      />

      {showSourceForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowSourceForm(false)}>
          <form className="source-modal" onSubmit={addManualSource} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Current scene</p>
                <h2>Add YouTube layer</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close" onClick={() => setShowSourceForm(false)}>
                <Icon name="close" />
              </button>
            </div>
            <label className="field">
              <span>YouTube video or playlist URL</span>
              <input name="source" type="text" required autoFocus placeholder="https://www.youtube.com/watch?v=…" />
            </label>
            <label className="field">
              <span>Display name</span>
              <input name="title" type="text" placeholder="Rain on the city walls" />
            </label>
            <fieldset className="role-picker">
              <legend>Source role</legend>
              <label><input name="role" type="radio" value="ambient" defaultChecked /> Ambient layer</label>
              <label><input name="role" type="radio" value="music" /> Music</label>
            </fieldset>
            <p className="compliance-note"><Icon name="info" /> Playback starts manually in a visible YouTube player.</p>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setShowSourceForm(false)}>Cancel</button>
              <button className="primary-button" type="submit"><Icon name="plus" /> Add layer</button>
            </div>
          </form>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

interface SessionViewProps {
  scenes: Scene[];
  currentScene: Scene;
  selectedSceneId: string;
  playerCap: number;
  activeYouTube: YouTubeLayer[];
  idleYouTube: YouTubeLayer[];
  activeShotId: string | null;
  audioRef: (id: string, element: HTMLAudioElement | null) => void;
  onSceneSelect: (id: string) => void;
  onNewScene: () => void;
  onAddYouTube: () => void;
  onToggleYouTube: (layer: YouTubeLayer) => void;
  onYouTubePlayback: (id: string, playback: PlaybackState) => void;
  onYouTubeVolume: (id: string, volume: number) => void;
  onYouTubeLoop: (id: string, loopMode: LoopMode) => void;
  onYouTubeError: (id: string, error: string) => void;
  onToggleUploaded: (layer: UploadedAudioLayer) => void;
  onUploadedVolume: (id: string, volume: number) => void;
  onUploadedLoop: (id: string, loop: boolean) => void;
  onTriggerOneShot: (sound: OneShot) => void;
  onOpenLibrary: (category: LibraryCategory) => void;
}

function SessionView(props: SessionViewProps) {
  const { currentScene } = props;
  const activeCount = props.activeYouTube.length;

  return (
    <div className="session-layout">
      <aside className="scene-rail">
        <div className="rail-heading">
          <h2>Scenes</h2>
          <Icon name="chevron-left" />
        </div>
        <div className="scene-list">
          {props.scenes.map((scene, index) => (
            <button
              className={`scene-row ${scene.id === props.selectedSceneId ? "active" : ""}`}
              key={scene.id}
              type="button"
              onClick={() => props.onSceneSelect(scene.id)}
            >
              <span className="scene-bookmark"><Icon name="bookmark" /><span>{index + 1}</span></span>
              <span className="scene-name">{scene.name}</span>
              <span className="scene-more"><Icon name="more" /></span>
            </button>
          ))}
        </div>
        <button className="dashed-action scene-new" type="button" onClick={props.onNewScene}>
          <Icon name="plus" /> New Scene
        </button>
      </aside>

      <main className="session-main">
        <section className="source-section youtube-section">
          <div className="section-heading">
            <div>
              <div className="heading-line">
                <h1>YouTube Sources</h1>
                <span className="heading-count">{activeCount} of {props.playerCap} active</span>
              </div>
              <p>{activeCount >= props.playerCap ? "Stop a layer to add another." : "A visible player opens only while a YouTube source is playing."}</p>
            </div>
            <button className="outline-button" type="button" onClick={props.onAddYouTube} disabled={activeCount >= props.playerCap}>
              <Icon name="plus" /> Add YouTube Layer
            </button>
          </div>

          {currentScene.definition.youtubeLayers.length > 0 ? (
            <div className={`youtube-source-grid count-${Math.min(activeCount, 4)} ${activeCount ? "has-active" : ""}`}>
              {[...props.activeYouTube, ...props.idleYouTube].map((layer) => (
                <YouTubeSource
                  key={layer.id}
                  layer={layer}
                  onToggle={() => props.onToggleYouTube(layer)}
                  onPlayback={(state) => props.onYouTubePlayback(layer.id, state)}
                  onVolume={(volume) => props.onYouTubeVolume(layer.id, volume)}
                  onLoop={(loopMode) => props.onYouTubeLoop(layer.id, loopMode)}
                  onError={(message) => props.onYouTubeError(layer.id, message)}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon="headphones" title="No YouTube layers yet" text="Add a video or playlist, then start it when the table is ready." action="Add YouTube layer" onAction={props.onAddYouTube} />
          )}
        </section>

        <section className="source-section uploaded-section">
          <div className="section-heading compact">
            <div>
              <h2>Uploaded Layers</h2>
              <p>Layer local ambience independently of YouTube.</p>
            </div>
            <button className="text-button" type="button" onClick={() => props.onOpenLibrary("ambient")}><Icon name="plus" /> Add layer</button>
          </div>
          <div className="uploaded-list">
            {currentScene.definition.uploadedLayers.map((layer, index) => (
              <UploadedLayerRow
                key={layer.id}
                layer={layer}
                seed={index}
                audioRef={props.audioRef}
                onToggle={() => props.onToggleUploaded(layer)}
                onVolume={(volume) => props.onUploadedVolume(layer.id, volume)}
                onLoop={(loop) => props.onUploadedLoop(layer.id, loop)}
              />
            ))}
          </div>
        </section>
      </main>

      <aside className="one-shot-rail">
        <div className="rail-heading"><h2>One-Shots</h2></div>
        <div className="one-shot-grid">
          {currentScene.definition.oneShots.map((sound) => (
            <button
              className={`one-shot ${props.activeShotId === sound.id ? "active" : ""}`}
              key={sound.id}
              type="button"
              onClick={() => props.onTriggerOneShot(sound)}
              aria-label={`Play ${sound.name}; repeated presses restart the sound`}
            >
              <Icon name={sound.icon} />
              <span>{sound.name}</span>
              {sound.streamUrl && <audio ref={(element) => props.audioRef(`shot-${sound.id}`, element)} src={sound.streamUrl} preload="metadata" />}
            </button>
          ))}
        </div>
        <button className="dashed-action add-sound" type="button" onClick={() => props.onOpenLibrary("one-shots")}>
          <Icon name="plus" /> Add Sound
        </button>
      </aside>
    </div>
  );
}

function YouTubeSource({
  layer,
  onToggle,
  onPlayback,
  onVolume,
  onLoop,
  onError,
}: {
  layer: YouTubeLayer;
  onToggle: () => void;
  onPlayback: (playback: PlaybackState) => void;
  onVolume: (volume: number) => void;
  onLoop: (loopMode: LoopMode) => void;
  onError: (message: string) => void;
}) {
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const playing = layer.playback === "playing";
  const source = layer.videoIds?.length
    ? { videoIds: layer.videoIds }
    : layer.playlistId
      ? { playlistId: layer.playlistId, videoId: layer.videoId }
      : { videoId: layer.videoId };
  const toggle = () => {
    if (playing) playerRef.current?.pause();
    else playerRef.current?.play();
    onToggle();
  };
  return (
    <article className={`youtube-source ${playing ? "playing" : "idle"} ${layer.error ? "has-error" : ""}`}>
      <div className="youtube-card-view">
        <h3>{layer.title}</h3>
        <div className="player-frame">
        <YouTubePlayer
          ref={playerRef}
          source={source}
          title={layer.title}
          playback={layer.playback}
          volume={layer.volume}
          loopMode={layer.loopMode}
          showControls={false}
          onPlaybackChange={onPlayback}
          onVolumeChange={onVolume}
          onError={(error) => onError(error.message)}
        />
        </div>
        <VolumeControl value={layer.volume} onChange={onVolume} compact />
        <div className="youtube-card-actions">
          <button className="pause-button" type="button" onClick={toggle} aria-label={`Pause ${layer.title}`}><Icon name="pause" /></button>
          <button
            className={`loop-control ${layer.loopMode !== "off" ? "active" : ""}`}
            type="button"
            onClick={() => onLoop(layer.loopMode === "off" ? (layer.sourceKind === "playlist" ? "playlist" : "video") : "off")}
          >
            <span>{layer.sourceKind === "playlist" ? "Loop Playlist" : "Loop Video"}</span>
            <Icon name="loop" />
          </button>
          <button className="icon-button" type="button" aria-label={`More options for ${layer.title}`}><Icon name="more" /></button>
        </div>
      </div>
      <div className="youtube-row-view">
        <button className="play-button" type="button" aria-label={`Play ${layer.title}`} onClick={toggle}><Icon name="play" /></button>
        <span className="source-badge"><Icon name={layer.sourceKind === "playlist" ? "library" : "folder-play"} /></span>
        <div className="source-copy">
          <h3>{layer.title}</h3>
          <p>{layer.privacy === "private" ? "Private " : ""}{layer.sourceKind}{layer.itemCount ? ` · ${layer.itemCount} videos` : ""}</p>
          {layer.error && <span className="source-error">{layer.error}</span>}
        </div>
        <VolumeControl value={layer.volume} onChange={onVolume} />
        <button
          className={`loop-control ${layer.loopMode !== "off" ? "active" : ""}`}
          type="button"
          onClick={() => onLoop(layer.loopMode === "off" ? (layer.sourceKind === "playlist" ? "playlist" : "video") : "off")}
          aria-label={`${layer.loopMode === "off" ? "Enable" : "Disable"} loop for ${layer.title}`}
        >
          <span>{layer.sourceKind === "playlist" ? "Loop Playlist" : "Loop Video"}</span>
          <Icon name="loop" />
        </button>
        <button className="icon-button" type="button" aria-label={`More options for ${layer.title}`}><Icon name="more" /></button>
      </div>
    </article>
  );
}

function UploadedLayerRow({
  layer,
  seed,
  audioRef,
  onToggle,
  onVolume,
  onLoop,
}: {
  layer: UploadedAudioLayer;
  seed: number;
  audioRef: (id: string, element: HTMLAudioElement | null) => void;
  onToggle: () => void;
  onVolume: (volume: number) => void;
  onLoop: (loop: boolean) => void;
}) {
  const playing = layer.playback === "playing";
  return (
    <article className={`uploaded-row ${playing ? "playing" : ""}`}>
      <button className="play-button" type="button" onClick={onToggle} aria-label={`${playing ? "Pause" : "Play"} ${layer.name}`}>
        <Icon name={playing ? "pause" : "play"} />
      </button>
      <span className="layer-icon"><Icon name={layer.icon as IconName} /></span>
      <div className="source-copy uploaded-name"><h3>{layer.name}</h3></div>
      <Waveform seed={seed} active={playing} />
      <VolumeControl value={layer.volume} onChange={onVolume} compact />
      <button className={`loop-icon-button ${layer.loop ? "active" : ""}`} type="button" onClick={() => onLoop(!layer.loop)} aria-label={`${layer.loop ? "Disable" : "Enable"} loop for ${layer.name}`}><Icon name="loop" /></button>
      <button className="icon-button" type="button" aria-label={`More options for ${layer.name}`}><Icon name="more" /></button>
      {layer.streamUrl && <audio ref={(element) => audioRef(layer.id, element)} src={layer.streamUrl} preload="metadata" />}
    </article>
  );
}

function VolumeControl({ value, onChange, compact = false }: { value: number; onChange: (value: number) => void; compact?: boolean }) {
  return (
    <label className={`volume-control ${compact ? "compact" : ""}`}>
      <span>Volume</span>
      <div><Icon name="volume" /><input aria-label="Volume" type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{value}%</output></div>
    </label>
  );
}

function Waveform({ seed, active }: { seed: number; active: boolean }) {
  return (
    <div className={`waveform ${active ? "active" : ""}`} aria-hidden="true">
      {Array.from({ length: 32 }, (_, index) => (
        <i key={index} style={{ height: `${22 + ((index * 17 + seed * 29) % 64)}%` }} />
      ))}
      {active && <span className="waveform-playhead" />}
    </div>
  );
}

function EmptyState({ icon, title, text, action, onAction }: { icon: IconName; title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div className="empty-state">
      <Icon name={icon} />
      <div><h3>{title}</h3><p>{text}</p></div>
      <button className="outline-button" type="button" onClick={onAction}><Icon name="plus" /> {action}</button>
    </div>
  );
}

interface LibraryViewProps {
  category: LibraryCategory;
  playlists: YouTubePlaylist[];
  uploads: LibraryUpload[];
  search: string;
  selectedPlaylistId: string | null;
  connection: GoogleConnection;
  uploading: boolean;
  currentSceneName: string;
  onCategoryChange: (category: LibraryCategory) => void;
  onSearchChange: (value: string) => void;
  onPlaylistSelect: (id: string) => void;
  onRefresh: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onUpload: () => void;
  onAddPlaylist: (playlist: YouTubePlaylist, role?: "music" | "ambient") => void;
  onAddUpload: (upload: LibraryUpload, role: "ambient" | "one-shot") => void;
  onReturnToSession: () => void;
}

function LibraryView(props: LibraryViewProps) {
  const selectedPlaylist = props.playlists.find((playlist) => playlist.id === props.selectedPlaylistId) ?? null;
  const [role, setRole] = useState<"music" | "ambient">("music");
  const filteredPlaylists = props.playlists.filter((playlist) => playlist.title.toLowerCase().includes(props.search.toLowerCase()));

  return (
    <div className="library-layout">
      <aside className="library-rail">
        <div className="rail-heading"><h2>Audio Library</h2></div>
        <nav className="library-nav" aria-label="Audio library categories">
          <LibraryNavButton active={props.category === "youtube"} icon="folder-play" label="YouTube Playlists" count={props.playlists.length} onClick={() => props.onCategoryChange("youtube")} />
          <LibraryNavButton active={props.category === "ambient"} icon="wave" label="Ambient Audio" count={Math.max(props.uploads.length, demoUploadedLayers.length)} onClick={() => props.onCategoryChange("ambient")} />
          <LibraryNavButton active={props.category === "one-shots"} icon="thunder" label="One-Shots" count={Math.max(props.uploads.length, demoOneShots.length)} onClick={() => props.onCategoryChange("one-shots")} />
          <LibraryNavButton active={props.category === "favorites"} icon="star" label="Favorites" count={0} onClick={() => props.onCategoryChange("favorites")} />
        </nav>
        <div className="library-rail-actions">
          {props.connection.connected ? (
            <button className="dashed-action" type="button" onClick={props.onRefresh}><Icon name="refresh" /> Refresh Playlists</button>
          ) : (
            <button className="dashed-action" type="button" onClick={props.onConnect}><Icon name="link" /> Connect YouTube</button>
          )}
          <button className="dashed-action sage" type="button" onClick={props.onUpload} disabled={props.uploading}><Icon name="upload" /> {props.uploading ? "Uploading…" : "Upload Audio"}</button>
        </div>
        <div className="library-settings">
          <div className="policy-links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
          {props.connection.connected && <button className="disconnect-button" onClick={props.onDisconnect}>Disconnect YouTube</button>}
        </div>
      </aside>

      <main className="library-main">
        {props.category === "youtube" ? (
          <>
            <div className="library-main-heading">
              <h1>{props.connection.connected ? "Private YouTube Playlists" : "YouTube Playlists"}</h1>
              <label className="search-box"><Icon name="search" /><input aria-label="Search playlists" value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Search playlists" /></label>
              <button className="text-button" type="button" onClick={props.onRefresh}><Icon name="refresh" /> Refresh</button>
            </div>
            {!props.connection.connected && (
              <div className="connection-banner">
                <div><Icon name="link" /><span><strong>Connect YouTube for private playlists.</strong> Public videos can still be added directly in Session.</span></div>
                <button className="outline-button" type="button" onClick={props.onConnect}>Connect YouTube</button>
              </div>
            )}
            <div className="playlist-list">
              {filteredPlaylists.map((playlist, index) => (
                <article className={`playlist-row ${playlist.id === props.selectedPlaylistId ? "selected" : ""}`} key={playlist.id} onClick={() => props.onPlaylistSelect(playlist.id)}>
                  <div className={`playlist-art art-${(index % 3) + 1}`}><Icon name={index === 0 ? "fire" : index === 1 ? "cloud-rain" : "user"} /></div>
                  <div className="playlist-copy">
                    <h2>{playlist.title}</h2>
                    <p>{playlist.itemCount} videos</p>
                    <span><Icon name="lock" /> {playlist.privacy[0].toUpperCase() + playlist.privacy.slice(1)} <i /> {playlist.updatedLabel || "Recently updated"}</span>
                  </div>
                  <button className="preview-button" type="button" onClick={(event) => event.stopPropagation()}><Icon name="eye" /> Preview</button>
                  <button className="outline-button" type="button" onClick={(event) => { event.stopPropagation(); props.onPlaylistSelect(playlist.id); props.onAddPlaylist(playlist); }}>
                    Add to Scene
                  </button>
                </article>
              ))}
            </div>
          </>
        ) : (
          <AudioLibraryList category={props.category} uploads={props.uploads} onUpload={props.onUpload} onAdd={props.onAddUpload} />
        )}
      </main>

      {props.category === "youtube" && selectedPlaylist ? (
        <aside className="library-detail">
          <div className="detail-heading"><h2>Add to {props.currentSceneName}</h2><button className="icon-button" onClick={props.onReturnToSession} aria-label="Close details"><Icon name="close" /></button></div>
          <div className="selected-summary"><div className="playlist-art art-1"><Icon name="fire" /></div><div><h3>{selectedPlaylist.title}</h3><p>{selectedPlaylist.itemCount} videos</p></div></div>
          <div className="detail-divider" />
          <fieldset className="segmented-control">
            <legend>Source Role</legend>
            <button className={role === "music" ? "active" : ""} type="button" onClick={() => setRole("music")}>Music Playlist</button>
            <button className={role === "ambient" ? "active" : ""} type="button" onClick={() => setRole("ambient")}>Ambient Layer</button>
          </fieldset>
          <label className="field"><span>Display Name</span><input value={selectedPlaylist.title} readOnly /></label>
          <VolumeControl value={75} onChange={() => undefined} />
          <div className="toggle-row"><span>Loop Playlist</span><span className="toggle active"><i /></span></div>
          <div className="toggle-row"><span>Shuffle</span><span className="toggle"><i /></span></div>
          <p className="compliance-note"><Icon name="info" /> Playback starts manually in the visible YouTube player.</p>
          <div className="detail-actions">
            <button className="primary-button" type="button" onClick={() => props.onAddPlaylist(selectedPlaylist, role)}>Add to Scene</button>
            <button className="secondary-button" type="button" onClick={props.onReturnToSession}>Cancel</button>
          </div>
        </aside>
      ) : (
        <aside className="library-detail compact-detail">
          <div className="detail-heading"><h2>{props.category === "one-shots" ? "One-Shot Library" : props.category === "favorites" ? "Favorites" : "Ambient Library"}</h2><button className="icon-button" onClick={props.onReturnToSession} aria-label="Return to session"><Icon name="close" /></button></div>
          <p className="detail-help">Choose a sound in the library and add it to <strong>{props.currentSceneName}</strong>.</p>
          <button className="primary-button" type="button" onClick={props.onUpload}><Icon name="upload" /> Upload Audio</button>
          <button className="secondary-button" type="button" onClick={props.onReturnToSession}>Return to Session</button>
        </aside>
      )}
    </div>
  );
}

function LibraryNavButton({ active, icon, label, count, onClick }: { active: boolean; icon: IconName; label: string; count: number; onClick: () => void }) {
  return <button className={active ? "active" : ""} type="button" onClick={onClick}><Icon name={icon} /><span>{label}</span><output>{count}</output></button>;
}

function AudioLibraryList({ category, uploads, onUpload, onAdd }: { category: LibraryCategory; uploads: LibraryUpload[]; onUpload: () => void; onAdd: (upload: LibraryUpload, role: "ambient" | "one-shot") => void }) {
  const title = category === "one-shots" ? "One-Shots" : category === "favorites" ? "Favorites" : "Uploaded Audio";
  const visibleUploads = category === "favorites" ? [] : uploads;
  return (
    <>
      <div className="library-main-heading"><h1>{title}</h1><button className="outline-button sage" type="button" onClick={onUpload}><Icon name="upload" /> Upload Audio</button></div>
      {visibleUploads.length ? (
        <div className="audio-library-list">
          {visibleUploads.map((upload, index) => (
            <article className="audio-library-row" key={upload.id}>
              <span className="layer-icon"><Icon name={category === "one-shots" ? "spark" : "cloud-rain"} /></span>
              <div className="source-copy"><h3>{upload.name || upload.originalName}</h3><p>{category === "one-shots" ? "One-Shot" : "Ambience"}</p></div>
              <Waveform seed={index + 2} active={false} />
              <audio src={upload.streamUrl} controls preload="none" />
              <button className="outline-button" type="button" onClick={() => onAdd(upload, category === "one-shots" ? "one-shot" : "ambient")}><Icon name="plus" /> Add</button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={category === "favorites" ? "star" : "upload"} title={category === "favorites" ? "No favorites yet" : "No uploaded audio yet"} text={category === "favorites" ? "Favorite the sounds you reach for most often." : "Upload MP3, M4A, AAC, or WAV files up to 90 MB."} action={category === "favorites" ? "Browse audio" : "Upload audio"} onAction={onUpload} />
      )}
    </>
  );
}
