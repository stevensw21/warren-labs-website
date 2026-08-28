import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import { DEFAULT_POINT_SYMBOL_SCALE, MAX_POINT_SYMBOL_SCALE, MIN_POINT_SYMBOL_SCALE, POINT_SYMBOLS, normalizePointSymbol, normalizePointSymbolScale, pointSymbolDefinition } from "../app/projects/scuba-map-maker/point-symbols.ts";

test("the Scuba Map Maker ships the complete supplied symbol catalog", async () => {
  assert.equal(POINT_SYMBOLS.length, 16);
  assert.equal(new Set(POINT_SYMBOLS.map((symbol) => symbol.id)).size, POINT_SYMBOLS.length);
  await Promise.all(POINT_SYMBOLS.map(async (symbol) => {
    const definition = pointSymbolDefinition(symbol.id);
    assert.equal(definition.asset, `/point-symbols/${symbol.id}.png`);
    await access(new URL(`../public${definition.asset}`, import.meta.url));
  }));
});

test("saved symbols normalize safely and both editing surfaces render", async () => {
  assert.equal(normalizePointSymbol("shipwreck"), "shipwreck");
  assert.equal(normalizePointSymbol("unsupported"), undefined);
  assert.equal(normalizePointSymbol(null), undefined);
  assert.equal(DEFAULT_POINT_SYMBOL_SCALE, 1);
  assert.equal(MIN_POINT_SYMBOL_SCALE, 0.5);
  assert.equal(MAX_POINT_SYMBOL_SCALE, 2);
  assert.equal(normalizePointSymbolScale(undefined), 1);
  assert.equal(normalizePointSymbolScale(Number.NaN), 1);
  assert.equal(normalizePointSymbolScale("1.5"), 1);
  assert.equal(normalizePointSymbolScale(0.1), 0.5);
  assert.equal(normalizePointSymbolScale(1.26), 1.3);
  assert.equal(normalizePointSymbolScale(9), 2);

  const page = await readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8");
  assert.match(page, /PointSymbolPicker/);
  assert.match(page, /<th>Symbol<\/th>/);
  assert.match(page, /point-symbol-cell/);
  assert.match(page, /point-symbol-marker/);
  assert.match(page, /smart-callout-anchor-symbol/);
});

