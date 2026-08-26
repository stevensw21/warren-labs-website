import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CANVAS_SIZE,
  MAX_CANVAS_DIMENSION,
  normalizeCanvasSize,
} from "../app/projects/scuba-map-maker/canvas-size.ts";

test("defaults missing and invalid canvas dimensions independently", () => {
  assert.deepEqual(normalizeCanvasSize(undefined), DEFAULT_CANVAS_SIZE);
  assert.deepEqual(normalizeCanvasSize(null), DEFAULT_CANVAS_SIZE);
  assert.deepEqual(normalizeCanvasSize([]), DEFAULT_CANVAS_SIZE);
  assert.deepEqual(normalizeCanvasSize({ width: "1600", height: Number.POSITIVE_INFINITY }), DEFAULT_CANVAS_SIZE);
  assert.deepEqual(normalizeCanvasSize({ width: 1600, height: Number.NaN }), { width: 1600, height: 800 });
});

test("rounds finite canvas dimensions and clamps them to supported bounds", () => {
  assert.deepEqual(normalizeCanvasSize({ width: 1400.4, height: 900.6 }), { width: 1400, height: 901 });
  assert.deepEqual(normalizeCanvasSize({ width: 100, height: -20 }), DEFAULT_CANVAS_SIZE);
  assert.deepEqual(
    normalizeCanvasSize({ width: MAX_CANVAS_DIMENSION + 0.6, height: Number.MAX_SAFE_INTEGER }),
    { width: MAX_CANVAS_DIMENSION, height: MAX_CANVAS_DIMENSION },
  );
});
