import assert from "node:assert/strict";
import test from "node:test";
import {
  CANVAS_CONTENT_PADDING,
  DEFAULT_CANVAS_SIZE,
  MAX_CANVAS_DIMENSION,
  MIN_CANVAS_SIZE,
  minimumCanvasSizeForPoints,
  normalizeCanvasSize,
  protectedCanvasResizeMinimum,
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
  assert.deepEqual(normalizeCanvasSize({ width: 600, height: 450 }), { width: 600, height: 450 });
  assert.deepEqual(normalizeCanvasSize({ width: 100, height: -20 }), MIN_CANVAS_SIZE);
  assert.deepEqual(
    normalizeCanvasSize({ width: MAX_CANVAS_DIMENSION + 0.6, height: Number.MAX_SAFE_INTEGER }),
    { width: MAX_CANVAS_DIMENSION, height: MAX_CANVAS_DIMENSION },
  );
});

test("allows compact canvases while preserving padding beyond authored content", () => {
  assert.equal(CANVAS_CONTENT_PADDING, 40);
  assert.deepEqual(minimumCanvasSizeForPoints([]), MIN_CANVAS_SIZE);
  assert.deepEqual(minimumCanvasSizeForPoints([{ x: 610.2, y: 420.1 }]), { width: 651, height: 461 });
  assert.deepEqual(minimumCanvasSizeForPoints([{ x: Number.NaN, y: Number.POSITIVE_INFINITY }]), MIN_CANVAS_SIZE);
});

test("never enlarges an undersized canvas during a protected shrink", () => {
  const edgeContent = [{ x: 1200, y: 800 }];
  assert.deepEqual(protectedCanvasResizeMinimum(edgeContent, { width: 1200, height: 800 }), { width: 1200, height: 800 });
  assert.deepEqual(protectedCanvasResizeMinimum(edgeContent, { width: 1225, height: 825 }), { width: 1200, height: 800 });
  assert.deepEqual(protectedCanvasResizeMinimum(edgeContent, { width: 1400, height: 1000 }), { width: 1240, height: 840 });
});
