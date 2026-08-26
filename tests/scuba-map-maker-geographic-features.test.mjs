import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GEOGRAPHIC_FEATURE_STYLE,
  geographicFeatureLabelAnchor,
  geographicFeaturePath,
  normalizeGeographicFeatures,
  simplifyFreehandPoints,
  translateGeographicFeature,
} from "../app/projects/scuba-map-maker/geographic-features.ts";

const point = (id, x, y) => ({ id, x, y });
const geometry = (mode, points, closed = false) => ({ mode, points, closed });
const feature = (overrides = {}) => ({
  id: "feature-1",
  name: "Ledge",
  mode: "polyline",
  points: [point("a", 0, 0), point("b", 10, 0)],
  closed: false,
  style: { ...DEFAULT_GEOGRAPHIC_FEATURE_STYLE },
  ...overrides,
});

test("normalizes malformed feature data without mutating input or reordering valid geometry", () => {
  const raw = [
    null,
    {
      id: "feature-a",
      name: "  Rock ledge  ",
      mode: "unsupported",
      points: [
        point("point-a", 0, 0),
        point("duplicate-position", 0, 0),
        point("bad", Number.NaN, 4),
        point("point-b", 20, 5),
      ],
      closed: true,
      style: { color: "#ABCDEF", width: 99, dash: "waves" },
    },
    {
      id: "feature-a",
      name: 42,
      mode: "spline",
      points: [
        point("point-a", 20, 20),
        { id: "", x: 30, y: 20 },
        point("point-c", 30, 30),
        point("closing-copy", 20, 20),
      ],
      closed: true,
      style: { color: "red", width: -3, dash: "dotted" },
    },
    { id: "single", mode: "freehand", points: [point("only", 1, 1)] },
  ];
  const before = structuredClone(raw);
  let generated = 0;

  const normalized = normalizeGeographicFeatures(raw, () => `generated-${++generated}`);

  assert.deepEqual(raw, before);
  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized[0], {
    id: "feature-a",
    name: "Rock ledge",
    mode: "polyline",
    points: [point("point-a", 0, 0), point("point-b", 20, 5)],
    closed: false,
    style: { color: "#ABCDEF", width: 8, dash: "solid" },
  });
  assert.equal(normalized[1].name, "");
  assert.equal(normalized[1].mode, "spline");
  assert.equal(normalized[1].closed, true);
  assert.deepEqual(normalized[1].points.map(({ x, y }) => [x, y]), [[20, 20], [30, 20], [30, 30]]);
  assert.equal(new Set(normalized.flatMap((item) => item.points.map((itemPoint) => itemPoint.id))).size, 5);
  assert.notEqual(normalized[1].id, "feature-a");
  assert.deepEqual(normalized[1].style, { color: "#4b6f78", width: 1, dash: "dotted" });
  assert.deepEqual(normalizeGeographicFeatures(undefined), []);
  assert.deepEqual(normalizeGeographicFeatures({}), []);
});

test("generates deterministic open and closed paths for every drawing mode", () => {
  const points = [point("a", 0, 0), point("b", 10, 0), point("c", 10, 10)];

  assert.equal(geographicFeaturePath(geometry("polyline", points)), "M0 0 L10 0 L10 10");
  assert.equal(geographicFeaturePath(geometry("freehand", points)), "M0 0 L10 0 L10 10");
  assert.equal(geographicFeaturePath(geometry("polyline", points, true)), "M0 0 L10 0 L10 10 Z");
  assert.equal(geographicFeaturePath(geometry("freehand", points, true)), "M0 0 L10 0 L10 10 Z");

  const openSpline = geographicFeaturePath(geometry("spline", points));
  assert.match(openSpline, /^M0 0 C/);
  assert.equal(openSpline.match(/C/g)?.length, 2);
  assert.match(openSpline, /10 10$/);

  const closedSpline = geographicFeaturePath(geometry("spline", points, true));
  assert.match(closedSpline, /^M0 0 C/);
  assert.equal(closedSpline.match(/C/g)?.length, 3);
  assert.match(closedSpline, /0 0 Z$/);

  for (const path of [openSpline, closedSpline]) {
    const values = path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
    assert.ok(values.length > 0);
    assert.ok(values.every(Number.isFinite));
  }
});

test("handles two-point spline fallback, duplicates, and incomplete paths", () => {
  const start = point("start", 0, 0);
  const end = point("end", 10, 10);
  assert.equal(geographicFeaturePath(geometry("spline", [start, end])), "M0 0 L10 10");
  assert.equal(geographicFeaturePath(geometry("spline", [start, end], true)), "M0 0 L10 10");
  assert.equal(geographicFeaturePath(geometry("polyline", [start])), "");
  assert.equal(geographicFeaturePath(geometry("freehand", [start, { ...start, id: "copy" }])), "");
  assert.equal(
    geographicFeaturePath(geometry("polyline", [start, { ...start, id: "copy" }, end])),
    "M0 0 L10 10",
  );
});

