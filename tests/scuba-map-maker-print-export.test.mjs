import assert from "node:assert/strict";
import test from "node:test";

import {
  CLEAN_CHART_EXPORT_SETTINGS,
  FULL_DETAIL_EXPORT_SETTINGS,
  buildRouteLegRows,
  buildUsedSymbolLegend,
  effectiveExportSettings,
  normalizeExportSettings,
} from "../app/projects/scuba-map-maker/print-export.ts";

test("defines clean-chart and full-survey presets without a persisted preset field", () => {
  assert.deepEqual(CLEAN_CHART_EXPORT_SETTINGS, {
    ...FULL_DETAIL_EXPORT_SETTINGS,
    reference: false,
    routeLabels: false,
  });
  assert.equal("preset" in CLEAN_CHART_EXPORT_SETTINGS, false);
  assert.equal(FULL_DETAIL_EXPORT_SETTINGS.reference, true);
  assert.equal(FULL_DETAIL_EXPORT_SETTINGS.routeLabels, true);
  assert.equal("contours" in FULL_DETAIL_EXPORT_SETTINGS, false);
  assert.equal(FULL_DETAIL_EXPORT_SETTINGS.pointTable, true);
});

test("uses full detail for missing legacy settings and preserves saved values", () => {
  assert.deepEqual(normalizeExportSettings(), FULL_DETAIL_EXPORT_SETTINGS);
  const saved = normalizeExportSettings({ reference: false, routes: false, routeLabels: true, namePlacement: "asPositioned" });
  assert.equal(saved.reference, false);
  assert.equal(saved.routes, false);
  assert.equal(saved.routeLabels, true);
  assert.equal(saved.namePlacement, "asPositioned");
  assert.equal(saved.pointTable, true);
  const legacy = normalizeExportSettings({ contours: true });
  assert.equal("contours" in legacy, false);
});

test("suppresses dependent labels without erasing their saved preferences", () => {
  const saved = normalizeExportSettings({ routes: false, routeLabels: true, routeNameLabels: true, geographicFeatures: false, geographicFeatureLabels: true });
  const effective = effectiveExportSettings(saved);
  assert.equal(saved.routeLabels, true);
  assert.equal(saved.routeNameLabels, true);
  assert.equal(saved.geographicFeatureLabels, true);
  assert.equal(effective.routeLabels, false);
  assert.equal(effective.routeNameLabels, false);
  assert.equal(effective.geographicFeatureLabels, false);
});

test("builds ordered route-leg rows with reversed traversal and stable fallbacks", () => {
  const rows = buildRouteLegRows(
    [{ id: "route-a", name: "", steps: [{ vectorId: "v1", reversed: true }, { vectorId: "missing", reversed: false }] }],
    [{ id: "v1", fromId: "p1", toId: "rv1", bearing: 245, distance: 18.5, unit: "ft" }],
    new Map([["p1", "P1"]]),
  );
  assert.deepEqual(rows, [{
    routeId: "route-a",
    routeName: "Route 1",
    leg: 1,
    vectorId: "v1",
    fromId: "rv1",
    toId: "p1",
    fromLabel: "Vertex 1",
    toLabel: "P1",
    bearing: 245,
    distance: 18.5,
    unit: "ft",
  }]);
});

test("deduplicates used symbols in catalog order and handles an empty map", () => {
  const legend = buildUsedSymbolLegend([
    { symbol: "yacht" },
    { symbol: "shipwreck" },
    { symbol: "yacht" },
    {},
  ]);
  assert.deepEqual(legend.map((symbol) => symbol.id), ["shipwreck", "yacht"]);
  assert.deepEqual(buildUsedSymbolLegend([]), []);
});
