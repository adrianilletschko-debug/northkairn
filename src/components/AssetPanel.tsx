import { area as turfArea, length as turfLength } from '@turf/turf';
import { ClipboardCopy, History, Image as ImageIcon, LocateFixed, MapPin, TriangleAlert, Wrench, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getProp, isSubPart } from '../geo/classify';
import { geometryBbox, representativePoint } from '../geo/ingest';
import type { GeoLayer } from '../geo/types';
import { copyText, fmtDate, humanKey, relTime } from '../lib/utils';
import { getFeature, useStore } from '../state/store';
import { COND_COLORS, MAINT_COLORS, RISK_COLORS } from '../theme/colors';
import { Button } from './ui/button';
import { Badge, SyntheticTag } from './ui/misc';

const NA = <span className="text-slate-600">Not available</span>;

export function AssetPanel() {
  const selection = useStore((s) => s.selection); const layers = useStore((s) => s.layers); const select = useStore((s) => s.select); const flyTo = useStore((s) => s.flyTo); const toast = useStore((s) => s.toast);
  const hit = getFeature(layers, selection);
  const related = useMemo(() => (hit ? relatedItems(layers, hit.layer, hit.feature.properties!) : []), [hit?.feature, layers]);
  const [showAll, setShowAll] = useState(true);
  if (!hit) return null;
  const { layer, feature } = hit; const p = feature.properties!; const g = feature.geometry as any;
  const rp = representativePoint(g);
  const val = (names: string[], render?: (v: any) => React.ReactNode) => { const v = getProp(p, names); return v === undefined ? NA : render ? render(v) : String(v); };
  const condition = getProp(p, ['condition', 'condition_class', 'pavement_condition', 'status', 'severity']);
  const metrics: string[] = [];
  if (g?.type?.includes('LineString')) metrics.push(`${(turfLength({ type: 'Feature', geometry: g, properties: {} } as any) * 1000).toLocaleString('en-IN', { maximumFractionDigits: 0 })} m long`);
  if (g?.type?.includes('Polygon')) { const a = turfArea({ type: 'Feature', geometry: g, properties: {} } as any); metrics.push(a > 20000 ? `${(a / 10000).toFixed(2)} ha` : `${a.toLocaleString('en-IN', { maximumFractionDigits: 0 })} m²`); }
  const history = Array.isArray(p.inspection_history) ? p.inspection_history : null;
  const imgs = ([] as string[]).concat(...['images', 'image', 'photo', 'image_url', 'photo_url'].map((k) => p[k]).filter(Boolean)).filter((x) => typeof x === 'string');
  const obs = Array.isArray(p.observations) ? p.observations : null;
  const ownProps = Object.entries(p).filter(([k]) => !k.startsWith('__') && !['inspection_history', 'observations', 'images', 'image'].includes(k));

  return (
    <div className="nk-glass nk-fade flex max-h-full w-[372px] flex-col overflow-hidden rounded-2xl">
      <div className="border-b border-white/[0.06] px-4 pb-3 pt-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-cyan-300/80">Asset information</div>
            <div className="mt-1 text-[16px] font-semibold leading-snug tracking-tight text-white">{p.__label}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-400">{String(getProp(p, ['asset_type', 'type', 'category']) ?? layer.name)} · {layer.name}{layer.synthetic && <SyntheticTag />}</div>
          </div>
          <Button size="iconSm" variant="ghost" aria-label="Close asset panel" onClick={() => select(null)}><X /></Button>
        </div>
        <div className="mt-3 flex gap-1.5">
          <Button size="sm" variant="secondary" disabled={!g} onClick={() => { const bb = geometryBbox(g); if (bb) flyTo({ bbox: bb }); }}><LocateFixed className="size-3.5" /> Zoom to asset</Button>
          <Button size="sm" variant="ghost" disabled={!rp} onClick={async () => { if (rp && (await copyText(`${rp[1].toFixed(6)}, ${rp[0].toFixed(6)}`))) toast('success', 'Coordinates copied'); else toast('warning', 'Clipboard not available in this view.'); }}><ClipboardCopy className="size-3.5" /> Copy coordinates</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3.5 text-[12.5px]">
        <dl className="grid grid-cols-[128px_1fr] gap-x-3 gap-y-2">
          <dt className="text-slate-500">Asset ID</dt><dd className="font-medium text-slate-100">{val(['asset_id', 'segment_id', 'incident_id', 'defect_id', 'work_order', 'camera_id', 'sensor_id', 'building_id', 'parcel_id', 'zone_id', 'boundary_id', 'marker_id', 'feature_id', 'id'])}</dd>
          <dt className="text-slate-500">Asset type</dt><dd className="text-slate-200">{val(['asset_type', 'type', 'category', 'class'])}</dd>
          <dt className="text-slate-500">Location</dt><dd className="text-slate-200">{val(['location'], (v) => v)}</dd>
          <dt className="text-slate-500">Condition</dt><dd>{condition === undefined ? NA : <Badge color={COND_COLORS[p.__cond]}>{String(condition)}</Badge>}</dd>
          <dt className="text-slate-500">Last inspection</dt><dd className="text-slate-200">{val(['last_inspection', 'last_inspected', 'inspection_date'], fmtDate)}</dd>
          <dt className="text-slate-500">Maintenance status</dt><dd>{getProp(p, ['maintenance_status', 'maint_status', 'work_status']) === undefined ? NA : <Badge color={MAINT_COLORS[p.__maint]}>{String(getProp(p, ['maintenance_status', 'maint_status', 'work_status']))}</Badge>}</dd>
          <dt className="text-slate-500">Risk level</dt><dd>{getProp(p, ['risk_level', 'risk', 'risk_category']) === undefined ? NA : <Badge color={RISK_COLORS[p.__risk]}>{String(getProp(p, ['risk_level', 'risk', 'risk_category']))}</Badge>}</dd>
        </dl>

        <Section icon={<MapPin className="size-3.5" />} title="Geographic">
          <dl className="grid grid-cols-[128px_1fr] gap-x-3 gap-y-1.5 text-[12px]">
            <dt className="text-slate-500">Coordinates</dt><dd className="tabular-nums text-slate-200">{rp ? `${rp[1].toFixed(6)}° N, ${rp[0].toFixed(6)}° E` : 'No geometry'}</dd>
            <dt className="text-slate-500">Geometry</dt><dd className="text-slate-200">{g ? `${g.type}${metrics.length ? ' · ' + metrics.join(' · ') : ''}` : 'None (non-spatial feature)'}</dd>
            {typeof p.__km === 'number' && <><dt className="text-slate-500">Chainage</dt><dd className="tabular-nums text-slate-200">Km {p.__km.toFixed(2)}{typeof p.__off === 'number' && p.__off !== 0 ? ` · ${Math.abs(p.__off)} m ${p.__off > 0 ? 'right' : 'left'} of centreline` : ''}{!p.__kmFromAttr && <span className="text-slate-500"> (derived)</span>}</dd></>}
            {p.__district && <><dt className="text-slate-500">District</dt><dd className="text-slate-200">{p.__district}</dd></>}
          </dl>
        </Section>

        {imgs.length > 0 && (
          <Section icon={<ImageIcon className="size-3.5" />} title="Associated images">
            <div className="space-y-2">{imgs.map((src, i) => <ImageItem key={i} src={src} />)}</div>
          </Section>
        )}

        {obs && obs.length > 0 && <Readings obs={obs} />}

        {history && (
          <Section icon={<History className="size-3.5" />} title={`Inspection history (${history.length})`}>
            <ol className="relative space-y-2.5 border-l border-white/10 pl-3.5">
              {history.map((h: any, i: number) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[18.5px] top-1 size-2 rounded-full bg-cyan-300 shadow-[0_0_6px_#67e8f9]" />
                  <div className="flex items-center justify-between text-[12px]"><span className="text-slate-200">{fmtDate(h.date ?? h.inspection_date)}</span>{h.rating !== undefined && <span className="text-[11px] text-slate-400">Rating {h.rating}</span>}</div>
                  <div className="text-[11px] text-slate-500">{[h.type, h.inspector].filter(Boolean).join(' · ')}</div>
                  {h.notes && <div className="text-[11.5px] text-slate-300">{h.notes}</div>}
                </li>
              ))}
            </ol>
          </Section>
        )}

        {related.filter((r) => r.kind === 'work').length > 0 && (
          <Section icon={<Wrench className="size-3.5" />} title="Maintenance">
            {related.filter((r) => r.kind === 'work').map((r) => <RelatedRow key={r.fid} r={r} />)}
          </Section>
        )}

        <Section icon={<TriangleAlert className="size-3.5" />} title="Related alerts">
          {related.filter((r) => r.kind !== 'work').length ? related.filter((r) => r.kind !== 'work').slice(0, 8).map((r) => <RelatedRow key={r.fid} r={r} />) : <div className="text-[11.5px] text-slate-500">No incidents, defects or alerts linked to this asset or within ±500 m.</div>}
        </Section>

        <div>
          <button onClick={() => setShowAll(!showAll)} className="mb-1.5 flex w-full items-center justify-between text-[11px] font-medium uppercase tracking-wider text-slate-500 hover:text-slate-300">All GeoJSON properties ({ownProps.length}) <span>{showAll ? 'Hide' : 'Show'}</span></button>
          {showAll && (
            <div className="overflow-hidden rounded-lg border border-white/[0.06]">
              {ownProps.length === 0 && <div className="px-3 py-2 text-[11.5px] text-slate-500">This feature has no properties.</div>}
              {ownProps.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[128px_1fr] gap-2 border-b border-white/[0.04] px-2.5 py-1.5 text-[11.5px] last:border-0">
                  <div className="truncate text-slate-500" title={k}>{humanKey(k)}</div>
                  <div className="break-words text-slate-200">{renderValue(v)}</div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10.5px] text-slate-600">Values shown exactly as stored in {layer.fileName}. Missing attributes are reported as “Not available”.</p>
        </div>
      </div>
    </div>
  );
}

function renderValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-slate-600">—</span>;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString('en-IN', { maximumFractionDigits: 6 });
  if (typeof v === 'string') return /^data:image\//.test(v) ? '[embedded image]' : /^\d{4}-\d{2}-\d{2}/.test(v) ? fmtDate(v) : v;
  if (Array.isArray(v)) return v.length > 4 ? `[${v.length} items]` : JSON.stringify(v);
  return <code className="text-[10.5px] text-slate-400">{JSON.stringify(v)}</code>;
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div><div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">{icon}{title}</div>{children}</div>;
}

function ImageItem({ src }: { src: string }) {
  const [err, setErr] = useState(false);
  if (err) return <a href={src} target="_blank" rel="noreferrer" className="block truncate text-[11.5px] text-cyan-300 underline">{src}</a>;
  return <img src={src} alt="Asset" onError={() => setErr(true)} className="w-full rounded-lg border border-white/[0.06]" />;
}

function Readings({ obs }: { obs: any[] }) {
  const data = obs.map((o) => ({ t: String(o.t ?? o.timestamp ?? '').slice(11, 16), v: Number(o.volume_vph ?? o.volume ?? o.count), s: Number(o.avg_speed_kmh ?? o.speed) })).filter((d) => Number.isFinite(d.v));
  if (!data.length) return null;
  const last = data[data.length - 1];
  return (
    <Section icon={<History className="size-3.5" />} title={`Sensor readings · ${obs.length} observations`}>
      <div className="h-[110px] rounded-lg border border-white/[0.06] bg-black/20 p-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <defs><linearGradient id="obsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22d3ee" stopOpacity={0.45} /><stop offset="1" stopColor="#22d3ee" stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} interval={5} />
            <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: '#0b1426', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, fontSize: 11 }} formatter={(v: any, n: any) => [n === 'v' ? `${v} veh/h` : `${v} km/h`, n === 'v' ? 'Volume' : 'Speed']} />
            <Area type="monotone" dataKey="v" stroke="#22d3ee" strokeWidth={1.8} fill="url(#obsg)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">Latest stored observation {last.t}: {last.v.toLocaleString('en-IN')} veh/h{Number.isFinite(last.s) ? ` · ${last.s} km/h` : ''}</div>
    </Section>
  );
}

