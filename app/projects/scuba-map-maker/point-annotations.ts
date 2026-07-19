export const POINT_ANNOTATION_KINDS = ["pointName", "name", "depth"] as const;

export type PointAnnotationKind = (typeof POINT_ANNOTATION_KINDS)[number];
export type LabelOffset = { dx: number; dy: number };
export type PointLabelOffsets = Partial<Record<PointAnnotationKind, LabelOffset>>;
export type AnnotationPoint = { x: number; y: number };

export const ZERO_LABEL_OFFSET: Readonly<LabelOffset> = Object.freeze({ dx: 0, dy: 0 });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOffset(value: unknown): LabelOffset | undefined {
  if (!isRecord(value) || typeof value.dx !== "number" || typeof value.dy !== "number") return undefined;
  if (!Number.isFinite(value.dx) || !Number.isFinite(value.dy)) return undefined;
  return { dx: value.dx, dy: value.dy };
}

/**
 * Keeps only finite annotation offsets. Property absence means automatic
 * placement; a zero offset is a valid manual placement at the waypoint center.
 */
export function normalizeLabelOffsets(value: unknown): PointLabelOffsets | undefined {
  if (!isRecord(value)) return undefined;

  const normalized: PointLabelOffsets = {};
  for (const kind of POINT_ANNOTATION_KINDS) {
    const offset = normalizeOffset(value[kind]);
    if (offset) normalized[kind] = offset;
  }

  return Object.keys(normalized).length ? normalized : undefined;
}

export function annotationPosition(point: AnnotationPoint, offset: LabelOffset = ZERO_LABEL_OFFSET): AnnotationPoint {
  return { x: point.x + offset.dx, y: point.y + offset.dy };
}

/**
 * Reprojects a saved map-space offset so its rendered displacement stays the
 * same when moving between differently scaled map surfaces, such as the
 * editor and a cropped PDF export.
 */
export function annotationPositionAtScale(
  point: AnnotationPoint,
  offset: LabelOffset,
  sourceScale: number,
  targetScale: number,
): AnnotationPoint {
  if (!Number.isFinite(sourceScale) || sourceScale <= 0 || !Number.isFinite(targetScale) || targetScale <= 0) {
    return annotationPosition(point, offset);
  }

  const scaleRatio = sourceScale / targetScale;
  return annotationPosition(point, { dx: offset.dx * scaleRatio, dy: offset.dy * scaleRatio });
}
