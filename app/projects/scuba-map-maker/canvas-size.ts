export type CanvasSize = {
  width: number;
  height: number;
};

export const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 1200, height: 800 };
export const MIN_CANVAS_SIZE: CanvasSize = { width: 400, height: 300 };
export const MAX_CANVAS_DIMENSION = 10_000;
export const CANVAS_CONTENT_PADDING = 40;

type CanvasPoint = { x: number; y: number };

function normalizeDimension(value: unknown, fallback: number, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_CANVAS_DIMENSION, Math.max(minimum, Math.round(value)));
}

export function normalizeCanvasSize(raw: unknown): CanvasSize {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Partial<CanvasSize>
    : {};

  return {
    width: normalizeDimension(value.width, DEFAULT_CANVAS_SIZE.width, MIN_CANVAS_SIZE.width),
    height: normalizeDimension(value.height, DEFAULT_CANVAS_SIZE.height, MIN_CANVAS_SIZE.height),
  };
}

export function minimumCanvasSizeForPoints(points: readonly CanvasPoint[], padding = CANVAS_CONTENT_PADDING): CanvasSize {
  let furthestX = 0;
  let furthestY = 0;
  for (const point of points) {
    if (Number.isFinite(point.x)) furthestX = Math.max(furthestX, point.x);
    if (Number.isFinite(point.y)) furthestY = Math.max(furthestY, point.y);
  }
  return {
    width: Math.min(MAX_CANVAS_DIMENSION, Math.max(MIN_CANVAS_SIZE.width, Math.ceil(furthestX + padding))),
    height: Math.min(MAX_CANVAS_DIMENSION, Math.max(MIN_CANVAS_SIZE.height, Math.ceil(furthestY + padding))),
  };
}

export function protectedCanvasResizeMinimum(points: readonly CanvasPoint[], current: CanvasSize): CanvasSize {
  const currentSize = normalizeCanvasSize(current);
  const contentMinimum = minimumCanvasSizeForPoints(points, 0);
  const paddedMinimum = minimumCanvasSizeForPoints(points);
  return {
    width: Math.min(currentSize.width, paddedMinimum.width <= currentSize.width ? paddedMinimum.width : contentMinimum.width),
    height: Math.min(currentSize.height, paddedMinimum.height <= currentSize.height ? paddedMinimum.height : contentMinimum.height),
  };
}
