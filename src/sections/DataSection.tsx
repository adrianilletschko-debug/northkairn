import { CircleCheck, CircleX, Eye, EyeOff, FileUp, LocateFixed, Pencil, RefreshCw, Replace, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { KIND_LABELS } from '../geo/classify';
import type { GeoLayer } from '../geo/types';
import { cn, fmtInt, humanKey, relTime } from '../lib/utils';
import { useStore } from '../state/store';
import { DEMO_SETS } from '../data/demo';
import { Button } from '../components/ui/button';
import { Badge, Empty, Panel, PanelHeader, Segmented, SyntheticTag } from '../components/ui/misc';
import { Switch } from '../components/ui/switch';
import { SectionShell } from './common';

export function DataSection() {
  const layers = useStore((s) => s.layers); const history = useStore((s) => s.history); const importFiles = useStore((s) => s.importFiles);
  const loadDemo = useStore((s) => s.loadDemo); const removeDemo = useStore((s) => s.removeDemo); const demoSet = useStore((s) => s.demoSet);
  const [sel, setSel] = useState<string | null>(null); const [over, setOver] = useState(false); const [tab, setTab] = useState<'features' | 'issues'>('features');
  const input = useRef<HTMLInputElement>(null);
  const hasDemo = layers.some((l) => l.source === 'demo');
  const active = layers.find((l) => l.id === sel) ?? null;
  return (
    <SectionShell title="Data Management" sub="GeoJSON (RFC 7946) · EPSG:4326 / WGS84 · Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon, GeometryCollection">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void importFiles([...e.dataTransfer.files]); }}
          onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
          className={cn('flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-7 text-center transition-all', over ? 'border-cyan-300 bg-cyan-400/10' : 'border-white/[0.12] bg-white/[0.02] hover:border-cyan-400/50 hover:bg-white/[0.04]')}>
          <div className="mb-2 grid size-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Upload className="size-5" /></div>
          <div className="text-[14px] font-semibold text-white">Drop GeoJSON files here or click to browse</div>
          <div className="mt-1 text-[12px] text-slate-500">Multiple files supported · each file becomes its own layer · invalid features are listed, never silently dropped</div>
          <input ref={input} type="file" multiple accept=".geojson,.json,application/geo+json,application/json" hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void importFiles(f); }} />
        </div>

        <Panel>
          <PanelHeader title="Demonstration datasets" sub="Loaded through the same import pipeline as your files · one at a time" right={hasDemo ? <Button size="sm" variant="danger" onClick={removeDemo}>Remove demo</Button> : undefined} />
          <div className="space-y-2 px-4 pb-3.5 pt-2">
            {DEMO_SETS.map((d) => (
              <div key={d.id} className={cn('flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5', demoSet === d.id ? 'border-cyan-400/40 bg-cyan-400/[0.06]' : 'border-white/[0.06] bg-white/[0.02]')}>
                <div className="min-w-0"><div className="flex items-center gap-1.5 text-[12.5px] font-medium text-slate-100">{d.name}<SyntheticTag /></div><div className="mt-0.5 text-[11.5px] leading-relaxed text-slate-400">{d.description}</div></div>
                {demoSet === d.id ? <span className="shrink-0 text-[11px] text-cyan-300">Loaded</span> : <Button size="sm" onClick={() => loadDemo(d.id)}>Load</Button>}
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title={`Datasets (${layers.length})`} sub="Click a dataset to preview features and validation results" />
          {layers.length === 0 ? <Empty title="No datasets loaded" icon={<FileUp className="size-5" />}>Upload GeoJSON above or load the demo dataset.</Empty> : (
            <div className="overflow-x-auto px-1 pb-2 pt-1">
              <table className="nk-table">
                <thead><tr><th></th><th>Layer</th><th>Features</th><th className="text-right">Actions</th></tr></thead>
                <tbody>{[...layers].sort((a, b) => a.order - b.order).map((l) => <DatasetRow key={l.id} l={l} active={sel === l.id} onSelect={() => setSel(sel === l.id ? null : l.id)} />)}</tbody>
              </table>
            </div>
          )}
        </Panel>

        {active && (
          <Panel className="nk-fade">
            <PanelHeader title={active.name} sub={`${active.fileName} · ${KIND_LABELS[active.kind]} · imported ${relTime(active.importedAt)}`} right={<Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'features', label: 'Features' }, { value: 'issues', label: `Validation (${active.issues.length + active.rejected.length})` }]} />} />
            {tab === 'features' ? <FeatureTable l={active} /> : <Issues l={active} />}
          </Panel>
        )}

        <Panel>
          <PanelHeader title="Import history" sub="This session" />
          {history.length === 0 ? <Empty title="No imports yet" /> : (
            <ul className="max-h-[260px] overflow-auto px-3 pb-3 pt-1">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-2.5 border-b border-white/[0.04] py-2 text-[12px] last:border-0">
                  {h.ok ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" /> : <CircleX className="mt-0.5 size-3.5 shrink-0 text-red-400" />}
                  <div className="min-w-0 flex-1"><div className="truncate text-slate-200"><span className="mr-1.5 rounded bg-white/[0.06] px-1 py-px text-[10px] uppercase text-slate-400">{h.action}</span>{h.layerName ?? h.fileName}</div><div className={cn('text-[11px]', h.ok ? 'text-slate-500' : 'text-red-300')}>{h.summary}</div></div>
                  <span className="shrink-0 text-[10.5px] text-slate-500">{new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </SectionShell>
  );
}

function DatasetRow({ l, active, onSelect }: { l: GeoLayer; active: boolean; onSelect: () => void }) {
  const st = useStore.getState();
  const [editing, setEditing] = useState(false); const [name, setName] = useState(l.name); const [confirm, setConfirm] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const warn = l.stats.rejected + (l.issues.some((i) => i.level === 'warning') ? 1 : 0);
  return (
    <tr className={cn('clickable', active && 'active')} onClick={onSelect}>
      <td onClick={(e) => e.stopPropagation()}><Switch checked={l.visible} color={l.color} onCheckedChange={(v) => st.patchLayer(l.id, { visible: v })} label={`Toggle ${l.name}`} /></td>
      <td className="max-w-[220px]">
        {editing ? (
          <input autoFocus value={name} onClick={(e) => e.stopPropagation()} onChange={(e) => setName(e.target.value)} onBlur={() => { st.renameLayer(l.id, name); setEditing(false); }} onKeyDown={(e) => { if (e.key === 'Enter') { st.renameLayer(l.id, name); setEditing(false); } if (e.key === 'Escape') { setName(l.name); setEditing(false); } }}
            className="h-7 w-full rounded-md border border-cyan-400/40 bg-black/30 px-1.5 text-[12px] focus:outline-none" aria-label="Layer name" />
        ) : <div className="flex items-center gap-1.5 truncate font-medium text-slate-100"><span className="size-2 shrink-0 rounded-full" style={{ background: l.color }} />{l.name}</div>}
        <div className="flex items-center gap-1.5 truncate text-[10.5px] text-slate-500">{l.fileName}{l.synthetic && <SyntheticTag />}</div>
      </td>
      <td className="tabular-nums" title={Object.entries(l.stats.byGeometry).map(([k, v]) => `${v} ${k}`).join(', ') || 'no geometry'}><div>{fmtInt(l.stats.accepted)}</div><div className="mt-0.5">{l.stats.rejected ? <Badge color="#f87171">{l.stats.rejected} rejected</Badge> : warn ? <Badge color="#fbbf24"><TriangleAlert className="size-3" />warnings</Badge> : <Badge color="#4ade80">valid</Badge>}</div></td>
      <td className="text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end gap-0.5">
          <Button size="iconSm" variant="ghost" title="Zoom to layer" aria-label="Zoom to layer" disabled={!l.stats.bbox} onClick={() => l.stats.bbox && st.flyTo({ bbox: l.stats.bbox })}><LocateFixed /></Button>
          <Button size="iconSm" variant="ghost" title="Rename" aria-label="Rename layer" onClick={() => { setName(l.name); setEditing(true); }}><Pencil /></Button>
          <Button size="iconSm" variant="ghost" title="Reload & re-validate" aria-label="Reload layer" onClick={() => st.reloadLayer(l.id)}><RefreshCw /></Button>
          <Button size="iconSm" variant="ghost" title="Replace with another file" aria-label="Replace dataset" onClick={() => file.current?.click()}><Replace /></Button>
          {confirm ? <Button size="sm" variant="danger" onClick={() => st.removeLayer(l.id)}>Remove?</Button> : <Button size="iconSm" variant="ghost" title="Remove" aria-label="Remove layer" onClick={() => setConfirm(true)}><Trash2 /></Button>}
          <input ref={file} type="file" hidden accept=".geojson,.json" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void st.replaceLayer(l.id, f); }} />
        </div>
      </td>
    </tr>
  );
}

