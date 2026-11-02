import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS } from '../geo/types';
import { DEFAULT_INTERVENTIONS, DEFAULT_PRIORITY_WEIGHTS, type PriorityWeights } from './config';
import { rankSegments } from './optimise';
import { compareScenarios } from './scenarios';
import { buildSegments, type Segment } from './segments';

const TRAFFIC_LABELS = ['Low', 'Moderate', 'Heavy', 'Critical', 'Unknown'] as const;
const RISK_LABELS = ['Low', 'Medium', 'High', 'Unknown'] as const;

function randomSegment(i: number): Segment {
  return {
    id: `SEG${i}`, index: i, kmA: i, kmB: i + 1, lengthKm: 1,
    condition: Math.random() * 100,
    hasConditionData: Math.random() > 0.2,
    trafficVol: Math.random() * 9000,
    trafficLabel: TRAFFIC_LABELS[Math.floor(Math.random() * TRAFFIC_LABELS.length)],
    risk: RISK_LABELS[Math.floor(Math.random() * RISK_LABELS.length)],
    maint: 'Unknown',
    incidentCount: Math.floor(Math.random() * 6),
    district: undefined,
  };
}
function randomSegments(n: number) { return Array.from({ length: n }, (_, i) => randomSegment(i)); }
function randomWeights(): PriorityWeights { return { condition: 0.2 + Math.random() * 2, traffic: 0.2 + Math.random() * 2, risk: 0.2 + Math.random() * 2, safety: 0.2 + Math.random() * 2 }; }

describe('rankSegments: budget is never exceeded', () => {
  it('spends at most the given budget, across many random segment sets and budgets', () => {
    for (let t = 0; t < 200; t++) {
      const segments = randomSegments(2 + Math.floor(Math.random() * 40));
      const budgetCr = Math.random() * 80;
      const years = 1 + Math.floor(Math.random() * 5);
      const { spentLakh, budgetLakh } = rankSegments(segments, DEFAULT_INTERVENTIONS, budgetCr, years, randomWeights());
      expect(spentLakh).toBeLessThanOrEqual(budgetLakh + 1e-6);
    }
  });
});

describe('compareScenarios: more budget never leaves the network worse off', () => {
  it('end-of-horizon average condition is non-decreasing as budget increases', () => {
    for (let t = 0; t < 100; t++) {
      const segments = randomSegments(2 + Math.floor(Math.random() * 40));
      const base = Math.random() * 40;
      const budgets = [0, base, base + 10, base + 30].sort((a, b) => a - b);
      const weights = randomWeights();
      const results = compareScenarios(segments, DEFAULT_INTERVENTIONS, budgets, 5, weights);
      const finalConditions = results.map((r) => r.years[r.years.length - 1].avgCondition);
      for (let i = 1; i < finalConditions.length; i++) {
        expect(finalConditions[i]).toBeGreaterThanOrEqual(finalConditions[i - 1] - 1e-6);
      }
    }
  });
});

describe('empty data never crashes', () => {
  it('buildSegments returns [] with no alignment or no layers', () => {
    expect(buildSegments([], null, EMPTY_FILTERS)).toEqual([]);
  });
  it('rankSegments and compareScenarios handle an empty segment list', () => {
    const r = rankSegments([], DEFAULT_INTERVENTIONS, 25, 5, DEFAULT_PRIORITY_WEIGHTS);
    expect(r.ranked).toEqual([]);
    expect(r.spentLakh).toBe(0);
    const scenarios = compareScenarios([], DEFAULT_INTERVENTIONS, [0, 10, 25, 50], 5, DEFAULT_PRIORITY_WEIGHTS);
    for (const s of scenarios) for (const y of s.years) { expect(y.avgCondition).toBe(0); expect(y.poorKmPct).toBe(0); }
  });
  it('rankSegments handles an empty intervention list and a zero budget', () => {
    const segments = randomSegments(5);
    expect(() => rankSegments(segments, [], 10, 5, DEFAULT_PRIORITY_WEIGHTS)).not.toThrow();
    expect(() => rankSegments(segments, DEFAULT_INTERVENTIONS, 0, 5, DEFAULT_PRIORITY_WEIGHTS)).not.toThrow();
    expect(rankSegments(segments, DEFAULT_INTERVENTIONS, 0, 5, DEFAULT_PRIORITY_WEIGHTS).ranked).toEqual([]);
  });
});
