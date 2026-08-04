import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url);
const routeModelUrl = new URL("../app/projects/scuba-map-maker/route-model.ts", import.meta.url);
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
    if (depth === 0) return { start: markerIndex, end: index + 1, text: source.slice(markerIndex, index + 1) };
  }
  assert.fail(`Unclosed block after ${marker}`);
}

test("keeps version-one Scuba projects compatible while persisting ordered routes", async () => {
  const [page, routeModel] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(routeModelUrl, "utf8"),
  ]);

  assert.match(page, /type Project = \{[\s\S]*routes\?: SavedRoute\[\]/);
  assert.match(page, /version: 1/);
  assert.match(page, /indexedDB\.open\(DB_NAME, 1\)/);
  assert.match(page, /project\.routes = normalizeRoutes\(project\.waypoints, project\.vectors, project\.routes/);
  assert.match(page, /type ExportSettings = \{[^}]*routeLabels: boolean; routeNameLabels: boolean;/);
  assert.match(page, /DEFAULT_EXPORT_SETTINGS: ExportSettings = \{[^}]*routeLabels: true, routeNameLabels: true,/);
  assert.match(page, /const routeNameLabels = savedExportSettings\.routeNameLabels \?\? savedExportSettings\.routeLabels \?\? DEFAULT_EXPORT_SETTINGS\.routeNameLabels;/);
  assert.match(page, /project\.exportSettings = \{ \.\.\.DEFAULT_EXPORT_SETTINGS, \.\.\.savedExportSettings, routeNameLabels, namePlacement \};/);
  assert.match(page, /current\.routes \?\?= \[\]/);
  assert.match(page, /BroadcastChannel\("soundings-project-sync"\)/);
  assert.match(page, /JSON\.stringify\(project, null, 2\)/);

  assert.match(routeModel, /export type RouteStep = \{ vectorId: string; reversed: boolean \}/);
  assert.match(routeModel, /export type SavedRoute = \{ id: string; name: string; steps: RouteStep\[\] \}/);
  for (const helper of ["migrateLegacyRoutes", "normalizeRoutes", "splitRoute", "reverseRoute", "appendVectorToRoute", "joinRoutes", "routeLabelAnchor"]) {
    assert.match(routeModel, new RegExp(`export (?:function|const) ${helper}\\b`));
  }
});

