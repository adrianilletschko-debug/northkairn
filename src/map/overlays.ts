/**
 * Derived overlay data computed from the loaded layers: heatmap points, risk indicators,
 * measurement geometry and corridor-analysis geometry. Pure functions.
 */
import { booleanPointInPolygon } from '@turf/turf';
import type { Feature, FeatureCollection, Point, Position } from 'geojson';
import type { Candidate } from '../decision/optimise';
import type { Alignment } from '../geo/alignment';
import { isSubPart } from '../geo/classify';
import { featurePasses } from '../geo/filters';
import { eachPosition, geometryBbox, representativePoint } from '../geo/ingest';
import type { Filters, GeoLayer } from '../geo/types';

const pt = (c: Position, p: Record<string, any>): Feature<Point> => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: p });
const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });
const SEV_W: Record<string, number> = { Critical: 1, Poor: 0.75, Fair: 0.45, Good: 0.25, Excellent: 0.2, Unknown: 0.3 };

export function heatmapData(layers: GeoLayer[], filters: Filters) {
  const traffic: Feature[] = [], accidents: Feature[] = [], defects: Feature[] = [], flood: Feature[] = [];
  const maxVol = Math.max(1, ...layers.flatMap((l) => l.data.features.map((f) => Number(f.properties?.__vol) || 0)));
  for (const l of layers) {
    for (const f of l.data.features) {
      const p = f.properties!; if (!f.geometry || !featurePasses(p, l, filters)) continue;
      if (typeof p.__vol === 'number' && p.__vol > 0) {
        // sample along lines so the heat follows the road
        if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') { let i = 0; eachPosition(f.geometry, (c) => { if (i++ % 3 === 0) traffic.push(pt(c, { w: p.__vol / maxVol })); }); }
        else { const c = representativePoint(f.geometry); if (c) traffic.push(pt(c, { w: p.__vol / maxVol })); }
      }
      const isAccident = l.kind === 'incident' && /accident|collision|crash/i.test(String(p.incident_type ?? p.type ?? p.__label));
      if (isAccident) { const c = representativePoint(f.geometry); if (c) accidents.push(pt(c, { w: /fatal/i.test(String(p.severity)) ? 1 : /major/i.test(String(p.severity)) ? 0.8 : 0.5 })); }
      if (l.kind === 'defect' && p.__maint !== 'Completed') { const c = representativePoint(f.geometry); if (c) defects.push(pt(c, { w: SEV_W[p.__cond] ?? 0.3 })); }
      if (l.kind === 'flood' && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
        const bb = geometryBbox(f.geometry)!; const w = p.__risk === 'High' ? 1 : p.__risk === 'Medium' ? 0.5 : 0.25;
        const step = Math.max((bb[2] - bb[0]) / 45, (bb[3] - bb[1]) / 45, 0.0025);
        for (let x = bb[0]; x <= bb[2]; x += step) for (let y = bb[1]; y <= bb[3]; y += step) if (booleanPointInPolygon([x, y], f.geometry as any)) flood.push(pt([x, y], { w }));
      }
    }
  }
  return { traffic: fc(traffic), accidents: fc(accidents), defects: fc(defects), flood: fc(flood) };
}

export interface RiskItem { lid: string; fid: string; label: string; level: 'critical' | 'warning'; reason: string; coord: Position; km?: number; at?: string; layerName: string }

/** problematic infrastructure: poor/critical condition, high risk, overdue maintenance, open serious incidents */
export function riskItems(layers: GeoLayer[], filters: Filters): RiskItem[] {
  const out: RiskItem[] = [];
  for (const l of layers) {
    if (!l.visible || ['landuse', 'boundary', 'water', 'flood', 'building', 'marker', 'highway'].includes(l.kind)) continue;
    for (const f of l.data.features) {
      const p = f.properties!; if (!f.geometry || isSubPart(p) || !featurePasses(p, l, filters)) continue;
      let level: RiskItem['level'] | null = null; let reason = '';
      if (l.kind === 'incident') {
        if (/open|responding/i.test(String(p.status)) && (p.__risk === 'High' || /accident/i.test(String(p.incident_type)))) { level = p.__risk === 'High' ? 'critical' : 'warning'; reason = `${p.incident_type ?? 'Incident'} · ${p.status}`; }
      } else if (l.kind === 'defect') {
        if (p.__cond === 'Critical' && p.__maint !== 'Completed') { level = 'critical'; reason = `${p.defect_type ?? 'Defect'} · ${p.severity ?? 'Critical'}`; }
      } else if (l.kind === 'maintenance') {
        if (p.__maint === 'Overdue') { level = 'warning'; reason = 'Work order overdue'; }
      } else {
        if (p.__cond === 'Critical') { level = 'critical'; reason = 'Critical condition'; }
        else if (p.__maint === 'Overdue') { level = 'warning'; reason = 'Inspection / maintenance overdue'; }
        else if (p.__cond === 'Poor' || p.__risk === 'High') { level = 'warning'; reason = p.__cond === 'Poor' ? 'Poor condition' : 'High risk'; }
      }
      if (!level) continue;
      const c = representativePoint(f.geometry); if (!c) continue;
      out.push({ lid: l.id, fid: p.__fid, label: p.__label, level, reason, coord: c, km: p.__km, at: p.reported_at ?? p.detected_on, layerName: l.name });
    }
  }
  return out;
}

export const riskFC = (items: RiskItem[]) => fc(items.map((r) => pt(r.coord, { level: r.level, __fid: r.fid, __lid: r.lid })));

export function measureFC(points: Position[]) {
  const feats: Feature[] = points.map((c, i) => pt(c, { i }));
  if (points.length > 1) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: points }, properties: {} });
  return fc(feats);
}

export function corridorFC(al: Alignment | null, a: number, b: number, bufferM: number) {
  if (!al) return fc([]);
  const left = al.offsetLine(a, b, -bufferM), right = al.offsetLine(a, b, bufferM);
  const ring = [...left, ...right.reverse()]; ring.push(ring[0]);
  return fc([
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { part: 'buffer' } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: al.slice(a, b) }, properties: { part: 'axis' } },
    pt(al.pointAt(a), { part: 'end', label: 'A' }), pt(al.pointAt(b), { part: 'end', label: 'B' }),
  ]);
}

/** One LineString per ranked segment (1 km each), tagged with its rank so the paint expression can colour rank 1-10 vividly and the rest more faintly. */
export function priorityFC(al: Alignment | null, ranked: Candidate[]) {
  if (!al || !ranked.length) return fc([]);
  return fc(ranked.map((c, i) => ({
    type: 'Feature', geometry: { type: 'LineString', coordinates: al.slice(c.segment.kmA, c.segment.kmB) },
    properties: { rank: i + 1, top: i < 10, label: `Rank ${i + 1} · ${c.intervention.name}` },
  } as Feature)));
}

export function lengthM(points: Position[]) {
  let s = 0; const R = 6371008.8;
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const dLat = ((b[1] - a[1]) * Math.PI) / 180, dLng = ((b[0] - a[0]) * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    s += 2 * R * Math.asin(Math.sqrt(h));
  }
  return s;
}
