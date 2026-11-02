/**
 * Layer-kind inference and property normalisation.
 * Reads whatever attribute names a dataset uses and maps them to the app's normalised
 * vocabulary (condition, risk, maintenance status, chainage, heights). Never invents values:
 * anything that cannot be derived becomes "Unknown" / undefined.
 */
import type { Condition, LayerKind, MaintStatus, NKFeature, Risk } from './types';

export const KIND_COLORS: Record<LayerKind, string> = {
  highway: '#7dd3fc', road: '#22d3ee', bridge: '#b8c7dd', building: '#5f7391', water: '#2563eb', drainage: '#2dd4bf',
  sensor: '#22d3ee', camera: '#60a5fa', defect: '#f97316', maintenance: '#f59e0b', flood: '#8b5cf6', boundary: '#cbd5e1',
  landuse: '#4ade80', incident: '#ef4444', marker: '#94a3b8', lighting: '#facc15', generic: '#a78bfa',
};
const GENERIC_PALETTE = ['#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb7185', '#2dd4bf', '#c084fc'];
let genericIdx = 0;
export const nextGenericColor = () => GENERIC_PALETTE[genericIdx++ % GENERIC_PALETTE.length];

export const KIND_LABELS: Record<LayerKind, string> = {
  highway: 'Road network', road: 'Road segments', bridge: 'Bridges & structures', building: 'Buildings', water: 'Water bodies', drainage: 'Drainage',
  sensor: 'Traffic sensors', camera: 'CCTV cameras', defect: 'Road defects', maintenance: 'Maintenance zones', flood: 'Flood risk', boundary: 'Boundaries',
  landuse: 'Land use', incident: 'Incidents', marker: 'Kilometre markers', lighting: 'Signage & lighting', generic: 'Generic',
};

/** Context layers are background geography: attribute filters (condition, risk…) do not hide them. */
export const CONTEXT_KINDS: LayerKind[] = ['highway', 'building', 'water', 'flood', 'boundary', 'landuse', 'marker'];

const NAME_RULES: [RegExp, LayerKind][] = [
  [/defect|pothole|crack|distress/i, 'defect'],
  [/incident|accident|crash|collision/i, 'incident'],
  [/cctv|camera/i, 'camera'],
  [/sensor|counter|atcc|detector|traffic.?count/i, 'sensor'],
  [/maint|work.?zone|work.?order|repair/i, 'maintenance'],
  [/flood|inundat/i, 'flood'],
  [/drain|culvert|sewer/i, 'drainage'],
  [/bridge|flyover|viaduct|overpass|structure/i, 'bridge'],
  [/boundar|admin|district|taluk|tehsil|ward/i, 'boundary'],
  [/land.?use|land.?cover|lulc/i, 'landuse'],
  [/building|footprint/i, 'building'],
  [/water|river|lake|pond|stream|canal|nala|reservoir/i, 'water'],
  [/km.?mark|chainage|milestone|km.?stone|kilomet/i, 'marker'],
  [/light|lamp|sign|gantry/i, 'lighting'],
  [/segment|pavement|condition|pci/i, 'road'],
  [/highway|road|carriageway|network|street|nh[-_ ]?\d|expressway|lane/i, 'highway'],
];
const PROP_RULES: [string[], LayerKind][] = [
  [['defect_type', 'defect_id', 'distress'], 'defect'],
  [['incident_type', 'incident_id', 'accident_type'], 'incident'],
  [['camera_id', 'camera_type'], 'camera'],
  [['sensor_id', 'observations', 'volume_vph'], 'sensor'],
  [['work_order', 'work_type'], 'maintenance'],
  [['flood_risk', 'return_period'], 'flood'],
  [['land_use', 'landuse', 'lulc', 'land_cover'], 'landuse'],
  [['building_id', 'building', 'floors', 'building_use'], 'building'],
  [['pci', 'iri', 'km_start', 'segment_id'], 'road'],
  [['water_type', 'waterway'], 'water'],
  [['admin_level', 'boundary', 'boundary_id'], 'boundary'],
];

