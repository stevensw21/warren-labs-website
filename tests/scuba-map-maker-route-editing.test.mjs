import assert from "node:assert/strict";
import test from "node:test";
import {
  collapseRouteVertex,
  deleteRouteSegment,
  deleteSavedRoute,
  insertRouteMidpoint,
} from "../app/projects/scuba-map-maker/route-editing.ts";

const point = (id, x, y) => ({ id, x, y });
const vector = (id, fromId, toId, extra = {}) => ({ id, fromId, toId, ...extra });
const route = (id, name, steps) => ({ id, name, steps });
const forward = (vectorId) => ({ vectorId, reversed: false });
const identityId = (seed) => seed;

function expectSuccess(result) {
  assert.equal(result.ok, true, result.ok ? undefined : result.reason);
  return result;
}

function routeNodeIds(result, routeId) {
  const savedRoute = result.routes.find((item) => item.id === routeId);
  assert.ok(savedRoute, `Missing route ${routeId}`);
  const vectorById = new Map(result.vectors.map((item) => [item.id, item]));
  const ids = [];
  for (const step of savedRoute.steps) {
    const savedVector = vectorById.get(step.vectorId);
    assert.ok(savedVector, `Missing vector ${step.vectorId}`);
    const startId = step.reversed ? savedVector.toId : savedVector.fromId;
    const endId = step.reversed ? savedVector.fromId : savedVector.toId;
    if (!ids.length) ids.push(startId);
    else assert.equal(ids.at(-1), startId);
    ids.push(endId);
  }
  return ids;
}

test("inserts a midpoint route vertex and expands the owning step in stored order", () => {
  const points = [point("A", 0, 0), point("B", 10, 0)];
  const vectors = [vector("line", "A", "B", { bearing: 90, unit: "ft", custom: "retained" })];
  const routes = [route("route-1", "Outbound", [forward("line")])];
  const result = expectSuccess(insertRouteMidpoint(points, [], vectors, routes, "line", { createId: identityId }));

  assert.equal(result.nodeId, "route-vertex:line:midpoint");
  assert.deepEqual(result.routeVertices, [point("route-vertex:line:midpoint", 5, 0)]);
  assert.deepEqual(routeNodeIds(result, "route-1"), ["A", result.nodeId, "B"]);
  assert.equal(result.routes[0].steps[0].vectorId, "line");
  assert.notEqual(result.routes[0].steps[1].vectorId, "line");
  assert.equal(result.vectors[1].custom, "retained");
  assert.equal(result.vectors[1].unit, "ft");
  assert.deepEqual(result.affectedRouteIds, ["route-1"]);
  assert.deepEqual(result.splitVectorIds, ["line"]);
  assert.deepEqual(points, [point("A", 0, 0), point("B", 10, 0)]);
  assert.deepEqual(vectors, [vector("line", "A", "B", { bearing: 90, unit: "ft", custom: "retained" })]);
});

test("inserts into a reversed step without changing route traversal", () => {
  const result = expectSuccess(insertRouteMidpoint(
    [point("A", 0, 0), point("B", 10, 0)],
    [],
    [vector("line", "A", "B")],
    [route("reverse", "Reverse", [{ vectorId: "line", reversed: true }])],
    "line",
    { createId: identityId },
  ));

  assert.deepEqual(routeNodeIds(result, "reverse"), ["B", result.nodeId, "A"]);
  assert.notEqual(result.routes[0].steps[0].vectorId, "line");
  assert.equal(result.routes[0].steps[1].vectorId, "line");
  assert.ok(result.routes[0].steps.every((step) => step.reversed));
});

test("reuses a midpoint POI instead of creating a route vertex", () => {
  const result = expectSuccess(insertRouteMidpoint(
    [point("A", 0, 0), point("POI", 5, 0), point("B", 10, 0)],
    [],
    [vector("line", "A", "B")],
    [route("r", "", [forward("line")])],
    "line",
    {
      createId: (seed) => {
        assert.match(seed, /^vector:/, "existing midpoint must only allocate the child vector ID");
        return seed;
      },
    },
  ));

  assert.equal(result.nodeId, "POI");
  assert.deepEqual(result.routeVertices, []);
  assert.deepEqual(routeNodeIds(result, "r"), ["A", "POI", "B"]);
});

test("deletes an endpoint leg, retains the owning route ID, and collects endpoint orphans", () => {
  const result = expectSuccess(deleteRouteSegment(
    [point("A", 0, 0)],
    [point("B", 5, 0), point("C", 10, 0), point("orphan", 50, 50)],
    [vector("ab", "A", "B"), vector("bc", "B", "C")],
    [route("route-1", "Main", [forward("ab"), forward("bc")])],
    "bc",
    { createId: identityId },
  ));

  assert.deepEqual(result.vectors.map((item) => item.id), ["ab"]);
  assert.deepEqual(result.routes, [route("route-1", "Main", [forward("ab")])]);
  assert.deepEqual(result.routeVertices.map((item) => item.id), ["B"]);
  assert.deepEqual(result.removedVectorIds, ["bc"]);
});

