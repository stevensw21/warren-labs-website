import assert from "node:assert/strict";
import test from "node:test";

import {
  createFieldCapturePackage,
  mergeFieldCapturePoints,
  parseFieldCapturePackage,
  previewFieldCaptureMerge,
} from "../app/projects/scuba-map-maker/field-capture.ts";

test("creates and parses a versioned field capture package", () => {
  const packageValue = createFieldCapturePackage({
    id: "project-1",
    title: "Beaver Lake",
    waypoints: [{ id: "p1", label: "P1", name: "Anchor", x: 12, y: 18, fieldDraft: { bearing: 142, distance: 30, unit: "ft", capturedAt: "2026-08-05T12:00:00.000Z" } }],
  });
  const parsed = parseFieldCapturePackage(JSON.parse(JSON.stringify(packageValue)));
  assert.equal(parsed.type, "soundings-field-capture");
  assert.equal(parsed.points[0].fieldDraft?.bearing, 142);
});

test("keeps v2 route vertices out of the v1 POI-only field capture format", () => {
  const packageValue = createFieldCapturePackage({
    version: 2,
    id: "project-v2",
    title: "Beaver Lake",
    waypoints: [{ id: "poi-1", label: "P1", name: "Swim platform", x: 12, y: 18, depth: 24 }],
    routeVertices: [{ id: "vertex-1", x: 30, y: 42 }],
    vectors: [{ id: "segment-1", fromId: "poi-1", toId: "vertex-1" }],
    routes: [{ id: "route-1", name: "Wall", steps: [{ vectorId: "segment-1", reversed: false }] }],
  });

  assert.equal(packageValue.version, 1);
  assert.deepEqual(packageValue.points.map(({ id }) => id), ["poi-1"]);
  assert.equal("routeVertices" in packageValue, false);
  assert.equal("vectors" in packageValue, false);
  assert.equal("routes" in packageValue, false);

  const parsed = parseFieldCapturePackage(JSON.parse(JSON.stringify(packageValue)));
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.points.map(({ id }) => id), ["poi-1"]);
  assert.equal("routeVertices" in parsed, false);
});

test("rejects malformed field capture packages", () => {
  assert.throws(() => parseFieldCapturePackage({ type: "soundings-field-capture", version: 2, points: [] }));
  assert.throws(() => parseFieldCapturePackage({ type: "soundings-field-capture", version: 1, sourceProjectId: "p", sourceProjectTitle: "P", points: [{ id: "bad" }] }));
});

test("previews additions and conflicts before a non-topological merge", () => {
  const existing = [{ id: "a", label: "A0", x: 0, y: 0, name: "Desktop" }];
  const incoming = [{ id: "a", label: "A0", x: 2, y: 3, name: "Field" }, { id: "b", label: "P1", x: 10, y: 12 }];
  const preview = previewFieldCaptureMerge(existing, incoming);
  assert.deepEqual(preview.additions.map((point) => point.id), ["b"]);
  assert.deepEqual(preview.conflicts.map((point) => point.id), ["a"]);
  assert.equal(mergeFieldCapturePoints(existing, incoming, new Set())[0].name, "Desktop");
  const merged = mergeFieldCapturePoints(existing, incoming, new Set(["a"]));
  assert.equal(merged[0].name, "Field");
  assert.equal(merged[1].id, "b");
});
