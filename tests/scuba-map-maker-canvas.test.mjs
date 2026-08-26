import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_CANVAS_SIZE,
  normalizeCanvasSize,
} from "../app/projects/scuba-map-maker/canvas-size.ts";

const pageUrl = new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

function blockAt(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Expected ${marker}`);
  const openIndex = source.indexOf("{", markerIndex);
  assert.notEqual(openIndex, -1, `Expected a block after ${marker}`);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return source.slice(markerIndex, index + 1);
  }
  assert.fail(`Unclosed block after ${marker}`);
}

function windowAround(source, marker, before = 800, after = 2_400) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Expected ${marker}`);
  return source.slice(Math.max(0, markerIndex - before), markerIndex + after);
}

test("keeps canvas dimensions optional while normalizing legacy projects and reference frames", async () => {
  assert.deepEqual(normalizeCanvasSize(undefined), DEFAULT_CANVAS_SIZE);

  const page = await readFile(pageUrl, "utf8");
  const projectType = blockAt(page, "type Project =");
  const referenceType = blockAt(page, "type ReferenceImage =");
  const normalizeProject = blockAt(page, "function normalizeProject");

  assert.match(projectType, /canvasSize\?:\s*CanvasSize/);
  assert.match(referenceType, /frame\?:\s*CanvasSize/);
  assert.match(normalizeProject, /project\.canvasSize\s*=\s*normalizeCanvasSize\(project\.canvasSize\)/);
  assert.match(normalizeProject, /frame:\s*normalizeCanvasSize\(savedReference\.frame\s*\?\?\s*project\.canvasSize\)/);
  assert.ok(
    normalizeProject.indexOf("project.canvasSize = normalizeCanvasSize(project.canvasSize)") < normalizeProject.indexOf("const savedReference"),
    "the canvas must be normalized before a legacy reference frame defaults to it",
  );
});

test("renders every map layer against the normalized dynamic canvas bounds", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /const canvasSize\s*=\s*normalizeCanvasSize\(project\?\.canvasSize\)/);
  assert.match(page, /const canvasDisplayStyle\s*=\s*\{[^;]*width:\s*canvasSize\.width[^;]*height:\s*canvasSize\.height[^;]*\}\s*as CSSProperties;/);
  assert.match(page, /className="map-canvas"\s+style=\{\{[^}]*\.\.\.canvasDisplayStyle,/);

  const dynamicViewBox = 'viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}';
  assert.ok(
    page.split(dynamicViewBox).length - 1 >= 6,
    "shoreline, feature, route, draft, and annotation SVG layers should share the dynamic viewBox",
  );
  assert.match(page, /<mask\b[^>]*width=\{canvasSize\.width\}[^>]*height=\{canvasSize\.height\}/);
  assert.match(page, /<rect\b[^>]*width=\{canvasSize\.width\}[^>]*height=\{canvasSize\.height\}[^>]*fill="white"/);
  assert.doesNotMatch(page, /\bCANVAS\.(?:width|height)\b/);
});

test("uses extended canvas bounds for pointer placement, print areas, features, and full-canvas printing", async () => {
  const page = await readFile(pageUrl, "utf8");
  const normalizePrintArea = blockAt(page, "function normalizePrintArea");
  const canvasPosition = blockAt(page, "const canvasPosition");

  assert.match(normalizePrintArea, /bounds:\s*CanvasSize\s*=\s*DEFAULT_CANVAS_SIZE/);
  assert.match(normalizePrintArea, /const canvasSize\s*=\s*normalizeCanvasSize\(bounds\)/);
  assert.match(normalizePrintArea, /canvasSize\.width/);
  assert.match(normalizePrintArea, /canvasSize\.height/);
  assert.match(canvasPosition, /canvasSize\.width/);
  assert.match(canvasPosition, /canvasSize\.height/);
  assert.match(page, /normalizePrintArea\([^\n;]*canvasSize\)/);
  assert.match(page, /translateGeographicFeature\([^\n;]*canvasSize\)/);

  const fullCanvasPrintScale = page.match(/const fullCanvasPrintScale\s*=\s*([^;]+);/)?.[1] ?? "";
  assert.ok(fullCanvasPrintScale, "full-canvas print scale should be derived");
  assert.match(fullCanvasPrintScale, /canvasSize\.width/);
  assert.match(fullCanvasPrintScale, /canvasSize\.height/);
  assert.match(page, /const printCropScale\s*=\s*printArea\s*\?[^:;]+:\s*fullCanvasPrintScale/);
  assert.match(page, /const printSource:\s*PrintRect\s*=\s*printArea\s*\?\?\s*\{\s*x:\s*0,\s*y:\s*0,\s*width:\s*canvasSize\.width,\s*height:\s*canvasSize\.height\s*\}/);
  assert.match(page, /"--print-full-scale":\s*String\(fullCanvasPrintScale\)/);
});

