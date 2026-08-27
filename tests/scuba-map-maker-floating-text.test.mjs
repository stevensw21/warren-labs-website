import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_FLOATING_TEXT_SIZE,
  MAX_FLOATING_TEXT_LENGTH,
  MAX_FLOATING_TEXT_SIZE,
  MIN_FLOATING_TEXT_SIZE,
  floatingTextEqual,
  normalizeFloatingTextContent,
  normalizeFloatingTextRotation,
  normalizeFloatingTexts,
  normalizeFloatingTextSize,
  translateFloatingText,
} from "../app/projects/scuba-map-maker/floating-text.ts";

test("normalizes floating text into safe, unique, canvas-bounded map items", () => {
  let generated = 0;
  const raw = [
    { id: "label", text: "  Dive\r\nEntry  ", x: -12, y: 1_400, size: 4, rotation: 450 },
    { id: "label", text: "   ", x: 820, y: 610, size: 200, rotation: -540 },
    { id: "broken", text: "Ignored", x: Number.NaN, y: 40, size: 20, rotation: 0 },
  ];
  const snapshot = structuredClone(raw);
  const items = normalizeFloatingTexts(raw, { width: 1_600, height: 1_100 }, () => `generated-${++generated}`);

  assert.deepEqual(raw, snapshot, "normalization must not mutate imported backups");
  assert.deepEqual(items, [
    { id: "label", text: "Dive\nEntry", x: 0, y: 1_100, size: MIN_FLOATING_TEXT_SIZE, rotation: 90 },
    { id: "generated-1", text: "Text", x: 820, y: 610, size: MAX_FLOATING_TEXT_SIZE, rotation: -180 },
  ]);
});

test("uses stable defaults and clamps standalone size and rotation values", () => {
  assert.equal(normalizeFloatingTextSize(undefined), DEFAULT_FLOATING_TEXT_SIZE);
  assert.equal(normalizeFloatingTextSize(Number.POSITIVE_INFINITY), DEFAULT_FLOATING_TEXT_SIZE);
  assert.equal(normalizeFloatingTextSize(20.6), 21);
  assert.equal(normalizeFloatingTextRotation(undefined), 0);
  assert.equal(normalizeFloatingTextRotation(720), 0);
  assert.equal(normalizeFloatingTextRotation(-270), 90);
  assert.deepEqual(normalizeFloatingTexts(undefined), []);
});

test("regenerates IDs reserved by geographic features and compares persisted text exactly", () => {
  const [item] = normalizeFloatingTexts(
    [{ id: "shared-id", text: "Platform", x: 20, y: 30, size: 24, rotation: 0 }],
    { width: 1_200, height: 800 },
    () => "text-id",
    ["shared-id"],
  );

  assert.equal(item.id, "text-id");
  assert.equal(floatingTextEqual(item, { ...item }), true);
  assert.equal(floatingTextEqual(item, { ...item, rotation: 1 }), false);
  assert.equal(floatingTextEqual(undefined, undefined), true);
});

test("preserves multiline text while capping persisted content length", () => {
  assert.equal(normalizeFloatingTextContent("  North\rSouth\r\nShelf  "), "North\nSouth\nShelf");
  assert.equal(normalizeFloatingTextContent(""), "Text");
  assert.equal(normalizeFloatingTextContent("x".repeat(MAX_FLOATING_TEXT_LENGTH + 50)).length, MAX_FLOATING_TEXT_LENGTH);
});

test("moves anchors without mutating style and clamps to dynamic canvas bounds", () => {
  const original = { id: "text-1", text: "Swim platform", x: 1_550, y: 1_050, size: 32, rotation: 37 };
  const moved = translateFloatingText(original, 100, -1_400, { width: 1_600, height: 1_100 });

  assert.deepEqual(original, { id: "text-1", text: "Swim platform", x: 1_550, y: 1_050, size: 32, rotation: 37 });
  assert.deepEqual(moved, { ...original, x: 1_600, y: 0 });
});
