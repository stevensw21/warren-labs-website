import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);
const printExportUrl = new URL("../app/projects/scuba-map-maker/print-export.ts", import.meta.url);

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

test("keeps floating text optional in v2 storage and normalized in every opened project", async () => {
  const page = await readFile(pageUrl, "utf8");
  const projectType = blockAt(page, "type Project =");
  const storedType = blockAt(page, "type StoredProject =");
  const emptyProject = blockAt(page, "const emptyProject");
  const normalizeProject = blockAt(page, "function normalizeProject");

  assert.match(projectType, /floatingTexts: FloatingText\[\]/);
  assert.match(storedType, /floatingTexts\?: unknown/);
  assert.match(emptyProject, /floatingTexts: \[\]/);
  assert.match(normalizeProject, /project\.floatingTexts = normalizeFloatingTexts\(stored\.floatingTexts, project\.canvasSize, id, project\.geographicFeatures\.map/);
  assert.match(page, /\.\.\.project\.floatingTexts/);
  assert.match(page, /indexedDB\.open\(DB_NAME, 1\)/);
});

test("places floating text from the Draw Feature picker and returns to Select", async () => {
  const page = await readFile(pageUrl, "utf8");
  const toolType = page.match(/type Tool = ([^;]+);/)?.[1] ?? "";
  const beginPlacement = blockAt(page, "const beginFloatingTextPlacement");
  const addTextStart = page.indexOf("const addFloatingText");
  const addTextEnd = page.indexOf("const beginFeatureDrawing", addTextStart);
  const addText = page.slice(addTextStart, addTextEnd);
  const stagePointerDown = blockAt(page, "const onStagePointerDown");
  const pickerIndex = page.indexOf('beginFeatureDrawing("freehand")');
  const textIndex = page.indexOf("beginFloatingTextPlacement", pickerIndex);
  const splineIndex = page.indexOf('beginFeatureDrawing("spline")', pickerIndex);

  assert.match(toolType, /"text"/);
  assert.ok(pickerIndex >= 0 && textIndex > pickerIndex && splineIndex > textIndex, "Floating text should sit beside Freehand in the feature picker");
  assert.match(beginPlacement, /setTool\("text"\)/);
  assert.match(addText, /current\.floatingTexts\.push\(/);
  assert.equal(addText.match(/\bmutate\(/g)?.length, 1);
  assert.match(addText, /setTool\("select"\)/);
  assert.match(addText, /setSurveyTab\("features"\)/);
  assert.match(stagePointerDown, /tool === "text"[^\n]*addFloatingText\(position\)/);
  assert.match(page, /tool === "text"\) && <div className="map-placement-capture print-hidden"/);
  assert.match(page, /active=\{tool === "feature" \|\| tool === "text" \|\| featureModePickerOpen\}/);
});

test("moves, nudges, edits, rotates, resizes, and deletes selected floating text", async () => {
  const page = await readFile(pageUrl, "utf8");
  const pointerMove = blockAt(page, "const onStagePointerMove");
  const pointerUp = blockAt(page, "const onStagePointerUp");
  const nudge = blockAt(page, "const nudgeFloatingText");
  const updateText = blockAt(page, "const updateFloatingText");
  const finishTextEdit = blockAt(page, "const finishFloatingTextEdit");

  assert.match(pointerMove, /activeDrag\.kind === "floatingText"/);
  assert.match(pointerMove, /\(event\.clientX - activeDrag\.x\) \/ zoom/);
  assert.match(pointerMove, /translateFloatingText/);
  assert.match(pointerUp, /kind === "floatingText"/);
  assert.match(pointerUp, /event\.type === "pointercancel"/);
  assert.match(pointerUp, /update\(original, false\)/);
  assert.match(pointerUp, /setUndoStack/);
  assert.match(nudge, /\(event\.shiftKey \? 10 : 1\) \/ zoom/);
  assert.match(updateText, /floatingTextEditStart\.current = clone\(current\)/);
  assert.match(updateText, /setRedoStack\(\[\]\)/);
  assert.match(finishTextEdit, /floatingTextEqual\(before, after\)/);
  assert.match(finishTextEdit, /setUndoStack/);
  for (const label of ["Floating text content", "Floating text size value", "Floating text rotation value", "Floating text size", "Floating text rotation", "Reset rotation", "Delete text"]) {
    assert.ok(page.includes(label), `Expected ${label}`);
  }
});

test("renders independent screen and PDF text with exact inverse-scale typography", async () => {
  const [page, styles, printExport] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(printExportUrl, "utf8"),
  ]);
  const floatingStyle = blockAt(page, "const floatingTextStyle");

  assert.match(floatingStyle, /"--floating-text-font-size": `\$\{item\.size \/ scale\}px`/);
  assert.match(floatingStyle, /"--floating-text-hit-size": `\$\{44 \/ scale\}px`/);
  assert.match(page, /floatingTextStyle\(item, zoom\)/);
  assert.match(page, /floatingTextStyle\(item, effectivePrintScale\)/);
  assert.match(page, /data-floating-text-id=\{item\.id\}/);
  assert.match(page, /floating-text-screen print-hidden/);
  assert.match(page, /floating-text-print screen-hidden/);
  assert.match(page, /printSettings\.floatingText && pointInPrintArea\(item, printArea\)/);
  assert.match(styles, /\.floating-text-item \{[^}]*font-size:\s*var\(--floating-text-font-size[^}]*rotate\(var\(--floating-text-angle/s);
  assert.match(styles, /@media print[\s\S]*\.floating-text-print \{[^}]*text-shadow:\s*none !important;/);
  assert.match(printExport, /floatingText: boolean/);
  assert.match(printExport, /floatingText: true/);
  assert.match(page, /\["floatingText", "Floating text"\]/);
  assert.match(page, /checked=\{visibleLayers\.floatingText\}/);
});
