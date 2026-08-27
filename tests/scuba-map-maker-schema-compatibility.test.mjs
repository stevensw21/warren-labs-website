import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createFieldCapturePackage } from "../app/projects/scuba-map-maker/field-capture.ts";

const pageUrl = new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url);

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

test("keeps project documents on v2 without upgrading the IndexedDB store", async () => {
  const page = await readFile(pageUrl, "utf8");
  const projectType = blockAt(page, "type Project =");
  const storedProjectType = blockAt(page, "type StoredProject =");

  assert.match(page, /type Project = \{\s*version: 2;/);
  assert.match(projectType, /geographicFeatures: GeographicFeature\[\]/);
  assert.match(projectType, /floatingTexts: FloatingText\[\]/);
  assert.match(storedProjectType, /Omit<Project, [^>]*"geographicFeatures"[^>]*>/);
  assert.match(storedProjectType, /version: 1 \| 2/);
  assert.match(storedProjectType, /routeVertices\?: RouteVertex\[\]/);
  assert.match(storedProjectType, /geographicFeatures\?: (?:unknown|GeographicFeature\[\])/);
  assert.match(storedProjectType, /floatingTexts\?: unknown/);
  assert.match(page, /version: 2, id: id\(\)/);
  assert.match(page, /routeVertices: \[\]/);
  assert.match(page, /geographicFeatures: \[\]/);
  assert.match(page, /floatingTexts: \[\]/);
  assert.match(page, /indexedDB\.open\(DB_NAME, 1\)/);
  assert.doesNotMatch(page, /indexedDB\.open\(DB_NAME, 2\)/);
  assert.match(page, /request\.result\.createObjectStore\(STORE_NAME, \{ keyPath: "id" \}\)/);
});

test("accepts v1 and v2 backups, normalizes them to v2, and exports the v2 project", async () => {
  const page = await readFile(pageUrl, "utf8");
  const normalizeProject = blockAt(page, "function normalizeProject");

  assert.match(page, /if \(\(raw\.version !== 1 && raw\.version !== 2\) \|\| !Array\.isArray\(raw\.waypoints\)\) throw new Error\("Unsupported backup"\)/);
  assert.match(page, /const imported = normalizeProject\(raw\)/);
  assert.match(page, /const storedWaypoints = Array\.isArray\(stored\.waypoints\) \? stored\.waypoints : \[\]/);
  assert.match(page, /const storedVectors = Array\.isArray\(stored\.vectors\) \? stored\.vectors : \[\]/);
  assert.match(page, /const fallback = emptyProject\(/);
  assert.match(page, /stored\.version === 1\s*\? migrateLegacyWaypoints\(storedWaypoints, storedVectors\)/);
  assert.match(page, /version: 2,\s*waypoints: legacyMigration\.waypoints,\s*routeVertices: legacyMigration\.routeVertices/s);
  assert.match(page, /project\.date = typeof project\.date === "string" && project\.date \? project\.date : fallback\.date/);
  assert.match(page, /project\.coastline = Array\.isArray\(project\.coastline\) \? project\.coastline : \[\]/);
  assert.match(normalizeProject, /normalizeGeographicFeatures\(/);
  assert.match(normalizeProject, /(?:stored|project)\.geographicFeatures/);
  assert.match(normalizeProject, /normalizeFloatingTexts\(stored\.floatingTexts, project\.canvasSize, id, project\.geographicFeatures\.map/);
  assert.match(page, /new Blob\(\[JSON\.stringify\(project, null, 2\)\], \{ type: "application\/json" \}\)/);
  assert.match(page, /Project v\$\{raw\.version\} backup imported and normalized to v2\./);
});

test("isolates v2 project synchronization from v1 tabs and messages", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /type: "project-update"; protocol: 2;/);
  assert.match(page, /type: "project-request"; protocol: 2;/);
  assert.match(page, /message\.protocol !== 2 \|\| message\.type !== "project-update"/);
  assert.match(page, /event\.data\.protocol !== 2/);
  assert.match(page, /new BroadcastChannel\("soundings-project-sync-v2"\)/);
  assert.match(page, /type: "project-update", protocol: 2/);
  assert.match(page, /type: "project-request", protocol: 2/);
  assert.doesNotMatch(page, /new BroadcastChannel\("soundings-project-sync"\)/);
});

test("keeps the v1 field capture handoff geographic-feature-free", () => {
  const packageValue = createFieldCapturePackage({
    version: 2,
    id: "project-with-features",
    title: "Beaver Lake",
    waypoints: [{ id: "poi-1", label: "P1", x: 12, y: 18 }],
    geographicFeatures: [{
      id: "feature-1",
      name: "Rock ledge",
      mode: "polyline",
      points: [{ id: "feature-point-1", x: 0, y: 0 }, { id: "feature-point-2", x: 20, y: 10 }],
      closed: false,
      style: { color: "#174b5c", width: 2, dash: "solid" },
    }],
    floatingTexts: [{ id: "text-1", text: "Swim platform", x: 40, y: 50, size: 24, rotation: 15 }],
  });

  assert.equal(packageValue.version, 1);
  assert.deepEqual(packageValue.points.map(({ id }) => id), ["poi-1"]);
  assert.equal("geographicFeatures" in packageValue, false);
  assert.equal("floatingTexts" in packageValue, false);
});