export function inferKind(fileName: string, fcName: string | undefined, features: NKFeature[]): LayerKind {
  const assetTypes = new Map<string, number>();
  const keys = new Set<string>();
  for (const f of features.slice(0, 400)) {
    const p = f.properties || {};
    for (const k of Object.keys(p)) keys.add(k.toLowerCase());
    const at = p.asset_type ?? p.type ?? p.category ?? p.class;
    if (typeof at === 'string') assetTypes.set(at, (assetTypes.get(at) || 0) + 1);
  }
  const topType = [...assetTypes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  for (const text of [fcName ?? '', fileName.replace(/\.(geo)?json$/i, ''), topType]) {
    for (const [re, kind] of NAME_RULES) if (re.test(text)) return kind;
  }
  for (const [ks, kind] of PROP_RULES) if (ks.some((k) => keys.has(k))) return kind;
  return 'generic';
}

// ---------- normalisation helpers ----------
export function getProp(p: Record<string, any>, names: string[]): any {
  for (const n of names) if (p[n] !== undefined && p[n] !== null && p[n] !== '') return p[n];
  const lower: Record<string, any> = {};
  for (const k of Object.keys(p)) lower[k.toLowerCase()] = p[k];
  for (const n of names) { const v = lower[n.toLowerCase()]; if (v !== undefined && v !== null && v !== '') return v; }
  return undefined;
}

const COND_WORDS: [RegExp, Condition][] = [
  [/^(excellent|very good|new|as new)$/i, 'Excellent'],
  [/^(good|satisfactory|ok|online|operational|functional|working|active)$/i, 'Good'],
  [/^(fair|average|moderate|medium|acceptable)$/i, 'Fair'],
  [/^(poor|bad|offline|degraded|faulty|damaged|deficient)$/i, 'Poor'],
  [/^(critical|very poor|severe|failed|failure|dangerous|unsafe)$/i, 'Critical'],
];
const SEVERITY_WORDS: [RegExp, Condition][] = [
  [/^(low|minor|negligible)$/i, 'Good'],
  [/^(medium|moderate)$/i, 'Fair'],
  [/^(high|major|serious)$/i, 'Poor'],
  [/^(critical|fatal|severe|extreme)$/i, 'Critical'],
];
const matchWord = (v: unknown, table: [RegExp, Condition][]): Condition | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  for (const [re, c] of table) if (re.test(s)) return c;
  return undefined;
};

export function normCondition(p: Record<string, any>): Condition {
  const c = matchWord(getProp(p, ['condition', 'condition_class', 'pavement_condition', 'health', 'state']), COND_WORDS);
  if (c) return c;
  const pci = Number(getProp(p, ['pci', 'pavement_condition_index']));
  if (Number.isFinite(pci)) return pci >= 85 ? 'Excellent' : pci >= 70 ? 'Good' : pci >= 55 ? 'Fair' : pci >= 40 ? 'Poor' : 'Critical';
  const rating = Number(getProp(p, ['condition_rating', 'rating']));
  if (Number.isFinite(rating) && rating <= 10) return rating >= 8 ? 'Excellent' : rating >= 6 ? 'Good' : rating >= 5 ? 'Fair' : rating >= 3 ? 'Poor' : 'Critical';
  const sev = matchWord(getProp(p, ['severity']), SEVERITY_WORDS);
  if (sev) return sev;
  const st = matchWord(getProp(p, ['status']), COND_WORDS);
  if (st) return st;
  return 'Unknown';
}

export function normRisk(p: Record<string, any>): Risk {
  const v = getProp(p, ['risk_level', 'risk', 'risk_category', 'flood_risk']);
  if (typeof v === 'string') {
    if (/very high|high|critical|severe/i.test(v)) return 'High';
    if (/medium|moderate/i.test(v)) return 'Medium';
    if (/low|minimal|negligible/i.test(v)) return 'Low';
  }
  if (typeof v === 'number') return v >= 0.66 || v >= 3 ? 'High' : v >= 0.33 || v >= 2 ? 'Medium' : 'Low';
  return 'Unknown';
}

export function normMaint(p: Record<string, any>): MaintStatus {
  const v = getProp(p, ['maintenance_status', 'maint_status', 'work_status', 'maintenance']);
  const s = typeof v === 'string' ? v : typeof getProp(p, ['work_order']) === 'string' ? String(getProp(p, ['status']) ?? '') : '';
  if (!s) return 'Unknown';
  if (/overdue|inspection overdue|late/i.test(s)) return 'Overdue';
  if (/in.?progress|ongoing|active|responding|underway/i.test(s)) return 'In progress';
  if (/complete|done|repaired|closed|cleared|finished/i.test(s)) return 'Completed';
  if (/schedul|assigned|due/i.test(s)) return 'Scheduled';
  if (/plann|proposed/i.test(s)) return 'Planned';
  if (/open|reported|new|pending/i.test(s)) return 'Open';
  if (/none|no action|n\/a|not required/i.test(s)) return 'None';
  return 'Unknown';
}

