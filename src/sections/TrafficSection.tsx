import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { featurePasses } from '../geo/filters';
import { fmtInt } from '../lib/utils';
import { useStore } from '../state/store';
import { TRAFFIC_COLORS } from '../theme/colors';
import { AX, TrafficFlowPanel, TT, useLiveTraffic } from '../components/panels/Panels';
import { Empty, Panel, PanelHeader } from '../components/ui/misc';
import { Switch } from '../components/ui/switch';
import { SectionShell } from './common';

export function TrafficSection() {
  const layers = useStore((s) => s.layers); const filters = useStore((s) => s.filters); const view = useStore((s) => s.view); const setView = useStore((s) => s.setView); const setHeatmap = useStore((s) => s.setHeatmap); const select = useStore((s) => s.select);
  const [sensor, setSensor] = useState<string>('');
  const sensors = useMemo(() => layers.filter((l) => l.kind === 'sensor').flatMap((l) => l.data.features.filter((f) => featurePasses(f.properties!, l, filters)).map((f) => ({ l, p: f.properties! }))), [layers, filters]);
  const segs = useMemo(() => layers.filter((l) => l.kind === 'road').flatMap((l) => l.data.features.filter((f) => featurePasses(f.properties!, l, filters) && typeof f.properties!.__speed === 'number').map((f) => ({ km: Math.round(f.properties!.__km * 10) / 10, speed: f.properties!.__speed, vol: f.properties!.__vol, lvl: f.properties!.__traffic }))).sort((a, b) => a.km - b.km), [layers, filters]);
  const live = useLiveTraffic(); const liveBy = new Map(live.map((r) => [r.sensorId, r]));
  return (
    <SectionShell title="Traffic Monitoring" sub="Road segments are coloured by congestion level on the map">
      <div className="flex shrink-0 items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-300">
        <label className="flex items-center gap-2">Animated vehicles <Switch checked={view.vehicles} onCheckedChange={(v) => setView({ vehicles: v })} label="Animated vehicles" /></label>
        <label className="flex items-center gap-2">Density heatmap <Switch color="#f97316" checked={view.heatmaps.traffic} onCheckedChange={(v) => setHeatmap('traffic', v)} label="Traffic heatmap" /></label>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div>
          <select aria-label="Sensor" value={sensor} onChange={(e) => setSensor(e.target.value)} className="mb-2 h-8 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 text-[12px] text-slate-200 focus:outline-none">
            <option className="bg-slate-900" value="">All sensors (corridor average)</option>
            {sensors.map(({ p }) => <option className="bg-slate-900" key={p.__fid} value={p.__fid}>{p.__label} · {p.status ?? ''}</option>)}
          </select>
          <TrafficFlowPanel sensorId={sensor || undefined} />
        </div>
        <Panel>
          <PanelHeader title="Average speed by chainage" sub="Per road segment · coloured by congestion level" />
          {segs.length === 0 ? <Empty title="No segment speed data">Road segments need an average speed attribute (e.g. <code>avg_speed_kmh</code>).</Empty> : (
            <div className="h-[150px] px-2 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segs} margin={{ top: 10, right: 8, left: -20, bottom: 0 }} barCategoryGap={1}>
                  <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="km" {...AX} interval={Math.max(0, Math.floor(segs.length / 6))} tickFormatter={(k) => `Km ${Math.round(k)}`} />
                  <YAxis {...AX} unit="" />
                  <Tooltip {...TT} labelFormatter={(k) => `Km ${k}`} formatter={(v: any, _n: any, it: any) => [`${v} km/h · ${fmtInt(it.payload.vol)} veh/h · ${it.payload.lvl}`, 'Speed']} />
                  <Bar dataKey="speed" radius={[2, 2, 0, 0]}>{segs.map((s, i) => <Cell key={i} fill={TRAFFIC_COLORS[s.lvl] ?? '#64748b'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Traffic sensors" sub="Simulated live values replay each sensor's stored observations at the current IST time" />
          {sensors.length === 0 ? <Empty title="No traffic sensor layer" /> : (
            <div className="max-h-[280px] overflow-auto px-1 pb-2 pt-1">
              <table className="nk-table"><thead><tr><th>Sensor</th><th>Km</th><th>Status</th><th className="text-right">Now (sim.)</th></tr></thead>
                <tbody>{sensors.map(({ l, p }) => { const r = liveBy.get(p.__fid); return (
                  <tr key={p.__fid} className="clickable" onClick={() => { setSensor(p.__fid); select({ layerId: l.id, fid: p.__fid }, true); }}>
                    <td><div className="font-medium text-slate-100">{p.sensor_id ?? p.__label}</div><div className="text-[10.5px] text-slate-500">{p.sensor_type ?? ''}</div></td>
                    <td className="tabular-nums">{typeof p.__km === 'number' ? p.__km.toFixed(1) : '—'}</td>
                    <td style={{ color: p.__cond === 'Poor' ? '#94a3b8' : '#4ade80' }}>{p.status ?? '—'}</td>
                    <td className="text-right tabular-nums">{r ? <>{fmtInt(r.volumeVph)} <span className="text-slate-500">veh/h</span> · {r.speedKmh} <span className="text-slate-500">km/h</span></> : <span className="text-slate-600">no data</span>}</td>
                  </tr>); })}</tbody></table>
            </div>
          )}
        </Panel>
      </div>
    </SectionShell>
  );
}
