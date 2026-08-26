import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("shows tan shoreline handles only while shoreline editing is active", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  const handleRender = page.match(/\{tool === "coast"\s*&&\s*!project\.shoreLocked\s*&&\s*visibleLayers\.shoreline\s*&&\s*coast\.map\(\(vertex\)\s*=>\s*<button[\s\S]*?\/>\)\}/)?.[0] ?? "";
  assert.ok(handleRender, "shoreline handles should render only in active, unlocked, visible Shoreline mode");
  assert.match(handleRender, /aria-label="Move shoreline vertex"/);
  assert.match(handleRender, /className="coast-vertex"/);
  assert.match(handleRender, /\.\.\.shorelineHandleStyle/);
  assert.match(handleRender, /left:\s*vertex\.x/);
  assert.match(handleRender, /top:\s*vertex\.y/);
  assert.match(handleRender, /onPointerDown=\{\(event\) => startDrag\(event, "coast", vertex\.id\)\}/);

  const coastVertex = blockAt(styles, ".coast-vertex {");
  const coastVisual = blockAt(styles, ".coast-vertex::before {");
  assert.match(coastVertex, /width:\s*var\(--coast-hit-size,\s*44px\)/);
  assert.match(coastVertex, /height:\s*var\(--coast-hit-size,\s*44px\)/);
  assert.match(coastVertex, /display:\s*grid/);
  assert.match(coastVertex, /place-items:\s*center/);
  assert.match(coastVertex, /border:\s*0/);
  assert.match(coastVertex, /background:\s*transparent/);
  assert.match(coastVisual, /content:\s*""/);
  assert.match(coastVisual, /width:\s*var\(--coast-visual-size,\s*18px\)/);
  assert.match(coastVisual, /height:\s*var\(--coast-visual-size,\s*18px\)/);
  assert.match(coastVisual, /border:\s*0/);
  assert.match(coastVisual, /box-shadow:\s*inset 0 0 0 var\(--coast-border-width,\s*2px\) var\(--sand-edge\)/);
  assert.match(coastVisual, /border-radius:\s*50%/);
  assert.match(coastVisual, /background:\s*#f2ead7/);
});

test("keeps shoreline dragging active with bounded zoom-scaled visuals and a stable hit target", async () => {
  const page = await readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8");

  const shorelineHandleStyle = blockAt(page, "const shorelineHandleStyle = {");
  assert.match(shorelineHandleStyle, /"--coast-hit-size": `\$\{44 \/ zoom\}px`/);
  assert.match(shorelineHandleStyle, /"--coast-visual-size": `\$\{Math\.min\(28, Math\.max\(10, 18 \* zoom\)\) \/ zoom\}px`/);
  assert.match(shorelineHandleStyle, /"--coast-border-width": `\$\{Math\.min\(3, Math\.max\(1, 2 \* zoom\)\) \/ zoom\}px`/);

  const startDrag = blockAt(page, "const startDrag = (");
  assert.match(startDrag, /if \(kind !== "coast"\) setTool\("select"\);/);
  assert.match(startDrag, /kind === "coast" && project\.shoreLocked/);
});

test("keeps shoreline handles out of printed maps", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const printStyles = blockAt(styles, "@media print {");

  assert.match(printStyles, /\.coast-vertex\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test("prevents transformed high-zoom canvas content from scrolling the pointer surface", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const mapStage = blockAt(styles, ".map-stage {");

  assert.match(mapStage, /overflow:\s*clip/);
});
