export type RouteStep = { vectorId: string; reversed: boolean };
export type SavedRoute = { id: string; name: string; steps: RouteStep[] };

export type RoutePoint = { id: string; x: number; y: number };
export type RouteVector = { id: string; fromId: string; toId: string };
export type RouteRect = { x: number; y: number; width: number; height: number };
export type RouteIdFactory = (seed: string) => string;

export type RouteEndpoints = { startId: string; endId: string; closed: boolean };
export type RouteEndpointKind = "start" | "end" | "both";

export type RouteLabelAnchor = {
  routeId: string;
  vectorId: string;
  stepIndex: number;
  x: number;
  y: number;
  angleRadians: number;
  length: number;
  visibleLength: number;
  clipped: boolean;
};

export type RouteValidationIssue = {
  code: "duplicate-route-id" | "empty-route" | "missing-vector" | "duplicate-vector" | "discontinuous-route" | "unassigned-vector";
  routeId?: string;
  vectorId?: string;
  stepIndex?: number;
};

export type RouteValidation = { valid: boolean; issues: RouteValidationIssue[] };

export type NormalizeRoutesOptions = { createId?: RouteIdFactory };
export type SplitRouteOptions<P extends RoutePoint = RoutePoint> = {
  points?: readonly P[];
  createId?: RouteIdFactory;
};
export type CreateRouteOptions = {
  name?: string;
  reversed?: boolean;
  createId?: RouteIdFactory;
};
export type JoinRoutesOptions<V extends RouteVector = RouteVector> = {
  connectingVector?: V;
  id?: string;
  name?: string;
};

type RouteFragment = { steps: RouteStep[]; sourceIndex: number };
type TopologyEdge<V extends RouteVector> = { key: string; a: string; b: string; vector: V };

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const edgeKey = (left: string, right: string) => left < right ? `${left}\0${right}` : `${right}\0${left}`;
const cleanName = (name: unknown) => typeof name === "string" ? name.trim() : "";
const cloneStep = (step: RouteStep): RouteStep => ({ vectorId: step.vectorId, reversed: step.reversed });

function sortedUniqueVectors<V extends RouteVector>(vectors: readonly V[]): V[] {
  const seen = new Set<string>();
  return [...vectors]
    .filter((vector) => typeof vector.id === "string" && !seen.has(vector.id) && seen.add(vector.id))
    .sort((left, right) => compareText(left.id, right.id));
}

function stepSignature(steps: readonly RouteStep[]) {
  return steps.map((step) => `${encodeURIComponent(step.vectorId)}${step.reversed ? "~r" : "~f"}`).join("/");
}

/** Stable route IDs used only for deterministic legacy migration and fallback repair. */
export function deterministicRouteId(steps: readonly Pick<RouteStep, "vectorId">[]): string {
  const vectorIds = steps.map((step) => encodeURIComponent(step.vectorId));
  return `route:${vectorIds.join("/") || "empty"}`;
}

