export const POINT_SYMBOLS = [
  { id: "shipwreck", label: "Shipwreck" },
  { id: "statue", label: "Statue" },
  { id: "swim-platform", label: "Swim platform" },
  { id: "cave", label: "Cave" },
  { id: "airplane", label: "Airplane" },
  { id: "buoy", label: "Buoy" },
  { id: "treasure-chest", label: "Treasure chest" },
  { id: "pipe", label: "Pipe" },
  { id: "vegetation", label: "Vegetation" },
  { id: "sailboat", label: "Sailboat" },
  { id: "toilet", label: "Toilet" },
  { id: "car", label: "Car" },
  { id: "tree", label: "Tree" },
  { id: "work-boat", label: "Work boat" },
  { id: "pirate-ship", label: "Pirate ship" },
  { id: "yacht", label: "Yacht" },
] as const;

export type PointSymbolId = (typeof POINT_SYMBOLS)[number]["id"];
export type PointSymbolDefinition = (typeof POINT_SYMBOLS)[number] & { asset: string };

const POINT_SYMBOL_IDS = new Set<string>(POINT_SYMBOLS.map((symbol) => symbol.id));

export function normalizePointSymbol(value: unknown): PointSymbolId | undefined {
  return typeof value === "string" && POINT_SYMBOL_IDS.has(value) ? value as PointSymbolId : undefined;
}

export function pointSymbolDefinition(id: PointSymbolId): PointSymbolDefinition {
  const symbol = POINT_SYMBOLS.find((candidate) => candidate.id === id)!;
  return { ...symbol, asset: `/point-symbols/${symbol.id}.png` };
}