export type TrafficLevel = 'Low' | 'Moderate' | 'Heavy' | 'Critical' | 'Unknown';
export function normTraffic(p: Record<string, any>): { level: TrafficLevel; vol?: number; speed?: number } {
  const volRaw = Number(getProp(p, ['traffic_volume_vph', 'volume_vph', 'vehicles_per_hour', 'volume', 'flow_vph']));
  const speedRaw = Number(getProp(p, ['avg_speed_kmh', 'speed_kmh', 'average_speed', 'speed']));
  const vol = Number.isFinite(volRaw) ? volRaw : undefined, speed = Number.isFinite(speedRaw) ? speedRaw : undefined;
  const v = getProp(p, ['congestion_level', 'traffic_density', 'congestion', 'level_of_service', 'los']);
  let level: TrafficLevel = 'Unknown';
  if (typeof v === 'string') {
    if (/^(low|free|light|a|b)$/i.test(v.trim()) || /free.?flow|low/i.test(v)) level = 'Low';
    else if (/^(moderate|medium|c|d)$/i.test(v.trim()) || /moderate/i.test(v)) level = 'Moderate';
    else if (/^(heavy|high|e)$/i.test(v.trim()) || /heavy/i.test(v)) level = 'Heavy';
    else if (/^(critical|jam|severe|f|gridlock)$/i.test(v.trim()) || /jam|critical|standstill/i.test(v)) level = 'Critical';
  } else {
    const vc = Number(getProp(p, ['vc_ratio', 'v_c', 'volume_capacity_ratio']));
    if (Number.isFinite(vc)) level = vc < 0.45 ? 'Low' : vc < 0.7 ? 'Moderate' : vc < 0.9 ? 'Heavy' : 'Critical';
  }
  return { level, vol, speed };
}

export function normKm(p: Record<string, any>): number | undefined {
  const k = Number(getProp(p, ['km', 'chainage', 'chainage_km', 'km_marker', 'kilometre', 'kilometer']));
  if (Number.isFinite(k)) return k;
  const a = Number(getProp(p, ['km_start', 'from_km', 'start_km'])), b = Number(getProp(p, ['km_end', 'to_km', 'end_km']));
  if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
  if (Number.isFinite(a)) return a;
  return undefined;
}

export function normLabel(p: Record<string, any>, fallback: string): string {
  const v = getProp(p, ['name', 'title', 'label', 'asset_name', 'asset_id', 'id', 'segment_id', 'incident_id', 'defect_id', 'work_order', 'camera_id', 'sensor_id', 'building_id', 'parcel_id', 'zone_id', 'boundary_id', 'marker_id', 'feature_id']);
  return v !== undefined ? String(v) : fallback;
}

export function normHeights(p: Record<string, any>, kind: LayerKind): { h?: number; b?: number } {
  let h = Number(getProp(p, ['height_m', 'height', 'building_height', 'render_height']));
  if (!Number.isFinite(h)) { const fl = Number(getProp(p, ['floors', 'levels', 'building_levels', 'storeys'])); if (Number.isFinite(fl)) h = fl * 3.3; }
  let b = Number(getProp(p, ['base_height_m', 'min_height', 'base_height', 'render_min_height']));
  if (!Number.isFinite(h)) h = kind === 'building' ? 7 : kind === 'bridge' ? 7.5 : NaN;
  if (!Number.isFinite(b)) b = kind === 'bridge' ? Math.max(0, h - 1.6) : 0;
  return { h: Number.isFinite(h) ? h : undefined, b };
}

export function categoryFor(kind: LayerKind, p: Record<string, any>, layerName: string): string {
  const at = String(getProp(p, ['asset_type']) ?? '');
  switch (kind) {
    case 'road': return 'Road';
    case 'highway': return 'Road network';
    case 'bridge': return /toll|plaza|building|canopy/i.test(at) ? 'Structures' : 'Bridges';
    case 'drainage': return 'Drainage';
    case 'lighting': return 'Lighting & Signage';
    case 'camera': return 'CCTV';
    case 'sensor': return 'Sensors';
    case 'defect': return 'Road defects';
    case 'incident': return 'Incidents';
    case 'maintenance': return 'Maintenance';
    case 'building': return 'Buildings';
    case 'water': return 'Water';
    case 'flood': return 'Flood risk';
    case 'boundary': return 'Boundaries';
    case 'landuse': return 'Land use';
    case 'marker': return 'Markers';
    default: return at || layerName;
  }
}

/** Categories that count as maintainable infrastructure assets in the Asset Health panel. */
export const ASSET_HEALTH_CATEGORIES = ['Road', 'Bridges', 'Drainage', 'Lighting & Signage', 'CCTV', 'Sensors', 'Structures'];

/** true for features that are sub-parts of another asset (e.g. bridge piers) and should not be counted separately. */
export const isSubPart = (p: Record<string, any>) => p.part_of !== undefined && p.part_of !== null;
