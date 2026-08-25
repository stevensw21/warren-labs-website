import assert from "node:assert/strict";
import test from "node:test";
import { planarizeRouteTopology } from "../app/projects/scuba-map-maker/route-topology.ts";

const point = (id, x, y) => ({ id, x, y });
const vector = (id, fromId, toId, extra = {}) => ({ id, fromId, toId, ...extra });
const route = (id, name, steps) => ({ id, name, steps });
const forward = (vectorId) => ({ vectorId, reversed: false });
const identityId = (seed) => seed;

function vectorById(result, vectorId) {
  const found = result.vectors.find((item) => item.id === vectorId);
  assert.ok(found, `Missing vector ${vectorId}`);
  return found;
}

function routeNodeIds(result, routeId) {
  const savedRoute = result.routes.find((item) => item.id === routeId);
  assert.ok(savedRoute, `Missing route ${routeId}`);
  const ids = [];
  for (const step of savedRoute.steps) {
    const savedVector = vectorById(result, step.vectorId);
    const startId = step.reversed ? savedVector.toId : savedVector.fromId;
    const endId = step.reversed ? savedVector.fromId : savedVector.toId;
    if (!ids.length) ids.push(startId);
    else assert.equal(ids.at(-1), startId, `Route ${routeId} is discontinuous at ${step.vectorId}`);
    ids.push(endId);
  }
  return ids;
}

function routeCoordinates(result, routeId) {
  const nodes = new Map([...result.points, ...result.routeVertices].map((item) => [item.id, item]));
  return routeNodeIds(result, routeId).map((id) => {
    const node = nodes.get(id);
    assert.ok(node, `Missing node ${id}`);
    return [node.x, node.y];
  });
}

test("splits both vectors at a proper X intersection without merging route identities", () => {
  const result = planarizeRouteTopology(
    [point("A", 0, 0), point("B", 10, 10), point("C", 0, 10), point("D", 10, 0)],
    [],
    [
      vector("up", "A", "B", { unit: "ft", color: "coral" }),
      vector("down", "C", "D", { unit: "m", color: "aqua" }),
    ],
    [
      route("route-up", "Ascent", [forward("up")]),
      route("route-down", "Descent", [forward("down")]),
    ],
    { createId: identityId },
  );

  assert.equal(result.routeVertices.length, 1);
  assert.deepEqual(
    { x: result.routeVertices[0].x, y: result.routeVertices[0].y },
    { x: 5, y: 5 },
  );
  assert.equal(result.vectors.length, 4);
  assert.deepEqual(result.splitVectorIds, ["up", "down"]);
  assert.deepEqual(result.routes.map(({ id, name }) => ({ id, name })), [
    { id: "route-up", name: "Ascent" },
    { id: "route-down", name: "Descent" },
  ]);
  assert.deepEqual(routeCoordinates(result, "route-up"), [[0, 0], [5, 5], [10, 10]]);
  assert.deepEqual(routeCoordinates(result, "route-down"), [[0, 10], [5, 5], [10, 0]]);

  const upSteps = result.routes[0].steps;
  assert.equal(upSteps[0].vectorId, "up");
  assert.equal(vectorById(result, upSteps[1].vectorId).color, "coral");
  assert.equal(vectorById(result, upSteps[1].vectorId).unit, "ft");
});

test("uses an existing POI for a T junction and never promotes it to a route vertex", () => {
  const result = planarizeRouteTopology(
    [
      point("A", 0, 0),
      point("B", 10, 0),
      point("POI", 5, 0),
      point("D", 5, 5),
    ],
    [],
    [vector("main", "A", "B"), vector("branch", "POI", "D")],
    [route("main-route", "Main", [forward("main")]), route("branch-route", "Branch", [forward("branch")])],
    { createId: identityId },
  );

  assert.deepEqual(result.routeVertices, []);
  assert.deepEqual(result.splitVectorIds, ["main"]);
  assert.deepEqual(routeNodeIds(result, "main-route"), ["A", "POI", "B"]);
  assert.deepEqual(routeNodeIds(result, "branch-route"), ["POI", "D"]);
  assert.equal(result.points.length, 4);
});

test("canonicalizes coincident endpoint contacts to one existing POI", () => {
  const result = planarizeRouteTopology(
    [
      point("A", 0, 0),
      point("B", 10, 0),
      point("C", 10, 0),
      point("D", 20, 0),
    ],
    [],
    [vector("first", "A", "B"), vector("second", "C", "D")],
    [route("r1", "", [forward("first")]), route("r2", "", [forward("second")])],
    { createId: identityId },
  );

  assert.equal(vectorById(result, "first").toId, "B");
  assert.equal(vectorById(result, "second").fromId, "B");
  assert.deepEqual(result.routeVertices, []);
  assert.equal(result.points.length, 4);
  assert.deepEqual(result.splitVectorIds, []);
});

