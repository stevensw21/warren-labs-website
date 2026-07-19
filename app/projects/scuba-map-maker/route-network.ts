export type RouteNetworkPoint = { id: string; x: number; y: number };
export type RouteNetworkVector = { id: string; fromId: string; toId: string };

type RouteEdge = { key: string; a: string; b: string; vectorIds: string[] };
export type RoutePath = { key: string; pointIds: string[]; closed: boolean };
export type RouteNetwork = { paths: RoutePath[]; branchPointIds: string[] };

const edgeKey = (a: string, b: string) => a < b ? `${a}\0${b}` : `${b}\0${a}`;

/**
 * Builds display-only route topology. Persisted vectors stay directed and
 * independent, while reverse/duplicate edges share one visible base stroke.
 */
export function buildRouteNetwork(points: readonly RouteNetworkPoint[], vectors: readonly RouteNetworkVector[]): RouteNetwork {
  const pointById = new Map(points.map((point) => [point.id, point]));
  const edges = new Map<string, RouteEdge>();

  for (const vector of vectors) {
    const start = pointById.get(vector.fromId);
    const end = pointById.get(vector.toId);
    if (!start || !end || !Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(end.x) || !Number.isFinite(end.y)) continue;
    if (Math.hypot(end.x - start.x, end.y - start.y) === 0) continue;

    const key = edgeKey(vector.fromId, vector.toId);
    const existing = edges.get(key);
    if (existing) {
      existing.vectorIds.push(vector.id);
      continue;
    }

    const [a, b] = vector.fromId < vector.toId ? [vector.fromId, vector.toId] : [vector.toId, vector.fromId];
    edges.set(key, { key, a, b, vectorIds: [vector.id] });
  }

  const adjacency = new Map<string, RouteEdge[]>();
  const attach = (pointId: string, edge: RouteEdge) => adjacency.set(pointId, [...(adjacency.get(pointId) ?? []), edge]);
  for (const edge of edges.values()) {
    attach(edge.a, edge);
    attach(edge.b, edge);
  }

  const visited = new Set<string>();
  const paths: RoutePath[] = [];
  const otherPoint = (edge: RouteEdge, pointId: string) => edge.a === pointId ? edge.b : edge.a;

  // Start at every terminal or branch and continue through degree-two points.
  for (const [startId, incident] of adjacency) {
    if (incident.length === 2) continue;
    for (const seed of incident) {
      if (visited.has(seed.key)) continue;
      const pointIds = [startId];
      let currentId = startId;
      let edge: RouteEdge | undefined = seed;

      while (edge && !visited.has(edge.key)) {
        const previousEdgeKey: string = edge.key;
        visited.add(previousEdgeKey);
        const nextId = otherPoint(edge, currentId);
        pointIds.push(nextId);
        const nextEdges = adjacency.get(nextId) ?? [];
        if (nextEdges.length !== 2) break;
        currentId = nextId;
        edge = nextEdges.find((candidate) => candidate.key !== previousEdgeKey && !visited.has(candidate.key));
      }

      if (pointIds.length >= 2) paths.push({ key: `open:${seed.key}`, pointIds, closed: false });
    }
  }

  // Anything left is an all-degree-two cycle. Close it with SVG Z so its
  // first and last edges receive a real join instead of overlapping caps.
  for (const seed of edges.values()) {
    if (visited.has(seed.key)) continue;
    const startId = seed.a;
    const pointIds = [startId];
    let currentId = startId;
    let edge: RouteEdge | undefined = seed;
    let closed = false;

    while (edge && !visited.has(edge.key)) {
      const previousEdgeKey: string = edge.key;
      visited.add(previousEdgeKey);
      const nextId = otherPoint(edge, currentId);
      if (nextId === startId) {
        closed = true;
        break;
      }
      pointIds.push(nextId);
      currentId = nextId;
      edge = (adjacency.get(currentId) ?? []).find((candidate) => candidate.key !== previousEdgeKey && !visited.has(candidate.key));
    }

    if (pointIds.length >= 2) paths.push({ key: `${closed ? "cycle" : "fallback"}:${seed.key}`, pointIds, closed });
  }

  return {
    paths,
    branchPointIds: [...adjacency].filter(([, incident]) => incident.length >= 3).map(([pointId]) => pointId),
  };
}
