import { normalizeRoutes } from "./route-model.ts";
import {
  planarizeRouteTopology,
  type PlanarizedRouteTopology,
  type PlanarizeRouteTopologyOptions,
  type RouteTopologyNode,
  type RouteTopologyRoute,
  type RouteTopologyStep,
  type RouteTopologyVector,
  type RouteVertex,
} from "./route-topology.ts";

export type RouteEditFailureReason =
  | "missing-vector"
  | "missing-route"
  | "missing-endpoint"
  | "zero-length-vector"
  | "not-route-vertex"
  | "not-simple-degree-two"
  | "shared-junction"
  | "multi-route-junction"
  | "non-adjacent-route-steps"
  | "would-create-zero-length";

export type RouteEditSuccess<
  P extends RouteTopologyNode,
  RV extends RouteVertex,
  V extends RouteTopologyVector,
  R extends RouteTopologyRoute,
> = PlanarizedRouteTopology<P, RV, V, R> & {
  ok: true;
  affectedRouteIds: string[];
  removedVectorIds: string[];
  nodeId?: string;
};

export type RouteEditFailure = { ok: false; reason: RouteEditFailureReason };

export type RouteEditResult<
  P extends RouteTopologyNode,
  RV extends RouteVertex,
  V extends RouteTopologyVector,
  R extends RouteTopologyRoute,
> = RouteEditSuccess<P, RV, V, R> | RouteEditFailure;

type TraversedStep<V extends RouteTopologyVector> = {
  step: RouteTopologyStep;
  vector: V;
  stepIndex: number;
  startId: string;
  endId: string;
};

const DEFAULT_EPSILON = 1e-9;

function normalizedEpsilon(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_EPSILON;
}

function freshId(seed: string, usedIds: Set<string>, createId?: (seed: string) => string): string {
  const proposed = createId?.(seed);
  const base = typeof proposed === "string" && proposed.trim() ? proposed.trim() : seed;
  if (!usedIds.has(base)) return base;
  let suffix = 2;
  while (usedIds.has(`${base}~${suffix}`)) suffix += 1;
  return `${base}~${suffix}`;
}

function nodeMap<P extends RouteTopologyNode, RV extends RouteVertex>(points: readonly P[], routeVertices: readonly RV[]) {
  return new Map<string, RouteTopologyNode>([
    ...routeVertices.map((vertex) => [vertex.id, vertex] as const),
    ...points.map((point) => [point.id, point] as const),
  ]);
}

function routeIdsForVector<R extends RouteTopologyRoute>(routes: readonly R[], vectorId: string): string[] {
  return routes.filter((route) => route.steps.some((step) => step.vectorId === vectorId)).map((route) => route.id);
}

function retainedVertices<P extends RouteTopologyNode, RV extends RouteVertex, V extends RouteTopologyVector>(
  points: readonly P[],
  routeVertices: readonly RV[],
  vectors: readonly V[],
): RV[] {
  const pointIds = new Set(points.map((point) => point.id));
  const referencedIds = new Set(vectors.flatMap((vector) => [vector.fromId, vector.toId]));
  return routeVertices
    .filter((vertex, index) => !pointIds.has(vertex.id)
      && referencedIds.has(vertex.id)
      && routeVertices.findIndex((candidate) => candidate.id === vertex.id) === index)
    .map((vertex) => ({ ...vertex }));
}

function success<
  P extends RouteTopologyNode,
  RV extends RouteVertex,
  V extends RouteTopologyVector,
  R extends RouteTopologyRoute,
>(
  topology: PlanarizedRouteTopology<P, RV, V, R>,
  metadata: Pick<RouteEditSuccess<P, RV, V, R>, "affectedRouteIds" | "removedVectorIds" | "nodeId">,
): RouteEditSuccess<P, RV, V, R> {
  return { ok: true, ...topology, ...metadata };
}

function planarizeAfterEdit<
  P extends RouteTopologyNode,
  RV extends RouteVertex,
  V extends RouteTopologyVector,
  R extends RouteTopologyRoute,
>(
  points: readonly P[],
  routeVertices: readonly RV[],
  vectors: readonly V[],
  routes: readonly R[],
  options: PlanarizeRouteTopologyOptions,
) {
  return planarizeRouteTopology(points, routeVertices, vectors, routes, options);
}

/** Inserts a route-only node at the selected vector's geometric midpoint. */
export function insertRouteMidpoint<
  P extends RouteTopologyNode,
  RV extends RouteVertex,
  V extends RouteTopologyVector,
  R extends RouteTopologyRoute,
