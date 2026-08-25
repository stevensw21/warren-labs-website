export type MapView = { zoom: number; pan: { x: number; y: number } };

export const DEFAULT_MAP_ZOOM = 0.78;
export const DEFAULT_MAP_PAN = { x: 22, y: 24 };
export const MAP_FIT_PADDING = 24;

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
