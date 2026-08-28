export type PrintSource = { x: number; y: number; width: number; height: number };
export type PrintViewport = { x: number; y: number; width: number; height: number };

export type PrintProjection = {
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
  originX: number;
  originY: number;
  canvasOffsetX: number;
  canvasOffsetY: number;
};

export type ExactPrintClipGeometry = {
  viewport: PrintViewport;
  canvasOffsetX: number;
  canvasOffsetY: number;
};

export type ScaleBarSpec = {
  value: number;
  printedPixels: number;
  sourcePixels: number;
};

export type PrintLayoutMode = "map" | "rightRail" | "dualRail";

export const PRINT_CHART_FRAME: PrintViewport = { x: 0, y: 0, width: 980, height: 640 };
export const PRINT_CHART_INSET = 16;
export const PRINT_CALLOUT_GAP = 12;
export const PRINT_CALLOUT_RAIL_WIDTH = 156;

const SCALE_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });

export function formatScaleNumber(value: number) {
  return SCALE_NUMBER_FORMATTER.format(value);
}

const positive = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? value : fallback;

export function printViewportFor(mode: PrintLayoutMode): PrintViewport {
  const content = {
    x: PRINT_CHART_INSET,
    y: PRINT_CHART_INSET,
    width: PRINT_CHART_FRAME.width - PRINT_CHART_INSET * 2,
    height: PRINT_CHART_FRAME.height - PRINT_CHART_INSET * 2,
  };
  if (mode === "rightRail") {
    return { ...content, width: content.width - PRINT_CALLOUT_RAIL_WIDTH - PRINT_CALLOUT_GAP };
  }
  if (mode === "dualRail") {
    return {
      ...content,
      x: content.x + PRINT_CALLOUT_RAIL_WIDTH + PRINT_CALLOUT_GAP,
      width: content.width - (PRINT_CALLOUT_RAIL_WIDTH + PRINT_CALLOUT_GAP) * 2,
    };
  }
  return content;
}

export function createPrintProjection(source: PrintSource, viewport: PrintViewport): PrintProjection {
  const sourceWidth = positive(source.width, 1);
  const sourceHeight = positive(source.height, 1);
  const viewportWidth = positive(viewport.width, 1);
  const viewportHeight = positive(viewport.height, 1);
  const scale = Math.min(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const originX = viewport.x + (viewportWidth - renderedWidth) / 2;
  const originY = viewport.y + (viewportHeight - renderedHeight) / 2;
  return {
    scale,
    renderedWidth,
    renderedHeight,
    originX,
    originY,
    canvasOffsetX: originX - viewport.x - source.x * scale,
    canvasOffsetY: originY - viewport.y - source.y * scale,
  };
}

/**
 * Converts a fitted projection into the exact painted crop box. Letterboxing
 * stays outside the clipping viewport, and the selected source origin maps
 * directly to its top-left corner without a border consuming map pixels.
 */
export function exactPrintClipGeometry(source: PrintSource, projection: PrintProjection): ExactPrintClipGeometry {
  return {
    viewport: {
      x: projection.originX,
      y: projection.originY,
      width: projection.renderedWidth,
      height: projection.renderedHeight,
    },
    canvasOffsetX: -source.x * projection.scale,
    canvasOffsetY: -source.y * projection.scale,
  };
}

const scaleCandidates = (target: number, factors: readonly number[]) => {
  const exponent = Math.floor(Math.log10(positive(target, 1)));
  const candidates: number[] = [];
  for (let power = exponent - 3; power <= exponent + 3; power += 1) {
    const magnitude = 10 ** power;
    factors.forEach((factor) => candidates.push(factor * magnitude));
  }
  return candidates;
};

/**
 * Selects a conventional 1–2–5 distance whose physical bar is 90–150 px.
 * A 2.5 fallback closes the unavoidable gaps in the strict 1–2–5 series for
 * extreme crops while retaining a familiar, easily divided round number.
 */
export function chooseScaleBar(
  metersPerSourcePixel: number,
  metersPerUnit: number,
  projectionScale: number,
  minPrintedPixels = 90,
  maxPrintedPixels = 150,
): ScaleBarSpec {
  const metersPerPixel = positive(metersPerSourcePixel, 1);
  const unitMeters = positive(metersPerUnit, 1);
  const scale = positive(projectionScale, 1);
  const minPixels = positive(Math.min(minPrintedPixels, maxPrintedPixels), 90);
  const maxPixels = positive(Math.max(minPrintedPixels, maxPrintedPixels), 150);
  const targetPixels = (minPixels + maxPixels) / 2;
  const printedPixelsPerUnit = unitMeters * scale / metersPerPixel;
  const targetValue = targetPixels / printedPixelsPerUnit;
  const select = (factors: readonly number[]) => scaleCandidates(targetValue, factors)
    .filter((value) => {
      const pixels = value * printedPixelsPerUnit;
      return pixels >= minPixels - 1e-9 && pixels <= maxPixels + 1e-9;
    })
    .sort((a, b) => Math.abs(a * printedPixelsPerUnit - targetPixels) - Math.abs(b * printedPixelsPerUnit - targetPixels))[0];
  const value = select([1, 2, 5]) ?? select([1, 2, 2.5, 5]) ?? scaleCandidates(targetValue, [1, 2, 5])
    .sort((a, b) => Math.abs(a * printedPixelsPerUnit - targetPixels) - Math.abs(b * printedPixelsPerUnit - targetPixels))[0];
  const printedPixels = value * printedPixelsPerUnit;
  return { value, printedPixels, sourcePixels: value * unitMeters / metersPerPixel };
}
