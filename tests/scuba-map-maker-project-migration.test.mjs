import assert from "node:assert/strict";
import test from "node:test";
import { migrateLegacyWaypoints } from "../app/projects/scuba-map-maker/project-migration.ts";

const point = (id, label, metadata = {}) => ({ id, label, x: id.length * 10, y: id.length * 20, ...metadata });
const vector = (id, fromId, toId) => ({ id, fromId, toId, bearing: 0, distance: 10, unit: "ft" });

test("treats A0 as an ordinary custom label during legacy POI migration", () => {
  const waypoints = [point("legacy-a0", "A0"), point("isolated", "P1"), point("start", "P2"), point("A0", "P3"), point("end", "P4")];
  const vectors = [vector("one", "start", "A0"), vector("two", "A0", "end")];

  const migrated = migrateLegacyWaypoints(waypoints, vectors);

  assert.deepEqual(migrated.waypoints.map(({ id }) => id), ["legacy-a0", "isolated", "start", "end"]);
  assert.deepEqual(migrated.routeVertices, [{ id: "A0", x: 20, y: 40 }]);
  assert.deepEqual(migrated.convertedPointIds, ["A0"]);
});

test("keeps every custom label and every meaningful POI metadata class", () => {
  const waypoints = [
    point("custom", "Dock"),
    point("named", "P1", { name: "Anchor cove" }),
    point("symbol", "P2", { symbol: "buoy" }),
    point("zero-depth", "P3", { depth: 0 }),
    point("draft", "P4", { fieldDraft: { capturedAt: "2026-08-24T12:00:00.000Z" } }),
    point("offsets", "P5", { labelOffsets: {} }),
    point("plain", "p6", { name: "", symbol: "", depth: Number.NaN, fieldDraft: {} }),
    point("terminal-right", "P8"),
  ];
  const vectors = waypoints.slice(0, -1).map((item, index) => vector(`edge-${index}`, item.id, waypoints[index + 1].id));

  const migrated = migrateLegacyWaypoints(waypoints, vectors);

  assert.deepEqual(migrated.waypoints.map(({ id }) => id), ["custom", "named", "symbol", "zero-depth", "draft", "offsets", "terminal-right"]);
  assert.deepEqual(migrated.routeVertices, [{ id: "plain", x: 50, y: 100 }]);
});

test("migrates a realistic v1 route while preserving every POI and route metadata input", () => {
  const legacyProject = {
    version: 1,
    id: "project-beaver-lake",
    title: "Beaver Lake survey",
    waypoints: [
      { id: "wp-origin", label: "A0", name: "Survey origin", x: 80, y: 400 },
      { id: "wp-bend", label: "P1", name: "", x: 180, y: 350 },
      { id: "wp-custom", label: "Dock", name: "", x: 280, y: 320 },
      { id: "wp-named", label: "P3", name: "Anchor cove", x: 390, y: 300 },
      { id: "wp-symbol", label: "P4", name: "", symbol: "buoy", x: 510, y: 310 },
      { id: "wp-depth", label: "P5", name: "", depth: 41.5, x: 630, y: 345 },
      {
        id: "wp-draft",
        label: "P6",
        name: "",
        x: 750,
        y: 390,
        fieldDraft: { bearing: 107, distance: 126, unit: "ft", note: "Rock shelf", capturedAt: "2026-08-24T15:30:00.000Z" },
      },
      {
        id: "wp-positioned",
        label: "P7",
        name: "",
        x: 870,
        y: 430,
        labelOffsets: { pointName: { dx: 18, dy: -24 }, depth: { dx: -15, dy: 21 } },
      },
      { id: "wp-terminal", label: "P8", name: "", x: 990, y: 455 },
      { id: "wp-isolated", label: "P9", name: "", x: 1080, y: 120 },
    ],
    vectors: [
      { id: "segment-01", fromId: "wp-origin", toId: "wp-bend", bearing: 63.43, distance: 55.9, unit: "ft" },
      { id: "segment-02", fromId: "wp-bend", toId: "wp-custom", bearing: 73.3, distance: 52.2, unit: "ft" },
      { id: "segment-03", fromId: "wp-custom", toId: "wp-named", bearing: 79.7, distance: 56.8, unit: "ft" },
      { id: "segment-04", fromId: "wp-named", toId: "wp-symbol", bearing: 94.76, distance: 60.2, unit: "ft" },
      { id: "segment-05", fromId: "wp-symbol", toId: "wp-depth", bearing: 106.26, distance: 62.5, unit: "ft" },
      { id: "segment-06", fromId: "wp-depth", toId: "wp-draft", bearing: 110.56, distance: 64.1, unit: "ft" },
      { id: "segment-07", fromId: "wp-draft", toId: "wp-positioned", bearing: 108.43, distance: 63.2, unit: "ft" },
      { id: "segment-08", fromId: "wp-positioned", toId: "wp-terminal", bearing: 101.77, distance: 61.3, unit: "ft" },
    ],
    routes: [{
      id: "route-main-channel",
      name: "Main channel",
      steps: [
        { vectorId: "segment-01", reversed: false },
        { vectorId: "segment-02", reversed: false },
        { vectorId: "segment-03", reversed: false },
        { vectorId: "segment-04", reversed: false },
        { vectorId: "segment-05", reversed: false },
        { vectorId: "segment-06", reversed: false },
        { vectorId: "segment-07", reversed: false },
        { vectorId: "segment-08", reversed: false },
      ],
    }],
    calibration: { vectorId: "segment-04", distance: 60.2, unit: "ft", metersPerPixel: 0.1524 },
  };
  const before = structuredClone(legacyProject);

  const classified = migrateLegacyWaypoints(legacyProject.waypoints, legacyProject.vectors);
  const migratedProject = { ...legacyProject, version: 2, ...classified };
  const expectedPoiIds = ["wp-origin", "wp-custom", "wp-named", "wp-symbol", "wp-depth", "wp-draft", "wp-positioned", "wp-terminal", "wp-isolated"];

  assert.deepEqual(classified.convertedPointIds, ["wp-bend"]);
  assert.deepEqual(classified.routeVertices, [{ id: "wp-bend", x: 180, y: 350 }]);
  assert.deepEqual(classified.waypoints.map(({ id }) => id), expectedPoiIds);
  assert.deepEqual(classified.waypoints, before.waypoints.filter(({ id }) => expectedPoiIds.includes(id)));
  assert.deepEqual(migratedProject.vectors, before.vectors);
  assert.deepEqual(migratedProject.routes, before.routes);
  assert.deepEqual(migratedProject.calibration, before.calibration);
  assert.deepEqual(legacyProject, before);
});

