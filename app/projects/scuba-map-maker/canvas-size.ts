export type CanvasSize = {
  width: number;
  height: number;
};

export const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 1200, height: 800 };
export const MAX_CANVAS_DIMENSION = 10_000;

function normalizeDimension(value: unknown, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return minimum;
  return Math.min(MAX_CANVAS_DIMENSION, Math.max(minimum, Math.round(value)));
}

export function normalizeCanvasSize(raw: unknown): CanvasSize {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Partial<CanvasSize>
    : {};

  return {
    width: normalizeDimension(value.width, DEFAULT_CANVAS_SIZE.width),
    height: normalizeDimension(value.height, DEFAULT_CANVAS_SIZE.height),
  };
}
