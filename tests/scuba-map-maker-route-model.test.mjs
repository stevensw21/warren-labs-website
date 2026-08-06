import assert from "node:assert/strict";
import test from "node:test";
import {
  appendVectorToRoute,
  canAppendVector,
  createRoute,
  deterministicRouteId,
  joinRoutes,
  migrateLegacyRoutes,
  normalizeRoutes,
  reverseRoute,
  routeEndpointKind,
  routeEndpoints,
  routeForVector,
  routeLabelAnchor,
  routePointIds,
  splitRoute,
  validateRoutes,
} from "../app/projects/scuba-map-maker/route-model.ts";

const point = (id, x = 0, y = 0) => ({ id, x, y });
const vector = (id, fromId, toId) => ({ id, fromId, toId });
const route = (id, name, steps) => ({ id, name, steps });
const forward = (vectorId) => ({ vectorId, reversed: false });

function routePointSequences(routes, vectors) {
  return routes.map((item) => routePointIds(item, vectors).join(">"));
}

test("migrates a legacy chain deterministically and records vector direction", () => {
  const points = [point("D"), point("B"), point("A"), point("C")];
  const vectors = [
    vector("z", "B", "A"),
    vector("m", "D", "C"),
    vector("a", "B", "C"),
  ];

  const migrated = migrateLegacyRoutes(points, vectors);
  assert.deepEqual(migrated, [{
    id: "route:z/a/m",
    name: "",
    steps: [
      { vectorId: "z", reversed: true },
      { vectorId: "a", reversed: false },
      { vectorId: "m", reversed: true },
    ],
  }]);
  assert.deepEqual(routePointIds(migrated[0], vectors), ["A", "B", "C", "D"]);
  assert.deepEqual(migrateLegacyRoutes([...points].reverse(), [...vectors].reverse()), migrated);
  assert.equal(deterministicRouteId(migrated[0].steps), "route:z/a/m");
});

test("splits legacy Y branches into maximal unbranched edge-disjoint routes", () => {
  const points = [point("A"), point("B"), point("C"), point("D"), point("E")];
  const vectors = [
    vector("ab", "A", "B"),
    vector("bc", "B", "C"),
    vector("bd", "B", "D"),
    vector("ce", "C", "E"),
  ];

  const migrated = migrateLegacyRoutes(points, vectors);
  assert.deepEqual(routePointSequences(migrated, vectors).sort(), ["A>B", "B>C>E", "B>D"]);
  assert.deepEqual(migrated.flatMap((item) => item.steps.map((step) => step.vectorId)).sort(), ["ab", "bc", "bd", "ce"]);
  assert.equal(validateRoutes(migrated, vectors).valid, true);
});

test("preserves an all-degree-two cycle as one closed ordered route", () => {
  const points = [point("A"), point("B"), point("C")];
  const vectors = [
    vector("one", "A", "B"),
    vector("two", "C", "B"),
    vector("three", "C", "A"),
  ];

  const [migrated] = migrateLegacyRoutes(points, vectors);
  assert.deepEqual(routePointIds(migrated, vectors), ["A", "B", "C", "A"]);
  assert.deepEqual(migrated.steps, [forward("one"), { vectorId: "two", reversed: true }, forward("three")]);
  assert.deepEqual(routeEndpoints(migrated, vectors), { startId: "A", endId: "A", closed: true });
  assert.equal(routeEndpointKind(migrated, "A", vectors), "both");
});

test("keeps parallel and reverse-vector extras as separate one-step routes", () => {
  const points = [point("A"), point("B"), point("C")];
  const vectors = [
    vector("a", "A", "B"),
    vector("b", "A", "B"),
    vector("c", "B", "A"),
    vector("d", "B", "C"),
  ];

  const migrated = migrateLegacyRoutes(points, vectors);
  assert.deepEqual(migrated.map((item) => item.steps.map((step) => step.vectorId)), [["a", "d"], ["b"], ["c"]]);
  assert.deepEqual(routePointSequences(migrated, vectors), ["A>B>C", "A>B", "B>A"]);
  assert.equal(validateRoutes(migrated, vectors).valid, true);
});

