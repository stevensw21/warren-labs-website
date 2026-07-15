"use client";

import { CSSProperties, ChangeEvent, PointerEvent, WheelEvent, useEffect, useMemo, useRef, useState } from "react";

type Unit = "ft" | "m" | "mi";
type Point = { id: string; label: string; name?: string; x: number; y: number; depth?: number };
type Vector = { id: string; fromId: string; toId: string; bearing: number; distance: number; unit: Unit };
type CoastPoint = { id: string; x: number; y: number };
type PrintArea = { x: number; y: number; width: number; height: number };
type ReferenceImage = { dataUrl?: string; opacity: number; scale: number; x: number; y: number; visible: boolean; locked: boolean };
type Calibration = { vectorId?: string; distance?: number; unit?: Unit; metersPerPixel: number };
type ExportSettings = { reference: boolean; shoreline: boolean; routes: boolean; routeLabels: boolean; pointMarkers: boolean; namedPointMarkersOnly: boolean; pointNames: boolean; fullPointNames: boolean; depths: boolean; contours: boolean; mapFurniture: boolean; pointTable: boolean };
type Project = {
  version: 1; id: string; title: string; date: string; notes: string; distanceUnit: Unit; depthUnit: Unit;
  coastline: CoastPoint[]; shoreLocked?: boolean; waypoints: Point[]; vectors: Vector[]; reference: ReferenceImage; calibration?: Calibration; exportSettings?: ExportSettings; printArea?: PrintArea;
};
type Tool = "select" | "coast" | "origin" | "point" | "reference" | "printArea";
type PrintAreaHandle = "move" | "nw" | "ne" | "se" | "sw";
type Drag = { kind: "waypoint" | "coast" | "pan" | "reference" | "printAreaDraw" | "printAreaAdjust"; id?: string; start: Project; x: number; y: number; point?: { x: number; y: number }; area?: PrintArea; handle?: PrintAreaHandle };

const DB_NAME = "dive-map-builder";
const STORE_NAME = "projects";
const CANVAS = { width: 1200, height: 800 };
const PRINT_FRAME = { width: 1000, height: 500 };
const DEFAULT_METERS_PER_PIXEL = 0.5;
const METERS_PER_UNIT: Record<Unit, number> = { ft: 0.3048, m: 1, mi: 1609.344 };
const UNIT_LABEL: Record<Unit, string> = { ft: "feet", m: "meters", mi: "miles" };
const DEFAULT_EXPORT_SETTINGS: ExportSettings = { reference: true, shoreline: true, routes: true, routeLabels: true, pointMarkers: true, namedPointMarkersOnly: false, pointNames: true, fullPointNames: true, depths: true, contours: true, mapFurniture: true, pointTable: true };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const id = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const round = (value: number, precision = 2) => Math.round(value * 10 ** precision) / 10 ** precision;
const formatNumber = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const emptyProject = (title = "Untitled dive site"): Project => ({
  version: 1, id: id(), title, date: new Date().toISOString().slice(0, 10), notes: "", distanceUnit: "ft", depthUnit: "ft",
  coastline: [], shoreLocked: false, waypoints: [], vectors: [], calibration: { metersPerPixel: DEFAULT_METERS_PER_PIXEL }, exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
  reference: { opacity: 0.48, scale: 1, x: 0, y: 0, visible: true, locked: false },
});

