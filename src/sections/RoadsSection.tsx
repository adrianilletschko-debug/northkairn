import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { featurePasses } from '../geo/filters';
import { useStore } from '../state/store';
import { COND_COLORS } from '../theme/colors';
import { AX, RoadConditionPanel, TT } from '../components/panels/Panels';
import { Badge, Empty, Panel, PanelHeader } from '../components/ui/misc';
import { Switch } from '../components/ui/switch';
import { SectionShell } from './common';

export function RoadsSection() {
  const layers = useStore((s) => s.layers); const filters = useStore((s) => s.filters); const select = useStore((s) => s.select); const view = useStore((s) => s.view); const setHeatmap = useStore((s) => s.setHeatmap);
  const segs = useMemo(() => layers.filter((l) => l.kind === 'road').flatMap((l) => l.data.features.filter((f) => featurePasses(f.properties!, l, filters)).map((f) => ({ l, p: f.properties!, km: f.properties!.__km as number, pci: Number(f.properties!.pci) }))).sort((a, b) => a.km - b.km), [layers, filters]);
  const withPci = segs.filter((s) => Number.isFinite(s.pci));
  const worst = [...segs].sort((a, b) => ({ Critical: 0, Poor: 1, Fair: 2, Good: 3, Excellent: 4, Unknown: 5 } as any)[a.p.__cond] - ({ Critical: 0, Poor: 1, Fair: 2, Good: 3, Excellent: 4, Unknown: 5 } as any)[b.p.__cond] || a.pci - b.pci).slice(0, 12);
  const defects = useMemo(() => layers.filter((l) => l.kind === 'defect').flatMap((l) => l.data.features.filter((f) => featurePasses(f.properties!, l, filters))).map((f) => f.properties!), [layers, filters]);
  const openDefects = defects.filter((d) => d.__maint !== 'Completed');
  return (
    <SectionShell title="Road Conditions" sub="Segments are coloured by pavement condition on the map">
      <div className="flex shrink-0 items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-300">
        <label className="flex items-center gap-2">Road defect heatmap <Switch color="#fb923c" checked={view.heatmaps.defects} onCheckedChange={(v) => setHeatmap('defects', v)} label="Defect heatmap" /></label>
        <span className="ml-auto text-slate-500">{openDefects.length} open defects · {openDefects.filter((d) => d.__cond === 'Critical').length} critical</span>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <RoadConditionPanel />
        <Panel>
          <PanelHeader title="Pavement Condition Index along the corridor" sub="PCI per 1-km segment · dashed line = Fair threshold (55)" />
          {withPci.length === 0 ? <Empty title="No PCI attribute">Add a numeric <code>pci</code> attribute to road segments for this profile.</Empty> : (
            <div className="h-[160px] px-2 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={withPci.map((s) => ({ km: s.km, pci: s.pci, c: s.p.__cond, id: s.p.__fid, lid: s.l.id }))} margin={{ top: 10, right: 8, left: -20, bottom: 0 }} barCategoryGap={1}>
                  <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="km" {...AX} interval={Math.max(0, Math.floor(withPci.length / 6))} tickFormatter={(k) => `Km ${Math.round(k)}`} />
                  <YAxis {...AX} domain={[0, 100]} />
                  <ReferenceLine y={55} stroke="rgba(250,204,21,0.5)" strokeDasharray="4 3" />
                  <Tooltip {...TT} labelFormatter={(k) => `Km ${Number(k).toFixed(1)}`} formatter={(v: any, _n: any, it: any) => [`${v} (${it.payload.c})`, 'PCI']} />
                  <Bar dataKey="pci" radius={[2, 2, 0, 0]} cursor="pointer" onClick={(d: any) => select({ layerId: d.lid, fid: d.id }, true)}>{withPci.map((s, i) => <Cell key={i} fill={COND_COLORS[s.p.__cond]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Priority segments" sub="Worst condition first" />
          {worst.length === 0 ? <Empty title="No road segments" /> : (
            <div className="px-1 pb-2 pt-1"><table className="nk-table"><thead><tr><th>Segment</th><th>Condition</th><th>PCI</th><th>Maintenance</th></tr></thead>
              <tbody>{worst.map(({ l, p, pci }) => (
                <tr key={p.__fid} className="clickable" onClick={() => select({ layerId: l.id, fid: p.__fid }, true)}>
                  <td><div className="font-medium text-slate-100">{p.__label}</div><div className="text-[10.5px] text-slate-500">{p.location ?? ''}</div></td>
                  <td><Badge color={COND_COLORS[p.__cond]}>{p.__cond}</Badge></td><td className="tabular-nums">{Number.isFinite(pci) ? pci : '—'}</td><td className="text-slate-400">{p.maintenance_status ?? '—'}</td>
                </tr>))}</tbody></table></div>
          )}
        </Panel>
      </div>
    </SectionShell>
  );
}
