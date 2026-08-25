import assert from "node:assert/strict";
import test from "node:test";
import { clampDockPosition } from "../app/projects/scuba-map-maker/map-view.ts";

const STAGE = { width: 800, height: 600 };
const DOCK = { width: 128, height: 250 };

test("clamps the dock to all four inset stage edges", () => {
  assert.deepEqual(clampDockPosition({ left: -100, top: 150 }, STAGE, DOCK), { left: 12, top: 150 });
  assert.deepEqual(clampDockPosition({ left: 200, top: -100 }, STAGE, DOCK), { left: 200, top: 12 });
  assert.deepEqual(clampDockPosition({ left: 10_000, top: 150 }, STAGE, DOCK), { left: 660, top: 150 });
  assert.deepEqual(clampDockPosition({ left: 200, top: 10_000 }, STAGE, DOCK), { left: 200, top: 338 });
});

test("keeps the dock handle reachable when the stage is undersized", () => {
  assert.deepEqual(
    clampDockPosition({ left: 40, top: 40 }, { width: 100, height: 120 }, DOCK),
    { left: 0, top: 0 },
  );
  assert.deepEqual(
    clampDockPosition({ left: 0, top: 0 }, { width: 20, height: 20 }, { width: 10, height: 10 }),
    { left: 5, top: 5 },
  );
});

test("normalizes invalid coordinates to finite reachable edges", () => {
  assert.deepEqual(
    clampDockPosition({ left: Number.NaN, top: Number.POSITIVE_INFINITY }, STAGE, DOCK),
    { left: 12, top: 338 },
  );
  assert.deepEqual(
    clampDockPosition({ left: Number.NEGATIVE_INFINITY, top: Number.NaN }, STAGE, DOCK),
    { left: 12, top: 12 },
  );
});

test("normalizes invalid dimensions and inset values", () => {
  assert.deepEqual(
    clampDockPosition(
      { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY },
      { width: Number.NaN, height: Number.POSITIVE_INFINITY },
      { width: -20, height: Number.NaN },
    ),
    { left: 0, top: 0 },
  );
  assert.deepEqual(
    clampDockPosition(
      { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY },
      { width: 100, height: 80 },
      { width: Number.NaN, height: -1 },
      Number.NaN,
    ),
    { left: 100, top: 80 },
  );
});

test("returns finite bounds for extreme finite inputs", () => {
  const result = clampDockPosition(
    { left: Number.MAX_VALUE, top: -Number.MAX_VALUE },
    { width: Number.MAX_VALUE, height: Number.MAX_VALUE },
    { width: Number.MAX_VALUE / 2, height: Number.MAX_VALUE / 2 },
  );

  assert.ok(Number.isFinite(result.left));
  assert.ok(Number.isFinite(result.top));
  assert.ok(result.left >= 12);
  assert.equal(result.top, 12);
});
