"use client";

import { CSSProperties, ChangeEvent, Fragment, KeyboardEvent as ReactKeyboardEvent, PointerEvent, WheelEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { SoundingsIcon, type SoundingsIconName } from "./soundings-icons";
import { DEFAULT_POINT_SYMBOL_SCALE, MAX_POINT_SYMBOL_SCALE, MIN_POINT_SYMBOL_SCALE, POINT_SYMBOLS, normalizePointSymbol, normalizePointSymbolScale, pointSymbolDefinition, type PointSymbolId } from "./point-symbols";
import {
  createFieldCapturePackage,
  mergeFieldCapturePoints,
  parseFieldCapturePackage,
  previewFieldCaptureMerge,
  type CapturedPoint,
  type FieldCapturePackage,
  type FieldDraft,
} from "./field-capture";
import {
  POINT_ANNOTATION_KINDS,
  annotationPosition,
  normalizeLabelOffsets,
  type LabelOffset,
  type PointAnnotationKind,
  type PointLabelOffsets,
} from "./point-annotations";
import { layoutPrintCallouts, type PrintRect } from "./print-callouts";
import { buildRouteNetwork, type RoutePath } from "./route-network";
import {
  appendVectorToRoute,
  createRoute,
  joinRoutes,
  normalizeRoutes,
  reverseRoute,
  routeEndpointKind,
  routeEndpoints,
  routeForVector,
  routeLabelAnchor,
  routePointIds,
  routeStepPointIds,
  type RouteLabelAnchor,
  type SavedRoute,
} from "./route-model";

type Unit = "ft" | "m" | "mi";
type Point = { id: string; label: string; name?: string; symbol?: PointSymbolId; x: number; y: number; depth?: number; labelOffsets?: PointLabelOffsets; fieldDraft?: FieldDraft };
type Vector = { id: string; fromId: string; toId: string; bearing: number; distance: number; unit: Unit };
type CoastPoint = { id: string; x: number; y: number };
type PrintArea = { x: number; y: number; width: number; height: number };
type ReferenceImage = { dataUrl?: string; opacity: number; scale: number; x: number; y: number; visible: boolean; locked: boolean };
type Calibration = { vectorId?: string; distance?: number; unit?: Unit; metersPerPixel: number };
type NamePlacement = "smartCallouts" | "asPositioned";
type ExportSettings = { reference: boolean; shoreline: boolean; routes: boolean; routeLabels: boolean; routeNameLabels: boolean; pointMarkers: boolean; namedPointMarkersOnly: boolean; pointNames: boolean; fullPointNames: boolean; depths: boolean; contours: boolean; mapFurniture: boolean; pointTable: boolean; namePlacement?: NamePlacement };
type ExportToggleKey = Exclude<keyof ExportSettings, "namePlacement">;
type Project = {
  version: 1; id: string; title: string; date: string; notes: string; distanceUnit: Unit; depthUnit: Unit;
  coastline: CoastPoint[]; shoreLocked?: boolean; waypoints: Point[]; vectors: Vector[]; routes?: SavedRoute[]; reference: ReferenceImage; calibration?: Calibration; exportSettings?: ExportSettings; printArea?: PrintArea; pointSymbolScale?: number;
};
type ProjectSyncMessage =
  | { type: "project-update"; source: string; project: Project }
  | { type: "project-request"; source: string; projectId: string };
type Tool = "select" | "coast" | "origin" | "point" | "reference" | "printArea";
type ActivePanel = "projects" | "survey" | "settings" | "export" | null;
type SurveyTab = "routes" | "points";
type PointFilter = "all" | "named" | "unnamed";
type SegmentMode = "bearing" | "existing";
type CaptureImportReview = { packageValue: FieldCapturePackage; additions: CapturedPoint[]; conflicts: CapturedPoint[] };
type LayerVisibility = { shoreline: boolean; routes: boolean; routeLabels: boolean; pointNames: boolean; names: boolean; depths: boolean; contours: boolean; mapFurniture: boolean };
type PrintAreaHandle = "move" | "nw" | "ne" | "se" | "sw";
type Drag = { kind: "waypoint" | "annotation" | "coast" | "pan" | "reference" | "printAreaDraw" | "printAreaAdjust"; id?: string; annotationKind?: PointAnnotationKind; offset?: LabelOffset; initialOffset?: LabelOffset; hadOffset?: boolean; moved?: boolean; changed?: boolean; originX?: number; originY?: number; start: Project; x: number; y: number; point?: { x: number; y: number }; area?: PrintArea; handle?: PrintAreaHandle };

const DB_NAME = "dive-map-builder";
const STORE_NAME = "projects";
const CANVAS = { width: 1200, height: 800 };
const PRINT_FRAME = { width: 1000, height: 500 };
const PRINT_MAP_TEXT_SIZE = 10;
const PRINT_CALLOUT_RAIL_WIDTH = 136;
const PRINT_CALLOUT_RAIL_GAP = 12;
const PRINT_CALLOUT_INSET = 16;
const DEFAULT_METERS_PER_PIXEL = 0.5;
const METERS_PER_UNIT: Record<Unit, number> = { ft: 0.3048, m: 1, mi: 1609.344 };
const UNIT_LABEL: Record<Unit, string> = { ft: "feet", m: "meters", mi: "miles" };
const POINT_ANNOTATION_LABELS: Record<PointAnnotationKind, string> = { pointName: "Point Name", name: "Name", depth: "Depth" };
const DEFAULT_EXPORT_SETTINGS: ExportSettings = { reference: true, shoreline: true, routes: true, routeLabels: true, routeNameLabels: true, pointMarkers: true, namedPointMarkersOnly: false, pointNames: true, fullPointNames: true, depths: true, contours: true, mapFurniture: true, pointTable: true, namePlacement: "smartCallouts" };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const id = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const round = (value: number, precision = 2) => Math.round(value * 10 ** precision) / 10 ** precision;
const formatNumber = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const emptyProject = (title = "Untitled dive site"): Project => ({
  version: 1, id: id(), title, date: new Date().toISOString().slice(0, 10), notes: "", distanceUnit: "ft", depthUnit: "ft",
  coastline: [], shoreLocked: false, waypoints: [], vectors: [], routes: [], calibration: { metersPerPixel: DEFAULT_METERS_PER_PIXEL }, exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
  pointSymbolScale: DEFAULT_POINT_SYMBOL_SCALE,
  reference: { opacity: 0.48, scale: 1, x: 0, y: 0, visible: true, locked: false },
});

function bearingFor(dx: number, dy: number) { return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; }
function formatDepth(point: Point, unit: Unit) { return point.depth === undefined || point.depth === null ? "—" : `${formatNumber(point.depth)} ${unit}`; }
function eventualFieldDraftSummary(draft: FieldDraft | undefined, fallbackUnit: Unit) {
  if (!draft) return "Point metadata differs from the desktop copy.";
  const measurements = [draft.bearing !== undefined ? `${formatNumber(draft.bearing)}°` : "", draft.distance !== undefined ? `${formatNumber(draft.distance)} ${draft.unit ?? fallbackUnit}` : ""].filter(Boolean).join(" · ");
  return measurements || draft.note || "Point metadata differs from the desktop copy.";
}
function hasDescriptiveName(point: Point) { return Boolean(point.name?.trim()); }
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
function projectPrintSource(source: PrintRect, viewport: PrintRect) {
  const scale = Math.min(viewport.width / source.width, viewport.height / source.height);
  const renderedWidth = source.width * scale;
  const renderedHeight = source.height * scale;
  const originX = viewport.x + (viewport.width - renderedWidth) / 2;
  const originY = viewport.y + (viewport.height - renderedHeight) / 2;
  return {
    scale,
    originX,
    originY,
    canvasOffsetX: originX - viewport.x - source.x * scale,
    canvasOffsetY: originY - viewport.y - source.y * scale,
  };
}
function mapScale(project: Project) { return project.calibration?.metersPerPixel && project.calibration.metersPerPixel > 0 ? project.calibration.metersPerPixel : DEFAULT_METERS_PER_PIXEL; }
function geometry(project: Project, vector: Vector) {
  const start = project.waypoints.find((point) => point.id === vector.fromId);
  const end = project.waypoints.find((point) => point.id === vector.toId);
  if (!start || !end) return null;
  return { start, end, dx: end.x - start.x, dy: end.y - start.y, pixels: Math.hypot(end.x - start.x, end.y - start.y) };
}
function routePathData(path: RoutePath, pointById: ReadonlyMap<string, Point>) {
  const commands = path.pointIds.map((pointId, index) => {
    const point = pointById.get(pointId);
    return point ? `${index ? "L" : "M"}${point.x} ${point.y}` : "";
  }).filter(Boolean);
  if (commands.length < 2) return "";
  return `${commands.join(" ")}${path.closed ? " Z" : ""}`;
}
function directionChevronPath(line: NonNullable<ReturnType<typeof geometry>>, zoom: number) {
  if (line.pixels < 32 || line.pixels === 0) return "";
  const unitX = line.dx / line.pixels;
  const unitY = line.dy / line.pixels;
  const normalX = -unitY;
  const normalY = unitX;
  const centerX = line.start.x + line.dx * 0.65;
  const centerY = line.start.y + line.dy * 0.65;
  const tipDistance = 4 / zoom;
  const tailDistance = 5 / zoom;
  const halfWidth = 5 / zoom;
  const tipX = centerX + unitX * tipDistance;
  const tipY = centerY + unitY * tipDistance;
  const tailX = centerX - unitX * tailDistance;
  const tailY = centerY - unitY * tailDistance;
  return `M${tailX + normalX * halfWidth} ${tailY + normalY * halfWidth} L${tipX} ${tipY} L${tailX - normalX * halfWidth} ${tailY - normalY * halfWidth}`;
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
function normalizePointAnnotationOffsets(point: Point) {
  const normalized = normalizeLabelOffsets(point.labelOffsets);
  if (!normalized) { delete point.labelOffsets; return point; }
  // Anchors intentionally may cross the canvas edge so the canvas and PDF crop
  // clip displaced annotations naturally instead of changing saved geometry.
  point.labelOffsets = normalized;
  return point;
}
function normalizeProject(raw: Project): Project {
  const project = clone(raw);
  project.version = 1;
  const savedReference = project.reference ?? ({} as Partial<ReferenceImage>);
  project.reference = { dataUrl: savedReference.dataUrl, opacity: savedReference.opacity ?? 0.48, scale: savedReference.scale ?? 1, x: savedReference.x ?? 0, y: savedReference.y ?? 0, visible: savedReference.visible ?? true, locked: savedReference.locked ?? false };
  project.waypoints = (project.waypoints ?? []).map((point) => {
    return normalizePointAnnotationOffsets({ ...point, name: point.name ?? "", symbol: normalizePointSymbol(point.symbol) });
  });
  project.vectors = (project.vectors ?? []).map((vector) => ({ ...vector, unit: METERS_PER_UNIT[vector.unit] ? vector.unit : project.distanceUnit }));
  project.routes = normalizeRoutes(project.waypoints, project.vectors, project.routes, { createId: id });
  project.shoreLocked = project.shoreLocked ?? false;
  const savedExportSettings = project.exportSettings ?? DEFAULT_EXPORT_SETTINGS;
  const namePlacement: NamePlacement = savedExportSettings.namePlacement === "asPositioned" ? "asPositioned" : "smartCallouts";
  const routeNameLabels = savedExportSettings.routeNameLabels ?? savedExportSettings.routeLabels ?? DEFAULT_EXPORT_SETTINGS.routeNameLabels;
  project.exportSettings = { ...DEFAULT_EXPORT_SETTINGS, ...savedExportSettings, routeNameLabels, namePlacement };
  project.printArea = normalizePrintArea(project.printArea);
  project.calibration = { ...project.calibration, metersPerPixel: mapScale(project) };
  project.pointSymbolScale = normalizePointSymbolScale(project.pointSymbolScale);
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

function RailButton({ active, icon, label, onClick }: { active?: boolean; icon: SoundingsIconName; label: string; onClick: () => void }) {
  return <button className={`rail-button${active ? " active" : ""}`} aria-pressed={active} onClick={onClick}><SoundingsIcon name={icon}/><span>{label}</span></button>;
}

function DockButton({ active, disabled, icon, label, onClick }: { active?: boolean; disabled?: boolean; icon: SoundingsIconName; label: string; onClick: () => void }) {
  return <button className={`dock-button${active ? " active" : ""}`} aria-pressed={active} disabled={disabled} onClick={onClick}><SoundingsIcon name={icon}/><span>{label}</span></button>;
}

function PanelHeading({ icon, title, onClose }: { icon?: SoundingsIconName; title: string; onClose: () => void }) {
  return <header className="panel-heading"><div>{icon && <SoundingsIcon name={icon}/>}<h2>{title}</h2></div><button className="close-button" aria-label={`Close ${title}`} onClick={onClose}><SoundingsIcon name="close"/></button></header>;
}

function PointSymbolImage({ symbol, className = "" }: { symbol: PointSymbolId; className?: string }) {
  const definition = pointSymbolDefinition(symbol);
  // These local, user-supplied map symbols must print at their original fidelity.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={definition.asset} alt="" aria-hidden="true" draggable={false}/>;
}

function PointSymbolPicker({ point, onChange }: { point: Point; onChange: (symbol?: PointSymbolId) => void }) {
  return <fieldset className="point-symbol-picker">
    <legend>Marker</legend>
    <div className="point-symbol-options">
      <label className={!point.symbol ? "active" : ""} title="Circle">
        <input type="radio" name={`point-symbol-${point.id}`} value="" checked={!point.symbol} onChange={() => onChange()}/>
        <span className="point-symbol-circle-preview" aria-hidden="true"/><span>Circle</span>
      </label>
      {POINT_SYMBOLS.map((symbol) => <label className={point.symbol === symbol.id ? "active" : ""} title={symbol.label} key={symbol.id}>
        <input type="radio" name={`point-symbol-${point.id}`} value={symbol.id} checked={point.symbol === symbol.id} onChange={() => onChange(symbol.id)}/>
        <PointSymbolImage className="point-symbol-option-image" symbol={symbol.id}/><span>{symbol.label}</span>
      </label>)}
    </div>
  </fieldset>;
}

function RouteNameEditor({ route, fallback, onCommit }: { route: SavedRoute; fallback: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(route.name);
  const commit = () => {
    const next = draft.trim();
    if (next !== route.name) onCommit(next);
    if (draft !== next) setDraft(next);
  };
  return <label className="route-name-field">Route name
    <input
      value={draft}
      placeholder={fallback}
      aria-label={`Route name for ${route.name.trim() || fallback}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === "Escape") { event.preventDefault(); setDraft(route.name); event.currentTarget.blur(); }
      }}
    />
  </label>;
}

export default function ScubaMapMaker() {
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVectorId, setSelectedVectorId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.78);
  const [pan, setPan] = useState({ x: 22, y: 24 });
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const [vectorForm, setVectorForm] = useState({ bearing: "0", distance: "30", label: "", depth: "", routeId: "new", routeName: "" });
  const [connectRouteByPoint, setConnectRouteByPoint] = useState<Record<string, string>>({});
  const [calibrationForm, setCalibrationForm] = useState({ distance: "", unit: "ft" as Unit });
  const [notice, setNotice] = useState("Loading local map library…");
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [surveyTab, setSurveyTab] = useState<SurveyTab>("routes");
  const [pointFilter, setPointFilter] = useState<PointFilter>("all");
  const [pointSearch, setPointSearch] = useState("");
  const deferredPointSearch = useDeferredValue(pointSearch.trim().toLowerCase());
  const [segmentMode, setSegmentMode] = useState<SegmentMode>("bearing");
  const [segmentTargetId, setSegmentTargetId] = useState("");
  const [captureImportReview, setCaptureImportReview] = useState<CaptureImportReview | null>(null);
  const [captureConflictIds, setCaptureConflictIds] = useState<Set<string>>(() => new Set());
  const [layersOpen, setLayersOpen] = useState(false);
  const [saveState, setSaveState] = useState("Saved locally");
  const [visibleLayers, setVisibleLayers] = useState<LayerVisibility>({ shoreline: true, routes: true, routeLabels: true, pointNames: true, names: true, depths: true, contours: true, mapFurniture: true });
  const [pointTableProjectId] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("point-table") : null);
  const pointTableOnly = Boolean(pointTableProjectId);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const syncChannel = useRef<BroadcastChannel | null>(null);
  const pointTableWindow = useRef<Window | null>(null);
  const projectRef = useRef<Project | null>(null);
  const windowId = useRef(id());

  useEffect(() => {
    const requestedProjectId = new URLSearchParams(window.location.search).get("point-table");
    readProjects().then((stored) => {
      const ordered = stored.sort((a, b) => b.date.localeCompare(a.date));
      const first = ordered[0] ?? emptyProject("Beaver Lake dive map");
      const active = requestedProjectId ? ordered.find((item) => item.id === requestedProjectId) ?? first : first;
      projectRef.current = active;
      setProject(active); setProjects(ordered.length ? ordered : [first]); setReady(true);
      setNotice(ordered.length ? "Local projects restored with their map scale." : "New local project ready — place A0 to begin.");
      if (!ordered.length) void persistProject(first);
    }).catch(() => { const fresh = emptyProject("Beaver Lake dive map"); projectRef.current = fresh; setProject(fresh); setProjects([fresh]); setReady(true); setNotice("Working in this browser session."); });
  }, []);
  useEffect(() => {
    const receiveProject = (message: ProjectSyncMessage) => {
      if (message.type !== "project-update" || message.source === windowId.current) return;
      const incoming = normalizeProject(message.project);
      setProjects((items) => [incoming, ...items.filter((item) => item.id !== incoming.id)]);
      setProject((current) => {
        if (current?.id !== incoming.id && (!pointTableOnly || pointTableProjectId !== incoming.id)) return current;
        projectRef.current = incoming;
        return incoming;
      });
    };
    const receiveWindowSync = (event: globalThis.MessageEvent<ProjectSyncMessage>) => {
      if (event.origin !== window.location.origin || !event.data || event.data.source === windowId.current) return;
      if (event.data.type === "project-request") {
        if (pointTableOnly || !event.source) return;
        const target = event.source as Window;
        pointTableWindow.current = target;
        const current = projectRef.current;
        if (current?.id === event.data.projectId) target.postMessage({ type: "project-update", source: windowId.current, project: current } satisfies ProjectSyncMessage, window.location.origin);
        return;
      }
      if (!pointTableOnly && event.source) pointTableWindow.current = event.source as Window;
      receiveProject(event.data);
    };
    window.addEventListener("message", receiveWindowSync);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("soundings-project-sync");
      syncChannel.current = channel;
      channel.onmessage = (event: MessageEvent<ProjectSyncMessage>) => receiveProject(event.data);
    }
    return () => { window.removeEventListener("message", receiveWindowSync); syncChannel.current?.close(); syncChannel.current = null; };
  }, [pointTableOnly, pointTableProjectId]);
  useEffect(() => {
    if (!ready || !pointTableProjectId || !window.opener) return;
    window.opener.postMessage({ type: "project-request", source: windowId.current, projectId: pointTableProjectId } satisfies ProjectSyncMessage, window.location.origin);
  }, [pointTableProjectId, ready]);
  useEffect(() => {
    if (!ready || !project) return;
    const timer = window.setTimeout(() => {
      void persistProject(project).then(() => setSaveState("Saved locally")).catch(() => setSaveState("Browser session"));
      setProjects((all) => [project, ...all.filter((item) => item.id !== project.id)]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [project, ready]);
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => {
    const panWithArrowKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setActivePanel(null); setSelectedId(null); setSelectedVectorId(null); setSelectedRouteId(null); return; }
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
  const routes = project?.routes ?? [];
  const selectedRoute = routes.find((route) => route.id === selectedRouteId)
    ?? (selectedVector ? routeForVector(routes, selectedVector.id) : undefined)
    ?? null;
  const depthPoints = useMemo(() => (project?.waypoints.filter((point) => point.depth !== undefined) ?? []), [project]);
  const pointMap = useMemo(() => new Map(project?.waypoints.map((point) => [point.id, point]) ?? []), [project]);
  const visualRouteNetwork = useMemo(() => project ? buildRouteNetwork(project.waypoints, project.vectors) : { paths: [], branchPointIds: [] }, [project]);

  const update = (next: Project, record = true) => {
    if (!project) return;
    if (record) { setUndoStack((old) => [...old.slice(-29), clone(project)]); setRedoStack([]); }
    setSaveState("Saving…");
    projectRef.current = next;
    setProject(next);
    const message = { type: "project-update", source: windowId.current, project: next } satisfies ProjectSyncMessage;
    syncChannel.current?.postMessage(message);
    const directTarget = pointTableOnly ? window.opener : pointTableWindow.current;
    if (directTarget && !directTarget.closed) directTarget.postMessage(message, window.location.origin);
  };
  const mutate = (fn: (current: Project) => Project, record = true) => project && update(fn(clone(project)), record);
  const routeFallbackName = (route: SavedRoute) => `Unnamed route ${Math.max(1, routes.findIndex((item) => item.id === route.id) + 1)}`;
  const routeDisplayName = (route: SavedRoute) => route.name.trim() || routeFallbackName(route);
  const eligibleRoutesAtPoint = (pointId: string) => routes.filter((route) => {
    const endpoints = routeEndpoints(route, project?.vectors ?? []);
    return Boolean(endpoints && !endpoints.closed && endpoints.endId === pointId);
  });
  const focusRoute = (route: SavedRoute, openDrawer = true, vectorId?: string) => {
    setSelectedRouteId(route.id);
    const nextVectorId = vectorId && route.steps.some((step) => step.vectorId === vectorId) ? vectorId : route.steps[0]?.vectorId;
    setSelectedVectorId(nextVectorId ?? null);
    if (nextVectorId && project) {
      const vector = project.vectors.find((item) => item.id === nextVectorId);
      if (vector) setCalibrationForm({ distance: String(vector.distance), unit: vector.unit });
    }
    if (openDrawer) {
      const endpoints = routeEndpoints(route, project?.vectors ?? []);
      setSelectedId(endpoints?.endId ?? null);
      setSurveyTab("routes");
      setActivePanel("survey");
    }
  };
  const commitRouteName = (routeId: string, name: string) => {
    mutate((current) => {
      const route = (current.routes ?? []).find((item) => item.id === routeId);
      if (route) route.name = name.trim();
      return current;
    });
    setNotice(name.trim() ? `Route named “${name.trim()}”.` : "Route name cleared.");
  };
  const reverseSavedRoute = (routeId: string) => {
    mutate((current) => {
      const index = (current.routes ?? []).findIndex((route) => route.id === routeId);
      if (index >= 0) current.routes![index] = reverseRoute(current.routes![index]);
      return current;
    });
    setNotice("Route direction reversed. Its former start is now the active endpoint.");
  };
  const setPointSymbol = (pointId: string, symbol?: PointSymbolId) => {
    mutate((current) => {
      const point = current.waypoints.find((item) => item.id === pointId);
      if (!point) return current;
      if (symbol) point.symbol = symbol;
      else delete point.symbol;
      return current;
    });
    setNotice(symbol ? `${pointSymbolDefinition(symbol).label} marker selected.` : "Circle marker selected.");
  };
  const possibleNextPoints = (current: Project, fromId: string, vectorId?: string) => current.waypoints.filter((candidate) => {
    if (candidate.id === fromId) return false;
    return !current.vectors.some((vector) => vector.fromId === fromId && vector.toId === candidate.id && vector.id !== vectorId);
  });
  const undo = () => {
    if (!project || !undoStack.length) return;
    const previous = undoStack[undoStack.length - 1]; setUndoStack((items) => items.slice(0, -1)); setRedoStack((items) => [...items, clone(project)]); update(previous, false); setNotice("Undid last map edit.");
  };
  const redo = () => {
    if (!project || !redoStack.length) return;
    const next = redoStack[redoStack.length - 1]; setRedoStack((items) => items.slice(0, -1)); setUndoStack((items) => [...items, clone(project)]); update(next, false); setNotice("Restored map edit.");
  };
  const canvasPosition = (event: PointerEvent<HTMLElement>) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(CANVAS.width, (event.clientX - rect.left - pan.x) / zoom)), y: Math.max(0, Math.min(CANVAS.height, (event.clientY - rect.top - pan.y) / zoom)) };
  };
  const annotationOffsetFromElement = (element: HTMLElement, point: Point) => {
    const stageRect = stageRef.current!.getBoundingClientRect();
    const labelRect = element.getBoundingClientRect();
    const center = {
      x: (labelRect.left + labelRect.width / 2 - stageRect.left - pan.x) / zoom,
      y: (labelRect.top + labelRect.height / 2 - stageRect.top - pan.y) / zoom,
    };
    return { dx: center.x - point.x, dy: center.y - point.y };
  };
  const assignAnnotationOffset = (point: Point, kind: PointAnnotationKind, offset: LabelOffset) => {
    point.labelOffsets = { ...point.labelOffsets, [kind]: offset };
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
    if (activeDrag.kind === "annotation" && activeDrag.id && activeDrag.annotationKind && activeDrag.offset) {
      const movedPixels = Math.hypot(event.clientX - (activeDrag.originX ?? activeDrag.x), event.clientY - (activeDrag.originY ?? activeDrag.y));
      if (!activeDrag.moved && movedPixels < 3) return;
      activeDrag.moved = true;
      const point = project.waypoints.find((item) => item.id === activeDrag.id);
      if (!point) return;
      const nextOffset = {
        dx: activeDrag.offset.dx + (event.clientX - activeDrag.x) / zoom,
        dy: activeDrag.offset.dy + (event.clientY - activeDrag.y) / zoom,
      };
      if (nextOffset.dx === activeDrag.offset.dx && nextOffset.dy === activeDrag.offset.dy) { activeDrag.x = event.clientX; activeDrag.y = event.clientY; return; }
      activeDrag.changed = true;
      mutate((current) => {
        const item = current.waypoints.find((candidate) => candidate.id === activeDrag.id);
        if (item) assignAnnotationOffset(item, activeDrag.annotationKind!, nextOffset);
        return current;
      }, false);
      activeDrag.offset = nextOffset;
      activeDrag.x = event.clientX;
      activeDrag.y = event.clientY;
      return;
    }
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
    const activeDrag = drag.current;
    const original = activeDrag.start; const kind = activeDrag.kind; let changed = activeDrag.changed; drag.current = null;
    if (kind === "annotation" && changed && activeDrag.id && activeDrag.annotationKind && activeDrag.initialOffset) {
      const finalOffset = activeDrag.offset;
      if (finalOffset && finalOffset.dx === activeDrag.initialOffset.dx && finalOffset.dy === activeDrag.initialOffset.dy) {
        changed = false;
        if (!activeDrag.hadOffset) {
          mutate((current) => {
            const point = current.waypoints.find((item) => item.id === activeDrag.id);
            if (point?.labelOffsets) {
              delete point.labelOffsets[activeDrag.annotationKind!];
              if (!POINT_ANNOTATION_KINDS.some((annotationKind) => point.labelOffsets?.[annotationKind])) delete point.labelOffsets;
            }
            return current;
          }, false);
        }
      }
    }
    if (kind === "annotation" && !changed) return;
    if (kind !== "pan") { setUndoStack((items) => [...items.slice(-29), original]); setRedoStack([]); }
    if (kind === "printAreaDraw") { setTool("select"); setNotice("Print area set. Drag its center or corners to refine it, then print the selected area."); }
    if (kind === "annotation") setNotice("Label position saved. Use the point inspector to reset it.");
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
    event.stopPropagation(); if (!project || (kind === "coast" && project.shoreLocked)) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { kind, id: itemId, start: clone(project), x: event.clientX, y: event.clientY }; setSelectedId(kind === "waypoint" ? itemId : null); setSelectedVectorId(null); setSelectedRouteId(null); setActivePanel(null); setTool("select");
  };
  const startAnnotationDrag = (event: PointerEvent<HTMLButtonElement>, point: Point, annotationKind: PointAnnotationKind) => {
    event.preventDefault(); event.stopPropagation();
    if (!project) return;
    const offset = point.labelOffsets?.[annotationKind] ?? annotationOffsetFromElement(event.currentTarget, point);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind: "annotation", id: point.id, annotationKind, offset, initialOffset: { ...offset }, hadOffset: Boolean(point.labelOffsets?.[annotationKind]), moved: false, changed: false, originX: event.clientX, originY: event.clientY, start: clone(project), x: event.clientX, y: event.clientY };
    setSelectedId(point.id); setSelectedVectorId(null); setSelectedRouteId(null); setActivePanel(null); setTool("select");
  };
  const onAnnotationKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, point: Point, annotationKind: PointAnnotationKind) => {
    const direction: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    };
    const delta = direction[event.key];
    if (!delta) return;
    event.preventDefault(); event.stopPropagation();
    const step = (event.shiftKey ? 10 : 1) / zoom;
    const offset = point.labelOffsets?.[annotationKind] ?? annotationOffsetFromElement(event.currentTarget, point);
    const nextOffset = { dx: offset.dx + delta.x * step, dy: offset.dy + delta.y * step };
    if (nextOffset.dx === offset.dx && nextOffset.dy === offset.dy) return;
    mutate((current) => { const item = current.waypoints.find((candidate) => candidate.id === point.id); if (item) assignAnnotationOffset(item, annotationKind, nextOffset); return current; });
    setSelectedId(point.id); setSelectedVectorId(null); setSelectedRouteId(null); setActivePanel(null); setTool("select");
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
  const selectVector = (vector: Vector) => {
    setSelectedVectorId(vector.id);
    setSelectedId(null);
    const route = routeForVector(routes, vector.id);
    setSelectedRouteId(route?.id ?? null);
    setSurveyTab("routes");
    setActivePanel("survey");
    setCalibrationForm({ distance: String(vector.distance), unit: vector.unit });
    setNotice(route ? `${routeDisplayName(route)} selected. The clicked segment remains the calibration reference.` : "Route segment selected for calibration.");
  };
  const addVector = () => {
    if (!project || !selected) { setNotice("Select A0 or another waypoint first."); return; }
    const bearing = Number(vectorForm.bearing); const distance = Number(vectorForm.distance);
    if (!Number.isFinite(bearing) || !Number.isFinite(distance) || distance <= 0) { setNotice("Enter a valid bearing and positive distance."); return; }
    const pixels = (distance * METERS_PER_UNIT[project.distanceUnit]) / mapScale(project); const radians = ((bearing % 360) * Math.PI) / 180;
    const next = { id: id(), label: vectorForm.label.trim() || `P${project.waypoints.filter((point) => point.label.startsWith("P")).length + 1}`, name: "", x: Math.max(0, Math.min(CANVAS.width, selected.x + Math.sin(radians) * pixels)), y: Math.max(0, Math.min(CANVAS.height, selected.y - Math.cos(radians) * pixels)), depth: vectorForm.depth === "" ? undefined : Number(vectorForm.depth) };
    const vector: Vector = { id: id(), fromId: selected.id, toId: next.id, bearing: 0, distance: 0, unit: project.distanceUnit };
    const eligible = eligibleRoutesAtPoint(selected.id);
    const continuing = vectorForm.routeId === "new" ? undefined : eligible.find((route) => route.id === vectorForm.routeId);
    let routeId = continuing?.id ?? "";
    mutate((current) => {
      current.waypoints.push(next);
      current.vectors.push({ ...vector, unit: current.distanceUnit });
      current.routes ??= [];
      if (continuing) {
        const routeIndex = current.routes.findIndex((route) => route.id === continuing.id);
        const appended = routeIndex >= 0 ? appendVectorToRoute(current.routes[routeIndex], vector, current.vectors) : undefined;
        if (routeIndex >= 0 && appended) current.routes[routeIndex] = appended;
      } else {
        const created = createRoute(vector, { name: vectorForm.routeName, createId: () => id() });
        current.routes.push(created);
        routeId = created.id;
      }
      return synchronizeVectors(current);
    });
    setSelectedId(next.id);
    setSelectedVectorId(vector.id);
    setSelectedRouteId(routeId);
    setCalibrationForm({ distance: String(distance), unit: project.distanceUnit });
    setVectorForm({ bearing: "0", distance: "30", label: "", depth: "", routeId, routeName: "" });
    setNotice(`${continuing ? "Continued" : "Started"} ${continuing ? routeDisplayName(continuing) : vectorForm.routeName.trim() || "a new route"} at ${next.label}.`);
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
  const resetAnnotationOffsets = (pointId: string, annotationKind?: PointAnnotationKind) => {
    mutate((current) => {
      const point = current.waypoints.find((item) => item.id === pointId);
      if (!point?.labelOffsets) return current;
      if (!annotationKind) delete point.labelOffsets;
      else {
        delete point.labelOffsets[annotationKind];
        if (!POINT_ANNOTATION_KINDS.some((kind) => point.labelOffsets?.[kind])) delete point.labelOffsets;
      }
      return current;
    });
    setNotice(annotationKind ? `${POINT_ANNOTATION_LABELS[annotationKind]} returned to automatic placement.` : "All point labels returned to automatic placement.");
  };
  const connectPoints = (fromId: string, targetId: string) => {
    if (!project || !targetId || !possibleNextPoints(project, fromId).some((point) => point.id === targetId)) { setNotice("That connection duplicates an existing route."); return; }
    const vector: Vector = { id: id(), fromId, toId: targetId, bearing: 0, distance: 0, unit: project.distanceUnit };
    const eligible = eligibleRoutesAtPoint(fromId);
    const choice = connectRouteByPoint[fromId] ?? eligible[0]?.id ?? "new";
    let sourceRoute = choice === "new" ? undefined : eligible.find((route) => route.id === choice);
    const sourcePointIds = sourceRoute ? routePointIds(sourceRoute, project.vectors) : [];
    const sourceEndpoints = sourceRoute ? routeEndpoints(sourceRoute, project.vectors) : undefined;

    if (sourceRoute && sourceEndpoints?.startId === targetId) {
      if (!window.confirm(`Close ${routeDisplayName(sourceRoute)} back to its start?`)) return;
    } else if (sourceRoute && sourcePointIds.includes(targetId)) {
      // Returning to an interior point is a branch, not a continuation of the
      // ordered path. Keep the new segment in its own route.
      sourceRoute = undefined;
    }

    const targetRoute = sourceRoute ? routes.find((route) => {
      if (route.id === sourceRoute!.id) return false;
      const endpoints = routeEndpoints(route, project.vectors);
      return Boolean(endpoints && !endpoints.closed && routeEndpointKind(route, targetId, project.vectors));
    }) : undefined;
    let joined: SavedRoute | undefined;
    if (sourceRoute && targetRoute && window.confirm(`Join ${routeDisplayName(sourceRoute)} and ${routeDisplayName(targetRoute)}?\n\nChoose Cancel to keep them separate.`)) {
      const firstName = sourceRoute.name.trim();
      const secondName = targetRoute.name.trim();
      let finalName = firstName || secondName;
      if (firstName && secondName && firstName !== secondName) {
        finalName = window.prompt("Name the joined route", firstName)?.trim() ?? firstName;
      }
      joined = joinRoutes(sourceRoute, targetRoute, [...project.vectors, vector], { connectingVector: vector, name: finalName });
      if (!joined) { setNotice("Those routes could not be joined safely. No connection was added."); return; }
    }

    let routeId = joined?.id ?? sourceRoute?.id ?? "";
    mutate((current) => {
      current.vectors.push({ ...vector, unit: current.distanceUnit });
      current.routes ??= [];
      if (joined && sourceRoute && targetRoute) {
        const insertionIndex = Math.max(0, current.routes.findIndex((route) => route.id === sourceRoute!.id));
        current.routes = current.routes.filter((route) => route.id !== sourceRoute!.id && route.id !== targetRoute.id);
        current.routes.splice(Math.min(insertionIndex, current.routes.length), 0, joined);
      } else if (sourceRoute) {
        const routeIndex = current.routes.findIndex((route) => route.id === sourceRoute!.id);
        const appended = routeIndex >= 0 ? appendVectorToRoute(current.routes[routeIndex], vector, current.vectors) : undefined;
        if (routeIndex >= 0 && appended) current.routes[routeIndex] = appended;
      } else {
        const created = createRoute(vector, { createId: () => id() });
        current.routes.push(created);
        routeId = created.id;
      }
      return synchronizeVectors(current);
    });
    setSelectedRouteId(routeId);
    setSelectedVectorId(vector.id);
    setConnectRouteByPoint((current) => ({ ...current, [targetId]: routeId }));
    setNotice(joined ? `Routes joined as ${joined.name || routeDisplayName(joined)}.` : sourceRoute ? `Continued ${routeDisplayName(sourceRoute)}.` : "Started a new unnamed route.");
  };
  const deletePoint = (pointId: string) => {
    if (!project) return;
    const point = project.waypoints.find((item) => item.id === pointId);
    if (!point) return;
    if (point.label === "A0") { setNotice("A0 is the required root and cannot be removed. Start a new project to reset it."); return; }
    if (!window.confirm(`Delete ${point.label} and its attached routes?`)) return;
    mutate((current) => {
      current.waypoints = current.waypoints.filter((item) => item.id !== point.id);
      current.vectors = current.vectors.filter((vector) => vector.fromId !== point.id && vector.toId !== point.id);
      current.routes = normalizeRoutes(current.waypoints, current.vectors, current.routes, { createId: () => id() });
      return current;
    });
    setSelectedId((current) => current === point.id ? null : current);
    setNotice("Removed the point and its attached routes.");
  };
  const deleteSelected = () => { if (selected) deletePoint(selected.id); };
  const onReferenceUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !project) return;
    const reader = new FileReader(); reader.onload = () => mutate((current) => { current.reference.dataUrl = String(reader.result); current.reference.visible = true; return current; }); reader.readAsDataURL(file); event.target.value = "";
  };
  const changeDistanceUnit = (unit: Unit) => mutate((current) => { current.distanceUnit = unit; return synchronizeVectors(current); }, false);
  const setExportSetting = (setting: ExportToggleKey, value: boolean) => mutate((current) => { current.exportSettings = { ...DEFAULT_EXPORT_SETTINGS, ...current.exportSettings, [setting]: value }; return current; }, false);
  const setNamePlacement = (namePlacement: NamePlacement) => mutate((current) => { current.exportSettings = { ...DEFAULT_EXPORT_SETTINGS, ...current.exportSettings, namePlacement }; return current; }, false);
  const newProject = () => { const next = emptyProject("New dive site"); setProject(next); setProjects((items) => [next, ...items]); setSelectedId(null); setSelectedVectorId(null); setSelectedRouteId(null); setUndoStack([]); setRedoStack([]); void persistProject(next); setNotice("New project created locally."); };
  const duplicateProject = () => { if (!project) return; const next = clone(project); next.id = id(); next.title = `${project.title} copy`; setProject(next); setProjects((items) => [next, ...items]); void persistProject(next); setNotice("Project duplicated locally."); };
  const deleteProject = () => { if (!project || !window.confirm(`Delete “${project.title}” from this browser?`)) return; void removeProjectFromStore(project.id); const remaining = projects.filter((item) => item.id !== project.id); const next = remaining[0] ?? emptyProject("New dive site"); setProjects(remaining.length ? remaining : [next]); setProject(next); setSelectedId(null); setSelectedVectorId(null); setSelectedRouteId(null); if (!remaining.length) void persistProject(next); setNotice("Local project deleted."); };
  const exportBackup = () => { if (!project) return; const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "dive-map"}.json`; link.click(); URL.revokeObjectURL(link.href); setNotice("Editable project backup downloaded."); };
  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const raw = JSON.parse(String(reader.result)) as Project; if (raw.version !== 1 || !Array.isArray(raw.waypoints)) throw new Error("Unsupported backup"); const imported = normalizeProject(raw); imported.id = id(); imported.title = `${imported.title || "Imported dive site"} (imported)`; setProject(imported); setProjects((items) => [imported, ...items]); void persistProject(imported); setNotice("Project backup imported into this browser."); } catch { setNotice("That file is not a compatible dive-map backup."); } }; reader.readAsText(file); event.target.value = "";
  };
  const updateFieldDraft = (pointId: string, patch: Partial<FieldDraft>) => {
    mutate((current) => {
      const point = current.waypoints.find((item) => item.id === pointId);
      if (!point) return current;
      const next = { ...point.fieldDraft, ...patch, capturedAt: new Date().toISOString() } as FieldDraft;
      if (!next.fromPointId) delete next.fromPointId;
      if (!Number.isFinite(next.bearing)) delete next.bearing;
      if (!Number.isFinite(next.distance) || (next.distance ?? 0) <= 0) delete next.distance;
      if (!next.note?.trim()) delete next.note;
      point.fieldDraft = next.fromPointId || next.bearing !== undefined || next.distance !== undefined || next.note ? next : undefined;
      return current;
    }, false);
  };
  const exportFieldCapture = () => {
    if (!project) return;
    const packageValue = createFieldCapturePackage(project);
    const blob = new Blob([JSON.stringify(packageValue, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "dive-map"}-field-capture.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setNotice("Field capture package ready for desktop handoff.");
  };
  const importFieldCapture = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !project) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const packageValue = parseFieldCapturePackage(JSON.parse(String(reader.result)));
        const preview = previewFieldCaptureMerge(project.waypoints, packageValue.points);
        setCaptureConflictIds(new Set());
        setCaptureImportReview({ packageValue, ...preview });
      } catch {
        setNotice("That file is not a compatible Soundings field capture.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };
  const applyFieldCaptureMerge = () => {
    if (!captureImportReview) return;
    const incoming = captureImportReview.packageValue.points.map((point) => ({ ...point, symbol: normalizePointSymbol(point.symbol) } as Point));
    mutate((current) => {
      current.waypoints = mergeFieldCapturePoints(current.waypoints, incoming, captureConflictIds);
      current.routes = normalizeRoutes(current.waypoints, current.vectors, current.routes, { createId: id });
      return current;
    });
    setCaptureImportReview(null);
    setCaptureConflictIds(new Set());
    setNotice(`Merged ${captureImportReview.additions.length} new point${captureImportReview.additions.length === 1 ? "" : "s"}${captureConflictIds.size ? ` and ${captureConflictIds.size} selected field update${captureConflictIds.size === 1 ? "" : "s"}` : ""}. Route topology was unchanged.`);
  };
  const openPointTableWindow = () => {
    if (!project) return;
    const url = new URL(window.location.href);
    url.searchParams.set("point-table", project.id);
    const popup = window.open(url.toString(), "soundings-point-table", "popup=yes,width=1180,height=780,resizable=yes,scrollbars=yes");
    if (popup) { pointTableWindow.current = popup; popup.focus(); }
    else setNotice("Your browser blocked the point-table window. Allow pop-ups for this site and try again.");
  };

  if (!project) return <main className="soundings-app loading"><div className="loading-mark">⌁</div><p>Opening your dive-map workbench…</p></main>;

  const coast = project.coastline;
  const exportSettings = project.exportSettings ?? DEFAULT_EXPORT_SETTINGS;
  const namePlacement: NamePlacement = exportSettings.namePlacement === "asPositioned" ? "asPositioned" : "smartCallouts";
  const printArea = project.printArea;
  const printPoints = project.waypoints.filter((point) => pointInPrintArea(point, printArea));
  const printCropScale = printArea ? Math.min(PRINT_FRAME.width / printArea.width, PRINT_FRAME.height / printArea.height) : 0.72;
  const printSource: PrintRect = printArea ?? { x: 0, y: 0, width: CANVAS.width, height: CANVAS.height };
  const smartNamePoints = exportSettings.fullPointNames ? printPoints.filter(hasDescriptiveName) : [];
  const smartCalloutsRequested = namePlacement === "smartCallouts" && smartNamePoints.length > 0;
  const printFrame: PrintRect = { x: 0, y: 0, width: PRINT_FRAME.width, height: PRINT_FRAME.height };
  const rightRailViewport: PrintRect = {
    x: PRINT_CALLOUT_INSET,
    y: PRINT_CALLOUT_INSET,
    width: PRINT_FRAME.width - PRINT_CALLOUT_INSET * 2 - PRINT_CALLOUT_RAIL_WIDTH - PRINT_CALLOUT_RAIL_GAP,
    height: PRINT_FRAME.height - PRINT_CALLOUT_INSET * 2,
  };
  const dualRailViewport: PrintRect = {
    x: PRINT_CALLOUT_RAIL_WIDTH + PRINT_CALLOUT_RAIL_GAP,
    y: PRINT_CALLOUT_INSET,
    width: PRINT_FRAME.width - (PRINT_CALLOUT_RAIL_WIDTH + PRINT_CALLOUT_RAIL_GAP) * 2,
    height: PRINT_FRAME.height - PRINT_CALLOUT_INSET * 2,
  };
  const createSmartCalloutCandidate = (viewport: PrintRect) => {
    const projection = projectPrintSource(printSource, viewport);
    const points = smartNamePoints.map((point) => ({
      id: point.id,
      text: exportSettings.pointNames ? `${point.label} · ${point.name!.trim()}` : point.name!.trim(),
      x: projection.originX + (point.x - printSource.x) * projection.scale,
      y: projection.originY + (point.y - printSource.y) * projection.scale,
    }));
    const layout = layoutPrintCallouts({
      frame: printFrame,
      mapViewport: viewport,
      railWidth: PRINT_CALLOUT_RAIL_WIDTH,
      points,
      metrics: { railGap: PRINT_CALLOUT_RAIL_GAP, fontSize: PRINT_MAP_TEXT_SIZE },
    });
    return { viewport, projection, layout };
  };
  const rightRailCandidate = smartCalloutsRequested ? createSmartCalloutCandidate(rightRailViewport) : null;
  const smartCalloutCandidate = !rightRailCandidate
    ? null
    : rightRailCandidate.layout.mode === "right" && rightRailCandidate.layout.overflowIds.length === 0
      ? rightRailCandidate
      : createSmartCalloutCandidate(dualRailViewport);
  const smartCalloutsActive = Boolean(smartCalloutCandidate);
  const smartCalloutOverflowIds = smartCalloutCandidate?.layout.overflowIds ?? [];
  const smartCalloutPointIds = new Set(smartNamePoints.map((point) => point.id));
  const effectivePrintScale = smartCalloutCandidate?.projection.scale ?? printCropScale;
  const pointSymbolScale = normalizePointSymbolScale(project.pointSymbolScale);
  const smartCalloutSymbolSize = { width: 24 * pointSymbolScale, height: 18 * pointSymbolScale };
  const printMapDisplayStyle = {
    "--print-map-text-size": `${PRINT_MAP_TEXT_SIZE / effectivePrintScale}px`,
    "--print-map-label-gap": `${1 / effectivePrintScale}px`,
    "--print-map-label-padding-x": `${4 / effectivePrintScale}px`,
    "--print-map-label-padding-y": `${2 / effectivePrintScale}px`,
    "--print-map-label-border": `${1 / effectivePrintScale}px`,
    "--print-map-label-radius": `${3 / effectivePrintScale}px`,
    "--print-route-name-width": `${150 / effectivePrintScale}px`,
    "--print-annotation-stack-x": `${7 / effectivePrintScale}px`,
    "--print-annotation-padding-x": `${2 / effectivePrintScale}px`,
    "--print-annotation-padding-y": `${1 / effectivePrintScale}px`,
    "--print-annotation-radius": `${2 / effectivePrintScale}px`,
    "--print-point-marker-size": `${4 / effectivePrintScale}px`,
    "--print-point-symbol-size": `${24 * pointSymbolScale / effectivePrintScale}px`,
  } as CSSProperties;
  const printCropStyle = printArea ? {
    "--print-crop-scale": String(printCropScale),
    "--print-offset-x": `${(PRINT_FRAME.width - printArea.width * printCropScale) / 2 - printArea.x * printCropScale}px`,
    "--print-offset-y": `${(PRINT_FRAME.height - printArea.height * printCropScale) / 2 - printArea.y * printCropScale}px`,
    "--print-scale-bar": `${scaleBar(project).pixels * printCropScale}px`,
  } as CSSProperties : undefined;
  const smartPrintStyle = smartCalloutCandidate ? {
    "--smart-map-left": `${smartCalloutCandidate.viewport.x}px`,
    "--smart-map-top": `${smartCalloutCandidate.viewport.y}px`,
    "--smart-map-width": `${smartCalloutCandidate.viewport.width}px`,
    "--smart-map-height": `${smartCalloutCandidate.viewport.height}px`,
    "--smart-map-right": `${PRINT_FRAME.width - smartCalloutCandidate.viewport.x - smartCalloutCandidate.viewport.width}px`,
    "--smart-map-bottom": `${PRINT_FRAME.height - smartCalloutCandidate.viewport.y - smartCalloutCandidate.viewport.height}px`,
    "--smart-canvas-offset-x": `${smartCalloutCandidate.projection.canvasOffsetX}px`,
    "--smart-canvas-offset-y": `${smartCalloutCandidate.projection.canvasOffsetY}px`,
    "--smart-map-scale": String(smartCalloutCandidate.projection.scale),
    "--smart-scale-bar": `${scaleBar(project).pixels * smartCalloutCandidate.projection.scale}px`,
  } as CSSProperties : undefined;
  const printStageStyle = { ...printCropStyle, ...smartPrintStyle } as CSSProperties;
  const exportClass = (visible: boolean) => visible ? "" : " export-hidden";
  const annotationText = (point: Point, annotationKind: PointAnnotationKind) => {
    if (annotationKind === "pointName") return point.label;
    if (annotationKind === "name") return point.name?.trim() ?? "";
    return point.depth === undefined ? "" : `${formatNumber(point.depth)} ${project.depthUnit}`;
  };
  const annotationScreenVisible = (annotationKind: PointAnnotationKind) => annotationKind === "pointName" ? visibleLayers.pointNames : annotationKind === "name" ? visibleLayers.names : visibleLayers.depths;
  const annotationPrintVisible = (point: Point, annotationKind: PointAnnotationKind) => {
    const enabled = annotationKind === "pointName" ? exportSettings.pointNames : annotationKind === "name" ? exportSettings.fullPointNames : exportSettings.depths;
    if (!enabled || !pointInPrintArea(point, printArea)) return false;
    return !(smartCalloutsActive && smartCalloutPointIds.has(point.id) && (annotationKind === "pointName" || annotationKind === "name"));
  };
  const annotationVisibilityClass = (point: Point, annotationKind: PointAnnotationKind) => `${annotationScreenVisible(annotationKind) ? "" : " screen-hidden"}${exportClass(annotationPrintVisible(point, annotationKind))}`;
  const manualAnnotations = project.waypoints.flatMap((point) => POINT_ANNOTATION_KINDS.flatMap((annotationKind) => {
    const offset = point.labelOffsets?.[annotationKind];
    const text = annotationText(point, annotationKind);
    return offset && text ? [{ point, annotationKind, offset, text }] : [];
  }));
  const routeSymbolPoints = project.waypoints.filter((point) => hasDescriptiveName(point) && point.symbol);
  const renderAnnotationChip = (annotationKind: PointAnnotationKind, text: string) => <span className={`point-annotation-chip point-annotation-${annotationKind}${annotationKind === "name" && !visibleLayers.pointNames ? " screen-primary-name" : ""}${annotationKind === "name" && !exportSettings.pointNames ? " print-primary-name" : ""}`}>{text}</span>;
  const routeMembershipsForPoint = (pointId: string) => routes.flatMap((route) => {
    const pointIds = routePointIds(route, project.vectors);
    const pointIndex = pointIds.indexOf(pointId);
    return pointIndex >= 0 ? [{ route, pointIndex, pointCount: pointIds.length }] : [];
  });
  const filteredPoints = project.waypoints.filter((point) => {
    const named = hasDescriptiveName(point);
    if (pointFilter === "named" && !named) return false;
    if (pointFilter === "unnamed" && named) return false;
    if (!deferredPointSearch) return true;
    return `${point.label} ${point.name ?? ""}`.toLowerCase().includes(deferredPointSearch);
  });
  const selectedRoutePointIds = selectedRoute ? routePointIds(selectedRoute, project.vectors) : [];
  const selectedRouteEndpoints = selectedRoute ? routeEndpoints(selectedRoute, project.vectors) : undefined;
  const selectedRoutePath = selectedRoute && selectedRoutePointIds.length >= 2
    ? routePathData({ key: selectedRoute.id, pointIds: selectedRoutePointIds, closed: Boolean(selectedRouteEndpoints?.closed) }, pointMap)
    : "";
  const routeLabelAnchors = routes.flatMap((route) => {
    const screen = routeLabelAnchor(route, project.waypoints, project.vectors);
    const print = routeLabelAnchor(route, project.waypoints, project.vectors, printArea);
    return screen ? [{ route, screen, print }] : [];
  });
  const routeEditor = (openDrawerForSegment: boolean) => <div className="route-editor">
    <div className="survey-route-list" aria-label="Routes">
      {routes.map((route, index) => {
        const endpoints = routeEndpoints(route, project.vectors);
        const total = route.steps.reduce((sum, step) => sum + (project.vectors.find((vector) => vector.id === step.vectorId)?.distance ?? 0), 0);
        return <button className={selectedRoute?.id === route.id ? "active" : ""} key={route.id} onClick={() => focusRoute(route, openDrawerForSegment)}><span>{index + 1}</span><b>{routeDisplayName(route)}</b><small>{formatNumber(total)} {project.distanceUnit} · {route.steps.length} seg</small><em>{endpoints ? `${pointMap.get(endpoints.startId)?.label ?? "?"} → ${pointMap.get(endpoints.endId)?.label ?? "?"}` : "Incomplete"}</em></button>;
      })}
      {!routes.length && <div className="empty-route-list"><b>No routes yet</b><span>Select a point below, then add its first segment.</span></div>}
    </div>
    {selectedRoute ? <>
      <RouteNameEditor key={`${selectedRoute.id}:${selectedRoute.name}`} route={selectedRoute} fallback={routeFallbackName(selectedRoute)} onCommit={(name) => commitRouteName(selectedRoute.id, name)}/>
      <dl className="route-order-summary">
        <div><dt>Start</dt><dd>{selectedRouteEndpoints ? pointMap.get(selectedRouteEndpoints.startId)?.label ?? "Unknown" : "Unknown"}</dd></div>
        <div><dt>End</dt><dd>{selectedRouteEndpoints ? pointMap.get(selectedRouteEndpoints.endId)?.label ?? "Unknown" : "Unknown"}</dd></div>
        <div><dt>Segments</dt><dd>{selectedRoute.steps.length}</dd></div>
      </dl>
      <button className="secondary-button full-width route-reverse" disabled={selectedRouteEndpoints?.closed} onClick={() => reverseSavedRoute(selectedRoute.id)}><SoundingsIcon name="route"/>Reverse route</button>
      <ol className="route-step-list" aria-label={`Ordered steps for ${routeDisplayName(selectedRoute)}`}>
        {selectedRoute.steps.map((step, index) => {
          const vector = project.vectors.find((item) => item.id === step.vectorId);
          if (!vector) return null;
          const endpoints = routeStepPointIds(step, vector);
          const start = pointMap.get(endpoints.startId);
          const end = pointMap.get(endpoints.endId);
          return <li key={step.vectorId}><button className={selectedVectorId === step.vectorId ? "active" : ""} onClick={() => focusRoute(selectedRoute, openDrawerForSegment, step.vectorId)}><span>{index + 1}</span><b>{start?.label ?? "?"} → {end?.label ?? "?"}</b><small>{Math.round(vector.bearing)}° · {formatNumber(vector.distance)} {vector.unit}</small></button></li>;
        })}
      </ol>
    </> : <p className="drawer-copy">Select a segment on the map or choose a route to name and order it.</p>}
  </div>;
  const mapBar = scaleBar(project);
  const selectedRouteLine = selectedVector ? geometry(project, selectedVector) : null;
  const shorelinePath = coast.length > 1 ? `${coast.map((vertex, index) => `${index ? "L" : "M"}${vertex.x} ${vertex.y}`).join(" ")}${coast.length > 2 ? " Z" : ""}` : "";
  const shoreStrokeStyle = { "--shore-base-width": `${12 / zoom}px`, "--shore-edge-width": `${2 / zoom}px` } as CSSProperties;
  const routeHitHeight = 44 / zoom;
  const routeControlStyle = { "--route-hit-height": `${routeHitHeight}px`, "--route-hit-offset": `${-routeHitHeight / 2}px`, "--route-label-border": `${1 / zoom}px`, "--route-label-radius": `${3 / zoom}px`, "--route-label-font": `${11 / zoom}px`, "--route-label-padding-y": `${2 / zoom}px`, "--route-label-padding-x": `${4 / zoom}px`, "--route-name-font": `${12 / zoom}px`, "--route-name-width": `${154 / zoom}px`, "--route-name-padding-y": `${4 / zoom}px`, "--route-name-padding-x": `${7 / zoom}px` } as CSSProperties;
  const routeNameLabelStyle = (anchor: RouteLabelAnchor) => ({ ...routeControlStyle, left: anchor.x, top: anchor.y, "--route-name-angle": `${anchor.angleRadians}rad` }) as CSSProperties;
  const routeNetworkStyle = { "--route-width": `${2 / zoom}px`, "--route-selected-width": `${3 / zoom}px`, "--route-selected-path-width": `${5 / zoom}px`, "--route-chevron-width": `${2 / zoom}px`, "--route-branch-radius": `${1 / zoom}px`, "--route-symbol-cutout-radius": `${30 * pointSymbolScale / zoom}px`, "--print-route-width": `${2 / effectivePrintScale}px`, "--print-route-branch-radius": `${1 / effectivePrintScale}px`, "--print-route-symbol-cutout-radius": `${20 * pointSymbolScale / effectivePrintScale}px` } as CSSProperties;
  const selectedDirectionPath = selectedRouteLine ? directionChevronPath(selectedRouteLine, zoom) : "";
  const waypointDisplayStyle = { "--point-hit-size": `${44 / zoom}px`, "--point-dot-size": `${14 / zoom}px`, "--point-dot-border": `${2 / zoom}px`, "--point-ring": `${1 / zoom}px`, "--point-origin-ring": `${2 / zoom}px`, "--point-selected-ring": `${3 / zoom}px`, "--point-shadow": `${1 / zoom}px`, "--point-shadow-blur": `${4 / zoom}px`, "--point-symbol-size": `${38 * pointSymbolScale / zoom}px`, "--junction-size": `${10 / zoom}px`, "--junction-border": `${2 / zoom}px`, "--junction-halo": `${4 / zoom}px` } as CSSProperties;
  const printAreaDisplayStyle = { "--print-area-stroke": `${2 / zoom}px`, "--print-area-dash": `${8 / zoom}px`, "--print-area-dash-gap": `${6 / zoom}px`, "--print-area-label-top": `${-2 / zoom}px`, "--print-area-label-padding-y": `${4 / zoom}px`, "--print-area-label-padding-x": `${7 / zoom}px`, "--print-area-label-font": `${10 / zoom}px`, "--print-area-handle-size": `${14 / zoom}px`, "--print-area-handle-offset": `${-8 / zoom}px`, "--print-area-focus-width": `${2 / zoom}px`, "--print-area-focus-offset": `${2 / zoom}px` } as CSSProperties;
  const annotationDisplayStyle = { "--annotation-hit-width": `${44 / zoom}px`, "--annotation-hit-height": `${18 / zoom}px`, "--annotation-touch-hit": `${44 / zoom}px`, "--annotation-manual-hit": `${44 / zoom}px`, "--annotation-stack-x": `${28 / zoom}px`, "--annotation-padding-x": `${3 / zoom}px`, "--annotation-padding-y": `${1 / zoom}px`, "--annotation-radius": `${3 / zoom}px`, "--annotation-label-size": `${13 / zoom}px`, "--annotation-detail-size": `${10 / zoom}px`, "--annotation-focus-width": `${1.5 / zoom}px`, "--point-leader-width": `${1 / zoom}px`, "--print-point-leader-width": `${1 / effectivePrintScale}px` } as CSSProperties;
  const pointLedger = (
    <section className="point-ledger">
      <div className="point-ledger-heading">
        <div><h2>Point data table</h2><p>Bulk-edit point metadata. Route ordering and connections stay in the Survey workspace.</p></div>
        {!pointTableOnly && <button className="secondary-button" onClick={openPointTableWindow}><SoundingsIcon name="duplicate"/>Open in new window</button>}
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Point Name</th><th>Name</th><th>Symbol</th><th>Current depth</th><th>Route membership</th></tr></thead>
          <tbody>{project.waypoints.map((point) => {
            const memberships = routeMembershipsForPoint(point.id);
            return <tr key={point.id}>
              <td><div className="point-name-cell"><input aria-label={`${point.label} Point Name`} value={point.label} disabled={point.label === "A0"} onChange={(event) => updatePointLabel(point.id, event.target.value)}/><button className="delete-point" aria-label={`Delete ${point.label}`} disabled={point.label === "A0"} title={point.label === "A0" ? "A0 is required" : `Delete ${point.label}`} onClick={() => deletePoint(point.id)}><SoundingsIcon name="trash"/></button></div></td>
              <td><input aria-label={`${point.label} Name`} value={point.name ?? ""} onChange={(event) => mutate((current) => { const item = current.waypoints.find((entry) => entry.id === point.id); if (item) item.name = event.target.value; return current; }, false)}/></td>
              <td><div className="point-symbol-cell">{point.symbol ? <PointSymbolImage className="point-symbol-table-preview" symbol={point.symbol}/> : <span className="point-symbol-circle-preview" aria-hidden="true"/>}<select aria-label={`${point.label} symbol`} value={point.symbol ?? ""} onChange={(event) => setPointSymbol(point.id, normalizePointSymbol(event.target.value))}><option value="">Circle</option>{POINT_SYMBOLS.map((symbol) => <option value={symbol.id} key={symbol.id}>{symbol.label}</option>)}</select></div></td>
              <td><input aria-label={`${point.label} current depth`} inputMode="decimal" placeholder={project.depthUnit} value={point.depth ?? ""} onChange={(event) => mutate((current) => { const item = current.waypoints.find((entry) => entry.id === point.id); if (item) item.depth = event.target.value === "" ? undefined : Number(event.target.value); return current; }, false)}/></td>
              <td><div className="point-route-memberships">{memberships.length ? memberships.map(({ route, pointIndex, pointCount }) => <button key={route.id} className="route-table-link" onClick={() => focusRoute(route)}><b>{routeDisplayName(route)}</b><span>{pointIndex === 0 ? "Start" : pointIndex === pointCount - 1 ? "End" : `Point ${pointIndex + 1}`}</span></button>) : <span className="empty-cell">Not assigned</span>}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );

  if (pointTableOnly) return (
    <main className="soundings-app point-table-window">
      <header><div className="table-window-brand"><span className="wave-mark"><i/><i/><i/></span><div><strong>Soundings</strong><span>Point table · {project.title}</span></div></div><button className="secondary-button" onClick={() => window.close()}><SoundingsIcon name="close"/>Close window</button></header>
      {pointLedger}
    </main>
  );

  const selectedConnection = selected ? project.vectors.find((vector) => vector.toId === selected.id) ?? project.vectors.find((vector) => vector.fromId === selected.id) : null;
  const selectedConnectionStart = selectedConnection ? pointMap.get(selectedConnection.fromId) : null;
  const selectedOffsetKinds = selected ? POINT_ANNOTATION_KINDS.filter((annotationKind) => selected.labelOffsets?.[annotationKind]) : [];
  const togglePanel = (panel: Exclude<ActivePanel, null>) => setActivePanel((current) => current === panel ? null : panel);
  const selectProject = (projectId: string) => {
    const next = projects.find((item) => item.id === projectId);
    if (!next) return;
    setProject(next); setSelectedId(null); setSelectedVectorId(null); setSelectedRouteId(null); setUndoStack([]); setRedoStack([]); setActivePanel(null);
  };
  const pointInspector = selected ? <section className="survey-point-inspector" aria-label={`Point details for ${selected.label}`}>
    <div className="survey-section-heading"><div><span>Selected point</span><h3>{selected.label}{selected.name?.trim() ? ` · ${selected.name.trim()}` : ""}</h3></div><button className="close-button" aria-label={`Close ${selected.label} details`} onClick={() => setSelectedId(null)}><SoundingsIcon name="close"/></button></div>
    <div className="survey-point-fields">
      <label>Point Name<input value={selected.label} disabled={selected.label === "A0"} onChange={(event) => updatePointLabel(selected.id, event.target.value)}/></label>
      <label>Name<input value={selected.name ?? ""} placeholder="Add a descriptive name" onChange={(event) => mutate((current) => { const point = current.waypoints.find((item) => item.id === selected.id); if (point) point.name = event.target.value; return current; }, false)}/></label>
      <label>Depth<input value={selected.depth ?? ""} placeholder={project.depthUnit} inputMode="decimal" onChange={(event) => mutate((current) => { const point = current.waypoints.find((item) => item.id === selected.id); if (point) point.depth = event.target.value === "" ? undefined : Number(event.target.value); return current; }, false)}/></label>
    </div>
    <PointSymbolPicker point={selected} onChange={(symbol) => setPointSymbol(selected.id, symbol)}/>
    {routeMembershipsForPoint(selected.id).length > 0 && <div className="point-membership-list"><span>Routes using this point</span>{routeMembershipsForPoint(selected.id).map(({ route, pointIndex, pointCount }) => <button key={route.id} onClick={() => focusRoute(route)}><b>{routeDisplayName(route)}</b><small>{pointIndex === 0 ? "Start" : pointIndex === pointCount - 1 ? "End" : `Point ${pointIndex + 1}`}</small></button>)}</div>}
    <details className="field-capture-section" open={Boolean(selected.fieldDraft)}><summary>Field draft</summary><p>Optional measurements are saved for desktop route assignment; they do not change route topology.</p><div className="field-grid"><label>From point<select value={selected.fieldDraft?.fromPointId ?? ""} onChange={(event) => updateFieldDraft(selected.id, { fromPointId: event.target.value || undefined })}><option value="">Not specified</option>{project.waypoints.filter((point) => point.id !== selected.id).map((point) => <option value={point.id} key={point.id}>{point.label}{point.name ? ` · ${point.name}` : ""}</option>)}</select></label><label>Bearing °<input inputMode="decimal" value={selected.fieldDraft?.bearing ?? ""} onChange={(event) => updateFieldDraft(selected.id, { bearing: event.target.value === "" ? undefined : Number(event.target.value) })}/></label><label>Distance<input inputMode="decimal" value={selected.fieldDraft?.distance ?? ""} onChange={(event) => updateFieldDraft(selected.id, { distance: event.target.value === "" ? undefined : Number(event.target.value) })}/></label><label>Unit<select value={selected.fieldDraft?.unit ?? project.distanceUnit} onChange={(event) => updateFieldDraft(selected.id, { unit: event.target.value as Unit })}>{Object.entries(UNIT_LABEL).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label></div><label>Field note<textarea value={selected.fieldDraft?.note ?? ""} placeholder="Current, visibility, landmark, or measurement note" onChange={(event) => updateFieldDraft(selected.id, { note: event.target.value })}/></label></details>
    {selectedOffsetKinds.length > 0 && <section className="annotation-reset-section" aria-label="Label positions"><div className="annotation-reset-heading"><span>Label positions</span>{selectedOffsetKinds.length > 1 && <button type="button" aria-label={`Reset all label positions for ${selected.label}`} onClick={() => resetAnnotationOffsets(selected.id)}>Reset all</button>}</div><div className="annotation-reset-list">{selectedOffsetKinds.map((annotationKind) => <div key={annotationKind}><span>{POINT_ANNOTATION_LABELS[annotationKind]}</span><button type="button" aria-label={`Reset ${POINT_ANNOTATION_LABELS[annotationKind]} position for ${selected.label}`} onClick={() => resetAnnotationOffsets(selected.id, annotationKind)}>Reset</button></div>)}</div></section>}
    {selectedConnection && <dl className="route-summary"><div><dt>From</dt><dd>{selectedConnectionStart?.label ?? selected.label}</dd></div><div><dt>Bearing</dt><dd>{Math.round(selectedConnection.bearing).toString().padStart(3, "0")}°</dd></div><div><dt>Distance</dt><dd>{formatNumber(selectedConnection.distance)} {selectedConnection.unit}</dd></div></dl>}
    <div className="survey-point-actions"><button className="secondary-button" onClick={() => { setSurveyTab("routes"); setVectorForm((form) => ({ ...form, routeId: eligibleRoutesAtPoint(selected.id)[0]?.id ?? "new" })); }}><SoundingsIcon name="route"/>Build route from {selected.label}</button><button className="danger-button" disabled={selected.label === "A0"} onClick={deleteSelected}><SoundingsIcon name="trash"/>Delete point</button></div>
  </section> : null;

  const routeComposer = selected ? <section className="segment-composer">
    <div className="survey-section-heading"><div><span>Next segment</span><h3>Add from {selected.label}</h3></div><small>{formatDepth(selected, project.depthUnit)}</small></div>
    <label>Route assignment<select value={eligibleRoutesAtPoint(selected.id).some((route) => route.id === vectorForm.routeId) ? vectorForm.routeId : "new"} onChange={(event) => { const routeId = event.target.value; setVectorForm({ ...vectorForm, routeId }); const route = routes.find((item) => item.id === routeId); if (route) setSelectedRouteId(route.id); }}><option value="new">Start new route</option>{eligibleRoutesAtPoint(selected.id).map((route) => <option value={route.id} key={route.id}>Continue {routeDisplayName(route)}</option>)}</select></label>
    {(vectorForm.routeId === "new" || !eligibleRoutesAtPoint(selected.id).some((route) => route.id === vectorForm.routeId)) && <label>New route name (optional)<input value={vectorForm.routeName} placeholder="Unnamed route" onChange={(event) => setVectorForm({ ...vectorForm, routeName: event.target.value })}/></label>}
    <div className="segment-mode" role="tablist" aria-label="Segment destination"><button role="tab" aria-selected={segmentMode === "bearing"} className={segmentMode === "bearing" ? "active" : ""} onClick={() => setSegmentMode("bearing")}>Bearing & distance</button><button role="tab" aria-selected={segmentMode === "existing"} className={segmentMode === "existing" ? "active" : ""} onClick={() => setSegmentMode("existing")}>Existing point</button></div>
    {segmentMode === "bearing" ? <><div className="field-grid"><label>Bearing °<input inputMode="decimal" value={vectorForm.bearing} onChange={(event) => setVectorForm({ ...vectorForm, bearing: event.target.value })}/></label><label>Distance<input inputMode="decimal" value={vectorForm.distance} onChange={(event) => setVectorForm({ ...vectorForm, distance: event.target.value })}/></label><label>New Point Name<input placeholder="P1" value={vectorForm.label} onChange={(event) => setVectorForm({ ...vectorForm, label: event.target.value })}/></label><label>Depth<input placeholder={project.depthUnit} inputMode="decimal" value={vectorForm.depth} onChange={(event) => setVectorForm({ ...vectorForm, depth: event.target.value })}/></label></div><button className="primary-button" onClick={addVector}>Add next segment from {selected.label}</button></> : <><label>Connect to<select value={segmentTargetId} onChange={(event) => setSegmentTargetId(event.target.value)}><option value="">Choose an existing point</option>{possibleNextPoints(project, selected.id).map((point) => <option value={point.id} key={point.id}>{point.label}{point.name ? ` · ${point.name}` : ""}</option>)}</select></label><button className="primary-button" disabled={!segmentTargetId} onClick={() => { connectPoints(selected.id, segmentTargetId); setSegmentTargetId(""); }}>Connect {selected.label} to point</button></>}
  </section> : <div className="empty-panel"><SoundingsIcon name="route"/><h3>Select a starting point</h3><p>Choose a point on the map or in the Points tab to start or continue a route.</p></div>;

  return (
    <main className="soundings-app app-shell">
      <nav className="app-rail print-hidden" aria-label="Soundings navigation">
        <div className="rail-brand" aria-label="Soundings"><span className="wave-mark"><i/><i/><i/></span></div>
        <div className="rail-main">
          <RailButton icon="folder" label="Projects" active={activePanel === "projects"} onClick={() => togglePanel("projects")}/>
          <RailButton icon="route" label="Survey" active={activePanel === "survey"} onClick={() => { setTool("select"); togglePanel("survey"); }}/>
        </div>
        <RailButton icon="settings" label="Settings" active={activePanel === "settings"} onClick={() => togglePanel("settings")}/>
      </nav>

      <section className="workspace">
        <header className="topbar print-hidden">
          <div className="topbar-identity"><strong>Soundings</strong><span className="topbar-divider"/><label className="project-switcher"><span className="sr-only">Open local project</span><select aria-label="Open local project" value={project.id} onChange={(event) => selectProject(event.target.value)}>{projects.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select><SoundingsIcon name="chevron"/></label></div>
          <div className="save-state"><span className="saved-check">✓</span>{saveState}</div>
          <div className="top-actions"><button onClick={undo} disabled={!undoStack.length}><SoundingsIcon name="undo"/>Undo</button><button onClick={redo} disabled={!redoStack.length}><SoundingsIcon name="redo"/>Redo</button><button className="export-button" onClick={() => setActivePanel("export")}><SoundingsIcon name="export"/>Export</button></div>
        </header>

        <div className={`map-stage ${tool === "select" ? "pan-ready" : ""}${printArea ? " has-print-area" : ""}${smartCalloutsActive ? " smart-callout-mode" : ""}${smartCalloutOverflowIds.length ? " smart-callout-overflow" : ""}`} style={printStageStyle} ref={stageRef} tabIndex={0} aria-label="Map navigation surface. Drag blank map space to pan; scroll to zoom; use arrow keys to move around." onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={onStagePointerUp} onPointerCancel={onStagePointerUp} onWheel={onStageWheel}>
          <div className="print-map-viewport">
            <div className="map-canvas" onPointerDown={onStagePointerDown} style={{ ...printMapDisplayStyle, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <div className="water-label">BEAVER LAKE · DIVE SITE CHART</div>
            {printArea && <div className="print-area-overlay print-hidden" style={{ ...printAreaDisplayStyle, left: printArea.x, top: printArea.y, width: printArea.width, height: printArea.height }}><button className="print-area-move" aria-label="Move PDF print area" onPointerDown={(event) => startPrintAreaAdjust(event, "move")}>PDF print area</button>{(["nw", "ne", "se", "sw"] as PrintAreaHandle[]).map((handle) => <button key={handle} className={`print-area-handle ${handle}`} aria-label={`Resize PDF print area from ${handle}`} onPointerDown={(event) => startPrintAreaAdjust(event, handle)}/>)}</div>}
            {project.reference.dataUrl && <>
              {/* User-supplied data URLs must remain local and cannot use an image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={`reference-image${project.reference.visible ? "" : " screen-hidden"}${exportClass(exportSettings.reference)}`} src={project.reference.dataUrl} alt="Uploaded trace reference" style={{ opacity: project.reference.opacity, transform: `translate(${project.reference.x}px, ${project.reference.y}px) scale(${project.reference.scale})` }} draggable={false}/>
            </>}
            {shorelinePath && <svg className={`shoreline-path${visibleLayers.shoreline ? "" : " screen-hidden"}${exportClass(exportSettings.shoreline)}`} style={shoreStrokeStyle} viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} aria-hidden="true"><path className="shoreline-base" d={shorelinePath}/><path className="shoreline-edge" d={shorelinePath}/></svg>}
            {!project.shoreLocked && visibleLayers.shoreline && coast.map((vertex) => <button key={vertex.id} aria-label="Move shoreline vertex" className="coast-vertex" style={{ left: vertex.x, top: vertex.y }} onPointerDown={(event) => startDrag(event, "coast", vertex.id)} />)}
            {visualRouteNetwork.paths.length > 0 && <svg className={`route-network${visibleLayers.routes ? "" : " screen-hidden"}${exportClass(exportSettings.routes)}`} style={routeNetworkStyle} viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} shapeRendering="geometricPrecision" aria-hidden="true">
              <defs>
                <mask id="route-symbol-clearance-mask" className="route-symbol-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width={CANVAS.width} height={CANVAS.height}>
                  <rect x="0" y="0" width={CANVAS.width} height={CANVAS.height} fill="white"/>
                  {routeSymbolPoints.map((point) => <circle className={`route-symbol-cutout${exportClass(exportSettings.pointMarkers && pointInPrintArea(point, printArea))}`} data-route-symbol-cutout={point.id} key={point.id} cx={point.x} cy={point.y} fill="black"/>)}
                </mask>
              </defs>
              <g className="route-network-ink" mask="url(#route-symbol-clearance-mask)">
                <g className="route-network-base">
                  {visualRouteNetwork.paths.map((path) => <path className="route-network-path" key={path.key} d={routePathData(path, pointMap)}/>)}
                  {visualRouteNetwork.branchPointIds.map((pointId) => { const point = pointMap.get(pointId); return point ? <circle className="route-network-branch" data-route-branch={pointId} key={pointId} cx={point.x} cy={point.y}/> : null; })}
                </g>
                {(selectedRoutePath || selectedRouteLine) && <g className="route-network-selection print-hidden">
                  {selectedRoutePath && <path className="route-selection-path" d={selectedRoutePath}/>}
                  {selectedRouteLine && selectedRouteLine.pixels > 0 && <line className="route-selection-line" x1={selectedRouteLine.start.x} y1={selectedRouteLine.start.y} x2={selectedRouteLine.end.x} y2={selectedRouteLine.end.y}/>}
                  {selectedDirectionPath && <path className="route-direction" d={selectedDirectionPath}/>}
                </g>}
              </g>
            </svg>}
            {project.vectors.map((vector) => {
              const line = geometry(project, vector); if (!line) return null;
              const selectedSegment = selectedVectorId === vector.id;
              return <div className="vector-group" key={vector.id}>
                <button className={`vector-line${selectedSegment ? " selected-vector" : ""}${visibleLayers.routes ? "" : " screen-hidden"}${exportClass(exportSettings.routes)}`} aria-label={`Select route segment from ${line.start.label} to ${line.end.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectVector(vector); }} style={{ ...routeControlStyle, left: line.start.x, top: line.start.y, width: line.pixels, transform: `rotate(${Math.atan2(line.dy, line.dx)}rad)` }}/>
                <button className={`vector-label${visibleLayers.routeLabels ? "" : " screen-hidden"}${exportClass(exportSettings.routeLabels)}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectVector(vector); }} style={{ ...routeControlStyle, left: line.start.x + line.dx / 2, top: line.start.y + line.dy / 2 }}><span>{Math.round(vector.bearing)}°</span><span>{formatNumber(vector.distance)} {vector.unit}</span></button>
              </div>;
            })}
            {routeLabelAnchors.map(({ route, screen, print }) => <Fragment key={`route-name-${route.id}`}>
              <button
                className={`route-name-label print-hidden${visibleLayers.routeLabels ? "" : " screen-hidden"}`}
                style={routeNameLabelStyle(screen)}
                title={route.name}
                aria-label={`Route ${route.name}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); focusRoute(route); }}
              ><span>{route.name}</span></button>
              {print && <span className={`route-name-label route-name-label-print screen-hidden${exportClass(exportSettings.routeNameLabels)}`} style={routeNameLabelStyle(print)} aria-label={`Route ${route.name}`}><span>{route.name}</span></span>}
            </Fragment>)}
            {depthPoints.length >= 3 && <div className={`contours${visibleLayers.contours ? "" : " screen-hidden"}${exportClass(exportSettings.contours)}`} style={{ left: depthPoints.reduce((sum, point) => sum + point.x, 0) / depthPoints.length, top: depthPoints.reduce((sum, point) => sum + point.y, 0) / depthPoints.length }}><i/><i/><i/><span>estimated depth contours</span></div>}
            {manualAnnotations.length > 0 && <svg className="point-leaders" style={annotationDisplayStyle} viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} shapeRendering="geometricPrecision" aria-hidden="true">
              {manualAnnotations.map(({ point, annotationKind, offset }) => {
                const screenEnd = annotationPosition(point, offset);
                const printEnd = annotationPosition(point, offset);
                const screenDistance = Math.hypot(offset.dx, offset.dy) * zoom;
                return <Fragment key={`${point.id}-${annotationKind}`}>
                  {screenDistance >= 8 && <line className={`point-leader point-leader-${annotationKind} point-leader-screen print-hidden${annotationScreenVisible(annotationKind) ? "" : " screen-hidden"}`} x1={point.x} y1={point.y} x2={screenEnd.x} y2={screenEnd.y}/>}
                  {screenDistance >= 6 && <line
                    className={`point-leader point-leader-${annotationKind} point-leader-print screen-hidden${exportClass(annotationPrintVisible(point, annotationKind))}`}
                    x1={point.x}
                    y1={point.y}
                    x2={printEnd.x}
                    y2={printEnd.y}
                  />}
                </Fragment>;
              })}
            </svg>}
            {project.waypoints.map((point) => {
              const named = hasDescriptiveName(point);
              const displayName = point.name?.trim() ?? "";
              return <button key={point.id} aria-label={named ? `Edit ${point.label} — ${displayName}` : `Edit ${point.label} connection point`} className={`waypoint ${named ? "named-point" : "junction-point"}${named && point.symbol ? " has-symbol" : ""}${selectedId === point.id ? " selected" : ""}${point.label === "A0" ? " origin" : ""}${exportClass(pointInPrintArea(point, printArea))}`} style={{ ...waypointDisplayStyle, left: point.x, top: point.y }} onClick={(event) => { event.stopPropagation(); setSelectedId(point.id); setSelectedVectorId(null); setSelectedRouteId(null); setSurveyTab("points"); setActivePanel("survey"); setTool("select"); }} onPointerDown={(event) => startDrag(event, "waypoint", point.id)}>
                {named && (point.symbol ? <PointSymbolImage className={`point-symbol-marker${exportClass(exportSettings.pointMarkers)}`} symbol={point.symbol}/> : <span className={`point-dot${exportClass(exportSettings.pointMarkers)}`}/>)} {!named && <span className="junction-handle" aria-hidden="true"/>}
              </button>;
            })}
            {project.waypoints.map((point) => {
              const contentKinds = POINT_ANNOTATION_KINDS.filter((annotationKind) => annotationText(point, annotationKind));
              const automaticKinds = contentKinds.filter((annotationKind) => !point.labelOffsets?.[annotationKind]);
              const screenAutomaticKinds = automaticKinds.filter(annotationScreenVisible);
              const printAutomaticKinds = automaticKinds.filter((annotationKind) => annotationPrintVisible(point, annotationKind));
              return <Fragment key={`annotations-${point.id}`}>
                {contentKinds.map((annotationKind) => {
                  const offset = point.labelOffsets?.[annotationKind];
                  const position = offset ? annotationPosition(point, offset) : point;
                  const printPosition = offset ? annotationPosition(point, offset) : point;
                  const text = annotationText(point, annotationKind);
                  const automaticStyle = offset ? {} : {
                    "--annotation-auto-y": `${(-5 + Math.max(0, screenAutomaticKinds.indexOf(annotationKind)) * 17) / zoom}px`,
                    "--annotation-touch-y": `${((Math.max(0, screenAutomaticKinds.indexOf(annotationKind)) - (screenAutomaticKinds.length - 1) / 2) * 44 - 22) / zoom}px`,
                    "--annotation-print-y": `${(-4 + Math.max(0, printAutomaticKinds.indexOf(annotationKind)) * 12) / effectivePrintScale}px`,
                  } as CSSProperties;
                  const manualPrintStyle = offset ? {
                    "--annotation-print-left": `${printPosition.x}px`,
                    "--annotation-print-top": `${printPosition.y}px`,
                  } as CSSProperties : {};
                  return <button type="button" data-point-id={point.id} data-annotation-kind={annotationKind} data-manual-position={offset ? "true" : "false"} key={annotationKind} className={`point-annotation ${offset ? "point-annotation-manual" : "point-annotation-auto"}${annotationVisibilityClass(point, annotationKind)}`} style={{ ...annotationDisplayStyle, ...automaticStyle, ...manualPrintStyle, left: position.x, top: position.y }} aria-label={`Move ${POINT_ANNOTATION_LABELS[annotationKind]} for ${point.label}. Use arrow keys for fine positioning.`} onClick={(event) => { event.stopPropagation(); setSelectedId(point.id); setSelectedVectorId(null); setSelectedRouteId(null); setSurveyTab("points"); setActivePanel("survey"); setTool("select"); }} onPointerDown={(event) => startAnnotationDrag(event, point, annotationKind)} onKeyDown={(event) => onAnnotationKeyDown(event, point, annotationKind)}>{renderAnnotationChip(annotationKind, text)}</button>;
                })}
              </Fragment>;
            })}
            <div className={`north-arrow map-furniture${exportClass(exportSettings.mapFurniture)}`}><b>N</b><svg viewBox="0 0 34 56" aria-hidden="true"><path d="M17 2 31 46 17 39 3 46 17 2Z"/><path d="m17 2 14 44-14-7V2Z"/></svg></div><div className={`scale-bar map-furniture${exportClass(exportSettings.mapFurniture)}`}><i style={{ width: mapBar.pixels }}/><span>{formatNumber(mapBar.value)} {project.distanceUnit}</span></div><div className={`map-units map-furniture${exportClass(exportSettings.mapFurniture)}`}>distance: {UNIT_LABEL[project.distanceUnit]} · depth: {UNIT_LABEL[project.depthUnit]}</div>
            </div>
          </div>
          {smartCalloutCandidate && <>
            <svg className="smart-callout-leaders screen-hidden" data-layout-mode={smartCalloutCandidate.layout.mode} viewBox={`0 0 ${PRINT_FRAME.width} ${PRINT_FRAME.height}`} shapeRendering="geometricPrecision" aria-hidden="true">
              {smartCalloutCandidate.layout.callouts.map((callout) => <polyline key={callout.id} data-smart-callout-leader={callout.id} points={callout.leader.map((point) => `${point.x},${point.y}`).join(" ")}/>) }
              {exportSettings.pointMarkers && smartCalloutCandidate.layout.callouts.map((callout) => {
                const symbol = pointMap.get(callout.id)?.symbol;
                return symbol
                  ? <image className="smart-callout-anchor-symbol" data-smart-callout-marker={callout.id} key={callout.id} href={pointSymbolDefinition(symbol).asset} x={callout.leader[0].x - smartCalloutSymbolSize.width / 2} y={callout.leader[0].y - smartCalloutSymbolSize.height / 2} width={smartCalloutSymbolSize.width} height={smartCalloutSymbolSize.height} preserveAspectRatio="xMidYMid meet"/>
                  : <circle className="smart-callout-anchor-marker" data-smart-callout-marker={callout.id} key={callout.id} cx={callout.leader[0].x} cy={callout.leader[0].y} r="2"/>;
              })}
            </svg>
            <div className="smart-callout-labels screen-hidden" aria-hidden="true">
              {smartCalloutCandidate.layout.callouts.map((callout) => <div className={`smart-callout-label smart-callout-${callout.side}`} data-smart-callout={callout.id} key={callout.id} style={{ left: callout.box.x, top: callout.box.y, width: callout.box.width, height: callout.box.height }}>{callout.lines.map((line, index) => <span key={`${callout.id}-${index}`}>{line}{index < callout.lines.length - 1 ? " " : ""}</span>)}</div>)}
            </div>
            {smartCalloutOverflowIds.length > 0 && <div className="smart-callout-overflow-print screen-hidden" role="alert"><b>Names need more room</b><span>Reduce the PDF crop or hide Names, then print again.</span></div>}
          </>}
          {(printArea || smartCalloutsActive) && <div className={`print-crop-furniture${exportClass(exportSettings.mapFurniture)}`}><div className="north-arrow"><b>N</b><span>↑</span></div><div className="scale-bar"><i/><span>{formatNumber(mapBar.value)} {project.distanceUnit}</span></div><div className="map-units">distance: {UNIT_LABEL[project.distanceUnit]} · depth: {UNIT_LABEL[project.depthUnit]}</div></div>}

          <nav className="tool-dock print-hidden" aria-label="Map tools">
            <DockButton icon="select" label="Select" active={tool === "select" && activePanel !== "survey"} onClick={() => { setTool("select"); setActivePanel(null); }}/>
            <DockButton icon="shoreline" label="Shoreline" active={tool === "coast"} disabled={project.shoreLocked} onClick={() => { setTool("coast"); setActivePanel(null); }}/>
            <DockButton icon="route" label="Survey" active={activePanel === "survey"} onClick={() => { setTool("select"); setActivePanel("survey"); }}/>
            <DockButton icon="print-area" label="Print Area" active={tool === "printArea"} onClick={() => { setTool("printArea"); setActivePanel(null); setNotice("Drag a rectangle over the map to set the PDF print area."); }}/>
          </nav>

          <div className="notice-toast print-hidden" role="status" aria-live="polite"><span className="status-dot"/>{notice}</div>

          {!activePanel && <aside className="context-stack print-hidden" aria-label="Map inspector">
            <section className={`floating-panel layers-panel${layersOpen ? "" : " collapsed"}`}>
              <button className="layers-heading" aria-expanded={layersOpen} onClick={() => setLayersOpen((open) => !open)}><span><SoundingsIcon name="layers"/>Layers</span><SoundingsIcon name="chevron"/></button>
              {layersOpen && <div className="layer-list">
                <label><span><SoundingsIcon name="eye"/>Reference</span><input className="switch" type="checkbox" checked={project.reference.visible} onChange={(event) => mutate((current) => ({ ...current, reference: { ...current.reference, visible: event.target.checked } }), false)}/></label>
                <label><span><SoundingsIcon name="shoreline"/>Shoreline</span><input className="switch" type="checkbox" checked={visibleLayers.shoreline} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, shoreline: event.target.checked }))}/></label>
                <p className="layer-group-title">Routes</p>
                <label><span><SoundingsIcon name="route"/>Routes</span><input className="switch" type="checkbox" checked={visibleLayers.routes} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, routes: event.target.checked }))}/></label>
                <label><span className="label-glyph">°</span><span className="layer-name">Route labels</span><input className="switch" type="checkbox" checked={visibleLayers.routeLabels} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, routeLabels: event.target.checked }))}/></label>
                <p className="layer-group-title">Points</p>
                <label><span className="label-glyph compact">P1</span><span className="layer-name">Point Names</span><input className="switch" type="checkbox" checked={visibleLayers.pointNames} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, pointNames: event.target.checked }))}/></label>
                <label><span className="label-glyph compact">Nm</span><span className="layer-name">Names</span><input className="switch" type="checkbox" checked={visibleLayers.names} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, names: event.target.checked }))}/></label>
                <label><span className="label-glyph compact">ft</span><span className="layer-name">Depths</span><input className="switch" type="checkbox" checked={visibleLayers.depths} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, depths: event.target.checked }))}/></label>
                <p className="layer-group-title">Map</p>
                <label><span><span className="contour-glyph"/>Contours</span><input className="switch" type="checkbox" checked={visibleLayers.contours} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, contours: event.target.checked }))}/></label>
              </div>}
            </section>
          </aside>}

          {activePanel && <aside className={`drawer-shell print-hidden${activePanel === "survey" ? " survey-drawer" : ""}`} onWheel={(event) => event.stopPropagation()}>
            {activePanel === "projects" && <><PanelHeading icon="folder" title="Projects" onClose={() => setActivePanel(null)}/><div className="drawer-body"><label>Current project<select value={project.id} onChange={(event) => selectProject(event.target.value)}>{projects.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><button className="primary-button" onClick={newProject}>New project</button><div className="drawer-section"><h3>Project actions</h3><button className="action-row" onClick={duplicateProject}><SoundingsIcon name="duplicate"/><span><b>Duplicate</b><small>Create an editable copy</small></span></button><button className="action-row" onClick={exportBackup}><SoundingsIcon name="export"/><span><b>Download backup</b><small>Save this project as JSON</small></span></button><label className="action-row file-action"><SoundingsIcon name="upload"/><span><b>Import backup</b><small>Open a Soundings JSON file</small></span><input type="file" accept="application/json" onChange={importBackup}/></label></div><div className="drawer-section field-handoff"><h3>Field capture handoff</h3><p className="drawer-copy">Move point observations between a phone and desktop without changing route topology.</p><button className="action-row" onClick={exportFieldCapture}><SoundingsIcon name="export"/><span><b>Share field capture</b><small>Download points and draft measurements</small></span></button><label className="action-row file-action"><SoundingsIcon name="upload"/><span><b>Merge field capture</b><small>Review a mobile capture package</small></span><input type="file" accept="application/json" onChange={importFieldCapture}/></label></div><button className="danger-button drawer-danger" onClick={deleteProject}><SoundingsIcon name="trash"/>Delete project</button></div></>}

            {activePanel === "settings" && <><PanelHeading icon="settings" title="Settings" onClose={() => setActivePanel(null)}/><div className="drawer-body"><div className="drawer-section first"><h3>Dive site</h3><label>Title<input value={project.title} aria-label="Dive site title" onChange={(event) => mutate((current) => ({ ...current, title: event.target.value }), false)}/></label><label>Date<input type="date" value={project.date} onChange={(event) => mutate((current) => ({ ...current, date: event.target.value }), false)}/></label><div className="field-grid"><label>Distance unit<select value={project.distanceUnit} onChange={(event) => changeDistanceUnit(event.target.value as Unit)}>{Object.entries(UNIT_LABEL).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label>Depth unit<select value={project.depthUnit} onChange={(event) => mutate((current) => ({ ...current, depthUnit: event.target.value as Unit }), false)}>{Object.entries(UNIT_LABEL).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label></div><label>Notes<textarea value={project.notes} placeholder="Dive conditions or site notes" onChange={(event) => mutate((current) => ({ ...current, notes: event.target.value }), false)}/></label></div><div className="drawer-section"><h3>Map symbols</h3><div className="range-label"><span>Icon size</span><output htmlFor="point-symbol-scale">{Math.round(pointSymbolScale * 100)}%</output></div><input id="point-symbol-scale" aria-label="Map icon size" type="range" min={MIN_POINT_SYMBOL_SCALE} max={MAX_POINT_SYMBOL_SCALE} step="0.1" value={pointSymbolScale} onChange={(event) => mutate((current) => ({ ...current, pointSymbolScale: normalizePointSymbolScale(Number(event.target.value)) }), false)}/></div><div className="drawer-section"><h3>Reference image</h3><label className="upload-button"><SoundingsIcon name="image"/>{project.reference.dataUrl ? "Replace reference" : "Upload reference image"}<input type="file" accept="image/*" onChange={onReferenceUpload}/></label>{project.reference.dataUrl && <><div className="range-label"><span>Opacity</span><output>{Math.round(project.reference.opacity * 100)}%</output></div><input type="range" min="0" max="1" step="0.05" value={project.reference.opacity} onChange={(event) => mutate((current) => ({ ...current, reference: { ...current.reference, opacity: Number(event.target.value) } }), false)}/><div className="range-label"><span>Size</span><output>{project.reference.scale.toFixed(1)}×</output></div><input type="range" min="0.4" max="2.4" step="0.1" value={project.reference.scale} onChange={(event) => mutate((current) => ({ ...current, reference: { ...current.reference, scale: Number(event.target.value) } }), false)}/><div className="button-row"><button className={tool === "reference" ? "active" : ""} onClick={() => { setTool("reference"); setActivePanel(null); }}><SoundingsIcon name="select"/>Move</button><button onClick={() => mutate((current) => ({ ...current, reference: { ...current.reference, locked: !current.reference.locked } }))}><SoundingsIcon name={project.reference.locked ? "unlock" : "lock"}/>{project.reference.locked ? "Unlock" : "Lock"}</button></div></>}</div><div className="drawer-section"><h3>Shoreline</h3><button className="action-row" onClick={toggleShoreLock}><SoundingsIcon name={project.shoreLocked ? "unlock" : "lock"}/><span><b>{project.shoreLocked ? "Unlock shore" : "Lock shore"}</b><small>{project.shoreLocked ? "Allow drawing and adjustment" : "Protect the finished trace"}</small></span></button>{coast.length >= 3 && <button className="danger-button" onClick={() => mutate((current) => { current.coastline = []; return current; })}><SoundingsIcon name="trash"/>Clear shoreline</button>}</div></div></>}

            {activePanel === "survey" && <>
              <PanelHeading icon="route" title="Survey" onClose={() => setActivePanel(null)}/>
              <div className="survey-tabs" role="tablist" aria-label="Survey workspace"><button role="tab" aria-selected={surveyTab === "routes"} className={surveyTab === "routes" ? "active" : ""} onClick={() => setSurveyTab("routes")}>Routes</button><button role="tab" aria-selected={surveyTab === "points"} className={surveyTab === "points" ? "active" : ""} onClick={() => setSurveyTab("points")}>Points</button></div>
              <div className="drawer-body survey-body">
                {surveyTab === "routes" ? <>
                  <section className="survey-route-editor"><div className="survey-section-title"><span>Routes</span><button onClick={() => { setSelectedRouteId(null); setSelectedVectorId(null); setVectorForm((form) => ({ ...form, routeId: "new", routeName: "" })); }}>＋ New route</button></div>{routeEditor(true)}</section>
                  {routeComposer}
                  <details className="calibration-section"><summary>Scale calibration <small>{formatNumber(mapScale(project))} m / px</small></summary><label>Reference segment<select value={selectedVectorId ?? ""} onChange={(event) => { const vector = project.vectors.find((item) => item.id === event.target.value); if (vector) selectVector(vector); else setSelectedVectorId(null); }}><option value="">Select a route segment</option>{project.vectors.map((vector) => { const start = pointMap.get(vector.fromId); const end = pointMap.get(vector.toId); const route = routeForVector(routes, vector.id); return <option value={vector.id} key={vector.id}>{route ? `${routeDisplayName(route)} · ` : ""}{start?.label} → {end?.label}</option>; })}</select></label>{selectedVector && selectedRouteLine ? <><div className="field-grid"><label>Known distance<input inputMode="decimal" value={calibrationForm.distance} onChange={(event) => setCalibrationForm({ ...calibrationForm, distance: event.target.value })}/></label><label>Unit<select value={calibrationForm.unit} onChange={(event) => setCalibrationForm({ ...calibrationForm, unit: event.target.value as Unit })}>{Object.entries(UNIT_LABEL).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label></div><button className="secondary-button full-width" onClick={calibrateMap}><SoundingsIcon name="calibrate"/>Set map scale</button></> : <p className="drawer-copy">Select a segment to establish real-world scale.</p>}</details>
                </> : <>
                  <div className="point-toolbar"><label className="point-search"><span className="sr-only">Search points</span><input type="search" value={pointSearch} placeholder="Search points" onChange={(event) => setPointSearch(event.target.value)}/></label><div className="point-filters" aria-label="Point filters">{(["all", "named", "unnamed"] as PointFilter[]).map((filter) => <button className={pointFilter === filter ? "active" : ""} key={filter} onClick={() => setPointFilter(filter)}>{filter[0].toUpperCase() + filter.slice(1)}</button>)}</div><div className="point-capture-actions"><button disabled={project.waypoints.some((point) => point.label === "A0")} onClick={() => { setTool("origin"); setActivePanel(null); setNotice("Place A0 origin on the map."); }}><SoundingsIcon name="origin"/>Place A0</button><button onClick={() => { setTool("point"); setActivePanel(null); setNotice("Place a field point on the map."); }}><SoundingsIcon name="point"/>Add point</button></div></div>
                  <div className="survey-point-list" aria-label="Points">{filteredPoints.map((point) => { const memberships = routeMembershipsForPoint(point.id); return <button className={selectedId === point.id ? "active" : ""} key={point.id} onClick={() => { setSelectedId(point.id); setSelectedVectorId(null); setSelectedRouteId(null); }}><span className="point-list-marker">{point.symbol ? <PointSymbolImage symbol={point.symbol}/> : point.label}</span><span><b>{point.name?.trim() || point.label}</b><small>{point.name?.trim() ? point.label : "Survey junction"}{memberships.length ? ` · ${memberships.map(({ route }) => routeDisplayName(route)).join(", ")}` : " · Not assigned"}</small></span><em>{formatDepth(point, project.depthUnit)}</em></button>; })}{!filteredPoints.length && <div className="empty-panel"><SoundingsIcon name="point"/><h3>No matching points</h3><p>Change the search or filter, or add a point on the map.</p></div>}</div>
                  {pointInspector}
                  <div className="survey-data-actions"><button className="secondary-button" onClick={openPointTableWindow}><SoundingsIcon name="table"/>Open data table</button><button className="secondary-button" onClick={exportFieldCapture}><SoundingsIcon name="export"/>Share field capture</button></div>
                </>}
              </div>
            </>}

            {activePanel === "export" && <>
              <PanelHeading icon="export" title="Export" onClose={() => setActivePanel(null)}/>
              <div className="drawer-body">
                <p className="drawer-copy lead">Choose the crop and detail included when you print or save a PDF.</p>
                <div className="print-area-controls"><button className={tool === "printArea" ? "active" : ""} onClick={() => { setTool("printArea"); setActivePanel(null); setNotice("Drag a rectangle over the map to set the PDF print area."); }}>{printArea ? "Redraw print area" : "Set print area"}</button>{printArea && <button onClick={() => mutate((current) => { delete current.printArea; return current; })}>Clear print area</button>}</div>
                {printArea && <p className="print-area-note">Selected area: {Math.round(printArea.width)} × {Math.round(printArea.height)} map pixels · {printPoints.length} point{printPoints.length === 1 ? "" : "s"} in PDF</p>}
                <div className="drawer-section export-settings">
                  <h3>PDF layers</h3>
                  <div className="export-grid">{([ ["reference", "Reference image"], ["shoreline", "Shoreline"], ["routes", "Route lines"], ["routeLabels", "Route bearings & distances"], ["routeNameLabels", "Named route labels"], ["pointMarkers", "Named point markers"], ["pointNames", "Point Names (A0, P1)"], ["fullPointNames", "Names (Swim platform)"], ["depths", "Depths"], ["contours", "Depth contours"], ["mapFurniture", "North arrow & scale"], ["pointTable", "Point detail table"] ] as Array<[ExportToggleKey, string]>).map(([setting, label]) => <label key={setting}><input type="checkbox" checked={exportSettings[setting]} onChange={(event) => setExportSetting(setting, event.target.checked)}/>{label}</label>)}</div>
                </div>
                <div className="drawer-section name-placement-section">
                  <h3>Name placement</h3>
                  <div className="name-placement-options" role="radiogroup" aria-label="PDF name placement">
                    <label className={namePlacement === "smartCallouts" ? "active" : ""}><input className="name-placement-radio" type="radio" name="pdf-name-placement" value="smartCallouts" checked={namePlacement === "smartCallouts"} onChange={() => setNamePlacement("smartCallouts")}/><span><b>Smart callouts</b><small>Moves Names into connected side rails so they stay clear of the map.</small></span></label>
                    <label className={namePlacement === "asPositioned" ? "active" : ""}><input className="name-placement-radio" type="radio" name="pdf-name-placement" value="asPositioned" checked={namePlacement === "asPositioned"} onChange={() => setNamePlacement("asPositioned")}/><span><b>As positioned</b><small>Uses the Name positions you arranged on the working map.</small></span></label>
                  </div>
                </div>
                {smartCalloutOverflowIds.length > 0 && <p className="callout-overflow-message" id="callout-overflow-message" role="alert"><b>{smartCalloutOverflowIds.length} Name{smartCalloutOverflowIds.length === 1 ? "" : "s"} need more room.</b> Reduce the print area or hide Names before exporting.</p>}
                <button className="primary-button export-print" disabled={smartCalloutOverflowIds.length > 0} aria-describedby={smartCalloutOverflowIds.length ? "callout-overflow-message" : undefined} onClick={() => window.print()}><SoundingsIcon name="export"/>Print / Save PDF</button>
                <p className="print-note">{smartCalloutsActive ? "Names will print in connected callout rails." : "Print with selected settings"}</p>
              </div>
            </>}
          </aside>}

          {captureImportReview && <div className="capture-review-backdrop print-hidden" role="presentation"><section className="capture-review" role="dialog" aria-modal="true" aria-labelledby="capture-review-title"><header><div><span>Field capture merge</span><h2 id="capture-review-title">Review {captureImportReview.packageValue.sourceProjectTitle}</h2></div><button className="close-button" aria-label="Cancel field capture merge" onClick={() => setCaptureImportReview(null)}><SoundingsIcon name="close"/></button></header><div className="capture-review-body"><p>{captureImportReview.additions.length} new point{captureImportReview.additions.length === 1 ? "" : "s"} will be added. Existing desktop values remain selected unless you explicitly use a field update below.</p>{captureImportReview.conflicts.length > 0 && <fieldset><legend>Existing point conflicts</legend>{captureImportReview.conflicts.map((point) => <label key={point.id}><input type="checkbox" checked={captureConflictIds.has(point.id)} onChange={(event) => setCaptureConflictIds((current) => { const next = new Set(current); if (event.target.checked) next.add(point.id); else next.delete(point.id); return next; })}/><span><b>{point.label}{point.name ? ` · ${point.name}` : ""}</b><small>{eventualFieldDraftSummary(point.fieldDraft, project.distanceUnit)}</small></span></label>)}</fieldset>}</div><footer><button className="secondary-button" onClick={() => setCaptureImportReview(null)}>Cancel</button><button className="primary-button" onClick={applyFieldCaptureMerge}>Merge field capture</button></footer></section></div>}

          {visibleLayers.mapFurniture && <><div className="screen-north print-hidden"><b>N</b><svg viewBox="0 0 34 56" aria-hidden="true"><path d="M17 2 31 46 17 39 3 46 17 2Z"/><path d="m17 2 14 44-14-7V2Z"/></svg></div><div className="screen-scale print-hidden"><div className="scale-labels"><span>0</span><span>{formatNumber(mapBar.value / 2)}</span><span>{formatNumber(mapBar.value)} {project.distanceUnit}</span></div><i/></div></>}
          <div className="zoom-controls print-hidden"><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.1, value / 1.25))}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setZoom((value) => value * 1.25)}>＋</button><button className="recenter-button" aria-label="Recenter map" onClick={() => { setPan({ x: 22, y: 24 }); setZoom(0.78); }}><SoundingsIcon name="origin"/></button></div>
          <div className="map-readout print-hidden"><span>{formatNumber(mapScale(project))} m / px</span><span>{project.waypoints.length} {project.waypoints.length === 1 ? "point" : "points"}</span><span>{routes.length} {routes.length === 1 ? "route" : "routes"}</span></div>
        </div>
        <section className="print-details"><h2>{project.title}</h2><p>{project.notes || "Dive-site sketch prepared with Soundings."}</p><p className="print-scale">Scale: {formatNumber(mapScale(project))} meters per map pixel · {formatNumber(mapBar.value)} {project.distanceUnit} scale bar</p><table className={exportClass(exportSettings.pointTable)}><thead><tr><th>Point</th><th>Name</th><th>Depth</th><th>Position</th></tr></thead><tbody>{printPoints.map((point) => <tr key={point.id}><td>{point.label}</td><td>{point.name || "—"}</td><td>{formatDepth(point, project.depthUnit)}</td><td>{Math.round(point.x)}, {Math.round(point.y)}</td></tr>)}</tbody></table></section>
      </section>
    </main>
  );
}
