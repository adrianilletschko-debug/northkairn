/**
 * Dashboard statistics, computed only from loaded GeoJSON features (after filters).
 * When the required attributes are absent the functions return empty results so the UI can show
 * an explicit empty state — nothing is fabricated.
 */
import { ASSET_HEALTH_CATEGORIES, getProp, isSubPart } from '../geo/classify';
import { featurePasses } from '../geo/filters';
import { CONDITIONS, type Filters, type GeoLayer } from '../geo/types';
import { istHourFraction } from '../data/sensorFeed';

const DAY = 86400000;
export const today = () => new Date();
const dateOf = (v: unknown) => { if (typeof v !== 'string') return null; const t = Date.parse(v); return Number.isFinite(t) ? t : null; };

export interface Scope { features: { layer: GeoLayer; p: Record<string, any>; f: any }[]; synthetic: boolean; layerCount: number }

export function scope(layers: GeoLayer[], filters: Filters, kinds?: GeoLayer['kind'][]): Scope {
  const features: Scope['features'] = []; let synthetic = false; const used = new Set<string>();
  for (const l of layers) {
    if (kinds && !kinds.includes(l.kind)) continue;
    for (const f of l.data.features) if (featurePasses(f.properties!, l, filters)) { features.push({ layer: l, p: f.properties!, f }); used.add(l.id); if (l.synthetic) synthetic = true; }
  }
  return { features, synthetic, layerCount: used.size };
}

// ---------- Asset health ----------
export interface HealthRow { category: string; total: number; assessed: number; good: number; pct: number }
export function assetHealth(layers: GeoLayer[], filters: Filters) {
  const s = scope(layers, filters);
  const rows = new Map<string, HealthRow>();
  let needInspection = 0, critical = 0, total = 0, assessed = 0, good = 0;
  const now = Date.now();
  for (const { p } of s.features) {
    if (!ASSET_HEALTH_CATEGORIES.includes(p.__cat) || isSubPart(p)) continue;
    const r = rows.get(p.__cat) ?? { category: p.__cat, total: 0, assessed: 0, good: 0, pct: 0 }; rows.set(p.__cat, r);
    r.total++; total++;
    if (p.__cond !== 'Unknown') { r.assessed++; assessed++; if (p.__cond === 'Excellent' || p.__cond === 'Good') { r.good++; good++; } }
    if (p.__cond === 'Critical' || (p.__cond === 'Poor' && p.__risk === 'High')) critical++;
    const due = dateOf(getProp(p, ['next_inspection_due', 'inspection_due', 'next_inspection']));
    const last = dateOf(getProp(p, ['last_inspection', 'last_inspected', 'inspection_date']));
    if ((due !== null && due <= now + 30 * DAY) || (due === null && last !== null && now - last > 365 * DAY) || p.__maint === 'Overdue') needInspection++;
  }
  const list = [...rows.values()].map((r) => ({ ...r, pct: r.assessed ? Math.round((r.good / r.assessed) * 100) : 0 })).sort((a, b) => ASSET_HEALTH_CATEGORIES.indexOf(a.category) - ASSET_HEALTH_CATEGORIES.indexOf(b.category));
  return { rows: list, total, assessed, good, overall: assessed ? Math.round((good / assessed) * 100) : null, needInspection, critical, synthetic: s.synthetic };
}

