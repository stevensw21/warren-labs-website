import assert from "node:assert/strict";
import test from "node:test";

import {
  PRINT_CALLOUT_GAP,
  PRINT_CALLOUT_RAIL_WIDTH,
  PRINT_CHART_FRAME,
  PRINT_CHART_INSET,
  chooseScaleBar,
  createPrintProjection,
  printViewportFor,
} from "../app/projects/scuba-map-maker/print-layout.ts";

const closeTo = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≉ ${expected}`);

test("defines one inset 980x640 chart frame for map and callout layouts", () => {
  assert.deepEqual(PRINT_CHART_FRAME, { x: 0, y: 0, width: 980, height: 640 });
  assert.equal(PRINT_CHART_INSET, 16);
  assert.equal(PRINT_CALLOUT_GAP, 12);
  assert.equal(PRINT_CALLOUT_RAIL_WIDTH, 156);
  assert.deepEqual(printViewportFor("map"), { x: 16, y: 16, width: 948, height: 608 });
  assert.deepEqual(printViewportFor("rightRail"), { x: 16, y: 16, width: 780, height: 608 });
  assert.deepEqual(printViewportFor("dualRail"), { x: 184, y: 16, width: 612, height: 608 });
});

test("centers full canvases and crops without changing their aspect ratio", () => {
  const viewport = printViewportFor("map");
  const defaultCanvas = createPrintProjection({ x: 0, y: 0, width: 1200, height: 800 }, viewport);
  closeTo(defaultCanvas.scale, 0.76);
  closeTo(defaultCanvas.renderedWidth / defaultCanvas.renderedHeight, 1.5);
  closeTo(defaultCanvas.originX, 34);
  closeTo(defaultCanvas.originY, 16);

  const twoToOneCrop = createPrintProjection({ x: 100, y: 150, width: 1000, height: 500 }, viewport);
  closeTo(twoToOneCrop.scale, 0.948);
  closeTo(twoToOneCrop.renderedWidth / twoToOneCrop.renderedHeight, 2);
  closeTo(twoToOneCrop.originX, 16);
  closeTo(twoToOneCrop.originY, 83);
  closeTo(twoToOneCrop.canvasOffsetX, -94.8);
  closeTo(twoToOneCrop.canvasOffsetY, -75.2);
});

test("fits 100x100 crops and Warren's 10000x10000 canvas into the same frame", () => {
  const viewport = printViewportFor("map");
  const tinyCrop = createPrintProjection({ x: 400, y: 300, width: 100, height: 100 }, viewport);
  const extendedCanvas = createPrintProjection({ x: 0, y: 0, width: 10_000, height: 10_000 }, viewport);
  closeTo(tinyCrop.scale, 6.08);
  closeTo(tinyCrop.renderedWidth, 608);
  closeTo(tinyCrop.renderedHeight, 608);
  closeTo(extendedCanvas.scale, 0.0608);
  closeTo(extendedCanvas.renderedWidth, 608);
  closeTo(extendedCanvas.renderedHeight, 608);
});

test("selects readable scale bars for default, tight-crop, and extended-canvas projections", () => {
  const projections = [0.76, 6.08, 0.0608];
  for (const scale of projections) {
    const bar = chooseScaleBar(0.5, 0.3048, scale);
    assert.ok(bar.printedPixels >= 90 && bar.printedPixels <= 150, `${bar.printedPixels}px at scale ${scale}`);
    closeTo(bar.printedPixels, bar.sourcePixels * scale);
  }
});

test("normalizes invalid scale inputs to finite output", () => {
  const bar = chooseScaleBar(Number.NaN, 0, Number.POSITIVE_INFINITY);
  assert.ok(Number.isFinite(bar.value) && bar.value > 0);
  assert.ok(Number.isFinite(bar.printedPixels) && bar.printedPixels > 0);
  assert.ok(Number.isFinite(bar.sourcePixels) && bar.sourcePixels > 0);
});
