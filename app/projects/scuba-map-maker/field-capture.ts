export type FieldCaptureUnit = "ft" | "m" | "mi";

export type FieldDraft = {
  fromPointId?: string;
  bearing?: number;
  distance?: number;
  unit?: FieldCaptureUnit;
  note?: string;
  capturedAt: string;
};

export type CapturedPoint = {
  id: string;
  label: string;
  name?: string;
  symbol?: string;
  x: number;
  y: number;
  depth?: number;
  fieldDraft?: FieldDraft;
};

export type FieldCapturePackage = {
  type: "soundings-field-capture";
  version: 1;
  sourceProjectId: string;
  sourceProjectTitle: string;
  exportedAt: string;
  points: CapturedPoint[];
};

export type FieldCaptureMergePreview = {
  additions: CapturedPoint[];
  conflicts: CapturedPoint[];
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function normalizeDraft(raw: unknown): FieldDraft | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<FieldDraft>;
  const capturedAt = typeof value.capturedAt === "string" && value.capturedAt ? value.capturedAt : new Date(0).toISOString();
  const unit = value.unit === "ft" || value.unit === "m" || value.unit === "mi" ? value.unit : undefined;
  const draft: FieldDraft = { capturedAt };
  if (typeof value.fromPointId === "string" && value.fromPointId) draft.fromPointId = value.fromPointId;
  if (finite(value.bearing)) draft.bearing = value.bearing;
  if (finite(value.distance) && value.distance > 0) draft.distance = value.distance;
  if (unit) draft.unit = unit;
  if (typeof value.note === "string" && value.note.trim()) draft.note = value.note.trim();
  return draft.fromPointId || draft.bearing !== undefined || draft.distance !== undefined || draft.note ? draft : undefined;
}

function normalizeCapturedPoint(raw: unknown): CapturedPoint | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<CapturedPoint>;
  if (typeof value.id !== "string" || !value.id || typeof value.label !== "string" || !value.label.trim() || !finite(value.x) || !finite(value.y)) return undefined;
  const point: CapturedPoint = { id: value.id, label: value.label.trim(), x: value.x, y: value.y };
  if (typeof value.name === "string") point.name = value.name;
  if (typeof value.symbol === "string" && value.symbol) point.symbol = value.symbol;
  if (finite(value.depth)) point.depth = value.depth;
  const fieldDraft = normalizeDraft(value.fieldDraft);
  if (fieldDraft) point.fieldDraft = fieldDraft;
  return point;
}

export function createFieldCapturePackage(project: { id: string; title: string; waypoints: CapturedPoint[] }): FieldCapturePackage {
  return {
    type: "soundings-field-capture",
    version: 1,
    sourceProjectId: project.id,
    sourceProjectTitle: project.title,
    exportedAt: new Date().toISOString(),
    points: project.waypoints.map((point) => ({ ...point, fieldDraft: point.fieldDraft ? { ...point.fieldDraft } : undefined })),
  };
}

export function parseFieldCapturePackage(raw: unknown): FieldCapturePackage {
  if (!raw || typeof raw !== "object") throw new Error("Invalid field capture package");
  const value = raw as Partial<FieldCapturePackage>;
  if (value.type !== "soundings-field-capture" || value.version !== 1 || typeof value.sourceProjectId !== "string" || typeof value.sourceProjectTitle !== "string" || !Array.isArray(value.points)) {
    throw new Error("Unsupported field capture package");
  }
  const points = value.points.map(normalizeCapturedPoint);
  if (points.some((point) => !point)) throw new Error("Invalid captured point");
  return {
    type: "soundings-field-capture",
    version: 1,
    sourceProjectId: value.sourceProjectId,
    sourceProjectTitle: value.sourceProjectTitle,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : new Date(0).toISOString(),
    points: points as CapturedPoint[],
  };
}

export function previewFieldCaptureMerge(existing: ReadonlyArray<{ id: string }>, incoming: ReadonlyArray<CapturedPoint>): FieldCaptureMergePreview {
  const existingIds = new Set(existing.map((point) => point.id));
  return incoming.reduce<FieldCaptureMergePreview>((preview, point) => {
    preview[existingIds.has(point.id) ? "conflicts" : "additions"].push(point);
    return preview;
  }, { additions: [], conflicts: [] });
}

export function mergeFieldCapturePoints<T extends CapturedPoint>(existing: ReadonlyArray<T>, incoming: ReadonlyArray<CapturedPoint>, replaceIds: ReadonlySet<string>): T[] {
  const incomingById = new Map(incoming.map((point) => [point.id, point]));
  const merged = existing.map((point) => {
    const replacement = incomingById.get(point.id);
    if (!replacement || !replaceIds.has(point.id)) return point;
    return { ...point, ...replacement } as T;
  });
  const existingIds = new Set(existing.map((point) => point.id));
  for (const point of incoming) if (!existingIds.has(point.id)) merged.push(point as T);
  return merged;
}
