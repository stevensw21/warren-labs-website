import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("wires contextual whole-route and single-segment calibration through one panel", async () => {
  const [page, styles] = await Promise.all([readFile(pageUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  const focusRoute = blockAt(page, "const focusRoute");
  const selectVector = blockAt(page, "const selectVector");
  const calibrateMap = blockAt(page, "const calibrateMap");

  assert.match(page, /type Calibration = \{ routeId\?: string; vectorId\?: string; distance\?: number; unit\?: Unit; metersPerPixel: number \}/);
  assert.match(page, /useState<CalibrationSourceMode>\("segment"\)/);
  assert.match(focusRoute, /const nextMode: CalibrationSourceMode = nextVector \? "segment" : "route"/);
  assert.match(focusRoute, /setSelectedVectorId\(nextVector\?\.id \?\? null\)/);
  assert.match(focusRoute, /routePixelLength\(route, project\.vectors, routeNodes\(project\)\)/);
  assert.match(selectVector, /setCalibrationMode\("segment"\)/);
  assert.match(page, /aria-label="Calibration source type"/);
  assert.match(page, />Whole route<\/button>/);
  assert.match(page, />Single segment<\/button>/);
  assert.match(page, /Reference route/);
  assert.match(page, /Reference segment/);
  assert.match(page, /Known route distance/);
  assert.match(page, /Known segment distance/);
  assert.doesNotMatch(styles, /\.segment-composer,\s*\.calibration-section\s*\{\s*display:\s*none;/);
  assert.match(page, /const total = distanceForSourcePixels\(routePixelLength\(route, project\.vectors, routeNodes\(project\)\), project\.distanceUnit\)/);

  assert.match(calibrateMap, /metersPerPixel\(distance, calibrationForm\.unit, sourcePixels \?\? 0\)/);
  assert.match(calibrateMap, /current\.calibration = \{ routeId: selectedRoute\.id, distance, unit: calibrationForm\.unit, metersPerPixel: nextScale \}/);
  assert.match(calibrateMap, /current\.calibration = \{ vectorId: selectedVector\.id, distance, unit: calibrationForm\.unit, metersPerPixel: nextScale \}/);
  assert.doesNotMatch(calibrateMap, /routeId: selectedRoute\.id[^}]*vectorId:/);
  assert.doesNotMatch(calibrateMap, /vectorId: selectedVector\.id[^}]*routeId:/);
});

test("keeps the fixed scale while stale calibration references normalize to scale-only metadata", async () => {
  const page = await readFile(pageUrl, "utf8");
  const normalizedCalibration = blockAt(page, "function normalizedCalibration");
  const synchronizeVectors = blockAt(page, "function synchronizeVectors");

  assert.match(normalizedCalibration, /const metersPerSourcePixel = mapScale\(project\)/);
  assert.match(normalizedCalibration, /calibrationReferenceIsCurrent\(calibration, project\.routes \?\? \[\], project\.vectors, routeNodes\(project\)\)/);
  assert.match(normalizedCalibration, /return \{ metersPerPixel: metersPerSourcePixel \}/);
  assert.match(synchronizeVectors, /project\.calibration = normalizedCalibration\(project\)/);
  assert.match(synchronizeVectors, /vector\.distance = round\(\(line\.pixels \* metersPerPixel\) \/ METERS_PER_UNIT\[project\.distanceUnit\]\)/);
  assert.match(page, /project\.calibration = \{ \.\.\.project\.calibration, metersPerPixel: mapScale\(project\) \}/);
  assert.match(page, /indexedDB\.open\(DB_NAME, 1\)/);
  assert.doesNotMatch(page, /indexedDB\.open\(DB_NAME, 2\)/);
});

test("applies the 400 percent clamp only to visible point content", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /const pointVisualScale = pointVisualZoom\(zoom\)/);
  for (const expression of [
    "14 / pointVisualScale",
    "38 * pointSymbolScale / pointVisualScale",
    "30 * pointSymbolScale / pointVisualScale",
    "13 / pointVisualScale",
    "10 / pointVisualScale",
    "1 / pointVisualScale",
  ]) {
    assert.ok(page.includes(expression), `Expected visible point sizing to use ${expression}`);
  }
  assert.match(page, /"--annotation-auto-y": `\$\{\(-5 \+ automaticIndex \* 17\) \/ pointVisualScale\}px`/);
  assert.match(page, /"--annotation-touch-y": `\$\{[^`]+ \/ zoom\}px`/);
  assert.match(page, /"--point-hit-size": `\$\{44 \/ zoom\}px`/);
  assert.match(page, /"--annotation-touch-hit": `\$\{44 \/ zoom\}px`/);
  assert.match(page, /"--annotation-manual-hit": `\$\{44 \/ zoom\}px`/);
  assert.match(page, /"--route-label-font": `\$\{11 \/ zoom\}px`/);
  assert.match(page, /"--feature-name-font": `\$\{11 \/ zoom\}px`/);
  assert.match(page, /"--print-point-symbol-size": `\$\{24 \* pointSymbolScale \/ effectivePrintScale\}px`/);
  assert.match(page, /"--print-point-leader-width": `\$\{1\.15 \/ effectivePrintScale\}px`/);
  assert.match(page, /querySelector<HTMLElement>\("\.point-annotation-chip"\)/);
});
