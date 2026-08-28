"use client";

import { CSSProperties, ChangeEvent, Fragment, KeyboardEvent as ReactKeyboardEvent, PointerEvent, WheelEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CANVAS_SIZE, MAX_CANVAS_DIMENSION, normalizeCanvasSize, protectedCanvasResizeMinimum, type CanvasSize } from "./canvas-size";
import { clampDockPosition, DEFAULT_MAP_PAN, DEFAULT_MAP_ZOOM, DEFAULT_VISUAL_SCALE_STOP_ZOOM, fitMapView, MAX_VISUAL_SCALE_STOP_ZOOM, MIN_VISUAL_SCALE_STOP_ZOOM, normalizeVisualScaleStopZoom, pointVisualZoom, VISUAL_SCALE_STOP_ZOOM_STEP, type DockPosition } from "./map-view";
import { calibrationReferenceIsCurrent, isFinitePositive, metersPerPixel, routePixelLength, segmentPixelLength, type CalibrationSourceMode } from "./calibration";
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
import {
  PRINT_CALLOUT_GAP,
  PRINT_CALLOUT_RAIL_WIDTH,
  PRINT_CHART_FRAME,
  chooseScaleBar,
  createPrintProjection,
  exactPrintClipGeometry,
  formatScaleNumber,
  printViewportFor,
  type PrintSource,
  type PrintViewport,
} from "./print-layout";
import {
  CLEAN_CHART_EXPORT_SETTINGS,
  FULL_DETAIL_EXPORT_SETTINGS,
  buildRouteLegRows,
  buildUsedSymbolLegend,
  effectiveExportSettings,
  normalizeExportSettings,
  resolveMapViewExportSettings,
  type ExportSettings,
  type ExportToggleKey,
  type NamePlacement,
} from "./print-export";
import { migrateLegacyWaypoints } from "./project-migration";
import { collapseRouteVertex, deleteRouteSegment, deleteSavedRoute, insertRouteMidpoint, type RouteEditResult } from "./route-editing";
import { planarizeRouteTopology } from "./route-topology";
import { buildRouteNetwork, type RoutePath } from "./route-network";
import {
  DEFAULT_FLOATING_TEXT_SIZE,
  MAX_FLOATING_TEXT_LENGTH,
  MAX_FLOATING_TEXT_SIZE,
  MIN_FLOATING_TEXT_SIZE,
  floatingTextEqual,
  normalizeFloatingTextContent,
  normalizeFloatingTextRotation,
  normalizeFloatingTexts,
  normalizeFloatingTextSize,
  translateFloatingText,
  type FloatingText,
} from "./floating-text";
import {
  DEFAULT_GEOGRAPHIC_FEATURE_STYLE,
  geographicFeatureLabelAnchor,
  geographicFeaturePath,
  normalizeGeographicFeatures,
  simplifyFreehandPoints,
  translateGeographicFeature,
  type FeaturePoint,
  type GeographicFeature,
  type GeographicFeatureDash,
  type GeographicFeatureMode,
} from "./geographic-features";
import {
  normalizeRoutes,
  reverseRoute,
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
type RouteVertex = { id: string; x: number; y: number };
type RouteNode = Point | RouteVertex;
type Vector = { id: string; fromId: string; toId: string; bearing: number; distance: number; unit: Unit };
type CoastPoint = { id: string; x: number; y: number };
type PrintArea = { x: number; y: number; width: number; height: number };
type ReferenceImage = { dataUrl?: string; opacity: number; scale: number; x: number; y: number; visible: boolean; locked: boolean; frame?: CanvasSize };
type Calibration = { routeId?: string; vectorId?: string; distance?: number; unit?: Unit; metersPerPixel: number };
type Project = {
  version: 2; id: string; title: string; date: string; notes: string; distanceUnit: Unit; depthUnit: Unit;
  coastline: CoastPoint[]; shoreLocked?: boolean; geographicFeatures: GeographicFeature[]; floatingTexts: FloatingText[]; waypoints: Point[]; routeVertices: RouteVertex[]; vectors: Vector[]; routes?: SavedRoute[]; reference: ReferenceImage; calibration?: Calibration; exportSettings?: ExportSettings; printArea?: PrintArea; pointSymbolScale?: number; visualScaleStopZoom?: number; canvasSize?: CanvasSize;
};
type StoredProject = Omit<Project, "version" | "routeVertices" | "geographicFeatures" | "floatingTexts"> & { version: 1 | 2; routeVertices?: RouteVertex[]; geographicFeatures?: unknown; floatingTexts?: unknown };
type ProjectSyncMessage =
  | { type: "project-update"; protocol: 2; source: string; project: Project }
  | { type: "project-request"; protocol: 2; source: string; projectId: string };
type Tool = "select" | "coast" | "feature" | "text" | "point" | "route" | "reference" | "printArea";
type ActivePanel = "projects" | "survey" | "settings" | "export" | null;
type SurveyTab = "routes" | "points" | "features";
type PointFilter = "all" | "named" | "unnamed";
type CaptureImportReview = { packageValue: FieldCapturePackage; additions: CapturedPoint[]; conflicts: CapturedPoint[] };
type LayerVisibility = { shoreline: boolean; geographicFeatures: boolean; geographicFeatureLabels: boolean; floatingText: boolean; routes: boolean; routeLabels: boolean; routeNameLabels: boolean; pointNames: boolean; names: boolean; depths: boolean; mapFurniture: boolean };
type PrintAreaHandle = "move" | "nw" | "ne" | "se" | "sw";
type CanvasResizeHandle = "east" | "south" | "southeast";
type DragDetails = { id?: string; pointId?: string; annotationKind?: PointAnnotationKind; offset?: LabelOffset; initialOffset?: LabelOffset; hadOffset?: boolean; moved?: boolean; changed?: boolean; originX?: number; originY?: number; start: Project; x: number; y: number; point?: { x: number; y: number }; area?: PrintArea; handle?: PrintAreaHandle; canvasSize?: CanvasSize; resizeHandle?: CanvasResizeHandle };
type Drag = ({ kind: "waypoint" | "routeVertex" | "annotation" | "coast" | "pan" | "reference" | "printAreaDraw" | "printAreaAdjust" | "canvasResize" | "floatingText" } | { kind: "feature" | "featureAnchor" | "featureFreehand" }) & DragDetails;
type DockDrag = { pointerId: number; offsetX: number; offsetY: number };
type DraftRoutePoint = { x: number; y: number; nodeId?: string };
type RouteDraft = { points: DraftRoutePoint[]; name: string; extendRouteId?: string; extendAt?: "start" | "end" };
type FeatureDraft = { mode: GeographicFeatureMode; points: FeaturePoint[]; closed: boolean; redrawFeatureId?: string };

const DB_NAME = "dive-map-builder";
const STORE_NAME = "projects";
const DESKTOP_TOOL_DOCK_QUERY = "(min-width: 1200px)";
const TOOL_DOCK_INSET = 12;
const PRINT_PRIMARY_TEXT_SIZE = 12;
const PRINT_SECONDARY_TEXT_SIZE = 11;
const DEFAULT_METERS_PER_PIXEL = 0.5;
const METERS_PER_UNIT: Record<Unit, number> = { ft: 0.3048, m: 1, mi: 1609.344 };
const UNIT_LABEL: Record<Unit, string> = { ft: "feet", m: "meters", mi: "miles" };
const POINT_ANNOTATION_LABELS: Record<PointAnnotationKind, string> = { pointName: "Point Name", name: "Name", depth: "Depth" };
const GEOGRAPHIC_FEATURE_MODE_LABELS: Record<GeographicFeatureMode, string> = { freehand: "Freehand", spline: "Smooth spline", polyline: "Connected line" };
const GEOGRAPHIC_FEATURE_DASH_LABELS: Record<GeographicFeatureDash, string> = { solid: "Solid", dashed: "Dashed", dotted: "Dotted" };
const VISUAL_SCALE_STOP_ZOOM_OPTIONS = Array.from({ length: Math.round((MAX_VISUAL_SCALE_STOP_ZOOM - MIN_VISUAL_SCALE_STOP_ZOOM) / VISUAL_SCALE_STOP_ZOOM_STEP) + 1 }, (_, index) => MIN_VISUAL_SCALE_STOP_ZOOM + index * VISUAL_SCALE_STOP_ZOOM_STEP);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const id = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const round = (value: number, precision = 2) => Math.round(value * 10 ** precision) / 10 ** precision;
const formatNumber = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const formatProjectDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value || "Undated";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
};
const printDocumentTitle = (title: string) => `${title.trim() || "Soundings dive map"} — Soundings`;
async function waitForPrintImages(root: ParentNode) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => {
    if (image.complete) {
      if (image.naturalWidth > 0 && typeof image.decode === "function") await image.decode().catch(() => undefined);
      return;
    }
    await new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));
}
const emptyProject = (title = "Untitled dive site"): Project => ({
  version: 2, id: id(), title, date: new Date().toISOString().slice(0, 10), notes: "", distanceUnit: "ft", depthUnit: "ft",
  coastline: [], shoreLocked: false, geographicFeatures: [], floatingTexts: [], waypoints: [], routeVertices: [], vectors: [], routes: [], calibration: { metersPerPixel: DEFAULT_METERS_PER_PIXEL }, exportSettings: { ...CLEAN_CHART_EXPORT_SETTINGS },
  pointSymbolScale: DEFAULT_POINT_SYMBOL_SCALE,
  visualScaleStopZoom: DEFAULT_VISUAL_SCALE_STOP_ZOOM,
  canvasSize: { ...DEFAULT_CANVAS_SIZE },
  reference: { opacity: 0.48, scale: 1, x: 0, y: 0, visible: true, locked: false, frame: { ...DEFAULT_CANVAS_SIZE } },
});

