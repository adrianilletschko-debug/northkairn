/**
 * Central assumptions for the Prioritization & Budget module. Everything in this file is an
 * explicit modelling assumption, not measured data. Interventions are editable in Settings;
 * the rest stays fixed here but is kept in one place, commented, so the assumption is visible.
 */
import type { TrafficLevel } from '../geo/classify';
import type { Condition, MaintStatus, Risk } from '../geo/types';

export const SEGMENT_LENGTH_KM = 1;

/** Representative condition score (0-100) for a condition band, used when a feature has no numeric PCI. */
export const CONDITION_SCORE: Record<Condition, number> = { Excellent: 95, Good: 80, Fair: 60, Poor: 35, Critical: 10, Unknown: 60 };

/** Representative traffic volume (veh/h) for a congestion label, used when a feature has no __vol. */
export const TRAFFIC_LEVEL_VOLUME: Record<TrafficLevel, number> = { Low: 500, Moderate: 2000, Heavy: 5000, Critical: 9000, Unknown: 1500 };

/** Used to pick the "worst" value across the features inside a 1 km bin. */
export const RISK_RANK: Record<Risk, number> = { Unknown: 0, Low: 1, Medium: 2, High: 3 };
export const MAINT_RANK: Record<MaintStatus, number> = { Completed: 0, None: 0, Unknown: 0, Planned: 1, Scheduled: 2, 'In progress': 3, Open: 4, Overdue: 5 };

/** Condition points lost per year, before the traffic and current-condition adjustments below. */
export const DETERIORATION = {
  baseRatePerYear: 2,
  /** roads under heavier traffic wear out faster */
  trafficMultiplier: { Low: 1, Moderate: 1.3, Heavy: 1.7, Critical: 2.2, Unknown: 1.3 } as Record<TrafficLevel, number>,
  /** extra fractional decay for roads already in bad shape — "poor roads fail faster". At condition 0 the rate is 1 + this much higher than at condition 100. */
  worseningAcceleration: 0.6,
};

export interface Intervention { id: string; name: string; costPerKmLakh: number; conditionImprovement: number; lifeYears: number }

/** ₹ Lakh per km, condition points regained (capped at 100) and indicative service life. Editable in Settings. */
export const DEFAULT_INTERVENTIONS: Intervention[] = [
  { id: 'routine', name: 'Routine maintenance', costPerKmLakh: 3, conditionImprovement: 8, lifeYears: 1 },
  { id: 'preventive', name: 'Preventive preservation', costPerKmLakh: 15, conditionImprovement: 20, lifeYears: 4 },
  { id: 'overlay', name: 'Overlay / resurfacing', costPerKmLakh: 45, conditionImprovement: 45, lifeYears: 8 },
  { id: 'reconstruction', name: 'Reconstruction', costPerKmLakh: 120, conditionImprovement: 85, lifeYears: 15 },
];

export interface PriorityWeights { condition: number; traffic: number; risk: number; safety: number }
export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = { condition: 1, traffic: 1, risk: 1, safety: 1 };

export const DEFAULT_SCENARIO_BUDGETS_CR = [0, 10, 25, 50];

/** Condition score below which a km counts as "poor" in scenario comparisons (matches the Poor/Critical boundary used elsewhere in the app, see classify.ts normCondition). */
export const POOR_CONDITION_THRESHOLD = 40;
