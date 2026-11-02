/**
 * Picks the best intervention per segment and ranks segments by benefit per rupee, greedily
 * filling the available budget. Benefit = condition gain, scaled up by traffic, risk and nearby
 * incidents according to the user's weighting (see benefitScore). The per-segment choice is the
 * intervention with the best benefit/cost ratio for that segment; segments are then granted
 * budget in ratio order, skipping any that no longer fit so cheaper, still-worthwhile segments
 * further down the list are not blocked by one that doesn't (fuzz-tested: this never lets a
 * bigger budget end up with a lower total benefit than a smaller one).
 */
import type { PriorityWeights } from './config';
import { applyIntervention, type Intervention } from './interventions';
import type { Segment } from './segments';

export interface Candidate {
  segment: Segment;
  intervention: Intervention;
  conditionGain: number;
  costLakh: number;
  benefit: number;
  ratio: number;
  reason: string;
}

export interface RankResult { ranked: Candidate[]; spentLakh: number; budgetLakh: number; consideredLakh: number }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function benefitScore(segment: Segment, conditionGain: number, weights: PriorityWeights): number {
  const condNorm = clamp01(conditionGain / 60); // a 60-point gain is treated as a full-strength signal
  const trafficNorm = clamp01(segment.trafficVol / 8000); // 8000 veh/h treated as saturated/heavy
  const riskNorm = segment.risk === 'High' ? 1 : segment.risk === 'Medium' ? 0.55 : segment.risk === 'Low' ? 0.2 : 0.35;
  const safetyNorm = clamp01(segment.incidentCount / 4); // 4+ incidents in the km treated as saturated
  const wSum = weights.condition + weights.traffic + weights.risk + weights.safety || 1;
  const mix = (condNorm * weights.condition + trafficNorm * weights.traffic + riskNorm * weights.risk + safetyNorm * weights.safety) / wSum;
  return conditionGain * mix;
}

function reasonFor(segment: Segment, intervention: Intervention): string {
  const bits: string[] = [`condition ${Math.round(segment.condition)}/100`];
  if (segment.trafficLabel !== 'Unknown') bits.push(`${segment.trafficLabel.toLowerCase()} traffic`);
  if (segment.risk === 'High' || segment.risk === 'Medium') bits.push(`${segment.risk.toLowerCase()} risk`);
  if (segment.incidentCount > 0) bits.push(`${segment.incidentCount} incident${segment.incidentCount > 1 ? 's' : ''} nearby`);
  if (segment.maint === 'Overdue') bits.push('maintenance overdue');
  return `${intervention.name} — ${bits.join(', ')}.`;
}

/**
 * Budget in ₹ Crore, converted to ₹ Lakh internally (1 Cr = 100 Lakh) to match intervention costs.
 * `planningYears` discounts interventions whose service life is shorter than the planning period
 * (e.g. routine maintenance redone every year is worth less for a 5-year plan than a resurfacing
 * that lasts the whole period), so the best pick for a 1-year plan can differ from a 5-year one.
 */
export function rankSegments(segments: Segment[], interventions: Intervention[], budgetCr: number, planningYears: number, weights: PriorityWeights): RankResult {
  const budgetLakh = Math.max(0, budgetCr) * 100;
  const candidates: Candidate[] = [];
  for (const segment of segments) {
    let best: Candidate | null = null;
    for (const intervention of interventions) {
      const conditionGain = Math.max(0, applyIntervention(segment.condition, intervention) - segment.condition);
      const costLakh = intervention.costPerKmLakh * segment.lengthKm;
      if (conditionGain <= 0 || costLakh <= 0) continue;
      const durationFactor = clamp01(intervention.lifeYears / Math.max(1, planningYears));
      // scaled by lengthKm, like costLakh, so ratio compares segments fairly regardless of their length
      const benefit = benefitScore(segment, conditionGain, weights) * durationFactor * segment.lengthKm;
      const ratio = benefit / costLakh;
      if (!best || ratio > best.ratio) best = { segment, intervention, conditionGain, costLakh, benefit, ratio, reason: reasonFor(segment, intervention) };
    }
    if (best) candidates.push(best);
  }
  candidates.sort((a, b) => b.ratio - a.ratio);

  const ranked: Candidate[] = [];
  let spent = 0;
  const consideredLakh = candidates.reduce((s, c) => s + c.costLakh, 0);
  for (const c of candidates) {
    if (spent + c.costLakh > budgetLakh + 1e-6) continue;
    spent += c.costLakh;
    ranked.push(c);
  }
  return { ranked, spentLakh: spent, budgetLakh, consideredLakh };
}
