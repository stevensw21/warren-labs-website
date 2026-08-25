export type RouteTopologyNode = { id: string; x: number; y: number };
export type RouteVertex = RouteTopologyNode;
export type RouteTopologyVector = { id: string; fromId: string; toId: string };
export type RouteTopologyStep = { vectorId: string; reversed: boolean };
export type RouteTopologyRoute = { id: string; name: string; steps: RouteTopologyStep[] };
export type RouteTopologyIdFactory = (seed: string) => string;

export type PlanarizeRouteTopologyOptions = {
  /** Coordinate tolerance used for coincident nodes and on-segment tests. */
  epsilon?: number;
  /** Injectable so callers can use their persisted UUID strategy. */
  createId?: RouteTopologyIdFactory;
};

export type PlanarizedRouteTopology<
  P extends RouteTopologyNode,
  RV extends RouteVertex,
  V extends RouteTopologyVector,
  R extends RouteTopologyRoute,
> = {
  points: P[];
  routeVertices: RV[];
  vectors: V[];
  routes: R[];
  splitVectorIds: string[];
};

type Point2D = { x: number; y: number };
type KnownNode = RouteTopologyNode & { kind: "point" | "vertex"; generated: boolean };
type SplitMark = { t: number; nodeId: string };
type Segment<V extends RouteTopologyVector> = {
  inputIndex: number;
  vector: V;
  start: KnownNode;
  end: KnownNode;
  dx: number;
  dy: number;
  length: number;
};

const DEFAULT_EPSILON = 1e-9;

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
const dot = (ax: number, ay: number, bx: number, by: number) => ax * bx + ay * by;
const distance = (left: Point2D, right: Point2D) => Math.hypot(right.x - left.x, right.y - left.y);
const finiteNode = (node: RouteTopologyNode) => Number.isFinite(node.x) && Number.isFinite(node.y);
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

function normalizedEpsilon(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_EPSILON;
}

function nodeRank(node: KnownNode): number {
  if (node.kind === "point") return 0;
  return node.generated ? 2 : 1;
}

function compareKnownNodes(left: KnownNode, right: KnownNode): number {
  return nodeRank(left) - nodeRank(right)
    || compareText(left.id, right.id)
    || left.x - right.x
    || left.y - right.y;
}

function unusedId(seed: string, usedIds: Set<string>, createId?: RouteTopologyIdFactory): string {
  const proposed = createId?.(seed);
  const base = typeof proposed === "string" && proposed.trim() ? proposed.trim() : seed;
  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }

  let suffix = 2;
  while (usedIds.has(`${base}~${suffix}`)) suffix += 1;
  const result = `${base}~${suffix}`;
  usedIds.add(result);
  return result;
}

function coordinateSeed(value: number): string {
  if (Object.is(value, -0)) return "0";
  return Number.isInteger(value) ? String(value) : value.toPrecision(15).replace(/(?:\.0+|(?:(\.[0-9]*?)0+))$/, "$1");
}

function parameterOnSegment<V extends RouteTopologyVector>(segment: Segment<V>, point: Point2D): number {
  return dot(point.x - segment.start.x, point.y - segment.start.y, segment.dx, segment.dy) / (segment.length * segment.length);
}

function pointAt<V extends RouteTopologyVector>(segment: Segment<V>, t: number): Point2D {
  return { x: segment.start.x + segment.dx * t, y: segment.start.y + segment.dy * t };
}

function pointOnSegment<V extends RouteTopologyVector>(segment: Segment<V>, point: Point2D, epsilon: number): number | undefined {
  const t = parameterOnSegment(segment, point);
  const parameterTolerance = epsilon / Math.max(segment.length, epsilon);
  if (t < -parameterTolerance || t > 1 + parameterTolerance) return undefined;
  const projected = pointAt(segment, clampUnit(t));
  return distance(projected, point) <= epsilon ? clampUnit(t) : undefined;
}

/**
 * Splits route vectors into a planar graph without creating map POIs.
 *
 * Existing POIs win when several nodes share a coordinate. Every original
 * vector keeps its ID on the first piece in stored direction; later pieces
 * clone all additional vector fields and receive IDs from `createId`.
 */
export function planarizeRouteTopology<
  P extends RouteTopologyNode,
  RV extends RouteVertex,
  V extends RouteTopologyVector,
  R extends RouteTopologyRoute,