test("converts multiple plain generated junctions while retaining every terminal", () => {
  const waypoints = [
    { id: "west", label: "P1", x: 0, y: 100 },
    { id: "junction-one", label: "P2", x: 100, y: 100 },
    { id: "north", label: "P3", x: 100, y: 0 },
    { id: "junction-two", label: "P4", x: 200, y: 100 },
    { id: "east", label: "P5", x: 300, y: 100 },
    { id: "south", label: "P6", x: 200, y: 200 },
  ];
  const vectors = [
    vector("west-leg", "west", "junction-one"),
    vector("north-leg", "junction-one", "north"),
    vector("trunk", "junction-one", "junction-two"),
    vector("east-leg", "junction-two", "east"),
    vector("south-leg", "junction-two", "south"),
  ];

  const migrated = migrateLegacyWaypoints(waypoints, vectors);

  assert.deepEqual(migrated.convertedPointIds, ["junction-one", "junction-two"]);
  assert.deepEqual(migrated.routeVertices, [
    { id: "junction-one", x: 100, y: 100 },
    { id: "junction-two", x: 200, y: 100 },
  ]);
  assert.deepEqual(migrated.waypoints.map(({ id }) => id), ["west", "north", "east", "south"]);
});

test("converts a metadata-empty generated branch node once using physical degree", () => {
  const waypoints = [point("west", "P1"), point("junction", "P2"), point("east", "P3"), point("south", "P4")];
  const vectors = [
    vector("westward", "junction", "west"),
    vector("eastward", "junction", "east"),
    vector("southward", "junction", "south"),
    vector("eastward-copy", "junction", "east"),
    vector("eastward-reverse", "east", "junction"),
  ];

  const migrated = migrateLegacyWaypoints(waypoints, vectors);

  assert.deepEqual(migrated.convertedPointIds, ["junction"]);
  assert.deepEqual(migrated.waypoints.map(({ id }) => id), ["west", "east", "south"]);
});

test("converts every metadata-empty generated node in an all-degree-two cycle", () => {
  const waypoints = [point("a", "P1"), point("b", "P2"), point("c", "P3")];
  const vectors = [vector("ab", "a", "b"), vector("bc", "b", "c"), vector("ca", "c", "a")];

  const migrated = migrateLegacyWaypoints(waypoints, vectors);

  assert.deepEqual(migrated.waypoints, []);
  assert.deepEqual(migrated.convertedPointIds, ["a", "b", "c"]);
  assert.deepEqual(migrated.routeVertices, [
    { id: "a", x: 10, y: 20 },
    { id: "b", x: 10, y: 20 },
    { id: "c", x: 10, y: 20 },
  ]);
});

test("ignores dangling endpoints, self loops, and malformed vectors when determining degree", () => {
  const waypoints = [point("terminal", "P1"), point("connected", "P2")];
  const vectors = [
    vector("valid", "terminal", "connected"),
    vector("dangling-from", "missing", "terminal"),
    vector("dangling-to", "terminal", "missing"),
    vector("self", "terminal", "terminal"),
    { id: "malformed", fromId: null, toId: "terminal" },
  ];

  const migrated = migrateLegacyWaypoints(waypoints, vectors);

  assert.deepEqual(migrated.waypoints.map(({ id }) => id), ["terminal", "connected"]);
  assert.deepEqual(migrated.routeVertices, []);
  assert.deepEqual(migrated.convertedPointIds, []);
});

test("does not mutate waypoint or vector inputs and returns independent retained point objects", () => {
  const waypoints = [
    point("kept", "Named bend", { name: "POI", labelOffsets: { name: { x: 1, y: 2 } } }),
    point("converted", "P2"),
    point("left", "P3"),
    point("right", "P4"),
  ];
  const vectors = [vector("left", "left", "converted"), vector("right", "converted", "right")];
  const beforeWaypoints = structuredClone(waypoints);
  const beforeVectors = structuredClone(vectors);

  const migrated = migrateLegacyWaypoints(waypoints, vectors);

  assert.deepEqual(waypoints, beforeWaypoints);
  assert.deepEqual(vectors, beforeVectors);
  assert.notStrictEqual(migrated.waypoints, waypoints);
  assert.notStrictEqual(migrated.waypoints[0], waypoints[0]);
  assert.deepEqual(migrated.convertedPointIds, ["converted"]);
});