test("ships route naming and ordered editing in the drawer and Points surfaces", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /function RouteNameEditor/);
  assert.match(page, /const next = draft\.trim\(\)/);
  assert.match(page, /onBlur=\{commit\}/);
  assert.match(page, /event\.key === "Escape"[\s\S]*setDraft\(route\.name\)/);
  assert.match(page, /`Unnamed route \$\{Math\.max\(1,/);
  assert.match(page, /route\.name\.trim\(\) \|\| routeFallbackName\(route\)/);
  assert.match(page, /Ordered start/);
  assert.match(page, /Ordered end/);
  assert.match(page, /aria-label=\{`Ordered steps for \$\{routeDisplayName\(selectedRoute\)\}`\}/);
  assert.match(page, /className="secondary-button full-width route-reverse"[\s\S]*?Reverse route<\/button>/);
  assert.match(page, /<section className="route-table-editor" aria-label="Route editor">\{routeEditor\(false\)\}<\/section>/);
  assert.match(page, /<div className="drawer-section first"><h3>Ordered route<\/h3>\{routeEditor\(true\)\}<\/div>/);
  assert.match(page, /route-table-link/);
  assert.match(page, /Step \{stepIndex \+ 1\} of \{route\.steps\.length\}/);
  assert.match(page, /Start new route/);
  assert.match(page, /Continue \{routeDisplayName\(route\)\}/);
  assert.match(page, /New route name \(optional\)/);
});

test("keeps route continuation ordered and confirms closures and endpoint joins", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /endpoints\.endId === pointId/);
  assert.match(page, /reverseRoute\(current\.routes!\[index\]\)/);
  assert.match(page, /former start is now the active endpoint/);
  assert.match(page, /Close \$\{routeDisplayName\(sourceRoute\)\} back to its start\?/);
  assert.match(page, /sourcePointIds\.includes\(targetId\)/);
  assert.match(page, /Returning to an interior point is a branch, not a continuation/);
  assert.match(page, /Join \$\{routeDisplayName\(sourceRoute\)\} and \$\{routeDisplayName\(targetRoute\)\}\?/);
  assert.match(page, /Choose Cancel to keep them separate/);
  assert.match(page, /window\.prompt\("Name the joined route", firstName\)/);
  assert.match(page, /joinRoutes\(sourceRoute, targetRoute, \[\.\.\.project\.vectors, vector\], \{ connectingVector: vector, name: finalName \}\)/);
  assert.match(page, /Any broken route was split into continuous named fragments/);
});

test("selects complete routes, preserves segment calibration, and anchors screen and PDF names", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /const route = routeForVector\(routes, vector\.id\)/);
  assert.match(page, /setSelectedRouteId\(route\?\.id \?\? null\)/);
  assert.match(page, /clicked segment remains the calibration reference/);
  assert.match(page, /const selectedRoutePath = selectedRoute && selectedRoutePointIds\.length >= 2/);
  assert.match(page, /<path className="route-selection-path" d=\{selectedRoutePath\}\/>/);
  assert.match(page, /<line className="route-selection-line"/);
  assert.match(page, /const routeHitHeight = 44 \/ zoom/);

  assert.match(page, /routeLabelAnchor\(route, project\.waypoints, project\.vectors\)/);
  assert.match(page, /routeLabelAnchor\(route, project\.waypoints, project\.vectors, printArea\)/);
  assert.match(page, /route-name-label print-hidden/);
  assert.match(page, /route-name-label route-name-label-print screen-hidden/);
  assert.match(page, /\["routeLabels", "Route bearings & distances"\], \["routeNameLabels", "Named route labels"\]/);
  assert.match(page, /vector-label[^>]*exportClass\(exportSettings\.routeLabels\)/);
  assert.match(page, /route-name-label route-name-label-print screen-hidden\$\{exportClass\(exportSettings\.routeNameLabels\)\}/);
  assert.doesNotMatch(page, /route-name-label route-name-label-print screen-hidden\$\{exportClass\(exportSettings\.routeLabels\)\}/);
  assert.match(page, /aria-label=\{`Route \$\{route\.name\}`\}/);
  assert.match(page, /Reference segment/);
  assert.match(page, /This segment currently measures/);
});

test("keeps all route styling scoped to the Scuba root with mobile and print behavior", async () => {
  const [page, styles] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  const mainClasses = [...page.matchAll(/<main className="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(mainClasses.length >= 2, "expected app and point-table roots");
  assert.ok(mainClasses.every((className) => className.split(/\s+/).includes("soundings-app")), "every Scuba rendering root must own the soundings-app scope");

  const scope = blockAt(styles, "@scope (.soundings-app)");
  const outsideScope = `${styles.slice(0, scope.start)}\n${styles.slice(scope.end)}`;
  assert.doesNotMatch(outsideScope, /\.(?:route-name-label|route-selection-path|route-editor|route-step-list|route-table-editor)\b/);
  assert.match(scope.text, /:scope\.app-shell/);
  assert.doesNotMatch(scope.text, /(?:^|\n)\s*(?:html|body)(?:\s|,|\{)/);

  assert.match(scope.text, /\.vector-line \{[^}]*height: var\(--route-hit-height/);
  assert.match(scope.text, /\.route-name-label > span \{[^}]*-webkit-line-clamp: 2;/);
  assert.match(scope.text, /\.route-selection-path \{[^}]*var\(--route-selected-path-width/);
  assert.match(scope.text, /\.route-table-editor \.route-editor/);
  assert.match(scope.text, /@media \(max-width: 767px\)[\s\S]*\.route-table-editor \.route-editor \{ grid-template-columns: 1fr; \}/);
  assert.match(scope.text, /@media \(max-width: 767px\)[\s\S]*\.route-step-list small \{ grid-column: 2; \}/);
  assert.match(scope.text, /@media print[\s\S]*\.route-name-label \{[^}]*var\(--print-route-name-width\)/);
  assert.match(scope.text, /@media print[\s\S]*\.route-name-label > span \{[^}]*background: rgba\(253,252,247,\.96\) !important;/);
});
