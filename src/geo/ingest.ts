/**
 * Turns GeoJSON text into a GeoLayer: parse → validate → infer kind/style → normalise → flatten for rendering.
 * Pure (no React / MapLibre) so it can move to a Web Worker or a server-side importer unchanged.
 */
import type { Feature, Geometry, Position } from 'geojson';
import { categoryFor, inferKind, KIND_COLORS, nextGenericColor, normCondition, normHeights, normKm, normLabel, normMaint, normRisk, normTraffic } from './classify';
import type { GeoLayer, LayerKind, LayerStats, NKFeature } from './types';
import { parseJsonText, validateGeoJSON } from './validate';

export interface IngestOptions {
  source: 'demo' | 'upload' | 'api';
  id?: string;
  name?: string;
  color?: string;
  kind?: LayerKind;
  visible?: boolean;
  opacity?: number;
  order?: number;
  clusterThreshold?: number;
}

export type IngestResult = { ok: true; layer: GeoLayer } | { ok: false; error: string };

let layerSeq = 1;
export const newLayerId = () => `L${Date.now().toString(36)}${(layerSeq++).toString(36)}`;

export function ingestGeoJSONText(text: string, fileName: string, opts: IngestOptions): IngestResult {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return { ok: false, error: parsed.error! };
  const v = validateGeoJSON(parsed.value);
  if (!v.ok) return { ok: false, error: v.fatal ?? 'Invalid GeoJSON.' };

  const id = opts.id ?? newLayerId();
  const kind = opts.kind ?? inferKind(fileName, v.name, v.features);
  const name = opts.name ?? v.name ?? prettifyFileName(fileName);
  const synthetic = !!(v.metadata && (v.metadata.synthetic === true || /synthetic/i.test(String(v.metadata.disclaimer ?? ''))));

  const features: NKFeature[] = v.features.map((f, i) => {
    const p = f.properties || {};
    const { h, b } = normHeights(p, kind);
    const tr = normTraffic(p);
    const derived = {
      __fid: `${id}:${i}`, __lid: id, __cat: categoryFor(kind, p, name), __cond: normCondition(p), __risk: normRisk(p), __maint: normMaint(p),
      __km: normKm(p), __label: normLabel(p, `${name} #${i + 1}`), __h: h, __b: b, __traffic: tr.level, __vol: tr.vol, __speed: tr.speed,
    };
    return { type: 'Feature', id: f.id, geometry: f.geometry, properties: { ...p, ...derived } };
  });

  const renderFeatures: Feature<Geometry, Record<string, any>>[] = [];
  const byGeometry: Record<string, number> = {};
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (pos: Position) => { if (pos[0] < minX) minX = pos[0]; if (pos[0] > maxX) maxX = pos[0]; if (pos[1] < minY) minY = pos[1]; if (pos[1] > maxY) maxY = pos[1]; };
  let pointOnly = true;
  for (const f of features) {
    if (!f.geometry) continue;
    byGeometry[f.geometry.type] = (byGeometry[f.geometry.type] || 0) + 1;
    for (const g of flattenGeometry(f.geometry)) {
      if (g.type !== 'Point' && g.type !== 'MultiPoint') pointOnly = false;
      eachPosition(g, visit);
      renderFeatures.push({ type: 'Feature', geometry: g, properties: f.properties as Record<string, any> });
    }
  }
  const keys = new Set<string>();
  for (const f of features.slice(0, 500)) for (const k of Object.keys(f.properties || {})) if (!k.startsWith('__')) keys.add(k);

  const stats: LayerStats = {
    total: v.features.length + v.rejected.length, accepted: features.length, rendered: features.filter((f) => f.geometry).length,
    nonSpatial: features.filter((f) => !f.geometry).length, rejected: v.rejected.length, byGeometry,
    bbox: Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null, propertyKeys: [...keys], pointOnly: pointOnly && renderFeatures.length > 0,
  };

  const layer: GeoLayer = {
    id, name, fileName, kind, description: typeof v.metadata?.description === 'string' ? v.metadata.description : undefined,
    color: opts.color ?? (kind === 'generic' ? nextGenericColor() : KIND_COLORS[kind]), opacity: opts.opacity ?? 1, visible: opts.visible ?? true,
    synthetic, source: opts.source, importedAt: new Date().toISOString(),
    data: { type: 'FeatureCollection', features: features as any }, renderData: { type: 'FeatureCollection', features: renderFeatures },
    issues: v.issues, rejected: v.rejected, stats, rawText: text, order: opts.order ?? 0,
    cluster: stats.pointOnly && renderFeatures.length > (opts.clusterThreshold ?? 400),
  };
  return { ok: true, layer };
}

export function flattenGeometry(g: Geometry): Geometry[] {
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(flattenGeometry);
  return [g];
}

export function eachPosition(g: Geometry, fn: (p: Position) => void) {
  switch (g.type) {
    case 'Point': fn(g.coordinates); break;
    case 'MultiPoint': case 'LineString': g.coordinates.forEach(fn); break;
    case 'MultiLineString': case 'Polygon': g.coordinates.forEach((l) => l.forEach(fn)); break;
    case 'MultiPolygon': g.coordinates.forEach((p) => p.forEach((l) => l.forEach(fn))); break;
    case 'GeometryCollection': g.geometries.forEach((s) => eachPosition(s, fn)); break;
  }
}

/** Representative point of any geometry (vertex-average for lines/polygons; cheap & stable). */
export function representativePoint(g: Geometry | null): Position | null {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'LineString') return g.coordinates[Math.floor(g.coordinates.length / 2)];
  if (g.type === 'MultiLineString') { const l = g.coordinates.reduce((a, b) => (b.length > a.length ? b : a)); return l[Math.floor(l.length / 2)]; }
  let x = 0, y = 0, n = 0;
  const outer = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
  if (outer) { for (const p of outer.slice(0, -1)) { x += p[0]; y += p[1]; n++; } return n ? [x / n, y / n] : null; }
  eachPosition(g, (p) => { x += p[0]; y += p[1]; n++; });
  return n ? [x / n, y / n] : null;
}

export function geometryBbox(g: Geometry | null): [number, number, number, number] | null {
  if (!g) return null;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  eachPosition(g, (p) => { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); });
  return Number.isFinite(a) ? [a, b, c, d] : null;
}

export function prettifyFileName(f: string) {
  return f.replace(/\.(geo)?json$/i, '').replace(/^\d+[_-]/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).trim() || 'Untitled layer';
}

export async function readFileAsText(file: File): Promise<string> {
  return await file.text();
}