test("keeps Scuba Map Maker route vectors clear of visible point symbols on screen and in PDF", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const routeSymbolPoints = project\.waypoints\.filter\(\(point\) => point\.symbol\);/);
  assert.match(page, /<mask id="route-symbol-clearance-mask" className="route-symbol-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse"/);
  assert.match(page, /<rect[^>]*width=\{canvasSize\.width\}[^>]*height=\{canvasSize\.height\}[^>]*fill="white"\/>/);

  const symbolCutouts = page.match(/\{routeSymbolPoints\.map\(\(point\) => <circle[\s\S]*?\/>\)\}/)?.[0] ?? "";
  assert.ok(symbolCutouts, "every symbol-bearing point of interest should create a route mask cutout");
  assert.match(symbolCutouts, /route-symbol-cutout/);
  assert.match(symbolCutouts, /exportClass\(printSettings\.pointMarkers && includeMapPrintAnchor\(point\)\)/);
  assert.match(symbolCutouts, /data-route-symbol-cutout=\{point\.id\}/);
  assert.match(symbolCutouts, /fill="black"/);

  const maskedRouteInkStart = page.indexOf('<g className="route-network-ink" mask="url(#route-symbol-clearance-mask)">');
  const maskedRouteInkEnd = page.indexOf("\n              </g>\n            </svg>", maskedRouteInkStart);
  assert.ok(maskedRouteInkStart >= 0 && maskedRouteInkEnd > maskedRouteInkStart, "the route network should apply the symbol clearance mask");
  const maskedRouteInk = page.slice(maskedRouteInkStart, maskedRouteInkEnd);
  assert.match(maskedRouteInk, /route-network-base/);
  assert.match(maskedRouteInk, /route-network-branch/);
  assert.match(maskedRouteInk, /route-network-selection print-hidden/);
  assert.match(maskedRouteInk, /route-selection-line/);
  assert.match(maskedRouteInk, /route-direction/);

  assert.match(page, /pointSymbolScale\?: number/);
  assert.match(page, /visualScaleStopZoom\?: number/);
  assert.match(page, /visualScaleStopZoom: DEFAULT_VISUAL_SCALE_STOP_ZOOM/);
  assert.match(page, /import \{[^}]*DEFAULT_POINT_SYMBOL_SCALE[^}]*MAX_POINT_SYMBOL_SCALE[^}]*MIN_POINT_SYMBOL_SCALE[^}]*normalizePointSymbolScale[^}]*\} from "\.\/point-symbols";/);
  assert.match(page, /project\.pointSymbolScale = normalizePointSymbolScale\(project\.pointSymbolScale\);/);
  assert.match(page, /project\.visualScaleStopZoom = normalizeVisualScaleStopZoom\(project\.visualScaleStopZoom\);/);
  assert.match(page, /Map visuals/);
  assert.match(page, /aria-label="Map icon size" type="range" min=\{MIN_POINT_SYMBOL_SCALE\} max=\{MAX_POINT_SYMBOL_SCALE\} step="0\.1"/);
  assert.match(page, /const VISUAL_SCALE_STOP_ZOOM_OPTIONS = Array\.from/);
  assert.match(page, /<select id="visual-scale-stop-zoom" aria-label="Point and route labels full-size zoom" value=\{visualScaleStopZoom\} onChange=\{\(event\) => setVisualScaleStopZoom\(Number\(event\.target\.value\)\)\}/);
  assert.match(page, /VISUAL_SCALE_STOP_ZOOM_OPTIONS\.map\(\(value\) => <option value=\{value\} key=\{value\}>\{Math\.round\(value \* 100\)\}% zoom<\/option>/);
  assert.match(page, /const visualScaleStopZoom = normalizeVisualScaleStopZoom\(project\.visualScaleStopZoom\);/);
  assert.match(page, /const setVisualScaleStopZoom = \(value: number\) => mutate\([^;]+normalizeVisualScaleStopZoom\(value\)/);
  assert.match(page, /const pointVisualScale = pointVisualZoom\(zoom, visualScaleStopZoom\);/);
  assert.match(page, /"--route-symbol-cutout-radius": `\$\{30 \* pointSymbolScale \/ pointVisualScale\}px`/);
  assert.match(page, /"--print-route-symbol-cutout-radius": `\$\{20 \* pointSymbolScale \/ effectivePrintScale\}px`/);
  assert.match(page, /"--point-symbol-size": `\$\{38 \* pointSymbolScale \/ pointVisualScale\}px`/);
  assert.match(page, /"--print-point-symbol-size": `\$\{24 \* pointSymbolScale \/ effectivePrintScale\}px`/);
  assert.match(page, /"--print-route-name-width": `\$\{150 \/ effectivePrintScale\}px`/);
  assert.match(page, /width=\{smartCalloutSymbolSize\.width\} height=\{smartCalloutSymbolSize\.height\}/);
  assert.match(styles, /\.route-symbol-mask \{ mask-type: luminance; \}/);
  assert.match(styles, /\.route-symbol-cutout \{ r: var\(--route-symbol-cutout-radius, 30px\); \}/);
  assert.match(styles, /@media print[\s\S]*\.route-network \{[^}]*--route-symbol-cutout-radius: var\(--print-route-symbol-cutout-radius\) !important;/);

  const vectorButton = page.match(/<button className=\{`vector-line[\s\S]*?\/>/)?.[0] ?? "";
  assert.ok(vectorButton, "the full route hit control should remain rendered outside the mask");
  assert.match(vectorButton, /left: line\.start\.x, top: line\.start\.y, width: line\.pixels/);
  assert.doesNotMatch(vectorButton, /route-symbol-clearance-mask|route-symbol-cutout/);
});