// ---------- Road condition ----------
export function roadCondition(layers: GeoLayer[], filters: Filters) {
  const s = scope(layers, filters, ['road']);
  const km: Record<string, number> = Object.fromEntries([...CONDITIONS, 'Unknown'].map((c) => [c, 0]));
  let pciSum = 0, pciLen = 0;
  for (const { p, f } of s.features) {
    if (!f.geometry) continue;
    const a = Number(p.km_start), b = Number(p.km_end);
    let len = Number.isFinite(a) && Number.isFinite(b) ? Math.abs(b - a) : lineKm(f.geometry);
    km[p.__cond] += len;
    const pci = Number(getProp(p, ['pci'])); if (Number.isFinite(pci)) { pciSum += pci * len; pciLen += len; }
  }
  const total = Object.values(km).reduce((x, y) => x + y, 0);
  const good = km.Excellent + km.Good;
  return { km, total, assessed: total - km.Unknown, goodPct: total - km.Unknown > 0 ? Math.round((good / (total - km.Unknown)) * 100) : null, avgPci: pciLen ? pciSum / pciLen : null, synthetic: s.synthetic };
}
function lineKm(g: any): number {
  const R = 6371.0088; let s = 0;
  const run = (c: number[][]) => { for (let i = 1; i < c.length; i++) { const [a, b] = [c[i - 1], c[i]]; const dLat = ((b[1] - a[1]) * Math.PI) / 180, dLng = ((b[0] - a[0]) * Math.PI) / 180; const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2; s += 2 * R * Math.asin(Math.sqrt(h)); } };
  if (g.type === 'LineString') run(g.coordinates); else if (g.type === 'MultiLineString') g.coordinates.forEach(run);
  return s;
}

// ---------- Traffic ----------
export interface TrafficPoint { label: string; hour: number; volume: number; speed: number }
export function trafficSeries(layers: GeoLayer[], filters: Filters, sensorId?: string) {
  const s = scope(layers, filters, ['sensor']);
  const buckets = new Map<number, { v: number; s: number; n: number }>();
  let sensorsWithData = 0, online = 0, total = 0;
  for (const { p } of s.features) {
    total++; if (p.__cond !== 'Poor') online++;
    if (sensorId && p.__fid !== sensorId) continue;
    const obs = p.observations; if (!Array.isArray(obs) || !obs.length) continue;
    sensorsWithData++;
    for (const o of obs) {
      const t = dateOf(o?.t ?? o?.timestamp ?? o?.time); const vol = Number(o?.volume_vph ?? o?.volume ?? o?.count); if (t === null || !Number.isFinite(vol)) continue;
      const h = Math.floor(istHourFraction(new Date(t)));
      const b = buckets.get(h) ?? { v: 0, s: 0, n: 0 }; b.v += vol; b.s += Number(o?.avg_speed_kmh ?? o?.speed ?? NaN) || 0; b.n++; buckets.set(h, b);
    }
  }
  const series: TrafficPoint[] = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([h, b]) => ({ hour: h, label: `${String(h).padStart(2, '0')}:00`, volume: Math.round(b.v / b.n), speed: Math.round(b.s / b.n) }));
  return { series, sensorsWithData, online, total, synthetic: s.synthetic };
}

export function trafficSegments(layers: GeoLayer[], filters: Filters) {
  const s = scope(layers, filters, ['road']);
  const dist: Record<string, number> = { Low: 0, Moderate: 0, Heavy: 0, Critical: 0 };
  let vSum = 0, spSum = 0, n = 0, densSum = 0;
  for (const { p, f } of s.features) {
    if (!f.geometry) continue; const len = Number.isFinite(Number(p.km_end) - Number(p.km_start)) ? Math.abs(Number(p.km_end) - Number(p.km_start)) : lineKm(f.geometry);
    if (p.__traffic && p.__traffic !== 'Unknown') dist[p.__traffic] += len;
    if (typeof p.__vol === 'number' && typeof p.__speed === 'number') { vSum += p.__vol * len; spSum += p.__speed * len; densSum += (p.__vol / Math.max(5, p.__speed)) * len; n += len; }
  }
  return { dist, avgVolume: n ? vSum / n : null, avgSpeed: n ? spSum / n : null, avgDensity: n ? densSum / n : null, lengthKm: n, synthetic: s.synthetic };
}

