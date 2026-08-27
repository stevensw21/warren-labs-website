export type MapView = { zoom: number; pan: { x: number; y: number } };
export type DockPosition = { left: number; top: number };
export type DockSize = { width: number; height: number };

export const DEFAULT_MAP_ZOOM = 0.78;
export const DEFAULT_MAP_PAN = { x: 22, y: 24 };
export const MAP_FIT_PADDING = 24;
export const DEFAULT_VISUAL_SCALE_STOP_ZOOM = 4;
export const MIN_VISUAL_SCALE_STOP_ZOOM = 1;
export const MAX_VISUAL_SCALE_STOP_ZOOM = 8;
export const VISUAL_SCALE_STOP_ZOOM_STEP = 0.5;

function nonNegativeFinite(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function normalizeVisualScaleStopZoom(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_VISUAL_SCALE_STOP_ZOOM;
  const stepped = Math.round(value / VISUAL_SCALE_STOP_ZOOM_STEP) * VISUAL_SCALE_STOP_ZOOM_STEP;
  return Math.min(MAX_VISUAL_SCALE_STOP_ZOOM, Math.max(MIN_VISUAL_SCALE_STOP_ZOOM, stepped));
}

export function pointVisualZoom(zoom: number, stopZoom = DEFAULT_VISUAL_SCALE_STOP_ZOOM) {
  return Math.max(normalizeVisualScaleStopZoom(stopZoom), nonNegativeFinite(zoom));
}

function clampDockAxis(position: number, stageSize: number, dockSize: number, inset: number) {
  const availableTravel = Math.max(0, nonNegativeFinite(stageSize) - nonNegativeFinite(dockSize));
  const safeInset = Math.min(nonNegativeFinite(inset), availableTravel / 2);
  const minimum = safeInset;
  const maximum = availableTravel - safeInset;

  if (position === Number.POSITIVE_INFINITY) return maximum;
  if (!Number.isFinite(position)) return minimum;
  return Math.min(maximum, Math.max(minimum, position));
}

export function clampDockPosition(position: DockPosition, stageSize: DockSize, dockSize: DockSize, inset = 12): DockPosition {
  return {
    left: clampDockAxis(position.left, stageSize.width, dockSize.width, inset),
    top: clampDockAxis(position.top, stageSize.height, dockSize.height, inset),
  };
}

export function fitMapView(stageWidth: number, stageHeight: number, canvasWidth: number, canvasHeight: number, minimumZoom = DEFAULT_MAP_ZOOM): MapView {
  const availableWidth = stageWidth - MAP_FIT_PADDING * 2;
  const availableHeight = stageHeight - MAP_FIT_PADDING * 2;
  const fittedZoom = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);

  if (!Number.isFinite(fittedZoom) || fittedZoom <= 0) {
    return { zoom: DEFAULT_MAP_ZOOM, pan: { ...DEFAULT_MAP_PAN } };
  }

  if (fittedZoom <= minimumZoom && minimumZoom === DEFAULT_MAP_ZOOM) return { zoom: DEFAULT_MAP_ZOOM, pan: { ...DEFAULT_MAP_PAN } };
  const zoom = Math.max(minimumZoom, fittedZoom);

  return {
    zoom,
    pan: {
      x: (stageWidth - canvasWidth * zoom) / 2,
      y: (stageHeight - canvasHeight * zoom) / 2,
    },
  };
}
