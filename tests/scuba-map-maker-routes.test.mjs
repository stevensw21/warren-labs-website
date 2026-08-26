import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_MAP_PAN, DEFAULT_MAP_ZOOM, fitMapView } from "../app/projects/scuba-map-maker/map-view.ts";
import { buildRouteNetwork } from "../app/projects/scuba-map-maker/route-network.ts";

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
    if (depth === 0) return { start: markerIndex, end: index + 1, text: source.slice(markerIndex, index + 1) };
  }
  assert.fail(`Unclosed block after ${marker}`);
}

test("fits the logical map canvas to large stages without shrinking compact views", () => {
  const desktop = fitMapView(2036, 1260, 1200, 800);
  assert.ok(desktop.zoom > DEFAULT_MAP_ZOOM);
  assert.ok(Math.abs(desktop.zoom - 1.515) < 0.001);
  assert.ok(Math.abs(desktop.pan.x - 109) < 0.001);
  assert.ok(Math.abs(desktop.pan.y - 24) < 0.001);
  const desktopCoverage = (1200 * desktop.zoom * 800 * desktop.zoom) / (2036 * 1260);
  assert.ok(desktopCoverage > 0.85);

  const compact = fitMapView(390, 734, 1200, 800);
  assert.deepEqual(compact, { zoom: DEFAULT_MAP_ZOOM, pan: DEFAULT_MAP_PAN });
});

