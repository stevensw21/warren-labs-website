import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRINT_CALLOUT_GAP,
  PRINT_CALLOUT_RAIL_WIDTH,
  PRINT_CHART_FRAME,
  PRINT_CHART_INSET,
  chooseScaleBar,
  createPrintProjection,
  exactPrintClipGeometry,
  formatScaleNumber,
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

test("clips exact wide and tall selections to their rendered size without letterbox exposure", () => {
  const viewport = printViewportFor("map");
  for (const source of [
    { x: 100, y: 250, width: 1000, height: 240 },
    { x: 400, y: 50, width: 200, height: 700 },
    { x: 0, y: 0, width: 1200, height: 800 },
  ]) {
    const projection = createPrintProjection(source, viewport);
    const clip = exactPrintClipGeometry(source, projection);
    assert.deepEqual(clip.viewport, {
      x: projection.originX,
      y: projection.originY,
      width: projection.renderedWidth,
      height: projection.renderedHeight,
    });
    closeTo(clip.canvasOffsetX + source.x * projection.scale, 0);
    closeTo(clip.canvasOffsetY + source.y * projection.scale, 0);
    closeTo(source.width * projection.scale, clip.viewport.width);
    closeTo(source.height * projection.scale, clip.viewport.height);
    assert.ok(clip.viewport.x >= viewport.x);
    assert.ok(clip.viewport.y >= viewport.y);
    assert.ok(clip.viewport.x + clip.viewport.width <= viewport.x + viewport.width + 1e-9);
    assert.ok(clip.viewport.y + clip.viewport.height <= viewport.y + viewport.height + 1e-9);
  }
});

test("wires exact clipping to the selected rectangle or whole-canvas fallback", async () => {
  const page = await readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const printSource: PrintSource = printArea \?\? \{ x: 0, y: 0, width: canvasSize\.width, height: canvasSize\.height \}/);
  assert.match(page, /const exactPrintClip = matchCurrentMap \? exactPrintClipGeometry\(printSource, printProjection\) : null/);
  assert.match(page, /const printMapViewport = exactPrintClip\?\.viewport \?\? activePrintViewport/);
  assert.match(page, /const printCanvasOffsetX = exactPrintClip\?\.canvasOffsetX \?\? printProjection\.canvasOffsetX/);
  assert.match(page, /const printCanvasOffsetY = exactPrintClip\?\.canvasOffsetY \?\? printProjection\.canvasOffsetY/);
});

test("selects readable scale bars for default, tight-crop, and extended-canvas projections", () => {
  const projections = [0.76, 6.08, 0.0608];
  for (const scale of projections) {
    const bar = chooseScaleBar(0.5, 0.3048, scale);
    assert.ok(bar.printedPixels >= 90 && bar.printedPixels <= 150, `${bar.printedPixels}px at scale ${scale}`);
    closeTo(bar.printedPixels, bar.sourcePixels * scale);
  }
});

test("changes screen scale distances across zoom thresholds in every supported unit", () => {
  const cases = [
    { unit: "feet", metersPerUnit: 0.3048, zoomedOutValue: 200, zoomedInValue: 100 },
    { unit: "meters", metersPerUnit: 1, zoomedOutValue: 100, zoomedInValue: 20 },
    { unit: "miles", metersPerUnit: 1609.344, zoomedOutValue: 0.05, zoomedInValue: 0.02 },
  ];

  for (const { unit, metersPerUnit, zoomedOutValue, zoomedInValue } of cases) {
    const zoomedOut = chooseScaleBar(0.5, metersPerUnit, 0.78);
    const zoomedIn = chooseScaleBar(0.5, metersPerUnit, 1.74);
    assert.equal(zoomedOut.value, zoomedOutValue, `${unit} distance at 78% zoom`);
    assert.equal(zoomedIn.value, zoomedInValue, `${unit} distance at 174% zoom`);
    assert.ok(zoomedIn.value < zoomedOut.value, `${unit} scale should show a shorter distance after zooming in`);
    closeTo(zoomedOut.printedPixels, zoomedOut.sourcePixels * 0.78);
    closeTo(zoomedIn.printedPixels, zoomedIn.sourcePixels * 1.74);
  }
});

test("formats extreme nonzero mile ticks without rounding them to zero", () => {
  const extremeMiles = chooseScaleBar(0.000001, 1609.344, 10);
  assert.ok(extremeMiles.value > 0);
  assert.notEqual(formatScaleNumber(extremeMiles.value / 2), "0");
  assert.notEqual(formatScaleNumber(extremeMiles.value), "0");
});

test("wires the screen scale bar to editor zoom while preserving print-scale projection", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const printBar = chooseScaleBar\(mapScale\(project\), METERS_PER_UNIT\[project\.distanceUnit\], effectivePrintScale\);/);
  assert.match(page, /const mapBar = chooseScaleBar\(mapScale\(project\), METERS_PER_UNIT\[project\.distanceUnit\], 1\);/);
  assert.match(page, /const screenBar = chooseScaleBar\(mapScale\(project\), METERS_PER_UNIT\[project\.distanceUnit\], zoom\);/);
  assert.match(page, /formatScaleNumber,/);
  assert.match(page, /className="screen-scale print-hidden" style=\{\{ "--screen-scale-bar-width": `\$\{screenBar\.printedPixels\}px` \} as CSSProperties\}/);
  assert.match(page, /<div className="scale-labels"><span>0<\/span><span>\{formatScaleNumber\(screenBar\.value \/ 2\)\}<\/span><span>\{formatScaleNumber\(screenBar\.value\)\} \{project\.distanceUnit\}<\/span><\/div>/);
  assert.doesNotMatch(page, /className="screen-scale print-hidden"[\s\S]{0,300}formatNumber\(screenBar\.value/);

  assert.match(styles, /\.screen-scale \{[^}]*width:\s*calc\(var\(--screen-scale-bar-width, 120px\) \+ 30px\);/);
  assert.match(styles, /\.scale-labels \{[^}]*width:\s*var\(--screen-scale-bar-width, 120px\);/);
  assert.match(styles, /\.screen-scale > i \{[^}]*width:\s*var\(--screen-scale-bar-width, 120px\);/);
});

test("normalizes invalid scale inputs to finite output", () => {
  const bar = chooseScaleBar(Number.NaN, 0, Number.POSITIVE_INFINITY);
  assert.ok(Number.isFinite(bar.value) && bar.value > 0);
  assert.ok(Number.isFinite(bar.printedPixels) && bar.printedPixels > 0);
  assert.ok(Number.isFinite(bar.sourcePixels) && bar.sourcePixels > 0);
});
