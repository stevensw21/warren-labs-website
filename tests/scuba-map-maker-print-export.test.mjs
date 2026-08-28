import assert from "node:assert/strict";
import test from "node:test";

import {
  CLEAN_CHART_EXPORT_SETTINGS,
  FULL_DETAIL_EXPORT_SETTINGS,
  buildRouteLegRows,
  buildUsedSymbolLegend,
  effectiveExportSettings,
  normalizeExportSettings,
  resolveMapViewExportSettings,
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
  assert.equal(FULL_DETAIL_EXPORT_SETTINGS.namePlacement, "asPositioned");
  assert.equal(CLEAN_CHART_EXPORT_SETTINGS.namePlacement, "asPositioned");
});

test("defaults missing or invalid name placement to the current map while preserving explicit legacy modes", () => {
  assert.deepEqual(normalizeExportSettings(), FULL_DETAIL_EXPORT_SETTINGS);
  assert.equal(normalizeExportSettings({}).namePlacement, "asPositioned");
  assert.equal(normalizeExportSettings({ namePlacement: "invalid" }).namePlacement, "asPositioned");
  assert.equal(normalizeExportSettings({ namePlacement: "asPositioned" }).namePlacement, "asPositioned");
  assert.equal(normalizeExportSettings({ namePlacement: "smartCallouts" }).namePlacement, "smartCallouts");

  const saved = normalizeExportSettings({ reference: false, routes: false, routeLabels: true, namePlacement: "smartCallouts" });
  assert.equal(saved.reference, false);
  assert.equal(saved.routes, false);
  assert.equal(saved.routeLabels, true);
  assert.equal(saved.namePlacement, "smartCallouts");
  assert.equal(saved.pointTable, true);
  const legacy = normalizeExportSettings({ contours: true });
  assert.equal("contours" in legacy, false);
});

test("resolves Match current map from visible layers while retaining PDF-only guarantees", () => {
  const layers = {
    reference: false,
    shoreline: true,
    geographicFeatures: true,
    geographicFeatureLabels: false,
    floatingText: true,
    routes: true,
    routeLabels: false,
    routeNameLabels: true,
    pointNames: true,
    names: false,
    depths: true,
    mapFurniture: false,
  };

  assert.deepEqual(resolveMapViewExportSettings(layers, false), {
    reference: false,
    shoreline: true,
    geographicFeatures: true,
    geographicFeatureLabels: false,
    floatingText: true,
    routes: true,
    routeLabels: false,
    routeNameLabels: true,
    pointMarkers: true,
    namedPointMarkersOnly: false,
    pointNames: true,
    fullPointNames: false,
    depths: true,
    mapFurniture: false,
    pointTable: false,
    namePlacement: "asPositioned",
  });
  assert.equal(resolveMapViewExportSettings(layers, true).pointTable, true);
  assert.deepEqual(layers, {
    reference: false,
    shoreline: true,
    geographicFeatures: true,
    geographicFeatureLabels: false,
    floatingText: true,
    routes: true,
    routeLabels: false,
    routeNameLabels: true,
    pointNames: true,
    names: false,
    depths: true,
    mapFurniture: false,
  });
});

test("preserves independently visible current-map labels without changing their source layer state", () => {
  const layers = {
    reference: true,
    shoreline: true,
    geographicFeatures: false,
    geographicFeatureLabels: true,
    floatingText: true,
    routes: false,
    routeLabels: true,
    routeNameLabels: true,
    pointNames: false,
    names: true,
    depths: false,
    mapFurniture: true,
  };

  const resolved = resolveMapViewExportSettings(layers, true);
  assert.equal(resolved.geographicFeatures, false);
  assert.equal(resolved.geographicFeatureLabels, true);
  assert.equal(resolved.routes, false);
  assert.equal(resolved.routeLabels, true);
  assert.equal(resolved.routeNameLabels, true);
  assert.equal(resolved.pointMarkers, true);
  assert.equal(resolved.pointNames, false);
  assert.equal(resolved.fullPointNames, true);
  assert.equal(resolved.pointTable, true);
  assert.equal(resolved.namePlacement, "asPositioned");
  assert.equal(layers.geographicFeatureLabels, true);
  assert.equal(layers.routeLabels, true);
  assert.equal(layers.routeNameLabels, true);
});

test("resolves every current-map layer combination without leaking optimized PDF choices", () => {
  const layerKeys = [
    "reference",
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
  ];

  for (let mask = 0; mask < 2 ** layerKeys.length; mask += 1) {
    const layers = Object.fromEntries(layerKeys.map((key, index) => [key, Boolean(mask & (1 << index))]));
    for (const pointTable of [false, true]) {
      const resolved = resolveMapViewExportSettings(layers, pointTable);
      assert.equal(resolved.reference, layers.reference);
      assert.equal(resolved.shoreline, layers.shoreline);
      assert.equal(resolved.geographicFeatures, layers.geographicFeatures);
      assert.equal(resolved.geographicFeatureLabels, layers.geographicFeatureLabels);
      assert.equal(resolved.floatingText, layers.floatingText);
      assert.equal(resolved.routes, layers.routes);
      assert.equal(resolved.routeLabels, layers.routeLabels);
      assert.equal(resolved.routeNameLabels, layers.routeNameLabels);
      assert.equal(resolved.pointMarkers, true);
      assert.equal(resolved.namedPointMarkersOnly, false);
      assert.equal(resolved.pointNames, layers.pointNames);
      assert.equal(resolved.fullPointNames, layers.names);
      assert.equal(resolved.depths, layers.depths);
      assert.equal(resolved.mapFurniture, layers.mapFurniture);
      assert.equal(resolved.pointTable, pointTable);
      assert.equal(resolved.namePlacement, "asPositioned");
    }
  }
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
