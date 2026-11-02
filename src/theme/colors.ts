/** Semantic colours shared by the map and the charts. */
export const COND_COLORS: Record<string, string> = {
  Excellent: '#10b981', Good: '#4ade80', Fair: '#facc15', Poor: '#f97316', Critical: '#ef4444', Unknown: '#64748b',
};
export const TRAFFIC_COLORS: Record<string, string> = {
  Low: '#22c55e', Moderate: '#facc15', Heavy: '#f97316', Critical: '#ef4444', Unknown: '#64748b',
};
export const RISK_COLORS: Record<string, string> = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444', Unknown: '#64748b' };
export const MAINT_COLORS: Record<string, string> = {
  Overdue: '#ef4444', 'In progress': '#f59e0b', Scheduled: '#38bdf8', Planned: '#a78bfa', Completed: '#22c55e', Open: '#fb923c', None: '#64748b', Unknown: '#475569',
};
export const INCIDENT_COLORS: Record<string, string> = {
  Accident: '#ef4444', 'Traffic congestion': '#f59e0b', 'Road obstruction': '#fb923c', Pothole: '#f97316', 'Infrastructure failure': '#a855f7', 'Vehicle breakdown': '#94a3b8',
};
export const LANDUSE_COLORS: Record<string, string> = {
  'Agriculture (rabi crops)': '#3f6b3a', 'Agriculture (kharif crops)': '#4d7a35', 'Fallow land': '#6b5d3e', Orchard: '#2f6b46', Scrubland: '#5b5a37',
  'Forest (dry deciduous)': '#24503a', 'Riparian vegetation': '#2a6b5c', Settlement: '#5b5470', Industrial: '#6b4a5a',
};
export const ACCENT = { cyan: '#22d3ee', blue: '#3b82f6', teal: '#2dd4bf', purple: '#a78bfa', green: '#22c55e', orange: '#f59e0b', red: '#ef4444' };

export const matchExpr = (prop: string, table: Record<string, string>, fallback: string): any[] => {
  const e: any[] = ['match', ['to-string', ['get', prop]]];
  for (const [k, v] of Object.entries(table)) e.push(k, v);
  e.push(fallback);
  return e;
};
