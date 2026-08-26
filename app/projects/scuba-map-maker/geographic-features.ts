import { DEFAULT_CANVAS_SIZE, normalizeCanvasSize, type CanvasSize } from "./canvas-size.ts";

export type FeaturePoint = { id: string; x: number; y: number };

export type GeographicFeatureMode = "freehand" | "spline" | "polyline";
export type GeographicFeatureDash = "solid" | "dashed" | "dotted";

export type GeographicFeatureStyle = {
  color: string;
  width: number;
  dash: GeographicFeatureDash;
};

export type GeographicFeature = {
  id: string;
  name: string;
  mode: GeographicFeatureMode;
  points: FeaturePoint[];
  closed: boolean;
  style: GeographicFeatureStyle;
};

export type GeographicFeatureLabelAnchor = {
  x: number;
  y: number;
  angleRadians: number;
};

export const DEFAULT_GEOGRAPHIC_FEATURE_STYLE: GeographicFeatureStyle = {
  color: "#4b6f78",
  width: 2,
  dash: "solid",
};

const MIN_FEATURE_WIDTH = 1;
const MAX_FEATURE_WIDTH = 8;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FEATURE_MODES = new Set<GeographicFeatureMode>(["freehand", "spline", "polyline"]);
const FEATURE_DASHES = new Set<GeographicFeatureDash>(["solid", "dashed", "dotted"]);

type UnknownRecord = Record<string, unknown>;
type CubicSegment = {
  start: FeaturePoint;
  control1: { x: number; y: number };
  control2: { x: number; y: number };
  end: FeaturePoint;
};

let fallbackId = 0;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultCreateId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackId += 1;
  return `geographic-feature-${Date.now()}-${fallbackId}`;
}

function stringId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function uniqueId(
  value: unknown,
  used: Set<string>,
  createId: () => string,
  prefix: string,
): string {
  const preferred = stringId(value);
  if (preferred && !used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const generated = stringId(createId());
    if (generated && !used.has(generated)) {
      used.add(generated);
      return generated;
    }
  }

  let suffix = used.size + 1;
  let generated = `${prefix}-${suffix}`;
  while (used.has(generated)) {
    suffix += 1;
    generated = `${prefix}-${suffix}`;
  }
  used.add(generated);
  return generated;
}

function samePosition(left: Pick<FeaturePoint, "x" | "y">, right: Pick<FeaturePoint, "x" | "y">): boolean {
  return left.x === right.x && left.y === right.y;
}

function finitePointRecords(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  const points: UnknownRecord[] = [];

  for (const item of value) {
    if (!isRecord(item) || !Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
    const previous = points.at(-1);
    if (previous && previous.x === item.x && previous.y === item.y) continue;
    points.push(item);
  }

  return points;
}

function normalizeMode(value: unknown): GeographicFeatureMode {
  return typeof value === "string" && FEATURE_MODES.has(value as GeographicFeatureMode)
    ? value as GeographicFeatureMode
    : "polyline";
}

function normalizeStyle(value: unknown): GeographicFeatureStyle {
  const style = isRecord(value) ? value : {};
  const width = typeof style.width === "number" && Number.isFinite(style.width)
    ? Math.min(MAX_FEATURE_WIDTH, Math.max(MIN_FEATURE_WIDTH, style.width))
    : DEFAULT_GEOGRAPHIC_FEATURE_STYLE.width;

  return {
    color: typeof style.color === "string" && HEX_COLOR.test(style.color)
      ? style.color
      : DEFAULT_GEOGRAPHIC_FEATURE_STYLE.color,
    width,
    dash: typeof style.dash === "string" && FEATURE_DASHES.has(style.dash as GeographicFeatureDash)
      ? style.dash as GeographicFeatureDash
      : DEFAULT_GEOGRAPHIC_FEATURE_STYLE.dash,
  };
}

/**
 * Converts persisted or imported data into independent, renderable feature
 * lines. Invalid drawings are dropped, while valid IDs and source ordering are
 * retained. A repeated closing point is represented by `closed`, not stored
 * twice in the point list.
 */
export function normalizeGeographicFeatures(
  raw: unknown,
  createId: () => string = defaultCreateId,
): GeographicFeature[] {
  if (!Array.isArray(raw)) return [];

  const features: GeographicFeature[] = [];
  const featureIds = new Set<string>();
  const pointIds = new Set<string>();

  for (const item of raw) {
    if (!isRecord(item)) continue;
    const pointRecords = finitePointRecords(item.points);
    if (item.closed === true && pointRecords.length > 1) {
      const first = pointRecords[0];
      const last = pointRecords.at(-1)!;
      if (first.x === last.x && first.y === last.y) pointRecords.pop();
    }
    if (pointRecords.length < 2) continue;

    const points = pointRecords.map((point) => ({
      id: uniqueId(point.id, pointIds, createId, "feature-point"),
      x: point.x as number,
      y: point.y as number,
    }));

    features.push({
      id: uniqueId(item.id, featureIds, createId, "geographic-feature"),
      name: typeof item.name === "string" ? item.name.trim() : "",
      mode: normalizeMode(item.mode),
      points,
      closed: item.closed === true && points.length >= 3,
      style: normalizeStyle(item.style),
    });
  }

  return features;
}

function pathPoints(points: readonly FeaturePoint[], closed: boolean): FeaturePoint[] {
  const usable: FeaturePoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (usable.length && samePosition(usable[usable.length - 1], point)) continue;
    usable.push(point);
  }
  if (closed && usable.length > 1 && samePosition(usable[0], usable[usable.length - 1])) usable.pop();
  return usable;
}