function FeatureTable({ l }: { l: GeoLayer }) {
  const select = useStore((s) => s.select); const selection = useStore((s) => s.selection);
  const [hideNull, setHideNull] = useState(false);
  const keys = useMemo(() => l.stats.propertyKeys.filter((k) => !['observations', 'inspection_history', 'images'].includes(k)).slice(0, 7), [l]);
  const rows = l.data.features.filter((f) => !hideNull || f.geometry).slice(0, 300);
  return (
    <div className="pb-2">
      <div className="flex items-center justify-between px-4 pt-2 text-[11px] text-slate-500">
        <span>{fmtInt(l.stats.accepted)} features · {l.stats.propertyKeys.length} attributes{l.stats.nonSpatial ? ` · ${l.stats.nonSpatial} without geometry` : ''}{l.data.features.length > 300 ? ' · first 300 shown' : ''}</span>
        {l.stats.nonSpatial > 0 && <button className="flex items-center gap-1 text-cyan-300" onClick={() => setHideNull(!hideNull)}>{hideNull ? <Eye className="size-3" /> : <EyeOff className="size-3" />}{hideNull ? 'Show' : 'Hide'} non-spatial</button>}
      </div>
      <div className="mt-1 max-h-[340px] overflow-auto px-1">
        <table className="nk-table">
          <thead><tr><th>#</th><th>Geometry</th>{keys.map((k) => <th key={k}>{humanKey(k)}</th>)}</tr></thead>
          <tbody>{rows.map((f, i) => (
            <tr key={f.properties!.__fid} className={cn('clickable', selection?.fid === f.properties!.__fid && 'active')} onClick={() => f.geometry && select({ layerId: l.id, fid: f.properties!.__fid }, true)}>
              <td className="text-slate-500">{i + 1}</td>
              <td>{f.geometry ? f.geometry.type : <span className="text-amber-300">null</span>}</td>
              {keys.map((k) => { const v = f.properties![k]; return <td key={k} className="max-w-[160px] truncate">{v === undefined || v === null ? <span className="text-slate-600">—</span> : typeof v === 'object' ? <span className="text-slate-500">{Array.isArray(v) ? `[${v.length}]` : '{…}'}</span> : String(v).startsWith('data:') ? '[data]' : String(v)}</td>; })}
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function Issues({ l }: { l: GeoLayer }) {
  if (!l.issues.length && !l.rejected.length) return <Empty title="No validation issues" icon={<CircleCheck className="size-5 text-emerald-400" />}>All {fmtInt(l.stats.total)} features passed validation.</Empty>;
  const color = { error: '#f87171', warning: '#fbbf24', info: '#38bdf8' } as const;
  return (
    <div className="space-y-3 px-4 pb-4 pt-2">
      <ul className="space-y-1.5">{l.issues.slice(0, 50).map((i, k) => <li key={k} className="flex gap-2 text-[12px]"><span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: color[i.level] }} /><span className="text-slate-300">{i.message}</span></li>)}</ul>
      {l.issues.length > 50 && <div className="text-[11px] text-slate-500">…and {l.issues.length - 50} more messages.</div>}
      {l.rejected.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-slate-500">Rejected features ({l.rejected.length})</div>
          <div className="max-h-[260px] overflow-auto rounded-lg border border-red-400/20">
            {l.rejected.slice(0, 200).map((r) => (
              <div key={r.index} className="border-b border-white/[0.04] px-3 py-2 text-[11.5px] last:border-0">
                <div className="text-red-300">Feature #{r.index}: {r.reason}</div>
                <code className="mt-0.5 block truncate text-[10.5px] text-slate-500">{r.snippet}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
