/**
 * Splits the road alignment into fixed-length km segments and aggregates each segment's
 * condition, traffic, risk and maintenance status from the features inside it (mean for
 * condition/traffic, worst value for risk/maintenance — see README "Priorization & Budget").
 */
import type { Alignment } from '../geo/alignment';
import { getProp, isSubPart, type TrafficLevel } from '../geo/classify';
import { featurePasses } from '../geo/filters';
import type { Filters, GeoLayer, MaintStatus, Risk } from '../geo/types';
import { CONDITION_SCORE, MAINT_RANK, RISK_RANK, SEGMENT_LENGTH_KM, TRAFFIC_LEVEL_VOLUME } from './config';

export interface Segment {
  id: string;
  index: number;
  kmA: number;
  kmB: number;
  lengthKm: number;
  /** 0-100, mean of the road features' condition inside the bin. Falls back to a neutral default when no road data is present. */
  condition: number;
  hasConditionData: boolean;
  /** veh/h, mean of road features' traffic volume inside the bin. */
  trafficVol: number;
  trafficLabel: TrafficLevel;
  risk: Risk;
  maint: MaintStatus;
  incidentCount: number;
  district?: string;
}

interface Bin {
  kmA: number; kmB: number;
  condSum: number; condN: number;
  volSum: number; volN: number;
  trafficLevelCounts: Partial<Record<TrafficLevel, number>>;
  riskRank: number; risk: Risk;
  maintRank: number; maint: MaintStatus;
  incidentCount: number;
  districts: Map<string, number>;
}

export function buildSegments(layers: GeoLayer[], alignment: Alignment | null, filters: Filters, binKm = SEGMENT_LENGTH_KM): Segment[] {
  if (!alignment) return [];
  const k0 = alignment.km0, k1 = alignment.kmEnd;
  if (!(k1 > k0)) return [];
  // Round to the nearest whole number of bins and space them evenly across [k0, k1], rather than
  // chopping off a binKm-sized ruler from the start — that would leave a near-zero-length sliver
  // at the end whenever the alignment isn't an exact multiple of binKm, and a sliver's tiny cost
  // (cost scales with length) would unfairly outrank full-length segments later in optimise.ts.
  const n = Math.max(1, Math.round((k1 - k0) / binKm));
  const step = (k1 - k0) / n;
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({
    kmA: k0 + i * step, kmB: i === n - 1 ? k1 : k0 + (i + 1) * step,
    condSum: 0, condN: 0, volSum: 0, volN: 0, trafficLevelCounts: {},
    riskRank: 0, risk: 'Unknown', maintRank: 0, maint: 'Unknown', incidentCount: 0, districts: new Map(),
  }));
  const binIndex = (km: number) => Math.min(n - 1, Math.max(0, Math.floor((km - k0) / step)));

  for (const l of layers) {
    for (const f of l.data.features) {
      const p = f.properties!;
      if (!f.geometry || isSubPart(p) || typeof p.__km !== 'number' || !featurePasses(p, l, filters)) continue;
      const b = bins[binIndex(p.__km)];
      if (l.kind === 'road') {
        const pci = Number(getProp(p, ['pci']));
        const score = Number.isFinite(pci) ? pci : CONDITION_SCORE[p.__cond as keyof typeof CONDITION_SCORE] ?? CONDITION_SCORE.Unknown;
        b.condSum += score; b.condN++;
        if (typeof p.__vol === 'number') { b.volSum += p.__vol; b.volN++; }
        if (p.__traffic && p.__traffic !== 'Unknown') b.trafficLevelCounts[p.__traffic as TrafficLevel] = (b.trafficLevelCounts[p.__traffic as TrafficLevel] ?? 0) + 1;
      }
      if (l.kind === 'incident') b.incidentCount++;
      if (p.__risk) { const r = RISK_RANK[p.__risk as Risk] ?? 0; if (r > b.riskRank) { b.riskRank = r; b.risk = p.__risk; } }
      if (p.__maint) { const m = MAINT_RANK[p.__maint as MaintStatus] ?? 0; if (m > b.maintRank) { b.maintRank = m; b.maint = p.__maint; } }
      if (p.__district) b.districts.set(p.__district, (b.districts.get(p.__district) ?? 0) + 1);
    }
  }

  return bins.map((b, i): Segment => {
    const lengthKm = b.kmB - b.kmA;
    const hasConditionData = b.condN > 0;
    const condition = hasConditionData ? b.condSum / b.condN : CONDITION_SCORE.Unknown;
    let trafficLabel: TrafficLevel = 'Unknown', bestCount = 0;
    for (const [k, v] of Object.entries(b.trafficLevelCounts)) if ((v ?? 0) > bestCount) { bestCount = v!; trafficLabel = k as TrafficLevel; }
    const trafficVol = b.volN ? b.volSum / b.volN : TRAFFIC_LEVEL_VOLUME[trafficLabel];
    const district = [...b.districts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    return {
      id: `SEG${i}`, index: i, kmA: b.kmA, kmB: b.kmB, lengthKm, condition, hasConditionData,
      trafficVol, trafficLabel, risk: b.risk, maint: b.maint, incidentCount: b.incidentCount, district,
    };
  }).filter((s) => s.lengthKm > 1e-6);
}
