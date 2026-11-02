/**
 * Condition deterioration model: a segment's condition score drops every year, faster for
 * busier roads and faster still the worse the road already is. See config.ts DETERIORATION
 * for the assumed rates.
 */
import type { TrafficLevel } from '../geo/classify';
import { DETERIORATION } from './config';

export function yearlyDeteriorationRate(condition: number, trafficLevel: TrafficLevel): number {
  const trafficMult = DETERIORATION.trafficMultiplier[trafficLevel] ?? DETERIORATION.trafficMultiplier.Unknown;
  const worsening = 1 + (DETERIORATION.worseningAcceleration * (100 - condition)) / 100;
  return DETERIORATION.baseRatePerYear * trafficMult * worsening;
}

export function deteriorate(condition: number, trafficLevel: TrafficLevel, years: number): number {
  let c = condition;
  for (let y = 0; y < years; y++) c = Math.max(0, c - yearlyDeteriorationRate(c, trafficLevel));
  return c;
}
