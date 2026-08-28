import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { pointVisualZoom } from "../app/projects/scuba-map-maker/map-view.ts";
import { createPrintProjection, exactPrintClipGeometry, printViewportFor } from "../app/projects/scuba-map-maker/print-layout.ts";

const pageUrl = new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);
const fixtureUrl = new URL("./fixtures/scuba-map-maker-wysiwyg-project.json", import.meta.url);
const closeTo = (actual, expected, epsilon = 1e-12) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≉ ${expected}`);

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

test("ships a deterministic exact-view fixture with labels and painted overlaps at every crop edge", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const { x, y, width, height } = fixture.printArea;
  const waypointById = new Map(fixture.waypoints.map((point) => [point.id, point]));

  assert.equal(fixture.version, 2);
  assert.equal(fixture.canvasSize.width, 1200);
  assert.equal(fixture.canvasSize.height, 800);
  assert.equal(fixture.exportSettings.namePlacement, "asPositioned");
  assert.ok(fixture.reference.dataUrl.startsWith("data:image/svg+xml,"));
  assert.equal(fixture.reference.visible, true);
  assert.equal(fixture.reference.opacity, 0.73);
  assert.equal(waypointById.get("p12").label, "P12");
  assert.equal(waypointById.get("p13").label, "P13");
  assert.equal(waypointById.get("p12").name, "");
  assert.equal(waypointById.get("p13").name, "");
  assert.equal(waypointById.get("p12").symbol, undefined);
  assert.equal(waypointById.get("p13").symbol, undefined);
  for (const id of ["p12", "p13"]) {
    const point = waypointById.get(id);
    assert.ok(point.x >= x && point.x <= x + width);
    assert.ok(point.y >= y && point.y <= y + height);
  }
  const namedSymbol = waypointById.get("named-symbol");
  assert.equal(namedSymbol.symbol, "shipwreck");
  assert.equal(namedSymbol.depth, 42);
  assert.deepEqual(namedSymbol.labelOffsets, { name: { dx: 34, dy: -22 }, depth: { dx: 28, dy: 19 } });
  assert.ok(waypointById.get("left-edge-marker").x < x);
  assert.ok(waypointById.get("right-edge-marker").x > x + width);
  assert.ok(waypointById.get("top-edge-marker").y < y);
  assert.ok(waypointById.get("bottom-edge-marker").y > y + height);
  for (const zoom of [1, 4, 4.62, 8]) {
    const paintedRadius = 7 / pointVisualZoom(zoom, fixture.visualScaleStopZoom);
    assert.ok(x - waypointById.get("left-edge-marker").x < paintedRadius, `left marker overlaps at ${zoom * 100}%`);
    assert.ok(waypointById.get("right-edge-marker").x - (x + width) < paintedRadius, `right marker overlaps at ${zoom * 100}%`);
    assert.ok(y - waypointById.get("top-edge-marker").y < paintedRadius, `top marker overlaps at ${zoom * 100}%`);
    assert.ok(waypointById.get("bottom-edge-marker").y - (y + height) < paintedRadius, `bottom marker overlaps at ${zoom * 100}%`);
  }
  const outsideManual = waypointById.get("outside-manual-label");
  const manualNamePosition = {
    x: outsideManual.x + outsideManual.labelOffsets.name.dx,
    y: outsideManual.y + outsideManual.labelOffsets.name.dy,
  };
  assert.ok(outsideManual.x < x);
  assert.ok(manualNamePosition.x > x && manualNamePosition.x < x + width);
  assert.ok(manualNamePosition.y > y && manualNamePosition.y < y + height);
  const rotatedEdgeText = fixture.floatingTexts.find((item) => item.id === "floating-rotated-edge");
  assert.ok(rotatedEdgeText.x < x && x - rotatedEdgeText.x < rotatedEdgeText.size);
  assert.notEqual(rotatedEdgeText.rotation, 0);
  const horizontalFeature = fixture.geographicFeatures.find((feature) => feature.id === "feature-horizontal-edges");
  const verticalFeature = fixture.geographicFeatures.find((feature) => feature.id === "feature-vertical-edges");
  assert.ok(Math.min(...horizontalFeature.points.map((point) => point.x)) < x);
  assert.ok(Math.max(...horizontalFeature.points.map((point) => point.x)) > x + width);
  assert.ok(Math.min(...verticalFeature.points.map((point) => point.y)) < y);
  assert.ok(Math.max(...verticalFeature.points.map((point) => point.y)) > y + height);
  const routeVertexById = new Map(fixture.routeVertices.map((point) => [point.id, point]));
  assert.ok(routeVertexById.get("route-left").x < x && routeVertexById.get("route-right").x > x + width);
  assert.ok(routeVertexById.get("route-top").y < y && routeVertexById.get("route-bottom").y > y + height);
  assert.ok(fixture.geographicFeatures.every((feature) => feature.style.color.startsWith("#")));
});

test("keeps exact-view coordinates and visual proportions normalized at 100%, 400%, 462%, and 800%", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const source = fixture.printArea;
  const projection = createPrintProjection(source, printViewportFor("map"));
  const clip = exactPrintClipGeometry(source, projection);
  const anchors = [
    ...fixture.waypoints,
    ...fixture.floatingTexts,
    ...fixture.geographicFeatures.flatMap((feature) => feature.points),
    ...fixture.routeVertices,
  ];

  for (const zoom of [1, 4, 4.62, 8]) {
    for (const anchor of anchors) {
      const screen = {
        x: (anchor.x - source.x) * zoom,
        y: (anchor.y - source.y) * zoom,
      };
      const pdf = {
        x: anchor.x * projection.scale + clip.canvasOffsetX,
        y: anchor.y * projection.scale + clip.canvasOffsetY,
      };
      closeTo(screen.x / (source.width * zoom), pdf.x / clip.viewport.width);
      closeTo(screen.y / (source.height * zoom), pdf.y / clip.viewport.height);
    }

    const visualScale = pointVisualZoom(zoom, fixture.visualScaleStopZoom);
    const screenMarkerWidth = (14 / visualScale) * zoom;
    const pdfMarkerWidth = (14 / visualScale) * projection.scale;
    closeTo(screenMarkerWidth / (source.width * zoom), pdfMarkerWidth / clip.viewport.width);
    const floating = fixture.floatingTexts.find((item) => item.id === "floating-rotated-edge");
    const screenTextHeight = (floating.size / zoom) * zoom;
    const pdfTextHeight = (floating.size / zoom) * projection.scale;
    closeTo(screenTextHeight / (source.height * zoom), pdfTextHeight / clip.viewport.height);
    assert.equal(floating.rotation, -32);
  }
});

test("resolves Match current map from visible layers while retaining optimized callouts", async () => {
  const page = await readFile(pageUrl, "utf8");
  const exportSetupStart = page.indexOf("const exportSettings = normalizeExportSettings");
  const exportSetupEnd = page.indexOf("const printPointTableChunks", exportSetupStart);
  const exportSetup = page.slice(exportSetupStart, exportSetupEnd);

  assert.ok(exportSetupStart >= 0 && exportSetupEnd > exportSetupStart, "expected the export setup block");
  assert.match(page, /resolveMapViewExportSettings/);
  assert.match(exportSetup, /const namePlacement: NamePlacement = exportSettings\.namePlacement === "smartCallouts" \? "smartCallouts" : "asPositioned"/);
  assert.match(exportSetup, /const matchCurrentMap = namePlacement === "asPositioned"/);
  assert.match(exportSetup, /const printSettings = matchCurrentMap\s*\? resolveMapViewExportSettings\(\{/);
  assert.match(exportSetup, /reference: Boolean\(project\.reference\.dataUrl && project\.reference\.visible\)/);
  for (const layer of [
    "shoreline",
    "geographicFeatures",
    "geographicFeatureLabels",
    "floatingText",
    "routes",
    "routeLabels",
    "routeNameLabels",
    "pointNames",
    "names",
    "depths",
    "mapFurniture",
  ]) {
    assert.match(exportSetup, new RegExp(`${layer}: visibleLayers\\.${layer}`));
  }
  assert.match(exportSetup, /\}, exportSettings\.pointTable\)\s*:\s*effectiveExportSettings\(exportSettings\)/);
  assert.match(page, /<h3>PDF layout<\/h3>/);
  assert.match(page, /role="radiogroup" aria-label="PDF layout"/);
  assert.match(page, /value="asPositioned"[\s\S]{0,240}<b>Match current map<\/b>/);
  assert.match(page, /value="smartCallouts"[\s\S]{0,240}<b>Optimized chart<\/b>/);
  assert.match(page, /matchCurrentMap \? <div className="drawer-section export-settings current-map-export-settings">/);
  assert.match(page, /The PDF uses the layers currently visible on the map/);
  assert.match(page, /Presets update the existing layer choices without changing the PDF layout/);
  assert.match(page, /const smartCalloutsRequested = namePlacement === "smartCallouts" && smartNamePoints\.length > 0/);
});

test("keeps the selected layout when applying either readability preset", async () => {
  const page = await readFile(pageUrl, "utf8");
  const applyExportPreset = blockAt(page, "const applyExportPreset");

  assert.match(applyExportPreset, /preset === "clean" \? CLEAN_CHART_EXPORT_SETTINGS : FULL_DETAIL_EXPORT_SETTINGS/);
  assert.match(
    applyExportPreset,
    /current\.exportSettings = \{\s*\.\.\.\(preset === "clean" \? CLEAN_CHART_EXPORT_SETTINGS : FULL_DETAIL_EXPORT_SETTINGS\),\s*namePlacement: normalizeExportSettings\(current\.exportSettings\)\.namePlacement,?\s*\}/,
  );
});

test("keeps appendix membership crop-based while exact map visuals bypass anchor exclusion", async () => {
  const page = await readFile(pageUrl, "utf8");
  const annotationPrintVisible = blockAt(page, "const annotationPrintVisible");

  assert.match(page, /const includeMapPrintAnchor = [\s\S]{0,240}?matchCurrentMap\s*\|\|\s*pointInPrintArea\(point, printArea\)/);
  assert.match(page, /const printPoints = project\.waypoints\.filter\(\(point\) => pointInPrintArea\(point, printArea\)\)/);
  assert.doesNotMatch(page, /const printPoints = project\.waypoints\.filter\(\(point\) => includeMapPrintAnchor\(point\)\)/);

  assert.match(annotationPrintVisible, /!enabled \|\| !includeMapPrintAnchor\(point\)/);
  assert.doesNotMatch(annotationPrintVisible, /!enabled \|\| !pointInPrintArea\(point, printArea\)/);
  assert.match(page, /exportClass\(printSettings\.pointMarkers && includeMapPrintAnchor\(point\)\)/);
  assert.match(page, /\{includeMapPrintAnchor\(anchor\) && <span className=\{`feature-name-label feature-name-label-print/);
  assert.match(page, /printSettings\.floatingText && includeMapPrintAnchor\(item\)/);
  assert.match(page, /exportClass\(includeMapPrintAnchor\(point\)\)/);

  assert.doesNotMatch(page, /exportClass\(printSettings\.pointMarkers && pointInPrintArea\(point, printArea\)\)/);
  assert.doesNotMatch(page, /\{pointInPrintArea\(anchor, printArea\) && <span className=\{`feature-name-label feature-name-label-print/);
  assert.doesNotMatch(page, /printSettings\.floatingText && pointInPrintArea\(item, printArea\)/);
  assert.doesNotMatch(page, /className=\{`waypoint named-point[\s\S]{0,300}exportClass\(pointInPrintArea\(point, printArea\)\)/);
});

