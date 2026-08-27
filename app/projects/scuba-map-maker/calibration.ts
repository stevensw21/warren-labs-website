import type { RoutePoint, RouteStep, RouteVector, SavedRoute } from "./route-model";

export type CalibrationSourceMode = "route" | "segment";
export type CalibrationDistanceUnit = "ft" | "m" | "mi";
export type CalibrationPoint = RoutePoint;
export type CalibrationVector = RouteVector;
export type CalibrationRoute = Pick<SavedRoute, "id" | "steps">;
export type CalibrationRouteStep = Pick<RouteStep, "vectorId" | "reversed">;
export type CalibrationReference = {
  routeId?: string;
  vectorId?: string;
  distance?: number;
  unit?: CalibrationDistanceUnit;
  metersPerPixel: number;
};

export const METERS_PER_CALIBRATION_UNIT: Readonly<Record<CalibrationDistanceUnit, number>> = {
  ft: 0.3048,
  m: 1,
  mi: 1609.344,
};

export function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finitePoint(point: CalibrationPoint | undefined): point is CalibrationPoint {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function segmentPixelLengthFromMap(
  vector: CalibrationVector,
  pointById: ReadonlyMap<string, CalibrationPoint>,
): number | undefined {
  const start = pointById.get(vector.fromId);
  const end = pointById.get(vector.toId);
  if (!finitePoint(start) || !finitePoint(end)) return undefined;

  const length = Math.hypot(end.x - start.x, end.y - start.y);
  return Number.isFinite(length) ? length : undefined;
}

/** Returns the unscaled Euclidean length of one stored route segment. */
export function segmentPixelLength(
  vector: CalibrationVector,
  points: readonly CalibrationPoint[],
): number | undefined {
  return segmentPixelLengthFromMap(vector, new Map(points.map((point) => [point.id, point])));
}

/**
 * Returns the unscaled length of an ordered route. Every stored step contributes
 * once, including reversed, repeated, and closing steps. Missing geometry makes
 * the whole source invalid rather than silently producing a partial length.
 */
export function routePixelLength(
  route: { steps: readonly CalibrationRouteStep[] },
  vectors: readonly CalibrationVector[],
  points: readonly CalibrationPoint[],
): number | undefined {
  if (!route.steps.length) return undefined;

  const vectorById = new Map(vectors.map((vector) => [vector.id, vector]));
  const pointById = new Map(points.map((point) => [point.id, point]));
  let total = 0;

  for (const step of route.steps) {
    const vector = vectorById.get(step.vectorId);
    if (!vector) return undefined;
    const length = segmentPixelLengthFromMap(vector, pointById);
    if (length === undefined) return undefined;
    total += length;
    if (!Number.isFinite(total)) return undefined;
  }

  return total;
}

/** Converts a known real-world source length and its raw pixel length to map scale. */
export function metersPerPixel(
  distance: number,
  unit: CalibrationDistanceUnit,
  pixelLength: number,
): number | undefined {
  const unitMeters = METERS_PER_CALIBRATION_UNIT[unit];
  if (!isFinitePositive(distance) || !isFinitePositive(unitMeters) || !isFinitePositive(pixelLength)) return undefined;

  const scale = (distance * unitMeters) / pixelLength;
  return isFinitePositive(scale) ? scale : undefined;
}

/** Resolves exactly one stored route or segment reference to its current raw length. */
export function calibrationReferencePixelLength(
  reference: Pick<CalibrationReference, "routeId" | "vectorId">,
  routes: readonly CalibrationRoute[],
  vectors: readonly CalibrationVector[],
  points: readonly CalibrationPoint[],
): number | undefined {
  const hasRoute = typeof reference.routeId === "string" && reference.routeId.length > 0;
  const hasVector = typeof reference.vectorId === "string" && reference.vectorId.length > 0;
  if (hasRoute === hasVector) return undefined;
  if (hasRoute) {
    const route = routes.find((candidate) => candidate.id === reference.routeId);
    return route ? routePixelLength(route, vectors, points) : undefined;
  }
  const vector = vectors.find((candidate) => candidate.id === reference.vectorId);
  return vector ? segmentPixelLength(vector, points) : undefined;
}

/** Checks whether source metadata still describes the geometry used to set the fixed map scale. */
export function calibrationReferenceIsCurrent(
  reference: CalibrationReference,
  routes: readonly CalibrationRoute[],
  vectors: readonly CalibrationVector[],
  points: readonly CalibrationPoint[],
): boolean {
  if (!isFinitePositive(reference.distance) || !reference.unit || !isFinitePositive(reference.metersPerPixel)) return false;
  const sourcePixels = calibrationReferencePixelLength(reference, routes, vectors, points);
  const expectedPixels = (reference.distance * METERS_PER_CALIBRATION_UNIT[reference.unit]) / reference.metersPerPixel;
  const tolerance = Math.max(1e-6, expectedPixels * 1e-6);
  return isFinitePositive(sourcePixels)
    && isFinitePositive(expectedPixels)
    && Math.abs(sourcePixels - expectedPixels) <= tolerance;
}
