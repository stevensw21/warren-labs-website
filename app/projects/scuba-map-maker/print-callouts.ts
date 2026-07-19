export type PrintCalloutSide = "left" | "right";

export type PrintPoint = { x: number; y: number };
export type PrintRect = PrintPoint & { width: number; height: number };

export type PrintCalloutPoint = PrintPoint & {
  id: string;
  text: string;
};

export type PrintCalloutMetrics = {
  fontSize: number;
  characterWidth: number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  railPadding: number;
  calloutGap: number;
  railGap: number;
  leaderBendGap: number;
};

export type PrintCallout = {
  id: string;
  text: string;
  lines: string[];
  side: PrintCalloutSide;
  box: PrintRect;
  leader: [PrintPoint, PrintPoint, PrintPoint, PrintPoint];
};

export type PrintCalloutLayout = {
  mode: "none" | "right" | "both";
  callouts: PrintCallout[];
  overflowIds: string[];
  rails: Record<PrintCalloutSide, PrintRect>;
};

export type PrintCalloutLayoutOptions = {
  frame: PrintRect;
  mapViewport: PrintRect;
  points: readonly PrintCalloutPoint[];
  railWidth: number;
  metrics?: Partial<PrintCalloutMetrics>;
};

const DEFAULT_METRICS: PrintCalloutMetrics = {
  fontSize: 10,
  characterWidth: 6.2,
  lineHeight: 12,
  paddingX: 4,
  paddingY: 3,
  railPadding: 8,
  calloutGap: 4,
  railGap: 8,
  leaderBendGap: 4,
};

type PreparedCallout = PrintCalloutPoint & {
  lines: string[];
  width: number;
  height: number;
};

function right(rect: PrintRect) {
  return rect.x + rect.width;
}

