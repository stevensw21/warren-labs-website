import { DEFAULT_CANVAS_SIZE, normalizeCanvasSize, type CanvasSize } from "./canvas-size.ts";

export type FloatingText = {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
};

export const DEFAULT_FLOATING_TEXT_SIZE = 24;
export const MIN_FLOATING_TEXT_SIZE = 10;
export const MAX_FLOATING_TEXT_SIZE = 96;
export const MAX_FLOATING_TEXT_LENGTH = 500;

type UnknownRecord = Record<string, unknown>;

let fallbackId = 0;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultCreateId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackId += 1;
  return `floating-text-${Date.now()}-${fallbackId}`;
}

function stringId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function uniqueId(value: unknown, used: Set<string>, createId: () => string): string {
  const preferred = stringId(value);
  if (preferred && !used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const generated = stringId(createId());
    if (generated && !used.has(generated)) {
      used.add(generated);
      return generated;
    }
  }

  let suffix = used.size + 1;
  let generated = `floating-text-${suffix}`;
  while (used.has(generated)) {
    suffix += 1;
    generated = `floating-text-${suffix}`;
  }
  used.add(generated);
  return generated;
}

function clampCoordinate(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
}

export function normalizeFloatingTextContent(value: unknown): string {
  if (typeof value !== "string") return "Text";
  const normalized = value.replace(/\r\n?/g, "\n").slice(0, MAX_FLOATING_TEXT_LENGTH).trim();
  return normalized || "Text";
}

export function normalizeFloatingTextSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_FLOATING_TEXT_SIZE;
  return Math.min(MAX_FLOATING_TEXT_SIZE, Math.max(MIN_FLOATING_TEXT_SIZE, Math.round(value)));
}

export function normalizeFloatingTextRotation(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  const rounded = Math.round(wrapped * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Normalizes optional v2 text data without requiring a project/store migration. */
export function normalizeFloatingTexts(
  raw: unknown,
  bounds: CanvasSize = DEFAULT_CANVAS_SIZE,
  createId: () => string = defaultCreateId,
  reservedIds: Iterable<string> = [],
): FloatingText[] {
  if (!Array.isArray(raw)) return [];
  const canvasSize = normalizeCanvasSize(bounds);
  const usedIds = new Set(reservedIds);

  return raw.flatMap((item) => {
    if (!isRecord(item) || !Number.isFinite(item.x) || !Number.isFinite(item.y)) return [];
    return [{
      id: uniqueId(item.id, usedIds, createId),
      text: normalizeFloatingTextContent(item.text),
      x: clampCoordinate(item.x as number, canvasSize.width),
      y: clampCoordinate(item.y as number, canvasSize.height),
      size: normalizeFloatingTextSize(item.size),
      rotation: normalizeFloatingTextRotation(item.rotation),
    }];
  });
}

export function floatingTextEqual(left: FloatingText | undefined, right: FloatingText | undefined): boolean {
  if (!left || !right) return left === right;
  return left.id === right.id
    && left.text === right.text
    && left.x === right.x
    && left.y === right.y
    && left.size === right.size
    && left.rotation === right.rotation;
}

export function translateFloatingText(
  item: FloatingText,
  dx: number,
  dy: number,
  bounds: CanvasSize = DEFAULT_CANVAS_SIZE,
): FloatingText {
  const canvasSize = normalizeCanvasSize(bounds);
  return {
    ...item,
    x: clampCoordinate(item.x + dx, canvasSize.width),
    y: clampCoordinate(item.y + dy, canvasSize.height),
  };
}
