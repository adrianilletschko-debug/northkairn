import { ClipboardCopy, Download, Info, ListOrdered } from 'lucide-react';
import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TT, AX } from '../components/panels/Panels';
import { Badge, Empty, Panel, PanelHeader, Segmented, Stat } from '../components/ui/misc';
import { Slider } from '../components/ui/slider';
import type { PriorityWeights } from '../decision/config';
import type { Candidate } from '../decision/optimise';
import { rankSegments } from '../decision/optimise';
import { compareScenarios } from '../decision/scenarios';
import { buildSegments } from '../decision/segments';
import type { Alignment } from '../geo/alignment';
import { downloadText, fmt1, inr } from '../lib/utils';
import { useStore } from '../state/store';
import { copyWithToast, SectionShell, toCSV } from './common';

const SCENARIO_CHART_YEARS = 5;
const SCENARIO_COLORS = ['#64748b', '#38bdf8', '#f59e0b', '#ef4444', '#a78bfa'];
const WEIGHT_LABELS: { key: keyof PriorityWeights; label: string }[] = [
  { key: 'condition', label: 'Condition' }, { key: 'traffic', label: 'Traffic' }, { key: 'safety', label: 'Safety' }, { key: 'risk', label: 'Risk' },
];

function rankCSV(ranked: Candidate[]) {
  return toCSV(ranked.map((c, i) => ({
    rank: i + 1, km_from: c.segment.kmA.toFixed(2), km_to: c.segment.kmB.toFixed(2), length_km: fmt1(c.segment.lengthKm),
    condition_now: Math.round(c.segment.condition), intervention: c.intervention.name, cost_inr_lakh: Math.round(c.costLakh),
    condition_gain: Math.round(c.conditionGain), traffic: c.segment.trafficLabel, risk: c.segment.risk, district: c.segment.district ?? '',
    reason: c.reason,
  })));
}
function rankGeoJSON(alignment: Alignment | null, ranked: Candidate[]) {
  if (!alignment) return '{"type":"FeatureCollection","features":[]}';
  const features = ranked.map((c, i) => ({
    type: 'Feature', geometry: { type: 'LineString', coordinates: alignment.slice(c.segment.kmA, c.segment.kmB) },
    properties: { rank: i + 1, km_from: c.segment.kmA, km_to: c.segment.kmB, intervention: c.intervention.name, cost_inr_lakh: Math.round(c.costLakh), condition_now: Math.round(c.segment.condition), reason: c.reason },
  }));
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

export function PrioritizationSection() {
  const layers = useStore((s) => s.layers); const filters = useStore((s) => s.filters); const alignment = useStore((s) => s.alignment); const v = useStore((s) => s.dataVersion);
  const priority = useStore((s) => s.priority);
  const setPriorityBudget = useStore((s) => s.setPriorityBudget); const setPriorityYears = useStore((s) => s.setPriorityYears); const setPriorityWeights = useStore((s) => s.setPriorityWeights);
  const flyTo = useStore((s) => s.flyTo); const select = useStore((s) => s.select); const setSection = useStore((s) => s.setSection);

  const segments = useMemo(() => buildSegments(layers, alignment, filters), [layers, alignment, filters, v]);
  const { ranked, spentLakh, budgetLakh } = useMemo(() => rankSegments(segments, priority.interventions, priority.budgetCr, priority.years, priority.weights), [segments, priority.interventions, priority.budgetCr, priority.years, priority.weights]);
  const scenarios = useMemo(() => compareScenarios(segments, priority.interventions, priority.scenarioBudgetsCr, SCENARIO_CHART_YEARS, priority.weights), [segments, priority.interventions, priority.scenarioBudgetsCr, priority.weights]);
  const chartData = useMemo(() => Array.from({ length: SCENARIO_CHART_YEARS + 1 }, (_, year) => {
    const row: Record<string, number> = { year };
    scenarios.forEach((s) => { row[`b${s.budgetCr}`] = Math.round(s.years[year].avgCondition * 10) / 10; });
    return row;
  }), [scenarios]);
  const networkAvg = useMemo(() => { const totalKm = segments.reduce((s, x) => s + x.lengthKm, 0); return totalKm ? segments.reduce((s, x) => s + x.condition * x.lengthKm, 0) / totalKm : null; }, [segments]);

  const flyToSegment = (c: Candidate) => { if (!alignment) return; const pts = alignment.slice(c.segment.kmA, c.segment.kmB); flyTo({ bbox: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))], pitch: 55 }); select(null); };

  return (
    <SectionShell title="Prioritization & Budget" sub="Which sections to fix first with a given budget, and what happens in 5 years either way">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Cost and deterioration values are assumptions, adjustable in Settings → Prioritization. With demo data the ranking and projections are illustrative only.
        </div>
        {!alignment ? (
          <Panel><Empty title="No highway alignment" icon={<ListOrdered className="size-5" />}>Load a road-segment or highway layer (e.g. a demo corridor) to prioritize sections.</Empty></Panel>
        ) : (
          <>
            <Panel>
              <PanelHeader title="Budget & planning period" sub={`${segments.length} km of alignment · ${alignment.name}`} />
              <div className="space-y-3 px-4 pb-4 pt-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11.5px] text-slate-400">Budget<span className="tabular-nums text-slate-200">₹{priority.budgetCr.toFixed(0)} Cr</span></div>
                  <Slider value={priority.budgetCr} min={0} max={100} step={1} onChange={setPriorityBudget} label="Budget in ₹ Crore" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-slate-400">Planning period</span>
                  <Segmented size="sm" value={String(priority.years)} onChange={(x) => setPriorityYears(Number(x))} options={[1, 2, 3, 4, 5].map((y) => ({ value: String(y), label: `${y} yr` }))} />
                </div>
                <div>
                  <div className="mb-1.5 text-[11.5px] text-slate-400">Weighting</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {WEIGHT_LABELS.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="w-14 shrink-0">{label}</span>
                        <Slider value={priority.weights[key]} min={0} max={2} step={0.1} onChange={(x) => setPriorityWeights({ [key]: x })} label={label} />
                        <span className="w-8 shrink-0 text-right tabular-nums text-slate-300">{priority.weights[key].toFixed(1)}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            <div className="grid grid-cols-4 gap-2">
              <Stat label="Segments funded" value={ranked.length} sub={`of ${segments.length}`} />
              <Stat label="Spent" value={inr(spentLakh * 1e5)} sub={`of ${inr(budgetLakh * 1e5)}`} color={spentLakh > 0 ? '#22d3ee' : undefined} />
              <Stat label="Network condition" value={networkAvg !== null ? Math.round(networkAvg) : '—'} sub="now, 0-100" />
              <Stat label={`In ${priority.years} yr, funded`} value={ranked.length ? Math.round(scenarios.find((s) => s.budgetCr === priority.budgetCr)?.years[priority.years]?.avgCondition ?? 0) : '—'} sub="vs. do nothing below" color="#4ade80" />
            </div>

            <Panel>
              <PanelHeader title="Ranked sections" sub={ranked.length ? `${ranked.length} segment(s) within budget, ranked by benefit per rupee` : 'No segment fits inside the current budget'}
                right={ranked.length > 0 ? (
                  <div className="flex gap-1">
                    <button title="Copy CSV" className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-cyan-300 hover:bg-white/[0.06] hover:text-cyan-200" onClick={() => copyWithToast(rankCSV(ranked), 'Ranking CSV')}><ClipboardCopy className="size-3" />CSV</button>
                    <button title="Download CSV" className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-cyan-300 hover:bg-white/[0.06] hover:text-cyan-200" onClick={() => { if (!downloadText('northkairn-prioritization.csv', rankCSV(ranked), 'text/csv')) useStore.getState().toast('warning', 'Download blocked by this sandboxed preview.'); }}><Download className="size-3" />CSV</button>
                    <button title="Download GeoJSON" className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-cyan-300 hover:bg-white/[0.06] hover:text-cyan-200" onClick={() => { if (!downloadText('northkairn-prioritization.geojson', rankGeoJSON(alignment, ranked), 'application/geo+json')) useStore.getState().toast('warning', 'Download blocked by this sandboxed preview.'); }}><Download className="size-3" />GeoJSON</button>
                  </div>
                ) : undefined} />
              {ranked.length === 0 ? <Empty title="Increase the budget">No intervention fits any segment within ₹{priority.budgetCr.toFixed(0)} Cr.</Empty> : (
                <div className="mt-2 max-h-[320px] overflow-auto px-1 pb-2">
                  <table className="nk-table"><thead><tr><th>Rank</th><th>Section</th><th>Condition</th><th>Intervention</th><th className="text-right">Cost</th></tr></thead>
                    <tbody>{ranked.map((c, i) => (
                      <tr key={c.segment.id} className="clickable" onClick={() => flyToSegment(c)}>
                        <td><Badge color={i < 10 ? '#ef4444' : '#38bdf8'}>#{i + 1}</Badge></td>
                        <td className="max-w-[160px]"><div className="truncate font-medium text-slate-100">Km {c.segment.kmA.toFixed(1)}–{c.segment.kmB.toFixed(1)}</div><div className="truncate text-[10.5px] text-slate-500">{c.reason}</div></td>
                        <td className="tabular-nums text-slate-400">{Math.round(c.segment.condition)}<span className="text-slate-600"> → {Math.round(c.segment.condition + c.conditionGain)}</span></td>
                        <td className="text-slate-300">{c.intervention.name}</td>
                        <td className="text-right tabular-nums text-slate-300">{inr(c.costLakh * 1e5)}</td>
                      </tr>))}</tbody></table>
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Network condition over 5 years" sub="Compares fixed budget scenarios against doing nothing (₹0 Cr)" />
              {segments.length === 0 ? <Empty title="No road data">Load a road-segment layer to project deterioration.</Empty> : (
                <div className="h-[220px] px-2 pb-3 pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 14, left: -10, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                      <XAxis dataKey="year" tickFormatter={(y) => `Yr ${y}`} {...AX} />
                      <YAxis domain={[0, 100]} {...AX} width={30} />
                      <Tooltip {...TT} labelFormatter={(y) => `Year ${y}`} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                      {scenarios.map((s, i) => (
                        <Line key={s.budgetCr} type="monotone" dataKey={`b${s.budgetCr}`} name={s.budgetCr === 0 ? 'Do nothing' : `₹${s.budgetCr} Cr`} stroke={SCENARIO_COLORS[i % SCENARIO_COLORS.length]} strokeWidth={2} dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
            <button className="text-left text-[11px] text-slate-500 hover:text-slate-300" onClick={() => setSection('settings')}>Edit intervention costs & lifespans in Settings →</button>
          </>
        )}
      </div>
    </SectionShell>
  );
}
