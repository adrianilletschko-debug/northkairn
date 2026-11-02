import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { incidentStats } from '../analytics/compute';
import { featurePasses } from '../geo/filters';
import { relTime } from '../lib/utils';
import { useStore } from '../state/store';
import { INCIDENT_COLORS } from '../theme/colors';
import { AX, IncidentsPanel, TT } from '../components/panels/Panels';
import { Badge, Empty, Panel, PanelHeader, Segmented } from '../components/ui/misc';
import { Switch } from '../components/ui/switch';
import { SectionShell } from './common';

export function IncidentsSection() {
  const layers = useStore((s) => s.layers); const filters = useStore((s) => s.filters); const select = useStore((s) => s.select); const view = useStore((s) => s.view); const setHeatmap = useStore((s) => s.setHeatmap); const v = useStore((s) => s.dataVersion); const selection = useStore((s) => s.selection);
  const [st, setSt] = useState<'active' | 'all'>('active');
  const stats = useMemo(() => incidentStats(layers, filters, 24 * 14), [layers, filters, v]);
  const list = useMemo(() => layers.filter((l) => l.kind === 'incident').flatMap((l) => l.data.features.filter((f) => featurePasses(f.properties!, l, filters)).map((f) => ({ l, p: f.properties! }))).filter((x) => st === 'all' || /open|responding|active/i.test(String(x.p.status ?? ''))).sort((a, b) => String(b.p.reported_at ?? '').localeCompare(String(a.p.reported_at ?? ''))), [layers, filters, st]);
  return (
    <SectionShell title="Incidents" sub={`${stats.open} active · ${stats.total} in loaded data`}>
      <div className="flex shrink-0 items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-300">
        <label className="flex items-center gap-2">Accident concentration heatmap <Switch color="#ef4444" checked={view.heatmaps.accidents} onCheckedChange={(x) => setHeatmap('accidents', x)} label="Accident heatmap" /></label>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <IncidentsPanel hours={24 * 7} />
        <Panel>
          <PanelHeader title="Incidents per day" sub="Reported date (IST)" />
          {stats.byDay.length === 0 ? <Empty title="No timestamped incidents" /> : (
            <div className="h-[120px] px-2 pb-2"><ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byDay} margin={{ top: 8, right: 8, left: -26, bottom: 0 }}><CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} /><XAxis dataKey="day" {...AX} /><YAxis {...AX} allowDecimals={false} /><Tooltip {...TT} formatter={(x: any) => [x, 'Incidents']} /><Bar dataKey="n" fill="#f87171" radius={[3, 3, 0, 0]} /></BarChart>
            </ResponsiveContainer></div>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Incident log" right={<Segmented size="sm" value={st} onChange={setSt} options={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'All' }]} />} />
          {list.length === 0 ? <Empty title={st === 'active' ? 'No active incidents' : 'No incidents'} /> : (
            <ul className="px-2 pb-2 pt-1">{list.slice(0, 120).map(({ l, p }) => (
              <li key={p.__fid}><button onClick={() => select({ layerId: l.id, fid: p.__fid }, true)} className={`flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.04] ${selection?.fid === p.__fid ? 'bg-cyan-400/10' : ''}`}>
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: INCIDENT_COLORS[p.incident_type] ?? '#94a3b8', boxShadow: `0 0 8px ${INCIDENT_COLORS[p.incident_type] ?? '#94a3b8'}` }} />
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[12.5px] text-slate-100">{p.incident_type ?? p.__label}{p.severity && <Badge color={p.__risk === 'High' ? '#ef4444' : p.__risk === 'Medium' ? '#f59e0b' : '#94a3b8'}>{p.severity}</Badge>}</span>
                  <span className="block truncate text-[11px] text-slate-500">{p.location ?? ''} · {p.description ?? ''}</span></span>
                <span className="shrink-0 text-right text-[10.5px] text-slate-500"><span className="block" style={{ color: /open/i.test(p.status) ? '#f87171' : /respond/i.test(p.status) ? '#fbbf24' : '#64748b' }}>{p.status}</span>{relTime(p.reported_at)}</span>
              </button></li>))}</ul>
          )}
        </Panel>
      </div>
    </SectionShell>
  );
}