interface Related { fid: string; lid: string; title: string; sub: string; kind: 'incident' | 'defect' | 'work' | 'alert'; color: string }
function RelatedRow({ r }: { r: Related }) {
  const select = useStore((s) => s.select);
  return (
    <button onClick={() => select({ layerId: r.lid, fid: r.fid }, true)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04]">
      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: r.color, boxShadow: `0 0 6px ${r.color}` }} />
      <span className="min-w-0"><span className="block truncate text-[12px] text-slate-200">{r.title}</span><span className="block truncate text-[11px] text-slate-500">{r.sub}</span></span>
    </button>
  );
}

function relatedItems(layers: GeoLayer[], layer: GeoLayer, p: Record<string, any>): Related[] {
  const id = getProp(p, ['asset_id', 'segment_id']); const out: Related[] = [];
  const km = typeof p.__km === 'number' ? p.__km : null;
  const near = (q: Record<string, any>) => km !== null && typeof q.__km === 'number' && Math.abs(q.__km - km) <= 0.5 && Math.abs((q.__off ?? 0) - (p.__off ?? 0)) <= 400;
  for (const l of layers) {
    if (!['incident', 'defect', 'maintenance'].includes(l.kind)) continue;
    for (const f of l.data.features) {
      const q = f.properties!; if (q.__fid === p.__fid || isSubPart(q)) continue;
      const linked = id !== undefined && (q.related_asset_id === id || q.asset_ref === id || q.part_of === id);
      if (!linked && !(l.kind === 'maintenance' ? (km !== null && typeof q.km_start === 'number' && km >= q.km_start - 0.2 && km <= q.km_end + 0.2) : near(q))) continue;
      if (layer.kind === 'landuse' || layer.kind === 'boundary') continue;
      if (l.kind === 'maintenance') out.push({ fid: q.__fid, lid: l.id, title: String(q.work_type ?? q.__label), sub: `${q.work_order ?? ''} · ${q.maintenance_status ?? q.status ?? ''} · ${fmtDate(q.start_date)} → ${fmtDate(q.end_date)}`, kind: 'work', color: MAINT_COLORS[q.__maint] });
      else if (l.kind === 'incident') out.push({ fid: q.__fid, lid: l.id, title: `${q.incident_type ?? 'Incident'} · ${q.status ?? ''}`, sub: `${q.location ?? ''} · ${relTime(q.reported_at)}`, kind: 'incident', color: q.status === 'Cleared' ? '#64748b' : '#ef4444' });
      else out.push({ fid: q.__fid, lid: l.id, title: `${q.defect_type ?? 'Defect'} · ${q.severity ?? ''}`, sub: `${q.location ?? ''} · ${q.status ?? ''}`, kind: 'defect', color: COND_COLORS[q.__cond] });
    }
  }
  return out;
}
