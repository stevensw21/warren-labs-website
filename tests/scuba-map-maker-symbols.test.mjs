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