test("appends only from the ordered end and reverses all route semantics", () => {
  const vectors = [
    vector("one", "A", "B"),
    vector("two", "C", "B"),
    vector("from-start", "A", "D"),
    vector("close", "C", "A"),
    vector("after-close", "A", "E"),
  ];
  const original = route("r", "  Descent  ", [forward("one")]);

  assert.equal(canAppendVector(original, vectors[1], vectors), true);
  assert.equal(canAppendVector(original, vectors[2], vectors), false);
  assert.equal(appendVectorToRoute(original, vectors[2], vectors), undefined);

  const appended = appendVectorToRoute(original, vectors[1], vectors);
  assert.deepEqual(appended, route("r", "Descent", [forward("one"), { vectorId: "two", reversed: true }]));
  assert.deepEqual(routePointIds(appended, vectors), ["A", "B", "C"]);
  assert.deepEqual(original, route("r", "  Descent  ", [forward("one")]));

  const reversed = reverseRoute(appended);
  assert.deepEqual(reversed.steps, [forward("two"), { vectorId: "one", reversed: true }]);
  assert.deepEqual(routePointIds(reversed, vectors), ["C", "B", "A"]);
  assert.equal(routeEndpointKind(reversed, "C", vectors), "start");
  assert.equal(routeEndpointKind(reversed, "A", vectors), "end");

  const closed = appendVectorToRoute(appended, vectors[3], vectors);
  assert.deepEqual(routePointIds(closed, vectors), ["A", "B", "C", "A"]);
  assert.equal(canAppendVector(closed, vectors[4], vectors), false);
});

test("creates trimmed optional route names with injectable IDs", () => {
  const created = createRoute(vector("new-vector", "A", "B"), {
    name: "  Swim out  ",
    reversed: true,
    createId: (seed) => `custom:${seed}`,
  });
  assert.deepEqual(created, {
    id: "custom:route:new-vector",
    name: "Swim out",
    steps: [{ vectorId: "new-vector", reversed: true }],
  });
  assert.equal(createRoute(vector("plain", "A", "B")).name, "");
});

test("joins every endpoint orientation across a connecting vector", async (t) => {
  const endpointCases = [
    { firstJoin: "A", secondJoin: "C", expected: ["B", "A", "C", "D"] },
    { firstJoin: "A", secondJoin: "D", expected: ["B", "A", "D", "C"] },
    { firstJoin: "B", secondJoin: "C", expected: ["A", "B", "C", "D"] },
    { firstJoin: "B", secondJoin: "D", expected: ["A", "B", "D", "C"] },
  ];

  for (const endpointCase of endpointCases) {
    await t.test(`${endpointCase.firstJoin} to ${endpointCase.secondJoin}`, () => {
      const firstVector = vector("first", "A", "B");
      const secondVector = vector("second", "C", "D");
      const bridge = vector("bridge", endpointCase.firstJoin, endpointCase.secondJoin);
      const vectors = [firstVector, secondVector, bridge];
      const joined = joinRoutes(
        route("first-route", "First", [forward("first")]),
        route("second-route", "Second", [forward("second")]),
        vectors,
        { connectingVector: bridge, name: "  Joined route  " },
      );

      assert.ok(joined);
      assert.equal(joined.id, "first-route");
      assert.equal(joined.name, "Joined route");
      assert.deepEqual(routePointIds(joined, vectors), endpointCase.expected);
      assert.equal(validateRoutes([joined], vectors).valid, true);
    });
  }
});

test("joins routes already sharing an endpoint and rejects unsafe joins", () => {
  const vectors = [
    vector("first", "A", "B"),
    vector("second", "C", "B"),
    vector("closing", "B", "A"),
  ];
  const first = route("r1", "", [forward("first")]);
  const second = route("r2", "Second name", [forward("second")]);
  const joined = joinRoutes(first, second, vectors);
  assert.deepEqual(routePointIds(joined, vectors), ["A", "B", "C"]);
  assert.equal(joined.name, "Second name");

  const closed = route("closed", "Loop", [forward("first"), forward("closing")]);
  assert.equal(joinRoutes(closed, second, vectors), undefined);
  assert.equal(joinRoutes(first, route("r3", "", [forward("first")]), vectors), undefined);
});

