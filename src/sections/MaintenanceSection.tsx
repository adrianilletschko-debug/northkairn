import { useMemo, useState } from 'react';
import { maintenanceForecast } from '../analytics/compute';
import { getProp } from '../geo/classify';
import { fmtDate, inr, relTime } from '../lib/utils';
import { useStore } from '../state/store';
import { MAINT_COLORS } from '../theme/colors';
import { MaintenancePanel } from '../components/panels/Panels';
import { Badge, Empty, Panel, PanelHeader, Segmented, Stat } from '../components/ui/misc';
import { SectionShell } from './common';

export function MaintenanceSection() {
  const layers = useStore((s) => s.layers); const filters = useStore((s) => s.filters); const select = useStore((s) => s.select); const v = useStore((s) => s.dataVersion);
  const m = useMemo(() => maintenanceForecast(layers, filters, 6), [layers, filters, v]);
  const [tab, setTab] = useState<'work' | 'inspection'>('work');
  const now = Date.now();
  const tasks = m.tasks.filter((t) => t.kind === tab).sort((a, b) => {
    const od = (t: any) => (t.p.__maint === 'Overdue' || (t.due !== null && t.due < now && t.p.__maint !== 'Completed') ? 0 : t.p.__maint === 'Completed' ? 2 : 1);
    return od(a) - od(b) || (a.due ?? 9e15) - (b.due ?? 9e15);
  });
  const cost = m.tasks.filter((t) => t.kind === 'work' && t.p.__maint !== 'Completed').reduce((s, t) => s + (Number(getProp(t.p, ['estimated_cost_inr', 'cost_inr', 'estimated_cost'])) || 0), 0);
  return (
    <SectionShell title="Maintenance" sub="Work orders and inspections derived from the loaded GeoJSON">
      <div className="grid shrink-0 grid-cols-4 gap-2">
        <Stat label="Open tasks" value={m.open} />
        <Stat label="Scheduled" value={m.scheduled} color="#38bdf8" />
        <Stat label="Overdue" value={m.overdue} color="#ef4444" />
        <Stat label="Open budget" value={cost ? inr(cost) : '—'} color="#a78bfa" />
      </div>
      <MaintenancePanel className="shrink-0" />
      <Panel className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title={tab === 'work' ? 'Work orders' : 'Inspection schedule'} right={<Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'work', label: 'Work orders' }, { value: 'inspection', label: 'Inspections' }]} />} />
        {tasks.length === 0 ? <Empty title={tab === 'work' ? 'No work orders' : 'No inspection dates'}>{tab === 'work' ? 'Load a maintenance layer with work orders.' : 'Assets need a next_inspection_due attribute.'}</Empty> : (
          <div className="mt-2 min-h-0 flex-1 overflow-auto px-1 pb-2">
            <table className="nk-table"><thead><tr><th>{tab === 'work' ? 'Work order' : 'Asset'}</th><th>Status</th><th>{tab === 'work' ? 'Window' : 'Due'}</th>{tab === 'work' && <th className="text-right">Cost</th>}</tr></thead>
              <tbody>{tasks.map(({ p, layer, due }) => {
                const overdue = p.__maint === 'Overdue' || (due !== null && due < now && p.__maint !== 'Completed');
                const status = tab === 'inspection' ? (overdue ? 'Overdue' : due !== null && due < now + 30 * 86400000 ? 'Due soon' : 'Planned') : String(p.maintenance_status ?? p.__maint);
                const color = status === 'Due soon' ? '#f59e0b' : MAINT_COLORS[status] ?? MAINT_COLORS[p.__maint];
                return (
                  <tr key={p.__fid + tab} className="clickable" onClick={() => select({ layerId: layer.id, fid: p.__fid }, true)}>
                    <td className="max-w-[190px]"><div className="truncate font-medium text-slate-100">{tab === 'work' ? (p.work_order ?? p.__label) : (p.asset_id ?? p.__label)}</div><div className="truncate text-[10.5px] text-slate-500">{tab === 'work' ? `${p.work_type ?? ''} · ${p.location ?? ''}` : `${p.name ?? p.asset_type ?? ''}`}</div></td>
                    <td><Badge color={color}>{status}</Badge></td>
                    <td className="text-slate-400">{tab === 'work' ? <>{fmtDate(p.start_date)} → {fmtDate(p.end_date)}</> : <>{fmtDate(getProp(p, ['next_inspection_due']))}<div className="text-[10.5px] text-slate-500">{relTime(getProp(p, ['next_inspection_due']))}</div></>}</td>
                    {tab === 'work' && <td className="text-right tabular-nums">{p.estimated_cost_inr ? inr(p.estimated_cost_inr) : '—'}</td>}
                  </tr>); })}</tbody></table>
          </div>
        )}
      </Panel>
    </SectionShell>
  );
}