test("simplifies freehand traces iteratively while preserving IDs and endpoints", () => {
  const trace = [
    point("start", 0, 0),
    point("near-start", 2, 0),
    point("peak", 4, 3),
    point("near-end", 6, 0),
    point("end", 8, 0),
  ];
  const before = structuredClone(trace);
  const simplified = simplifyFreehandPoints(trace, 1.5);

  assert.deepEqual(trace, before);
  assert.deepEqual(simplified.map((item) => item.id), ["start", "peak", "end"]);
  assert.deepEqual(simplified[0], trace[0]);
  assert.deepEqual(simplified.at(-1), trace.at(-1));
  assert.notEqual(simplified[0], trace[0]);
  assert.deepEqual(simplifyFreehandPoints(trace, 0), trace);
});

test("simplifies a large freehand trace without recursion or non-finite output", () => {
  const trace = Array.from({ length: 5_000 }, (_, index) => point(`point-${index}`, index / 5, 200 + Math.sin(index / 30) * 12));
  const simplified = simplifyFreehandPoints(trace, 1.25);

  assert.equal(simplified[0].id, "point-0");
  assert.equal(simplified.at(-1).id, "point-4999");
  assert.ok(simplified.length > 2);
  assert.ok(simplified.length < trace.length / 5);
  assert.ok(simplified.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y)));
});

test("places labels at cumulative-length midpoints with upright tangents", () => {
  const elbow = geographicFeatureLabelAnchor(geometry("polyline", [
    point("a", 0, 0),
    point("b", 10, 0),
    point("c", 10, 20),
  ]));
  assert.ok(elbow);
  assert.ok(Math.abs(elbow.x - 10) < 1e-9);
  assert.ok(Math.abs(elbow.y - 5) < 1e-9);
  assert.ok(Math.abs(elbow.angleRadians - Math.PI / 2) < 1e-9);

  const reversed = geographicFeatureLabelAnchor(geometry("polyline", [point("a", 100, 20), point("b", 0, 20)]));
  assert.deepEqual(reversed, { x: 50, y: 20, angleRadians: 0 });

  const reversedDiagonal = geographicFeatureLabelAnchor(geometry("polyline", [point("a", 100, 100), point("b", 0, 0)]));
  assert.ok(reversedDiagonal);
  assert.ok(Math.abs(reversedDiagonal.angleRadians - Math.PI / 4) < 1e-9);

  const spline = geographicFeatureLabelAnchor(geometry("spline", [
    point("a", 0, 0),
    point("b", 30, 50),
    point("c", 80, 10),
    point("d", 120, 20),
  ]));
  assert.ok(spline);
  assert.ok([spline.x, spline.y, spline.angleRadians].every(Number.isFinite));
  assert.ok(spline.angleRadians >= -Math.PI / 2 && spline.angleRadians <= Math.PI / 2);
  assert.equal(geographicFeatureLabelAnchor(geometry("polyline", [point("a", 0, 0)])), undefined);
});

test("translates a feature as one shape and clamps its bounds to the 1200x800 canvas", () => {
  const original = feature({
    points: [point("a", 1_100, 100), point("b", 1_190, 200)],
    style: { color: "#112233", width: 4, dash: "dashed" },
  });
  const before = structuredClone(original);
  const translated = translateGeographicFeature(original, 100, -500);

  assert.deepEqual(original, before);
  assert.deepEqual(translated.points, [point("a", 1_110, 0), point("b", 1_200, 100)]);
  assert.equal(translated.points[1].x - translated.points[0].x, 90);
  assert.equal(translated.points[1].y - translated.points[0].y, 100);
  assert.deepEqual(translated.style, original.style);
  assert.notEqual(translated.style, original.style);

  const movedWithinBounds = translateGeographicFeature(original, -1_000, 300);
  assert.deepEqual(movedWithinBounds.points, [point("a", 100, 400), point("b", 190, 500)]);
  assert.deepEqual(translateGeographicFeature(original, Number.NaN, Number.POSITIVE_INFINITY).points, original.points);
});

test("translates a feature within supplied extended canvas bounds", () => {
  const original = feature({
    points: [point("a", 1_100, 700), point("b", 1_190, 790)],
  });

  const translated = translateGeographicFeature(original, 500, 500, { width: 1_600, height: 1_100 });

  assert.deepEqual(translated.points, [point("a", 1_510, 1_010), point("b", 1_600, 1_100)]);
  assert.deepEqual(original.points, [point("a", 1_100, 700), point("b", 1_190, 790)]);
});