function bearingFor(dx: number, dy: number) { return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; }
function formatDepth(point: Point, unit: Unit) { return point.depth === undefined || point.depth === null ? "—" : `${formatNumber(point.depth)} ${unit}`; }
function eventualFieldDraftSummary(draft: FieldDraft | undefined, fallbackUnit: Unit) {
  if (!draft) return "Point metadata differs from the desktop copy.";
  const measurements = [draft.bearing !== undefined ? `${formatNumber(draft.bearing)}°` : "", draft.distance !== undefined ? `${formatNumber(draft.distance)} ${draft.unit ?? fallbackUnit}` : ""].filter(Boolean).join(" · ");
  return measurements || draft.note || "Point metadata differs from the desktop copy.";
}
function hasDescriptiveName(point: Point) { return Boolean(point.name?.trim()); }
function isPoint(node: RouteNode | undefined): node is Point { return Boolean(node && "label" in node); }
function routeNodes(project: Pick<Project, "waypoints" | "routeVertices">): RouteNode[] { return [...project.waypoints, ...project.routeVertices]; }
function minimumCanvasSizeForProject(project: Project, currentSize: CanvasSize): CanvasSize {
  return protectedCanvasResizeMinimum([
    ...project.coastline,
    ...project.geographicFeatures.flatMap((feature) => feature.points),
    ...project.floatingTexts,
    ...project.waypoints,
    ...project.routeVertices,
  ], currentSize);
}
function nodeLabel(node: RouteNode | undefined, fallback = "Route vertex") { return isPoint(node) ? node.label : fallback; }
function nextPointLabel(points: readonly Point[]) {
  const labels = new Set(points.map((point) => point.label.toLowerCase()));
  let number = 1;
  while (labels.has(`p${number}`)) number += 1;
  return `P${number}`;
}
function normalizePrintArea(area?: Partial<PrintArea>, bounds: CanvasSize = DEFAULT_CANVAS_SIZE): PrintArea | undefined {
  if (!area || !Number.isFinite(area.x) || !Number.isFinite(area.y) || !Number.isFinite(area.width) || !Number.isFinite(area.height)) return undefined;
  const canvasSize = normalizeCanvasSize(bounds);
  const { x, y, width, height } = area as PrintArea;
  const left = Math.max(0, Math.min(canvasSize.width, Math.min(x, x + width)));
  const top = Math.max(0, Math.min(canvasSize.height, Math.min(y, y + height)));
  const right = Math.max(left, Math.min(canvasSize.width, Math.max(x, x + width)));
  const bottom = Math.max(top, Math.min(canvasSize.height, Math.max(y, y + height)));
  if (right - left < 12 || bottom - top < 12) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
function printAreaFromPoints(start: { x: number; y: number }, end: { x: number; y: number }, bounds: CanvasSize = DEFAULT_CANVAS_SIZE) { return normalizePrintArea({ x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y }, bounds); }
function pointInPrintArea(point: { x: number; y: number }, area?: PrintArea) { return !area || (point.x >= area.x && point.x <= area.x + area.width && point.y >= area.y && point.y <= area.y + area.height); }
function projectedPointOnSegment(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { x: start.x, y: start.y, t: 0, distance: Math.hypot(point.x - start.x, point.y - start.y) };
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const x = start.x + dx * t;
  const y = start.y + dy * t;
  return { x, y, t, distance: Math.hypot(point.x - x, point.y - y) };
}
function mapScale(project: Project) { return isFinitePositive(project.calibration?.metersPerPixel) ? project.calibration.metersPerPixel : DEFAULT_METERS_PER_PIXEL; }
function geometry(project: Project, vector: Vector) {
  const nodes = routeNodes(project);
  const start = nodes.find((point) => point.id === vector.fromId);
  const end = nodes.find((point) => point.id === vector.toId);
  if (!start || !end) return null;
  return { start, end, dx: end.x - start.x, dy: end.y - start.y, pixels: Math.hypot(end.x - start.x, end.y - start.y) };
}
function normalizedCalibration(project: Project): Calibration {
  const metersPerSourcePixel = mapScale(project);
  const calibration = project.calibration;
  if (!calibration || !isFinitePositive(calibration.distance) || !calibration.unit || !(calibration.unit in METERS_PER_UNIT)) {
    return { metersPerPixel: metersPerSourcePixel };
  }
  if (!calibrationReferenceIsCurrent(calibration, project.routes ?? [], project.vectors, routeNodes(project))) {
    return { metersPerPixel: metersPerSourcePixel };
  }
  return calibration.routeId
    ? { routeId: calibration.routeId, distance: calibration.distance, unit: calibration.unit, metersPerPixel: metersPerSourcePixel }
    : { vectorId: calibration.vectorId, distance: calibration.distance, unit: calibration.unit, metersPerPixel: metersPerSourcePixel };
}
function routePathData(path: RoutePath, pointById: ReadonlyMap<string, RouteNode>) {
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
  project.calibration = normalizedCalibration(project);
  project.vectors.forEach((vector) => {
    const line = geometry(project, vector);
    if (!line) return;
    vector.bearing = round(bearingFor(line.dx, line.dy));
    vector.unit = project.distanceUnit;
    vector.distance = round((line.pixels * metersPerPixel) / METERS_PER_UNIT[project.distanceUnit]);
  });
  return project;
}
function reconcileRouteTopology(project: Project): Project {
  const calibratedVectorId = project.calibration?.vectorId;
  const calibratedVectorBefore = calibratedVectorId ? project.vectors.find((vector) => vector.id === calibratedVectorId) : undefined;
  const planarized = planarizeRouteTopology(project.waypoints, project.routeVertices, project.vectors, project.routes ?? [], { epsilon: 1e-6, createId: () => id() });
  project.waypoints = planarized.points;
  project.routeVertices = planarized.routeVertices;
  project.vectors = planarized.vectors;
  project.routes = normalizeRoutes(routeNodes(project), project.vectors, planarized.routes, { createId: id });
  const calibratedVectorAfter = calibratedVectorId ? project.vectors.find((vector) => vector.id === calibratedVectorId) : undefined;
  if (calibratedVectorId && (
    planarized.splitVectorIds.includes(calibratedVectorId)
    || !calibratedVectorAfter
    || Boolean(calibratedVectorBefore && (calibratedVectorBefore.fromId !== calibratedVectorAfter.fromId || calibratedVectorBefore.toId !== calibratedVectorAfter.toId))
  )) {
    project.calibration = { metersPerPixel: mapScale(project) };
  }
  return synchronizeVectors(project);
}
function applyRouteEditResult(project: Project, result: RouteEditResult<Point, RouteVertex, Vector, SavedRoute>): Project {
  if (!result.ok) return project;
  const calibratedVectorId = project.calibration?.vectorId;
  const calibratedVectorBefore = calibratedVectorId ? project.vectors.find((vector) => vector.id === calibratedVectorId) : undefined;
  const calibratedVectorAfter = calibratedVectorId ? result.vectors.find((vector) => vector.id === calibratedVectorId) : undefined;
  const calibratedVectorChanged = calibratedVectorId && (
    result.splitVectorIds.includes(calibratedVectorId)
    || result.removedVectorIds.includes(calibratedVectorId)
    || !calibratedVectorAfter
    || Boolean(calibratedVectorBefore && (calibratedVectorBefore.fromId !== calibratedVectorAfter.fromId || calibratedVectorBefore.toId !== calibratedVectorAfter.toId))
  );
  project.waypoints = result.points;
  project.routeVertices = result.routeVertices;
  project.vectors = result.vectors;
  project.routes = result.routes;
  if (calibratedVectorChanged) project.calibration = { metersPerPixel: mapScale(project) };
  return synchronizeVectors(project);
}
function normalizePointAnnotationOffsets(point: Point) {
  const normalized = normalizeLabelOffsets(point.labelOffsets);
  if (!normalized) { delete point.labelOffsets; return point; }
  // Anchors intentionally may cross the canvas edge so the canvas and PDF crop
  // clip displaced annotations naturally instead of changing saved geometry.
  point.labelOffsets = normalized;
  return point;
}
function normalizeProject(raw: StoredProject | Project): Project {
  const stored = clone(raw) as StoredProject;
  const storedWaypoints = Array.isArray(stored.waypoints) ? stored.waypoints : [];
  const storedVectors = Array.isArray(stored.vectors) ? stored.vectors : [];
  const storedRouteVertices = Array.isArray(stored.routeVertices) ? stored.routeVertices : [];
  const fallback = emptyProject(typeof stored.title === "string" && stored.title.trim() ? stored.title : "Imported dive site");
  const legacyMigration = stored.version === 1
    ? migrateLegacyWaypoints(storedWaypoints, storedVectors)
    : { waypoints: storedWaypoints, routeVertices: storedRouteVertices, convertedPointIds: [] };
  const pointIds = new Set(legacyMigration.waypoints.map((point) => point.id));
  const routeVertexIds = new Set<string>();
  const project = {
    ...fallback,
    ...stored,
    version: 2,
    waypoints: legacyMigration.waypoints,
    routeVertices: legacyMigration.routeVertices.filter((vertex) => {
      if (!vertex || typeof vertex.id !== "string" || pointIds.has(vertex.id) || routeVertexIds.has(vertex.id) || !Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)) return false;
      routeVertexIds.add(vertex.id);
      return true;
    }),
  } as Project;
  project.id = typeof project.id === "string" && project.id ? project.id : fallback.id;
  project.title = typeof project.title === "string" && project.title.trim() ? project.title : fallback.title;
  project.date = typeof project.date === "string" && project.date ? project.date : fallback.date;
  project.notes = typeof project.notes === "string" ? project.notes : "";
  project.distanceUnit = project.distanceUnit in METERS_PER_UNIT ? project.distanceUnit : "ft";
  project.depthUnit = project.depthUnit in METERS_PER_UNIT ? project.depthUnit : "ft";
  project.canvasSize = normalizeCanvasSize(project.canvasSize);
  project.coastline = Array.isArray(project.coastline) ? project.coastline : [];
  project.geographicFeatures = normalizeGeographicFeatures(stored.geographicFeatures, id);
  project.floatingTexts = normalizeFloatingTexts(stored.floatingTexts, project.canvasSize, id, project.geographicFeatures.map((feature) => feature.id));
  const savedReference = project.reference ?? ({} as Partial<ReferenceImage>);
  project.reference = { dataUrl: savedReference.dataUrl, opacity: savedReference.opacity ?? 0.48, scale: savedReference.scale ?? 1, x: savedReference.x ?? 0, y: savedReference.y ?? 0, visible: savedReference.visible ?? true, locked: savedReference.locked ?? false, frame: normalizeCanvasSize(savedReference.frame ?? project.canvasSize) };
  project.waypoints = (project.waypoints ?? []).map((point) => {
    return normalizePointAnnotationOffsets({ ...point, name: point.name ?? "", symbol: normalizePointSymbol(point.symbol) });
  });
  project.vectors = storedVectors.map((vector) => ({ ...vector, unit: METERS_PER_UNIT[vector.unit] ? vector.unit : project.distanceUnit }));
  project.routes = normalizeRoutes(routeNodes(project), project.vectors, Array.isArray(project.routes) ? project.routes : [], { createId: id });
  project.shoreLocked = project.shoreLocked ?? false;
  project.exportSettings = normalizeExportSettings(stored.exportSettings);
  project.printArea = normalizePrintArea(project.printArea, project.canvasSize);
  project.calibration = { ...project.calibration, metersPerPixel: mapScale(project) };
  project.pointSymbolScale = normalizePointSymbolScale(project.pointSymbolScale);
  project.visualScaleStopZoom = normalizeVisualScaleStopZoom(project.visualScaleStopZoom);
  return reconcileRouteTopology(project);
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
    request.onsuccess = () => { database.close(); resolve((request.result as StoredProject[]).map(normalizeProject)); };
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
  return <button className={`dock-button${active ? " active" : ""}`} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}><SoundingsIcon name={icon}/><span>{label}</span></button>;
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
  const [zoom, setZoom] = useState(DEFAULT_MAP_ZOOM);
  const [pan, setPan] = useState(() => ({ ...DEFAULT_MAP_PAN }));
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const [routeDraft, setRouteDraft] = useState<RouteDraft | null>(null);
  const [routeDraftPointer, setRouteDraftPointer] = useState<DraftRoutePoint | null>(null);
  const [featureModePickerOpen, setFeatureModePickerOpen] = useState(false);
  const [featureDraft, setFeatureDraft] = useState<FeatureDraft | null>(null);
  const [featureDraftPointer, setFeatureDraftPointer] = useState<FeaturePoint | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedRouteVertexId, setSelectedRouteVertexId] = useState<string | null>(null);
  const [pendingDeletePointId, setPendingDeletePointId] = useState<string | null>(null);
  const [calibrationMode, setCalibrationMode] = useState<CalibrationSourceMode>("segment");
  const [calibrationForm, setCalibrationForm] = useState({ distance: "", unit: "ft" as Unit });
  const [notice, setNotice] = useState("Loading local map library…");
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [surveyTab, setSurveyTab] = useState<SurveyTab>("routes");
  const [pointFilter, setPointFilter] = useState<PointFilter>("all");
  const [pointSearch, setPointSearch] = useState("");
  const deferredPointSearch = useDeferredValue(pointSearch.trim().toLowerCase());
  const [captureImportReview, setCaptureImportReview] = useState<CaptureImportReview | null>(null);
  const [captureConflictIds, setCaptureConflictIds] = useState<Set<string>>(() => new Set());
  const [layersOpen, setLayersOpen] = useState(false);
  const [saveState, setSaveState] = useState("Saved locally");
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [dockPosition, setDockPosition] = useState<DockPosition | null>(null);
  const [dockDragging, setDockDragging] = useState(false);
  const [canvasResizeActive, setCanvasResizeActive] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<LayerVisibility>({ shoreline: true, geographicFeatures: true, geographicFeatureLabels: true, floatingText: true, routes: true, routeLabels: true, routeNameLabels: true, pointNames: true, names: true, depths: true, mapFurniture: true });
  const [pointTableProjectId] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("point-table") : null);
  const pointTableOnly = Boolean(pointTableProjectId);
  const stageRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const dockDrag = useRef<DockDrag | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const autoFitRef = useRef(true);
  const syncChannel = useRef<BroadcastChannel | null>(null);
  const pointTableWindow = useRef<Window | null>(null);
  const projectRef = useRef<Project | null>(null);
  const floatingTextEditStart = useRef<Project | null>(null);
  const featureDraftRef = useRef<FeatureDraft | null>(null);
  const finishFeatureDrawingRef = useRef<() => void>(() => undefined);
  const windowId = useRef(id());

  const fitMapToStageWithMinimum = useCallback((minimumZoom: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    autoFitRef.current = true;
    const bounds = stage.getBoundingClientRect();
    const canvasSize = normalizeCanvasSize(projectRef.current?.canvasSize);
    const view = fitMapView(bounds.width, bounds.height, canvasSize.width, canvasSize.height, minimumZoom);
    panRef.current = view.pan;
    zoomRef.current = view.zoom;
    setPan(view.pan);
    setZoom(view.zoom);
  }, []);
  const fitMapToStage = useCallback(() => fitMapToStageWithMinimum(DEFAULT_MAP_ZOOM), [fitMapToStageWithMinimum]);
  const fitEntireMapToStage = useCallback(() => fitMapToStageWithMinimum(0.1), [fitMapToStageWithMinimum]);
  const changeMapZoom = useCallback((factor: number) => {
    autoFitRef.current = false;
    setZoom((current) => {
      const next = Math.max(0.1, current * factor);
      zoomRef.current = next;
      return next;
    });
  }, []);
  const replaceFeatureDraft = (next: FeatureDraft | null) => {
    featureDraftRef.current = next;
    setFeatureDraft(next);
  };
  const reviseFeatureDraft = (transform: (current: FeatureDraft | null) => FeatureDraft | null) => {
    const next = transform(featureDraftRef.current);
    featureDraftRef.current = next;
    setFeatureDraft(next);
    return next;
  };
  const measuredDockPosition = useCallback((): DockPosition | null => {
    const stage = stageRef.current;
    const dock = dockRef.current;
    if (!stage || !dock) return null;
    const stageBounds = stage.getBoundingClientRect();
    const dockBounds = dock.getBoundingClientRect();
    return { left: dockBounds.left - stageBounds.left, top: dockBounds.top - stageBounds.top };
  }, []);
  const clampDockToStage = useCallback((position: DockPosition): DockPosition => {
    const stage = stageRef.current;
    const dock = dockRef.current;
    if (!stage || !dock) return position;
    const stageBounds = stage.getBoundingClientRect();
    const dockBounds = dock.getBoundingClientRect();
    return clampDockPosition(
      position,
      { width: stageBounds.width, height: stageBounds.height },
      { width: dockBounds.width, height: dockBounds.height },
      TOOL_DOCK_INSET,
    );
  }, []);
  const startDockDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary || !window.matchMedia(DESKTOP_TOOL_DOCK_QUERY).matches) return;
    const measured = measuredDockPosition();
    const dock = dockRef.current;
    if (!measured || !dock) return;
    const dockBounds = dock.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    dockDrag.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - dockBounds.left,
      offsetY: event.clientY - dockBounds.top,
    };
    setDockPosition(clampDockToStage(measured));
    setDockDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDock = (event: PointerEvent<HTMLButtonElement>) => {
    const activeDrag = dockDrag.current;
    const stage = stageRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId || !stage) return;
    event.preventDefault();
    event.stopPropagation();
    const stageBounds = stage.getBoundingClientRect();
    setDockPosition(clampDockToStage({
      left: event.clientX - stageBounds.left - activeDrag.offsetX,
      top: event.clientY - stageBounds.top - activeDrag.offsetY,
    }));
  };
  const finishDockDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const activeDrag = dockDrag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dockDrag.current = null;
    setDockDragging(false);
  };
  const moveDockWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!window.matchMedia(DESKTOP_TOOL_DOCK_QUERY).matches) return;
    if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      setDockPosition(null);
      return;
    }
    const step = event.shiftKey ? 32 : 8;
    const offsets: Record<string, DockPosition> = {
      ArrowUp: { left: 0, top: -step },
      ArrowDown: { left: 0, top: step },
      ArrowLeft: { left: -step, top: 0 },
      ArrowRight: { left: step, top: 0 },
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    event.stopPropagation();
    const measured = dockPosition ?? measuredDockPosition();
    if (!measured) return;
    setDockPosition(clampDockToStage({ left: measured.left + offset.left, top: measured.top + offset.top }));
  };

  useEffect(() => {
    const requestedProjectId = new URLSearchParams(window.location.search).get("point-table");
    readProjects().then((stored) => {
      const ordered = stored.sort((a, b) => b.date.localeCompare(a.date));
      const first = ordered[0] ?? emptyProject("Beaver Lake dive map");
      const active = requestedProjectId ? ordered.find((item) => item.id === requestedProjectId) ?? first : first;
      projectRef.current = active;
      setProject(active); setProjects(ordered.length ? ordered : [first]); setReady(true);
      setNotice(ordered.length ? "Local projects restored with their map scale." : "New local project ready — draw a route or add a point.");
      if (!ordered.length) void persistProject(first);
    }).catch(() => { const fresh = emptyProject("Beaver Lake dive map"); projectRef.current = fresh; setProject(fresh); setProjects([fresh]); setReady(true); setNotice("Working in this browser session."); });
  }, []);
  useEffect(() => {
    if (!ready || pointTableOnly) return;
    let frame = 0;
    const refit = () => {
      if (!autoFitRef.current) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fitMapToStage);
    };
    refit();
    window.addEventListener("resize", refit);
    window.visualViewport?.addEventListener("resize", refit);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", refit);
      window.visualViewport?.removeEventListener("resize", refit);
    };
  }, [fitMapToStage, pointTableOnly, ready]);
  useEffect(() => {
    if (!ready || pointTableOnly) return;
    const stage = stageRef.current;
    const dock = dockRef.current;
    if (!stage || !dock) return;
    const reclamp = () => {
      if (!window.matchMedia(DESKTOP_TOOL_DOCK_QUERY).matches) return;
      setDockPosition((current) => current ? clampDockToStage(current) : current);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reclamp);
    observer?.observe(stage);
    observer?.observe(dock);
    window.addEventListener("resize", reclamp);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", reclamp);
    };
  }, [clampDockToStage, pointTableOnly, ready]);
  useEffect(() => {
    const receiveProject = (message: ProjectSyncMessage) => {
      if (message.protocol !== 2 || message.type !== "project-update" || message.source === windowId.current) return;
      const incoming = normalizeProject(message.project);
      setProjects((items) => [incoming, ...items.filter((item) => item.id !== incoming.id)]);
      setProject((current) => {
        if (current?.id !== incoming.id && (!pointTableOnly || pointTableProjectId !== incoming.id)) return current;
        projectRef.current = incoming;
        return incoming;
      });
    };
    const receiveWindowSync = (event: globalThis.MessageEvent<ProjectSyncMessage>) => {
      if (event.origin !== window.location.origin || !event.data || event.data.protocol !== 2 || event.data.source === windowId.current) return;
      if (event.data.type === "project-request") {
        if (pointTableOnly || !event.source) return;
        const target = event.source as Window;
        pointTableWindow.current = target;
        const current = projectRef.current;
        if (current?.id === event.data.projectId) target.postMessage({ type: "project-update", protocol: 2, source: windowId.current, project: current } satisfies ProjectSyncMessage, window.location.origin);
        return;
      }
      if (!pointTableOnly && event.source) pointTableWindow.current = event.source as Window;
      receiveProject(event.data);
    };
    window.addEventListener("message", receiveWindowSync);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("soundings-project-sync-v2");
      syncChannel.current = channel;
      channel.onmessage = (event: MessageEvent<ProjectSyncMessage>) => receiveProject(event.data);
    }
    return () => { window.removeEventListener("message", receiveWindowSync); syncChannel.current?.close(); syncChannel.current = null; };
  }, [pointTableOnly, pointTableProjectId]);
  useEffect(() => {
    if (!ready || !pointTableProjectId || !window.opener) return;
    window.opener.postMessage({ type: "project-request", protocol: 2, source: windowId.current, projectId: pointTableProjectId } satisfies ProjectSyncMessage, window.location.origin);
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
      if (event.key === "Escape") {
        featureDraftRef.current = null;
        setFeatureDraft(null);
        setFeatureDraftPointer(null);
        setFeatureModePickerOpen(false);
        setRouteDraft(null);
        setRouteDraftPointer(null);
        setTool("select");
        setActivePanel(null);
        setSelectedId(null);
        setSelectedVectorId(null);
        setSelectedRouteId(null);
        setSelectedRouteVertexId(null);
        setSelectedFeatureId(null);
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const activeFeatureDraft = featureDraftRef.current;
      if (activeFeatureDraft && activeFeatureDraft.mode !== "freehand") {
        if (event.key === "Enter") {
          event.preventDefault();
          finishFeatureDrawingRef.current();
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          const next = { ...activeFeatureDraft, points: activeFeatureDraft.points.slice(0, -1) };
          featureDraftRef.current = next;
          setFeatureDraft(next);
          setFeatureDraftPointer(null);
          return;
        }
      }
      const step = event.shiftKey ? 180 : 60;
      const offsets: Record<string, { x: number; y: number }> = {
        ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step }, ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 },
      };
      const offset = offsets[event.key];
      if (!offset) return;
      event.preventDefault();
      autoFitRef.current = false;
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
      autoFitRef.current = false;
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

  const canvasSize = normalizeCanvasSize(project?.canvasSize);
  const selected = project?.waypoints.find((point) => point.id === selectedId) ?? null;
  const pendingDeletePoint = project?.waypoints.find((point) => point.id === pendingDeletePointId) ?? null;
  const selectedFeature = project?.geographicFeatures.find((feature) => feature.id === selectedFeatureId) ?? null;
  const selectedFloatingText = project?.floatingTexts.find((item) => item.id === selectedFeatureId) ?? null;
  const selectedRouteVertex = project?.routeVertices.find((vertex) => vertex.id === selectedRouteVertexId) ?? null;
  const selectedVector = project?.vectors.find((vector) => vector.id === selectedVectorId) ?? null;
  const routes = project?.routes ?? [];
  const selectedRoute = routes.find((route) => route.id === selectedRouteId)
    ?? (selectedVector ? routeForVector(routes, selectedVector.id) : undefined)
    ?? null;
  const pointMap = useMemo(() => new Map(project?.waypoints.map((point) => [point.id, point]) ?? []), [project]);
  const nodeMap = useMemo(() => new Map(project ? routeNodes(project).map((point) => [point.id, point]) : []), [project]);
  const visualRouteNetwork = useMemo(() => project ? buildRouteNetwork(routeNodes(project), project.vectors) : { paths: [], branchPointIds: [] }, [project]);

  const update = (next: Project, record = true) => {
    if (!project) return;
    if (record) { setUndoStack((old) => [...old.slice(-29), clone(project)]); setRedoStack([]); }
    setSaveState("Saving…");
    projectRef.current = next;
    setProject(next);
    const message = { type: "project-update", protocol: 2, source: windowId.current, project: next } satisfies ProjectSyncMessage;
    syncChannel.current?.postMessage(message);
    const directTarget = pointTableOnly ? window.opener : pointTableWindow.current;
    if (directTarget && !directTarget.closed) directTarget.postMessage(message, window.location.origin);
  };
  const mutate = (fn: (current: Project) => Project, record = true) => project && update(fn(clone(project)), record);
  const routeFallbackName = (route: SavedRoute) => `Unnamed route ${Math.max(1, routes.findIndex((item) => item.id === route.id) + 1)}`;
  const routeDisplayName = (route: SavedRoute) => route.name.trim() || routeFallbackName(route);
  const distanceForSourcePixels = (pixels: number | undefined, unit: Unit) => project && isFinitePositive(pixels)
    ? (pixels * mapScale(project)) / METERS_PER_UNIT[unit]
    : undefined;
  const populateCalibrationForm = (pixels: number | undefined, unit: Unit = project?.distanceUnit ?? "ft") => {
    const distance = distanceForSourcePixels(pixels, unit);
    setCalibrationForm({ distance: distance === undefined ? "" : String(Number(distance.toPrecision(8))), unit });
  };
  const focusRoute = (route: SavedRoute, openDrawer = true, vectorId?: string) => {
    setSelectedRouteId(route.id);
    setSelectedFeatureId(null);
    const nextVector = vectorId && route.steps.some((step) => step.vectorId === vectorId)
      ? project?.vectors.find((item) => item.id === vectorId)
      : undefined;
    const nextMode: CalibrationSourceMode = nextVector ? "segment" : "route";
    setCalibrationMode(nextMode);
    setSelectedVectorId(nextVector?.id ?? null);
    if (project) {
      const pixels = nextVector
        ? segmentPixelLength(nextVector, routeNodes(project))
        : routePixelLength(route, project.vectors, routeNodes(project));
      populateCalibrationForm(pixels, project.distanceUnit);
    }
    if (openDrawer) {
      const endpoints = routeEndpoints(route, project?.vectors ?? []);
      const endNode = endpoints ? nodeMap.get(endpoints.endId) : undefined;
      setSelectedId(isPoint(endNode) ? endNode.id : null);
      setSelectedRouteVertexId(endNode && !isPoint(endNode) ? endNode.id : null);
      setSurveyTab("routes");
      setActivePanel("survey");
    }
    setNotice(nextVector
      ? `${routeDisplayName(route)} segment selected as the calibration reference.`
      : `${routeDisplayName(route)} selected as the whole-route calibration reference.`);
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
  const undo = () => {
    if (!project || !undoStack.length) return;
    const previous = undoStack[undoStack.length - 1]; setUndoStack((items) => items.slice(0, -1)); setRedoStack((items) => [...items, clone(project)]); update(previous, false); setNotice("Undid last map edit.");
  };
  const redo = () => {
    if (!project || !redoStack.length) return;
    const next = redoStack[redoStack.length - 1]; setRedoStack((items) => items.slice(0, -1)); setUndoStack((items) => [...items, clone(project)]); update(next, false); setNotice("Restored map edit.");
  };
  const canvasPosition = (event: PointerEvent<Element>) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(canvasSize.width, (event.clientX - rect.left - pan.x) / zoom)), y: Math.max(0, Math.min(canvasSize.height, (event.clientY - rect.top - pan.y) / zoom)) };
  };
  const featurePointAt = (position: { x: number; y: number }): FeaturePoint => ({ id: id(), x: position.x, y: position.y });
  const snapRoutePoint = (current: Project, position: { x: number; y: number }): DraftRoutePoint => {
    const threshold = 18 / zoom;
    const nearbyNode = routeNodes(current)
      .map((node) => ({ node, distance: Math.hypot(node.x - position.x, node.y - position.y) }))
      .filter(({ distance }) => distance <= threshold)
      .sort((left, right) => left.distance - right.distance)[0]?.node;
    if (nearbyNode) return { x: nearbyNode.x, y: nearbyNode.y, nodeId: nearbyNode.id };

    const nodeById = new Map(routeNodes(current).map((node) => [node.id, node]));
    const projection = current.vectors.flatMap((vector) => {
      const start = nodeById.get(vector.fromId);
      const end = nodeById.get(vector.toId);
      if (!start || !end) return [];
      return [projectedPointOnSegment(position, start, end)];
    }).filter((candidate) => candidate.distance <= threshold).sort((left, right) => left.distance - right.distance)[0];
    return projection ? { x: projection.x, y: projection.y } : position;
  };
  const annotationOffsetFromElement = (element: HTMLElement, point: Point) => {
    const stageRect = stageRef.current!.getBoundingClientRect();
    const labelRect = (element.querySelector<HTMLElement>(".point-annotation-chip") ?? element).getBoundingClientRect();
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
  const moveRouteVertex = (current: Project, vertexId: string, x: number, y: number) => {
    const vertex = current.routeVertices.find((item) => item.id === vertexId); if (!vertex) return current;
    vertex.x = x; vertex.y = y;
    return synchronizeVectors(current);
  };
  const beginPointPlacement = () => {
    setRouteDraft(null);
    setRouteDraftPointer(null);
    replaceFeatureDraft(null);
    setFeatureDraftPointer(null);
    setFeatureModePickerOpen(false);
    setTool("point");
    setActivePanel(null);
    setSelectedId(null);
    setSelectedVectorId(null);
    setSelectedRouteId(null);
    setSelectedRouteVertexId(null);
    setSelectedFeatureId(null);
    setNotice("Place a field point on the map.");
  };
  const addPointOfInterest = (position: { x: number; y: number }) => {
    if (!project) return;
    setSelectedFeatureId(null);
    const snapped = snapRoutePoint(project, position);
    const existingPoint = snapped.nodeId ? project.waypoints.find((point) => point.id === snapped.nodeId) : undefined;
    if (existingPoint) {
      setSelectedId(existingPoint.id);
      setTool("select");
      setSurveyTab("points");
      setActivePanel("survey");
      setNotice(`${existingPoint.label} is already attached at that route location.`);
      return;
    }

    const pointId = snapped.nodeId ?? id();
    const label = nextPointLabel(project.waypoints);
    mutate((current) => {
      const promotedVertex = current.routeVertices.find((vertex) => vertex.id === pointId);
      current.routeVertices = current.routeVertices.filter((vertex) => vertex.id !== pointId);
      current.waypoints.push({ id: pointId, label, name: "", x: promotedVertex?.x ?? snapped.x, y: promotedVertex?.y ?? snapped.y });
      return reconcileRouteTopology(current);
    });
    setSelectedId(pointId);
    setSelectedRouteVertexId(null);
    setTool("select");
    setSurveyTab("points");
    setActivePanel("survey");
    setNotice(snapped.nodeId ? `${label} added by promoting the route vertex to a point of interest.` : `${label} added and attached to any route at that location.`);
  };
  const selectGeographicFeature = (featureId: string, openDrawer = true) => {
    setSelectedFeatureId(featureId);
    setSelectedId(null);
    setSelectedVectorId(null);
    setSelectedRouteId(null);
    setSelectedRouteVertexId(null);
    setTool("select");
    if (openDrawer) {
      setSurveyTab("features");
      setActivePanel("survey");
    }
  };
  const selectFloatingText = (textId: string, openDrawer = true) => {
    setSelectedFeatureId(textId);
    setSelectedId(null);
    setSelectedVectorId(null);
    setSelectedRouteId(null);
    setSelectedRouteVertexId(null);
    setTool("select");
    if (openDrawer) {
      setSurveyTab("features");
      setActivePanel("survey");
    }
  };
  const openFeatureModePicker = () => {
    setRouteDraft(null);
    setRouteDraftPointer(null);
    replaceFeatureDraft(null);
    setFeatureDraftPointer(null);
    setTool("select");
    setActivePanel(null);
    setFeatureModePickerOpen(true);
    setNotice("Choose a line-drawing mode or add floating text.");
  };
  const beginFloatingTextPlacement = () => {
    setRouteDraft(null);
    setRouteDraftPointer(null);
    replaceFeatureDraft(null);
    setFeatureDraftPointer(null);
    setFeatureModePickerOpen(false);
    setTool("text");
    setActivePanel(null);
    setSelectedId(null);
    setSelectedVectorId(null);
    setSelectedRouteId(null);
    setSelectedRouteVertexId(null);
    setSelectedFeatureId(null);
    setNotice("Click the map where the floating text should appear.");
  };
  const addFloatingText = (position: { x: number; y: number }) => {
    const textId = id();
    mutate((current) => {
      current.floatingTexts.push({ id: textId, text: "Text", x: position.x, y: position.y, size: DEFAULT_FLOATING_TEXT_SIZE, rotation: 0 });
      return current;
    });
    setTool("select");
    setSelectedFeatureId(textId);
    setSurveyTab("features");
    setActivePanel("survey");
    setNotice("Floating text added. Edit its words, size, and rotation in Features.");
  };
  const beginFeatureDrawing = (mode: GeographicFeatureMode, redrawFeatureId?: string) => {
    const redrawFeature = redrawFeatureId ? project?.geographicFeatures.find((feature) => feature.id === redrawFeatureId) : undefined;
    const draft = { mode, points: [], closed: redrawFeature?.closed ?? false, redrawFeatureId } satisfies FeatureDraft;
    setRouteDraft(null);
    setRouteDraftPointer(null);
    replaceFeatureDraft(draft);
    setFeatureDraftPointer(null);
    setFeatureModePickerOpen(false);
    setTool("feature");
    setActivePanel(null);
    setSelectedId(null);
    setSelectedVectorId(null);
    setSelectedRouteId(null);
    setSelectedRouteVertexId(null);
    setSelectedFeatureId(redrawFeatureId ?? null);
    setNotice(mode === "freehand" ? "Press and drag to sketch the feature. Release to finish." : `${GEOGRAPHIC_FEATURE_MODE_LABELS[mode]}: click each anchor, then Finish. Click the first anchor to close the loop.`);
  };
  const cancelFeatureDrawing = () => {
    replaceFeatureDraft(null);
    setFeatureDraftPointer(null);
    setFeatureModePickerOpen(false);
    setTool("select");
    setNotice("Map feature draft canceled. No project geometry changed.");
  };
  const undoFeatureDraftPoint = () => {
    reviseFeatureDraft((draft) => draft ? { ...draft, points: draft.points.slice(0, -1) } : null);
    setFeatureDraftPointer(null);
  };
  const commitFeatureDraft = (draft: FeatureDraft, closedOverride = draft.closed) => {
    if (!project) return;
    const capturedPoints = draft.mode === "freehand" ? simplifyFreehandPoints(draft.points, 1.5 / zoom) : draft.points.map((point) => ({ ...point }));
    const points = capturedPoints.filter((point, index) => index === 0 || Math.hypot(point.x - capturedPoints[index - 1].x, point.y - capturedPoints[index - 1].y) > 1e-6);
    const totalLength = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
    if (points.length < 2 || totalLength * zoom < 4) {
      replaceFeatureDraft(null);
      setFeatureDraftPointer(null);
      setTool("select");
      setNotice("Draw a longer feature before finishing.");
      return;
    }
    const closed = Boolean(closedOverride && points.length >= 3);
    const committedFeatureId = draft.redrawFeatureId ?? id();
    mutate((current) => {
      const existingIndex = draft.redrawFeatureId ? current.geographicFeatures.findIndex((feature) => feature.id === draft.redrawFeatureId) : -1;
      if (existingIndex >= 0) {
        const existing = current.geographicFeatures[existingIndex];
        current.geographicFeatures[existingIndex] = { ...existing, mode: draft.mode, points, closed };
      } else {
        current.geographicFeatures.push({
          id: committedFeatureId,
          name: "",
          mode: draft.mode,
          points,
          closed,
          style: { ...DEFAULT_GEOGRAPHIC_FEATURE_STYLE },
        });
      }
      return current;
    });
    replaceFeatureDraft(null);
    setFeatureDraftPointer(null);
    setFeatureModePickerOpen(false);
    setTool("select");
    setSelectedFeatureId(committedFeatureId);
    setSurveyTab("features");
    setActivePanel("survey");
    setNotice(draft.redrawFeatureId ? "Freehand geometry replaced; its name and style were preserved." : `${GEOGRAPHIC_FEATURE_MODE_LABELS[draft.mode]} feature added to the map.`);
  };
  const finishFeatureDrawing = () => {
    const draft = featureDraftRef.current;
    if (!draft || draft.mode === "freehand") return;
    commitFeatureDraft(draft);
  };
  finishFeatureDrawingRef.current = finishFeatureDrawing;
  const onStagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!project || event.button !== 0) return;
    if (drag.current) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, label")) return;
    if (tool === "select") { event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); drag.current = { kind: "pan", start: clone(project), x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); return; }
    if (tool === "reference" && project.reference.dataUrl && !project.reference.locked) { drag.current = { kind: "reference", start: clone(project), x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); return; }
    const position = canvasPosition(event);
    if (tool === "printArea") { event.preventDefault(); drag.current = { kind: "printAreaDraw", start: clone(project), x: event.clientX, y: event.clientY, point: position }; mutate((current) => { current.printArea = { x: position.x, y: position.y, width: 12, height: 12 }; return current; }, false); event.currentTarget.setPointerCapture(event.pointerId); return; }
    if (tool === "feature") {
      const draft = featureDraftRef.current;
      if (!draft || !event.isPrimary) return;
      event.preventDefault();
      if (draft.mode === "freehand") {
        const next = { ...draft, points: [featurePointAt(position)] };
        replaceFeatureDraft(next);
        drag.current = { kind: "featureFreehand", start: clone(project), x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const first = draft.points[0];
      if (first && draft.points.length >= 3 && Math.hypot(first.x - position.x, first.y - position.y) * zoom <= 16) {
        commitFeatureDraft(draft, true);
        return;
      }
      const previous = draft.points.at(-1);
      if (previous && Math.hypot(previous.x - position.x, previous.y - position.y) * zoom < 2) return;
      const next = { ...draft, points: [...draft.points, featurePointAt(position)] };
      replaceFeatureDraft(next);
      setFeatureDraftPointer(null);
      return;
    }
    if (tool === "coast" && project.shoreLocked) { setTool("select"); setNotice("The shoreline is locked. Unlock it to draw or adjust the coast."); return; }
    if (tool === "coast") { mutate((current) => { current.coastline.push({ id: id(), ...position }); return current; }); setNotice("Shoreline vertex added. Keep clicking to trace the coast."); return; }
    if (tool === "text") { addFloatingText(position); return; }
    if (tool === "route") {
      const snapped = snapRoutePoint(project, position);
      setRouteDraft((draft) => {
        const next = draft ?? { points: [], name: "" };
        const previous = next.points[next.points.length - 1];
        if (previous && (previous.nodeId && previous.nodeId === snapped.nodeId || Math.hypot(previous.x - snapped.x, previous.y - snapped.y) <= 1e-6)) return next;
        return { ...next, points: [...next.points, snapped] };
      });
      setRouteDraftPointer(snapped);
      return;
    }
    if (tool === "point") { addPointOfInterest(position); return; }
  };
  const onStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!project) return;
    if (tool === "route" && routeDraft) setRouteDraftPointer(snapRoutePoint(project, canvasPosition(event)));
    if (tool === "feature" && featureDraft?.mode !== "freehand" && featureDraft?.points.length) setFeatureDraftPointer(featurePointAt(canvasPosition(event)));
    if (!drag.current) return;
    const activeDrag = drag.current;
    if (activeDrag.kind === "pan") return;
    if (activeDrag.kind === "reference") { const dx = (event.clientX - activeDrag.x) / zoom; const dy = (event.clientY - activeDrag.y) / zoom; mutate((current) => { current.reference.x += dx; current.reference.y += dy; return current; }, false); activeDrag.x = event.clientX; activeDrag.y = event.clientY; return; }
    if (activeDrag.kind === "featureFreehand") {
      const draft = featureDraftRef.current;
      if (!draft || draft.mode !== "freehand") return;
      const position = canvasPosition(event);
      const previous = draft.points.at(-1);
      if (previous && Math.hypot(previous.x - position.x, previous.y - position.y) * zoom < 2) return;
      if (draft.points.length >= 2000) return;
      activeDrag.changed = true;
      replaceFeatureDraft({ ...draft, points: [...draft.points, featurePointAt(position)] });
      return;
    }
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
    if (activeDrag.kind === "canvasResize" && activeDrag.canvasSize && activeDrag.resizeHandle) {
      const resizesWidth = activeDrag.resizeHandle === "east" || activeDrag.resizeHandle === "southeast";
      const resizesHeight = activeDrag.resizeHandle === "south" || activeDrag.resizeHandle === "southeast";
      const minimumSize = minimumCanvasSizeForProject(activeDrag.start, activeDrag.canvasSize);
      const width = resizesWidth
        ? Math.min(MAX_CANVAS_DIMENSION, Math.max(minimumSize.width, Math.round(activeDrag.canvasSize.width + (event.clientX - activeDrag.x) / zoom)))
        : activeDrag.canvasSize.width;
      const height = resizesHeight
        ? Math.min(MAX_CANVAS_DIMENSION, Math.max(minimumSize.height, Math.round(activeDrag.canvasSize.height + (event.clientY - activeDrag.y) / zoom)))
        : activeDrag.canvasSize.height;
      const currentSize = normalizeCanvasSize(project.canvasSize);
      if (width === currentSize.width && height === currentSize.height) return;
      activeDrag.changed = width !== activeDrag.canvasSize.width || height !== activeDrag.canvasSize.height;
      mutate((current) => { current.canvasSize = { width, height }; current.printArea = normalizePrintArea(current.printArea, current.canvasSize); return current; }, false);
      return;
    }
    const position = canvasPosition(event);
    if (activeDrag.kind === "printAreaDraw" && activeDrag.point) { mutate((current) => { current.printArea = printAreaFromPoints(activeDrag.point!, position, normalizeCanvasSize(current.canvasSize)) ?? { x: activeDrag.point!.x, y: activeDrag.point!.y, width: 12, height: 12 }; return current; }, false); return; }
    if (activeDrag.kind === "printAreaAdjust" && activeDrag.area && activeDrag.point && activeDrag.handle) {
      const original = activeDrag.area;
      let next: PrintArea | undefined;
      if (activeDrag.handle === "move") {
        next = normalizePrintArea({ x: Math.max(0, Math.min(canvasSize.width - original.width, original.x + position.x - activeDrag.point.x)), y: Math.max(0, Math.min(canvasSize.height - original.height, original.y + position.y - activeDrag.point.y)), width: original.width, height: original.height }, canvasSize);
      } else {
        const left = activeDrag.handle.includes("w") ? position.x : original.x;
        const top = activeDrag.handle.includes("n") ? position.y : original.y;
        const right = activeDrag.handle.includes("e") ? position.x : original.x + original.width;
        const bottom = activeDrag.handle.includes("s") ? position.y : original.y + original.height;
        next = printAreaFromPoints({ x: left, y: top }, { x: right, y: bottom }, canvasSize);
      }
      if (next) mutate((current) => { current.printArea = next; return current; }, false);
      return;
    }
    if (activeDrag.kind === "feature" && activeDrag.id) {
      const dx = (event.clientX - activeDrag.x) / zoom;
      const dy = (event.clientY - activeDrag.y) / zoom;
      if (Math.hypot(dx, dy) <= 1e-6) return;
      activeDrag.changed = true;
      mutate((current) => {
        const featureIndex = current.geographicFeatures.findIndex((feature) => feature.id === activeDrag.id);
        if (featureIndex >= 0) current.geographicFeatures[featureIndex] = translateGeographicFeature(current.geographicFeatures[featureIndex], dx, dy, normalizeCanvasSize(current.canvasSize));
        return current;
      }, false);
      activeDrag.x = event.clientX;
      activeDrag.y = event.clientY;
      return;
    }
    if (activeDrag.kind === "floatingText" && activeDrag.id) {
      const dx = (event.clientX - activeDrag.x) / zoom;
      const dy = (event.clientY - activeDrag.y) / zoom;
      if (Math.hypot(dx, dy) <= 1e-6) return;
      activeDrag.changed = true;
      mutate((current) => {
        const textIndex = current.floatingTexts.findIndex((item) => item.id === activeDrag.id);
        if (textIndex >= 0) current.floatingTexts[textIndex] = translateFloatingText(current.floatingTexts[textIndex], dx, dy, normalizeCanvasSize(current.canvasSize));
        return current;
      }, false);
      activeDrag.x = event.clientX;
      activeDrag.y = event.clientY;
      return;
    }
    if (activeDrag.kind === "featureAnchor" && activeDrag.id && activeDrag.pointId) {
      const feature = project.geographicFeatures.find((candidate) => candidate.id === activeDrag.id);
      const anchor = feature?.points.find((point) => point.id === activeDrag.pointId);
      if (!anchor || Math.hypot(anchor.x - position.x, anchor.y - position.y) <= 1e-6) return;
      activeDrag.changed = true;
      mutate((current) => {
        const currentFeature = current.geographicFeatures.find((candidate) => candidate.id === activeDrag.id);
        const currentAnchor = currentFeature?.points.find((point) => point.id === activeDrag.pointId);
        if (currentAnchor) { currentAnchor.x = position.x; currentAnchor.y = position.y; }
        return current;
      }, false);
      return;
    }
    if (activeDrag.kind === "waypoint" && activeDrag.id) {
      const point = project.waypoints.find((item) => item.id === activeDrag.id);
      if (point && Math.hypot(point.x - position.x, point.y - position.y) > 1e-6) { activeDrag.changed = true; mutate((current) => movePoint(current, activeDrag.id!, position.x, position.y), false); }
    }
    if (activeDrag.kind === "routeVertex" && activeDrag.id) {
      const vertex = project.routeVertices.find((item) => item.id === activeDrag.id);
      if (vertex && Math.hypot(vertex.x - position.x, vertex.y - position.y) > 1e-6) { activeDrag.changed = true; mutate((current) => moveRouteVertex(current, activeDrag.id!, position.x, position.y), false); }
    }
    if (activeDrag.kind === "coast" && activeDrag.id) {
      const vertex = project.coastline.find((item) => item.id === activeDrag.id);
      if (vertex && Math.hypot(vertex.x - position.x, vertex.y - position.y) > 1e-6) {
        activeDrag.changed = true;
        mutate((current) => { const currentVertex = current.coastline.find((item) => item.id === activeDrag.id); if (currentVertex) Object.assign(currentVertex, position); return current; }, false);
      }
    }
  };
  const onStagePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !project) return;
    const activeDrag = drag.current;
    if (activeDrag.kind === "featureFreehand") {
      drag.current = null;
      const draft = featureDraftRef.current;
      if (event.type === "pointercancel") {
        replaceFeatureDraft(null);
        setFeatureDraftPointer(null);
        setTool("select");
        setNotice("Freehand gesture canceled. No feature was saved.");
        return;
      }
      if (!draft) return;
      const first = draft.points[0];
      const last = draft.points.at(-1);
      const closed = draft.closed || Boolean(first && last && draft.points.length >= 3 && Math.hypot(first.x - last.x, first.y - last.y) * zoom <= 16);
      commitFeatureDraft(draft, closed);
      return;
    }
    const original = activeDrag.start; const kind = activeDrag.kind; let changed = activeDrag.changed; drag.current = null;
    if (kind === "floatingText" && event.type === "pointercancel") {
      update(original, false);
      setNotice("Floating text move canceled.");
      return;
    }
    if (kind === "canvasResize") {
      setCanvasResizeActive(false);
      if (event.type === "pointercancel") {
        update(original, false);
        setNotice("Canvas resize canceled.");
        return;
      }
      const originalSize = normalizeCanvasSize(activeDrag.canvasSize ?? original.canvasSize);
      const finalSize = normalizeCanvasSize(project.canvasSize);
      changed = originalSize.width !== finalSize.width || originalSize.height !== finalSize.height;
      if (!changed) return;
    }
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
    if ((kind === "waypoint" || kind === "routeVertex" || kind === "feature" || kind === "featureAnchor" || kind === "floatingText" || kind === "coast") && !changed) return;
    if (kind === "waypoint" || kind === "routeVertex") mutate((current) => reconcileRouteTopology(current), false);
    if (kind !== "pan") { setUndoStack((items) => [...items.slice(-29), original]); setRedoStack([]); }
    if (kind === "printAreaDraw") { setTool("select"); setNotice("Print area set. Drag its center or corners to refine it, then print the selected area."); }
    if (kind === "annotation") setNotice("Label position saved. Use the point inspector to reset it.");
    if (kind === "feature") setNotice("Map feature moved.");
    if (kind === "featureAnchor") setNotice("Feature anchor moved.");
    if (kind === "floatingText") setNotice("Floating text moved.");
    if (kind === "canvasResize") setNotice(`Canvas resized to ${canvasSize.width} × ${canvasSize.height} px.`);
  };
  const onStageWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    autoFitRef.current = false;
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
  const startDrag = (event: PointerEvent<HTMLButtonElement>, kind: "waypoint" | "routeVertex" | "coast", itemId: string) => {
    event.stopPropagation(); if (!project || (kind === "coast" && project.shoreLocked)) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { kind, id: itemId, start: clone(project), x: event.clientX, y: event.clientY }; setSelectedId(kind === "waypoint" ? itemId : null); setSelectedFeatureId(null); setSelectedVectorId(null); if (kind !== "routeVertex") { setSelectedRouteId(null); setActivePanel(null); } if (kind !== "coast") setTool("select");
    setSelectedRouteVertexId(kind === "routeVertex" ? itemId : null);
  };
  const startFeatureDrag = (event: PointerEvent<SVGPathElement>, featureId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!project || tool !== "select" || event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind: "feature", id: featureId, start: clone(project), x: event.clientX, y: event.clientY };
    selectGeographicFeature(featureId);
  };
  const startFeatureAnchorDrag = (event: PointerEvent<HTMLButtonElement>, featureId: string, pointId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!project || event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind: "featureAnchor", id: featureId, pointId, start: clone(project), x: event.clientX, y: event.clientY };
    selectGeographicFeature(featureId, false);
  };
  const startFloatingTextDrag = (event: PointerEvent<HTMLButtonElement>, textId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!project || event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind: "floatingText", id: textId, start: clone(project), x: event.clientX, y: event.clientY };
    selectFloatingText(textId);
  };
  const nudgeFloatingText = (event: ReactKeyboardEvent<HTMLButtonElement>, textId: string) => {
    const direction: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    };
    const delta = direction[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const step = (event.shiftKey ? 10 : 1) / zoom;
    mutate((current) => {
      const textIndex = current.floatingTexts.findIndex((item) => item.id === textId);
      if (textIndex >= 0) current.floatingTexts[textIndex] = translateFloatingText(current.floatingTexts[textIndex], delta.x * step, delta.y * step, normalizeCanvasSize(current.canvasSize));
      return current;
    });
    selectFloatingText(textId, false);
    setNotice("Floating text nudged.");
  };
  const nudgeFeatureAnchor = (event: ReactKeyboardEvent<HTMLButtonElement>, featureId: string, pointId: string) => {
    const direction: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    };
    const delta = direction[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const step = (event.shiftKey ? 10 : 1) / zoom;
    mutate((current) => {
      const feature = current.geographicFeatures.find((candidate) => candidate.id === featureId);
      const point = feature?.points.find((candidate) => candidate.id === pointId);
      if (point) {
        point.x = Math.max(0, Math.min(canvasSize.width, point.x + delta.x * step));
        point.y = Math.max(0, Math.min(canvasSize.height, point.y + delta.y * step));
      }
      return current;
    });
    setNotice("Feature anchor nudged.");
  };
  const startAnnotationDrag = (event: PointerEvent<HTMLButtonElement>, point: Point, annotationKind: PointAnnotationKind) => {
    event.preventDefault(); event.stopPropagation();
    if (!project) return;
    const offset = point.labelOffsets?.[annotationKind] ?? annotationOffsetFromElement(event.currentTarget, point);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind: "annotation", id: point.id, annotationKind, offset, initialOffset: { ...offset }, hadOffset: Boolean(point.labelOffsets?.[annotationKind]), moved: false, changed: false, originX: event.clientX, originY: event.clientY, start: clone(project), x: event.clientX, y: event.clientY };
    setSelectedId(point.id); setSelectedVectorId(null); setSelectedRouteId(null); setSelectedFeatureId(null); setActivePanel(null); setTool("select");
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
    setSelectedId(point.id); setSelectedVectorId(null); setSelectedRouteId(null); setSelectedFeatureId(null); setActivePanel(null); setTool("select");
  };
  const startPrintAreaAdjust = (event: PointerEvent<HTMLButtonElement>, handle: PrintAreaHandle) => {
    event.preventDefault(); event.stopPropagation();
    if (!project?.printArea) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind: "printAreaAdjust", start: clone(project), x: event.clientX, y: event.clientY, point: canvasPosition(event), area: project.printArea, handle };
    setTool("select");
  };
  const startCanvasResize = (event: PointerEvent<HTMLButtonElement>, resizeHandle: CanvasResizeHandle) => {
    event.preventDefault(); event.stopPropagation();
    if (!project || tool !== "select") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind: "canvasResize", start: clone(project), x: event.clientX, y: event.clientY, canvasSize: { ...canvasSize }, resizeHandle };
    autoFitRef.current = false;
    setCanvasResizeActive(true);
  };
  const resizeCanvasWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>, resizeHandle: CanvasResizeHandle) => {
    if (!project) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const resizesWidth = resizeHandle === "east" || resizeHandle === "southeast";
    const resizesHeight = resizeHandle === "south" || resizeHandle === "southeast";
    const widthDirection = resizesWidth ? (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0) : 0;
    const heightDirection = resizesHeight ? (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0) : 0;
    if (!widthDirection && !heightDirection) return;
    const increment = event.shiftKey ? 100 : 25;
    const minimumSize = minimumCanvasSizeForProject(project, canvasSize);
    const next = {
      width: Math.min(MAX_CANVAS_DIMENSION, Math.max(minimumSize.width, canvasSize.width + widthDirection * increment)),
      height: Math.min(MAX_CANVAS_DIMENSION, Math.max(minimumSize.height, canvasSize.height + heightDirection * increment)),
    };
    if (next.width === canvasSize.width && next.height === canvasSize.height) return;
    mutate((current) => { current.canvasSize = next; current.printArea = normalizePrintArea(current.printArea, current.canvasSize); return current; });
    autoFitRef.current = false;
    setNotice(`Canvas resized to ${next.width} × ${next.height} px.`);
  };
  const toggleShoreLock = () => {
    if (!project) return;
    const willLock = !project.shoreLocked;
    mutate((current) => { current.shoreLocked = willLock; return current; });
    setTool("select");
    setNotice(willLock ? "Shoreline locked. Drawing tools are minimized." : "Shoreline unlocked. You can draw or adjust the coast again.");
  };
  const updateGeographicFeature = (featureId: string, transform: (feature: GeographicFeature) => GeographicFeature, record = false) => {
    mutate((current) => {
      const featureIndex = current.geographicFeatures.findIndex((feature) => feature.id === featureId);
      if (featureIndex >= 0) current.geographicFeatures[featureIndex] = transform(current.geographicFeatures[featureIndex]);
      return current;
    }, record);
  };
  const deleteGeographicFeature = (featureId: string) => {
    const feature = project?.geographicFeatures.find((candidate) => candidate.id === featureId);
    if (!feature || !window.confirm(`Delete “${feature.name.trim() || "Untitled feature"}” from this map?`)) return;
    mutate((current) => {
      current.geographicFeatures = current.geographicFeatures.filter((candidate) => candidate.id !== featureId);
      return current;
    });
    setSelectedFeatureId(null);
    setNotice("Map feature deleted.");
  };
  const beginFloatingTextEdit = () => {
    const current = projectRef.current ?? project;
    if (current && !floatingTextEditStart.current) floatingTextEditStart.current = clone(current);
  };
  const finishFloatingTextEdit = (textId: string) => {
    const original = floatingTextEditStart.current;
    floatingTextEditStart.current = null;
    const current = projectRef.current ?? project;
    if (!original || !current || original.id !== current.id) return;
    const before = original.floatingTexts.find((item) => item.id === textId);
    const after = current.floatingTexts.find((item) => item.id === textId);
    if (floatingTextEqual(before, after)) return;
    setUndoStack((items) => [...items.slice(-29), original]);
    setRedoStack([]);
  };
  const updateFloatingText = (textId: string, transform: (item: FloatingText) => FloatingText, record = false) => {
    const current = projectRef.current ?? project;
    if (!current) return;
    const textIndex = current.floatingTexts.findIndex((item) => item.id === textId);
    if (textIndex < 0) return;
    const nextItem = transform({ ...current.floatingTexts[textIndex] });
    if (floatingTextEqual(current.floatingTexts[textIndex], nextItem)) return;
    if (!record) {
      if (!floatingTextEditStart.current) floatingTextEditStart.current = clone(current);
      setRedoStack([]);
    }
    const next = clone(current);
    next.floatingTexts[textIndex] = nextItem;
    update(next, record);
  };
  const deleteFloatingText = (textId: string) => {
    const item = project?.floatingTexts.find((candidate) => candidate.id === textId);
    if (!item || !window.confirm(`Delete “${item.text.split("\n")[0] || "Text"}” from this map?`)) return;
    mutate((current) => {
      current.floatingTexts = current.floatingTexts.filter((candidate) => candidate.id !== textId);
      return current;
    });
    setSelectedFeatureId(null);
    setNotice("Floating text deleted.");
  };
  const redrawFreehandFeature = (featureId: string) => beginFeatureDrawing("freehand", featureId);
  const selectVector = (vector: Vector) => {
    setCalibrationMode("segment");
    setSelectedVectorId(vector.id);
    setSelectedId(null);
    setSelectedRouteVertexId(null);
    setSelectedFeatureId(null);
    const route = routeForVector(routes, vector.id);
    setSelectedRouteId(route?.id ?? null);
    setSurveyTab("routes");
    setActivePanel("survey");
    populateCalibrationForm(project ? segmentPixelLength(vector, routeNodes(project)) : undefined, project?.distanceUnit ?? vector.unit);
    setNotice(route ? `${routeDisplayName(route)} selected. The clicked segment remains the calibration reference.` : "Route segment selected for calibration.");
  };
  const changeCalibrationMode = (mode: CalibrationSourceMode) => {
    setCalibrationMode(mode);
    if (!project) return;
    if (mode === "route") {
      const route = selectedRoute ?? routes[0];
      if (route) focusRoute(route, false);
      else {
        setSelectedRouteId(null);
        setSelectedVectorId(null);
        populateCalibrationForm(undefined, project.distanceUnit);
      }
      return;
    }
    const vector = selectedVector
      ?? selectedRoute?.steps.map((step) => project.vectors.find((candidate) => candidate.id === step.vectorId)).find(Boolean)
      ?? project.vectors[0];
    if (vector) selectVector(vector);
    else {
      setSelectedVectorId(null);
      populateCalibrationForm(undefined, project.distanceUnit);
    }
  };
  const beginRouteDrawing = (extension?: { route: SavedRoute; at: "start" | "end" }, startNode?: RouteNode) => {
    if (!project) return;
    let points: DraftRoutePoint[] = startNode ? [{ x: startNode.x, y: startNode.y, nodeId: startNode.id }] : [];
    if (extension) {
      const endpoints = routeEndpoints(extension.route, project.vectors);
      const nodeId = extension.at === "start" ? endpoints?.startId : endpoints?.endId;
      const node = nodeId ? nodeMap.get(nodeId) : undefined;
      if (!node || endpoints?.closed) { setNotice("Choose an open route endpoint to extend."); return; }
      points = [{ x: node.x, y: node.y, nodeId: node.id }];
    }
    setRouteDraft({ points, name: extension?.route.name ?? "", extendRouteId: extension?.route.id, extendAt: extension?.at });
    setRouteDraftPointer(null);
    replaceFeatureDraft(null);
    setFeatureDraftPointer(null);
    setFeatureModePickerOpen(false);
    setTool("route");
    setActivePanel(null);
    setSelectedId(null);
    setSelectedRouteId(extension?.route.id ?? null);
    setSelectedVectorId(null);
    setSelectedRouteVertexId(null);
    setSelectedFeatureId(null);
    setNotice(extension ? `Drawing from the ${extension.at} of ${routeDisplayName(extension.route)}. Click vertices, then Finish.` : "Draw a route: click each vertex, then Finish. Every crossing becomes a junction.");
  };
  const cancelRouteDrawing = () => {
    setRouteDraft(null);
    setRouteDraftPointer(null);
    setTool("select");
    setNotice("Route draft canceled. No map geometry changed.");
  };
  const undoRouteDraftPoint = () => {
    setRouteDraft((draft) => {
      if (!draft) return null;
      const minimum = draft.extendRouteId ? 1 : 0;
      return draft.points.length > minimum ? { ...draft, points: draft.points.slice(0, -1) } : draft;
    });
  };
  const finishRouteDrawing = () => {
    if (!project || !routeDraft || routeDraft.points.length < 2) { setNotice("Add at least two distinct route vertices before finishing."); return; }
    const usablePoints = routeDraft.points.filter((point, index, points) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 1e-6);
    if (usablePoints.length < 2) { setNotice("A route needs at least one visible segment."); return; }
    let finishedRouteId = routeDraft.extendRouteId ?? id();
    let firstVectorId = "";
    mutate((current) => {
      const resolvedNodeIds = usablePoints.map((point) => {
        if (point.nodeId && routeNodes(current).some((node) => node.id === point.nodeId)) return point.nodeId;
        const vertex = { id: id(), x: point.x, y: point.y };
        current.routeVertices.push(vertex);
        return vertex.id;
      });
      const newVectors = resolvedNodeIds.slice(1).map((toId, index) => ({ id: id(), fromId: resolvedNodeIds[index], toId, bearing: 0, distance: 0, unit: current.distanceUnit } satisfies Vector));
      firstVectorId = newVectors[0]?.id ?? "";
      current.vectors.push(...newVectors);
      current.routes ??= [];
      const steps = newVectors.map((vector) => ({ vectorId: vector.id, reversed: false }));
      const routeIndex = routeDraft.extendRouteId ? current.routes.findIndex((route) => route.id === routeDraft.extendRouteId) : -1;
      if (routeIndex >= 0) {
        const route = current.routes[routeIndex];
        const prepended = [...steps].reverse().map((step) => ({ ...step, reversed: true }));
        current.routes[routeIndex] = routeDraft.extendAt === "start"
          ? { ...route, steps: prepended.concat(route.steps) }
          : { ...route, steps: route.steps.concat(steps) };
        finishedRouteId = route.id;
      } else {
        current.routes.push({ id: finishedRouteId, name: routeDraft.name.trim(), steps });
      }
      return reconcileRouteTopology(current);
    });
    setRouteDraft(null);
    setRouteDraftPointer(null);
    setTool("select");
    setSelectedRouteId(finishedRouteId);
    setSelectedVectorId(firstVectorId || null);
    setCalibrationMode(firstVectorId ? "segment" : "route");
    setSurveyTab("routes");
    setActivePanel("survey");
    setNotice(routeDraft.extendRouteId ? "Route extended. New crossings were connected automatically." : "Route created. New crossings were connected automatically.");
  };
  const calibrateMap = () => {
    if (!project) return;
    const distance = Number(calibrationForm.distance);
    if (!isFinitePositive(distance)) {
      setNotice(`Enter a positive known ${calibrationMode === "route" ? "route" : "segment"} distance.`);
      return;
    }
    const sourcePixels = calibrationMode === "route" && selectedRoute
      ? routePixelLength(selectedRoute, project.vectors, routeNodes(project))
      : calibrationMode === "segment" && selectedVector
        ? segmentPixelLength(selectedVector, routeNodes(project))
        : undefined;
    const nextScale = metersPerPixel(distance, calibrationForm.unit, sourcePixels ?? 0);
    if (!nextScale) {
      setNotice(`Choose a ${calibrationMode === "route" ? "route" : "segment"} with complete, visible length to calibrate the map.`);
      return;
    }
    if (calibrationMode === "route" && selectedRoute) {
      mutate((current) => {
        current.calibration = { routeId: selectedRoute.id, distance, unit: calibrationForm.unit, metersPerPixel: nextScale };
        return synchronizeVectors(current);
      });
      setNotice(`Map scale calibrated from ${routeDisplayName(selectedRoute)} at ${formatNumber(distance)} ${calibrationForm.unit}.`);
      return;
    }
    if (calibrationMode === "segment" && selectedVector) {
      mutate((current) => {
        current.calibration = { vectorId: selectedVector.id, distance, unit: calibrationForm.unit, metersPerPixel: nextScale };
        return synchronizeVectors(current);
      });
      setNotice(`Map scale calibrated from the selected segment at ${formatNumber(distance)} ${calibrationForm.unit}.`);
    }
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
  const deletePoint = (pointId: string) => {
    if (!project) return;
    const point = project.waypoints.find((item) => item.id === pointId);
    if (!point) return;
    const attached = project.vectors.some((vector) => vector.fromId === point.id || vector.toId === point.id);
    if (attached) { setPendingDeletePointId(point.id); return; }
    if (!window.confirm(`Delete point of interest ${point.label}?`)) return;
    mutate((current) => {
      current.waypoints = current.waypoints.filter((item) => item.id !== point.id);
      return reconcileRouteTopology(current);
    });
    setSelectedId((current) => current === point.id ? null : current);
    setNotice("Point of interest removed.");
  };
  const removePointPreservingRoutes = (pointId: string) => {
    const point = project?.waypoints.find((item) => item.id === pointId);
    if (!point) return;
    mutate((current) => {
      const removed = current.waypoints.find((item) => item.id === pointId);
      if (!removed) return current;
      current.waypoints = current.waypoints.filter((item) => item.id !== pointId);
      current.routeVertices.push({ id: removed.id, x: removed.x, y: removed.y });
      return reconcileRouteTopology(current);
    });
    setPendingDeletePointId(null);
    setSelectedId(null);
    setNotice(`${point.label} removed as a point of interest; its route junction was preserved.`);
  };
  const removePointAndRouteLegs = (pointId: string) => {
    const point = project?.waypoints.find((item) => item.id === pointId);
    if (!point) return;
    mutate((current) => {
      current.waypoints = current.waypoints.filter((item) => item.id !== pointId);
      current.vectors = current.vectors.filter((vector) => vector.fromId !== pointId && vector.toId !== pointId);
      current.routes = normalizeRoutes(routeNodes(current), current.vectors, current.routes, { createId: id });
      return reconcileRouteTopology(current);
    });
    setPendingDeletePointId(null);
    setSelectedId(null);
    setSelectedVectorId(null);
    setSelectedRouteId(null);
    setNotice(`${point.label} and its incident route legs were removed.`);
  };
  const deleteSelectedRoute = () => {
    if (!project || !selectedRoute || !window.confirm(`Delete the entire route “${routeDisplayName(selectedRoute)}”?`)) return;
    mutate((current) => {
      const result = deleteSavedRoute(current.waypoints, current.routeVertices, current.vectors, current.routes ?? [], selectedRoute.id, { epsilon: 1e-6, createId: id });
      return applyRouteEditResult(current, result);
    });
    setSelectedRouteId(null); setSelectedVectorId(null); setSelectedRouteVertexId(null);
    setNotice("Route deleted. Shared junctions used by other routes were retained.");
  };
  const deleteSelectedSegment = () => {
    if (!project || !selectedVector || !window.confirm("Delete this route leg? The affected ordered route will be normalized.")) return;
    mutate((current) => {
      const result = deleteRouteSegment(current.waypoints, current.routeVertices, current.vectors, current.routes ?? [], selectedVector.id, { epsilon: 1e-6, createId: id });
      return applyRouteEditResult(current, result);
    });
    setSelectedVectorId(null); setSelectedRouteVertexId(null);
    setNotice("Route leg deleted and affected routes normalized.");
  };
  const insertSelectedSegmentVertex = () => {
    if (!project || !selectedVector) return;
    let vertexId: string | undefined;
    mutate((current) => {
      const result = insertRouteMidpoint(current.waypoints, current.routeVertices, current.vectors, current.routes ?? [], selectedVector.id, { epsilon: 1e-6, createId: id });
      if (result.ok) vertexId = result.nodeId;
      return applyRouteEditResult(current, result);
    });
    setSelectedRouteVertexId(vertexId ?? null);
    setSelectedVectorId(null);
    setNotice("Route vertex inserted. Drag its handle to reshape the route.");
  };
  const removeSelectedRouteVertex = () => {
    if (!project || !selectedRouteVertex) return;
    const incident = project.vectors.filter((vector) => vector.fromId === selectedRouteVertex.id || vector.toId === selectedRouteVertex.id);
    const owningRoutes = routes.filter((route) => routePointIds(route, project.vectors).includes(selectedRouteVertex.id));
    if (incident.length > 2 || owningRoutes.length > 1) { setNotice("This is a shared multi-route junction. Remove its incident route legs before deleting it."); return; }
    if (incident.length === 1) {
      const vectorId = incident[0].id;
      mutate((current) => {
        const result = deleteRouteSegment(current.waypoints, current.routeVertices, current.vectors, current.routes ?? [], vectorId, { epsilon: 1e-6, createId: id });
        return applyRouteEditResult(current, result);
      });
      setSelectedRouteVertexId(null); setSelectedVectorId(null);
      setNotice("Endpoint leg deleted.");
      return;
    }
    if (incident.length !== 2 || owningRoutes.length !== 1) { setNotice("Only a simple degree-two route vertex or endpoint can be deleted."); return; }
    let retainedVectorId: string | null = null;
    mutate((current) => {
      const result = collapseRouteVertex(current.waypoints, current.routeVertices, current.vectors, current.routes ?? [], selectedRouteVertex.id, { epsilon: 1e-6, createId: id });
      if (result.ok) retainedVectorId = result.vectors.find((vector) => incident.some((item) => item.id === vector.id))?.id ?? null;
      return applyRouteEditResult(current, result);
    });
    setSelectedRouteVertexId(null); setSelectedVectorId(retainedVectorId);
    setNotice("Simple route vertex collapsed into one straight segment.");
  };
  const deleteSelected = () => { if (selected) deletePoint(selected.id); };
  const onReferenceUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !project) return;
    const reader = new FileReader(); reader.onload = () => mutate((current) => { current.reference.frame = current.reference.dataUrl && current.reference.frame ? current.reference.frame : { ...normalizeCanvasSize(current.canvasSize) }; current.reference.dataUrl = String(reader.result); current.reference.visible = true; return current; }); reader.readAsDataURL(file); event.target.value = "";
  };
  const changeDistanceUnit = (unit: Unit) => mutate((current) => { current.distanceUnit = unit; return synchronizeVectors(current); }, false);
  const setVisualScaleStopZoom = (value: number) => mutate((current) => ({ ...current, visualScaleStopZoom: normalizeVisualScaleStopZoom(value) }));
  const setExportSetting = (setting: ExportToggleKey, value: boolean) => mutate((current) => { current.exportSettings = { ...normalizeExportSettings(current.exportSettings), [setting]: value }; return current; }, false);
  const setNamePlacement = (namePlacement: NamePlacement) => mutate((current) => { current.exportSettings = { ...normalizeExportSettings(current.exportSettings), namePlacement }; return current; }, false);
  const applyExportPreset = (preset: "clean" | "full") => mutate((current) => {
    current.exportSettings = {
      ...(preset === "clean" ? CLEAN_CHART_EXPORT_SETTINGS : FULL_DETAIL_EXPORT_SETTINGS),
      namePlacement: normalizeExportSettings(current.exportSettings).namePlacement,
    };
    return current;
  }, false);
  const openProject = (next: Project) => { projectRef.current = next; setProject(next); autoFitRef.current = true; window.requestAnimationFrame(fitMapToStage); };
  const newProject = () => { const next = emptyProject("New dive site"); openProject(next); setProjects((items) => [next, ...items]); setSelectedId(null); setSelectedVectorId(null); setSelectedRouteId(null); setSelectedRouteVertexId(null); setSelectedFeatureId(null); setRouteDraft(null); replaceFeatureDraft(null); setFeatureDraftPointer(null); setFeatureModePickerOpen(false); setUndoStack([]); setRedoStack([]); void persistProject(next); setNotice("New project created locally."); };
  const duplicateProject = () => { if (!project) return; const next = clone(project); next.id = id(); next.title = `${project.title} copy`; openProject(next); setProjects((items) => [next, ...items]); void persistProject(next); setNotice("Project duplicated locally."); };
  const deleteProject = () => { if (!project || !window.confirm(`Delete “${project.title}” from this browser?`)) return; void removeProjectFromStore(project.id); const remaining = projects.filter((item) => item.id !== project.id); const next = remaining[0] ?? emptyProject("New dive site"); setProjects(remaining.length ? remaining : [next]); openProject(next); setSelectedId(null); setSelectedVectorId(null); setSelectedRouteId(null); setSelectedRouteVertexId(null); setSelectedFeatureId(null); setRouteDraft(null); replaceFeatureDraft(null); setFeatureDraftPointer(null); setFeatureModePickerOpen(false); if (!remaining.length) void persistProject(next); setNotice("Local project deleted."); };
  const exportBackup = () => { if (!project) return; const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "dive-map"}.json`; link.click(); URL.revokeObjectURL(link.href); setNotice("Editable project backup downloaded."); };
  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const raw = JSON.parse(String(reader.result)) as StoredProject; if ((raw.version !== 1 && raw.version !== 2) || !Array.isArray(raw.waypoints)) throw new Error("Unsupported backup"); const imported = normalizeProject(raw); imported.id = id(); imported.title = `${imported.title || "Imported dive site"} (imported)`; openProject(imported); setProjects((items) => [imported, ...items]); void persistProject(imported); setNotice(`Project v${raw.version} backup imported and normalized to v2.`); } catch { setNotice("That file is not a compatible dive-map backup."); } }; reader.readAsText(file); event.target.value = "";
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
      return reconcileRouteTopology(current);
    });
    setCaptureImportReview(null);
    setCaptureConflictIds(new Set());
    setNotice(`Merged ${captureImportReview.additions.length} new point${captureImportReview.additions.length === 1 ? "" : "s"}${captureConflictIds.size ? ` and ${captureConflictIds.size} selected field update${captureConflictIds.size === 1 ? "" : "s"}` : ""}. Points landing on routes were attached automatically.`);
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
  const exportSettings = normalizeExportSettings(project.exportSettings);
  const namePlacement: NamePlacement = exportSettings.namePlacement === "smartCallouts" ? "smartCallouts" : "asPositioned";
  const matchCurrentMap = namePlacement === "asPositioned";
  const printSettings = matchCurrentMap
    ? resolveMapViewExportSettings({
        reference: Boolean(project.reference.dataUrl && project.reference.visible),
        shoreline: visibleLayers.shoreline,
        geographicFeatures: visibleLayers.geographicFeatures,
        geographicFeatureLabels: visibleLayers.geographicFeatureLabels,
        floatingText: visibleLayers.floatingText,
        routes: visibleLayers.routes,
        routeLabels: visibleLayers.routeLabels,
        routeNameLabels: visibleLayers.routeNameLabels,
        pointNames: visibleLayers.pointNames,
        names: visibleLayers.names,
        depths: visibleLayers.depths,
        mapFurniture: visibleLayers.mapFurniture,
      }, exportSettings.pointTable)
    : effectiveExportSettings(exportSettings);
  const printArea = project.printArea;
  const printPoints = project.waypoints.filter((point) => pointInPrintArea(point, printArea));
  const printPointTableChunks = printPoints.length > 20
    ? Array.from({ length: Math.ceil(printPoints.length / 20) }, (_, index) => printPoints.slice(index * 20, index * 20 + 20))
    : [printPoints];
  const printSource: PrintSource = printArea ?? { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height };
  const smartNamePoints = printSettings.fullPointNames ? printPoints.filter(hasDescriptiveName) : [];
  const smartCalloutsRequested = namePlacement === "smartCallouts" && smartNamePoints.length > 0;
  const printFrame: PrintRect = PRINT_CHART_FRAME;
  const basePrintViewport = printViewportFor("map");
  const rightRailViewport = printViewportFor("rightRail");
  const dualRailViewport = printViewportFor("dualRail");
  const createSmartCalloutCandidate = (viewport: PrintViewport) => {
    const projection = createPrintProjection(printSource, viewport);
    const points = smartNamePoints.map((point) => ({
      id: point.id,
      text: printSettings.pointNames ? `${point.label} · ${point.name!.trim()}` : point.name!.trim(),
      x: projection.originX + (point.x - printSource.x) * projection.scale,
      y: projection.originY + (point.y - printSource.y) * projection.scale,
    }));
    const layout = layoutPrintCallouts({
      frame: printFrame,
      mapViewport: viewport,
      railWidth: PRINT_CALLOUT_RAIL_WIDTH,
      points,
      metrics: {
        railGap: PRINT_CALLOUT_GAP,
        fontSize: PRINT_PRIMARY_TEXT_SIZE,
        characterWidth: 7.3,
        lineHeight: 14,
        paddingX: 5,
        paddingY: 4,
      },
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
  const activePrintViewport = smartCalloutCandidate?.viewport ?? basePrintViewport;
  const printProjection = smartCalloutCandidate?.projection ?? createPrintProjection(printSource, activePrintViewport);
  const effectivePrintScale = printProjection.scale;
  const exactPrintClip = matchCurrentMap ? exactPrintClipGeometry(printSource, printProjection) : null;
  const printMapViewport = exactPrintClip?.viewport ?? activePrintViewport;
  const printCanvasOffsetX = exactPrintClip?.canvasOffsetX ?? printProjection.canvasOffsetX;
  const printCanvasOffsetY = exactPrintClip?.canvasOffsetY ?? printProjection.canvasOffsetY;
  function clampPrintLabelAnchor<T extends { x: number; y: number }>(anchor: T, horizontalPixels = 84, verticalPixels = 24): T {
    const insetX = Math.min(printSource.width / 2, horizontalPixels / effectivePrintScale);
    const insetY = Math.min(printSource.height / 2, verticalPixels / effectivePrintScale);
    return {
      ...anchor,
      x: Math.min(printSource.x + printSource.width - insetX, Math.max(printSource.x + insetX, anchor.x)),
      y: Math.min(printSource.y + printSource.height - insetY, Math.max(printSource.y + insetY, anchor.y)),
    };
  }
  const pointSymbolScale = normalizePointSymbolScale(project.pointSymbolScale);
  const smartCalloutSymbolSize = { width: 24 * pointSymbolScale, height: 18 * pointSymbolScale };
  const printBar = chooseScaleBar(mapScale(project), METERS_PER_UNIT[project.distanceUnit], effectivePrintScale);
  const printMapDisplayStyle = {
    "--print-primary-text-size": `${PRINT_PRIMARY_TEXT_SIZE / effectivePrintScale}px`,
    "--print-secondary-text-size": `${PRINT_SECONDARY_TEXT_SIZE / effectivePrintScale}px`,
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
    "--print-annotation-max-width": `${150 / effectivePrintScale}px`,
    "--print-point-marker-size": `${5 / effectivePrintScale}px`,
    "--print-point-symbol-size": `${24 * pointSymbolScale / effectivePrintScale}px`,
    "--print-water-label-left": `${printSource.x + 12 / effectivePrintScale}px`,
    "--print-water-label-top": `${printSource.y + 14 / effectivePrintScale}px`,
    "--print-water-label-width": `${Math.max(180, activePrintViewport.width - 78) / effectivePrintScale}px`,
  } as CSSProperties;
  const printStageStyle = {
    "--print-map-left": `${printMapViewport.x}px`,
    "--print-map-top": `${printMapViewport.y}px`,
    "--print-map-width": `${printMapViewport.width}px`,
    "--print-map-height": `${printMapViewport.height}px`,
    "--print-map-right": `${PRINT_CHART_FRAME.width - printMapViewport.x - printMapViewport.width}px`,
    "--print-map-bottom": `${PRINT_CHART_FRAME.height - printMapViewport.y - printMapViewport.height}px`,
    "--print-canvas-offset-x": `${printCanvasOffsetX}px`,
    "--print-canvas-offset-y": `${printCanvasOffsetY}px`,
    "--print-map-scale": String(effectivePrintScale),
    "--print-scale-bar": `${printBar.printedPixels}px`,
  } as CSSProperties;
  const prepareAndPrint = async () => {
    if (smartCalloutOverflowIds.length || isPreparingPrint) return;
    const previousTitle = document.title;
    setIsPreparingPrint(true);
    document.title = printDocumentTitle(project.title);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await waitForPrintImages(document.querySelector(".workspace") ?? document);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      window.print();
    } finally {
      document.title = previousTitle;
      setIsPreparingPrint(false);
    }
  };
  const exportClass = (visible: boolean) => visible ? "" : " export-hidden";
  const includeMapPrintAnchor = (point: { x: number; y: number }) => matchCurrentMap || pointInPrintArea(point, printArea);
  const annotationText = (point: Point, annotationKind: PointAnnotationKind) => {
    if (annotationKind === "pointName") return point.label;
    if (annotationKind === "name") return point.name?.trim() ?? "";
    return point.depth === undefined ? "" : `${formatNumber(point.depth)} ${project.depthUnit}`;
  };
  const printAnnotationBlockHeight = (annotationKind: PointAnnotationKind, text: string) => {
    const lines = annotationKind === "name" ? Math.max(1, Math.ceil(text.length / 20)) : 1;
    return lines * 14 + 3;
  };
  const annotationScreenVisible = (annotationKind: PointAnnotationKind) => annotationKind === "pointName" ? visibleLayers.pointNames : annotationKind === "name" ? visibleLayers.names : visibleLayers.depths;
  const annotationPrintVisible = (point: Point, annotationKind: PointAnnotationKind) => {
    const enabled = annotationKind === "pointName" ? printSettings.pointNames : annotationKind === "name" ? printSettings.fullPointNames : printSettings.depths;
    if (!enabled || !includeMapPrintAnchor(point)) return false;
    return !(smartCalloutsActive && smartCalloutPointIds.has(point.id) && (annotationKind === "pointName" || annotationKind === "name"));
  };
  const annotationVisibilityClass = (point: Point, annotationKind: PointAnnotationKind) => `${annotationScreenVisible(annotationKind) ? "" : " screen-hidden"}${exportClass(annotationPrintVisible(point, annotationKind))}`;
  const manualAnnotations = project.waypoints.flatMap((point) => POINT_ANNOTATION_KINDS.flatMap((annotationKind) => {
    const offset = point.labelOffsets?.[annotationKind];
    const text = annotationText(point, annotationKind);
    return offset && text ? [{ point, annotationKind, offset, text }] : [];
  }));
  const routeSymbolPoints = project.waypoints.filter((point) => point.symbol);
  const renderAnnotationChip = (annotationKind: PointAnnotationKind, text: string) => <span className={`point-annotation-chip point-annotation-${annotationKind}${annotationKind === "name" && !visibleLayers.pointNames ? " screen-primary-name" : ""}${annotationKind === "name" && !printSettings.pointNames ? " print-primary-name" : ""}`}>{text}</span>;
  const routeMembershipsForPoint = (pointId: string) => routes.flatMap((route) => {
    const routeNodeIds = routePointIds(route, project.vectors);
    const pointIds = routeNodeIds.filter((nodeId) => pointMap.has(nodeId));
    const pointIndex = pointIds.indexOf(pointId);
    return pointIndex >= 0 ? [{
      route,
      pointIndex,
      atRouteStart: routeNodeIds[0] === pointId,
      atRouteEnd: routeNodeIds.at(-1) === pointId,
    }] : [];
  });
  const filteredPoints = project.waypoints.filter((point) => {
    const named = hasDescriptiveName(point);
    if (pointFilter === "named" && !named) return false;
    if (pointFilter === "unnamed" && named) return false;
    if (!deferredPointSearch) return true;
    return `${point.label} ${point.name ?? ""}`.toLowerCase().includes(deferredPointSearch);
  });
  const selectedRoutePointIds = selectedRoute ? routePointIds(selectedRoute, project.vectors) : [];
  const selectedRouteVertexIds = [...new Set(selectedRoutePointIds.filter((nodeId) => project.routeVertices.some((vertex) => vertex.id === nodeId)))];
  const selectedRouteEndpoints = selectedRoute ? routeEndpoints(selectedRoute, project.vectors) : undefined;
  const selectedRoutePath = selectedRoute && selectedRoutePointIds.length >= 2
    ? routePathData({ key: selectedRoute.id, pointIds: selectedRoutePointIds, closed: Boolean(selectedRouteEndpoints?.closed) }, nodeMap)
    : "";
  const routeLabelAnchors = routes.flatMap((route) => {
    const nodes = routeNodes(project);
    const screen = routeLabelAnchor(route, nodes, project.vectors);
    const print = matchCurrentMap ? screen : routeLabelAnchor(route, nodes, project.vectors, printArea);
    return screen ? [{ route, screen, print }] : [];
  });
  const geographicFeatureLabels = project.geographicFeatures.flatMap((feature) => {
    const name = feature.name.trim();
    const anchor = name ? geographicFeatureLabelAnchor(feature) : undefined;
    return anchor ? [{ feature, name, anchor }] : [];
  });
  const printFeatureLabelBelow = (anchor: NonNullable<ReturnType<typeof geographicFeatureLabelAnchor>>, index: number) => index % 2 === 0
    || anchor.y > printSource.y + printSource.height - 80 / effectivePrintScale;
  const appendixNodeLabels = new Map<string, string>([
    ...project.waypoints.map((point) => [point.id, point.label] as [string, string]),
    ...project.routeVertices.map((vertex, index) => [vertex.id, `Route vertex ${index + 1}`] as [string, string]),
  ]);
  const routeLegRows = buildRouteLegRows(routes, project.vectors, appendixNodeLabels);
  const usedSymbolLegend = printSettings.pointMarkers ? buildUsedSymbolLegend(printPoints) : [];
  const routeEditor = (openDrawerForSegment: boolean) => <div className="route-editor">
    <div className="survey-route-list" aria-label="Routes">
      {routes.map((route, index) => {
        const endpoints = routeEndpoints(route, project.vectors);
        const total = distanceForSourcePixels(routePixelLength(route, project.vectors, routeNodes(project)), project.distanceUnit);
        return <button className={selectedRoute?.id === route.id ? "active" : ""} key={route.id} onClick={() => focusRoute(route, openDrawerForSegment)}><span>{index + 1}</span><b>{routeDisplayName(route)}</b><small>{total === undefined ? "Incomplete" : `${formatNumber(total)} ${project.distanceUnit}`} · {route.steps.length} seg</small><em>{endpoints ? `${nodeLabel(nodeMap.get(endpoints.startId))} → ${nodeLabel(nodeMap.get(endpoints.endId))}` : "Incomplete"}</em></button>;
      })}
      {!routes.length && <div className="empty-route-list"><b>No routes yet</b><span>Choose Draw route, then click each bend or connection on the map.</span></div>}
    </div>
    {selectedRoute ? <>
      <RouteNameEditor key={`${selectedRoute.id}:${selectedRoute.name}`} route={selectedRoute} fallback={routeFallbackName(selectedRoute)} onCommit={(name) => commitRouteName(selectedRoute.id, name)}/>
      <dl className="route-order-summary">
        <div><dt>Start</dt><dd>{selectedRouteEndpoints ? nodeLabel(nodeMap.get(selectedRouteEndpoints.startId)) : "Unknown"}</dd></div>
        <div><dt>End</dt><dd>{selectedRouteEndpoints ? nodeLabel(nodeMap.get(selectedRouteEndpoints.endId)) : "Unknown"}</dd></div>
        <div><dt>Segments</dt><dd>{selectedRoute.steps.length}</dd></div>
      </dl>
      <button className="secondary-button full-width route-reverse" disabled={selectedRouteEndpoints?.closed} onClick={() => reverseSavedRoute(selectedRoute.id)}><SoundingsIcon name="route"/>Reverse route</button>
      {!selectedRouteEndpoints?.closed && <div className="route-editor-actions"><button onClick={() => beginRouteDrawing({ route: selectedRoute, at: "start" })}>Extend start</button><button onClick={() => beginRouteDrawing({ route: selectedRoute, at: "end" })}>Extend end</button></div>}
      <div className="route-topology-actions">
        <button disabled={!selectedVector} onClick={insertSelectedSegmentVertex}>Insert vertex</button>
        <button disabled={!selectedVector} onClick={deleteSelectedSegment}>Delete leg</button>
        <button disabled={!selectedRouteVertex} onClick={removeSelectedRouteVertex}>{selectedRouteVertex && project.vectors.filter((vector) => vector.fromId === selectedRouteVertex.id || vector.toId === selectedRouteVertex.id).length === 1 ? "Delete endpoint leg" : "Collapse vertex"}</button>
        <button className="danger-button" onClick={deleteSelectedRoute}>Delete whole route</button>
      </div>
      <ol className="route-step-list" aria-label={`Ordered steps for ${routeDisplayName(selectedRoute)}`}>
        {selectedRoute.steps.map((step, index) => {
          const vector = project.vectors.find((item) => item.id === step.vectorId);
          if (!vector) return null;
          const endpoints = routeStepPointIds(step, vector);
          const start = nodeMap.get(endpoints.startId);
          const end = nodeMap.get(endpoints.endId);
          return <li key={step.vectorId}><button className={selectedVectorId === step.vectorId ? "active" : ""} onClick={() => focusRoute(selectedRoute, openDrawerForSegment, step.vectorId)}><span>{index + 1}</span><b>{nodeLabel(start, `Vertex ${index + 1}`)} → {nodeLabel(end, `Vertex ${index + 2}`)}</b><small>{Math.round(vector.bearing)}° · {formatNumber(vector.distance)} {vector.unit}</small></button></li>;
        })}
      </ol>
    </> : <p className="drawer-copy">Select a segment on the map or choose a route to name and order it.</p>}
  </div>;
  const mapBar = chooseScaleBar(mapScale(project), METERS_PER_UNIT[project.distanceUnit], 1);
  const screenBar = chooseScaleBar(mapScale(project), METERS_PER_UNIT[project.distanceUnit], zoom);
  const visualScaleStopZoom = normalizeVisualScaleStopZoom(project.visualScaleStopZoom);
  const pointVisualScale = pointVisualZoom(zoom, visualScaleStopZoom);
  const routeNameVisualScale = zoom / pointVisualScale;
  const selectedRouteLine = selectedVector ? geometry(project, selectedVector) : null;
  const selectedCalibrationPixels = calibrationMode === "route" && selectedRoute
    ? routePixelLength(selectedRoute, project.vectors, routeNodes(project))
    : calibrationMode === "segment" && selectedVector
      ? segmentPixelLength(selectedVector, routeNodes(project))
      : undefined;
  const calibrationSourceReady = isFinitePositive(selectedCalibrationPixels);
  const shorelinePath = coast.length > 1 ? `${coast.map((vertex, index) => `${index ? "L" : "M"}${vertex.x} ${vertex.y}`).join(" ")}${coast.length > 2 ? " Z" : ""}` : "";
  const shoreStrokeStyle = { "--shore-base-width": `${12 / zoom}px`, "--shore-edge-width": `${2 / zoom}px`, "--print-shore-base-width": `${6 / effectivePrintScale}px`, "--print-shore-edge-width": `${1.5 / effectivePrintScale}px` } as CSSProperties;
  const shorelineHandleStyle = { "--coast-hit-size": `${44 / zoom}px`, "--coast-visual-size": `${Math.min(28, Math.max(10, 18 * zoom)) / zoom}px`, "--coast-border-width": `${Math.min(3, Math.max(1, 2 * zoom)) / zoom}px` } as CSSProperties;
  const referenceFrame = normalizeCanvasSize(project.reference.frame ?? canvasSize);
  const canvasDisplayStyle = {
    width: canvasSize.width,
    height: canvasSize.height,
    "--canvas-boundary-width": `${2 / zoom}px`,
    "--canvas-boundary-halo": `${5 / zoom}px`,
    "--canvas-resize-hit-size": `${44 / zoom}px`,
    "--canvas-resize-grip-size": `${18 / zoom}px`,
    "--canvas-resize-grip-thickness": `${4 / zoom}px`,
    "--canvas-readout-font": `${10 / zoom}px`,
    "--canvas-readout-padding-y": `${4 / zoom}px`,
    "--canvas-readout-padding-x": `${7 / zoom}px`,
    "--canvas-readout-offset": `${10 / zoom}px`,
    "--canvas-readout-radius": `${4 / zoom}px`,
  } as CSSProperties;
  const routeHitHeight = 44 / zoom;
  const routeControlStyle = { "--route-hit-height": `${routeHitHeight}px`, "--route-hit-offset": `${-routeHitHeight / 2}px`, "--route-label-border": `${1 / zoom}px`, "--route-label-radius": `${3 / zoom}px`, "--route-label-font": `${11 / zoom}px`, "--route-label-padding-y": `${2 / zoom}px`, "--route-label-padding-x": `${4 / zoom}px`, "--route-name-font": `${12 / zoom}px`, "--route-name-width": `${154 / zoom}px`, "--route-name-padding-y": `${4 / zoom}px`, "--route-name-padding-x": `${7 / zoom}px` } as CSSProperties;
  const routeNameLabelStyle = (anchor: RouteLabelAnchor) => ({ ...routeControlStyle, left: anchor.x, top: anchor.y, "--route-name-angle": `${anchor.angleRadians}rad`, "--route-name-visual-scale": routeNameVisualScale }) as CSSProperties;
  const featureDashArray = (dash: GeographicFeatureDash, width: number, scale: number) => dash === "solid" ? "none" : dash === "dashed" ? `${7 * width / scale}px ${5 * width / scale}px` : `${width / scale}px ${4 * width / scale}px`;
  const featurePathStyle = (feature: GeographicFeature) => ({
    "--feature-color": feature.style.color,
    "--feature-stroke-width": `${feature.style.width / zoom}px`,
    "--feature-dash-array": featureDashArray(feature.style.dash, feature.style.width, zoom),
    "--print-feature-stroke-width": `${feature.style.width / effectivePrintScale}px`,
    "--print-feature-dash-array": featureDashArray(feature.style.dash, feature.style.width, effectivePrintScale),
  }) as CSSProperties;
  const featureLayerStyle = { "--feature-hit-width": `${44 / zoom}px`, "--feature-selected-width": `${6 / zoom}px` } as CSSProperties;
  const featureAnchorStyle = (feature: GeographicFeature) => ({ "--feature-color": feature.style.color, "--feature-anchor-hit-size": `${44 / zoom}px`, "--feature-anchor-size": `${10 / zoom}px`, "--feature-anchor-border": `${2 / zoom}px`, "--feature-anchor-halo": `${3 / zoom}px` }) as CSSProperties;
  const featureNameLabelStyle = (anchor: NonNullable<ReturnType<typeof geographicFeatureLabelAnchor>>) => ({
    left: anchor.x,
    top: anchor.y,
    "--feature-name-angle": `${anchor.angleRadians}rad`,
    "--feature-name-width": `${154 / zoom}px`,
    "--feature-name-hit-height": `${44 / zoom}px`,
    "--feature-name-font": `${11 / zoom}px`,
    "--feature-name-offset": `${6 / zoom}px`,
    "--feature-name-padding-y": `${3 / zoom}px`,
    "--feature-name-padding-x": `${6 / zoom}px`,
    "--feature-name-border": `${1 / zoom}px`,
    "--feature-name-radius": `${3 / zoom}px`,
    "--print-feature-name-width": `${150 / effectivePrintScale}px`,
    "--print-feature-name-offset": `${10 / effectivePrintScale}px`,
  }) as CSSProperties;
  const floatingTextStyle = (item: FloatingText, scale: number) => ({
    left: item.x,
    top: item.y,
    "--floating-text-font-size": `${item.size / scale}px`,
    "--floating-text-hit-size": `${44 / scale}px`,
    "--floating-text-max-width": `${320 / scale}px`,
    "--floating-text-padding-y": `${7 / scale}px`,
    "--floating-text-padding-x": `${9 / scale}px`,
    "--floating-text-border": `${2 / scale}px`,
    "--floating-text-radius": `${4 / scale}px`,
    "--floating-text-angle": `${item.rotation}deg`,
  }) as CSSProperties;
  const routeNetworkStyle = { "--route-width": `${2 / zoom}px`, "--route-selected-width": `${3 / zoom}px`, "--route-selected-path-width": `${5 / zoom}px`, "--route-chevron-width": `${2 / zoom}px`, "--route-branch-radius": `${1 / zoom}px`, "--route-symbol-cutout-radius": `${30 * pointSymbolScale / pointVisualScale}px`, "--print-route-width": `${2 / effectivePrintScale}px`, "--print-route-branch-radius": `${1 / effectivePrintScale}px`, "--print-route-symbol-cutout-radius": `${20 * pointSymbolScale / effectivePrintScale}px` } as CSSProperties;
  const selectedDirectionPath = selectedRouteLine ? directionChevronPath(selectedRouteLine, zoom) : "";
  const routeDraftPath = routeDraft && routeDraft.points.length > 1 ? routeDraft.points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ") : "";
  const routeDraftPreviewPath = routeDraft?.points.length && routeDraftPointer ? `M${routeDraft.points[routeDraft.points.length - 1].x} ${routeDraft.points[routeDraft.points.length - 1].y} L${routeDraftPointer.x} ${routeDraftPointer.y}` : "";
  const routeDraftStyle = { "--route-draft-node-radius": `${5 / zoom}px` } as CSSProperties;
  const featureDraftPath = featureDraft ? geographicFeaturePath(featureDraft) : "";
  const featureDraftPreviewPath = featureDraft && featureDraft.mode !== "freehand" && featureDraft.points.length && featureDraftPointer
    ? `M${featureDraft.points.at(-1)!.x} ${featureDraft.points.at(-1)!.y} L${featureDraftPointer.x} ${featureDraftPointer.y}`
    : "";
  const featureDraftStyle = { "--feature-draft-width": `${3 / zoom}px`, "--feature-preview-dash-array": `${7 / zoom}px ${6 / zoom}px` } as CSSProperties;
  const routeVertexDisplayStyle = { "--route-vertex-hit-size": `${44 / zoom}px`, "--route-vertex-size": `${10 / zoom}px`, "--route-vertex-border": `${2 / zoom}px`, "--route-vertex-halo": `${3 / zoom}px` } as CSSProperties;
  const waypointDisplayStyle = { "--point-hit-size": `${44 / zoom}px`, "--point-dot-size": `${14 / pointVisualScale}px`, "--point-dot-border": `${2 / pointVisualScale}px`, "--point-ring": `${1 / pointVisualScale}px`, "--point-origin-ring": `${2 / pointVisualScale}px`, "--point-selected-ring": `${3 / pointVisualScale}px`, "--point-shadow": `${1 / pointVisualScale}px`, "--point-shadow-blur": `${4 / pointVisualScale}px`, "--point-symbol-size": `${38 * pointSymbolScale / pointVisualScale}px`, "--junction-size": `${10 / pointVisualScale}px`, "--junction-border": `${2 / pointVisualScale}px`, "--junction-halo": `${4 / pointVisualScale}px` } as CSSProperties;
  const toolDockStyle = dockPosition ? { "--tool-dock-left": `${dockPosition.left}px`, "--tool-dock-top": `${dockPosition.top}px` } as CSSProperties : undefined;
  const printAreaDisplayStyle = { "--print-area-stroke": `${2 / zoom}px`, "--print-area-dash": `${8 / zoom}px`, "--print-area-dash-gap": `${6 / zoom}px`, "--print-area-label-top": `${-2 / zoom}px`, "--print-area-label-padding-y": `${4 / zoom}px`, "--print-area-label-padding-x": `${7 / zoom}px`, "--print-area-label-font": `${10 / zoom}px`, "--print-area-handle-size": `${14 / zoom}px`, "--print-area-handle-offset": `${-8 / zoom}px`, "--print-area-focus-width": `${2 / zoom}px`, "--print-area-focus-offset": `${2 / zoom}px` } as CSSProperties;
  const annotationDisplayStyle = { "--annotation-hit-width": `${44 / pointVisualScale}px`, "--annotation-hit-height": `${18 / pointVisualScale}px`, "--annotation-touch-hit": `${44 / zoom}px`, "--annotation-manual-hit": `${44 / zoom}px`, "--annotation-stack-x": `${28 / pointVisualScale}px`, "--annotation-touch-x": `${28 / zoom}px`, "--annotation-padding-x": `${3 / pointVisualScale}px`, "--annotation-padding-y": `${1 / pointVisualScale}px`, "--annotation-radius": `${3 / pointVisualScale}px`, "--annotation-label-size": `${13 / pointVisualScale}px`, "--annotation-detail-size": `${10 / pointVisualScale}px`, "--annotation-focus-width": `${1.5 / pointVisualScale}px`, "--point-leader-width": `${1 / pointVisualScale}px`, "--print-point-leader-width": `${1.15 / effectivePrintScale}px` } as CSSProperties;
  const mapFeatureCount = project.geographicFeatures.length + project.floatingTexts.length;
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
              <td><div className="point-name-cell"><input aria-label={`${point.label} Point Name`} value={point.label} onChange={(event) => updatePointLabel(point.id, event.target.value)}/><button className="delete-point" aria-label={`Delete ${point.label}`} title={`Delete ${point.label}`} onClick={() => deletePoint(point.id)}><SoundingsIcon name="trash"/></button></div></td>
              <td><input aria-label={`${point.label} Name`} value={point.name ?? ""} onChange={(event) => mutate((current) => { const item = current.waypoints.find((entry) => entry.id === point.id); if (item) item.name = event.target.value; return current; }, false)}/></td>
              <td><div className="point-symbol-cell">{point.symbol ? <PointSymbolImage className="point-symbol-table-preview" symbol={point.symbol}/> : <span className="point-symbol-circle-preview" aria-hidden="true"/>}<select aria-label={`${point.label} symbol`} value={point.symbol ?? ""} onChange={(event) => setPointSymbol(point.id, normalizePointSymbol(event.target.value))}><option value="">Circle</option>{POINT_SYMBOLS.map((symbol) => <option value={symbol.id} key={symbol.id}>{symbol.label}</option>)}</select></div></td>
              <td><input aria-label={`${point.label} current depth`} inputMode="decimal" placeholder={project.depthUnit} value={point.depth ?? ""} onChange={(event) => mutate((current) => { const item = current.waypoints.find((entry) => entry.id === point.id); if (item) item.depth = event.target.value === "" ? undefined : Number(event.target.value); return current; }, false)}/></td>
              <td><div className="point-route-memberships">{memberships.length ? memberships.map(({ route, pointIndex, atRouteStart, atRouteEnd }) => <button key={route.id} className="route-table-link" onClick={() => focusRoute(route)}><b>{routeDisplayName(route)}</b><span>{atRouteStart && atRouteEnd ? "Start / end" : atRouteStart ? "Start" : atRouteEnd ? "End" : `Point ${pointIndex + 1}`}</span></button>) : <span className="empty-cell">Not assigned</span>}</div></td>
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
  const selectedConnectionStart = selectedConnection ? nodeMap.get(selectedConnection.fromId) : undefined;
  const selectedOffsetKinds = selected ? POINT_ANNOTATION_KINDS.filter((annotationKind) => selected.labelOffsets?.[annotationKind]) : [];
  const togglePanel = (panel: Exclude<ActivePanel, null>) => setActivePanel((current) => current === panel ? null : panel);
  const selectProject = (projectId: string) => {
    const next = projects.find((item) => item.id === projectId);
    if (!next) return;
    openProject(next); setSelectedId(null); setSelectedVectorId(null); setSelectedRouteId(null); setSelectedRouteVertexId(null); setSelectedFeatureId(null); setRouteDraft(null); replaceFeatureDraft(null); setFeatureDraftPointer(null); setFeatureModePickerOpen(false); setUndoStack([]); setRedoStack([]); setActivePanel(null);
  };
  const pointInspector = selected ? <section className="survey-point-inspector" aria-label={`Point details for ${selected.label}`}>
    <div className="survey-section-heading"><div><span>Selected point</span><h3>{selected.label}{selected.name?.trim() ? ` · ${selected.name.trim()}` : ""}</h3></div><button className="close-button" aria-label={`Close ${selected.label} details`} onClick={() => setSelectedId(null)}><SoundingsIcon name="close"/></button></div>
    <div className="survey-point-fields">
      <label>Point Name<input value={selected.label} onChange={(event) => updatePointLabel(selected.id, event.target.value)}/></label>
      <label>Name<input value={selected.name ?? ""} placeholder="Add a descriptive name" onChange={(event) => mutate((current) => { const point = current.waypoints.find((item) => item.id === selected.id); if (point) point.name = event.target.value; return current; }, false)}/></label>
      <label>Depth<input value={selected.depth ?? ""} placeholder={project.depthUnit} inputMode="decimal" onChange={(event) => mutate((current) => { const point = current.waypoints.find((item) => item.id === selected.id); if (point) point.depth = event.target.value === "" ? undefined : Number(event.target.value); return current; }, false)}/></label>
    </div>
    <PointSymbolPicker point={selected} onChange={(symbol) => setPointSymbol(selected.id, symbol)}/>
    {routeMembershipsForPoint(selected.id).length > 0 && <div className="point-membership-list"><span>Routes using this point</span>{routeMembershipsForPoint(selected.id).map(({ route, pointIndex, atRouteStart, atRouteEnd }) => <button key={route.id} onClick={() => focusRoute(route)}><b>{routeDisplayName(route)}</b><small>{atRouteStart && atRouteEnd ? "Start / end" : atRouteStart ? "Start" : atRouteEnd ? "End" : `Point ${pointIndex + 1}`}</small></button>)}</div>}
    <details className="field-capture-section" open={Boolean(selected.fieldDraft)}><summary>Field draft</summary><p>Optional measurements are saved for desktop route assignment; they do not change route topology.</p><div className="field-grid"><label>From point<select value={selected.fieldDraft?.fromPointId ?? ""} onChange={(event) => updateFieldDraft(selected.id, { fromPointId: event.target.value || undefined })}><option value="">Not specified</option>{project.waypoints.filter((point) => point.id !== selected.id).map((point) => <option value={point.id} key={point.id}>{point.label}{point.name ? ` · ${point.name}` : ""}</option>)}</select></label><label>Bearing °<input inputMode="decimal" value={selected.fieldDraft?.bearing ?? ""} onChange={(event) => updateFieldDraft(selected.id, { bearing: event.target.value === "" ? undefined : Number(event.target.value) })}/></label><label>Distance<input inputMode="decimal" value={selected.fieldDraft?.distance ?? ""} onChange={(event) => updateFieldDraft(selected.id, { distance: event.target.value === "" ? undefined : Number(event.target.value) })}/></label><label>Unit<select value={selected.fieldDraft?.unit ?? project.distanceUnit} onChange={(event) => updateFieldDraft(selected.id, { unit: event.target.value as Unit })}>{Object.entries(UNIT_LABEL).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label></div><label>Field note<textarea value={selected.fieldDraft?.note ?? ""} placeholder="Current, visibility, landmark, or measurement note" onChange={(event) => updateFieldDraft(selected.id, { note: event.target.value })}/></label></details>
    {selectedOffsetKinds.length > 0 && <section className="annotation-reset-section" aria-label="Label positions"><div className="annotation-reset-heading"><span>Label positions</span>{selectedOffsetKinds.length > 1 && <button type="button" aria-label={`Reset all label positions for ${selected.label}`} onClick={() => resetAnnotationOffsets(selected.id)}>Reset all</button>}</div><div className="annotation-reset-list">{selectedOffsetKinds.map((annotationKind) => <div key={annotationKind}><span>{POINT_ANNOTATION_LABELS[annotationKind]}</span><button type="button" aria-label={`Reset ${POINT_ANNOTATION_LABELS[annotationKind]} position for ${selected.label}`} onClick={() => resetAnnotationOffsets(selected.id, annotationKind)}>Reset</button></div>)}</div></section>}
    {selectedConnection && <dl className="route-summary"><div><dt>From</dt><dd>{nodeLabel(selectedConnectionStart, selected.label)}</dd></div><div><dt>Bearing</dt><dd>{Math.round(selectedConnection.bearing).toString().padStart(3, "0")}°</dd></div><div><dt>Distance</dt><dd>{formatNumber(selectedConnection.distance)} {selectedConnection.unit}</dd></div></dl>}
    <div className="survey-point-actions"><button className="secondary-button" onClick={() => beginRouteDrawing(undefined, selected)}><SoundingsIcon name="route"/>Draw route from {selected.label}</button><button className="danger-button" onClick={deleteSelected}><SoundingsIcon name="trash"/>Delete point</button></div>
  </section> : null;
  const featureInspector = selectedFeature ? <section className="feature-inspector" aria-label={`Feature details for ${selectedFeature.name.trim() || "Untitled feature"}`}>
    <h3>{selectedFeature.name.trim() || "Untitled feature"}</h3>
    <label>Feature name<input value={selectedFeature.name} placeholder="Optional map label" onChange={(event) => updateGeographicFeature(selectedFeature.id, (feature) => ({ ...feature, name: event.target.value }))} onBlur={() => setNotice(selectedFeature.name.trim() ? "Feature name and label saved." : "Feature name cleared.")}/></label>
    <div className="feature-style-grid">
      <label className="feature-color-field"><span>Line color<output>{selectedFeature.style.color.toUpperCase()}</output></span><input type="color" aria-label="Line color" value={selectedFeature.style.color} onChange={(event) => updateGeographicFeature(selectedFeature.id, (feature) => ({ ...feature, style: { ...feature.style, color: event.target.value } }))}/></label>
      <label>Line width<span className="range-label"><span>Weight</span><output>{formatNumber(selectedFeature.style.width)} px</output></span><input type="range" aria-label="Line width" min="1" max="8" step="0.5" value={selectedFeature.style.width} onChange={(event) => updateGeographicFeature(selectedFeature.id, (feature) => ({ ...feature, style: { ...feature.style, width: Number(event.target.value) } }))}/></label>
    </div>
    <fieldset className="point-symbol-picker"><legend>Line style</legend><div className="feature-dash-options">{(Object.entries(GEOGRAPHIC_FEATURE_DASH_LABELS) as Array<[GeographicFeatureDash, string]>).map(([dash, label]) => <label className={selectedFeature.style.dash === dash ? "active" : ""} key={dash}><input type="radio" name={`feature-dash-${selectedFeature.id}`} value={dash} checked={selectedFeature.style.dash === dash} onChange={() => updateGeographicFeature(selectedFeature.id, (feature) => ({ ...feature, style: { ...feature.style, dash } }), true)}/>{label}</label>)}</div></fieldset>
    <label className="feature-closed-field">Closed loop<input className="switch" type="checkbox" checked={selectedFeature.closed} disabled={selectedFeature.points.length < 3} onChange={(event) => updateGeographicFeature(selectedFeature.id, (feature) => ({ ...feature, closed: event.target.checked && feature.points.length >= 3 }), true)}/></label>
    <p className="drawer-copy">{selectedFeature.mode === "freehand" ? "Drag the selected stroke to move it, or redraw its geometry." : "Drag the line to move it. Drag its anchors for precise editing."}</p>
    <div className="feature-editor-actions">{selectedFeature.mode === "freehand" && <button onClick={() => redrawFreehandFeature(selectedFeature.id)}>Redraw freehand</button>}<button className="danger-button" onClick={() => deleteGeographicFeature(selectedFeature.id)}>Delete feature</button></div>
  </section> : selectedFloatingText ? <section className="feature-inspector floating-text-inspector" aria-label="Floating text details">
    <h3>Floating text</h3>
    <label>Text<textarea aria-label="Floating text content" maxLength={MAX_FLOATING_TEXT_LENGTH} value={selectedFloatingText.text} onFocus={beginFloatingTextEdit} onChange={(event) => updateFloatingText(selectedFloatingText.id, (item) => ({ ...item, text: event.target.value }))} onBlur={() => { updateFloatingText(selectedFloatingText.id, (item) => ({ ...item, text: normalizeFloatingTextContent(item.text) })); finishFloatingTextEdit(selectedFloatingText.id); }}/></label>
    <div className="feature-style-grid floating-text-number-grid">
      <label>Text size (px)<input aria-label="Floating text size value" type="number" min={MIN_FLOATING_TEXT_SIZE} max={MAX_FLOATING_TEXT_SIZE} step="1" value={selectedFloatingText.size} onFocus={beginFloatingTextEdit} onChange={(event) => updateFloatingText(selectedFloatingText.id, (item) => ({ ...item, size: normalizeFloatingTextSize(Number(event.target.value)) }))} onBlur={() => finishFloatingTextEdit(selectedFloatingText.id)}/></label>
      <label>Rotation (°)<input aria-label="Floating text rotation value" type="number" min="-180" max="180" step="1" value={selectedFloatingText.rotation} onFocus={beginFloatingTextEdit} onChange={(event) => updateFloatingText(selectedFloatingText.id, (item) => ({ ...item, rotation: normalizeFloatingTextRotation(Number(event.target.value)) }))} onBlur={() => finishFloatingTextEdit(selectedFloatingText.id)}/></label>
    </div>
    <label><span className="range-label"><span>Text size</span><output htmlFor="floating-text-size">{selectedFloatingText.size} px</output></span><input id="floating-text-size" aria-label="Floating text size" type="range" min={MIN_FLOATING_TEXT_SIZE} max={MAX_FLOATING_TEXT_SIZE} step="1" value={selectedFloatingText.size} onPointerDown={beginFloatingTextEdit} onFocus={beginFloatingTextEdit} onChange={(event) => updateFloatingText(selectedFloatingText.id, (item) => ({ ...item, size: normalizeFloatingTextSize(Number(event.target.value)) }))} onPointerUp={() => finishFloatingTextEdit(selectedFloatingText.id)} onBlur={() => finishFloatingTextEdit(selectedFloatingText.id)}/></label>
    <label><span className="range-label"><span>Rotation</span><output htmlFor="floating-text-rotation">{selectedFloatingText.rotation}°</output></span><input id="floating-text-rotation" aria-label="Floating text rotation" type="range" min="-180" max="180" step="1" value={selectedFloatingText.rotation} onPointerDown={beginFloatingTextEdit} onFocus={beginFloatingTextEdit} onChange={(event) => updateFloatingText(selectedFloatingText.id, (item) => ({ ...item, rotation: normalizeFloatingTextRotation(Number(event.target.value)) }))} onPointerUp={() => finishFloatingTextEdit(selectedFloatingText.id)} onBlur={() => finishFloatingTextEdit(selectedFloatingText.id)}/></label>
    <button className="secondary-button full-width" onClick={() => updateFloatingText(selectedFloatingText.id, (item) => ({ ...item, rotation: 0 }), true)}>Reset rotation</button>
    <p className="drawer-copy">Drag the text on the map to move it. Its chosen size stays constant while the map zoom changes.</p>
    <div className="feature-editor-actions"><button className="danger-button" onClick={() => deleteFloatingText(selectedFloatingText.id)}>Delete text</button></div>
  </section> : null;

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

        <section className="print-map-sheet">
          <div className="print-sheet-header">
            <div><span>Soundings dive chart</span><h1>{project.title}</h1></div>
            <time dateTime={project.date}>{formatProjectDate(project.date)}</time>
          </div>
        <div className={`map-stage ${matchCurrentMap ? "match-map-print" : "optimized-chart-print"}${tool === "select" ? " pan-ready" : ""}${tool === "route" ? " route-draw-active" : ""}${tool === "feature" ? " feature-draw-active" : ""}${tool === "text" ? " text-placement-active" : ""}${printArea ? " has-print-area" : ""}${smartCalloutsActive ? " smart-callout-mode" : ""}${smartCalloutOverflowIds.length ? " smart-callout-overflow" : ""}`} style={printStageStyle} ref={stageRef} tabIndex={0} aria-label="Map navigation surface. Drag blank map space to pan; scroll to zoom; use arrow keys to move around." onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={onStagePointerUp} onPointerCancel={onStagePointerUp} onWheel={onStageWheel}>
          <div className="print-map-viewport">
            <div className="map-canvas" style={{ ...printMapDisplayStyle, ...canvasDisplayStyle, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <div className="water-label">{project.title.trim().toUpperCase()}</div>
            {tool === "select" && <div className="canvas-resize-controls print-hidden" aria-label="Canvas resize controls">
              <button className="canvas-resize-handle east" aria-label="Resize canvas right edge" onPointerDown={(event) => startCanvasResize(event, "east")} onKeyDown={(event) => resizeCanvasWithKeyboard(event, "east")}/>
              <button className="canvas-resize-handle south" aria-label="Resize canvas bottom edge" onPointerDown={(event) => startCanvasResize(event, "south")} onKeyDown={(event) => resizeCanvasWithKeyboard(event, "south")}/>
              <button className="canvas-resize-handle southeast" aria-label="Resize canvas right and bottom edges" onPointerDown={(event) => startCanvasResize(event, "southeast")} onKeyDown={(event) => resizeCanvasWithKeyboard(event, "southeast")}/>
            </div>}
            {canvasResizeActive && <output className="canvas-size-readout print-hidden" aria-live="polite">{canvasSize.width} × {canvasSize.height} px</output>}
            {printArea && <div className="print-area-overlay print-hidden" style={{ ...printAreaDisplayStyle, left: printArea.x, top: printArea.y, width: printArea.width, height: printArea.height }}><button className="print-area-move" aria-label="Move PDF print area" onPointerDown={(event) => startPrintAreaAdjust(event, "move")}>PDF print area</button>{(["nw", "ne", "se", "sw"] as PrintAreaHandle[]).map((handle) => <button key={handle} className={`print-area-handle ${handle}`} aria-label={`Resize PDF print area from ${handle}`} onPointerDown={(event) => startPrintAreaAdjust(event, handle)}/>)}</div>}
            {project.reference.dataUrl && <>
              {/* User-supplied data URLs must remain local and cannot use an image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={`reference-image${project.reference.visible ? "" : " screen-hidden"}${exportClass(printSettings.reference)}`} src={project.reference.dataUrl} alt="Uploaded trace reference" style={{ width: referenceFrame.width, height: referenceFrame.height, opacity: project.reference.opacity, transform: `translate(${project.reference.x}px, ${project.reference.y}px) scale(${project.reference.scale})`, "--print-reference-opacity": String(Math.min(project.reference.opacity, 0.35)) } as CSSProperties} draggable={false}/>
            </>}
            {shorelinePath && <svg className={`shoreline-path${visibleLayers.shoreline ? "" : " screen-hidden"}${exportClass(printSettings.shoreline)}`} style={shoreStrokeStyle} viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} aria-hidden="true">{coast.length > 2 && <path className="shoreline-fill" d={shorelinePath}/>}<path className="shoreline-base" d={shorelinePath}/><path className="shoreline-edge" d={shorelinePath}/></svg>}
            {tool === "coast" && !project.shoreLocked && visibleLayers.shoreline && coast.map((vertex) => <button key={vertex.id} aria-label="Move shoreline vertex" className="coast-vertex" style={{ ...shorelineHandleStyle, left: vertex.x, top: vertex.y }} onPointerDown={(event) => startDrag(event, "coast", vertex.id)} />)}
            {project.geographicFeatures.length > 0 && <svg className={`feature-layer${visibleLayers.geographicFeatures ? "" : " screen-hidden"}${exportClass(printSettings.geographicFeatures)}`} style={featureLayerStyle} viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} aria-label="Geographic map features">
              {project.geographicFeatures.map((feature, index) => {
                const path = geographicFeaturePath(feature);
                if (!path) return null;
                const label = feature.name.trim() || `Untitled feature ${index + 1}`;
                return <g key={feature.id} style={featurePathStyle(feature)}>
                  <path className="feature-path" data-feature-id={feature.id} d={path}/>
                  {selectedFeatureId === feature.id && <path className="feature-selected-path print-hidden" d={path}/>}
                  {tool === "select" && <path
                    className="feature-hit-path print-hidden"
                    d={path}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select and move ${label}`}
                    onPointerDown={(event) => startFeatureDrag(event, feature.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectGeographicFeature(feature.id); } }}
                  />}
                </g>;
              })}
            </svg>}
            {selectedFeature && selectedFeature.mode !== "freehand" && visibleLayers.geographicFeatures && selectedFeature.points.map((point, index) => <button className="feature-anchor-handle print-hidden" style={{ ...featureAnchorStyle(selectedFeature), left: point.x, top: point.y }} key={point.id} aria-label={`Move anchor ${index + 1} for ${selectedFeature.name.trim() || "Untitled feature"}. Use arrow keys for fine positioning.`} onPointerDown={(event) => startFeatureAnchorDrag(event, selectedFeature.id, point.id)} onKeyDown={(event) => nudgeFeatureAnchor(event, selectedFeature.id, point.id)}/>) }
            {visualRouteNetwork.paths.length > 0 && <svg className={`route-network${visibleLayers.routes ? "" : " screen-hidden"}${exportClass(printSettings.routes)}`} style={routeNetworkStyle} viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} shapeRendering="geometricPrecision" aria-hidden="true">
              <defs>
                <mask id="route-symbol-clearance-mask" className="route-symbol-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width={canvasSize.width} height={canvasSize.height}>
                  <rect x="0" y="0" width={canvasSize.width} height={canvasSize.height} fill="white"/>
                  {routeSymbolPoints.map((point) => <circle className={`route-symbol-cutout${exportClass(printSettings.pointMarkers && includeMapPrintAnchor(point))}`} data-route-symbol-cutout={point.id} key={point.id} cx={point.x} cy={point.y} fill="black"/>)}
                </mask>
              </defs>
              <g className="route-network-ink" mask="url(#route-symbol-clearance-mask)">
                <g className="route-network-base">
                  {visualRouteNetwork.paths.map((path) => <path className="route-network-path" key={path.key} d={routePathData(path, nodeMap)}/>)}
                  {visualRouteNetwork.branchPointIds.map((pointId) => { const point = nodeMap.get(pointId); return point ? <circle className="route-network-branch" data-route-branch={pointId} key={pointId} cx={point.x} cy={point.y}/> : null; })}
                </g>
                {(selectedRoutePath || selectedRouteLine) && <g className="route-network-selection print-hidden">
                  {selectedRoutePath && <path className="route-selection-path" d={selectedRoutePath}/>}
                  {selectedRouteLine && selectedRouteLine.pixels > 0 && <line className="route-selection-line" x1={selectedRouteLine.start.x} y1={selectedRouteLine.start.y} x2={selectedRouteLine.end.x} y2={selectedRouteLine.end.y}/>}
                  {selectedDirectionPath && <path className="route-direction" d={selectedDirectionPath}/>}
                </g>}
              </g>
            </svg>}
            {routeDraft && <svg className="route-draft-layer print-hidden" style={routeDraftStyle} viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} aria-hidden="true">
              {routeDraftPath && <path className="route-draft-path" d={routeDraftPath}/>}
              {routeDraftPreviewPath && <path className="route-draft-preview" d={routeDraftPreviewPath}/>}
              {routeDraft.points.map((point, index) => <circle className="route-draft-node" key={`${point.nodeId ?? "draft"}-${index}`} cx={point.x} cy={point.y}/>)}
            </svg>}
            {featureDraft && <svg className="feature-draft-layer print-hidden" style={featureDraftStyle} viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} aria-hidden="true">
              {featureDraftPath && <path className="feature-draft-path" d={featureDraftPath}/>}
              {featureDraftPreviewPath && <path className="feature-draft-preview" d={featureDraftPreviewPath}/>}
              {featureDraft.mode !== "freehand" && featureDraft.points.map((point) => <circle className="feature-draft-anchor" key={point.id} cx={point.x} cy={point.y} r={5 / zoom}/>) }
            </svg>}
            {project.vectors.map((vector) => {
              const line = geometry(project, vector); if (!line) return null;
              const selectedSegment = selectedVectorId === vector.id;
              return <div className="vector-group" key={vector.id}>
                <button className={`vector-line${selectedSegment ? " selected-vector" : ""}${visibleLayers.routes ? "" : " screen-hidden"}${exportClass(printSettings.routes)}`} aria-label={`Select route segment from ${nodeLabel(line.start)} to ${nodeLabel(line.end)}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectVector(vector); }} style={{ ...routeControlStyle, left: line.start.x, top: line.start.y, width: line.pixels, transform: `rotate(${Math.atan2(line.dy, line.dx)}rad)` }}/>
                <button className={`vector-label${visibleLayers.routeLabels ? "" : " screen-hidden"}${exportClass(printSettings.routeLabels)}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectVector(vector); }} style={{ ...routeControlStyle, left: line.start.x + line.dx / 2, top: line.start.y + line.dy / 2 }}><span>{Math.round(vector.bearing)}°</span><span>{formatNumber(vector.distance)} {vector.unit}</span></button>
              </div>;
            })}
            {selectedRouteVertexIds.map((vertexId) => {
              const vertex = project.routeVertices.find((item) => item.id === vertexId);
              if (!vertex) return null;
              const incidentCount = project.vectors.filter((vector) => vector.fromId === vertex.id || vector.toId === vertex.id).length;
              const routeCount = routes.filter((route) => routePointIds(route, project.vectors).includes(vertex.id)).length;
              return <button key={`route-vertex-${vertex.id}`} className={`route-vertex-handle print-hidden${selectedRouteVertexId === vertex.id ? " selected" : ""}${incidentCount > 2 || routeCount > 1 ? " shared" : ""}`} aria-label={`Edit route vertex${incidentCount > 2 || routeCount > 1 ? " shared by routes" : ""}`} style={{ ...routeVertexDisplayStyle, left: vertex.x, top: vertex.y }} onClick={(event) => { event.stopPropagation(); setSelectedRouteVertexId(vertex.id); setSelectedVectorId(null); }} onPointerDown={(event) => startDrag(event, "routeVertex", vertex.id)}/>;
            })}
            {routeLabelAnchors.map(({ route, screen, print }) => <Fragment key={`route-name-${route.id}`}>
              <button
                className={`route-name-label print-hidden${visibleLayers.routeNameLabels ? "" : " screen-hidden"}`}
                style={routeNameLabelStyle(screen)}
                title={route.name}
                aria-label={`Route ${route.name}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); focusRoute(route); }}
              ><span>{route.name}</span></button>
              {print && <span className={`route-name-label route-name-label-print screen-hidden${exportClass(printSettings.routeNameLabels)}`} style={routeNameLabelStyle(matchCurrentMap ? print : clampPrintLabelAnchor(print))} aria-label={`Route ${route.name}`}><span>{route.name}</span></span>}
            </Fragment>)}
            {geographicFeatureLabels.map(({ feature, name, anchor }, featureLabelIndex) => <Fragment key={`feature-name-${feature.id}`}>
              <button className={`feature-name-label print-hidden${visibleLayers.geographicFeatureLabels ? "" : " screen-hidden"}`} style={featureNameLabelStyle(anchor)} aria-label={`Map feature ${name}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectGeographicFeature(feature.id); }}><span>{name}</span></button>
              {includeMapPrintAnchor(anchor) && <span className={`feature-name-label feature-name-label-print screen-hidden${!matchCurrentMap && printFeatureLabelBelow(anchor, featureLabelIndex) ? " feature-name-label-below" : ""}${exportClass(printSettings.geographicFeatureLabels)}`} style={featureNameLabelStyle(matchCurrentMap ? anchor : clampPrintLabelAnchor(anchor, 84, 60))} aria-label={`Map feature ${name}`}><span>{name}</span></span>}
            </Fragment>)}
            {project.floatingTexts.map((item) => <Fragment key={item.id}>
              <button data-floating-text-id={item.id} className={`floating-text-item floating-text-screen print-hidden${selectedFeatureId === item.id ? " selected" : ""}${visibleLayers.floatingText ? "" : " screen-hidden"}`} style={floatingTextStyle(item, zoom)} aria-label={`Move floating text: ${item.text}. Use arrow keys for fine positioning.`} onPointerDown={(event) => startFloatingTextDrag(event, item.id)} onClick={(event) => { event.stopPropagation(); selectFloatingText(item.id); }} onKeyDown={(event) => nudgeFloatingText(event, item.id)}><span>{item.text || "Text"}</span></button>
              <span className={`floating-text-item floating-text-print screen-hidden${exportClass(printSettings.floatingText && includeMapPrintAnchor(item))}`} style={floatingTextStyle(item, matchCurrentMap ? zoom : effectivePrintScale)} aria-label={`Floating text: ${item.text}`}><span>{item.text || "Text"}</span></span>
            </Fragment>)}
            {manualAnnotations.length > 0 && <svg className="point-leaders" style={annotationDisplayStyle} viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} shapeRendering="geometricPrecision" aria-hidden="true">
              {manualAnnotations.map(({ point, annotationKind, offset }) => {
                const screenEnd = annotationPosition(point, offset);
                const printEnd = annotationPosition(point, offset);
                const screenDistance = Math.hypot(offset.dx, offset.dy) * zoom;
                return <Fragment key={`${point.id}-${annotationKind}`}>
                  {screenDistance >= 8 && <line className={`point-leader point-leader-${annotationKind} point-leader-screen print-hidden${annotationScreenVisible(annotationKind) ? "" : " screen-hidden"}`} x1={point.x} y1={point.y} x2={screenEnd.x} y2={screenEnd.y}/>}
                  {screenDistance >= (matchCurrentMap ? 8 : 6) && <line
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
              const displayName = point.name?.trim() ?? "";
              return <button key={point.id} aria-label={displayName ? `Edit ${point.label} — ${displayName}` : `Edit point of interest ${point.label}`} className={`waypoint named-point${point.symbol ? " has-symbol" : ""}${selectedId === point.id ? " selected" : ""}${exportClass(includeMapPrintAnchor(point))}`} style={{ ...waypointDisplayStyle, left: point.x, top: point.y }} onClick={(event) => { event.stopPropagation(); setSelectedId(point.id); setSelectedVectorId(null); setSelectedRouteId(null); setSelectedRouteVertexId(null); setSurveyTab("points"); setActivePanel("survey"); setTool("select"); }} onPointerDown={(event) => startDrag(event, "waypoint", point.id)}>
                {point.symbol ? <PointSymbolImage className={`point-symbol-marker${exportClass(printSettings.pointMarkers)}`} symbol={point.symbol}/> : <span className={`point-dot${exportClass(printSettings.pointMarkers)}`}/>}
              </button>;
            })}
            {project.waypoints.map((point) => {
              const contentKinds = POINT_ANNOTATION_KINDS.filter((annotationKind) => annotationText(point, annotationKind));
              const automaticKinds = contentKinds.filter((annotationKind) => !point.labelOffsets?.[annotationKind]);
              const screenAutomaticKinds = automaticKinds.filter(annotationScreenVisible);
              const printAutomaticKinds = automaticKinds.filter((annotationKind) => annotationPrintVisible(point, annotationKind));
              const printAutomaticHeights = printAutomaticKinds.map((annotationKind) => printAnnotationBlockHeight(annotationKind, annotationText(point, annotationKind)));
              const printAutomaticTotalHeight = printAutomaticHeights.reduce((sum, height) => sum + height, 0);
              const printAutomaticBaseY = point.y > printSource.y + printSource.height - (printAutomaticTotalHeight + 8) / effectivePrintScale ? -printAutomaticTotalHeight - 4 : -4;
              return <Fragment key={`annotations-${point.id}`}>
                {contentKinds.map((annotationKind) => {
                  const offset = point.labelOffsets?.[annotationKind];
                  const position = offset ? annotationPosition(point, offset) : point;
                  const printPosition = offset ? clampPrintLabelAnchor(annotationPosition(point, offset), 120, 34) : point;
                  const text = annotationText(point, annotationKind);
                  const automaticIndex = Math.max(0, screenAutomaticKinds.indexOf(annotationKind));
                  const automaticStyle = offset ? {} : {
                    "--annotation-auto-y": `${(-5 + automaticIndex * 17) / pointVisualScale}px`,
                    "--annotation-touch-y": `${((automaticIndex - (screenAutomaticKinds.length - 1) / 2) * 44 - 22) / zoom}px`,
                    "--annotation-print-y": `${(printAutomaticBaseY + printAutomaticHeights.slice(0, Math.max(0, printAutomaticKinds.indexOf(annotationKind))).reduce((sum, height) => sum + height, 0)) / effectivePrintScale}px`,
                    "--print-annotation-stack-x": point.x > printSource.x + printSource.width - 180 / effectivePrintScale ? `calc(-100% - ${7 / effectivePrintScale}px)` : `${7 / effectivePrintScale}px`,
                  } as CSSProperties;
                  const manualPrintStyle = offset ? {
                    "--annotation-print-left": `${printPosition.x}px`,
                    "--annotation-print-top": `${printPosition.y}px`,
                  } as CSSProperties : {};
                  return <button type="button" data-point-id={point.id} data-annotation-kind={annotationKind} data-manual-position={offset ? "true" : "false"} key={annotationKind} className={`point-annotation ${offset ? "point-annotation-manual" : "point-annotation-auto"}${annotationVisibilityClass(point, annotationKind)}`} style={{ ...annotationDisplayStyle, ...automaticStyle, ...manualPrintStyle, left: position.x, top: position.y }} aria-label={`Move ${POINT_ANNOTATION_LABELS[annotationKind]} for ${point.label}. Use arrow keys for fine positioning.`} onClick={(event) => { event.stopPropagation(); setSelectedId(point.id); setSelectedVectorId(null); setSelectedRouteId(null); setSurveyTab("points"); setActivePanel("survey"); setTool("select"); }} onPointerDown={(event) => startAnnotationDrag(event, point, annotationKind)} onKeyDown={(event) => onAnnotationKeyDown(event, point, annotationKind)}>{renderAnnotationChip(annotationKind, text)}</button>;
                })}
              </Fragment>;
            })}
            <div className={`north-arrow map-furniture${exportClass(printSettings.mapFurniture)}`}><b>N</b><svg viewBox="0 0 34 56" aria-hidden="true"><path d="M17 2 31 46 17 39 3 46 17 2Z"/><path d="m17 2 14 44-14-7V2Z"/></svg></div><div className={`scale-bar map-furniture${exportClass(printSettings.mapFurniture)}`}><i style={{ width: mapBar.sourcePixels }}/><span>{formatNumber(mapBar.value)} {project.distanceUnit}</span></div><div className={`map-units map-furniture${exportClass(printSettings.mapFurniture)}`}>distance: {UNIT_LABEL[project.distanceUnit]} · depth: {UNIT_LABEL[project.depthUnit]}</div>
            {(tool === "route" || tool === "point" || tool === "feature" || tool === "text") && <div className="map-placement-capture print-hidden" aria-hidden="true"/>}
            </div>
          </div>
          {smartCalloutCandidate && <>
            <svg className="smart-callout-leaders screen-hidden" data-layout-mode={smartCalloutCandidate.layout.mode} viewBox={`0 0 ${PRINT_CHART_FRAME.width} ${PRINT_CHART_FRAME.height}`} shapeRendering="geometricPrecision" aria-hidden="true">
              {smartCalloutCandidate.layout.callouts.map((callout) => <polyline key={callout.id} data-smart-callout-leader={callout.id} points={callout.leader.map((point) => `${point.x},${point.y}`).join(" ")}/>) }
              {printSettings.pointMarkers && smartCalloutCandidate.layout.callouts.map((callout) => {
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
          <div className={`print-crop-furniture${exportClass(printSettings.mapFurniture)}`}><div className="north-arrow"><b>N</b><svg viewBox="0 0 34 56" aria-hidden="true"><path d="M17 2 31 46 17 39 3 46 17 2Z"/><path d="m17 2 14 44-14-7V2Z"/></svg></div><div className="scale-bar"><i/><span>{formatNumber(printBar.value)} {project.distanceUnit}</span></div></div>

          {routeDraft && <div className="route-draw-controls print-hidden" role="toolbar" aria-label="Route drawing controls">
            <span>{routeDraft.extendRouteId ? "Extending route" : "New route"} · {routeDraft.points.length} {routeDraft.points.length === 1 ? "vertex" : "vertices"}</span>
            <button disabled={routeDraft.points.length <= (routeDraft.extendRouteId ? 1 : 0)} onClick={undoRouteDraftPoint}>Undo</button>
            <button className="primary" disabled={routeDraft.points.length < 2} onClick={finishRouteDrawing}>Finish</button>
            <button onClick={cancelRouteDrawing}>Cancel</button>
          </div>}

          {featureModePickerOpen && !featureDraft && <div className="feature-mode-picker print-hidden" role="dialog" aria-label="Choose feature drawing mode">
            <p>Draw a map feature</p>
            <div className="feature-mode-grid">
              <button onClick={() => beginFeatureDrawing("freehand")}><SoundingsIcon name="feature"/>Freehand</button>
              <button onClick={beginFloatingTextPlacement}><SoundingsIcon name="text"/>Floating text</button>
              <button onClick={() => beginFeatureDrawing("spline")}><SoundingsIcon name="feature"/>Smooth spline</button>
              <button onClick={() => beginFeatureDrawing("polyline")}><SoundingsIcon name="feature"/>Connected line</button>
            </div>
            <button className="feature-mode-cancel" onClick={cancelFeatureDrawing}>Cancel</button>
          </div>}

          {featureDraft && <div className="feature-draw-controls print-hidden" role="toolbar" aria-label="Feature drawing controls">
            <span>{GEOGRAPHIC_FEATURE_MODE_LABELS[featureDraft.mode]} · {featureDraft.mode === "freehand" ? "drag to draw" : `${featureDraft.points.length} ${featureDraft.points.length === 1 ? "anchor" : "anchors"}`}</span>
            <button disabled={featureDraft.mode === "freehand" || featureDraft.points.length === 0} onClick={undoFeatureDraftPoint}>Undo</button>
            <button className="primary" disabled={featureDraft.mode === "freehand" || featureDraft.points.length < 2} onClick={finishFeatureDrawing}>Finish</button>
            <button onClick={cancelFeatureDrawing}>Cancel</button>
          </div>}

          <nav ref={dockRef} className={`tool-dock print-hidden${dockPosition ? " positioned" : ""}${dockDragging ? " dragging" : ""}`} style={toolDockStyle} aria-label="Map tools" onWheel={(event) => event.stopPropagation()}>
            <button type="button" className="tool-dock-handle" aria-label="Move map tools" aria-describedby="tool-dock-help" title="Drag to move · Arrow keys nudge · Home resets" onPointerDown={startDockDrag} onPointerMove={moveDock} onPointerUp={finishDockDrag} onPointerCancel={finishDockDrag} onKeyDown={moveDockWithKeyboard}>
              <span className="tool-dock-grip" aria-hidden="true"><i/><i/><i/><i/><i/><i/></span>
            </button>
            <span className="sr-only" id="tool-dock-help">Drag to move the toolbox. Use the arrow keys to nudge it, Shift with an arrow key to move farther, or Home to reset its position.</span>
            <DockButton icon="select" label="Select" active={tool === "select" && activePanel !== "survey"} onClick={() => { setTool("select"); setActivePanel(null); }}/>
            <DockButton icon="point" label="Add a Point" active={tool === "point"} onClick={beginPointPlacement}/>
            <DockButton icon="shoreline" label="Shoreline" active={tool === "coast"} disabled={project.shoreLocked} onClick={() => { setTool("coast"); setActivePanel(null); }}/>
            <DockButton icon="feature" label="Draw Feature" active={tool === "feature" || tool === "text" || featureModePickerOpen} onClick={openFeatureModePicker}/>
            <DockButton icon="route" label="Draw Route" active={tool === "route"} onClick={() => beginRouteDrawing()}/>
            <DockButton icon="print-area" label="Print Area" active={tool === "printArea"} onClick={() => { setTool("printArea"); setActivePanel(null); setNotice("Drag a rectangle over the map to set the PDF print area."); }}/>
          </nav>

          <div className="notice-toast print-hidden" role="status" aria-live="polite"><span className="status-dot"/>{notice}</div>

          {!activePanel && !featureModePickerOpen && !featureDraft && <aside className="context-stack print-hidden" aria-label="Map inspector">
            <section className={`floating-panel layers-panel${layersOpen ? "" : " collapsed"}`}>
              <button className="layers-heading" aria-expanded={layersOpen} onClick={() => setLayersOpen((open) => !open)}><span><SoundingsIcon name="layers"/>Layers</span><SoundingsIcon name="chevron"/></button>
              {layersOpen && <div className="layer-list">
                <label><span><SoundingsIcon name="eye"/>Reference</span><input className="switch" type="checkbox" checked={project.reference.visible} onChange={(event) => mutate((current) => ({ ...current, reference: { ...current.reference, visible: event.target.checked } }), false)}/></label>
                <label><span><SoundingsIcon name="shoreline"/>Shoreline</span><input className="switch" type="checkbox" checked={visibleLayers.shoreline} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, shoreline: event.target.checked }))}/></label>
                <p className="layer-group-title">Features</p>
                <label><span><SoundingsIcon name="feature"/>Map features</span><input className="switch" type="checkbox" checked={visibleLayers.geographicFeatures} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, geographicFeatures: event.target.checked }))}/></label>
                <label><span className="label-glyph compact">Ab</span><span className="layer-name">Feature labels</span><input className="switch" type="checkbox" checked={visibleLayers.geographicFeatureLabels} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, geographicFeatureLabels: event.target.checked }))}/></label>
                <label><span><SoundingsIcon name="text"/>Floating text</span><input className="switch" type="checkbox" checked={visibleLayers.floatingText} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, floatingText: event.target.checked }))}/></label>
                <p className="layer-group-title">Routes</p>
                <label><span><SoundingsIcon name="route"/>Routes</span><input className="switch" type="checkbox" checked={visibleLayers.routes} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, routes: event.target.checked }))}/></label>
                <label><span className="label-glyph">°</span><span className="layer-name">Bearings &amp; distances</span><input className="switch" type="checkbox" checked={visibleLayers.routeLabels} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, routeLabels: event.target.checked }))}/></label>
                <label><span className="label-glyph compact">Rt</span><span className="layer-name">Route names</span><input className="switch" type="checkbox" checked={visibleLayers.routeNameLabels} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, routeNameLabels: event.target.checked }))}/></label>
                <p className="layer-group-title">Points</p>
                <label><span className="label-glyph compact">P1</span><span className="layer-name">Point Names</span><input className="switch" type="checkbox" checked={visibleLayers.pointNames} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, pointNames: event.target.checked }))}/></label>
                <label><span className="label-glyph compact">Nm</span><span className="layer-name">Names</span><input className="switch" type="checkbox" checked={visibleLayers.names} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, names: event.target.checked }))}/></label>
                <label><span className="label-glyph compact">ft</span><span className="layer-name">Depths</span><input className="switch" type="checkbox" checked={visibleLayers.depths} onChange={(event) => setVisibleLayers((layers) => ({ ...layers, depths: event.target.checked }))}/></label>
              </div>}
            </section>
          </aside>}

          {activePanel && <aside className={`drawer-shell print-hidden${activePanel === "survey" ? " survey-drawer" : ""}`} onWheel={(event) => event.stopPropagation()}>
            {activePanel === "projects" && <><PanelHeading icon="folder" title="Projects" onClose={() => setActivePanel(null)}/><div className="drawer-body"><label>Current project<select value={project.id} onChange={(event) => selectProject(event.target.value)}>{projects.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><button className="primary-button" onClick={newProject}>New project</button><div className="drawer-section"><h3>Project actions</h3><button className="action-row" onClick={duplicateProject}><SoundingsIcon name="duplicate"/><span><b>Duplicate</b><small>Create an editable copy</small></span></button><button className="action-row" onClick={exportBackup}><SoundingsIcon name="export"/><span><b>Download backup</b><small>Save this project as JSON</small></span></button><label className="action-row file-action"><SoundingsIcon name="upload"/><span><b>Import backup</b><small>Open a Soundings JSON file</small></span><input type="file" accept="application/json" onChange={importBackup}/></label></div><div className="drawer-section field-handoff"><h3>Field capture handoff</h3><p className="drawer-copy">Move point observations between a phone and desktop without changing route topology.</p><button className="action-row" onClick={exportFieldCapture}><SoundingsIcon name="export"/><span><b>Share field capture</b><small>Download points and draft measurements</small></span></button><label className="action-row file-action"><SoundingsIcon name="upload"/><span><b>Merge field capture</b><small>Review a mobile capture package</small></span><input type="file" accept="application/json" onChange={importFieldCapture}/></label></div><button className="danger-button drawer-danger" onClick={deleteProject}><SoundingsIcon name="trash"/>Delete project</button></div></>}

            {activePanel === "settings" && <><PanelHeading icon="settings" title="Settings" onClose={() => setActivePanel(null)}/><div className="drawer-body"><div className="drawer-section first"><h3>Dive site</h3><label>Title<input value={project.title} aria-label="Dive site title" onChange={(event) => mutate((current) => ({ ...current, title: event.target.value }), false)}/></label><label>Date<input type="date" value={project.date} onChange={(event) => mutate((current) => ({ ...current, date: event.target.value }), false)}/></label><div className="field-grid"><label>Distance unit<select value={project.distanceUnit} onChange={(event) => changeDistanceUnit(event.target.value as Unit)}>{Object.entries(UNIT_LABEL).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label>Depth unit<select value={project.depthUnit} onChange={(event) => mutate((current) => ({ ...current, depthUnit: event.target.value as Unit }), false)}>{Object.entries(UNIT_LABEL).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label></div><label>Notes<textarea value={project.notes} placeholder="Dive conditions or site notes" onChange={(event) => mutate((current) => ({ ...current, notes: event.target.value }), false)}/></label></div><div className="drawer-section"><h3>Map visuals</h3><div className="range-label"><span>Icon size</span><output htmlFor="point-symbol-scale">{Math.round(pointSymbolScale * 100)}%</output></div><input id="point-symbol-scale" aria-label="Map icon size" type="range" min={MIN_POINT_SYMBOL_SCALE} max={MAX_POINT_SYMBOL_SCALE} step="0.1" value={pointSymbolScale} onChange={(event) => mutate((current) => ({ ...current, pointSymbolScale: normalizePointSymbolScale(Number(event.target.value)) }), false)}/><label>Full size at<select id="visual-scale-stop-zoom" aria-label="Point and route labels full-size zoom" value={visualScaleStopZoom} onChange={(event) => setVisualScaleStopZoom(Number(event.target.value))}>{VISUAL_SCALE_STOP_ZOOM_OPTIONS.map((value) => <option value={value} key={value}>{Math.round(value * 100)}% zoom</option>)}</select></label><p className="drawer-copy">Point markers, point labels, and route names grow with the map until this zoom, then stay the same size on screen. Lower values keep them larger when zoomed out. Match current map uses these proportions in the PDF.</p></div><div className="drawer-section"><h3>Reference image</h3><label className="upload-button"><SoundingsIcon name="image"/>{project.reference.dataUrl ? "Replace reference" : "Upload reference image"}<input type="file" accept="image/*" onChange={onReferenceUpload}/></label>{project.reference.dataUrl && <><div className="range-label"><span>Opacity</span><output>{Math.round(project.reference.opacity * 100)}%</output></div><input type="range" min="0" max="1" step="0.05" value={project.reference.opacity} onChange={(event) => mutate((current) => ({ ...current, reference: { ...current.reference, opacity: Number(event.target.value) } }), false)}/><div className="range-label"><span>Size</span><output>{project.reference.scale.toFixed(1)}×</output></div><input type="range" min="0.4" max="2.4" step="0.1" value={project.reference.scale} onChange={(event) => mutate((current) => ({ ...current, reference: { ...current.reference, scale: Number(event.target.value) } }), false)}/><div className="button-row"><button className={tool === "reference" ? "active" : ""} onClick={() => { setTool("reference"); setActivePanel(null); }}><SoundingsIcon name="select"/>Move</button><button onClick={() => mutate((current) => ({ ...current, reference: { ...current.reference, locked: !current.reference.locked } }))}><SoundingsIcon name={project.reference.locked ? "unlock" : "lock"}/>{project.reference.locked ? "Unlock" : "Lock"}</button></div></>}</div><div className="drawer-section"><h3>Shoreline</h3><button className="action-row" onClick={toggleShoreLock}><SoundingsIcon name={project.shoreLocked ? "unlock" : "lock"}/><span><b>{project.shoreLocked ? "Unlock shore" : "Lock shore"}</b><small>{project.shoreLocked ? "Allow drawing and adjustment" : "Protect the finished trace"}</small></span></button>{coast.length >= 3 && <button className="danger-button" onClick={() => mutate((current) => { current.coastline = []; return current; })}><SoundingsIcon name="trash"/>Clear shoreline</button>}</div></div></>}

            {activePanel === "survey" && <>
              <PanelHeading icon="route" title="Survey" onClose={() => setActivePanel(null)}/>
              <div className="survey-tabs" role="tablist" aria-label="Survey workspace"><button role="tab" aria-selected={surveyTab === "routes"} className={surveyTab === "routes" ? "active" : ""} onClick={() => setSurveyTab("routes")}>Routes</button><button role="tab" aria-selected={surveyTab === "points"} className={surveyTab === "points" ? "active" : ""} onClick={() => setSurveyTab("points")}>Points</button><button onClick={() => setSurveyTab("features")} role="tab" aria-selected={surveyTab === "features"} className={surveyTab === "features" ? "active" : ""}>Features</button></div>
              <div className="drawer-body survey-body">
                {surveyTab === "routes" ? <>
                  <section className="survey-route-editor"><div className="survey-section-title"><span>Routes</span><button onClick={() => beginRouteDrawing()}>＋ Draw route</button></div>{routeEditor(true)}</section>
                  <details className="calibration-section">
                    <summary>Scale calibration <small>{formatNumber(mapScale(project))} m / px</small></summary>
                    <div className="calibration-mode" role="group" aria-label="Calibration source type">
                      <button className={calibrationMode === "route" ? "active" : ""} aria-pressed={calibrationMode === "route"} onClick={() => changeCalibrationMode("route")}>Whole route</button>
                      <button className={calibrationMode === "segment" ? "active" : ""} aria-pressed={calibrationMode === "segment"} onClick={() => changeCalibrationMode("segment")}>Single segment</button>
                    </div>
                    {calibrationMode === "route" ? <label>Reference route
                      <select value={selectedRoute?.id ?? ""} onChange={(event) => {
                        const route = routes.find((item) => item.id === event.target.value);
                        if (route) focusRoute(route, false);
                        else { setSelectedRouteId(null); setSelectedVectorId(null); populateCalibrationForm(undefined, project.distanceUnit); }
                      }}>
                        <option value="">Select a route</option>
                        {routes.map((route) => <option value={route.id} key={route.id}>{routeDisplayName(route)}</option>)}
                      </select>
                    </label> : <label>Reference segment
                      <select value={selectedVectorId ?? ""} onChange={(event) => {
                        const vector = project.vectors.find((item) => item.id === event.target.value);
                        if (vector) selectVector(vector);
                        else { setSelectedVectorId(null); populateCalibrationForm(undefined, project.distanceUnit); }
                      }}>
                        <option value="">Select a route segment</option>
                        {project.vectors.map((vector) => {
                          const start = nodeMap.get(vector.fromId);
                          const end = nodeMap.get(vector.toId);
                          const route = routeForVector(routes, vector.id);
                          return <option value={vector.id} key={vector.id}>{route ? `${routeDisplayName(route)} · ` : ""}{nodeLabel(start)} → {nodeLabel(end)}</option>;
                        })}
                      </select>
                    </label>}
                    {calibrationSourceReady ? <>
                      <div className="field-grid"><label>{calibrationMode === "route" ? "Known route distance" : "Known segment distance"}<input inputMode="decimal" value={calibrationForm.distance} onChange={(event) => setCalibrationForm((current) => ({ ...current, distance: event.target.value }))}/></label><label>Unit<select value={calibrationForm.unit} onChange={(event) => setCalibrationForm((current) => ({ ...current, unit: event.target.value as Unit }))}>{Object.entries(UNIT_LABEL).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label></div>
                      <button className="secondary-button full-width" onClick={calibrateMap}><SoundingsIcon name="calibrate"/>Set map scale</button>
                    </> : <p className="drawer-copy">Select a complete {calibrationMode === "route" ? "route" : "segment"} with visible length to establish real-world scale.</p>}
                  </details>
                </> : surveyTab === "points" ? <>
                  <div className="point-toolbar"><label className="point-search"><span className="sr-only">Search points</span><input type="search" value={pointSearch} placeholder="Search points" onChange={(event) => setPointSearch(event.target.value)}/></label><div className="point-filters" aria-label="Point filters">{(["all", "named", "unnamed"] as PointFilter[]).map((filter) => <button className={pointFilter === filter ? "active" : ""} key={filter} onClick={() => setPointFilter(filter)}>{filter[0].toUpperCase() + filter.slice(1)}</button>)}</div><div className="point-capture-actions"><button onClick={beginPointPlacement}><SoundingsIcon name="point"/>Add point</button></div></div>
                  <div className="survey-point-list" aria-label="Points">{filteredPoints.map((point) => { const memberships = routeMembershipsForPoint(point.id); return <button className={selectedId === point.id ? "active" : ""} key={point.id} onClick={() => { setSelectedId(point.id); setSelectedVectorId(null); setSelectedRouteId(null); setSelectedRouteVertexId(null); setSelectedFeatureId(null); }}><span className="point-list-marker">{point.symbol ? <PointSymbolImage symbol={point.symbol}/> : point.label}</span><span><b>{point.name?.trim() || point.label}</b><small>{point.name?.trim() ? point.label : "Point of interest"}{memberships.length ? ` · ${memberships.map(({ route }) => routeDisplayName(route)).join(", ")}` : " · Not assigned"}</small></span><em>{formatDepth(point, project.depthUnit)}</em></button>; })}{!filteredPoints.length && <div className="empty-panel"><SoundingsIcon name="point"/><h3>No matching points</h3><p>Change the search or filter, or add a point on the map.</p></div>}</div>
                  {pointInspector}
                  <div className="survey-data-actions"><button className="secondary-button" onClick={openPointTableWindow}><SoundingsIcon name="table"/>Open data table</button><button className="secondary-button" onClick={exportFieldCapture}><SoundingsIcon name="export"/>Share field capture</button></div>
                </> : <>
                  <section className="survey-feature-editor">
                    <div className="survey-section-title"><span>Map features</span><button onClick={openFeatureModePicker}>＋ Draw feature</button></div>
                    <ul className="feature-list" aria-label="Map features">
                      {project.geographicFeatures.map((feature, index) => <li key={feature.id}><button className={`feature-list-item${selectedFeatureId === feature.id ? " active" : ""}`} aria-selected={selectedFeatureId === feature.id} onClick={() => selectGeographicFeature(feature.id, false)}><span><b>{feature.name.trim() || `Untitled feature ${index + 1}`}</b><small>{GEOGRAPHIC_FEATURE_MODE_LABELS[feature.mode]} · {feature.closed ? "Closed" : "Open"}</small></span><i className="feature-list-swatch" aria-hidden="true" style={{ "--feature-list-color": feature.style.color, "--feature-list-width": `${feature.style.width}px`, "--feature-list-dash": featureDashArray(feature.style.dash, feature.style.width, 1) || "none" } as CSSProperties}/></button></li>)}
                      {project.floatingTexts.map((item) => <li key={item.id}><button className={`feature-list-item${selectedFeatureId === item.id ? " active" : ""}`} aria-selected={selectedFeatureId === item.id} onClick={() => selectFloatingText(item.id, false)}><span><b>{item.text.split("\n")[0] || "Text"}</b><small>Floating text · {item.size} px · {item.rotation}°</small></span><i className="feature-list-text-swatch" aria-hidden="true">Ab</i></button></li>)}
                    </ul>
                    {!mapFeatureCount && <div className="empty-panel"><SoundingsIcon name="feature"/><h3>No map features</h3><p>Draw a freehand trace, smooth spline, connected line, or floating text without changing the shoreline or routes.</p></div>}
                  </section>
                  {featureInspector}
                </>}
              </div>
            </>}

            {activePanel === "export" && <>
              <PanelHeading icon="export" title="Export" onClose={() => setActivePanel(null)}/>
              <div className="drawer-body">
                <p className="drawer-copy lead">Choose the crop and detail included when you print or save a PDF.</p>
                <div className="print-area-controls"><button className={tool === "printArea" ? "active" : ""} onClick={() => { setTool("printArea"); setActivePanel(null); setNotice("Drag a rectangle over the map to set the PDF print area."); }}>{printArea ? "Redraw print area" : "Set print area"}</button>{printArea && <button onClick={() => mutate((current) => { delete current.printArea; return current; })}>Clear print area</button>}</div>
                {printArea && <p className="print-area-note">Selected area: {Math.round(printArea.width)} × {Math.round(printArea.height)} map pixels{matchCurrentMap ? "" : ` · ${printPoints.length} point${printPoints.length === 1 ? "" : "s"} in PDF`}</p>}
                <div className="drawer-section name-placement-section">
                  <h3>PDF layout</h3>
                  <div className="name-placement-options" role="radiogroup" aria-label="PDF layout">
                    <label className={namePlacement === "asPositioned" ? "active" : ""}><input className="name-placement-radio" type="radio" name="pdf-name-placement" value="asPositioned" checked={namePlacement === "asPositioned"} onChange={() => setNamePlacement("asPositioned")}/><span><b>Match current map</b><small>Prints the visible map layers at their current positions and proportions.</small></span></label>
                    <label className={namePlacement === "smartCallouts" ? "active" : ""}><input className="name-placement-radio" type="radio" name="pdf-name-placement" value="smartCallouts" checked={namePlacement === "smartCallouts"} onChange={() => setNamePlacement("smartCallouts")}/><span><b>Optimized chart</b><small>Uses independent PDF layers and smart callouts for page readability.</small></span></label>
                  </div>
                </div>
                {matchCurrentMap ? <div className="drawer-section export-settings current-map-export-settings">
                  <h3>Map layers</h3>
                  <p className="drawer-copy">The PDF uses the layers currently visible on the map. Point markers remain visible, just as they do in the editor.</p>
                  <button className="secondary-button full-width" onClick={() => { setLayersOpen(true); setActivePanel(null); }}><SoundingsIcon name="layers"/>Change map layers</button>
                  <div className="export-grid appendix-only-toggle"><label><input type="checkbox" checked={exportSettings.pointTable} onChange={(event) => setExportSetting("pointTable", event.target.checked)}/>Details appendix</label></div>
                </div> : <>
                  <div className="drawer-section export-presets">
                    <h3>Readability presets</h3>
                    <div className="button-row"><button onClick={() => applyExportPreset("clean")}>Clean chart</button><button onClick={() => applyExportPreset("full")}>Full survey detail</button></div>
                    <p className="drawer-copy">Presets update the existing layer choices without changing the PDF layout.</p>
                  </div>
                  <div className="drawer-section export-settings">
                    <h3>PDF layers</h3>
                    <div className="export-grid">{([ ["reference", "Reference image"], ["shoreline", "Shoreline"], ["geographicFeatures", "Map features"], ["geographicFeatureLabels", "Feature labels"], ["floatingText", "Floating text"], ["routes", "Route lines"], ["routeLabels", "Route bearings & distances"], ["routeNameLabels", "Named route labels"], ["pointMarkers", "Point markers"], ["pointNames", "Point Names (P1, P2)"], ["fullPointNames", "Names (Swim platform)"], ["depths", "Depths"], ["mapFurniture", "North arrow & scale"], ["pointTable", "Details appendix"] ] as Array<[ExportToggleKey, string]>).map(([setting, label]) => {
                      const disabled = (setting === "routeLabels" || setting === "routeNameLabels") ? !exportSettings.routes : setting === "geographicFeatureLabels" ? !exportSettings.geographicFeatures : false;
                      return <label className={disabled ? "dependent-disabled" : ""} key={setting}><input type="checkbox" checked={exportSettings[setting]} disabled={disabled} onChange={(event) => setExportSetting(setting, event.target.checked)}/>{label}</label>;
                    })}</div>
                  </div>
                </>}
                {smartCalloutOverflowIds.length > 0 && <p className="callout-overflow-message" id="callout-overflow-message" role="alert"><b>{smartCalloutOverflowIds.length} Name{smartCalloutOverflowIds.length === 1 ? "" : "s"} need more room.</b> Reduce the print area or hide Names before exporting.</p>}
                <button className="primary-button export-print" disabled={smartCalloutOverflowIds.length > 0 || isPreparingPrint} aria-describedby={smartCalloutOverflowIds.length ? "callout-overflow-message" : undefined} onClick={() => void prepareAndPrint()}><SoundingsIcon name="export"/>{isPreparingPrint ? "Preparing PDF…" : "Print / Save PDF"}</button>
                <p className="print-note">{matchCurrentMap ? "Prints the current map layers inside the selected area." : smartCalloutsActive ? "Names will print in connected callout rails." : "Print with selected settings"}</p>
              </div>
            </>}
          </aside>}

          {captureImportReview && <div className="capture-review-backdrop print-hidden" role="presentation"><section className="capture-review" role="dialog" aria-modal="true" aria-labelledby="capture-review-title"><header><div><span>Field capture merge</span><h2 id="capture-review-title">Review {captureImportReview.packageValue.sourceProjectTitle}</h2></div><button className="close-button" aria-label="Cancel field capture merge" onClick={() => setCaptureImportReview(null)}><SoundingsIcon name="close"/></button></header><div className="capture-review-body"><p>{captureImportReview.additions.length} new point{captureImportReview.additions.length === 1 ? "" : "s"} will be added. Existing desktop values remain selected unless you explicitly use a field update below.</p>{captureImportReview.conflicts.length > 0 && <fieldset><legend>Existing point conflicts</legend>{captureImportReview.conflicts.map((point) => <label key={point.id}><input type="checkbox" checked={captureConflictIds.has(point.id)} onChange={(event) => setCaptureConflictIds((current) => { const next = new Set(current); if (event.target.checked) next.add(point.id); else next.delete(point.id); return next; })}/><span><b>{point.label}{point.name ? ` · ${point.name}` : ""}</b><small>{eventualFieldDraftSummary(point.fieldDraft, project.distanceUnit)}</small></span></label>)}</fieldset>}</div><footer><button className="secondary-button" onClick={() => setCaptureImportReview(null)}>Cancel</button><button className="primary-button" onClick={applyFieldCaptureMerge}>Merge field capture</button></footer></section></div>}

          {pendingDeletePoint && <div className="capture-review-backdrop print-hidden" role="presentation"><section className="capture-review" role="dialog" aria-modal="true" aria-labelledby="delete-point-title"><header><div><span>Attached point of interest</span><h2 id="delete-point-title">Delete {pendingDeletePoint.label}?</h2></div><button className="close-button" aria-label="Cancel point deletion" onClick={() => setPendingDeletePointId(null)}><SoundingsIcon name="close"/></button></header><div className="capture-review-body"><p>This point is part of route geometry. Choose whether the connected route should remain intact.</p><div className="delete-point-choices"><button className="action-row" onClick={() => removePointPreservingRoutes(pendingDeletePoint.id)}><SoundingsIcon name="point"/><span><b>Remove POI, keep routes</b><small>Preserve this location as an unlabeled route vertex.</small></span></button><button className="action-row" onClick={() => removePointAndRouteLegs(pendingDeletePoint.id)}><SoundingsIcon name="trash"/><span><b>Delete attached route legs</b><small>Remove every incident segment and normalize affected routes.</small></span></button></div></div><footer><button className="secondary-button" onClick={() => setPendingDeletePointId(null)}>Cancel</button></footer></section></div>}

          {visibleLayers.mapFurniture && <><div className="screen-north print-hidden"><b>N</b><svg viewBox="0 0 34 56" aria-hidden="true"><path d="M17 2 31 46 17 39 3 46 17 2Z"/><path d="m17 2 14 44-14-7V2Z"/></svg></div><div className="screen-scale print-hidden" style={{ "--screen-scale-bar-width": `${screenBar.printedPixels}px` } as CSSProperties}><div className="scale-labels"><span>0</span><span>{formatScaleNumber(screenBar.value / 2)}</span><span>{formatScaleNumber(screenBar.value)} {project.distanceUnit}</span></div><i/></div></>}
          <div className="zoom-controls print-hidden"><button aria-label="Zoom out" onClick={() => changeMapZoom(1 / 1.25)}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => changeMapZoom(1.25)}>＋</button><button className="recenter-button" aria-label="Recenter map" onClick={fitEntireMapToStage}><SoundingsIcon name="recenter"/></button></div>
          <div className="map-readout print-hidden"><span>{formatNumber(mapScale(project))} m / px</span><span>{project.waypoints.length} {project.waypoints.length === 1 ? "point" : "points"}</span><span>{routes.length} {routes.length === 1 ? "route" : "routes"}</span><span>{mapFeatureCount} {mapFeatureCount === 1 ? "feature" : "features"}</span></div>
        </div>
          <div className="print-sheet-footer"><span>Distance: {UNIT_LABEL[project.distanceUnit]} · Depth: {UNIT_LABEL[project.depthUnit]}</span><span>Calibration: {formatNumber(mapScale(project))} m per map px</span></div>
        </section>
        <section className={`print-details${exportClass(printSettings.pointTable)}`}>
          <header className="print-appendix-header"><div><span>Details appendix</span><h2>{project.title}</h2></div><time dateTime={project.date}>{formatProjectDate(project.date)}</time></header>
          <section className="print-appendix-section print-notes"><h3>Notes</h3><p>{project.notes.trim() || "No project notes."}</p></section>
          <section className="print-appendix-section"><h3>Points</h3>{printPointTableChunks.map((pointsChunk, chunkIndex) => <table className="print-point-table-chunk" key={`points-${chunkIndex}`}>
            {chunkIndex > 0 && <caption>Points — continued</caption>}
            <thead><tr><th>Point</th><th>Name</th><th>Depth</th><th>Map position (px)</th></tr></thead>
            <tbody>{pointsChunk.length ? pointsChunk.map((point) => <tr key={point.id}><td>{point.label}</td><td>{point.name || "—"}</td><td>{formatDepth(point, project.depthUnit)}</td><td>{Math.round(point.x)}, {Math.round(point.y)}</td></tr>) : <tr><td colSpan={4}>No points fall inside the selected map area.</td></tr>}</tbody>
          </table>)}</section>
          {routeLegRows.length > 0 && <section className="print-appendix-section"><h3>Ordered route-leg schedule</h3><table><thead><tr><th>Route</th><th>Leg</th><th>From</th><th>To</th><th>Bearing</th><th>Distance</th></tr></thead><tbody>{routeLegRows.map((row) => <tr key={`${row.routeId}-${row.leg}-${row.vectorId}`}><td>{row.routeName}</td><td>{row.leg}</td><td>{row.fromLabel}</td><td>{row.toLabel}</td><td>{Math.round(row.bearing)}°</td><td>{formatNumber(row.distance)} {row.unit}</td></tr>)}</tbody></table></section>}
          {usedSymbolLegend.length > 0 && <section className="print-appendix-section"><h3>Symbols used</h3><ul className="print-symbol-legend">{usedSymbolLegend.map((symbol) => <li key={symbol.id}><PointSymbolImage className="print-legend-symbol" symbol={symbol.id}/><span>{symbol.label}</span></li>)}</ul></section>}
        </section>
      </section>
    </main>
  );
}
