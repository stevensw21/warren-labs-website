import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url);

test("keeps project documents on v2 without upgrading the IndexedDB store", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /type Project = \{\s*version: 2;/);
  assert.match(page, /type StoredProject = Omit<Project, "version" \| "routeVertices"> & \{ version: 1 \| 2; routeVertices\?: RouteVertex\[\] \};/);
  assert.match(page, /version: 2, id: id\(\)/);
  assert.match(page, /routeVertices: \[\]/);
  assert.match(page, /indexedDB\.open\(DB_NAME, 1\)/);
  assert.doesNotMatch(page, /indexedDB\.open\(DB_NAME, 2\)/);
  assert.match(page, /request\.result\.createObjectStore\(STORE_NAME, \{ keyPath: "id" \}\)/);
});

test("accepts v1 and v2 backups, normalizes them to v2, and exports the v2 project", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /if \(\(raw\.version !== 1 && raw\.version !== 2\) \|\| !Array\.isArray\(raw\.waypoints\)\) throw new Error\("Unsupported backup"\)/);
  assert.match(page, /const imported = normalizeProject\(raw\)/);
  assert.match(page, /const storedWaypoints = Array\.isArray\(stored\.waypoints\) \? stored\.waypoints : \[\]/);
  assert.match(page, /const storedVectors = Array\.isArray\(stored\.vectors\) \? stored\.vectors : \[\]/);
  assert.match(page, /const fallback = emptyProject\(/);
  assert.match(page, /stored\.version === 1\s*\? migrateLegacyWaypoints\(storedWaypoints, storedVectors\)/);
  assert.match(page, /version: 2,\s*waypoints: legacyMigration\.waypoints,\s*routeVertices: legacyMigration\.routeVertices/s);
  assert.match(page, /project\.date = typeof project\.date === "string" && project\.date \? project\.date : fallback\.date/);
  assert.match(page, /project\.coastline = Array\.isArray\(project\.coastline\) \? project\.coastline : \[\]/);
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
