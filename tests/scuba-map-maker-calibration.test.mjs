import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrationReferenceIsCurrent,
  calibrationReferencePixelLength,
  isFinitePositive,
  metersPerPixel,
  routePixelLength,
  segmentPixelLength,
} from "../app/projects/scuba-map-maker/calibration.ts";

const point = (id, x, y) => ({ id, x, y });
const vector = (id, fromId, toId) => ({ id, fromId, toId });
const step = (vectorId, reversed = false) => ({ vectorId, reversed });
const route = (...steps) => ({ steps });

test("measures a raw route segment in source pixels", () => {
  const points = [point("A", -1, 2), point("B", 2, 6)];
  assert.equal(segmentPixelLength(vector("ab", "A", "B"), points), 5);
  assert.equal(segmentPixelLength(vector("ba", "B", "A"), points), 5);
});

test("sums every ordered route step across bends and reversals", () => {
  const points = [point("A", 0, 0), point("B", 3, 4), point("C", 3, 16)];
  const vectors = [vector("ab", "A", "B"), vector("cb", "C", "B")];

  assert.equal(routePixelLength(route(step("ab"), step("cb", true)), vectors, points), 17);
});

test("counts repeated and closing route steps without deduplication", () => {
  const points = [point("A", 0, 0), point("B", 3, 0), point("C", 3, 4)];
  const vectors = [
    vector("ab", "A", "B"),
    vector("bc", "B", "C"),
    vector("ca", "C", "A"),
  ];

  assert.equal(routePixelLength(route(step("ab"), step("ab", true), step("ab")), vectors, points), 9);
  assert.equal(routePixelLength(route(step("ab"), step("bc"), step("ca")), vectors, points), 12);
});

test("rejects missing or non-finite route geometry instead of returning a partial length", () => {
  const points = [point("A", 0, 0), point("B", 3, 4)];
  const vectors = [vector("ab", "A", "B"), vector("missing-node", "B", "C")];

  assert.equal(segmentPixelLength(vector("missing", "A", "C"), points), undefined);
  assert.equal(segmentPixelLength(vector("invalid", "A", "bad"), [...points, point("bad", Number.NaN, 4)]), undefined);
  assert.equal(routePixelLength(route(), vectors, points), undefined);
  assert.equal(routePixelLength(route(step("unknown")), vectors, points), undefined);
  assert.equal(routePixelLength(route(step("ab"), step("missing-node")), vectors, points), undefined);
});

test("preserves zero-length geometry for validation by the calibration formula", () => {
  const points = [point("A", 2, 2), point("B", 2, 2)];
  const vectors = [vector("zero", "A", "B")];

  assert.equal(segmentPixelLength(vectors[0], points), 0);
  assert.equal(routePixelLength(route(step("zero")), vectors, points), 0);
  assert.equal(metersPerPixel(10, "m", 0), undefined);
});

test("converts feet, meters, and miles to finite positive meters per pixel", () => {
  assert.equal(metersPerPixel(100, "ft", 200), 0.1524);
  assert.equal(metersPerPixel(50, "m", 200), 0.25);
  assert.equal(metersPerPixel(1, "mi", 1609.344), 1);
});

test("accepts only finite positive calibration inputs and outputs", () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "1", null, undefined]) {
    assert.equal(isFinitePositive(value), false);
  }
  assert.equal(isFinitePositive(Number.MIN_VALUE), true);
  assert.equal(isFinitePositive(42), true);

  for (const [distance, pixels] of [
    [0, 10],
    [-1, 10],
    [Number.NaN, 10],
    [Number.POSITIVE_INFINITY, 10],
    [10, -1],
    [10, Number.NaN],
    [10, Number.POSITIVE_INFINITY],
  ]) {
    assert.equal(metersPerPixel(distance, "m", pixels), undefined);
  }
  assert.equal(metersPerPixel(Number.MAX_VALUE, "mi", Number.MIN_VALUE), undefined);
});

test("resolves exactly one route or segment reference and detects stale source geometry", () => {
  const points = [point("A", 0, 0), point("B", 3, 4), point("C", 3, 16)];
  const vectors = [vector("ab", "A", "B"), vector("bc", "B", "C")];
  const routes = [{ id: "route-1", steps: [step("ab"), step("bc")] }];
  const routeReference = { routeId: "route-1", distance: 17, unit: "m", metersPerPixel: 1 };
  const segmentReference = { vectorId: "ab", distance: 5, unit: "m", metersPerPixel: 1 };

  assert.equal(calibrationReferencePixelLength(routeReference, routes, vectors, points), 17);
  assert.equal(calibrationReferencePixelLength(segmentReference, routes, vectors, points), 5);
  assert.equal(calibrationReferencePixelLength({ routeId: "route-1", vectorId: "ab" }, routes, vectors, points), undefined);
  assert.equal(calibrationReferencePixelLength({ routeId: "missing" }, routes, vectors, points), undefined);
  assert.equal(calibrationReferenceIsCurrent(routeReference, routes, vectors, points), true);
  assert.equal(calibrationReferenceIsCurrent(segmentReference, routes, vectors, points), true);

  const moved = [point("A", 0, 0), point("B", 6, 8), point("C", 3, 16)];
  assert.equal(calibrationReferenceIsCurrent(routeReference, routes, vectors, moved), false);
  assert.equal(calibrationReferenceIsCurrent(segmentReference, routes, vectors, moved), false);
  assert.equal(calibrationReferenceIsCurrent({ ...routeReference, vectorId: "ab" }, routes, vectors, points), false);
  assert.equal(calibrationReferenceIsCurrent({ ...routeReference, distance: undefined }, routes, vectors, points), false);
});