// ---------- Incidents ----------
export const INCIDENT_GROUPS: [string, RegExp][] = [
  ['Accidents', /accident|collision|crash/i], ['Obstructions', /obstruct|debris|cattle|tree/i], ['Potholes', /pothole/i], ['Congestion', /congest|queue|jam/i], ['Infra failures', /infra|failure|light|drain|barrier|vms/i], ['Breakdowns', /breakdown/i],
];
export function incidentStats(layers: GeoLayer[], filters: Filters, windowHours: number) {
  const s = scope(layers, filters, ['incident']);
  const now = Date.now(); const counts: Record<string, number> = Object.fromEntries([...INCIDENT_GROUPS.map((g) => g[0]), 'Other'].map((k) => [k, 0]));
  let inWindow = 0, open = 0, timed = 0;
  const byDay = new Map<string, number>();
  for (const { p } of s.features) {
    const t = dateOf(getProp(p, ['reported_at', 'timestamp', 'time', 'date', 'datetime']));
    if (t !== null) { timed++; const d = new Date(t + 5.5 * 3600000).toISOString().slice(5, 10); byDay.set(d, (byDay.get(d) || 0) + 1); }
    if (/open|responding|active/i.test(String(p.status ?? ''))) open++;
    if (t === null || now - t > windowHours * 3600000 || t > now + 3600000) continue;
    inWindow++;
    const type = String(getProp(p, ['incident_type', 'type', 'category']) ?? '');
    const g = INCIDENT_GROUPS.find(([, re]) => re.test(type)); counts[g ? g[0] : 'Other']++;
  }
  return { counts, inWindow, open, total: s.features.length, timed, byDay: [...byDay.entries()].sort().map(([day, n]) => ({ day, n })), synthetic: s.synthetic };
}