>(
  points: readonly P[],
  routeVertices: readonly RV[],
  vectors: readonly V[],
  routes: readonly R[],
  vectorId: string,
  options: PlanarizeRouteTopologyOptions = {},
): RouteEditResult<P, RV, V, R> {
  const selected = vectors.find((vector) => vector.id === vectorId);
  if (!selected) return { ok: false, reason: "missing-vector" };

  const nodes = nodeMap(points, routeVertices);
  const start = nodes.get(selected.fromId);
  const end = nodes.get(selected.toId);
  if (!start || !end || !Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(end.x) || !Number.isFinite(end.y)) {
    return { ok: false, reason: "missing-endpoint" };
  }

  const epsilon = normalizedEpsilon(options.epsilon);
  if (Math.hypot(end.x - start.x, end.y - start.y) <= epsilon) return { ok: false, reason: "zero-length-vector" };
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const existing = [...points, ...routeVertices]
    .filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && Math.hypot(node.x - midpoint.x, node.y - midpoint.y) <= epsilon)
    .sort((left, right) => {
      const leftPoint = points.some((point) => point.id === left.id) ? 0 : 1;
      const rightPoint = points.some((point) => point.id === right.id) ? 0 : 1;
      return leftPoint - rightPoint || left.id.localeCompare(right.id);
    })[0];

  let nodeId = existing?.id;
  const nextVertices = routeVertices.map((vertex) => ({ ...vertex }));
  if (!nodeId) {
    const usedIds = new Set<string>([
      ...points.map((point) => point.id),
      ...routeVertices.map((vertex) => vertex.id),
      ...vectors.map((vector) => vector.id),
      ...routes.map((route) => route.id),
    ]);
    nodeId = freshId(`route-vertex:${vectorId}:midpoint`, usedIds, options.createId);
    nextVertices.push({ id: nodeId, x: midpoint.x, y: midpoint.y } as RV);
  }

  const topology = planarizeAfterEdit(points, nextVertices, vectors, routes, options);
  if (!topology.vectors.some((vector) => vector.id === vectorId) || topology.splitVectorIds.includes(vectorId) === false) {
    return { ok: false, reason: "zero-length-vector" };
  }
  return success(topology, {
    affectedRouteIds: routeIdsForVector(routes, vectorId),
    removedVectorIds: [],
    nodeId,
  });
}

/**
 * Deletes one segment. Endpoint deletions retain the owning route ID; an
 * interior deletion is normalized into continuous fragments by route-model.
 */
export function deleteRouteSegment<
  P extends RouteTopologyNode,
  RV extends RouteVertex,
  V extends RouteTopologyVector,
  R extends RouteTopologyRoute,
>(
  points: readonly P[],
  routeVertices: readonly RV[],
  vectors: readonly V[],
  routes: readonly R[],
  vectorId: string,
  options: PlanarizeRouteTopologyOptions = {},
): RouteEditResult<P, RV, V, R> {
  if (!vectors.some((vector) => vector.id === vectorId)) return { ok: false, reason: "missing-vector" };
  const affectedRouteIds = routeIdsForVector(routes, vectorId);
  const nextVectors = vectors.filter((vector) => vector.id !== vectorId).map((vector) => ({ ...vector }));
  const nextVertices = retainedVertices(points, routeVertices, nextVectors);
  const normalized = normalizeRoutes(
    [...points, ...nextVertices],
    nextVectors,
    routes,
    { createId: options.createId },
  ) as R[];
  const topology = planarizeAfterEdit(points, nextVertices, nextVectors, normalized, options);
  return success(topology, { affectedRouteIds, removedVectorIds: [vectorId] });
}

function traversedStep<V extends RouteTopologyVector>(step: RouteTopologyStep, vector: V, stepIndex: number): TraversedStep<V> {
  return {
    step,
    vector,
    stepIndex,
    startId: step.reversed ? vector.toId : vector.fromId,
    endId: step.reversed ? vector.fromId : vector.toId,
  };
}

/** Collapses one unshared, degree-two route vertex into a single segment. */
export function collapseRouteVertex<
  P extends RouteTopologyNode,
  RV extends RouteVertex,
  V extends RouteTopologyVector,
  R extends RouteTopologyRoute,