function splineSegments(points: readonly FeaturePoint[], closed: boolean): CubicSegment[] {
  if (points.length < 3) return [];
  const count = closed ? points.length : points.length - 1;
  const segments: CubicSegment[] = [];

  for (let index = 0; index < count; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const previous = closed ? points[(index - 1 + points.length) % points.length] : points[index - 1] ?? start;
    const following = closed ? points[(index + 2) % points.length] : points[index + 2] ?? end;
    segments.push({
      start,
      control1: {
        x: start.x + (end.x - previous.x) / 6,
        y: start.y + (end.y - previous.y) / 6,
      },
      control2: {
        x: end.x - (following.x - start.x) / 6,
        y: end.y - (following.y - start.y) / 6,
      },
      end,
    });
  }

  return segments;
}

function formatCoordinate(value: number): string {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function coordinatePair(point: Pick<FeaturePoint, "x" | "y">): string {
  return `${formatCoordinate(point.x)} ${formatCoordinate(point.y)}`;
}

/** Builds an open or closed SVG path without persisting derived path data. */
export function geographicFeaturePath(feature: Pick<GeographicFeature, "mode" | "points" | "closed">): string {
  const points = pathPoints(feature.points, feature.closed);
  if (points.length < 2) return "";
  const closed = feature.closed && points.length >= 3;

  if (feature.mode !== "spline" || points.length === 2) {
    const commands = points.map((point, index) => `${index ? "L" : "M"}${coordinatePair(point)}`);
    return `${commands.join(" ")}${closed ? " Z" : ""}`;
  }

  const segments = splineSegments(points, closed);
  if (!segments.length) return "";
  const commands = segments.map((segment) => `C${coordinatePair(segment.control1)} ${coordinatePair(segment.control2)} ${coordinatePair(segment.end)}`);
  return `M${coordinatePair(points[0])} ${commands.join(" ")}${closed ? " Z" : ""}`;
}

function distanceToSegmentSquared(point: FeaturePoint, start: FeaturePoint, end: FeaturePoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projectedX = start.x + dx * projection;
  const projectedY = start.y + dy * projection;
  return (point.x - projectedX) ** 2 + (point.y - projectedY) ** 2;
}

/** Iterative Ramer-Douglas-Peucker simplification for potentially long pen traces. */
export function simplifyFreehandPoints(points: readonly FeaturePoint[], tolerance: number): FeaturePoint[] {
  const usable = pathPoints(points, false);
  if (usable.length <= 2 || !Number.isFinite(tolerance) || tolerance <= 0) return usable.map((point) => ({ ...point }));

  const keep = new Uint8Array(usable.length);
  keep[0] = 1;
  keep[usable.length - 1] = 1;
  const thresholdSquared = tolerance * tolerance;
  const ranges: Array<[number, number]> = [[0, usable.length - 1]];

  while (ranges.length) {
    const [startIndex, endIndex] = ranges.pop()!;
    let furthestIndex = -1;
    let furthestDistance = thresholdSquared;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = distanceToSegmentSquared(usable[index], usable[startIndex], usable[endIndex]);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }

    if (furthestIndex < 0) continue;
    keep[furthestIndex] = 1;
    ranges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
  }

  return usable.flatMap((point, index) => keep[index] ? [{ ...point }] : []);
}

