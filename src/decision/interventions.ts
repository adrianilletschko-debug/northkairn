/**
 * The four maintenance interventions a segment can receive. Costs, condition gains and life
 * spans are default assumptions (config.ts), editable per-session in Settings.
 */
import { DEFAULT_INTERVENTIONS, type Intervention } from './config';

export type { Intervention };
export { DEFAULT_INTERVENTIONS };

/** Condition after applying an intervention, capped at 100. */
export function applyIntervention(condition: number, intervention: Intervention): number {
  return Math.min(100, condition + intervention.conditionImprovement);
}
