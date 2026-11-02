/**
 * One filter definition, two evaluators: a JS predicate (analytics, tables, search)
 * and an equivalent MapLibre expression (map rendering) — so map and panels always agree.
 */
import { CONTEXT_KINDS } from './classify';
import type { Filters, GeoLayer } from './types';

export const filtersActive = (f: Filters) => f.categories.length + f.conditions.length + f.risks.length + f.maint.length > 0 || !!f.kmRange || !!f.district;

const areaExempt = (l: GeoLayer) => l.kind === 'boundary' || l.kind === 'landuse' || l.kind === 'water' || l.kind === 'flood';

export function featurePasses(p: Record<string, any>, layer: GeoLayer, f: Filters): boolean {
  const ctx = CONTEXT_KINDS.includes(layer.kind);
  if (!ctx) {
    if (f.categories.length && !f.categories.includes(p.__cat)) return false;
    if (f.conditions.length && !f.conditions.includes(p.__cond)) return false;
    if (f.risks.length && !f.risks.includes(p.__risk)) return false;
    if (f.maint.length && !f.maint.includes(p.__maint)) return false;
  }
  if (!areaExempt(layer)) {
    if (f.kmRange && typeof p.__km === 'number' && (p.__km < f.kmRange[0] || p.__km > f.kmRange[1])) return false;
    if (f.district && p.__district !== undefined && p.__district !== f.district) return false;
  }
  return true;
}

export function mapFilterExpression(layer: GeoLayer, f: Filters): any[] | null {
  const parts: any[] = [];
  const ctx = CONTEXT_KINDS.includes(layer.kind);
  const inList = (prop: string, vals: string[]) => ['in', ['get', prop], ['literal', vals]];
  if (!ctx) {
    if (f.categories.length) parts.push(inList('__cat', f.categories));
    if (f.conditions.length) parts.push(inList('__cond', f.conditions));
    if (f.risks.length) parts.push(inList('__risk', f.risks));
    if (f.maint.length) parts.push(inList('__maint', f.maint));
  }
  if (!areaExempt(layer)) {
    if (f.kmRange) parts.push(['any', ['!', ['has', '__km']], ['all', ['>=', ['get', '__km'], f.kmRange[0]], ['<=', ['get', '__km'], f.kmRange[1]]]]);
    if (f.district) parts.push(['any', ['!', ['has', '__district']], ['==', ['get', '__district'], f.district]]);
  }
  return parts.length ? ['all', ...parts] : null;
}

/** All features of visible layers that pass the filters. */
export function filteredFeatures(layers: GeoLayer[], f: Filters, opts: { visibleOnly?: boolean } = {}) {
  const out: { layer: GeoLayer; props: Record<string, any>; feature: any }[] = [];
  for (const l of layers) {
    if (opts.visibleOnly && !l.visible) continue;
    for (const feat of l.data.features) if (featurePasses(feat.properties!, l, f)) out.push({ layer: l, props: feat.properties!, feature: feat });
  }
  return out;
}