test("repairs deleted and discontinuous route steps while copying names", () => {
  const points = [
    point("A", 0, 0),
    point("B", 10, 0),
    point("C", 20, 0),
    point("D", 50, 0),
    point("E", 80, 0),
    point("X", 20, 20),
  ];
  const allVectors = [
    vector("one", "A", "B"),
    vector("deleted", "B", "C"),
    vector("three", "C", "D"),
    vector("four", "D", "E"),
  ];
  const saved = route("original-route", "  North wall  ", allVectors.map((item) => forward(item.id)));
  const remaining = allVectors.filter((item) => item.id !== "deleted");
  const generated = [];
  const normalized = normalizeRoutes(points, remaining, [saved], {
    createId: (seed) => {
      generated.push(seed);
      return `fresh-${generated.length}`;
    },
  });

  assert.deepEqual(normalized.map((item) => ({ id: item.id, name: item.name, vectorIds: item.steps.map((step) => step.vectorId) })), [
    { id: "fresh-1", name: "North wall", vectorIds: ["one"] },
    { id: "original-route", name: "North wall", vectorIds: ["three", "four"] },
  ]);
  assert.equal(validateRoutes(normalized, remaining).valid, true);
  assert.equal(routeForVector(normalized, "four")?.id, "original-route");

  const retargeted = [vector("one", "A", "B"), vector("three", "X", "D"), vector("four", "D", "E")];
  const split = splitRoute(saved, retargeted, { points, createId: () => "retarget-fragment" });
  assert.deepEqual(split.map((item) => item.steps.map((step) => step.vectorId)), [["one"], ["three", "four"]]);
  assert.equal(split[1].id, "original-route");
  assert.ok(split.every((item) => item.name === "North wall"));
});

test("normalization removes duplicate assignments and assigns every new vector exactly once", () => {
  const points = [point("A"), point("B"), point("C"), point("D")];
  const vectors = [vector("one", "A", "B"), vector("two", "B", "C"), vector("three", "C", "D")];
  const saved = [
    route("duplicate-id", "Primary", [forward("one"), forward("missing"), forward("two")]),
    route("duplicate-id", "Other", [forward("one")]),
  ];
  let nextId = 0;
  const normalized = normalizeRoutes(points, vectors, saved, { createId: () => `generated-${++nextId}` });

  assert.deepEqual(normalized.flatMap((item) => item.steps.map((step) => step.vectorId)).sort(), ["one", "three", "two"]);
  assert.equal(new Set(normalized.map((item) => item.id)).size, normalized.length);
  assert.equal(validateRoutes(normalized, vectors).valid, true);
  assert.equal(routeForVector(normalized, "one")?.name, "Primary");
  assert.equal(routeForVector(normalized, "three")?.name, "");
});

test("reports invalid persisted contracts without rejecting duplicate names", () => {
  const vectors = [vector("one", "A", "B"), vector("two", "C", "D"), vector("free", "E", "F")];
  const routes = [
    route("same", "Allowed duplicate", [forward("one"), forward("missing")]),
    route("same", "Allowed duplicate", [forward("one"), forward("two")]),
    route("empty", "", []),
  ];
  const validation = validateRoutes(routes, vectors);
  assert.equal(validation.valid, false);
  assert.deepEqual(new Set(validation.issues.map((issue) => issue.code)), new Set([
    "duplicate-route-id",
    "empty-route",
    "missing-vector",
    "duplicate-vector",
    "discontinuous-route",
    "unassigned-vector",
  ]));
  assert.ok(validation.issues.some((issue) => issue.code === "unassigned-vector" && issue.vectorId === "free"));
});