>(
  points: readonly P[],
  routeVertices: readonly RV[],
  vectors: readonly V[],
  routes: readonly R[],
  vertexId: string,
  options: PlanarizeRouteTopologyOptions = {},
): RouteEditResult<P, RV, V, R> {
  if (points.some((point) => point.id === vertexId) || !routeVertices.some((vertex) => vertex.id === vertexId)) {
    return { ok: false, reason: "not-route-vertex" };
  }

  const incident = vectors.filter((vector) => vector.fromId === vertexId || vector.toId === vertexId);
  if (incident.length > 2) return { ok: false, reason: "shared-junction" };
  if (incident.length !== 2 || incident.some((vector) => vector.fromId === vector.toId)) {
    return { ok: false, reason: "not-simple-degree-two" };
  }

  const incidentIds = new Set(incident.map((vector) => vector.id));
  const references = routes.flatMap((route) => route.steps.flatMap((step, stepIndex) => (
    incidentIds.has(step.vectorId) ? [{ route, step, stepIndex }] : []
  )));
  const ownerIds = new Set(references.map((reference) => reference.route.id));
  if (ownerIds.size > 1) return { ok: false, reason: "multi-route-junction" };
  if (references.length !== 2 || ownerIds.size !== 1 || new Set(references.map((reference) => reference.step.vectorId)).size !== 2) {
    return { ok: false, reason: "not-simple-degree-two" };
  }

  const owner = references[0].route as R;
  const vectorById = new Map(vectors.map((vector) => [vector.id, vector]));
  const traversed = owner.steps.map((step, stepIndex) => {
    const vector = vectorById.get(step.vectorId);
    return vector ? traversedStep(step, vector, stepIndex) : undefined;
  });

  let before: TraversedStep<V> | undefined;
  let after: TraversedStep<V> | undefined;
  let wrapsRouteBoundary = false;
  for (let stepIndex = 0; stepIndex + 1 < traversed.length; stepIndex += 1) {
    const candidateBefore = traversed[stepIndex];
    const candidateAfter = traversed[stepIndex + 1];
    if (candidateBefore?.endId === vertexId
      && candidateAfter?.startId === vertexId
      && incidentIds.has(candidateBefore.vector.id)
      && incidentIds.has(candidateAfter.vector.id)) {
      before = candidateBefore;
      after = candidateAfter;
      break;
    }
  }

  if (!before && traversed.length > 1) {
    const candidateBefore = traversed.at(-1);
    const candidateAfter = traversed[0];
    if (candidateBefore?.endId === vertexId
      && candidateAfter?.startId === vertexId
      && incidentIds.has(candidateBefore.vector.id)
      && incidentIds.has(candidateAfter.vector.id)) {
      before = candidateBefore;
      after = candidateAfter;
      wrapsRouteBoundary = true;
    }
  }
  if (!before || !after) return { ok: false, reason: "non-adjacent-route-steps" };
  if (before.startId === after.endId) return { ok: false, reason: "would-create-zero-length" };

  const mergedVector = {
    ...before.vector,
    fromId: before.step.reversed ? after.endId : before.startId,
    toId: before.step.reversed ? before.startId : after.endId,
  } as V;
  const mergedStep = { ...before.step, vectorId: mergedVector.id, reversed: before.step.reversed === true };
  const nextOwnerSteps = wrapsRouteBoundary
    ? [mergedStep, ...owner.steps.slice(1, -1).map((step) => ({ ...step }))]
    : [
      ...owner.steps.slice(0, before.stepIndex).map((step) => ({ ...step })),
      mergedStep,
      ...owner.steps.slice(after.stepIndex + 1).map((step) => ({ ...step })),
    ];
  const nextRoutes = routes.map((route) => route.id === owner.id ? ({ ...route, steps: nextOwnerSteps } as R) : ({
    ...route,
    steps: route.steps.map((step) => ({ ...step })),
  } as R));
  const removedVectorId = after.vector.id;
  const nextVectors = vectors
    .filter((vector) => vector.id !== removedVectorId)
    .map((vector) => vector.id === mergedVector.id ? mergedVector : ({ ...vector } as V));
  const nextVertices = retainedVertices(
    points,
    routeVertices.filter((vertex) => vertex.id !== vertexId),
    nextVectors,
  );
  const topology = planarizeAfterEdit(points, nextVertices, nextVectors, nextRoutes, options);
  return success(topology, {
    affectedRouteIds: [owner.id],
    removedVectorIds: [removedVectorId],
    nodeId: vertexId,
  });
}

/** Deletes a saved route and all of its vectors not referenced by another route. */
export function deleteSavedRoute<
  P extends RouteTopologyNode,
  RV extends RouteVertex,
  V extends RouteTopologyVector,
  R extends RouteTopologyRoute,
>(
  points: readonly P[],
  routeVertices: readonly RV[],
  vectors: readonly V[],
  routes: readonly R[],
  routeId: string,
  options: PlanarizeRouteTopologyOptions = {},
): RouteEditResult<P, RV, V, R> {
  const selected = routes.find((route) => route.id === routeId);
  if (!selected) return { ok: false, reason: "missing-route" };
  const nextRoutes = routes.filter((route) => route.id !== routeId).map((route) => ({
    ...route,
    steps: route.steps.map((step) => ({ ...step })),
  } as R));
  const selectedVectorIds = new Set(selected.steps.map((step) => step.vectorId));
  const retainedVectorIds = new Set(nextRoutes.flatMap((route) => route.steps.map((step) => step.vectorId)));
  const removedVectorIds = vectors
    .filter((vector) => selectedVectorIds.has(vector.id) && !retainedVectorIds.has(vector.id))
    .map((vector) => vector.id);
  const removed = new Set(removedVectorIds);
  const nextVectors = vectors.filter((vector) => !removed.has(vector.id)).map((vector) => ({ ...vector }));
  const nextVertices = retainedVertices(points, routeVertices, nextVectors);
  const topology = planarizeAfterEdit(points, nextVertices, nextVectors, nextRoutes, options);
  return success(topology, { affectedRouteIds: [routeId], removedVectorIds });
}

export const insertMidpointVertex = insertRouteMidpoint;
export const deleteEndpointLeg = deleteRouteSegment;
export const deleteRoute = deleteSavedRoute;