test("ships the Warren Labs local-first Scuba Map Maker", async () => {
  const [page, layout, packageJson, styles] = await Promise.all([
    readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/projects/scuba-map-maker/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /indexedDB\.open/);
  assert.doesNotMatch(page, /\bA0\b/);
  assert.match(page, /Print \/ Save PDF/);
  assert.match(page, /Download backup/);
  assert.match(page, /Upload reference image/);
  assert.match(page, /changeMapZoom\(1\.25\)/);
  assert.doesNotMatch(page, /Math\.min\(1\.25/);
  assert.match(page, /metersPerPixel/);
  assert.match(page, /Set map scale/);
  assert.match(page, /Place a field point/);
  assert.match(page, /Point Name/);
  assert.match(page, /<th>Symbol<\/th>/);
  assert.match(page, /label="Draw Route"/);
  assert.match(page, /type RouteDraft = \{ points: DraftRoutePoint\[\]; name: string;/);
  assert.match(page, /aria-label="Route drawing controls"/);
  assert.match(page, /Current depth/);
  assert.match(page, /shoreLocked/);
  assert.match(page, /Lock shore/);
  assert.match(page, /Unlock shore/);
  assert.match(page, /shoreStrokeStyle/);
  assert.match(page, /routeControlStyle/);
  assert.match(page, /routeNetworkStyle/);
  assert.match(page, /route-label-font/);
  assert.match(page, /waypointDisplayStyle/);
  assert.match(page, /Delete \$\{point\.label\}/);
  assert.match(page, /Open in new window/);
  assert.match(page, /BroadcastChannel\("soundings-project-sync-v2"\)/);
  assert.match(page, /protocol: 2/);
  assert.match(page, /type ProjectSyncMessage/);
  assert.match(page, /type: "project-request"/);
  assert.match(page, /window\.addEventListener\("message", receiveWindowSync\)/);
  assert.match(page, /event\.origin !== window\.location\.origin/);
  assert.match(page, /window\.opener\.postMessage\(\{ type: "project-request"/);
  assert.match(page, /directTarget\.postMessage\(message, window\.location\.origin\)/);
  assert.match(page, /routeVertices: RouteVertex\[\]/);
  assert.match(page, /const nodeMap = useMemo\(\(\) => new Map\(project \? routeNodes\(project\)/);
  assert.match(page, /<tbody>\{project\.waypoints\.map\(\(point\) => \{/);
  assert.match(page, /Route membership/);
  assert.match(page, /routeMembershipsForPoint\(point\.id\)/);
  assert.match(page, /map-placement-capture print-hidden/);
  assert.match(styles, /\.map-placement-capture \{[^}]*z-index:\s*24;[^}]*inset:\s*0;[^}]*cursor:\s*crosshair;/);
  assert.match(page, /type ActivePanel = "projects" \| "survey" \| "settings" \| "export" \| null/);
  assert.match(page, /aria-label="Survey workspace"/);
  assert.match(page, /aria-selected=\{surveyTab === "routes"\}/);
  assert.match(page, /aria-selected=\{surveyTab === "points"\}/);
  assert.match(page, /Share field capture/);
  assert.match(page, /Merge field capture/);
  assert.match(page, /Soundings navigation/);
  assert.match(page, /Map tools/);
  assert.match(page, /title="Export"/);
  assert.match(page, />Layers</);
  assert.match(page, /Route lines/);
  assert.match(page, /CLEAN_CHART_EXPORT_SETTINGS/);
  assert.match(page, /FULL_DETAIL_EXPORT_SETTINGS/);
  assert.match(page, /type ExportSettings,/);
  assert.match(page, /normalizeExportSettings\(stored\.exportSettings\)/);
  assert.match(page, /fullPointNames/);
  assert.match(page, /project\.waypoints\.map\(\(point\)/);
  assert.match(page, /type PrintArea/);
  assert.match(page, /printArea\?: PrintArea/);
  assert.match(page, /normalizePrintArea/);
  assert.match(page, /pointInPrintArea/);
  assert.match(page, /Set print area/);
  assert.match(page, /Clear print area/);
  assert.match(page, /printPointTableChunks\.map/);
  assert.match(page, /printAreaDraw/);
  assert.match(page, /printAreaAdjust/);
  assert.match(page, /Print with selected settings/);
  assert.match(styles, /\.route-network-selection, \.vector-line \{ display: none !important; \}/);
  assert.match(styles, /\.point-dot \{[^}]*width: var\(--print-point-marker-size\) !important;[^}]*height: var\(--print-point-marker-size\) !important;[^}]*border: 0 !important;[^}]*background: #174b5c !important;[^}]*box-shadow: none !important;/);
  assert.match(styles, /\.print-area-overlay/);
  assert.match(styles, /\.map-stage\.has-print-area/);
  assert.match(page, /tool === "select"/);
  assert.match(page, /window\.addEventListener\("pointermove", continuePan\)/);
  assert.match(page, /onPointerDown=\{onStagePointerDown\}/);
  assert.match(page, /onWheel=\{onStageWheel\}/);
  assert.match(page, /className=\{`drawer-shell print-hidden[^`]*`\} onWheel=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(page, /ArrowUp/);
  assert.match(page, /Drag blank map space to pan/);
  assert.doesNotMatch(page, /Tool = .*"pan"/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.match(layout, /Scuba Map Maker \| Warren Labs/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /"react-loading-skeleton"\s*:/);
});

test("keeps the desktop map toolbox readable, movable, and session-only", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type DockDrag = \{ pointerId: number; offsetX: number; offsetY: number \}/);
  assert.match(page, /useState<DockPosition \| null>\(null\)/);
  assert.match(page, /clampDockPosition\(/);
  assert.match(page, /aria-label="Move map tools"/);
  assert.match(page, /aria-describedby="tool-dock-help"/);
  assert.match(page, /event\.button !== 0 \|\| !event\.isPrimary/);
  assert.match(page, /onPointerDown=\{startDockDrag\} onPointerMove=\{moveDock\} onPointerUp=\{finishDockDrag\} onPointerCancel=\{finishDockDrag\}/);
  assert.match(page, /onWheel=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(page, /event\.key === "Home"/);
  assert.match(page, /event\.shiftKey \? 32 : 8/);
  assert.doesNotMatch(page, /localStorage[\s\S]{0,80}tool.dock/i);

  assert.match(styles, /\.tool-dock \{[^}]*width:\s*128px;/);
  assert.match(styles, /\.tool-dock\.positioned \{[^}]*z-index:\s*63;[^}]*top:\s*var\(--tool-dock-top\);[^}]*left:\s*var\(--tool-dock-left\);[^}]*transform:\s*none;/);
  assert.match(styles, /\.tool-dock-handle \{[^}]*touch-action:\s*none;[^}]*cursor:\s*grab;/);
  assert.match(styles, /\.dock-button \{[^}]*grid-template-columns:\s*28px minmax\(0, 1fr\);[^}]*min-width:\s*0;/);
  assert.match(styles, /\.dock-button > span \{[^}]*line-height:\s*1\.2;[^}]*white-space:\s*nowrap;/);
  assert.match(styles, /@media \(max-width: 1199px\)[\s\S]*\.tool-dock-handle \{ display: none; \}/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*\.tool-dock, \.tool-dock\.positioned \{[^}]*width:\s*52px;/);
  assert.match(styles, /@media print[\s\S]*\.tool-dock[^\n]*display: none !important;/);
});

test("keeps PDF print-area controls screen-sized across editor zoom", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const printAreaDisplayStyle = \{[^\n]+\} as CSSProperties;/);
  assert.match(page, /"--print-area-stroke": `\$\{2 \/ zoom\}px`/);
  assert.match(page, /"--print-area-dash": `\$\{8 \/ zoom\}px`/);
  assert.match(page, /"--print-area-label-font": `\$\{10 \/ zoom\}px`/);
  assert.match(page, /"--print-area-handle-size": `\$\{14 \/ zoom\}px`/);
  assert.match(page, /"--print-area-handle-offset": `\$\{-8 \/ zoom\}px`/);
  assert.match(page, /className="print-area-overlay print-hidden" style=\{\{ \.\.\.printAreaDisplayStyle, left: printArea\.x, top: printArea\.y, width: printArea\.width, height: printArea\.height \}\}/);
  assert.match(styles, /\.print-area-overlay \{[^}]*border: 0;[^}]*repeating-linear-gradient\(to right,[^}]*var\(--print-area-stroke, 2px\) no-repeat/);
  assert.match(styles, /\.print-area-overlay \{[^}]*pointer-events: none;/);
  assert.match(styles, /\.print-area-move \{[^}]*top: var\(--print-area-label-top, -2px\);[^}]*font-size: var\(--print-area-label-font, 10px\);[^}]*pointer-events: auto;/);
  assert.match(styles, /\.print-area-handle \{[^}]*width: var\(--print-area-handle-size, 14px\);[^}]*height: var\(--print-area-handle-size, 14px\);[^}]*border: 0;[^}]*radial-gradient\(circle, white 0 68%, var\(--coral\) 72% 100%\);[^}]*pointer-events: auto;/);
  assert.match(styles, /\.print-area-handle\.nw \{[^}]*top: var\(--print-area-handle-offset, -8px\);[^}]*left: var\(--print-area-handle-offset, -8px\);/);
});

test("separates editable route vertices from point-of-interest detail layers", async () => {
  const [page, styles, routeNetwork] = await Promise.all([
    readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/projects/scuba-map-maker/route-network.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type RouteVertex = \{ id: string; x: number; y: number \}/);
  assert.match(page, /type RouteNode = Point \| RouteVertex/);
  assert.match(page, /function routeNodes\(project: Pick<Project, "waypoints" \| "routeVertices">\)/);

  const layerVisibility = page.match(/type LayerVisibility = \{([^}]*)\}/)?.[1] ?? "";
  assert.ok(layerVisibility, "LayerVisibility type should remain declared");
  for (const layer of ["routeLabels", "pointNames", "names", "depths"]) {
    assert.match(layerVisibility, new RegExp(`\\b${layer}: boolean;`));
  }
  assert.doesNotMatch(layerVisibility, /\blabels: boolean;/);

  assert.match(page, /buildRouteNetwork\(routeNodes\(project\), project\.vectors\)/);
  assert.match(page, /className=\{`route-network/);
  assert.match(page, /shapeRendering="geometricPrecision"/);
  assert.match(page, /route-network-path/);
  assert.match(page, /routePathData\(path, nodeMap\)/);
  assert.match(page, /route-network-branch/);
  assert.match(page, /className="route-selection-line"[^>]*x1=\{selectedRouteLine\.start\.x\}[^>]*y1=\{selectedRouteLine\.start\.y\}[^>]*x2=\{selectedRouteLine\.end\.x\}[^>]*y2=\{selectedRouteLine\.end\.y\}/);
  assert.match(page, /line\.start\.x \+ line\.dx \* 0\.65/);
  assert.match(page, /line\.pixels < 32/);
  assert.doesNotMatch(page, /preserveAspectRatio="none"/);
  assert.match(page, /const routeHitHeight = 44 \/ zoom;/);
  assert.match(page, /"--route-hit-offset": `\$\{\-routeHitHeight \/ 2\}px`/);
  assert.match(page, /"--route-width": `\$\{2 \/ zoom\}px`/);
  assert.match(page, /"--print-route-width": `\$\{2 \/ effectivePrintScale\}px`/);
  assert.match(page, /const selectedSegment = selectedVectorId === vector\.id;/);
  const vectorButton = page.match(/<button className=\{`vector-line[\s\S]*?\/>/)?.[0] ?? "";
  assert.ok(vectorButton, "vector hit control should remain rendered");
  assert.doesNotMatch(vectorButton, /<svg|<line|<path/);

  assert.match(routeNetwork, /const edgeKey = \(a: string, b: string\)/);
  assert.match(routeNetwork, /Math\.hypot\(end\.x - start\.x, end\.y - start\.y\) === 0/);
  assert.match(routeNetwork, /incident\.length === 2/);
  assert.match(routeNetwork, /closed \? "cycle" : "fallback"/);

  assert.match(page, /project\.waypoints\.map\(\(point\) =>\s*\{[\s\S]*?return <button\b/);
  assert.match(page, /className=\{`waypoint named-point\$\{point\.symbol \? " has-symbol" : ""\}/);
  assert.match(page, /\{point\.symbol \? <PointSymbolImage className=\{`point-symbol-marker\$\{exportClass\(printSettings\.pointMarkers\)\}`\} symbol=\{point\.symbol\}\/> : <span className=\{`point-dot\$\{exportClass\(printSettings\.pointMarkers\)\}`\}\/>\}/);
  assert.doesNotMatch(page, /junction-point|junction-handle/);
  assert.match(styles, /\.point-dot \{[^}]*border:\s*0;[^}]*box-shadow:\s*inset 0 0 0 var\(--point-dot-border/);
  assert.match(page, /const selectedRouteVertexIds = \[\.\.\.new Set\(selectedRoutePointIds\.filter/);
  assert.match(page, /selectedRouteVertexIds\.map\(\(vertexId\) => \{/);
  assert.doesNotMatch(page, /\{project\.routeVertices\.map\(\(vertex\)/);
  assert.match(page, /route-vertex-handle print-hidden/);
  assert.match(page, /startDrag\(event, "routeVertex", vertex\.id\)/);
  assert.match(styles, /\.route-vertex-handle \{[^}]*width:\s*var\(--route-vertex-hit-size, 44px\);[^}]*cursor:\s*grab;/);
  assert.match(styles, /\.route-vertex-handle\.shared::before/);

  assert.match(page, /Point markers/);
  assert.match(page, /PointSymbolPicker/);
  assert.match(page, /point-symbol-cell/);
  assert.match(page, /normalizePointSymbol\(point\.symbol\)/);
  assert.match(page, /smart-callout-anchor-symbol/);
  assert.match(page, /Point Names \(P1, P2\)/);
  assert.match(page, /Names \(Swim platform\)/);
  assert.match(page, /Depths/);
  assert.doesNotMatch(page, /Only points with a full Name|Named point markers/);

  const waypointClass = page.match(/className=\{`waypoint[\s\S]*?`\}/)?.[0] ?? "";
  assert.ok(waypointClass, "waypoint hit target should remain independently rendered");
  assert.doesNotMatch(waypointClass, /exportSettings\.(?:pointMarkers|pointNames|fullPointNames|depths)/);
  assert.doesNotMatch(waypointClass, /visibleLayers\.(?:pointNames|names|depths)/);
  assert.match(page, /<span\b[^>]*point-dot[^>]*printSettings\.pointMarkers[^>]*>/);
  assert.match(page, /annotationScreenVisible[\s\S]*visibleLayers\.pointNames[\s\S]*visibleLayers\.names[\s\S]*visibleLayers\.depths/);
  assert.match(page, /annotationPrintVisible[\s\S]*printSettings\.pointNames[\s\S]*printSettings\.fullPointNames[\s\S]*printSettings\.depths/);
  assert.match(page, /data-annotation-kind=\{annotationKind\}/);
  assert.match(page, /data-manual-position=\{offset \? "true" : "false"\}/);
  assert.match(page, /point-annotation-chip point-annotation-\$\{annotationKind\}/);
  assert.match(page, /vector-label[^>]*visibleLayers\.routeLabels/);
  assert.match(page, /reference-image[^>]*project\.reference\.visible[^>]*printSettings\.reference/);
  assert.doesNotMatch(page, /project\.reference\.dataUrl && project\.reference\.visible/);
  assert.match(page, /vector-line[^>]*visibleLayers\.routes/);
  assert.doesNotMatch(page, /vector-group[^>]*visibleLayers\.routes/);

  assert.match(styles, /@media screen\s*\{[\s\S]*?\.screen-hidden\s*\{\s*display:\s*none !important;\s*\}/);
  assert.match(styles, /\.route-network-path \{[^}]*stroke-linecap:\s*butt;[^}]*stroke-linejoin:\s*miter;[^}]*stroke-miterlimit:\s*2\.5;/);
  assert.match(styles, /\.route-network-branch \{[^}]*r:\s*var\(--route-branch-radius/);
  assert.match(styles, /\.route-network \{ --route-width: var\(--print-route-width\) !important; --route-branch-radius: var\(--print-route-branch-radius\) !important;[^}]*\}/);
  assert.match(styles, /\.route-network-selection, \.vector-line \{ display: none !important; \}/);
  assert.match(styles, /\.vector-label \{[^}]*color:\s*#174b5c !important;/);
  assert.match(styles, /\.point-leaders \{[^}]*z-index:\s*7;[^}]*pointer-events:\s*none;/);
  assert.match(styles, /\.vector-label \{[^}]*z-index:\s*8;/);
  assert.match(styles, /\.point-leader \{[^}]*stroke-width:\s*var\(--point-leader-width[^}]*stroke-linecap:\s*round;/);
  assert.match(styles, /\.point-annotation-manual \{[^}]*min-width:\s*var\(--annotation-manual-hit[^}]*transform:\s*translate\(-50%, -50%\);/);
  assert.match(styles, /\.point-leaders \{ --point-leader-width: var\(--print-point-leader-width\) !important; \}/);
  assert.match(styles, /@media print[\s\S]*\.route-draft-layer,[^}]*\.route-vertex-handle[^}]*\{ display: none !important; \}/);
  assert.match(styles, /\.map-stage, \.map-stage\.has-print-area, \.map-stage\.smart-callout-mode \{[^}]*width:\s*980px !important;[^}]*height:\s*640px !important;[^}]*overflow:\s*hidden !important;/);
});

test("ships v2 named route drawing across editor, map, backup, and PDF surfaces", async () => {
  const [page, styles, routeModel] = await Promise.all([
    readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/projects/scuba-map-maker/route-model.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /routes\?: SavedRoute\[\]/);
  assert.match(page, /project\.routes = normalizeRoutes\(routeNodes\(project\), project\.vectors, planarized\.routes/);
  assert.match(page, /version: 2/);
  assert.match(page, /type StoredProject = [^\n]*version: 1 \| 2/);
  assert.match(page, /indexedDB\.open\(DB_NAME, 1\)/);
  assert.match(page, /function RouteNameEditor/);
  assert.match(page, /onBlur=\{commit\}/);
  assert.match(page, /Reverse route/);
  assert.match(page, /<dt>Start<\/dt>/);
  assert.match(page, /<dt>End<\/dt>/);
  assert.match(page, /route-step-list/);
  assert.match(page, /DockButton icon="route" label="Draw Route"/);
  assert.match(page, /className=\{`dock-button\$\{active \? " active" : ""\}`\} aria-label=\{label\}/);
  assert.match(page, /const beginRouteDrawing/);
  assert.doesNotMatch(blockAt(page, "const beginRouteDrawing").text, /waypoints|setTool\("origin"\)|required origin/i);
  assert.match(page, /Draw a route: click each vertex, then Finish\. Every crossing becomes a junction\./);
  assert.match(page, /const routeDraftPath = routeDraft && routeDraft\.points\.length > 1/);
  assert.match(page, /const routeDraftPreviewPath = routeDraft\?\.points\.length && routeDraftPointer/);
  assert.match(page, /route-draft-path/);
  assert.match(page, /route-draft-preview/);
  assert.match(page, /const undoRouteDraftPoint/);
  assert.match(page, /draft\.points\.slice\(0, -1\)/);
  assert.match(page, /const finishRouteDrawing/);
  assert.match(page, /current\.routeVertices\.push\(vertex\)/);
  assert.match(page, /current\.vectors\.push\(\.\.\.newVectors\)/);
  assert.match(page, /const cancelRouteDrawing/);
  assert.match(page, /Route draft canceled\. No map geometry changed\./);
  assert.match(page, /onClick=\{undoRouteDraftPoint\}>Undo/);
  assert.match(page, /onClick=\{finishRouteDrawing\}>Finish/);
  assert.match(page, /onClick=\{cancelRouteDrawing\}>Cancel/);
  assert.match(page, /This point is part of route geometry\. Choose whether the connected route should remain intact\./);
  assert.match(page, /onClick=\{\(\) => removePointPreservingRoutes\(pendingDeletePoint\.id\)\}/);
  assert.match(page, /Remove POI, keep routes/);
  assert.match(page, /onClick=\{\(\) => removePointAndRouteLegs\(pendingDeletePoint\.id\)\}/);
  assert.match(page, /Delete attached route legs/);
  assert.match(page, /current\.routeVertices\.push\(\{ id: removed\.id, x: removed\.x, y: removed\.y \}\)/);
  assert.match(page, /Insert vertex/);
  assert.match(page, /Delete leg/);
  assert.match(page, /Delete whole route/);
  assert.match(page, /route-selection-path/);
  assert.match(page, /const nodes = routeNodes\(project\);/);
  assert.match(page, /routeLabelAnchor\(route, nodes, project\.vectors\)/);
  assert.match(page, /routeLabelAnchor\(route, nodes, project\.vectors, printArea\)/);
  assert.match(page, /nodeLabel\(nodeMap\.get\(endpoints\.startId\)\)/);
  assert.match(page, /nodeLabel\(start, `Vertex \$\{index \+ 1\}`\)/);
  assert.match(page, /effectiveExportSettings\(exportSettings\)/);
  assert.match(page, /normalizeExportSettings\(stored\.exportSettings\)/);
  assert.match(page, /\["routeLabels", "Route bearings & distances"\], \["routeNameLabels", "Named route labels"\]/);
  assert.match(page, /"--route-name-angle": `\$\{anchor\.angleRadians\}rad`/);
  assert.match(page, /style=\{routeNameLabelStyle\(screen\)\}/);
  assert.match(page, /style=\{routeNameLabelStyle\(clampPrintLabelAnchor\(print\)\)\}/);
  assert.match(page, /route-name-label route-name-label-print screen-hidden/);
  assert.match(page, /vector-label[^>]*exportClass\(printSettings\.routeLabels\)/);
  assert.match(page, /route-name-label route-name-label-print screen-hidden\$\{exportClass\(printSettings\.routeNameLabels\)\}/);
  assert.doesNotMatch(page, /route-name-label route-name-label-print screen-hidden\$\{exportClass\(printSettings\.routeLabels\)\}/);
  assert.match(page, /aria-label=\{`Route \$\{route\.name\}`\}/);
  assert.match(page, /const routeHitHeight = 44 \/ zoom/);
  assert.match(page, /BroadcastChannel\("soundings-project-sync-v2"\)/);
  assert.match(page, /window\.requestAnimationFrame\(fitMapToStage\)/);
  assert.match(page, /window\.addEventListener\("resize", refit\)/);
  assert.match(page, /window\.visualViewport\?\.addEventListener\("resize", refit\)/);
  assert.match(page, /const changeMapZoom = useCallback[\s\S]*?autoFitRef\.current = false;/);
  assert.match(page, /aria-label="Recenter map" onClick=\{fitEntireMapToStage\}/);

  assert.match(routeModel, /type RouteStep = \{ vectorId: string; reversed: boolean \}/);
  assert.match(routeModel, /type SavedRoute = \{ id: string; name: string; steps: RouteStep\[\] \}/);
  assert.match(routeModel, /export function migrateLegacyRoutes/);
  assert.match(routeModel, /export function normalizeRoutes/);
  assert.match(routeModel, /export function splitRoute/);
  assert.match(routeModel, /export function routeLabelAnchor/);
  assert.match(routeModel, /angleRadians: uprightLineAngle/);

  assert.match(styles, /\.route-name-label \{[^}]*transform: translate\(-50%, 18%\) rotate\(var\(--route-name-angle, 0rad\)\);/);
  assert.match(styles, /\.route-name-label > span \{[^}]*-webkit-line-clamp: 2;/);
  assert.match(styles, /\.route-selection-path \{[^}]*var\(--route-selected-path-width/);
  assert.match(styles, /\.survey-drawer \{/);
  assert.match(styles, /\.survey-route-list/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*\.route-vertex-handle, \.route-topology-actions \{ display: none !important; \}/);
  assert.match(styles, /\.route-draw-controls \{[^}]*z-index:\s*45;[^}]*right:\s*300px;[^}]*bottom:\s*74px;/);
  assert.match(styles, /@media \(max-width: 1199px\)[\s\S]*?\.zoom-controls \{ bottom:\s*84px; \}/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.route-draw-controls \{[^}]*bottom:\s*76px;/);
  assert.match(styles, /@media print[\s\S]*\.route-name-label > span \{[^}]*background: rgba\(255,255,255,\.97\) !important;/);
  assert.match(styles, /@media print[\s\S]*\.route-name-label \{[^}]*transform: translate\(-50%, 24%\) rotate\(var\(--route-name-angle, 0rad\)\) !important;/);
});

test("keeps route vectors clear of visible point symbols on screen and in PDF", async () => {
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
  assert.match(symbolCutouts, /exportClass\(printSettings\.pointMarkers && pointInPrintArea\(point, printArea\)\)/);
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
  assert.match(page, /import \{[^}]*DEFAULT_POINT_SYMBOL_SCALE[^}]*MAX_POINT_SYMBOL_SCALE[^}]*MIN_POINT_SYMBOL_SCALE[^}]*normalizePointSymbolScale[^}]*\} from "\.\/point-symbols";/);
  assert.match(page, /project\.pointSymbolScale = normalizePointSymbolScale\(project\.pointSymbolScale\);/);
  assert.match(page, /Map symbols/);
  assert.match(page, /aria-label="Map icon size" type="range" min=\{MIN_POINT_SYMBOL_SCALE\} max=\{MAX_POINT_SYMBOL_SCALE\} step="0\.1"/);
  assert.match(page, /"--route-symbol-cutout-radius": `\$\{30 \* pointSymbolScale \/ zoom\}px`/);
  assert.match(page, /"--print-route-symbol-cutout-radius": `\$\{20 \* pointSymbolScale \/ effectivePrintScale\}px`/);
  assert.match(page, /"--point-symbol-size": `\$\{38 \* pointSymbolScale \/ zoom\}px`/);
  assert.match(page, /"--print-point-symbol-size": `\$\{24 \* pointSymbolScale \/ effectivePrintScale\}px`/);
  assert.match(page, /width=\{smartCalloutSymbolSize\.width\} height=\{smartCalloutSymbolSize\.height\}/);
  assert.match(styles, /\.route-symbol-mask \{ mask-type: luminance; \}/);
  assert.match(styles, /\.route-symbol-cutout \{ r: var\(--route-symbol-cutout-radius, 30px\); \}/);
  assert.match(styles, /@media print[\s\S]*\.route-network \{[^}]*--route-symbol-cutout-radius: var\(--print-route-symbol-cutout-radius\) !important;/);

  const vectorButton = page.match(/<button className=\{`vector-line[\s\S]*?\/>/)?.[0] ?? "";
  assert.ok(vectorButton, "the full route hit control should remain rendered outside the mask");
  assert.match(vectorButton, /left: line\.start\.x, top: line\.start\.y, width: line\.pixels/);
  assert.doesNotMatch(vectorButton, /route-symbol-clearance-mask|route-symbol-cutout/);
});

test("supports independently movable point annotations with compatible persistence and print leaders", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /labelOffsets\?: PointLabelOffsets/);
  assert.match(page, /normalizeLabelOffsets\(point\.labelOffsets\)/);
  assert.match(page, /kind: "waypoint" \| "routeVertex" \| "annotation" \| "coast" \| "pan" \| "reference" \| "printAreaDraw" \| "printAreaAdjust"/);
  assert.match(page, /kind: "waypoint" \| "routeVertex" \| "coast"/);
  assert.match(page, /activeDrag\.kind === "routeVertex"/);
  assert.match(page, /kind === "waypoint" \|\| kind === "routeVertex"/);
  assert.match(page, /const startAnnotationDrag/);
  assert.match(page, /annotationOffsetFromElement\(event\.currentTarget, point\)/);
  assert.match(page, /movedPixels < 3/);
  assert.match(page, /assignAnnotationOffset\(item, activeDrag\.annotationKind!, nextOffset\)/);
  assert.match(page, /if \(kind === "annotation" && !changed\) return;/);
  assert.match(page, /normalizePointAnnotationOffsets\(point: Point\)/);
  assert.match(page, /clip displaced annotations naturally/);
  assert.match(page, /update\(previous, false\)/);
  assert.match(page, /update\(next, false\)/);
  assert.match(page, /if \(\(raw\.version !== 1 && raw\.version !== 2\) \|\| !Array\.isArray\(raw\.waypoints\)\)/);
  assert.match(page, /ArrowUp: \{ x: 0, y: -1 \}/);
  assert.match(page, /event\.shiftKey \? 10 : 1/);
  assert.match(page, /resetAnnotationOffsets/);
  assert.match(page, /Reset all/);
  assert.match(page, /Reset \$\{POINT_ANNOTATION_LABELS\[annotationKind\]\} position for \$\{selected\.label\}/);
  assert.match(page, /const screenDistance = Math\.hypot\(offset\.dx, offset\.dy\) \* zoom/);
  assert.match(page, /screenDistance >= 8/);
  assert.match(page, /screenDistance >= 6/);
  assert.match(page, /const printEnd = annotationPosition\(point, offset\)/);
  assert.match(page, /x2=\{printEnd\.x\}[\s\S]*?y2=\{printEnd\.y\}/);
  assert.match(page, /point-leader-screen print-hidden/);
  assert.match(page, /point-leader-print screen-hidden/);
  assert.match(page, /annotationPrintVisible\(point, annotationKind\)/);
  assert.match(page, /"--print-point-leader-width": `\$\{1\.15 \/ effectivePrintScale\}px`/);
  assert.match(styles, /\.point-annotation-auto \{[^}]*transform:\s*translate\(var\(--annotation-stack-x/);
  assert.match(styles, /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*\.point-annotation-auto \{[^}]*min-height:\s*var\(--annotation-touch-hit/);
  assert.match(page, /const PRINT_PRIMARY_TEXT_SIZE = 12;/);
  assert.match(page, /const PRINT_SECONDARY_TEXT_SIZE = 11;/);
  assert.match(page, /"--print-primary-text-size": `\$\{PRINT_PRIMARY_TEXT_SIZE \/ effectivePrintScale\}px`/);
  assert.match(page, /"--print-secondary-text-size": `\$\{PRINT_SECONDARY_TEXT_SIZE \/ effectivePrintScale\}px`/);
  assert.match(page, /"--print-map-label-padding-x": `\$\{4 \/ effectivePrintScale\}px`/);
  assert.match(page, /"--print-annotation-stack-x": `\$\{7 \/ effectivePrintScale\}px`/);
  assert.match(page, /"--print-point-marker-size": `\$\{5 \/ effectivePrintScale\}px`/);
  assert.match(page, /const printAnnotationBlockHeight =/);
  assert.match(page, /const printAutomaticBaseY = point\.y > printSource\.y \+ printSource\.height/);
  assert.match(page, /"--annotation-print-y": `\$\{\(printAutomaticBaseY \+ printAutomaticHeights\.slice/);
  assert.match(page, /"--annotation-print-left": `\$\{printPosition\.x\}px`/);
  assert.match(page, /"--annotation-print-top": `\$\{printPosition\.y\}px`/);
  assert.match(styles, /\.water-label \{[^}]*font-size: var\(--print-secondary-text-size\) !important;/);
  assert.match(styles, /\.vector-label, \.point-annotation-pointName, \.point-annotation-depth \{ font-size: var\(--print-secondary-text-size\) !important; \}/);
  assert.doesNotMatch(page, /contours|Depth contours|estimated depth contours/i);
  assert.doesNotMatch(styles, /\.contours|\.contour-glyph|--print-contour/i);
  assert.match(styles, /\.route-name-label, \.feature-name-label-print, \.point-annotation-name \{ font-size: var\(--print-primary-text-size\) !important; \}/);
  assert.match(styles, /\.vector-label \{[^}]*padding:\s*var\(--print-map-label-padding-y\) var\(--print-map-label-padding-x\)/);
  assert.match(styles, /\.point-annotation-auto \{ transform: translate\(var\(--print-annotation-stack-x\), var\(--annotation-print-y\)\) !important; \}/);
  assert.match(styles, /\.point-annotation-manual \{ left: var\(--annotation-print-left\) !important; top: var\(--annotation-print-top\) !important; \}/);
  assert.match(styles, /\.point-annotation-chip \{[^}]*background:\s*rgba\(200,239,238,\.72\)/);
  assert.match(styles, /\.vector-label \{[^}]*text-shadow:\s*none;/);
  assert.match(styles, /\.point-annotation-chip \{[^}]*box-shadow:\s*none;[^}]*text-shadow:\s*none;/);
  assert.match(styles, /\.point-annotation-manual \.point-annotation-chip \{[^}]*box-shadow:\s*none;/);
  assert.match(styles, /\.point-annotation:hover \.point-annotation-chip, \.point-annotation:focus-visible \.point-annotation-chip \{[^}]*outline-color:\s*var\(--coral\);[^}]*box-shadow:\s*none;/);
  assert.match(styles, /@media print[\s\S]*\.point-annotation-chip \{[^}]*outline:\s*var\(--print-map-label-border\) solid[^}]*box-shadow:\s*none !important;[^}]*text-shadow:\s*none !important;/);
});

test("exports descriptive names through deterministic smart callout rails", async () => {
  const [page, styles, calloutEngine] = await Promise.all([
    readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/projects/scuba-map-maker/print-callouts.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type NamePlacement,/);
  assert.match(page, /normalizeExportSettings\(project\.exportSettings\)/);
  assert.match(page, /exportSettings\.namePlacement === "asPositioned" \? "asPositioned" : "smartCallouts"/);
  assert.match(page, /layoutPrintCallouts/);
  assert.match(page, /rightRailCandidate\.layout\.mode === "right"/);
  assert.match(page, /createSmartCalloutCandidate\(dualRailViewport\)/);
  assert.match(page, /`\$\{point\.label\} · \$\{point\.name!\.trim\(\)\}`/);
  assert.match(page, /smartCalloutPointIds\.has\(point\.id\)/);
  assert.match(page, /annotationKind === "pointName" \|\| annotationKind === "name"/);
  assert.match(page, /data-smart-callout-leader=\{callout\.id\}/);
  assert.match(page, /data-smart-callout=\{callout\.id\}/);
  assert.match(page, />Smart callouts</);
  assert.match(page, />As positioned</);
  assert.match(page, /type="radio" name="pdf-name-placement" value="smartCallouts"/);
  assert.match(page, /disabled=\{smartCalloutOverflowIds\.length > 0 \|\| isPreparingPrint\}/);
  assert.match(page, /Reduce the print area or hide Names before exporting/);

  assert.match(calloutEngine, /mode: "none" \| "right" \| "both"/);
  assert.match(calloutEngine, /overflowIds: string\[\]/);
  assert.match(calloutEngine, /if \(!rightOverflowIds\.length && pack\(rightEntries/);
  assert.match(calloutEngine, /const balanced = rebalance/);

  assert.match(styles, /\.print-map-viewport \{ display: contents; \}/);
  assert.match(styles, /\.map-stage, \.map-stage\.has-print-area, \.map-stage\.smart-callout-mode \{[^}]*overflow: hidden !important;[^}]*contain: strict;[^}]*isolation: isolate;[^}]*clip-path: inset\(0\);/);
  assert.match(styles, /\.print-map-viewport, \.map-stage\.smart-callout-mode \.print-map-viewport \{[^}]*overflow: hidden;[^}]*contain: strict;[^}]*isolation: isolate;[^}]*clip-path: inset\(0\);/);
  assert.match(styles, /\.smart-callout-leaders polyline \{[^}]*stroke-width: 1\.15px;[^}]*stroke-linecap: round;/);
  assert.match(styles, /\.smart-callout-label \{[^}]*font-size: 12px;[^}]*box-shadow: none;[^}]*text-shadow: none;/);
  assert.match(styles, /\.map-stage\.smart-callout-overflow \.smart-callout-overflow-print/);
});