// ---------- Maintenance forecast ----------
export function maintenanceForecast(layers: GeoLayer[], filters: Filters, months = 6) {
  const s = scope(layers, filters);
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const buckets = Array.from({ length: months }, (_, i) => { const d = new Date(start.getFullYear(), start.getMonth() + i, 1); return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-GB', { month: 'short' }), inspections: 0, works: 0 }; });
  const idx = (t: number) => { const d = new Date(t); return buckets.findIndex((b) => b.key === `${d.getFullYear()}-${d.getMonth()}`); };
  let upcomingInspections = 0, scheduled = 0, open = 0, overdue = 0, hasData = false; const ms = Date.now();
  const tasks: { p: Record<string, any>; layer: GeoLayer; due: number | null; kind: 'inspection' | 'work' }[] = [];
  for (const { p, layer } of s.features) {
    if (isSubPart(p)) continue;
    const insp = dateOf(getProp(p, ['next_inspection_due', 'inspection_due', 'next_inspection']));
    if (insp !== null) {
      hasData = true; const i = idx(insp); if (i >= 0) buckets[i].inspections++;
      if (insp >= ms && insp <= ms + 90 * DAY) upcomingInspections++;
      if (insp < ms) overdue++;
      tasks.push({ p, layer, due: insp, kind: 'inspection' });
    }
    if (layer.kind === 'maintenance' || getProp(p, ['work_order']) !== undefined) {
      hasData = true; const st = dateOf(getProp(p, ['start_date', 'scheduled_date', 'planned_start'])); const due = dateOf(getProp(p, ['due_date', 'end_date']));
      if (st !== null) { const i = idx(st); if (i >= 0) buckets[i].works++; }
      if (p.__maint === 'Scheduled' || p.__maint === 'Planned') scheduled++;
      if (['Scheduled', 'Planned', 'In progress', 'Open', 'Overdue'].includes(p.__maint)) open++;
      if (p.__maint === 'Overdue') overdue++;
      tasks.push({ p, layer, due, kind: 'work' });
    }
  }
  return { buckets, upcomingInspections, scheduled, open, overdue, hasData, tasks, synthetic: s.synthetic };
}

// ---------- Alerts ----------
export interface Alert { lid: string; fid: string; title: string; sub: string; level: 'critical' | 'warning' | 'info' | 'ok'; at?: string; sortKey: number }
export function recentAlerts(layers: GeoLayer[], filters: Filters, max = 30): Alert[] {
  const s = scope(layers, filters); const out: Alert[] = []; const now = Date.now();
  for (const { p, layer } of s.features) {
    const km = typeof p.__km === 'number' ? `Km ${p.__km.toFixed(1)}` : '';
    if (layer.kind === 'incident') {
      const t = dateOf(p.reported_at) ?? 0; const open = /open|responding/i.test(String(p.status));
      out.push({ lid: layer.id, fid: p.__fid, title: String(p.incident_type ?? p.__label), sub: [km, p.status].filter(Boolean).join(' · '), level: !open ? 'ok' : p.__risk === 'High' ? 'critical' : 'warning', at: p.reported_at, sortKey: t + (open ? 1e13 : 0) });
    } else if (layer.kind === 'defect' && (p.__cond === 'Critical' || p.__cond === 'Poor') && p.__maint !== 'Completed') {
      const t = dateOf(p.detected_on) ?? 0;
      out.push({ lid: layer.id, fid: p.__fid, title: `${p.defect_type ?? 'Defect'} detected`, sub: [km, p.lane].filter(Boolean).join(' – '), level: p.__cond === 'Critical' ? 'critical' : 'warning', at: p.detected_on, sortKey: t + 1e13 });
    } else if (p.__maint === 'Overdue') {
      out.push({ lid: layer.id, fid: p.__fid, title: layer.kind === 'maintenance' ? `Work overdue: ${p.__label}` : `Inspection overdue`, sub: [p.__label !== p.asset_id ? p.asset_id : '', p.__label, km].filter(Boolean).slice(0, 2).join(' · '), level: 'warning', at: getProp(p, ['due_date', 'next_inspection_due']), sortKey: 1e13 + now });
    } else {
      const due = dateOf(getProp(p, ['next_inspection_due']));
      if (due !== null && due >= now && due <= now + 14 * DAY) out.push({ lid: layer.id, fid: p.__fid, title: 'Inspection due', sub: `${p.__label}${km ? ' · ' + km : ''}`, level: 'info', at: getProp(p, ['next_inspection_due']), sortKey: 1e13 - (due - now) / 1000 });
      if (layer.kind === 'maintenance' && p.__maint === 'Completed') { const t = dateOf(getProp(p, ['end_date'])) ?? 0; out.push({ lid: layer.id, fid: p.__fid, title: 'Maintenance completed', sub: `${km}${km ? ' – ' : ''}${p.work_type ?? p.__label}`, level: 'ok', at: getProp(p, ['end_date']), sortKey: t }); }
    }
  }
  return out.sort((a, b) => b.sortKey - a.sortKey).slice(0, max);
}

// ---------- Corridor analysis ----------
export function corridorStats(layers: GeoLayer[], filters: Filters, a: number, b: number, bufferM: number) {
  const s = scope(layers, filters);
  const inside = s.features.filter(({ p, layer }) => typeof p.__km === 'number' && p.__km >= a && p.__km <= b && (layer.kind === 'road' || layer.kind === 'highway' || Math.abs(p.__off ?? Infinity) <= bufferM) && layer.kind !== 'boundary' && layer.kind !== 'landuse');
  const byCat = new Map<string, number>(); for (const { p } of inside) if (!isSubPart(p)) byCat.set(p.__cat, (byCat.get(p.__cat) || 0) + 1);
  const road = inside.filter(({ layer }) => layer.kind === 'road');
  const cond: Record<string, number> = {}; let pciSum = 0, pciN = 0, volSum = 0, spSum = 0, tn = 0;
  for (const { p } of road) { cond[p.__cond] = (cond[p.__cond] || 0) + 1; const pci = Number(p.pci); if (Number.isFinite(pci)) { pciSum += pci; pciN++; } if (typeof p.__vol === 'number') { volSum += p.__vol; spSum += p.__speed ?? 0; tn++; } }
  const defects = inside.filter(({ layer, p }) => layer.kind === 'defect' && p.__maint !== 'Completed');
  const incidents = inside.filter(({ layer }) => layer.kind === 'incident');
  const works = inside.filter(({ layer }) => layer.kind === 'maintenance');
  const flagged = inside.filter(({ p, layer }) => !['landuse', 'boundary', 'water', 'flood', 'building', 'marker'].includes(layer.kind) && !isSubPart(p) && (p.__cond === 'Critical' || p.__cond === 'Poor' || p.__risk === 'High' || p.__maint === 'Overdue'));
  return {
    lengthKm: Math.abs(b - a), inside, byCat: [...byCat.entries()].sort((x, y) => y[1] - x[1]), roadCount: road.length, cond, avgPci: pciN ? pciSum / pciN : null,
    avgVol: tn ? volSum / tn : null, avgSpeed: tn ? spSum / tn : null, defects, incidents, works, flagged, synthetic: s.synthetic,
  };
}
