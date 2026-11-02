/**
 * Compares several budgets over a planning horizon: for each budget, the ranked interventions
 * (optimise.ts) are applied once at year 0, then every segment deteriorates year by year
 * (deterioration.ts). Reports the length-weighted average network condition and the share of
 * "poor" kilometres per year, so budgets can be compared against a "do nothing" (0 Cr) baseline.
 */
import type { PriorityWeights } from './config';
import { POOR_CONDITION_THRESHOLD } from './config';
import { deteriorate } from './deterioration';
import { applyIntervention, type Intervention } from './interventions';
import { rankSegments } from './optimise';
import type { Segment } from './segments';

export interface ScenarioYear { year: number; avgCondition: number; poorKmPct: number }
export interface ScenarioResult { budgetCr: number; totalCostLakh: number; segmentsTreated: number; years: ScenarioYear[] }

interface SimState { lengthKm: number; trafficLabel: Segment['trafficLabel']; condition: number }

function summarize(state: SimState[]): { avgCondition: number; poorKmPct: number } {
  const totalKm = state.reduce((s, x) => s + x.lengthKm, 0);
  if (!totalKm) return { avgCondition: 0, poorKmPct: 0 };
  const avgCondition = state.reduce((s, x) => s + x.condition * x.lengthKm, 0) / totalKm;
  const poorKm = state.filter((x) => x.condition < POOR_CONDITION_THRESHOLD).reduce((s, x) => s + x.lengthKm, 0);
  return { avgCondition, poorKmPct: (poorKm / totalKm) * 100 };
}

export function compareScenarios(segments: Segment[], interventions: Intervention[], budgetsCr: number[], years: number, weights: PriorityWeights): ScenarioResult[] {
  return budgetsCr.map((budgetCr): ScenarioResult => {
    const { ranked, spentLakh } = rankSegments(segments, interventions, budgetCr, years, weights);
    const chosen = new Map(ranked.map((c) => [c.segment.id, c]));
    let state: SimState[] = segments.map((s) => {
      const c = chosen.get(s.id);
      return { lengthKm: s.lengthKm, trafficLabel: s.trafficLabel, condition: c ? applyIntervention(s.condition, c.intervention) : s.condition };
    });
    const out: ScenarioYear[] = [{ year: 0, ...summarize(state) }];
    for (let y = 1; y <= years; y++) {
      state = state.map((s) => ({ ...s, condition: deteriorate(s.condition, s.trafficLabel, 1) }));
      out.push({ year: y, ...summarize(state) });
    }
    return { budgetCr, totalCostLakh: spentLakh, segmentsTreated: ranked.length, years: out };
  });
}