test("keeps every Soundings route surface and v2 control inside the Warren scope", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  const mainClasses = [...page.matchAll(/<main className="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(mainClasses.length, 3, "expected loading, point-table, and editor roots");
  assert.ok(mainClasses.every((className) => className.split(/\s+/).includes("soundings-app")));

  const scope = blockAt(styles, "@scope (.soundings-app)");
  const outsideScope = `${styles.slice(0, scope.start)}\n${styles.slice(scope.end)}`;
  assert.match(outsideScope, /@page \{ size: Letter landscape; margin: 9mm; \}/);
  assert.doesNotMatch(outsideScope, /\.(?:route-draft-layer|route-draw-controls|route-vertex-handle)\b/);
  assert.doesNotMatch(scope.text, /(?:^|\n)\s*(?:html|body)(?:\s|,|\{)/);
  assert.match(scope.text, /:scope\.app-shell/);
  assert.match(scope.text, /:scope\.point-table-window/);
  assert.match(scope.text, /:scope\.loading/);
  assert.match(scope.text, /\.map-stage\.route-draw-active/);
  assert.match(scope.text, /\.map-placement-capture/);
  assert.match(scope.text, /\.route-draft-layer/);
  assert.match(scope.text, /\.route-vertex-handle/);
  assert.match(scope.text, /\.route-editor-actions, \.route-topology-actions/);
  assert.match(scope.text, /\.route-draw-controls/);
  assert.match(scope.text, /@media print[\s\S]*\.route-draft-layer,[^}]*\.route-vertex-handle[^}]*\{ display: none !important; \}/);
  assert.match(scope.text, /\.layers-panel\.collapsed \.layers-heading > span \{ gap: 0; font-size: 0; \}/);
});

