import { Activity, Camera, CircleCheck, Info, Radio, TriangleAlert, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { assetHealth, incidentStats, maintenanceForecast, recentAlerts, roadCondition, trafficSegments, trafficSeries } from '../../analytics/compute';
import { istHourFraction, SimulatedSensorFeed, type SensorReading } from '../../data/sensorFeed';
import { CONDITIONS } from '../../geo/types';
import { cn, fmt1, fmtInt, relTime } from '../../lib/utils';
import { useStore } from '../../state/store';
import { COND_COLORS, TRAFFIC_COLORS } from '../../theme/colors';
import { Empty, Panel, PanelHeader, SyntheticTag } from '../ui/misc';

export const TT = { contentStyle: { background: 'rgba(8,14,28,0.95)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, fontSize: 11.5, color: '#e2e8f0', boxShadow: '0 10px 30px -10px #000' }, itemStyle: { color: '#e2e8f0' }, labelStyle: { color: '#94a3b8', marginBottom: 2 } };
export const AX = { tick: { fill: '#64748b', fontSize: 10 }, axisLine: false, tickLine: false } as const;

function useData() {
  const layers = useStore((s) => s.layers); const filters = useStore((s) => s.filters); const v = useStore((s) => s.dataVersion);
  return { layers, filters, v };
}
const Src = ({ synthetic, n }: { synthetic: boolean; n?: string }) => <span className="flex items-center gap-1.5">{n}{synthetic && <SyntheticTag />}</span>;

// ---------- Asset health ----------
export function AssetHealthPanel({ className }: { className?: string }) {
  const { layers, filters, v } = useData();
  const h = useMemo(() => assetHealth(layers, filters), [layers, filters, v]);
  const CAT_COLORS: Record<string, string> = { Road: '#22d3ee', Bridges: '#38bdf8', Drainage: '#2dd4bf', 'Lighting & Signage': '#a78bfa', CCTV: '#60a5fa', Sensors: '#34d399', Structures: '#818cf8' };
  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelHeader title="Asset Health" sub={<Src synthetic={h.synthetic} n={h.total ? `${fmtInt(h.assessed)} of ${fmtInt(h.total)} assets assessed` : undefined} />} />
      {h.overall === null ? <Empty title="No asset condition data" icon={<Info className="size-5" />}>Load layers with a <code>condition</code>, <code>pci</code>, <code>condition_rating</code> or <code>status</code> attribute.</Empty> : (
        <div className="flex items-center gap-4 px-4 pb-3 pt-2">
          <Ring value={h.overall} label="Good or better" color={h.overall >= 80 ? '#22c55e' : h.overall >= 60 ? '#facc15' : '#ef4444'} />
          <div className="min-w-0 flex-1 space-y-1.5">
            {h.rows.map((r) => (
              <div key={r.category} className="flex items-center gap-2 text-[12px]" title={`${r.good} of ${r.assessed} assessed in good or excellent condition`}>
                <span className="size-2 rounded-full" style={{ background: CAT_COLORS[r.category] ?? '#94a3b8' }} />
                <span className="flex-1 truncate text-slate-300">{r.category}</span>
                <span className="tabular-nums text-slate-400">{r.assessed ? `${r.pct}%` : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {h.overall !== null && (
        <div className="mt-auto grid grid-cols-2 gap-2 px-4 pb-3.5">
          <MiniStat label="Need inspection" value={h.needInspection} color="#f59e0b" hint="Inspection due within 30 days, overdue, or none in 12 months" />
          <MiniStat label="Critical assets" value={h.critical} color="#ef4444" hint="Critical condition, or poor condition with high risk" />
        </div>
      )}
    </Panel>
  );
}

export function MiniStat({ label, value, color, hint }: { label: React.ReactNode; value: React.ReactNode; color: string; hint?: string }) {
  return <div title={hint} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5"><div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div><div className="text-[17px] font-semibold tabular-nums" style={{ color }}>{value}</div></div>;
}

export function Ring({ value, label, color, size = 112 }: { value: number; label: string; color: string; size?: number }) {
  const r = size / 2 - 8, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(148,163,184,0.12)" strokeWidth="7" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} style={{ filter: `drop-shadow(0 0 6px ${color}88)`, transition: 'stroke-dasharray .8s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-[24px] font-semibold tabular-nums leading-none text-white">{value}%</div><div className="mt-1 text-[10px] leading-tight text-slate-400">{label}</div></div></div>
    </div>
  );
}

// ---------- Traffic flow ----------
export function useLiveTraffic() {
  const { layers } = useData();
  const series = useMemo(() => layers.filter((l) => l.kind === 'sensor').flatMap((l) => l.data.features.map((f) => ({ sensorId: String(f.properties!.__fid), online: f.properties!.__cond !== 'Poor', observations: Array.isArray(f.properties!.observations) ? f.properties!.observations : [] }))).filter((s) => s.observations.length), [layers]);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  useEffect(() => { if (!series.length) { setReadings([]); return; } return new SimulatedSensorFeed(series).subscribe(setReadings); }, [series]);
  return readings;
}

export function TrafficFlowPanel({ className, sensorId, compact }: { className?: string; sensorId?: string; compact?: boolean }) {
  const { layers, filters, v } = useData();
  const t = useMemo(() => trafficSeries(layers, filters, sensorId), [layers, filters, v, sensorId]);
  const seg = useMemo(() => trafficSegments(layers, filters), [layers, filters, v]);
  const live = useLiveTraffic();
  const liveAvg = live.length ? Math.round(live.reduce((s, r) => s + r.volumeVph, 0) / live.length) : null;
  const liveSpeed = live.length ? Math.round(live.reduce((s, r) => s + r.speedKmh, 0) / live.length) : null;
  const hourNow = istHourFraction();
  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelHeader title={<span>Traffic Flow <span className="text-[11px] font-normal text-slate-500">(average per sensor)</span></span>} sub={<Src synthetic={t.synthetic} n={t.total ? `${t.online}/${t.total} sensors online` : undefined} />}
        right={liveAvg !== null ? <span className="flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-cyan-100" title="Replayed from stored hourly observations at the current IST time (simulated live)"><span className="nk-pulse size-1.5 rounded-full bg-cyan-300" />{fmtInt(liveAvg)} veh/h · sim.</span> : undefined} />
      {t.series.length === 0 ? <Empty title="No timestamped traffic observations" icon={<Activity className="size-5" />}>Time-series charts appear when sensor features carry an <code>observations</code> array with timestamps and volumes.</Empty> : (
        <div className={cn('px-2 pt-1', compact ? 'h-[128px]' : 'h-[150px]')}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={t.series} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
              <defs><linearGradient id="tfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22d3ee" stopOpacity={0.38} /><stop offset="1" stopColor="#22d3ee" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="hour" type="number" domain={[0, 23]} ticks={[0, 6, 12, 18, 23]} tickFormatter={(h) => `${String(h).padStart(2, '0')}:00`} {...AX} />
              <YAxis {...AX} tickFormatter={(x) => (x >= 1000 ? `${(x / 1000).toFixed(1)}k` : x)} width={44} />
              <Tooltip {...TT} labelFormatter={(h) => `${String(h).padStart(2, '0')}:00 IST`} formatter={(v: any) => [`${fmtInt(v)} veh/h`, 'Avg volume']} />
              <ReferenceLine x={hourNow} stroke="rgba(226,232,240,0.45)" strokeDasharray="3 3" label={{ value: 'now', fill: '#94a3b8', fontSize: 9, position: 'top' }} />
              <Area type="monotone" dataKey="volume" stroke="#22d3ee" strokeWidth={2} fill="url(#tfg)" activeDot={{ r: 4, stroke: '#0b1220', strokeWidth: 2, fill: '#67e8f9' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {!compact && (seg.avgSpeed !== null || liveSpeed !== null) && (
        <div className="grid grid-cols-3 gap-2 px-4 pb-3.5 pt-1">
          <MiniStat label="Avg speed" value={`${liveSpeed ?? Math.round(seg.avgSpeed!)} km/h`} color="#e2e8f0" hint={liveSpeed !== null ? 'Simulated live, from sensor observations' : 'Length-weighted from road segments'} />
          <MiniStat label="Density" value={seg.avgDensity !== null ? `${fmt1(seg.avgDensity)} v/km` : '—'} color="#e2e8f0" hint="Vehicles per km (volume ÷ speed), length-weighted across segments" />
          <MiniStat label="Congested" value={seg.lengthKm ? `${fmt1(seg.dist.Heavy + seg.dist.Critical)} km` : '—'} color={TRAFFIC_COLORS.Heavy} hint="Length of segments with heavy or critical congestion" />
        </div>
      )}
      {!compact && seg.lengthKm > 0 && <CongestionBar dist={seg.dist} />}
    </Panel>
  );
}

export function CongestionBar({ dist }: { dist: Record<string, number> }) {
  const total = Object.values(dist).reduce((a, b) => a + b, 0); if (!total) return null;
  return (
    <div className="px-4 pb-3.5">
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full">{Object.entries(dist).filter(([, v]) => v > 0).map(([k, v]) => <div key={k} title={`${k}: ${fmt1(v)} km`} style={{ width: `${(v / total) * 100}%`, background: TRAFFIC_COLORS[k] }} />)}</div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[10.5px] text-slate-500">{Object.entries(dist).map(([k, v]) => <span key={k} className="flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: TRAFFIC_COLORS[k] }} />{k} {fmt1(v)} km</span>)}</div>
    </div>
  );
}

// ---------- Road condition ----------
export function RoadConditionPanel({ className }: { className?: string }) {
  const { layers, filters, v } = useData();
  const r = useMemo(() => roadCondition(layers, filters), [layers, filters, v]);
  const data = CONDITIONS.map((c) => ({ name: c, value: r.km[c] })).filter((d) => d.value > 0);
  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelHeader title="Road Condition" sub={<Src synthetic={r.synthetic} n={r.total ? `${fmt1(r.assessed)} km assessed${r.avgPci !== null ? ` · avg PCI ${fmt1(r.avgPci)}` : ''}` : undefined} />} />
      {r.goodPct === null ? <Empty title="No road condition data" icon={<Info className="size-5" />}>Needs road-segment LineStrings with a condition or PCI attribute.</Empty> : (
        <div className="flex items-center gap-4 px-4 pb-3.5 pt-2">
          <div className="relative size-[96px] shrink-0 2xl:size-[108px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" innerRadius={38} outerRadius={50} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270} isAnimationActive>
                  {data.map((d) => <Cell key={d.name} fill={COND_COLORS[d.name]} />)}
                </Pie>
                <Tooltip {...TT} formatter={(v: any, n: any) => [`${fmt1(v)} km`, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><div className="text-[21px] font-semibold tabular-nums leading-none text-white">{r.goodPct}%</div><div className="mt-1 text-[10px] text-slate-400">Good+</div></div></div>
          </div>
          <div className="flex-1 space-y-1.5">
            {CONDITIONS.map((c) => (
              <div key={c} className="flex items-center gap-2 whitespace-nowrap text-[12px]"><span className="size-2 shrink-0 rounded-full" style={{ background: COND_COLORS[c] }} /><span className="flex-1 truncate text-slate-300">{c}</span><span className="tabular-nums text-slate-400">{fmt1(r.km[c])} km</span></div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---------- Incidents ----------
const SHORT: Record<string, string> = { Accidents: 'Accid.', Obstructions: 'Obstr.', Potholes: 'Potholes', Congestion: 'Congest.', 'Infra failures': 'Infra', Breakdowns: 'Breakdn', Other: 'Other' };
const INC_BAR: Record<string, string> = { Accidents: '#ef4444', Obstructions: '#fb923c', Potholes: '#f97316', Congestion: '#f59e0b', 'Infra failures': '#a855f7', Breakdowns: '#94a3b8', Other: '#64748b' };
export function IncidentsPanel({ className, hours: initial = 24 }: { className?: string; hours?: number }) {
  const { layers, filters, v } = useData();
  const [hours, setHours] = useState(initial);
  const s = useMemo(() => incidentStats(layers, filters, hours), [layers, filters, v, hours]);
  const data = Object.entries(s.counts).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0 || d.name !== 'Other');
  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelHeader title={<span>Incidents <span className="text-[11px] font-normal text-slate-500">(last {hours >= 168 ? `${hours / 24} days` : `${hours}h`})</span></span>} sub={<Src synthetic={s.synthetic} n={s.total ? `${s.inWindow} in window · ${s.open} open` : undefined} />}
        right={<select aria-label="Time window" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="rounded-md border border-white/10 bg-transparent px-1 py-0.5 text-[11px] text-slate-300 focus:outline-none"><option className="bg-slate-900" value={24}>24 h</option><option className="bg-slate-900" value={72}>72 h</option><option className="bg-slate-900" value={168}>7 days</option><option className="bg-slate-900" value={336}>14 days</option></select>} />
      {s.total === 0 ? <Empty title="No incident layer loaded" icon={<TriangleAlert className="size-5" />}>Load incident points with a type and timestamp (e.g. <code>incident_type</code>, <code>reported_at</code>).</Empty>
        : s.timed === 0 ? <Empty title="Incidents have no timestamps">Add a <code>reported_at</code> attribute to chart them over time.</Empty> : (
          <div className="h-[132px] px-2 pb-2 pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 16, right: 6, left: -26, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis dataKey="name" {...AX} interval={0} tick={{ fill: '#94a3b8', fontSize: 9.5 }} tickFormatter={(n: string) => SHORT[n] ?? n} />
                <YAxis {...AX} allowDecimals={false} />
                <Tooltip {...TT} formatter={(v: any) => [v, 'Incidents']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#cbd5e1', fontSize: 10 }}>
                  {data.map((d) => <Cell key={d.name} fill={INC_BAR[d.name]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
    </Panel>
  );
}

// ---------- Maintenance forecast ----------
export function MaintenancePanel({ className }: { className?: string }) {
  const { layers, filters, v } = useData();
  const m = useMemo(() => maintenanceForecast(layers, filters), [layers, filters, v]);
  const data = m.buckets.map((b) => ({ ...b, total: b.inspections + b.works }));
  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelHeader title="Maintenance Forecast" sub={<Src synthetic={m.synthetic} n={m.hasData ? `${m.open} open · ${m.overdue} overdue · ${m.upcomingInspections} inspections in 90 d` : undefined} />} />
      {!m.hasData ? <Empty title="No maintenance data" icon={<Wrench className="size-5" />}>Needs work orders (<code>work_order</code>, <code>start_date</code>, <code>maintenance_status</code>) or assets with <code>next_inspection_due</code>.</Empty> : (
        <div className="h-[132px] px-2 pb-2 pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 8, left: -26, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="label" {...AX} />
              <YAxis {...AX} allowDecimals={false} />
              <Tooltip {...TT} formatter={(v: any, n: any) => [v, n === 'works' ? 'Works starting' : 'Inspections due']} />
              <Bar dataKey="works" stackId="a" fill="#a78bfa" />
              <Bar dataKey="inspections" stackId="a" fill="#38bdf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="-mt-0.5 flex gap-3 px-3 text-[10.5px] text-slate-500"><span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-violet-400" />Works starting</span><span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-sky-400" />Inspections due</span></div>
        </div>
      )}
    </Panel>
  );
}

// ---------- Recent alerts ----------
const ALERT_ICON = { critical: { icon: TriangleAlert, c: '#ef4444' }, warning: { icon: TriangleAlert, c: '#f59e0b' }, info: { icon: Info, c: '#38bdf8' }, ok: { icon: CircleCheck, c: '#22c55e' } };
export function AlertsPanel({ className, max = 6 }: { className?: string; max?: number }) {
  const { layers, filters, v } = useData();
  const [all, setAll] = useState(false);
  const alerts = useMemo(() => recentAlerts(layers, filters, 60), [layers, filters, v]);
  const select = useStore((s) => s.select);
  const shown = all ? alerts : alerts.slice(0, max);
  return (
    <Panel className={cn('flex min-h-0 flex-col', className)}>
      <PanelHeader title="Recent Alerts" sub={alerts.length ? `${alerts.filter((a) => a.level === 'critical').length} critical · ${alerts.filter((a) => a.level === 'warning').length} warnings` : undefined}
        right={alerts.length > max ? <button className="text-[11.5px] text-cyan-300 hover:text-cyan-200" onClick={() => setAll(!all)}>{all ? 'Show less' : 'View all'}</button> : undefined} />
      {alerts.length === 0 ? <Empty title="No alerts" icon={<CircleCheck className="size-5" />}>Alerts are derived from incidents, defects, overdue work and due inspections in the loaded data.</Empty> : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
          {shown.map((a) => { const I = ALERT_ICON[a.level]; return (
            <li key={a.fid + a.title}>
              <button onClick={() => select({ layerId: a.lid, fid: a.fid }, true)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.04]">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `${I.c}1f`, boxShadow: `inset 0 0 0 1px ${I.c}40` }}><I.icon className="size-4" style={{ color: I.c }} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] text-slate-100">{a.title}</span><span className="block truncate text-[11px] text-slate-500">{a.sub}</span></span>
                <span className="shrink-0 text-[10.5px] text-slate-500">{relTime(a.at)}</span>
              </button>
            </li>); })}
        </ul>
      )}
    </Panel>
  );
}

// ---------- Network status (sensors & CCTV) ----------
export function NetworkPanel({ className }: { className?: string }) {
  const { layers, filters, v } = useData();
  const select = useStore((s) => s.select);
  const items = useMemo(() => layers.filter((l) => l.kind === 'camera' || l.kind === 'sensor').flatMap((l) => l.data.features.map((f) => ({ l, p: f.properties! }))), [layers, filters, v]);
  const cams = items.filter((i) => i.l.kind === 'camera'), sens = items.filter((i) => i.l.kind === 'sensor');
  const off = items.filter((i) => i.p.__cond === 'Poor');
  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelHeader title="Field Devices" sub={items.length ? <Src synthetic={items.some((i) => i.l.synthetic)} n="CCTV & traffic sensor status" /> : undefined} />
      {items.length === 0 ? <Empty title="No CCTV or sensor layers" icon={<Camera className="size-5" />} /> : (
        <div className="px-4 pb-3.5 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label={<span className="flex items-center gap-1"><Camera className="size-3" />CCTV online</span>} value={`${cams.length - cams.filter((c) => c.p.__cond === 'Poor').length}/${cams.length}`} color="#60a5fa" />
            <MiniStat label={<span className="flex items-center gap-1"><Radio className="size-3" />Sensors online</span>} value={`${sens.length - sens.filter((c) => c.p.__cond === 'Poor').length}/${sens.length}`} color="#34d399" />
          </div>
          {off.length > 0 && <div className="mt-2.5 space-y-1">{off.slice(0, 3).map((o) => (
            <button key={o.p.__fid} onClick={() => select({ layerId: o.l.id, fid: o.p.__fid }, true)} className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left text-[11.5px] hover:bg-white/[0.04]"><span className="flex items-center gap-2 text-slate-300"><span className="size-1.5 rounded-full bg-slate-500" />{o.p.__label}</span><span className="text-slate-500">Offline</span></button>
          ))}</div>}
        </div>
      )}
    </Panel>
  );
}
