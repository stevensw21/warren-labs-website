import { POINT_SYMBOLS, pointSymbolDefinition, type PointSymbolDefinition, type PointSymbolId } from "./point-symbols.ts";

export type NamePlacement = "smartCallouts" | "asPositioned";
export type ExportSettings = {
  reference: boolean;
  shoreline: boolean;
  geographicFeatures: boolean;
  geographicFeatureLabels: boolean;
  routes: boolean;
  routeLabels: boolean;
  routeNameLabels: boolean;
  pointMarkers: boolean;
  namedPointMarkersOnly: boolean;
  pointNames: boolean;
  fullPointNames: boolean;
  depths: boolean;
  mapFurniture: boolean;
  pointTable: boolean;
  namePlacement?: NamePlacement;
};

export type ExportToggleKey = Exclude<keyof ExportSettings, "namePlacement">;

export const FULL_DETAIL_EXPORT_SETTINGS: Readonly<ExportSettings> = Object.freeze({
  reference: true,
  shoreline: true,
  geographicFeatures: true,
  geographicFeatureLabels: true,
  routes: true,
  routeLabels: true,
  routeNameLabels: true,
  pointMarkers: true,
  namedPointMarkersOnly: false,
  pointNames: true,
  fullPointNames: true,
  depths: true,
  mapFurniture: true,
  pointTable: true,
  namePlacement: "smartCallouts",
});

export const CLEAN_CHART_EXPORT_SETTINGS: Readonly<ExportSettings> = Object.freeze({
  ...FULL_DETAIL_EXPORT_SETTINGS,
  reference: false,
  routeLabels: false,
});

type LegacyExportSettings = Partial<ExportSettings> & { contours?: unknown };

export function normalizeExportSettings(saved?: LegacyExportSettings): ExportSettings {
  const source = { ...(saved ?? {}) };
  delete source.contours;
  const namePlacement: NamePlacement = source.namePlacement === "asPositioned" ? "asPositioned" : "smartCallouts";
  const routeNameLabels = source.routeNameLabels ?? source.routeLabels ?? FULL_DETAIL_EXPORT_SETTINGS.routeNameLabels;
  return { ...FULL_DETAIL_EXPORT_SETTINGS, ...source, routeNameLabels, namePlacement };
}

export function effectiveExportSettings(settings: ExportSettings): ExportSettings {
  return {
    ...settings,
    routeLabels: settings.routes && settings.routeLabels,
    routeNameLabels: settings.routes && settings.routeNameLabels,
    geographicFeatureLabels: settings.geographicFeatures && settings.geographicFeatureLabels,
  };
}

export type RouteLegRow = {
  routeId: string;
  routeName: string;
  leg: number;
  vectorId: string;
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  bearing: number;
  distance: number;
  unit: string;
};

type RouteLike = { id: string; name: string; steps: readonly { vectorId: string; reversed: boolean }[] };
type VectorLike = { id: string; fromId: string; toId: string; bearing: number; distance: number; unit: string };

export function buildRouteLegRows(
  routes: readonly RouteLike[],
  vectors: readonly VectorLike[],
  nodeLabels: ReadonlyMap<string, string>,
): RouteLegRow[] {
  const vectorsById = new Map(vectors.map((vector) => [vector.id, vector]));
  return routes.flatMap((route, routeIndex) => route.steps.flatMap((step, stepIndex) => {
    const vector = vectorsById.get(step.vectorId);
    if (!vector) return [];
    const fromId = step.reversed ? vector.toId : vector.fromId;
    const toId = step.reversed ? vector.fromId : vector.toId;
    return [{
      routeId: route.id,
      routeName: route.name.trim() || `Route ${routeIndex + 1}`,
      leg: stepIndex + 1,
      vectorId: vector.id,
      fromId,
      toId,
      fromLabel: nodeLabels.get(fromId) ?? `Vertex ${stepIndex + 1}`,
      toLabel: nodeLabels.get(toId) ?? `Vertex ${stepIndex + 2}`,
      bearing: vector.bearing,
      distance: vector.distance,
      unit: vector.unit,
    }];
  }));
}

export function buildUsedSymbolLegend(points: readonly { symbol?: PointSymbolId }[]): PointSymbolDefinition[] {
  const used = new Set(points.flatMap((point) => point.symbol ? [point.symbol] : []));
  return POINT_SYMBOLS.filter((symbol) => used.has(symbol.id)).map((symbol) => pointSymbolDefinition(symbol.id));
}
