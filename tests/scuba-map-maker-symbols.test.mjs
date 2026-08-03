import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import { POINT_SYMBOLS, normalizePointSymbol, pointSymbolDefinition } from "../app/projects/scuba-map-maker/point-symbols.ts";

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

  assert.match(page, /const routeSymbolPoints = project\.waypoints\.filter\(\(point\) => hasDescriptiveName\(point\) && point\.symbol\);/);
  assert.match(page, /<mask id="route-symbol-clearance-mask" className="route-symbol-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse"/);
  assert.match(page, /<rect[^>]*width=\{CANVAS\.width\}[^>]*height=\{CANVAS\.height\}[^>]*fill="white"\/>/);

  const symbolCutouts = page.match(/\{routeSymbolPoints\.map\(\(point\) => <circle[\s\S]*?\/>\)\}/)?.[0] ?? "";
  assert.ok(symbolCutouts, "symbol-bearing named points should create route mask cutouts");
  assert.match(symbolCutouts, /route-symbol-cutout/);
  assert.match(symbolCutouts, /exportClass\(exportSettings\.pointMarkers && pointInPrintArea\(point, printArea\)\)/);
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

  assert.match(page, /"--route-symbol-cutout-radius": `\$\{30 \/ zoom\}px`/);
  assert.match(page, /"--print-route-symbol-cutout-radius": `\$\{20 \/ effectivePrintScale\}px`/);
  assert.match(page, /"--point-symbol-size": `\$\{38 \/ zoom\}px`/);
  assert.match(page, /"--print-point-symbol-size": `\$\{24 \/ effectivePrintScale\}px`/);
  assert.match(styles, /\.route-symbol-mask \{ mask-type: luminance; \}/);
  assert.match(styles, /\.route-symbol-cutout \{ r: var\(--route-symbol-cutout-radius, 30px\); \}/);
  assert.match(styles, /@media print[\s\S]*\.route-network \{[^}]*--route-symbol-cutout-radius: var\(--print-route-symbol-cutout-radius\) !important;/);

  const vectorButton = page.match(/<button className=\{`vector-line[\s\S]*?\/>/)?.[0] ?? "";
  assert.ok(vectorButton, "the full route hit control should remain rendered outside the mask");
  assert.match(vectorButton, /left: line\.start\.x, top: line\.start\.y, width: line\.pixels/);
  assert.doesNotMatch(vectorButton, /route-symbol-clearance-mask|route-symbol-cutout/);
});