function cubicPoint(segment: CubicSegment, t: number): { x: number; y: number } {
  const remaining = 1 - t;
  const startWeight = remaining ** 3;
  const firstWeight = 3 * remaining ** 2 * t;
  const secondWeight = 3 * remaining * t ** 2;
  const endWeight = t ** 3;
  return {
    x: segment.start.x * startWeight + segment.control1.x * firstWeight + segment.control2.x * secondWeight + segment.end.x * endWeight,
    y: segment.start.y * startWeight + segment.control1.y * firstWeight + segment.control2.y * secondWeight + segment.end.y * endWeight,
  };
}

function flattenedFeaturePoints(feature: Pick<GeographicFeature, "mode" | "points" | "closed">): Array<{ x: number; y: number }> {
  const points = pathPoints(feature.points, feature.closed);
  if (points.length < 2) return [];
  const closed = feature.closed && points.length >= 3;
  if (feature.mode !== "spline" || points.length === 2) return closed ? [...points, points[0]] : points;

  const segments = splineSegments(points, closed);
  if (!segments.length) return [];
  const flattened: Array<{ x: number; y: number }> = [{ x: segments[0].start.x, y: segments[0].start.y }];
  const samplesPerSegment = 16;
  for (const segment of segments) {
    for (let sample = 1; sample <= samplesPerSegment; sample += 1) {
      flattened.push(cubicPoint(segment, sample / samplesPerSegment));
    }
  }
  return flattened;
}

function uprightAngle(dx: number, dy: number): number {
  let angle = Math.atan2(dy, dx);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  return angle;
}

/** Places a label halfway along visible path length and keeps its tangent readable. */
export function geographicFeatureLabelAnchor(
  feature: Pick<GeographicFeature, "mode" | "points" | "closed">,
): GeographicFeatureLabelAnchor | undefined {
  const points = flattenedFeaturePoints(feature);
  if (points.length < 2) return undefined;

  const segments: Array<{ start: { x: number; y: number }; end: { x: number; y: number }; length: number }> = [];
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (!Number.isFinite(length) || length === 0) continue;
    segments.push({ start, end, length });
    totalLength += length;
  }
  if (!Number.isFinite(totalLength) || totalLength === 0) return undefined;

  const target = totalLength / 2;
  let traveled = 0;
  for (const segment of segments) {
    if (traveled + segment.length < target) {
      traveled += segment.length;
      continue;
    }
    const ratio = Math.max(0, Math.min(1, (target - traveled) / segment.length));
    return {
      x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
      y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      angleRadians: uprightAngle(segment.end.x - segment.start.x, segment.end.y - segment.start.y),
    };
  }

  const last = segments[segments.length - 1];
  return {
    x: last.end.x,
    y: last.end.y,
    angleRadians: uprightAngle(last.end.x - last.start.x, last.end.y - last.start.y),
  };
}

function clampedTranslation(requested: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(requested)) requested = 0;
  if (minimum <= maximum) return Math.min(maximum, Math.max(minimum, requested));
  // A malformed, oversized imported feature cannot fit without distortion.
  // Centering it minimizes overflow while preserving its shape.
  return (minimum + maximum) / 2;
}

/** Moves the whole feature without allowing a valid feature to leave the map. */
export function translateGeographicFeature(
  feature: GeographicFeature,
  deltaX: number,
  deltaY: number,
  bounds: CanvasSize = DEFAULT_CANVAS_SIZE,
): GeographicFeature {
  const finitePoints = feature.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!finitePoints.length) return { ...feature, style: { ...feature.style }, points: feature.points.map((point) => ({ ...point })) };

  const xs = finitePoints.map((point) => point.x);
  const ys = finitePoints.map((point) => point.y);
  const canvasSize = normalizeCanvasSize(bounds);
  const appliedX = clampedTranslation(deltaX, -Math.min(...xs), canvasSize.width - Math.max(...xs));
  const appliedY = clampedTranslation(deltaY, -Math.min(...ys), canvasSize.height - Math.max(...ys));

  return {
    ...feature,
    style: { ...feature.style },
    points: feature.points.map((point) => ({ ...point, x: point.x + appliedX, y: point.y + appliedY })),
  };
}