function bottom(rect: PrintRect) {
  return rect.y + rect.height;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function comparePoints(a: PrintCalloutPoint, b: PrintCalloutPoint) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function compareCallouts(a: PrintCallout, b: PrintCallout) {
  if (a.leader[0].y !== b.leader[0].y) return a.leader[0].y - b.leader[0].y;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizedMetrics(overrides?: Partial<PrintCalloutMetrics>): PrintCalloutMetrics {
  const values = { ...DEFAULT_METRICS, ...overrides };
  return {
    fontSize: finitePositive(values.fontSize, DEFAULT_METRICS.fontSize),
    characterWidth: finitePositive(values.characterWidth, DEFAULT_METRICS.characterWidth),
    lineHeight: finitePositive(values.lineHeight, DEFAULT_METRICS.lineHeight),
    paddingX: Math.max(0, Number.isFinite(values.paddingX) ? values.paddingX : DEFAULT_METRICS.paddingX),
    paddingY: Math.max(0, Number.isFinite(values.paddingY) ? values.paddingY : DEFAULT_METRICS.paddingY),
    railPadding: Math.max(0, Number.isFinite(values.railPadding) ? values.railPadding : DEFAULT_METRICS.railPadding),
    calloutGap: Math.max(0, Number.isFinite(values.calloutGap) ? values.calloutGap : DEFAULT_METRICS.calloutGap),
    railGap: Math.max(0, Number.isFinite(values.railGap) ? values.railGap : DEFAULT_METRICS.railGap),
    leaderBendGap: Math.max(0, Number.isFinite(values.leaderBendGap) ? values.leaderBendGap : DEFAULT_METRICS.leaderBendGap),
  };
}

function estimatedTextWidth(text: string, characterWidth: number) {
  return [...text].reduce((width, character) => {
    if (/\s/.test(character)) return width + characterWidth * 0.55;
    if (/[ilI1.,'|:;·]/.test(character)) return width + characterWidth * 0.58;
    if (/[mwMW@%&#]/.test(character)) return width + characterWidth * 1.48;
    if (/[A-Z]/.test(character)) return width + characterWidth * 1.12;
    return width + characterWidth;
  }, 0);
}

/**
 * Estimates wrapping with a fixed character width. Names are kept intact and
 * receive at most two lines; a value that cannot fit is reported as overflow.
 */
function wrapText(text: string, textWidth: number, characterWidth: number): string[] | undefined {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized || textWidth <= 0) return undefined;
  const fits = (value: string) => estimatedTextWidth(value, characterWidth) <= textWidth;
  if (fits(normalized)) return [normalized];

  const wordBreaks: number[] = [];
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === " ") wordBreaks.push(index);
  }
  const characterBreaks = Array.from({ length: normalized.length - 1 }, (_, index) => index + 1);

  for (const breaks of [wordBreaks, characterBreaks]) {
    for (let index = breaks.length - 1; index >= 0; index -= 1) {
      const split = breaks[index];
      const first = normalized.slice(0, split).trimEnd();
      const second = normalized.slice(split).trimStart();
      if (first && second && fits(first) && fits(second)) return [first, second];
    }
  }

  return undefined;
}

function railRects(frame: PrintRect, mapViewport: PrintRect, railWidth: number, railGap: number) {
  const frameRight = right(frame);
  const requestedWidth = finitePositive(railWidth, 0);
  const leftRight = Math.min(frame.x + requestedWidth, mapViewport.x - railGap);
  const rightLeft = Math.max(frameRight - requestedWidth, right(mapViewport) + railGap);

  return {
    left: { x: frame.x, y: frame.y, width: Math.max(0, leftRight - frame.x), height: frame.height },
    right: { x: Math.min(frameRight, rightLeft), y: frame.y, width: Math.max(0, frameRight - rightLeft), height: frame.height },
  } satisfies Record<PrintCalloutSide, PrintRect>;
}

function prepare(point: PrintCalloutPoint, usableWidth: number, metrics: PrintCalloutMetrics): PreparedCallout | undefined {
  const textWidth = usableWidth - metrics.paddingX * 2;
  const lines = wrapText(point.text, textWidth, metrics.characterWidth);
  if (!lines) return undefined;
  const measuredTextWidth = Math.max(...lines.map((line) => estimatedTextWidth(line, metrics.characterWidth)));
  return {
    ...point,
    text: point.text.trim().replace(/\s+/g, " "),
    lines,
    width: Math.min(usableWidth, measuredTextWidth + metrics.paddingX * 2),
    height: lines.length * metrics.lineHeight + metrics.paddingY * 2,
  };
}

function usedHeight(entries: readonly PreparedCallout[], gap: number) {
  return entries.reduce((total, entry) => total + entry.height, 0) + Math.max(0, entries.length - 1) * gap;
}

function railCapacity(rail: PrintRect, metrics: PrintCalloutMetrics) {
  return Math.max(0, rail.height - metrics.railPadding * 2);
}

function pack(entries: readonly PreparedCallout[], rail: PrintRect, metrics: PrintCalloutMetrics) {
  if (usedHeight(entries, metrics.calloutGap) > railCapacity(rail, metrics) + 1e-9) return undefined;
  if (!entries.length) return new Map<string, number>();

  const top = rail.y + metrics.railPadding;
  const lowerBound = bottom(rail) - metrics.railPadding;
  const positions = entries.map((entry) => clamp(entry.y - entry.height / 2, top, lowerBound - entry.height));

  for (let index = 1; index < entries.length; index += 1) {
    positions[index] = Math.max(positions[index], positions[index - 1] + entries[index - 1].height + metrics.calloutGap);
  }

  positions[positions.length - 1] = Math.min(positions[positions.length - 1], lowerBound - entries[entries.length - 1].height);
  for (let index = entries.length - 2; index >= 0; index -= 1) {
    positions[index] = Math.min(positions[index], positions[index + 1] - metrics.calloutGap - entries[index].height);
  }

  return new Map(entries.map((entry, index) => [entry.id, positions[index]]));
}

function buildCallouts(
  side: PrintCalloutSide,
  entries: readonly PreparedCallout[],
  rail: PrintRect,
  mapViewport: PrintRect,
  metrics: PrintCalloutMetrics,
): PrintCallout[] {
  const sorted = [...entries].sort(comparePoints);
  const positions = pack(sorted, rail, metrics);
  if (!positions) return [];

  return sorted.map((entry) => {
    const boxX = side === "right"
      ? rail.x + metrics.railPadding
      : right(rail) - metrics.railPadding - entry.width;
    const box = { x: boxX, y: positions.get(entry.id)!, width: entry.width, height: entry.height };
    const attachment = {
      x: side === "right" ? box.x : right(box),
      y: box.y + box.height / 2,
    };
    const availableGap = side === "right"
      ? Math.max(0, attachment.x - right(mapViewport))
      : Math.max(0, mapViewport.x - attachment.x);
    const bendDistance = Math.min(metrics.leaderBendGap, availableGap / 2);
    const gutter = {
      x: side === "right" ? right(mapViewport) + bendDistance : mapViewport.x - bendDistance,
      y: attachment.y,
    };
    const exit = { x: gutter.x, y: entry.y };

    return {
      id: entry.id,
      text: entry.text,
      lines: entry.lines,
      side,
      box,
      leader: [{ x: entry.x, y: entry.y }, exit, gutter, attachment],
    };
  });
}

function rebalance(
  entries: readonly PreparedCallout[],
  mapViewport: PrintRect,
  capacity: number,
  gap: number,
) {
  const centerX = mapViewport.x + mapViewport.width / 2;
  const left = entries.filter((entry) => entry.x < centerX);
  const rightEntries = entries.filter((entry) => entry.x >= centerX);

  const excess = (items: readonly PreparedCallout[]) => Math.max(0, usedHeight(items, gap) - capacity);
  for (let attempts = 0; attempts < entries.length; attempts += 1) {
    const leftExcess = excess(left);
    const rightExcess = excess(rightEntries);
    if (leftExcess === 0 && rightExcess === 0) break;

    const source = leftExcess >= rightExcess ? left : rightEntries;
    const target = source === left ? rightEntries : left;
    const currentWorst = Math.max(leftExcess, rightExcess);
    const candidates = source.map((entry) => {
      const nextSource = source.filter((candidate) => candidate.id !== entry.id);
      const nextTarget = [...target, entry];
      const nextLeft = source === left ? nextSource : nextTarget;
      const nextRight = source === left ? nextTarget : nextSource;
      return {
        entry,
        nextWorst: Math.max(excess(nextLeft), excess(nextRight)),
        attachmentPenalty: Math.abs(entry.x - centerX),
      };
    }).filter((candidate) => candidate.nextWorst < currentWorst).sort((a, b) =>
      a.nextWorst - b.nextWorst || a.attachmentPenalty - b.attachmentPenalty || comparePoints(a.entry, b.entry));

    const move = candidates[0]?.entry;
    if (!move) break;
    source.splice(source.findIndex((entry) => entry.id === move.id), 1);
    target.push(move);
  }

  const overflow: PreparedCallout[] = [];
  for (const side of [left, rightEntries]) {
    side.sort(comparePoints);
    while (usedHeight(side, gap) > capacity + 1e-9 && side.length) {
      overflow.push(side.pop()!);
    }
  }

  return { left: left.sort(comparePoints), right: rightEntries.sort(comparePoints), overflow };
}

/**
 * Lays out physical-PDF callouts in a right rail first, then in balanced side
 * rails when one rail cannot hold the complete vertical stack. No input is
 * mutated and equal-y labels are ordered by id for reproducible PDFs.
 */
export function layoutPrintCallouts(options: PrintCalloutLayoutOptions): PrintCalloutLayout {
  const metrics = normalizedMetrics(options.metrics);
  const rails = railRects(options.frame, options.mapViewport, options.railWidth, metrics.railGap);
  const points = [...options.points].sort(comparePoints);
  if (!points.length) return { mode: "none", callouts: [], overflowIds: [], rails };

  const rightUsableWidth = Math.max(0, rails.right.width - metrics.railPadding * 2);
  const rightEntries: PreparedCallout[] = [];
  const rightOverflowIds: string[] = [];
  for (const point of points) {
    const entry = prepare(point, rightUsableWidth, metrics);
    if (entry) rightEntries.push(entry);
    else rightOverflowIds.push(point.id);
  }

  if (!rightOverflowIds.length && pack(rightEntries, rails.right, metrics)) {
    return {
      mode: "right",
      callouts: buildCallouts("right", rightEntries, rails.right, options.mapViewport, metrics),
      overflowIds: [],
      rails,
    };
  }

  const commonUsableWidth = Math.max(0, Math.min(rails.left.width, rails.right.width) - metrics.railPadding * 2);
  const entries: PreparedCallout[] = [];
  const overflowIds: string[] = [];
  for (const point of points) {
    const entry = prepare(point, commonUsableWidth, metrics);
    if (entry) entries.push(entry);
    else overflowIds.push(point.id);
  }

  const capacity = Math.min(railCapacity(rails.left, metrics), railCapacity(rails.right, metrics));
  const balanced = rebalance(entries, options.mapViewport, capacity, metrics.calloutGap);
  overflowIds.push(...balanced.overflow.map((entry) => entry.id));

  return {
    mode: "both",
    callouts: [
      ...buildCallouts("left", balanced.left, rails.left, options.mapViewport, metrics),
      ...buildCallouts("right", balanced.right, rails.right, options.mapViewport, metrics),
    ].sort(compareCallouts),
    overflowIds: [...new Set(overflowIds)].sort(),
    rails,
  };
}