test("derives sharp route chains, cycles, branches, and deduplicated visual edges", () => {
  const points = [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 40, y: 0 },
    { id: "C", x: 60, y: 30 },
    { id: "D", x: 40, y: -30 },
  ];
  const vector = (id, fromId, toId) => ({ id, fromId, toId });

  const chain = buildRouteNetwork(points, [vector("ab", "A", "B"), vector("bc", "B", "C")]);
  assert.deepEqual(chain.paths, [{ key: "open:A\0B", pointIds: ["A", "B", "C"], closed: false }]);
  assert.deepEqual(chain.branchPointIds, []);

  const branch = buildRouteNetwork(points, [vector("ba", "B", "A"), vector("bc", "B", "C"), vector("bd", "B", "D")]);
  assert.deepEqual(branch.branchPointIds, ["B"]);
  assert.equal(branch.paths.length, 3);
  assert.ok(branch.paths.every((path) => path.pointIds.length === 2 && path.pointIds.includes("B")));

  const cycle = buildRouteNetwork(points, [vector("ab", "A", "B"), vector("bc", "B", "C"), vector("ca", "C", "A")]);
  assert.equal(cycle.paths.length, 1);
  assert.equal(cycle.paths[0].closed, true);
  assert.deepEqual(new Set(cycle.paths[0].pointIds), new Set(["A", "B", "C"]));

  const deduplicated = buildRouteNetwork(points, [
    vector("ab", "A", "B"),
    vector("ba", "B", "A"),
    vector("ab-copy", "A", "B"),
    vector("zero", "C", "C"),
    vector("missing", "A", "missing"),
  ]);
  assert.equal(deduplicated.paths.length, 1);
  assert.deepEqual(deduplicated.paths[0].pointIds, ["A", "B"]);
  assert.deepEqual(deduplicated.branchPointIds, []);
});
