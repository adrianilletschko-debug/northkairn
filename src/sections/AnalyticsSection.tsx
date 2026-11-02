import { ClipboardCopy, FileText, ScanLine, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { assetHealth, corridorStats, incidentStats, maintenanceForecast, roadCondition, trafficSegments } from '../analytics/compute';
import { filtersActive } from '../geo/filters';
import { fmt1, fmtInt } from '../lib/utils';
import { useStore } from '../state/store';
import { COND_COLORS } from '../theme/colors';
import { Button } from '../components/ui/button';
import { Badge, Empty, Panel, PanelHeader, Stat, SyntheticTag } from '../components/ui/misc';
import { CongestionBar } from '../components/panels/Panels';
import { copyWithToast, ownProps, SectionShell, toCSV } from './common';

export function AnalyticsSection() {
  const layers = useStore((s) => s.layers); const filters = useStore((s) => s.filters); const alignment = useStore((s) => s.alignment); const v = useStore((s) => s.dataVersion);
  const corridor = useStore((s) => s.corridor); const setCorridor = useStore((s) => s.setCorridor); const setTool = useStore((s) => s.setTool); const tool = useStore((s) => s.tool); const select = useStore((s) => s.select); const flyTo = useStore((s) => s.flyTo);
  const [draft, setDraft] = useState<{ a: string; b: string; buf: string }>({ a: '', b: '', buf: '500' });
  const k0 = alignment?.km0 ?? 0, k1 = alignment?.kmEnd ?? 0;
  const cs = useMemo(() => (corridor ? corridorStats(layers, filters, corridor.a, corridor.b, corridor.bufferM) : null), [corridor, layers, filters, v]);
  const synthetic = layers.some((l) => l.synthetic);

  const run = (a: number, b: number, buf: number) => {
    if (!alignment) return;
    const A = Math.max(k0, Math.min(k1, Math.min(a, b))), B = Math.max(k0, Math.min(k1, Math.max(a, b)));
    if (!(B > A)) { useStore.getState().toast('warning', `Enter a valid chainage range within Km ${k0.toFixed(1)}–${k1.toFixed(1)}.`); return; }
    setCorridor({ a: A, b: B, bufferM: Math.max(10, buf) });
    const pts = alignment.slice(A, B); flyTo({ bbox: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))] });
  };

  const report = () => {
    const h = assetHealth(layers, filters), r = roadCondition(layers, filters), t = trafficSegments(layers, filters), i = incidentStats(layers, filters, 24 * 7), m = maintenanceForecast(layers, filters);
    const L: string[] = [];
    L.push(`# NORTHKAIRN corridor report — ${alignment?.name ?? 'Loaded datasets'}`, `Generated ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })} IST${filtersActive(filters) ? ' · filters applied' : ''}`);
    if (synthetic) L.push('', '> Contains SYNTHETIC demonstration data for a fictional corridor. Not real infrastructure data.');
    L.push('', '## Asset health', `- Assets assessed: ${h.assessed} of ${h.total}`, `- Good or better: ${h.overall ?? 'n/a'}%`, `- Need inspection: ${h.needInspection}`, `- Critical assets: ${h.critical}`, ...h.rows.map((x) => `  - ${x.category}: ${x.pct}% good (${x.good}/${x.assessed})`));
    L.push('', '## Road condition', ...Object.entries(r.km).filter(([, v]) => v > 0).map(([k, v]) => `- ${k}: ${fmt1(v)} km`), r.avgPci !== null ? `- Average PCI: ${fmt1(r.avgPci)}` : '');
    if (t.avgSpeed !== null) L.push('', '## Traffic', `- Average volume: ${fmtInt(t.avgVolume!)} veh/h`, `- Average speed: ${fmt1(t.avgSpeed)} km/h`, ...Object.entries(t.dist).map(([k, v]) => `- ${k} congestion: ${fmt1(v)} km`));
    L.push('', '## Incidents (last 7 days)', ...Object.entries(i.counts).filter(([, v]) => v > 0).map(([k, v]) => `- ${k}: ${v}`), `- Currently open: ${i.open}`);
    L.push('', '## Maintenance', `- Open tasks: ${m.open}`, `- Scheduled: ${m.scheduled}`, `- Overdue: ${m.overdue}`, `- Inspections due in 90 days: ${m.upcomingInspections}`);
    if (cs && corridor) {
      L.push('', `## Corridor analysis: Km ${corridor.a.toFixed(2)} – ${corridor.b.toFixed(2)} (±${corridor.bufferM} m)`, `- Length: ${fmt1(cs.lengthKm)} km`, `- Road segments: ${cs.roadCount}${cs.avgPci !== null ? `, average PCI ${fmt1(cs.avgPci)}` : ''}`, `- Open defects: ${cs.defects.length}`, `- Incidents: ${cs.incidents.length}`, `- Maintenance works: ${cs.works.length}`, ...cs.byCat.map(([c, n]) => `- ${c}: ${n}`));
      if (cs.flagged.length) L.push('', '### Flagged assets', ...cs.flagged.slice(0, 30).map(({ p }) => `- ${p.__label} — ${p.__cond}${p.__risk !== 'Unknown' ? `, risk ${p.__risk}` : ''}${p.__maint !== 'Unknown' ? `, ${p.__maint}` : ''}${typeof p.__km === 'number' ? ` (Km ${p.__km.toFixed(1)})` : ''}`));
    }
    return L.filter((x) => x !== undefined).join('\n');
  };

  return (
    <SectionShell title="Analytics & Reports" sub={<span className="flex items-center gap-1.5">Computed live from the loaded GeoJSON{synthetic && <SyntheticTag />}</span>}
      right={<Button size="sm" variant="secondary" disabled={!layers.length} onClick={() => copyWithToast(report(), 'Markdown report')}><FileText className="size-3.5" />Copy report</Button>}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <Panel>
          <PanelHeader title="Corridor analysis" sub={alignment ? `Select a highway section on ${alignment.name} (Km ${k0.toFixed(1)}–${k1.toFixed(1)})` : 'Needs a road or highway LineString layer'} right={corridor ? <Button size="iconSm" variant="ghost" aria-label="Clear corridor" onClick={() => setCorridor(null)}><X /></Button> : undefined} />
          {!alignment ? <Empty title="No highway alignment">Load a road-segment or highway layer to analyse sections.</Empty> : (
            <div className="space-y-3 px-4 pb-4 pt-3">
              <div className="grid grid-cols-3 gap-2">
                {([['a', 'From Km'], ['b', 'To Km'], ['buf', 'Buffer (m)']] as const).map(([k, label]) => (
                  <label key={k} className="text-[11px] text-slate-500">{label}
                    <input inputMode="decimal" value={draft[k]} placeholder={k === 'a' ? (corridor?.a.toFixed(1) ?? `${Math.round(k0 + 40)}`) : k === 'b' ? (corridor?.b.toFixed(1) ?? `${Math.round(k0 + 55)}`) : '500'} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                      className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 text-[12.5px] tabular-nums text-slate-100 focus:border-cyan-400/50 focus:outline-none" />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => run(Number(draft.a || corridor?.a || k0 + 40), Number(draft.b || corridor?.b || k0 + 55), Number(draft.buf || 500))}>Analyse section</Button>
                <Button size="sm" variant={tool === 'corridor' ? 'outline' : 'secondary'} onClick={() => setTool('corridor')}><ScanLine className="size-3.5" />{tool === 'corridor' ? 'Picking on map…' : 'Pick on map'}</Button>
                <Button size="sm" variant="ghost" onClick={() => run(k0, k1, Number(draft.buf || 500))}>Whole corridor</Button>
              </div>
              {cs && corridor && (
                <div className="nk-fade space-y-3 pt-1">
                  <div className="text-[12px] text-violet-200">Km {corridor.a.toFixed(2)} – {corridor.b.toFixed(2)} · {fmt1(cs.lengthKm)} km · ±{corridor.bufferM} m</div>
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Avg PCI" value={cs.avgPci !== null ? fmt1(cs.avgPci) : '—'} sub={`${cs.roadCount} segments`} />
                    <Stat label="Open defects" value={cs.defects.length} color={cs.defects.length ? '#f97316' : undefined} />
                    <Stat label="Incidents" value={cs.incidents.length} color={cs.incidents.length ? '#f87171' : undefined} sub={`${cs.works.length} works`} />
                  </div>
                  {cs.roadCount > 0 && (
                    <div>
                      <div className="mb-1 text-[10.5px] uppercase tracking-wider text-slate-500">Segment condition</div>
                      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full">{Object.entries(cs.cond).sort((a, b) => ['Excellent', 'Good', 'Fair', 'Poor', 'Critical', 'Unknown'].indexOf(a[0]) - ['Excellent', 'Good', 'Fair', 'Poor', 'Critical', 'Unknown'].indexOf(b[0])).map(([k, n]) => <div key={k} title={`${k}: ${n}`} style={{ flex: n, background: COND_COLORS[k] }} />)}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-[10.5px] text-slate-500">{Object.entries(cs.cond).map(([k, n]) => <span key={k}>{k} {n}</span>)}</div>
                    </div>
                  )}
                  {cs.avgVol !== null && <div className="text-[11.5px] text-slate-400">Traffic: avg {fmtInt(cs.avgVol)} veh/h at {fmt1(cs.avgSpeed!)} km/h</div>}
                  <div>
                    <div className="mb-1 text-[10.5px] uppercase tracking-wider text-slate-500">Features in corridor</div>
                    <div className="flex flex-wrap gap-1.5">{cs.byCat.map(([c, n]) => <Badge key={c} className="border-white/10 text-slate-300">{c} · {n}</Badge>)}</div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[10.5px] uppercase tracking-wider text-slate-500">Flagged assets ({cs.flagged.length})
                      <button className="flex items-center gap-1 normal-case tracking-normal text-cyan-300 hover:text-cyan-200" onClick={() => copyWithToast(toCSV(cs.inside.map(({ layer, p }) => ({ layer: layer.name, km: p.__km, ...ownProps(p) }))), `CSV of ${cs.inside.length} corridor features`)}><ClipboardCopy className="size-3" />Copy CSV</button></div>
                    {cs.flagged.length === 0 ? <div className="text-[11.5px] text-slate-500">No assets in poor/critical condition, high risk or overdue.</div> : (
                      <ul className="max-h-[220px] overflow-auto">{cs.flagged.map(({ layer, p }) => (
                        <li key={p.__fid}><button onClick={() => select({ layerId: layer.id, fid: p.__fid }, true)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[12px] hover:bg-white/[0.04]">
                          <span className="size-2 rounded-full" style={{ background: COND_COLORS[p.__cond] }} /><span className="flex-1 truncate text-slate-200">{p.__label}</span><span className="text-[11px] text-slate-500">{typeof p.__km === 'number' ? `Km ${p.__km.toFixed(1)}` : ''}</span>
                        </button></li>))}</ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>
        <Summary />
      </div>
    </SectionShell>
  );
}

function Summary() {
  const layers = useStore((s) => s.layers); const filters = useStore((s) => s.filters); const v = useStore((s) => s.dataVersion);
  const h = useMemo(() => assetHealth(layers, filters), [layers, filters, v]);
  const r = useMemo(() => roadCondition(layers, filters), [layers, filters, v]);
  const t = useMemo(() => trafficSegments(layers, filters), [layers, filters, v]);
  const m = useMemo(() => maintenanceForecast(layers, filters), [layers, filters, v]);
  return (
    <Panel>
      <PanelHeader title="Network KPIs" sub={filtersActive(filters) ? 'Filters applied' : 'All loaded data'} />
      <div className="grid grid-cols-2 gap-2 px-4 pb-4 pt-3">
        <Stat label="Assets good or better" value={h.overall !== null ? `${h.overall}%` : '—'} sub={`${h.assessed} assessed`} color="#4ade80" />
        <Stat label="Road length good+" value={r.goodPct !== null ? `${r.goodPct}%` : '—'} sub={r.avgPci !== null ? `Average PCI ${fmt1(r.avgPci)}` : undefined} />
        <Stat label="Avg traffic speed" value={t.avgSpeed !== null ? `${fmt1(t.avgSpeed)} km/h` : '—'} sub={t.avgVolume !== null ? `${fmtInt(t.avgVolume)} veh/h avg volume` : undefined} />
        <Stat label="Overdue items" value={m.overdue} color={m.overdue ? '#f87171' : undefined} sub={`${m.open} open tasks`} />
      </div>
      {t.lengthKm > 0 && <CongestionBar dist={t.dist} />}
    </Panel>
  );
}
