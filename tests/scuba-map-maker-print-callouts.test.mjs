import assert from "node:assert/strict";
import test from "node:test";

import { layoutPrintCallouts } from "../app/projects/scuba-map-maker/print-callouts.ts";
import { PRINT_CALLOUT_RAIL_WIDTH, PRINT_CHART_FRAME, createPrintProjection, printViewportFor } from "../app/projects/scuba-map-maker/print-layout.ts";

test("fits the deterministic dense fixture in three-line dual rails without truncation", () => {
  const source = { x: 100, y: 150, width: 1000, height: 500 };
  const viewport = printViewportFor("dualRail");
  const projection = createPrintProjection(source, viewport);
  const names = [
    "Rock stair shore entry", "Training platform descent line", "Primary navigation safety buoy",
    "Training car compass grid", "Fishing boat wreck engine bay", "Limestone swim-through entrance",
    "Training pipe guideline anchor", "Work barge stern loose metal", "Upright sailboat on sand flat",
    "Pirate ship accessible upper deck", "Treasure chest turnaround marker", "Statue beside western rock ledge",
    "Dense hydrilla boundary marker", "Submerged tree snag hazard", "Emergency pickup platform",
    "Toilet navigation landmark", "Aircraft fuselage detached wing", "Deep yacht wreck advanced divers",
    "Return-line junction shore exit",
  ];
  const result = layoutPrintCallouts({
    frame: PRINT_CHART_FRAME,
    mapViewport: viewport,
    railWidth: PRINT_CALLOUT_RAIL_WIDTH,
    points: names.map((name, index) => ({
      id: `point-${String(index + 1).padStart(2, "0")}`,
      text: `P${index} · ${name}`,
      x: projection.originX + ((140 + index * 47) % 900) * projection.scale,
      y: projection.originY + (40 + (index % 10) * 42) * projection.scale,
    })),
    metrics: { railGap: 12, fontSize: 12, characterWidth: 7.3, lineHeight: 14, paddingX: 5, paddingY: 4 },
  });
  assert.deepEqual(result.overflowIds, []);
  assert.equal(result.callouts.length, names.length);
  assert.ok(result.callouts.every((callout) => callout.lines.length >= 1 && callout.lines.length <= 3));
  for (const side of ["left", "right"]) {
    const entries = result.callouts.filter((callout) => callout.side === side).sort((a, b) => a.box.y - b.box.y);
    for (let index = 1; index < entries.length; index += 1) {
      assert.ok(entries[index].box.y >= entries[index - 1].box.y + entries[index - 1].box.height + 4 - 1e-9);
    }
  }
});