test("offers Select-only east, south, and southeast resize handles with keyboard increments", async () => {
  const page = await readFile(pageUrl, "utf8");
  const resizeType = blockAt(page, "type CanvasResizeHandle =");
  const startCanvasResize = blockAt(page, "const startCanvasResize");
  const resizeCanvasWithKeyboard = blockAt(page, "const resizeCanvasWithKeyboard");
  const handles = windowAround(page, 'className="canvas-resize-handle east"', 1_200, 4_000);

  assert.match(resizeType, /"east"\s*\|\s*"south"\s*\|\s*"southeast"/);
  assert.match(startCanvasResize, /kind:\s*"canvasResize"/);
  assert.match(startCanvasResize, /resizeHandle/);
  assert.match(resizeCanvasWithKeyboard, /event\.shiftKey\s*\?\s*100\s*:\s*25/);
  assert.match(resizeCanvasWithKeyboard, /\["ArrowUp",\s*"ArrowDown",\s*"ArrowLeft",\s*"ArrowRight"\]\.includes\(event\.key\)/);
  assert.match(resizeCanvasWithKeyboard, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  assert.match(resizeCanvasWithKeyboard, /ArrowRight/);
  assert.match(resizeCanvasWithKeyboard, /ArrowDown/);
  assert.match(resizeCanvasWithKeyboard, /MAX_CANVAS_DIMENSION/);

  assert.match(handles, /tool\s*===\s*"select"/);
  for (const [handle, label] of [
    ["east", "Extend canvas right edge"],
    ["south", "Extend canvas bottom edge"],
    ["southeast", "Extend canvas right and bottom edges"],
  ]) {
    assert.match(handles, new RegExp(`className="canvas-resize-handle ${handle}"`));
    assert.match(handles, new RegExp(`aria-label="${label}"`));
    assert.match(handles, new RegExp(`startCanvasResize\\(event, "${handle}"\\)`));
    assert.match(handles, new RegExp(`resizeCanvasWithKeyboard\\(event, "${handle}"\\)`));
  }
  assert.match(handles, /className="canvas-size-readout/);
});

test("refits the view when opening projects with different canvas sizes", async () => {
  const page = await readFile(pageUrl, "utf8");
  const openProject = blockAt(page, "const openProject");
  const selectProject = blockAt(page, "const selectProject");

  assert.match(openProject, /projectRef\.current\s*=\s*next/);
  assert.match(openProject, /setProject\(next\)/);
  assert.match(openProject, /autoFitRef\.current\s*=\s*true/);
  assert.match(openProject, /window\.requestAnimationFrame\(fitMapToStage\)/);
  assert.match(selectProject, /openProject\(next\)/);
});

test("restores a canceled canvas resize without adding undo history", async () => {
  const page = await readFile(pageUrl, "utf8");
  const pointerMove = blockAt(page, "const onStagePointerMove");
  const pointerUp = blockAt(page, "const onStagePointerUp");

  assert.match(pointerMove, /activeDrag\.kind\s*===\s*"canvasResize"/);
  assert.match(pointerMove, /normalizeCanvasSize/);
  assert.match(pointerMove, /Math\.max\(activeDrag\.canvasSize\.width/);
  assert.match(pointerMove, /Math\.max\(activeDrag\.canvasSize\.height/);
  assert.match(pointerUp, /kind\s*===\s*"canvasResize"/);
  assert.match(pointerUp, /event\.type\s*===\s*"pointercancel"/);
  assert.match(pointerUp, /update\(original,\s*false\)/);

  const cancelIndex = pointerUp.indexOf('event.type === "pointercancel"');
  const restoreIndex = pointerUp.indexOf("update(original, false)", cancelIndex);
  const returnIndex = pointerUp.indexOf("return", restoreIndex);
  const undoIndex = pointerUp.indexOf("setUndoStack", cancelIndex);
  assert.ok(cancelIndex >= 0 && restoreIndex > cancelIndex && returnIndex > restoreIndex, "pointer cancel should restore and return");
  assert.ok(undoIndex === -1 || undoIndex > returnIndex, "pointer cancel must return before resize undo history is recorded");

  assert.match(page, /onPointerCancel=\{onStagePointerUp\}/);
});

test("pins uploaded references to their saved frame when the canvas grows", async () => {
  const page = await readFile(pageUrl, "utf8");
  const upload = blockAt(page, "const onReferenceUpload");

  assert.match(upload, /current\.reference\.dataUrl\s*&&\s*current\.reference\.frame\s*\?\s*current\.reference\.frame\s*:/);
  assert.match(upload, /current\.reference\.frame\s*=\s*[^;]*normalizeCanvasSize\(current\.canvasSize\)/);
  assert.match(page, /const referenceFrame\s*=\s*normalizeCanvasSize\(project\.reference\.frame\s*\?\?\s*canvasSize\)/);
  const referenceImage = windowAround(page, "reference-image", 400, 1_800);
  assert.match(referenceImage, /width:\s*referenceFrame\.width/);
  assert.match(referenceImage, /height:\s*referenceFrame\.height/);
});

test("draws an explicit canvas boundary and usable resize handles without printing editor chrome", async () => {
  const [page, styles] = await Promise.all([readFile(pageUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  const canvasRule = blockAt(styles, ".map-canvas {");
  const resizeRule = blockAt(styles, ".canvas-resize-handle {");

  assert.doesNotMatch(canvasRule, /width:\s*1200px|height:\s*800px/);
  assert.match(canvasRule, /(?:border|outline|box-shadow):/);
  assert.match(resizeRule, /position:\s*absolute/);
  assert.match(resizeRule, /touch-action:\s*none/);
  assert.match(styles, /\.canvas-resize-handle\.east\s*\{/);
  assert.match(styles, /\.canvas-resize-handle\.south\s*\{/);
  assert.match(styles, /\.canvas-resize-handle\.southeast\s*\{/);
  assert.match(styles, /\.canvas-size-readout\s*\{/);
  assert.match(page, /className="canvas-resize-controls print-hidden"/);
  assert.match(page, /className="canvas-size-readout print-hidden"/);
  assert.match(styles, /@media print[\s\S]*\.print-hidden[^\n}]*display:\s*none\s*!important/);
  assert.doesNotMatch(styles, /@media print[\s\S]*\.map-canvas\s*\{[^}]*scale\(\.72\)/);
});