test("deletes an interior segment and normalizes the route into stable continuous fragments", () => {
  const result = expectSuccess(deleteRouteSegment(
    [point("A", 0, 0), point("D", 10, 0)],
    [point("B", 2, 0), point("C", 3, 0)],
    [vector("ab", "A", "B"), vector("bc", "B", "C"), vector("cd", "C", "D")],
    [route("original", "Survey", [forward("ab"), forward("bc"), forward("cd")])],
    "bc",
    { createId: identityId },
  ));

  assert.equal(result.routes.length, 2);
  assert.deepEqual(result.routes.find((item) => item.id === "original"), route("original", "Survey", [forward("cd")]));
  const other = result.routes.find((item) => item.id !== "original");
  assert.ok(other);
  assert.deepEqual(other.steps, [forward("ab")]);
  assert.equal(other.name, "Survey");
  assert.deepEqual(result.routeVertices.map((item) => item.id), ["B", "C"]);
});

test("collapses a simple degree-two vertex while preserving route identity and stored orientation", () => {
  const result = expectSuccess(collapseRouteVertex(
    [point("A", 0, 0), point("B", 10, 0)],
    [point("V", 4, 3)],
    [
      vector("first", "V", "A", { unit: "m", style: "kept" }),
      vector("second", "V", "B", { unit: "ft", style: "removed" }),
    ],
    [route("route-1", "Bent route", [
      { vectorId: "first", reversed: true, annotation: "kept" },
      forward("second"),
    ])],
    "V",
    { createId: identityId },
  ));

  assert.deepEqual(result.routeVertices, []);
  assert.equal(result.vectors.length, 1);
  assert.deepEqual(result.vectors[0], vector("first", "B", "A", { unit: "m", style: "kept" }));
  assert.deepEqual(routeNodeIds(result, "route-1"), ["A", "B"]);
  assert.equal(result.routes[0].id, "route-1");
  assert.equal(result.routes[0].name, "Bent route");
  assert.deepEqual(result.routes[0].steps, [{ vectorId: "first", reversed: true, annotation: "kept" }]);
  assert.deepEqual(result.removedVectorIds, ["second"]);
});

test("refuses to collapse a shared branch junction", () => {
  const result = collapseRouteVertex(
    [point("A", 0, 0), point("B", 10, 0), point("C", 5, 5)],
    [point("J", 5, 0)],
    [vector("a", "A", "J"), vector("b", "J", "B"), vector("c", "J", "C")],
    [route("r", "", [forward("a"), forward("b")]), route("branch", "", [forward("c")])],
    "J",
  );

  assert.deepEqual(result, { ok: false, reason: "shared-junction" });
});

test("refuses to collapse a degree-two junction owned by multiple routes", () => {
  const result = collapseRouteVertex(
    [point("A", 0, 0), point("B", 10, 0)],
    [point("J", 5, 0)],
    [vector("a", "A", "J"), vector("b", "J", "B")],
    [route("first", "", [forward("a")]), route("second", "", [forward("b")])],
    "J",
  );

  assert.deepEqual(result, { ok: false, reason: "multi-route-junction" });
});

test("deletes an entire route, its exclusive vectors, and only newly orphaned vertices", () => {
  const result = expectSuccess(deleteSavedRoute(
    [point("A", 0, 0), point("B", 10, 0)],
    [point("J", 5, 0), point("E", 5, 5), point("orphan", 30, 30)],
    [vector("target-1", "A", "J"), vector("target-2", "J", "E"), vector("keep", "J", "B")],
    [
      route("target", "Delete me", [forward("target-1"), forward("target-2")]),
      route("keep-route", "Keep me", [forward("keep")]),
    ],
    "target",
    { createId: identityId },
  ));

  assert.deepEqual(result.routes, [route("keep-route", "Keep me", [forward("keep")])]);
  assert.deepEqual(result.vectors.map((item) => item.id), ["keep"]);
  assert.deepEqual(result.routeVertices.map((item) => item.id), ["J"]);
  assert.deepEqual(result.removedVectorIds, ["target-1", "target-2"]);
  assert.deepEqual(result.affectedRouteIds, ["target"]);
});

test("keeps a route vector still referenced by a remaining route", () => {
  const result = expectSuccess(deleteSavedRoute(
    [point("A", 0, 0), point("B", 10, 0)],
    [],
    [vector("shared", "A", "B")],
    [route("delete", "", [forward("shared")]), route("keep", "", [forward("shared")])],
    "delete",
  ));

  assert.deepEqual(result.vectors.map((item) => item.id), ["shared"]);
  assert.deepEqual(result.routes.map((item) => item.id), ["keep"]);
  assert.deepEqual(result.removedVectorIds, []);
});