test("orders multiple crossings along the stored direction", () => {
  const result = planarizeRouteTopology(
    [
      point("A", 0, 0), point("B", 10, 0),
      point("C", 3, -5), point("D", 3, 5),
      point("E", 7, -5), point("F", 7, 5),
    ],
    [],
    [vector("spine", "A", "B"), vector("left", "C", "D"), vector("right", "E", "F")],
    [
      route("spine-route", "Spine", [forward("spine")]),
      route("left-route", "Left", [forward("left")]),
      route("right-route", "Right", [forward("right")]),
    ],
    { createId: identityId },
  );

  assert.equal(result.routeVertices.length, 2);
  assert.deepEqual(result.routeVertices.map(({ x, y }) => [x, y]).sort((a, b) => a[0] - b[0]), [[3, 0], [7, 0]]);
  assert.deepEqual(routeCoordinates(result, "spine-route"), [[0, 0], [3, 0], [7, 0], [10, 0]]);
  assert.deepEqual(routeCoordinates(result, "left-route"), [[3, -5], [3, 0], [3, 5]]);
  assert.deepEqual(routeCoordinates(result, "right-route"), [[7, -5], [7, 0], [7, 5]]);
  assert.deepEqual(result.splitVectorIds, ["spine", "left", "right"]);
});

test("splits collinear overlaps at both overlap boundaries", () => {
  const result = planarizeRouteTopology(
    [point("A", 0, 0), point("B", 10, 0), point("C", 5, 0), point("D", 15, 0)],
    [],
    [vector("first", "A", "B"), vector("second", "C", "D")],
    [route("first-route", "First", [forward("first")]), route("second-route", "Second", [forward("second")])],
    { createId: identityId },
  );

  assert.deepEqual(result.routeVertices, []);
  assert.deepEqual(routeNodeIds(result, "first-route"), ["A", "C", "B"]);
  assert.deepEqual(routeNodeIds(result, "second-route"), ["C", "B", "D"]);
  assert.deepEqual(result.splitVectorIds, ["first", "second"]);
  assert.equal(result.routes[0].id, "first-route");
  assert.equal(result.routes[1].id, "second-route");
});

test("planarizes a self-crossing route while preserving one continuous ordered route", () => {
  const result = planarizeRouteTopology(
    [
      point("A", 0, 0),
      point("B", 10, 10),
      point("C", 0, 10),
      point("D", 10, 0),
    ],
    [],
    [vector("one", "A", "B"), vector("two", "B", "C"), vector("three", "C", "D")],
    [route("looping-route", "Looping route", [forward("one"), forward("two"), forward("three")])],
    { createId: identityId },
  );

  assert.equal(result.routeVertices.length, 1);
  assert.deepEqual(routeCoordinates(result, "looping-route"), [
    [0, 0], [5, 5], [10, 10], [0, 10], [5, 5], [10, 0],
  ]);
  assert.equal(result.routes[0].id, "looping-route");
  assert.equal(result.routes[0].name, "Looping route");
  assert.deepEqual(result.splitVectorIds, ["one", "three"]);
});

test("replaces a reversed step with reversed child pieces in traversal order", () => {
  const result = planarizeRouteTopology(
    [point("A", 0, 0), point("B", 10, 0), point("C", 5, 0)],
    [],
    [vector("line", "A", "B")],
    [route("reverse-route", "Reverse", [{ vectorId: "line", reversed: true, note: "retained" }])],
    { createId: identityId },
  );

  assert.deepEqual(routeNodeIds(result, "reverse-route"), ["B", "C", "A"]);
  assert.equal(result.routes[0].steps.length, 2);
  assert.notEqual(result.routes[0].steps[0].vectorId, "line");
  assert.equal(result.routes[0].steps[1].vectorId, "line");
  assert.ok(result.routes[0].steps.every((step) => step.reversed));
  assert.ok(result.routes[0].steps.every((step) => step.note === "retained"));
});

test("is idempotent after splitting and does not allocate replacement IDs twice", () => {
  const first = planarizeRouteTopology(
    [point("A", 0, 0), point("B", 10, 10), point("C", 0, 10), point("D", 10, 0)],
    [],
    [vector("up", "A", "B"), vector("down", "C", "D")],
    [route("r1", "Up", [forward("up")]), route("r2", "Down", [forward("down")])],
    { createId: identityId },
  );

  const second = planarizeRouteTopology(
    first.points,
    first.routeVertices,
    first.vectors,
    first.routes,
    { createId: () => { throw new Error("idempotent topology must not allocate IDs"); } },
  );

  assert.deepEqual(second.routeVertices, first.routeVertices);
  assert.deepEqual(second.vectors, first.vectors);
  assert.deepEqual(second.routes, first.routes);
  assert.deepEqual(second.splitVectorIds, []);
});

test("garbage-collects orphan vertices after retaining referenced split vertices", () => {
  const result = planarizeRouteTopology(
    [point("A", 0, 0), point("B", 10, 0)],
    [point("used", 5, 0), point("orphan", 20, 20)],
    [vector("line", "A", "B")],
    [route("r", "", [forward("line")])],
    { createId: identityId },
  );

  assert.deepEqual(result.routeVertices.map((item) => item.id), ["used"]);
  assert.deepEqual(routeNodeIds(result, "r"), ["A", "used", "B"]);
});

test("removes zero-length vectors and their steps without removing route identity", () => {
  const result = planarizeRouteTopology(
    [point("A", 1, 1), point("B", 1, 1)],
    [point("orphan", 5, 5)],
    [vector("zero", "A", "B")],
    [route("kept-route", "Kept", [forward("zero")])],
    { createId: identityId },
  );

  assert.deepEqual(result.vectors, []);
  assert.deepEqual(result.routeVertices, []);
  assert.deepEqual(result.routes, [route("kept-route", "Kept", [])]);
  assert.deepEqual(result.splitVectorIds, []);
});