function bearingFor(dx: number, dy: number) { return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; }
function formatDepth(point: Point, unit: Unit) { return point.depth === undefined || point.depth === null ? "—" : `${formatNumber(point.depth)} ${unit}`; }
function normalizePrintArea(area?: Partial<PrintArea>): PrintArea | undefined {
  if (!area || !Number.isFinite(area.x) || !Number.isFinite(area.y) || !Number.isFinite(area.width) || !Number.isFinite(area.height)) return undefined;
  const { x, y, width, height } = area as PrintArea;
  const left = Math.max(0, Math.min(CANVAS.width, Math.min(x, x + width)));
  const top = Math.max(0, Math.min(CANVAS.height, Math.min(y, y + height)));
  const right = Math.max(left, Math.min(CANVAS.width, Math.max(x, x + width)));
  const bottom = Math.max(top, Math.min(CANVAS.height, Math.max(y, y + height)));
  if (right - left < 12 || bottom - top < 12) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
function printAreaFromPoints(start: { x: number; y: number }, end: { x: number; y: number }) { return normalizePrintArea({ x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y }); }
function pointInPrintArea(point: Point, area?: PrintArea) { return !area || (point.x >= area.x && point.x <= area.x + area.width && point.y >= area.y && point.y <= area.y + area.height); }
function mapScale(project: Project) { return project.calibration?.metersPerPixel && project.calibration.metersPerPixel > 0 ? project.calibration.metersPerPixel : DEFAULT_METERS_PER_PIXEL; }
function geometry(project: Project, vector: Vector) {
  const start = project.waypoints.find((point) => point.id === vector.fromId);
  const end = project.waypoints.find((point) => point.id === vector.toId);
  if (!start || !end) return null;
  return { start, end, dx: end.x - start.x, dy: end.y - start.y, pixels: Math.hypot(end.x - start.x, end.y - start.y) };
}
function synchronizeVectors(project: Project) {
  const metersPerPixel = mapScale(project);
  project.vectors.forEach((vector) => {
    const line = geometry(project, vector);
    if (!line) return;
    vector.bearing = round(bearingFor(line.dx, line.dy));
    vector.unit = project.distanceUnit;
    vector.distance = round((line.pixels * metersPerPixel) / METERS_PER_UNIT[project.distanceUnit]);
  });
  return project;
}
function normalizeProject(raw: Project): Project {
  const project = clone(raw);
  project.version = 1;
  const savedReference = project.reference ?? ({} as Partial<ReferenceImage>);
  project.reference = { dataUrl: savedReference.dataUrl, opacity: savedReference.opacity ?? 0.48, scale: savedReference.scale ?? 1, x: savedReference.x ?? 0, y: savedReference.y ?? 0, visible: savedReference.visible ?? true, locked: savedReference.locked ?? false };
  project.waypoints = (project.waypoints ?? []).map((point) => ({ ...point, name: point.name ?? "" }));
  project.vectors = (project.vectors ?? []).map((vector) => ({ ...vector, unit: METERS_PER_UNIT[vector.unit] ? vector.unit : project.distanceUnit }));
  project.shoreLocked = project.shoreLocked ?? false;
  project.exportSettings = { ...DEFAULT_EXPORT_SETTINGS, ...project.exportSettings };
  project.printArea = normalizePrintArea(project.printArea);
  project.calibration = { ...project.calibration, metersPerPixel: mapScale(project) };
  return synchronizeVectors(project);
}
function niceDistance(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1;
  return nice * exponent;
}
function scaleBar(project: Project) {
  const unit = project.distanceUnit;
  const targetUnits = (100 * mapScale(project)) / METERS_PER_UNIT[unit];
  const value = niceDistance(targetUnits);
  return { value, pixels: Math.max(25, (value * METERS_PER_UNIT[unit]) / mapScale(project)) };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readProjects(): Promise<Project[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => { database.close(); resolve((request.result as Project[]).map(normalizeProject)); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}
async function persistProject(project: Project) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(project);
    request.onsuccess = () => { database.close(); resolve(); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}
async function removeProjectFromStore(projectId: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(projectId);
    request.onsuccess = () => { database.close(); resolve(); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

export default function ScubaMapMaker() {
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVectorId, setSelectedVectorId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.78);
  const [pan, setPan] = useState({ x: 22, y: 24 });
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const [vectorForm, setVectorForm] = useState({ bearing: "0", distance: "30", label: "", depth: "" });
  const [calibrationForm, setCalibrationForm] = useState({ distance: "", unit: "ft" as Unit });
  const [notice, setNotice] = useState("Loading local map library…");
  const [pointTableOnly] = useState(() => typeof window !== "undefined" && Boolean(new URLSearchParams(window.location.search).get("point-table")));
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const syncChannel = useRef<BroadcastChannel | null>(null);
  const windowId = useRef(id());

  useEffect(() => {
    const requestedProjectId = new URLSearchParams(window.location.search).get("point-table");
    readProjects().then((stored) => {
      const ordered = stored.sort((a, b) => b.date.localeCompare(a.date));
      const first = ordered[0] ?? emptyProject("Beaver Lake dive map");
      const active = requestedProjectId ? ordered.find((item) => item.id === requestedProjectId) ?? first : first;
      setProject(active); setProjects(ordered.length ? ordered : [first]); setReady(true);
      setNotice(ordered.length ? "Local projects restored with their map scale." : "New local project ready — place A0 to begin.");
      if (!ordered.length) void persistProject(first);
    }).catch(() => { const fresh = emptyProject("Beaver Lake dive map"); setProject(fresh); setProjects([fresh]); setReady(true); setNotice("Working in this browser session."); });
  }, []);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("soundings-project-sync");
    syncChannel.current = channel;
    channel.onmessage = (event: MessageEvent<{ type?: string; source?: string; project?: Project }>) => {
      if (event.data?.type !== "project-update" || event.data.source === windowId.current || !event.data.project) return;
      const incoming = normalizeProject(event.data.project);
      setProjects((items) => [incoming, ...items.filter((item) => item.id !== incoming.id)]);
      setProject((current) => current?.id === incoming.id ? incoming : current);
    };
    return () => { channel.close(); syncChannel.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !project) return;
    const timer = window.setTimeout(() => { void persistProject(project); setProjects((all) => [project, ...all.filter((item) => item.id !== project.id)]); }, 250);
    return () => window.clearTimeout(timer);
  }, [project, ready]);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => {
    const panWithArrowKeys = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const step = event.shiftKey ? 180 : 60;
      const offsets: Record<string, { x: number; y: number }> = {
        ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step }, ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 },
      };
      const offset = offsets[event.key];
      if (!offset) return;
      event.preventDefault();
      const next = { x: panRef.current.x + offset.x, y: panRef.current.y + offset.y };
      panRef.current = next;
      setPan(next);
    };
    window.addEventListener("keydown", panWithArrowKeys);
    return () => window.removeEventListener("keydown", panWithArrowKeys);
  }, []);
  useEffect(() => {
    const continuePan = (event: globalThis.PointerEvent) => {
      const activeDrag = drag.current;
      if (!activeDrag || activeDrag.kind !== "pan") return;
      const next = { x: panRef.current.x + event.clientX - activeDrag.x, y: panRef.current.y + event.clientY - activeDrag.y };
      activeDrag.x = event.clientX;
      activeDrag.y = event.clientY;
      panRef.current = next;
      setPan(next);
    };
    const finishPan = () => { if (drag.current?.kind === "pan") drag.current = null; };
    window.addEventListener("pointermove", continuePan);
    window.addEventListener("pointerup", finishPan);
    window.addEventListener("pointercancel", finishPan);
    return () => { window.removeEventListener("pointermove", continuePan); window.removeEventListener("pointerup", finishPan); window.removeEventListener("pointercancel", finishPan); };
  }, []);

  const selected = project?.waypoints.find((point) => point.id === selectedId) ?? null;
  const selectedVector = project?.vectors.find((vector) => vector.id === selectedVectorId) ?? null;
  const depthPoints = useMemo(() => (project?.waypoints.filter((point) => point.depth !== undefined) ?? []), [project]);
  const pointMap = useMemo(() => new Map(project?.waypoints.map((point) => [point.id, point]) ?? []), [project]);

  const update = (next: Project, record = true) => {
    if (!project) return;
    if (record) { setUndoStack((old) => [...old.slice(-29), clone(project)]); setRedoStack([]); }
    setProject(next);
    syncChannel.current?.postMessage({ type: "project-update", source: windowId.current, project: next });
  };
  const mutate = (fn: (current: Project) => Project, record = true) => project && update(fn(clone(project)), record);
  const possibleNextPoints = (current: Project, fromId: string, vectorId?: string) => current.waypoints.filter((candidate) => {
    if (candidate.id === fromId) return false;
    return !current.vectors.some((vector) => vector.fromId === fromId && vector.toId === candidate.id && vector.id !== vectorId);
  });
  const undo = () => {
    if (!project || !undoStack.length) return;
    const previous = undoStack[undoStack.length - 1]; setUndoStack((items) => items.slice(0, -1)); setRedoStack((items) => [...items, clone(project)]); setProject(previous); setNotice("Undid last map edit.");
  };
  const redo = () => {
    if (!project || !redoStack.length) return;
    const next = redoStack[redoStack.length - 1]; setRedoStack((items) => items.slice(0, -1)); setUndoStack((items) => [...items, clone(project)]); setProject(next); setNotice("Restored map edit.");
  };
  const canvasPosition = (event: PointerEvent<HTMLElement>) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(CANVAS.width, (event.clientX - rect.left - pan.x) / zoom)), y: Math.max(0, Math.min(CANVAS.height, (event.clientY - rect.top - pan.y) / zoom)) };
  };
  const movePoint = (current: Project, pointId: string, x: number, y: number) => {
    const point = current.waypoints.find((item) => item.id === pointId); if (!point) return current;
    point.x = x; point.y = y;
    return synchronizeVectors(current);
  };
  const onStagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!project || event.button !== 0) return;
    if (drag.current) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, label")) return;
    if (tool === "select") { event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); drag.current = { kind: "pan", start: clone(project), x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); return; }
    if (tool === "reference" && project.reference.dataUrl && !project.reference.locked) { drag.current = { kind: "reference", start: clone(project), x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); return; }
    const position = canvasPosition(event);
    if (tool === "printArea") { event.preventDefault(); drag.current = { kind: "printAreaDraw", start: clone(project), x: event.clientX, y: event.clientY, point: position }; mutate((current) => { current.printArea = { x: position.x, y: position.y, width: 12, height: 12 }; return current; }, false); event.currentTarget.setPointerCapture(event.pointerId); return; }
    if (tool === "coast" && project.shoreLocked) { setTool("select"); setNotice("The shoreline is locked. Unlock it to draw or adjust the coast."); return; }
    if (tool === "coast") { mutate((current) => { current.coastline.push({ id: id(), ...position }); return current; }); setNotice("Shoreline vertex added. Keep clicking to trace the coast."); return; }
    if (tool === "origin" && !project.waypoints.some((point) => point.label === "A0")) { mutate((current) => { current.waypoints.push({ id: id(), label: "A0", name: "Origin", ...position }); return current; }); setTool("select"); setNotice("A0 established. Pan empty water with a left-drag."); return; }
    if (tool === "point") { const label = `P${project.waypoints.filter((point) => point.label.startsWith("P")).length + 1}`; mutate((current) => { current.waypoints.push({ id: id(), label, name: "", ...position }); return current; }); setTool("select"); setNotice(`${label} added. Use the point table to name or connect it.`); return; }
    if (tool === "origin") setNotice("A0 already exists. Select it from the map or point table.");
  };
  const onStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!project || !drag.current) return;
    const activeDrag = drag.current;
    if (activeDrag.kind === "pan") return;
    if (activeDrag.kind === "reference") { const dx = (event.clientX - activeDrag.x) / zoom; const dy = (event.clientY - activeDrag.y) / zoom; mutate((current) => { current.reference.x += dx; current.reference.y += dy; return current; }, false); activeDrag.x = event.clientX; activeDrag.y = event.clientY; return; }
    const position = canvasPosition(event);
    if (activeDrag.kind === "printAreaDraw" && activeDrag.point) { mutate((current) => { current.printArea = printAreaFromPoints(activeDrag.point!, position) ?? { x: activeDrag.point!.x, y: activeDrag.point!.y, width: 12, height: 12 }; return current; }, false); return; }
    if (activeDrag.kind === "printAreaAdjust" && activeDrag.area && activeDrag.point && activeDrag.handle) {
      const original = activeDrag.area;
      let next: PrintArea | undefined;
      if (activeDrag.handle === "move") {
        next = normalizePrintArea({ x: Math.max(0, Math.min(CANVAS.width - original.width, original.x + position.x - activeDrag.point.x)), y: Math.max(0, Math.min(CANVAS.height - original.height, original.y + position.y - activeDrag.point.y)), width: original.width, height: original.height });
      } else {
        const left = activeDrag.handle.includes("w") ? position.x : original.x;
        const top = activeDrag.handle.includes("n") ? position.y : original.y;
        const right = activeDrag.handle.includes("e") ? position.x : original.x + original.width;
        const bottom = activeDrag.handle.includes("s") ? position.y : original.y + original.height;
        next = printAreaFromPoints({ x: left, y: top }, { x: right, y: bottom });
      }
      if (next) mutate((current) => { current.printArea = next; return current; }, false);
      return;
    }
    if (activeDrag.kind === "waypoint" && activeDrag.id) mutate((current) => movePoint(current, activeDrag.id!, position.x, position.y), false);
    if (activeDrag.kind === "coast" && activeDrag.id) mutate((current) => { const vertex = current.coastline.find((item) => item.id === activeDrag.id); if (vertex) Object.assign(vertex, position); return current; }, false);
  };
  const onStagePointerUp = () => {
    if (!drag.current || !project) return;
    const original = drag.current.start; const kind = drag.current.kind; drag.current = null;
    if (kind !== "pan") { setUndoStack((items) => [...items.slice(-29), original]); setRedoStack([]); }
    if (kind === "printAreaDraw") { setTool("select"); setNotice("Print area set. Drag its center or corners to refine it, then print the selected area."); }
  };
  const onStageWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const currentZoom = zoomRef.current;
    const nextZoom = Math.max(0.1, currentZoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
    const mapX = (event.clientX - rect.left - panRef.current.x) / currentZoom;
    const mapY = (event.clientY - rect.top - panRef.current.y) / currentZoom;
    const nextPan = { x: event.clientX - rect.left - mapX * nextZoom, y: event.clientY - rect.top - mapY * nextZoom };
    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    setZoom(nextZoom);
    setPan(nextPan);
  };
  const startDrag = (event: PointerEvent<HTMLButtonElement>, kind: "waypoint" | "coast", itemId: string) => {
    event.stopPropagation(); if (!project || (kind === "coast" && project.shoreLocked)) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { kind, id: itemId, start: clone(project), x: event.clientX, y: event.clientY }; setSelectedId(kind === "waypoint" ? itemId : null); setTool("select");
  };
  const startPrintAreaAdjust = (event: PointerEvent<HTMLButtonElement>, handle: PrintAreaHandle) => {
    event.preventDefault(); event.stopPropagation();
    if (!project?.printArea) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind: "printAreaAdjust", start: clone(project), x: event.clientX, y: event.clientY, point: canvasPosition(event), area: project.printArea, handle };
    setTool("select");
  };
  const toggleShoreLock = () => {
    if (!project) return;
    const willLock = !project.shoreLocked;
    mutate((current) => { current.shoreLocked = willLock; return current; });
    setTool("select");
    setNotice(willLock ? "Shoreline locked. Drawing tools are minimized." : "Shoreline unlocked. You can draw or adjust the coast again.");
  };
  const selectVector = (vector: Vector) => { setSelectedVectorId(vector.id); setCalibrationForm({ distance: String(vector.distance), unit: vector.unit }); setNotice("Route line selected. Set its known distance to calibrate the map."); };
  const addVector = () => {
    if (!project || !selected) { setNotice("Select A0 or another waypoint first."); return; }
    const bearing = Number(vectorForm.bearing); const distance = Number(vectorForm.distance);
    if (!Number.isFinite(bearing) || !Number.isFinite(distance) || distance <= 0) { setNotice("Enter a valid bearing and positive distance."); return; }
    const pixels = (distance * METERS_PER_UNIT[project.distanceUnit]) / mapScale(project); const radians = ((bearing % 360) * Math.PI) / 180;
    const next = { id: id(), label: vectorForm.label.trim() || `P${project.waypoints.filter((point) => point.label.startsWith("P")).length + 1}`, name: "", x: Math.max(0, Math.min(CANVAS.width, selected.x + Math.sin(radians) * pixels)), y: Math.max(0, Math.min(CANVAS.height, selected.y - Math.cos(radians) * pixels)), depth: vectorForm.depth === "" ? undefined : Number(vectorForm.depth) };
    mutate((current) => { current.waypoints.push(next); current.vectors.push({ id: id(), fromId: selected.id, toId: next.id, bearing: 0, distance: 0, unit: current.distanceUnit }); return synchronizeVectors(current); });
    setSelectedId(next.id); setVectorForm({ bearing: "0", distance: "30", label: "", depth: "" }); setNotice(`Added ${next.label} from ${selected.label}.`);
  };
  const calibrateMap = () => {
    if (!project || !selectedVector) return;
    const distance = Number(calibrationForm.distance); if (!Number.isFinite(distance) || distance <= 0) { setNotice("Enter a positive known distance for this route line."); return; }
    const line = geometry(project, selectedVector); if (!line || line.pixels === 0) { setNotice("Choose a route line with visible length to calibrate the map."); return; }
    mutate((current) => { current.calibration = { vectorId: selectedVector.id, distance, unit: calibrationForm.unit, metersPerPixel: (distance * METERS_PER_UNIT[calibrationForm.unit]) / line.pixels }; return synchronizeVectors(current); });
    setNotice(`Map scale calibrated from ${formatNumber(distance)} ${calibrationForm.unit}.`);
  };
  const updatePointLabel = (pointId: string, label: string) => {
    if (!project || label.trim() === "") return;
    if (project.waypoints.some((point) => point.id !== pointId && point.label.toLowerCase() === label.trim().toLowerCase())) { setNotice("Each Point Name must be unique."); return; }
    mutate((current) => { const point = current.waypoints.find((item) => item.id === pointId); if (point) point.label = label.trim(); return current; });
  };
  const setVectorTarget = (vectorId: string, targetId: string) => {
    if (!project || !targetId) return;
    const vector = project.vectors.find((item) => item.id === vectorId); if (!vector || !possibleNextPoints(project, vector.fromId, vectorId).some((point) => point.id === targetId)) { setNotice("That connection duplicates an existing route."); return; }
    mutate((current) => { const item = current.vectors.find((entry) => entry.id === vectorId); if (item) item.toId = targetId; return synchronizeVectors(current); });
  };
  const connectPoints = (fromId: string, targetId: string) => {
    if (!project || !targetId || !possibleNextPoints(project, fromId).some((point) => point.id === targetId)) { setNotice("That connection duplicates an existing route."); return; }
    mutate((current) => { current.vectors.push({ id: id(), fromId, toId: targetId, bearing: 0, distance: 0, unit: current.distanceUnit }); return synchronizeVectors(current); });
  };
  const updateVectorBearing = (vectorId: string, bearing: string) => {
    const degrees = Number(bearing); if (!project || !Number.isFinite(degrees)) return;
    mutate((current) => { const vector = current.vectors.find((item) => item.id === vectorId); if (!vector) return current; const line = geometry(current, vector); if (!line) return current; const radians = ((degrees % 360) * Math.PI) / 180; line.end.x = Math.max(0, Math.min(CANVAS.width, line.start.x + Math.sin(radians) * line.pixels)); line.end.y = Math.max(0, Math.min(CANVAS.height, line.start.y - Math.cos(radians) * line.pixels)); return synchronizeVectors(current); });
  };
  const deletePoint = (pointId: string) => {
    if (!project) return;
    const point = project.waypoints.find((item) => item.id === pointId);
    if (!point) return;
    if (point.label === "A0") { setNotice("A0 is the required root and cannot be removed. Start a new project to reset it."); return; }
    if (!window.confirm(`Delete ${point.label} and its attached routes?`)) return;
    mutate((current) => { current.waypoints = current.waypoints.filter((item) => item.id !== point.id); current.vectors = current.vectors.filter((vector) => vector.fromId !== point.id && vector.toId !== point.id); return current; });
    setSelectedId((current) => current === point.id ? null : current);
    setNotice("Removed the point and its attached routes.");
  };
  const deleteSelected = () => { if (selected) deletePoint(selected.id); };
  const onReferenceUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !project) return;
    const reader = new FileReader(); reader.onload = () => mutate((current) => { current.reference.dataUrl = String(reader.result); current.reference.visible = true; return current; }); reader.readAsDataURL(file); event.target.value = "";
  };
  const changeDistanceUnit = (unit: Unit) => mutate((current) => { current.distanceUnit = unit; return synchronizeVectors(current); }, false);
  const setExportSetting = (setting: keyof ExportSettings, value: boolean) => mutate((current) => { current.exportSettings = { ...DEFAULT_EXPORT_SETTINGS, ...current.exportSettings, [setting]: value }; return current; }, false);
  const newProject = () => { const next = emptyProject("New dive site"); setProject(next); setProjects((items) => [next, ...items]); setSelectedId(null); setSelectedVectorId(null); setUndoStack([]); setRedoStack([]); void persistProject(next); setNotice("New project created locally."); };
  const duplicateProject = () => { if (!project) return; const next = clone(project); next.id = id(); next.title = `${project.title} copy`; setProject(next); setProjects((items) => [next, ...items]); void persistProject(next); setNotice("Project duplicated locally."); };
  const deleteProject = () => { if (!project || !window.confirm(`Delete “${project.title}” from this browser?`)) return; void removeProjectFromStore(project.id); const remaining = projects.filter((item) => item.id !== project.id); const next = remaining[0] ?? emptyProject("New dive site"); setProjects(remaining.length ? remaining : [next]); setProject(next); setSelectedId(null); if (!remaining.length) void persistProject(next); setNotice("Local project deleted."); };
  const exportBackup = () => { if (!project) return; const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "dive-map"}.json`; link.click(); URL.revokeObjectURL(link.href); setNotice("Editable project backup downloaded."); };
  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = normalizeProject(JSON.parse(String(reader.result)) as Project); if (imported.version !== 1 || !Array.isArray(imported.waypoints)) throw new Error("Unsupported backup"); imported.id = id(); imported.title = `${imported.title || "Imported dive site"} (imported)`; setProject(imported); setProjects((items) => [imported, ...items]); void persistProject(imported); setNotice("Project backup imported into this browser."); } catch { setNotice("That file is not a compatible dive-map backup."); } }; reader.readAsText(file); event.target.value = "";
  };
  const openPointTableWindow = () => {
    if (!project) return;
    const url = new URL(window.location.href);
    url.searchParams.set("point-table", project.id);
    const popup = window.open(url.toString(), "soundings-point-table", "popup=yes,width=1180,height=780,resizable=yes,scrollbars=yes");
    if (popup) popup.focus();
    else setNotice("Your browser blocked the point-table window. Allow pop-ups for this site and try again.");
  };

  if (!project) return <main className="soundings-app loading"><div className="loading-mark">⌁</div><p>Opening your dive-map workbench…</p></main>;

  const coast = project.coastline;
  const exportSettings = project.exportSettings ?? DEFAULT_EXPORT_SETTINGS;
  const printArea = project.printArea;
  const printPoints = project.waypoints.filter((point) => pointInPrintArea(point, printArea));
  const printCropScale = printArea ? Math.min(PRINT_FRAME.width / printArea.width, PRINT_FRAME.height / printArea.height) : 0.72;
  const printCropStyle = printArea ? {
    "--print-crop-scale": String(printCropScale),
    "--print-offset-x": `${(PRINT_FRAME.width - printArea.width * printCropScale) / 2 - printArea.x * printCropScale}px`,
    "--print-offset-y": `${(PRINT_FRAME.height - printArea.height * printCropScale) / 2 - printArea.y * printCropScale}px`,
    "--print-scale-bar": `${scaleBar(project).pixels * printCropScale}px`,
  } as CSSProperties : undefined;
  const exportClass = (visible: boolean) => visible ? "" : " export-hidden";
  const routeRows = project.waypoints.reduce<Array<{ point: Point; vector: Vector | null }>>((rows, point) => {
    const outgoing = project.vectors.filter((vector) => vector.fromId === point.id);
    if (outgoing.length) rows.push(...outgoing.map((vector) => ({ point, vector })));
    rows.push({ point, vector: null });
    return rows;
  }, []);
  const mapBar = scaleBar(project);
  const calibrationLine = selectedVector ? geometry(project, selectedVector) : null;
  const shoreStrokeStyle = { "--shore-height": `${8 / zoom}px`, "--shore-top-border": `${2 / zoom}px`, "--shore-bottom-border": `${1 / zoom}px` } as CSSProperties;
  const routeStrokeStyle = { "--route-hit-height": `${14 / zoom}px`, "--route-hit-offset": `${-6 / zoom}px`, "--route-stroke": `${2 / zoom}px`, "--route-stroke-top": `${6 / zoom}px`, "--route-stroke-end": `${8 / zoom}px`, "--route-arrow-top": `${2 / zoom}px`, "--route-arrow-width": `${9 / zoom}px`, "--route-arrow-half": `${5 / zoom}px`, "--route-selected-stroke": `${3 / zoom}px`, "--route-label-border": `${1 / zoom}px`, "--route-label-radius": `${3 / zoom}px`, "--route-label-font": `${10 / zoom}px`, "--route-label-padding-y": `${2 / zoom}px`, "--route-label-padding-x": `${4 / zoom}px` } as CSSProperties;
  const waypointDisplayStyle = { "--point-hit-size": `${10 / zoom}px`, "--point-dot-size": `${6 / zoom}px`, "--point-dot-border": `${1 / zoom}px`, "--point-ring": `${0.5 / zoom}px`, "--point-origin-ring": `${1 / zoom}px`, "--point-shadow": `${0.5 / zoom}px`, "--point-shadow-blur": `${2 / zoom}px`, "--point-label-top": `${-3 / zoom}px`, "--point-label-left": `${10 / zoom}px`, "--point-label-size": `${11 / zoom}px`, "--point-name-size": `${9 / zoom}px`, "--point-depth-size": `${10 / zoom}px` } as CSSProperties;
  const pointLedger = <section className="panel point-ledger"><div className="point-ledger-heading"><div><p className="eyebrow">5. Point menu</p><p className="helper">Place points on the map, then use this table to name, connect, and describe them. Every point keeps a Connect to… row for adding more lines, including returns to A0.</p></div>{!pointTableOnly && <button className="popout-button" onClick={openPointTableWindow}>Open in new window</button>}</div><div className="table-scroll"><table><thead><tr><th>Point Name</th><th>Name</th><th>Degrees to next point</th><th>Next Point Name</th><th>Current depth</th></tr></thead><tbody>{routeRows.map(({ point, vector }) => <tr key={vector?.id ?? `terminal-${point.id}`}><td><div className="point-name-cell"><input aria-label={`${point.label} Point Name`} value={point.label} disabled={point.label === "A0"} onChange={(event) => updatePointLabel(point.id, event.target.value)}/><button className="delete-point" aria-label={`Delete ${point.label}`} disabled={point.label === "A0"} title={point.label === "A0" ? "A0 is required" : `Delete ${point.label}`} onClick={() => deletePoint(point.id)}>Delete</button></div></td><td><input aria-label={`${point.label} Name`} value={point.name ?? ""} onChange={(event) => mutate((current) => { const item = current.waypoints.find((entry) => entry.id === point.id); if (item) item.name = event.target.value; return current; }, false)}/></td><td>{vector ? <input aria-label={`${point.label} degrees to next point`} defaultValue={round(vector.bearing)} inputMode="decimal" onBlur={(event) => updateVectorBearing(vector.id, event.target.value)}/> : <span className="empty-cell">—</span>}</td><td><select aria-label={`${point.label} next point name`} value={vector?.toId ?? ""} onChange={(event) => vector ? setVectorTarget(vector.id, event.target.value) : connectPoints(point.id, event.target.value)}><option value="">{vector ? "Choose point" : "Connect to…"}</option>{possibleNextPoints(project, point.id, vector?.id).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.label}{candidate.name ? ` — ${candidate.name}` : ""}</option>)}</select></td><td><input aria-label={`${point.label} current depth`} inputMode="decimal" placeholder={project.depthUnit} value={point.depth ?? ""} onChange={(event) => mutate((current) => { const item = current.waypoints.find((entry) => entry.id === point.id); if (item) item.depth = event.target.value === "" ? undefined : Number(event.target.value); return current; }, false)}/></td></tr>)}</tbody></table></div></section>;

  if (pointTableOnly) return <main className="soundings-app point-table-window"><header><div><strong>Soundings</strong><span>Point table · {project.title}</span></div><button onClick={() => window.close()}>Close window</button></header>{pointLedger}</main>;

  return (
    <main className="soundings-app app-shell">
      <aside className="sidebar print-hidden">
        <div className="brand"><span className="brand-mark">⌁</span><div><strong>Soundings</strong><small>dive map studio</small></div></div>
        <div className="library-row"><select aria-label="Open local project" value={project.id} onChange={(event) => { const next = projects.find((item) => item.id === event.target.value); if (next) { setProject(next); setSelectedId(null); setSelectedVectorId(null); setUndoStack([]); setRedoStack([]); } }}>{projects.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select><button className="icon-button" onClick={newProject} title="New project">＋</button></div>
        <div className="project-actions"><button onClick={duplicateProject}>Duplicate</button><button onClick={exportBackup}>Download backup</button><label className="file-button">Import backup<input type="file" accept="application/json" onChange={importBackup}/></label><button className="danger" onClick={deleteProject}>Delete</button></div>

        <section className="panel site-details"><p className="eyebrow">Dive site</p><input className="title-input" value={project.title} aria-label="Dive site title" onChange={(event) => mutate((current) => ({ ...current, title: event.target.value }), false)} /><div className="field-grid"><label>Date<input type="date" value={project.date} onChange={(event) => mutate((current) => ({ ...current, date: event.target.value }), false)} /></label><label>Distance unit<select value={project.distanceUnit} onChange={(event) => changeDistanceUnit(event.target.value as Unit)}>{Object.entries(UNIT_LABEL).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label>Depth unit<select value={project.depthUnit} onChange={(event) => mutate((current) => ({ ...current, depthUnit: event.target.value as Unit }), false)}>{Object.entries(UNIT_LABEL).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label></div></section>

        <section className="panel"><p className="eyebrow">1. Reference image</p><label className="upload-button">{project.reference.dataUrl ? "Replace reference" : "Upload reference image"}<input type="file" accept="image/*" onChange={onReferenceUpload}/></label>{project.reference.dataUrl && <><div className="range-label"><span>Opacity</span><output>{Math.round(project.reference.opacity * 100)}%</output></div><input type="range" min="0" max="1" step="0.05" value={project.reference.opacity} onChange={(event) => mutate((current) => ({ ...current, reference: { ...current.reference, opacity: Number(event.target.value) } }), false)} /><div className="range-label"><span>Size</span><output>{project.reference.scale.toFixed(1)}×</output></div><input type="range" min="0.4" max="2.4" step="0.1" value={project.reference.scale} onChange={(event) => mutate((current) => ({ ...current, reference: { ...current.reference, scale: Number(event.target.value) } }), false)} /><div className="split-buttons"><button className={tool === "reference" ? "active" : ""} onClick={() => setTool("reference")}>Move image</button><button onClick={() => mutate((current) => ({ ...current, reference: { ...current.reference, locked: !current.reference.locked } }))}>{project.reference.locked ? "Unlock" : "Lock"}</button><button onClick={() => mutate((current) => ({ ...current, reference: { ...current.reference, visible: !current.reference.visible } }))}>{project.reference.visible ? "Hide" : "Show"}</button></div></>}</section>

        <section className={`panel workflow ${project.shoreLocked ? "workflow-collapsed" : ""}`}><div className="workflow-heading"><p className="eyebrow">2. Draw your map</p><button className="shore-lock" aria-pressed={project.shoreLocked} onClick={toggleShoreLock}>{project.shoreLocked ? "Unlock shore" : "Lock shore"}</button></div>{project.shoreLocked ? <p className="workflow-minimized">Shoreline locked. Unlock to draw or adjust the coast.</p> : <div className="workflow-body"><button className={tool === "coast" ? "tool active" : "tool"} onClick={() => setTool("coast")}><b>Trace coast</b><span>Click the canvas to place shoreline vertices.</span></button><button className={tool === "origin" ? "tool active" : "tool"} onClick={() => setTool("origin")} disabled={project.waypoints.some((point) => point.label === "A0")}><b>Place A0 origin</b><span>Set the first navigation point.</span></button><button className={tool === "point" ? "tool active" : "tool"} onClick={() => setTool("point")}><b>Place point</b><span>Click to add a point, then connect it in the table.</span></button><button className={tool === "select" ? "tool active" : "tool"} onClick={() => setTool("select")}><b>Pan & adjust</b><span>Left-drag empty water to pan; drag handles to refine.</span></button>{coast.length >= 3 && <button className="quiet-button" onClick={() => mutate((current) => { current.coastline = []; return current; })}>Clear shoreline</button>}</div>}</section>

        <section className="panel"><p className="eyebrow">3. Add vector</p>{selected ? <><p className="selected-copy">Starting from <b>{selected.label}</b> · depth {formatDepth(selected, project.depthUnit)}</p><div className="field-grid vector-grid"><label>Bearing °<input inputMode="decimal" value={vectorForm.bearing} onChange={(event) => setVectorForm({ ...vectorForm, bearing: event.target.value })}/></label><label>Distance<input inputMode="decimal" value={vectorForm.distance} onChange={(event) => setVectorForm({ ...vectorForm, distance: event.target.value })}/></label><label>New point name<input placeholder="P1" value={vectorForm.label} onChange={(event) => setVectorForm({ ...vectorForm, label: event.target.value })}/></label><label>Depth<input placeholder={project.depthUnit} inputMode="decimal" value={vectorForm.depth} onChange={(event) => setVectorForm({ ...vectorForm, depth: event.target.value })}/></label></div><button className="primary" onClick={addVector}>Add vector from {selected.label}</button></> : <p className="helper">Place or select a point to add a vector branch.</p>}</section>

        <section className="panel calibration-panel"><p className="eyebrow">4. Calibrate map scale</p><label>Reference route<select value={selectedVectorId ?? ""} onChange={(event) => { const vector = project.vectors.find((item) => item.id === event.target.value); if (vector) selectVector(vector); else setSelectedVectorId(null); }}><option value="">Select a route line</option>{project.vectors.map((vector) => { const start = pointMap.get(vector.fromId); const end = pointMap.get(vector.toId); return <option value={vector.id} key={vector.id}>{start?.label} → {end?.label}</option>; })}</select></label>{selectedVector && calibrationLine ? <><p className="helper">This line currently measures {formatNumber(selectedVector.distance)} {selectedVector.unit}. Enter its known real distance.</p><div className="field-grid"><label>Known distance<input inputMode="decimal" value={calibrationForm.distance} onChange={(event) => setCalibrationForm({ ...calibrationForm, distance: event.target.value })}/></label><label>Unit<select value={calibrationForm.unit} onChange={(event) => setCalibrationForm({ ...calibrationForm, unit: event.target.value as Unit })}>{Object.entries(UNIT_LABEL).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label></div><button className="primary" onClick={calibrateMap}>Set map scale</button></> : <p className="helper">Click a route line or choose one above to set the real-world scale.</p>}<p className="scale-note">Current scale: {formatNumber(mapScale(project))} meters per map pixel.</p></section>

        <section className="panel export-settings"><p className="eyebrow">Export map</p><p className="helper">Choose what appears in Print / Save PDF. Route and shoreline lines are preserved at a readable print width.</p><div className="print-area-controls"><button className={tool === "printArea" ? "active" : ""} onClick={() => { setTool("printArea"); setNotice("Drag a rectangle over the map to set the PDF print area."); }}>{printArea ? "Redraw print area" : "Set print area"}</button>{printArea && <button onClick={() => mutate((current) => { delete current.printArea; return current; })}>Clear print area</button>}</div>{printArea && <p className="print-area-note">Selected area: {Math.round(printArea.width)} × {Math.round(printArea.height)} map pixels · {printPoints.length} point{printPoints.length === 1 ? "" : "s"} in PDF</p>}<div className="export-grid">{([ ["reference", "Reference image"], ["shoreline", "Shoreline"], ["routes", "Route lines"], ["routeLabels", "Route labels"], ["pointMarkers", "Point markers"], ["namedPointMarkersOnly", "Only points with a full Name"], ["pointNames", "Point Names (A0, B1, C3)"], ["fullPointNames", "Full point names"], ["depths", "Depth labels"], ["contours", "Depth contours"], ["mapFurniture", "North arrow & scale"], ["pointTable", "Point detail table"] ] as Array<[keyof ExportSettings, string]>).map(([setting, label]) => <label key={setting}><input type="checkbox" checked={exportSettings[setting]} onChange={(event) => setExportSetting(setting, event.target.checked)}/>{label}</label>)}</div><button className="primary" onClick={() => window.print()}>Print with selected settings</button></section>

        {pointLedger}

        {selected && <section className="panel selected-panel"><p className="eyebrow">Selected waypoint</p><div className="field-grid"><label>Point Name<input value={selected.label} disabled={selected.label === "A0"} onChange={(event) => updatePointLabel(selected.id, event.target.value)}/></label><label>Name<input value={selected.name ?? ""} onChange={(event) => mutate((current) => { const point = current.waypoints.find((item) => item.id === selected.id); if (point) point.name = event.target.value; return current; }, false)}/></label><label>Depth<input value={selected.depth ?? ""} placeholder={project.depthUnit} inputMode="decimal" onChange={(event) => mutate((current) => { const point = current.waypoints.find((item) => item.id === selected.id); if (point) point.depth = event.target.value === "" ? undefined : Number(event.target.value); return current; })}/></label></div><button className="danger-line" onClick={deleteSelected}>Remove waypoint branch</button></section>}
      </aside>

      <section className="workspace">
        <header className="topbar print-hidden"><div><span className="status-dot"/> <span>{notice}</span></div><div className="top-actions"><button onClick={undo} disabled={!undoStack.length}>Undo</button><button onClick={redo} disabled={!redoStack.length}>Redo</button><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.1, value / 1.25))}>−</button><span className="zoom-readout">{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setZoom((value) => value * 1.25)}>＋</button><button onClick={() => { setPan({ x: 22, y: 24 }); setZoom(0.78); }}>Recenter</button><button className="primary print-button" onClick={() => window.print()}>Print / Save PDF</button></div></header>
        <div className={`map-stage ${tool === "select" ? "pan-ready" : ""}${printArea ? " has-print-area" : ""}`} style={printCropStyle} ref={stageRef} tabIndex={0} aria-label="Map navigation surface. Drag blank map space to pan; scroll to zoom; use arrow keys to move around." onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={onStagePointerUp} onPointerCancel={onStagePointerUp} onWheel={onStageWheel}>
          <div className="map-canvas" onPointerDown={onStagePointerDown} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <div className="water-label">BEAVER LAKE · DIVE SITE CHART</div>
            {printArea && <div className="print-area-overlay print-hidden" style={{ left: printArea.x, top: printArea.y, width: printArea.width, height: printArea.height }}><button className="print-area-move" aria-label="Move PDF print area" onPointerDown={(event) => startPrintAreaAdjust(event, "move")}>PDF print area</button>{(["nw", "ne", "se", "sw"] as PrintAreaHandle[]).map((handle) => <button key={handle} className={`print-area-handle ${handle}`} aria-label={`Resize PDF print area from ${handle}`} onPointerDown={(event) => startPrintAreaAdjust(event, handle)}/>)}</div>}
            {project.reference.dataUrl && project.reference.visible && <img className={`reference-image${exportClass(exportSettings.reference)}`} src={project.reference.dataUrl} alt="Uploaded trace reference" style={{ opacity: project.reference.opacity, transform: `translate(${project.reference.x}px, ${project.reference.y}px) scale(${project.reference.scale})` }} draggable={false}/>}
            {coast.length > 1 && coast.slice(1).map((vertex, index) => { const before = coast[index]; const dx = vertex.x - before.x; const dy = vertex.y - before.y; return <div className={`coast-line${exportClass(exportSettings.shoreline)}`} key={`coast-${vertex.id}`} style={{ ...shoreStrokeStyle, left: before.x, top: before.y, width: Math.hypot(dx, dy), transform: `rotate(${Math.atan2(dy, dx)}rad)` }}/>; })}
            {coast.length > 2 && (() => { const first = coast[0], last = coast[coast.length - 1]; const dx = first.x - last.x, dy = first.y - last.y; return <div className={`coast-line coast-close${exportClass(exportSettings.shoreline)}`} style={{ ...shoreStrokeStyle, left: last.x, top: last.y, width: Math.hypot(dx, dy), transform: `rotate(${Math.atan2(dy, dx)}rad)` }}/>; })()}
            {!project.shoreLocked && coast.map((vertex) => <button key={vertex.id} aria-label="Move shoreline vertex" className="coast-vertex" style={{ left: vertex.x, top: vertex.y }} onPointerDown={(event) => startDrag(event, "coast", vertex.id)} />)}
            {project.vectors.map((vector) => { const line = geometry(project, vector); if (!line) return null; return <div className="vector-group" key={vector.id}><button className={`vector-line ${selectedVectorId === vector.id ? "selected-vector" : ""}${exportClass(exportSettings.routes)}`} aria-label={`Select route from ${line.start.label} to ${line.end.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectVector(vector); }} style={{ ...routeStrokeStyle, left: line.start.x, top: line.start.y, width: line.pixels, transform: `rotate(${Math.atan2(line.dy, line.dx)}rad)` }}/><button className={`vector-label${exportClass(exportSettings.routeLabels)}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectVector(vector); }} style={{ ...routeStrokeStyle, left: line.start.x + line.dx / 2, top: line.start.y + line.dy / 2 }}>{Math.round(vector.bearing)}° · {formatNumber(vector.distance)} {vector.unit}</button></div>; })}
            {depthPoints.length >= 3 && <div className={`contours${exportClass(exportSettings.contours)}`} style={{ left: depthPoints.reduce((sum, point) => sum + point.x, 0) / depthPoints.length, top: depthPoints.reduce((sum, point) => sum + point.y, 0) / depthPoints.length }}><i/><i/><i/><span>estimated depth contours</span></div>}
            {project.waypoints.map((point) => <button key={point.id} className={`waypoint ${selectedId === point.id ? "selected" : ""} ${point.label === "A0" ? "origin" : ""}${exportClass(exportSettings.pointMarkers)}${exportClass(!exportSettings.namedPointMarkersOnly || Boolean(point.name?.trim()))}${exportClass(pointInPrintArea(point, printArea))}`} style={{ ...waypointDisplayStyle, left: point.x, top: point.y }} onClick={(event) => { event.stopPropagation(); setSelectedId(point.id); setTool("select"); }} onPointerDown={(event) => startDrag(event, "waypoint", point.id)}><span className="point-dot"/><span className="point-label"><b className={exportClass(exportSettings.pointNames)}>{point.label}</b>{point.name && <small className={exportClass(exportSettings.fullPointNames)}>{point.name}</small>}{point.depth !== undefined && <em className={exportClass(exportSettings.depths)}>{formatNumber(point.depth)} {project.depthUnit}</em>}</span></button>)}
            <div className={`north-arrow map-furniture${exportClass(exportSettings.mapFurniture)}`}><b>N</b><span>↑</span></div><div className={`scale-bar map-furniture${exportClass(exportSettings.mapFurniture)}`}><i style={{ width: mapBar.pixels }}/><span>{formatNumber(mapBar.value)} {project.distanceUnit}</span></div><div className={`map-units map-furniture${exportClass(exportSettings.mapFurniture)}`}>distance: {UNIT_LABEL[project.distanceUnit]} · depth: {UNIT_LABEL[project.depthUnit]}</div>
          </div>
          {printArea && <div className={`print-crop-furniture${exportClass(exportSettings.mapFurniture)}`}><div className="north-arrow"><b>N</b><span>↑</span></div><div className="scale-bar"><i/><span>{formatNumber(mapBar.value)} {project.distanceUnit}</span></div><div className="map-units">distance: {UNIT_LABEL[project.distanceUnit]} · depth: {UNIT_LABEL[project.depthUnit]}</div></div>}
        </div>
        <footer className="map-footer"><div><b>{project.title}</b><span>{project.date}</span></div><p>{depthPoints.length >= 3 ? "Depth contours are estimated from entered measurements." : "Add 3 or more depths to display estimated contours."}</p><div className="waypoint-summary"><b>{project.waypoints.length}</b> waypoints · <b>{project.vectors.length}</b> vectors</div></footer>
        <section className="print-details"><h2>{project.title}</h2><p>{project.notes || "Dive-site sketch prepared with Soundings."}</p><p className="print-scale">Scale: {formatNumber(mapScale(project))} meters per map pixel · {formatNumber(mapBar.value)} {project.distanceUnit} scale bar</p><table className={exportClass(exportSettings.pointTable)}><thead><tr><th>Point</th><th>Name</th><th>Depth</th><th>Position</th></tr></thead><tbody>{printPoints.map((point) => <tr key={point.id}><td>{point.label}</td><td>{point.name || "—"}</td><td>{formatDepth(point, project.depthUnit)}</td><td>{Math.round(point.x)}, {Math.round(point.y)}</td></tr>)}</tbody></table></section>
      </section>
    </main>
  );
}