test("anchors a named route on its longest segment without mutating geometry", () => {
  const points = [point("A", 0, 0), point("B", 40, 0), point("C", 40, 30)];
  const vectors = [vector("long", "A", "B"), vector("short", "B", "C")];
  const saved = route("named", "Wall route", [forward("long"), forward("short")]);
  const before = structuredClone({ points, vectors, saved });

  assert.deepEqual(routeLabelAnchor(saved, points, vectors), {
    routeId: "named",
    vectorId: "long",
    stepIndex: 0,
    x: 20,
    y: 0,
    angleRadians: 0,
    length: 40,
    visibleLength: 40,
    clipped: false,
  });
  assert.deepEqual({ points, vectors, saved }, before);
  assert.equal(routeLabelAnchor({ ...saved, name: "   " }, points, vectors), undefined);
});

test("anchors cropped output on the longest visible clipped segment", () => {
  const points = [point("A", 0, 0), point("B", 40, 0), point("C", 40, 30)];
  const vectors = [vector("long", "A", "B"), vector("short", "B", "C")];
  const saved = route("named", "Wall route", [forward("long"), forward("short")]);

  assert.deepEqual(routeLabelAnchor(saved, points, vectors, { x: 35, y: 0, width: 10, height: 30 }), {
    routeId: "named",
    vectorId: "short",
    stepIndex: 1,
    x: 40,
    y: 15,
    angleRadians: Math.PI / 2,
    length: 30,
    visibleLength: 30,
    clipped: false,
  });
  assert.equal(routeLabelAnchor(saved, points, vectors, { x: 100, y: 100, width: 20, height: 20 }), undefined);
});

test("keeps route title angles parallel and upright in every direction", () => {
  const cases = [
    { end: point("B", 10, 10), expected: Math.PI / 4 },
    { end: point("B", -10, -10), expected: Math.PI / 4 },
    { end: point("B", 10, -10), expected: -Math.PI / 4 },
    { end: point("B", -10, 10), expected: -Math.PI / 4 },
    { end: point("B", 0, 10), expected: Math.PI / 2 },
    { end: point("B", 0, -10), expected: Math.PI / 2 },
    { end: point("B", -10, 0), expected: 0 },
  ];

  for (const { end, expected } of cases) {
    const points = [point("A", 0, 0), end];
    const vectors = [vector("line", "A", "B")];
    const saved = route("named", "Wall route", [forward("line")]);
    assert.equal(routeLabelAnchor(saved, points, vectors)?.angleRadians, expected);
    assert.equal(routeLabelAnchor(reverseRoute(saved), points, vectors)?.angleRadians, expected);
  }
});

test("preserves a clipped segment angle and ignores invalid geometry", () => {
  const points = [point("A", 0, 0), point("B", 40, 40), point("bad", Number.NaN, 4)];
  const vectors = [vector("diagonal", "A", "B"), vector("invalid", "B", "bad")];
  const saved = route("named", "Wall route", [forward("diagonal")]);

  assert.deepEqual(routeLabelAnchor(saved, points, vectors, { x: 10, y: 10, width: 20, height: 20 }), {
    routeId: "named",
    vectorId: "diagonal",
    stepIndex: 0,
    x: 20,
    y: 20,
    angleRadians: Math.PI / 4,
    length: Math.hypot(40, 40),
    visibleLength: Math.hypot(20, 20),
    clipped: true,
  });
  assert.equal(routeLabelAnchor(route("missing-vector", "Missing", [forward("missing")]), points, vectors), undefined);
  assert.equal(routeLabelAnchor(route("missing-point", "Missing", [forward("missing-point")]), points, [vector("missing-point", "A", "elsewhere")]), undefined);
  assert.equal(routeLabelAnchor(route("invalid", "Invalid", [forward("invalid")]), points, vectors), undefined);
  assert.equal(routeLabelAnchor(route("zero", "Zero", [forward("zero")]), [point("A", 0, 0), point("B", 0, 0)], [vector("zero", "A", "B")]), undefined);
});
