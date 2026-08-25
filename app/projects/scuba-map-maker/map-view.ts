export type MapView = { zoom: number; pan: { x: number; y: number } };
export type DockPosition = { left: number; top: number };
export type DockSize = { width: number; height: number };

export const DEFAULT_MAP_ZOOM = 0.78;
export const DEFAULT_MAP_PAN = { x: 22, y: 24 };
export const MAP_FIT_PADDING = 24;

function nonNegativeFinite(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
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

export function fitMapView(stageWidth: number, stageHeight: number, canvasWidth: number, canvasHeight: number): MapView {
  const availableWidth = stageWidth - MAP_FIT_PADDING * 2;
  const availableHeight = stageHeight - MAP_FIT_PADDING * 2;
  const zoom = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);

  if (!Number.isFinite(zoom) || zoom <= DEFAULT_MAP_ZOOM) {
    return { zoom: DEFAULT_MAP_ZOOM, pan: { ...DEFAULT_MAP_PAN } };
  }

  return {
    zoom,
    pan: {
      x: (stageWidth - canvasWidth * zoom) / 2,
      y: (stageHeight - canvasHeight * zoom) / 2,
    },
  };
}