function unusedId(preferred: string, used: Set<string>): string {
  const base = preferred.trim() || "route:empty";
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}~${suffix}`)) suffix += 1;
  return `${base}~${suffix}`;
}

function freshRouteId(steps: readonly RouteStep[], used: Set<string>, createId?: RouteIdFactory): string {
  const seed = deterministicRouteId(steps);
  const proposed = createId?.(seed);
  return unusedId(typeof proposed === "string" && proposed.trim() ? proposed : seed, used);
}

export function routeStepPointIds<V extends RouteVector>(step: RouteStep, vector: V): { startId: string; endId: string } {
  return step.reversed
    ? { startId: vector.toId, endId: vector.fromId }
    : { startId: vector.fromId, endId: vector.toId };
}

export function routePointIds<V extends RouteVector>(route: Pick<SavedRoute, "steps">, vectors: readonly V[]): string[] {
  if (!route.steps.length) return [];
  const vectorById = new Map(vectors.map((vector) => [vector.id, vector]));
  const pointIds: string[] = [];

  for (const rawStep of route.steps) {
    const vector = vectorById.get(rawStep.vectorId);
    if (!vector) return [];
    const endpoints = routeStepPointIds({ vectorId: rawStep.vectorId, reversed: rawStep.reversed === true }, vector);
    if (!pointIds.length) pointIds.push(endpoints.startId, endpoints.endId);
    else {
      if (pointIds[pointIds.length - 1] !== endpoints.startId) return [];
      pointIds.push(endpoints.endId);
    }
  }

  return pointIds;
}

export function routeEndpoints<V extends RouteVector>(route: Pick<SavedRoute, "steps">, vectors: readonly V[]): RouteEndpoints | undefined {
  const pointIds = routePointIds(route, vectors);
  if (pointIds.length < 2) return undefined;
  return {
    startId: pointIds[0],
    endId: pointIds[pointIds.length - 1],
    closed: pointIds[0] === pointIds[pointIds.length - 1],
  };
}

export function routeEndpointKind<V extends RouteVector>(route: Pick<SavedRoute, "steps">, pointId: string, vectors: readonly V[]): RouteEndpointKind | undefined {
  const endpoints = routeEndpoints(route, vectors);
  if (!endpoints) return undefined;
  const atStart = endpoints.startId === pointId;
  const atEnd = endpoints.endId === pointId;
  if (atStart && atEnd) return "both";
  if (atStart) return "start";
  if (atEnd) return "end";
  return undefined;
}

export function routeForVector(routes: readonly SavedRoute[], vectorId: string): SavedRoute | undefined {
  return routes.find((route) => route.steps.some((step) => step.vectorId === vectorId));
}

export function validateRoutes<V extends RouteVector>(routes: readonly SavedRoute[], vectors: readonly V[]): RouteValidation {
  const issues: RouteValidationIssue[] = [];
  const routeIds = new Set<string>();
  const vectorIds = new Set(vectors.map((vector) => vector.id));
  const assigned = new Set<string>();

  for (const route of routes) {
    if (routeIds.has(route.id)) issues.push({ code: "duplicate-route-id", routeId: route.id });
    routeIds.add(route.id);
    if (!route.steps.length) issues.push({ code: "empty-route", routeId: route.id });

    let previousEndId: string | undefined;
    for (let stepIndex = 0; stepIndex < route.steps.length; stepIndex += 1) {
      const step = route.steps[stepIndex];
      const vector = vectors.find((candidate) => candidate.id === step.vectorId);
      if (!vectorIds.has(step.vectorId) || !vector) {
        issues.push({ code: "missing-vector", routeId: route.id, vectorId: step.vectorId, stepIndex });
        previousEndId = undefined;
        continue;
      }
      if (assigned.has(step.vectorId)) issues.push({ code: "duplicate-vector", routeId: route.id, vectorId: step.vectorId, stepIndex });
      else assigned.add(step.vectorId);

      const endpoints = routeStepPointIds(step, vector);
      if (previousEndId !== undefined && previousEndId !== endpoints.startId) {
        issues.push({ code: "discontinuous-route", routeId: route.id, vectorId: step.vectorId, stepIndex });
      }
      previousEndId = endpoints.endId;
    }
  }

  for (const vector of sortedUniqueVectors(vectors)) {
    if (!assigned.has(vector.id)) issues.push({ code: "unassigned-vector", vectorId: vector.id });
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Converts legacy independent vectors into maximal non-branching routes.
 * Parallel/reverse duplicates never influence branch degree: the lowest-ID
 * vector represents that physical edge and each extra remains its own route.
 */
export function migrateLegacyRoutes<P extends RoutePoint, V extends RouteVector>(points: readonly P[], vectors: readonly V[]): SavedRoute[] {
  const pointIds = new Set(points.map((point) => point.id));
  const edgeGroups = new Map<string, V[]>();
  const singleVectors: V[] = [];

  for (const vector of sortedUniqueVectors(vectors)) {
    if (!pointIds.has(vector.fromId) || !pointIds.has(vector.toId) || vector.fromId === vector.toId) {
      singleVectors.push(vector);
      continue;
    }
    const key = edgeKey(vector.fromId, vector.toId);
    edgeGroups.set(key, [...(edgeGroups.get(key) ?? []), vector]);
  }

  const edges: TopologyEdge<V>[] = [];
  for (const [key, group] of [...edgeGroups].sort(([left], [right]) => compareText(left, right))) {
    const [primary, ...extras] = group.sort((left, right) => compareText(left.id, right.id));
    const [a, b] = primary.fromId < primary.toId ? [primary.fromId, primary.toId] : [primary.toId, primary.fromId];
    edges.push({ key, a, b, vector: primary });
    singleVectors.push(...extras);
  }
  edges.sort((left, right) => compareText(left.vector.id, right.vector.id));

  const adjacency = new Map<string, TopologyEdge<V>[]>();
  for (const edge of edges) {
    adjacency.set(edge.a, [...(adjacency.get(edge.a) ?? []), edge]);
    adjacency.set(edge.b, [...(adjacency.get(edge.b) ?? []), edge]);
  }
  for (const incident of adjacency.values()) incident.sort((left, right) => compareText(left.vector.id, right.vector.id));

  const visited = new Set<string>();
  const migratedSteps: RouteStep[][] = [];
  const otherPoint = (edge: TopologyEdge<V>, pointId: string) => edge.a === pointId ? edge.b : edge.a;
  const stepFrom = (edge: TopologyEdge<V>, startId: string): RouteStep => ({
    vectorId: edge.vector.id,
    reversed: edge.vector.fromId !== startId,
  });

  const starts = [...adjacency]
    .filter(([, incident]) => incident.length !== 2)
    .map(([pointId]) => pointId)
    .sort(compareText);

  for (const startId of starts) {
    for (const seed of adjacency.get(startId) ?? []) {
      if (visited.has(seed.key)) continue;
      const steps: RouteStep[] = [];
      let currentId = startId;
      let edge: TopologyEdge<V> | undefined = seed;

      while (edge && !visited.has(edge.key)) {
        visited.add(edge.key);
        steps.push(stepFrom(edge, currentId));
        const nextId = otherPoint(edge, currentId);
        if ((adjacency.get(nextId)?.length ?? 0) !== 2) break;
        currentId = nextId;
        edge = (adjacency.get(nextId) ?? []).find((candidate) => !visited.has(candidate.key));
      }
      if (steps.length) migratedSteps.push(steps);
    }
  }

  // Every unvisited primary edge belongs to an all-degree-two cycle.
  for (const seed of edges) {
    if (visited.has(seed.key)) continue;
    const steps: RouteStep[] = [];
    const startId = seed.a;
    let currentId = startId;
    let edge: TopologyEdge<V> | undefined = seed;

    while (edge && !visited.has(edge.key)) {
      visited.add(edge.key);
      steps.push(stepFrom(edge, currentId));
      currentId = otherPoint(edge, currentId);
      if (currentId === startId) break;
      edge = (adjacency.get(currentId) ?? []).find((candidate) => !visited.has(candidate.key));
    }
    if (steps.length) migratedSteps.push(steps);
  }

  migratedSteps.push(...singleVectors
    .sort((left, right) => compareText(left.id, right.id))
    .map((vector) => [{ vectorId: vector.id, reversed: false }]));

  return migratedSteps
    .map((steps) => ({ id: deterministicRouteId(steps), name: "", steps }))
    .sort((left, right) => compareText(left.steps[0]?.vectorId ?? "", right.steps[0]?.vectorId ?? ""));
}

function fragmentRoute<V extends RouteVector>(route: Pick<SavedRoute, "steps">, vectorById: ReadonlyMap<string, V>, unavailable?: Set<string>): RouteFragment[] {
  const fragments: RouteFragment[] = [];
  const localSeen = new Set<string>();
  let steps: RouteStep[] = [];
  let sourceIndex = 0;
  let previousEndId: string | undefined;

  const flush = () => {
    if (steps.length) fragments.push({ steps, sourceIndex });
    steps = [];
    previousEndId = undefined;
  };

  route.steps.forEach((rawStep, index) => {
    if (!rawStep || typeof rawStep.vectorId !== "string") {
      flush();
      return;
    }
    const vector = vectorById.get(rawStep.vectorId);
    if (!vector || localSeen.has(rawStep.vectorId) || unavailable?.has(rawStep.vectorId)) {
      flush();
      return;
    }

    const step = { vectorId: rawStep.vectorId, reversed: rawStep.reversed === true };
    const endpoints = routeStepPointIds(step, vector);
    if (steps.length && previousEndId !== endpoints.startId) flush();
    if (!steps.length) sourceIndex = index;
    steps.push(step);
    localSeen.add(step.vectorId);
    unavailable?.add(step.vectorId);
    previousEndId = endpoints.endId;
  });
  flush();
  return fragments;
}

function fragmentLength<P extends RoutePoint, V extends RouteVector>(fragment: RouteFragment, points: readonly P[] | undefined, vectors: readonly V[]): number {
  if (!points) return fragment.steps.length;
  const pointById = new Map(points.map((point) => [point.id, point]));
  const vectorById = new Map(vectors.map((vector) => [vector.id, vector]));
  return fragment.steps.reduce((total, step) => {
    const vector = vectorById.get(step.vectorId);
    const start = vector && pointById.get(vector.fromId);
    const end = vector && pointById.get(vector.toId);
    if (!start || !end || !Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(end.x) || !Number.isFinite(end.y)) return total;
    return total + Math.hypot(end.x - start.x, end.y - start.y);
  }, 0);
}

function longestFragmentIndex<P extends RoutePoint, V extends RouteVector>(fragments: readonly RouteFragment[], points: readonly P[] | undefined, vectors: readonly V[]): number {
  let bestIndex = 0;
  let bestLength = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < fragments.length; index += 1) {
    const length = fragmentLength(fragments[index], points, vectors);
    if (length > bestLength) {
      bestIndex = index;
      bestLength = length;
    }
  }
  return bestIndex;
}

export function splitRoute<P extends RoutePoint, V extends RouteVector>(route: SavedRoute, vectors: readonly V[], options: SplitRouteOptions<P> = {}): SavedRoute[] {
  const vectorById = new Map(vectors.map((vector) => [vector.id, vector]));
  const fragments = fragmentRoute(route, vectorById);
  if (!fragments.length) return [];
  const retainedIndex = longestFragmentIndex(fragments, options.points, vectors);
  const used = new Set<string>();
  const retainedId = unusedId(route.id, used);
  const name = cleanName(route.name);

  return fragments.map((fragment, index) => {
    const id = index === retainedIndex ? retainedId : freshRouteId(fragment.steps, used, options.createId);
    used.add(id);
    return { id, name, steps: fragment.steps.map(cloneStep) };
  });
}

/**
 * Repairs persisted routes without merging distinct saved routes. Missing and
 * duplicate references become hard split points; every unassigned vector is
 * then migrated into a new deterministic route group.
 */
export function normalizeRoutes<P extends RoutePoint, V extends RouteVector>(
  points: readonly P[],
  vectors: readonly V[],
  routes?: readonly SavedRoute[],
  options: NormalizeRoutesOptions = {},
): SavedRoute[] {
  if (!routes?.length) return migrateLegacyRoutes(points, vectors);

  const vectorById = new Map(sortedUniqueVectors(vectors).map((vector) => [vector.id, vector]));
  const assigned = new Set<string>();
  const usedIds = new Set<string>();
  const normalized: SavedRoute[] = [];

  for (const route of routes) {
    const fragments = fragmentRoute(route, vectorById, assigned);
    if (!fragments.length) continue;
    const retainedIndex = longestFragmentIndex(fragments, points, vectors);
    const preferredId = typeof route.id === "string" ? route.id : "";
    const name = cleanName(route.name);

    fragments.forEach((fragment, index) => {
      let id: string;
      if (index === retainedIndex && preferredId.trim() && !usedIds.has(preferredId.trim())) id = preferredId.trim();
      else id = freshRouteId(fragment.steps, usedIds, options.createId);
      usedIds.add(id);
      normalized.push({ id, name, steps: fragment.steps.map(cloneStep) });
    });
  }

  const unassigned = sortedUniqueVectors(vectors).filter((vector) => !assigned.has(vector.id));
  for (const route of migrateLegacyRoutes(points, unassigned)) {
    const id = freshRouteId(route.steps, usedIds, options.createId);
    usedIds.add(id);
    normalized.push({ ...route, id, steps: route.steps.map(cloneStep) });
  }

  return normalized;
}

export function createRoute<V extends RouteVector>(vector: V, options: CreateRouteOptions = {}): SavedRoute {
  const step = { vectorId: vector.id, reversed: options.reversed === true };
  const proposed = options.createId?.(deterministicRouteId([step]));
  return {
    id: typeof proposed === "string" && proposed.trim() ? proposed.trim() : deterministicRouteId([step]),
    name: cleanName(options.name),
    steps: [step],
  };
}

export function reverseRoute(route: SavedRoute): SavedRoute {
  return {
    id: route.id,
    name: cleanName(route.name),
    steps: [...route.steps].reverse().map((step) => ({ vectorId: step.vectorId, reversed: !step.reversed })),
  };
}

export function canAppendVector<V extends RouteVector>(route: SavedRoute, vector: V, vectors: readonly V[]): boolean {
  if (route.steps.some((step) => step.vectorId === vector.id)) return false;
  const endpoints = routeEndpoints(route, vectors);
  if (!endpoints || endpoints.closed) return false;
  return vector.fromId === endpoints.endId || vector.toId === endpoints.endId;
}

export function appendVectorToRoute<V extends RouteVector>(route: SavedRoute, vector: V, vectors: readonly V[]): SavedRoute | undefined {
  if (!canAppendVector(route, vector, vectors)) return undefined;
  const endpoints = routeEndpoints(route, vectors)!;
  const step = { vectorId: vector.id, reversed: vector.toId === endpoints.endId };
  return {
    id: route.id,
    name: cleanName(route.name),
    steps: [...route.steps.map(cloneStep), step],
  };
}

export const appendVector = appendVectorToRoute;

function routeVariants<V extends RouteVector>(route: SavedRoute, vectors: readonly V[]) {
  const variants = [route, reverseRoute(route)];
  const unique = new Map<string, { route: SavedRoute; pointIds: string[] }>();
  for (const variant of variants) {
    const pointIds = routePointIds(variant, vectors);
    if (pointIds.length < 2) continue;
    unique.set(stepSignature(variant.steps), { route: variant, pointIds });
  }
  return [...unique.values()];
}

/**
 * Joins two open routes at matching endpoints, optionally across a new bridge
 * vector. Both routes and the bridge are reoriented as needed. The first
 * route's ID is retained unless an explicit ID is supplied.
 */
export function joinRoutes<V extends RouteVector>(
  first: SavedRoute,
  second: SavedRoute,
  vectors: readonly V[],
  options: JoinRoutesOptions<V> = {},
): SavedRoute | undefined {
  if (first.id === second.id) return undefined;
  const firstVectorIds = new Set(first.steps.map((step) => step.vectorId));
  if (second.steps.some((step) => firstVectorIds.has(step.vectorId))) return undefined;
  const bridge = options.connectingVector;
  if (bridge && (firstVectorIds.has(bridge.id) || second.steps.some((step) => step.vectorId === bridge.id))) return undefined;

  const allVectors = bridge && !vectors.some((vector) => vector.id === bridge.id) ? [...vectors, bridge] : vectors;
  const firstEndpoints = routeEndpoints(first, allVectors);
  const secondEndpoints = routeEndpoints(second, allVectors);
  if (!firstEndpoints || !secondEndpoints || firstEndpoints.closed || secondEndpoints.closed) return undefined;

  for (const left of routeVariants(first, allVectors)) {
    const leftEndId = left.pointIds[left.pointIds.length - 1];
    for (const right of routeVariants(second, allVectors)) {
      const rightStartId = right.pointIds[0];
      let bridgeStep: RouteStep | undefined;

      if (bridge) {
        if (bridge.fromId === leftEndId && bridge.toId === rightStartId) bridgeStep = { vectorId: bridge.id, reversed: false };
        else if (bridge.toId === leftEndId && bridge.fromId === rightStartId) bridgeStep = { vectorId: bridge.id, reversed: true };
        else continue;
      } else if (leftEndId !== rightStartId) continue;

      const hasExplicitName = Object.prototype.hasOwnProperty.call(options, "name");
      return {
        id: options.id?.trim() || first.id,
        name: hasExplicitName ? cleanName(options.name) : cleanName(first.name) || cleanName(second.name),
        steps: [
          ...left.route.steps.map(cloneStep),
          ...(bridgeStep ? [bridgeStep] : []),
          ...right.route.steps.map(cloneStep),
        ],
      };
    }
  }

  return undefined;
}

function normalizedRect(rect: RouteRect): { left: number; top: number; right: number; bottom: number } | undefined {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return undefined;
  return {
    left: Math.min(rect.x, rect.x + rect.width),
    top: Math.min(rect.y, rect.y + rect.height),
    right: Math.max(rect.x, rect.x + rect.width),
    bottom: Math.max(rect.y, rect.y + rect.height),
  };
}

function clipLineToRect(start: RoutePoint, end: RoutePoint, rect: RouteRect) {
  const bounds = normalizedRect(rect);
  if (!bounds) return undefined;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const p = [-dx, dx, -dy, dy];
  const q = [start.x - bounds.left, bounds.right - start.x, start.y - bounds.top, bounds.bottom - start.y];
  let from = 0;
  let to = 1;

  for (let index = 0; index < p.length; index += 1) {
    if (p[index] === 0) {
      if (q[index] < 0) return undefined;
      continue;
    }
    const ratio = q[index] / p[index];
    if (p[index] < 0) from = Math.max(from, ratio);
    else to = Math.min(to, ratio);
    if (from > to) return undefined;
  }

  return {
    start: { x: start.x + dx * from, y: start.y + dy * from },
    end: { x: start.x + dx * to, y: start.y + dy * to },
    clipped: from > 0 || to < 1,
  };
}

/** Normalizes a line axis so its label follows the slope without reading upside down. */
function uprightLineAngle(dx: number, dy: number): number {
  let angle = Math.atan2(dy, dx);
  if (angle <= -Math.PI / 2) angle += Math.PI;
  else if (angle > Math.PI / 2) angle -= Math.PI;
  return Math.abs(angle) <= 1e-12 ? 0 : angle;
}

/** Returns the midpoint of the longest full or visibly clipped route segment. */
export function routeLabelAnchor<P extends RoutePoint, V extends RouteVector>(
  route: SavedRoute,
  points: readonly P[],
  vectors: readonly V[],
  clip?: RouteRect,
): RouteLabelAnchor | undefined {
  if (!cleanName(route.name)) return undefined;
  const pointById = new Map(points.map((point) => [point.id, point]));
  const vectorById = new Map(vectors.map((vector) => [vector.id, vector]));
  let best: RouteLabelAnchor | undefined;

  route.steps.forEach((step, stepIndex) => {
    const vector = vectorById.get(step.vectorId);
    if (!vector) return;
    const endpoints = routeStepPointIds(step, vector);
    const start = pointById.get(endpoints.startId);
    const end = pointById.get(endpoints.endId);
    if (!start || !end || ![start.x, start.y, end.x, end.y].every(Number.isFinite)) return;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length === 0) return;
    const visible = clip ? clipLineToRect(start, end, clip) : { start, end, clipped: false };
    if (!visible) return;
    const visibleLength = Math.hypot(visible.end.x - visible.start.x, visible.end.y - visible.start.y);
    if (visibleLength <= 1e-9) return;
    if (best && visibleLength <= best.visibleLength + 1e-9) return;
    best = {
      routeId: route.id,
      vectorId: step.vectorId,
      stepIndex,
      x: (visible.start.x + visible.end.x) / 2,
      y: (visible.start.y + visible.end.y) / 2,
      angleRadians: uprightLineAngle(visible.end.x - visible.start.x, visible.end.y - visible.start.y),
      length,
      visibleLength,
      clipped: visible.clipped,
    };
  });

  return best;
}