>(
  points: readonly P[],
  routeVertices: readonly RV[],
  vectors: readonly V[],
  routes: readonly R[],
  options: PlanarizeRouteTopologyOptions = {},
): PlanarizedRouteTopology<P, RV, V, R> {
  const epsilon = normalizedEpsilon(options.epsilon);
  const usedIds = new Set<string>([
    ...points.map((point) => point.id),
    ...routeVertices.map((vertex) => vertex.id),
    ...vectors.map((vector) => vector.id),
    ...routes.map((route) => route.id),
  ]);

  const rawNodes: KnownNode[] = [
    ...points.filter(finiteNode).map((point) => ({ id: point.id, x: point.x, y: point.y, kind: "point" as const, generated: false })),
    ...routeVertices.filter(finiteNode).map((vertex) => ({ id: vertex.id, x: vertex.x, y: vertex.y, kind: "vertex" as const, generated: false })),
  ].sort(compareKnownNodes);

  const canonicalNodes: KnownNode[] = [];
  const canonicalIdById = new Map<string, string>();
  for (const node of rawNodes) {
    const duplicate = canonicalNodes.find((candidate) => distance(candidate, node) <= epsilon);
    if (duplicate) {
      canonicalIdById.set(node.id, duplicate.id);
      continue;
    }
    if (canonicalIdById.has(node.id)) continue;
    canonicalNodes.push(node);
    canonicalIdById.set(node.id, node.id);
  }

  const nodeById = new Map(canonicalNodes.map((node) => [node.id, node]));
  const createdVertices: RV[] = [];

  const resolveNodeAt = (position: Point2D, seedIds: readonly string[]): KnownNode => {
    const existing = canonicalNodes
      .filter((node) => distance(node, position) <= epsilon)
      .sort(compareKnownNodes)[0];
    if (existing) return existing;

    const sortedSeeds = [...seedIds].sort(compareText).map(encodeURIComponent).join(":");
    const seed = `route-vertex:${sortedSeeds}:${coordinateSeed(position.x)},${coordinateSeed(position.y)}`;
    const id = unusedId(seed, usedIds, options.createId);
    const node: KnownNode = { id, x: position.x, y: position.y, kind: "vertex", generated: true };
    canonicalNodes.push(node);
    nodeById.set(id, node);
    createdVertices.push({ id, x: position.x, y: position.y } as RV);
    return node;
  };

  const normalizedVectors = vectors.map((vector) => ({
    ...vector,
    fromId: canonicalIdById.get(vector.fromId) ?? vector.fromId,
    toId: canonicalIdById.get(vector.toId) ?? vector.toId,
  } as V));

  const removedVectorIds = new Set<string>();
  const segments: Segment<V>[] = [];
  for (let inputIndex = 0; inputIndex < normalizedVectors.length; inputIndex += 1) {
    const vector = normalizedVectors[inputIndex];
    const start = nodeById.get(vector.fromId);
    const end = nodeById.get(vector.toId);
    if (!start || !end) continue;
    const length = distance(start, end);
    if (start.id === end.id || length <= epsilon) {
      removedVectorIds.add(vector.id);
      continue;
    }
    segments.push({
      inputIndex,
      vector,
      start,
      end,
      dx: end.x - start.x,
      dy: end.y - start.y,
      length,
    });
  }

  const marksByVectorId = new Map<string, SplitMark[]>();
  const addMark = (segment: Segment<V>, t: number, nodeId: string) => {
    const marks = marksByVectorId.get(segment.vector.id) ?? [];
    marks.push({ t: clampUnit(t), nodeId });
    marksByVectorId.set(segment.vector.id, marks);
  };

  for (const segment of segments) {
    addMark(segment, 0, segment.start.id);
    addMark(segment, 1, segment.end.id);
  }

  // Every existing POI or route vertex on an interior becomes a shared node.
  // Snapshot here: nodes created by pair intersections are added to all of the
  // relevant vectors during the pair pass below.
  const existingNodes = [...canonicalNodes].sort(compareKnownNodes);
  for (const segment of segments) {
    for (const node of existingNodes) {
      const t = pointOnSegment(segment, node, epsilon);
      if (t === undefined) continue;
      addMark(segment, t, node.id);
    }
  }

  const orderedSegments = [...segments].sort((left, right) => compareText(left.vector.id, right.vector.id) || left.inputIndex - right.inputIndex);
  for (let firstIndex = 0; firstIndex < orderedSegments.length; firstIndex += 1) {
    const first = orderedSegments[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < orderedSegments.length; secondIndex += 1) {
      const second = orderedSegments[secondIndex];
      const crossDirections = cross(first.dx, first.dy, second.dx, second.dy);
      const angularTolerance = epsilon * first.length * second.length;
      const offsetX = second.start.x - first.start.x;
      const offsetY = second.start.y - first.start.y;

      if (Math.abs(crossDirections) > angularTolerance) {
        const firstT = cross(offsetX, offsetY, second.dx, second.dy) / crossDirections;
        const secondT = cross(offsetX, offsetY, first.dx, first.dy) / crossDirections;
        const firstTolerance = epsilon / Math.max(first.length, epsilon);
        const secondTolerance = epsilon / Math.max(second.length, epsilon);
        if (firstT < -firstTolerance || firstT > 1 + firstTolerance || secondT < -secondTolerance || secondT > 1 + secondTolerance) continue;

        const firstPosition = pointAt(first, clampUnit(firstT));
        const secondPosition = pointAt(second, clampUnit(secondT));
        const position = {
          x: (firstPosition.x + secondPosition.x) / 2,
          y: (firstPosition.y + secondPosition.y) / 2,
        };
        const node = resolveNodeAt(position, [first.vector.id, second.vector.id]);
        addMark(first, firstT, node.id);
        addMark(second, secondT, node.id);
        continue;
      }

      // Parallel non-collinear segments never contact. For collinear segments,
      // the endpoints of the common interval are the only required boundaries.
      const lineDistance = Math.abs(cross(offsetX, offsetY, first.dx, first.dy)) / first.length;
      if (lineDistance > epsilon) continue;
      const secondStartT = parameterOnSegment(first, second.start);
      const secondEndT = parameterOnSegment(first, second.end);
      const overlapStart = Math.max(0, Math.min(secondStartT, secondEndT));
      const overlapEnd = Math.min(1, Math.max(secondStartT, secondEndT));
      const firstTolerance = epsilon / Math.max(first.length, epsilon);
      if (overlapEnd < overlapStart - firstTolerance) continue;

      const boundaries = Math.abs(overlapEnd - overlapStart) <= firstTolerance
        ? [clampUnit((overlapStart + overlapEnd) / 2)]
        : [clampUnit(overlapStart), clampUnit(overlapEnd)];
      for (const firstT of boundaries) {
        const position = pointAt(first, firstT);
        const secondT = parameterOnSegment(second, position);
        const node = resolveNodeAt(position, [first.vector.id, second.vector.id]);
        addMark(first, firstT, node.id);
        addMark(second, secondT, node.id);
      }
    }
  }

  const segmentByInputIndex = new Map(segments.map((segment) => [segment.inputIndex, segment]));
  const replacementIdsByVectorId = new Map<string, string[]>();
  const splitVectorIds: string[] = [];
  const outputVectors: V[] = [];

  for (let inputIndex = 0; inputIndex < normalizedVectors.length; inputIndex += 1) {
    const vector = normalizedVectors[inputIndex];
    if (removedVectorIds.has(vector.id)) {
      replacementIdsByVectorId.set(vector.id, []);
      continue;
    }

    const segment = segmentByInputIndex.get(inputIndex);
    if (!segment) {
      const cloned = { ...vector } as V;
      outputVectors.push(cloned);
      replacementIdsByVectorId.set(vector.id, [vector.id]);
      continue;
    }

    const parameterTolerance = epsilon / Math.max(segment.length, epsilon);
    const sortedMarks = [...(marksByVectorId.get(vector.id) ?? [])]
      .sort((left, right) => left.t - right.t || compareText(left.nodeId, right.nodeId));
    const collapsedMarks: SplitMark[] = [];
    for (const mark of sortedMarks) {
      const previous = collapsedMarks[collapsedMarks.length - 1];
      if (!previous || Math.abs(mark.t - previous.t) > parameterTolerance) {
        collapsedMarks.push(mark);
        continue;
      }
      const previousNode = nodeById.get(previous.nodeId);
      const nextNode = nodeById.get(mark.nodeId);
      if (previousNode && nextNode && compareKnownNodes(nextNode, previousNode) < 0) previous.nodeId = nextNode.id;
    }

    const pieceIds: string[] = [];
    for (let markIndex = 0; markIndex + 1 < collapsedMarks.length; markIndex += 1) {
      const fromMark = collapsedMarks[markIndex];
      const toMark = collapsedMarks[markIndex + 1];
      const from = nodeById.get(fromMark.nodeId);
      const to = nodeById.get(toMark.nodeId);
      if (!from || !to || from.id === to.id || distance(from, to) <= epsilon) continue;

      const pieceNumber = pieceIds.length + 1;
      const id = pieceNumber === 1
        ? vector.id
        : unusedId(`vector:${vector.id}:split:${pieceNumber}`, usedIds, options.createId);
      outputVectors.push({ ...vector, id, fromId: from.id, toId: to.id } as V);
      pieceIds.push(id);
    }

    replacementIdsByVectorId.set(vector.id, pieceIds);
    if (pieceIds.length > 1) splitVectorIds.push(vector.id);
  }

  const outputRoutes = routes.map((route) => {
    const steps = route.steps.flatMap((step) => {
      const replacements = replacementIdsByVectorId.get(step.vectorId);
      if (!replacements) return [{ ...step }];
      const ids = step.reversed ? [...replacements].reverse() : replacements;
      return ids.map((vectorId) => ({ ...step, vectorId, reversed: step.reversed === true }));
    });
    return { ...route, steps } as R;
  });

  const referencedNodeIds = new Set(outputVectors.flatMap((vector) => [vector.fromId, vector.toId]));
  const pointIds = new Set(points.map((point) => point.id));
  const retainedVertexIds = new Set<string>();
  const outputRouteVertices: RV[] = [];
  for (const vertex of [...routeVertices, ...createdVertices]) {
    const canonicalId = canonicalIdById.get(vertex.id) ?? vertex.id;
    if (canonicalId !== vertex.id || pointIds.has(vertex.id) || retainedVertexIds.has(vertex.id) || !referencedNodeIds.has(vertex.id)) continue;
    retainedVertexIds.add(vertex.id);
    outputRouteVertices.push({ ...vertex } as RV);
  }

  return {
    points: points.map((point) => ({ ...point })),
    routeVertices: outputRouteVertices,
    vectors: outputVectors,
    routes: outputRoutes,
    splitVectorIds,
  };
}