test("uses current-map anchors and visual scales only in exact mode", async () => {
  const [page, styles] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(page, /className=\{`map-stage \$\{matchCurrentMap \? "match-map-print" : "optimized-chart-print"\}/);
  assert.match(page, /const print = matchCurrentMap \? screen : routeLabelAnchor\(route, nodes, project\.vectors, printArea\)/);
  assert.match(page, /routeNameLabelStyle\(matchCurrentMap \? print : clampPrintLabelAnchor\(print\)\)/);
  assert.match(page, /!matchCurrentMap && printFeatureLabelBelow\(anchor, featureLabelIndex\)/);
  assert.match(page, /featureNameLabelStyle\(matchCurrentMap \? anchor : clampPrintLabelAnchor\(anchor, 84, 60\)\)/);
  assert.match(page, /floatingTextStyle\(item, matchCurrentMap \? zoom : effectivePrintScale\)/);
  assert.match(page, /screenDistance >= \(matchCurrentMap \? 8 : 6\)/);

  assert.match(styles, /\.map-stage\.optimized-chart-print \.reference-image \{[^}]*--print-reference-opacity/);
  assert.match(styles, /\.map-stage\.optimized-chart-print \.route-network \{[^}]*--route-width: var\(--print-route-width\)/);
  assert.match(styles, /\.map-stage\.optimized-chart-print \.point-annotation-auto \{[^}]*--annotation-print-y/);
  assert.match(styles, /\.map-stage\.match-map-print \{[^}]*font-family: Inter, Geist, "Avenir Next", "Segoe UI", Arial, sans-serif !important/);
  assert.match(styles, /\.map-stage\.match-map-print \.point-annotation-name\.screen-primary-name \{[^}]*--annotation-label-size/);
  assert.match(styles, /\.map-stage\.match-map-print \.point-annotation:hover \.point-annotation-chip\.point-annotation-name[^}]*color: rgba\(11,48,75,\.75\)/);
  assert.match(styles, /\.map-stage\.match-map-print \.point-annotation:hover \.point-annotation-chip\.point-annotation-depth[^}]*color: #157f96/);
  assert.doesNotMatch(styles, /@media print[\s\S]*?\n\s{2}\.reference-image \{[^}]*--print-reference-opacity/);
  assert.doesNotMatch(styles, /@media print[\s\S]*?\n\s{2}\.route-network \{[^}]*--route-width: var\(--print-route-width\)/);
});
