/**
 * Reference alignment (highway centreline with chainage) and spatial enrichment.
 * Every feature gets a chainage (__km), offset from the centreline (__off, metres) and district (__district).
 * Uses a uniform-grid segment index so locating thousands of features along a long corridor stays fast.
 */
import { booleanPointInPolygon } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { representativePoint } from './ingest';
import type { GeoLayer } from './types';

export interface LocateResult { km: number; offsetM: number }

export interface Alignment {
  key: string;
  name: string;
  km0: number;
  kmEnd: number;
  coords: Position[];
  locate(p: Position): LocateResult;
  pointAt(km: number): Position;
  bearingAt(km: number): number;
  slice(a: number, b: number): Position[];
  offsetLine(a: number, b: number, offsetM: number): Position[];
}

const R = 6371008.8;

export function buildAlignment(layers: GeoLayer[]): Alignment | null {
  // 1) chainage-attributed road segments
  for (const l of layers.filter((x) => x.kind === 'road')) {
    const segs = l.data.features
      .filter((f) => f.geometry?.type === 'LineString' && Number.isFinite(Number(f.properties?.km_start)))
      .sort((a, b) => Number(a.properties!.km_start) - Number(b.properties!.km_start));
    if (segs.length >= 2) {
      const coords: Position[] = [];
      for (const s of segs) { const c = (s.geometry as any).coordinates as Position[]; c.forEach((p, i) => { if (i === 0 && coords.length) { const q = coords[coords.length - 1]; if (Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9) return; } coords.push(p); }); }
      const name = String(segs[0].properties?.highway ?? l.name);
      return makeAlignment(coords, Number(segs[0].properties!.km_start), name, `${l.id}:${segs.length}`);
    }
  }
  // 2) longest line in a highway/road layer, chainage from 0
  let best: Position[] | null = null, bestLen = 0, bestName = '', bestKey = '';
  for (const l of layers.filter((x) => x.kind === 'highway' || x.kind === 'road')) {
    for (const f of l.data.features) {
      const g = f.geometry; if (!g) continue;
      const lines: Position[][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      for (const ln of lines) { let len = 0; for (let i = 1; i < ln.length; i++) len += hav(ln[i - 1], ln[i]); if (len > bestLen) { bestLen = len; best = ln; bestName = String(f.properties?.name ?? l.name); bestKey = `${l.id}:${f.properties?.__fid}`; } }
    }
  }
  return best ? makeAlignment(best, 0, bestName, bestKey) : null;
}

function hav(a: Position, b: Position) {
  const dLat = ((b[1] - a[1]) * Math.PI) / 180, dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function makeAlignment(coords: Position[], km0: number, name: string, key: string): Alignment {
  const lat0 = coords.reduce((s, p) => s + p[1], 0) / coords.length;
  const kx = (Math.PI / 180) * R * Math.cos((lat0 * Math.PI) / 180), ky = (Math.PI / 180) * R;
  const xs = coords.map((p) => p[0] * kx), ys = coords.map((p) => p[1] * ky);
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
  const total = cum[cum.length - 1];
  // grid index of segments
  const CELL = 1500; // metres
  const grid = new Map<string, number[]>();
  const keyOf = (cx: number, cy: number) => `${cx},${cy}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const x0 = Math.floor(Math.min(xs[i], xs[i + 1]) / CELL), x1 = Math.floor(Math.max(xs[i], xs[i + 1]) / CELL);
    const y0 = Math.floor(Math.min(ys[i], ys[i + 1]) / CELL), y1 = Math.floor(Math.max(ys[i], ys[i + 1]) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = keyOf(cx, cy); const a = grid.get(k); a ? a.push(i) : grid.set(k, [i]); }
  }
  const project = (i: number, px: number, py: number) => {
    const ax = xs[i], ay = ys[i], bx = xs[i + 1], by = ys[i + 1];
    const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
    const qx = ax + t * dx, qy = ay + t * dy; const d = Math.hypot(px - qx, py - qy);
    const side = Math.sign(dx * (py - ay) - dy * (px - ax)) || 1; // >0 = left
    return { d, along: cum[i] + t * Math.sqrt(L2), side };
  };
  const locate = (p: Position): LocateResult => {
    const px = p[0] * kx, py = p[1] * ky; const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL);
    let best = { d: Infinity, along: 0, side: 1 };
    for (let ring = 0; ring < 60; ring++) {
      for (let ix = cx - ring; ix <= cx + ring; ix++) for (let iy = cy - ring; iy <= cy + ring; iy++) {
        if (Math.max(Math.abs(ix - cx), Math.abs(iy - cy)) !== ring) continue;
        const segs = grid.get(keyOf(ix, iy)); if (!segs) continue;
        for (const i of segs) { const r = project(i, px, py); if (r.d < best.d) best = r; }
      }
      if (best.d < (ring) * CELL) break; // nothing closer can exist outside the searched rings
    }
    if (!Number.isFinite(best.d)) { for (let i = 0; i < coords.length - 1; i++) { const r = project(i, px, py); if (r.d < best.d) best = r; } }
    return { km: km0 + best.along / 1000, offsetM: -best.side * best.d };
  };
  const idxAt = (m: number) => { let lo = 0, hi = cum.length - 1; while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= m) lo = mid; else hi = mid; } return lo; };
  const pointAtM = (m: number): Position => {
    m = Math.max(0, Math.min(total, m)); const i = idxAt(m); const seg = cum[i + 1] - cum[i] || 1; const t = (m - cum[i]) / seg;
    return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t];
  };
  const bearingAtM = (m: number) => { const a = pointAtM(m - 30), b = pointAtM(m + 30); return (Math.atan2((b[0] - a[0]) * kx, (b[1] - a[1]) * ky) * 180) / Math.PI; };
  const slice = (a: number, b: number) => {
    const ma = (Math.min(a, b) - km0) * 1000, mb = (Math.max(a, b) - km0) * 1000; const out: Position[] = [pointAtM(ma)];
    for (let i = 0; i < coords.length; i++) if (cum[i] > ma && cum[i] < mb) out.push(coords[i]);
    out.push(pointAtM(mb)); return out;
  };
  const offsetLine = (a: number, b: number, off: number) => {
    const out: Position[] = []; const ma = (Math.min(a, b) - km0) * 1000, mb = (Math.max(a, b) - km0) * 1000; const step = Math.max(20, (mb - ma) / 400);
    for (let m = ma; m <= mb + 0.01; m += step) {
      const p = pointAtM(Math.min(m, mb)); const br = (bearingAtM(Math.min(m, mb)) * Math.PI) / 180;
      out.push([p[0] + (Math.cos(br) * off) / kx, p[1] - (Math.sin(br) * off) / ky]);
    }
    return out;
  };
  return {
    key, name, km0, kmEnd: km0 + total / 1000, coords, locate,
    pointAt: (km) => pointAtM((km - km0) * 1000), bearingAt: (km) => bearingAtM((km - km0) * 1000), slice, offsetLine,
  };
}

/** Adds __km (if not already given by attributes), __off and __district to every feature. Mutates properties in place. */
export function enrichLayers(layers: GeoLayer[], alignment: Alignment | null, force = false) {
  const boundaries = layers.filter((l) => l.kind === 'boundary').flatMap((l) => l.data.features.filter((f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))) as Feature<Polygon | MultiPolygon, any>[];
  const bKey = boundaries.map((b) => b.properties.__fid).join(',');
  const key = `${alignment?.key ?? 'none'}|${bKey}`;
  for (const l of layers) {
    if (!force && (l as any).__enrichKey === key) continue;
    for (const f of l.data.features) {
      const p = f.properties!; const rp = representativePoint(f.geometry);
      if (!rp) continue;
      if (alignment && l.kind !== 'boundary') {
        const r = alignment.locate(rp);
        if (p.__kmFromAttr === undefined) p.__kmFromAttr = p.__km !== undefined;
        if (!p.__kmFromAttr) p.__km = Math.round(r.km * 1000) / 1000;
        p.__off = Math.round(r.offsetM);
      }
      if (l.kind !== 'boundary') {
        const d = boundaries.find((b) => booleanPointInPolygon(rp, b));
        p.__district = d ? String(d.properties.name ?? d.properties.__label) : undefined;
      } else p.__district = String(p.name ?? p.__label);
    }
    (l as any).__enrichKey = key;
  }
}
