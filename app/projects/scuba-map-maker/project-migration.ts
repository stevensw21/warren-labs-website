export type LegacyWaypoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  name?: string;
  symbol?: string;
  depth?: number;
  fieldDraft?: unknown;
  labelOffsets?: unknown;
};

export type LegacyVector = {
  fromId: string;
  toId: string;
};

export type RouteVertex = {
  id: string;
  x: number;
  y: number;
};

export type LegacyWaypointMigration<W extends LegacyWaypoint = LegacyWaypoint> = {
  waypoints: W[];
  routeVertices: RouteVertex[];
  convertedPointIds: string[];
};

const GENERATED_POINT_LABEL = /^P\d+$/i;

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonemptyFieldDraft(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.keys(value).length > 0;
}

function physicalEdgeKey(left: string, right: string): string {
  return left < right ? JSON.stringify([left, right]) : JSON.stringify([right, left]);
}

/**
 * Separates intentional legacy POIs from generated points that only described
 * route geometry. Vector degree counts each undirected physical edge once, so
 * duplicate or reverse vectors cannot turn a terminal into an interior node.
 */
export function migrateLegacyWaypoints<W extends LegacyWaypoint, V extends LegacyVector>(
  waypoints: readonly W[],
  vectors: readonly V[],
): LegacyWaypointMigration<W> {
  const pointIds = new Set(waypoints.map((point) => point.id));
  const incidentEdges = new Map<string, Set<string>>();
  const seenEdges = new Set<string>();

  for (const vector of vectors) {
    const { fromId, toId } = vector;
    if (
      typeof fromId !== "string"
      || typeof toId !== "string"
      || !pointIds.has(fromId)
      || !pointIds.has(toId)
      || fromId === toId
    ) continue;

    const edge = physicalEdgeKey(fromId, toId);
    if (seenEdges.has(edge)) continue;
    seenEdges.add(edge);
    if (!incidentEdges.has(fromId)) incidentEdges.set(fromId, new Set());
    if (!incidentEdges.has(toId)) incidentEdges.set(toId, new Set());
    incidentEdges.get(fromId)!.add(edge);
    incidentEdges.get(toId)!.add(edge);
  }

  const keptWaypoints: W[] = [];
  const routeVertices: RouteVertex[] = [];
  const convertedPointIds: string[] = [];

  for (const point of waypoints) {
    const degree = incidentEdges.get(point.id)?.size ?? 0;
    const generatedLabel = typeof point.label === "string" && GENERATED_POINT_LABEL.test(point.label);
    const hasPoiMetadata = hasText(point.name)
      || hasText(point.symbol)
      || (typeof point.depth === "number" && Number.isFinite(point.depth))
      || hasNonemptyFieldDraft(point.fieldDraft)
      || (point.labelOffsets !== undefined && point.labelOffsets !== null);
    const convert = point.label !== "A0"
      && point.id !== "A0"
      && generatedLabel
      && !hasPoiMetadata
      && degree >= 2;

    if (convert) {
      routeVertices.push({ id: point.id, x: point.x, y: point.y });
      convertedPointIds.push(point.id);
    } else {
      keptWaypoints.push({ ...point });
    }
  }

  return { waypoints: keptWaypoints, routeVertices, convertedPointIds };
}
