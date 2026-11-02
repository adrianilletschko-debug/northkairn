import { ChevronDown, ChevronLeft, Eye, EyeOff, Info, Layers, LocateFixed, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { KIND_LABELS } from '../geo/classify';
import type { GeoLayer } from '../geo/types';
import { cn, fmtInt } from '../lib/utils';
import { useStore } from '../state/store';
import { COND_COLORS, TRAFFIC_COLORS } from '../theme/colors';
import { Button } from './ui/button';
import { Segmented, SyntheticTag } from './ui/misc';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';

export function LayerPanel() {
  const layers = useStore((s) => s.layers);
  const open = useStore((s) => s.layerPanelOpen); const setOpen = useStore((s) => s.setLayerPanelOpen);
  const view = useStore((s) => s.view); const setView = useStore((s) => s.setView); const setHeatmap = useStore((s) => s.setHeatmap);
  const setAllLayersVisible = useStore((s) => s.setAllLayersVisible);
  const priority = useStore((s) => s.priority); const setPriorityShowLayer = useStore((s) => s.setPriorityShowLayer);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<'layers' | 'overlays'>('layers');
  const file = useRef<HTMLInputElement>(null);
  const ordered = [...layers].reverse();
  const allVisible = layers.length > 0 && layers.every((l) => l.visible);

  if (!open) return (
    <button onClick={() => setOpen(true)} className="nk-glass flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] text-slate-200 hover:text-white" aria-label="Show layers">
      <Layers className="size-4 text-cyan-300" /> Layers <span className="text-slate-500">{layers.length}</span>
    </button>
  );

  return (
    <div className="nk-glass nk-fade flex max-h-full w-[300px] flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'layers', label: `Layers · ${layers.length}` }, { value: 'overlays', label: 'Overlays' }]} />
        <div className="flex gap-0.5">
          {tab === 'layers' && layers.length > 0 && (
            <Button size="iconSm" variant="ghost" aria-label={allVisible ? 'Hide all layers' : 'Show all layers'} title={allVisible ? 'Hide all layers' : 'Show all layers'} onClick={() => setAllLayersVisible(!allVisible)}>
              {allVisible ? <Eye /> : <EyeOff />}
            </Button>
          )}
          <Button size="iconSm" variant="ghost" aria-label="Upload GeoJSON layer" title="Upload GeoJSON" onClick={() => file.current?.click()}><Plus /></Button>
          <Button size="iconSm" variant="ghost" aria-label="Collapse layer panel" title="Collapse" onClick={() => setOpen(false)}><ChevronLeft /></Button>
        </div>
        <input ref={file} type="file" accept=".geojson,.json,application/geo+json,application/json" multiple hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void useStore.getState().importFiles(fs); }} />
      </div>
      {tab === 'layers' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {ordered.length === 0 && <div className="px-3 py-6 text-center text-[12px] text-slate-500">No layers yet. Drop GeoJSON files on the map or load the demo corridor in Data Management.</div>}
          {ordered.map((l) => <LayerRow key={l.id} l={l} expanded={expanded === l.id} onToggle={() => setExpanded(expanded === l.id ? null : l.id)} />)}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-1">
          <div>
            <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-slate-500">Road segment styling</div>
            <Segmented size="sm" value={view.roadStyle} onChange={(v) => setView({ roadStyle: v })} options={[{ value: 'default', label: 'Layer colour' }, { value: 'condition', label: 'Condition' }, { value: 'traffic', label: 'Traffic' }]} />
            <Legend mode={view.roadStyle} />
          </div>
          <div>
            <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-slate-500">Heatmaps</div>
            {([['traffic', 'Traffic density', '#f97316'], ['accidents', 'Accident concentration', '#ef4444'], ['defects', 'Road defects', '#fb923c'], ['flood', 'Flood risk', '#8b5cf6']] as const).map(([k, label, c]) => (
              <Row key={k} label={label}><Switch color={c} checked={view.heatmaps[k]} onCheckedChange={(v) => setHeatmap(k, v)} label={label} /></Row>
            ))}
          </div>
          <div>
            <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-slate-500">Prioritization</div>
            <Row label="Priority ranking"><Switch color="#ef4444" checked={priority.showLayer} onCheckedChange={setPriorityShowLayer} label="Priority ranking" /></Row>
            {priority.showLayer && <div className="pb-1.5 text-[10.5px] leading-relaxed text-slate-500">Top-10 segments in red/orange, rest in blue/grey. Set the budget and weighting in Prioritization.</div>}
          </div>
          <div>
            <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-slate-500">Live view</div>
            <Row label="Animated traffic (simulated)"><Switch checked={view.vehicles} onCheckedChange={(v) => setView({ vehicles: v })} label="Animated traffic" /></Row>
            <Row label="Risk callouts on map"><Switch checked={view.callouts} onCheckedChange={(v) => setView({ callouts: v })} label="Risk callouts" /></Row>
            <Row label="Kilometre labels"><Switch checked={view.kmLabels} onCheckedChange={(v) => setView({ kmLabels: v })} label="Kilometre labels" /></Row>
            <Row label="3D buildings & bridges"><Switch checked={view.extrude} onCheckedChange={(v) => setView({ extrude: v })} label="3D extrusions" /></Row>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between py-1.5 text-[12.5px] text-slate-300">{label}{children}</div>;
}

export function Legend({ mode }: { mode: 'default' | 'condition' | 'traffic' }) {
  if (mode === 'default') return null;
  const t = mode === 'condition' ? COND_COLORS : TRAFFIC_COLORS;
  return <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{Object.entries(t).filter(([k]) => k !== 'Unknown').map(([k, c]) => <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-400"><span className="h-1 w-3.5 rounded-full" style={{ background: c }} />{k}</span>)}</div>;
}

function LayerRow({ l, expanded, onToggle }: { l: GeoLayer; expanded: boolean; onToggle: () => void }) {
  const patch = useStore((s) => s.patchLayer); const remove = useStore((s) => s.removeLayer); const flyTo = useStore((s) => s.flyTo);
  const [confirm, setConfirm] = useState(false);
  const issues = l.issues.filter((i) => i.level !== 'info').length + (l.rejected.length ? 1 : 0);
  return (
    <div className={cn('rounded-xl transition-colors', expanded ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]')}>
      <div className="flex cursor-pointer items-center gap-2.5 px-2 py-2" onClick={onToggle}>
        <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: l.color, opacity: l.visible ? 1 : 0.3, boxShadow: l.visible ? `0 0 8px ${l.color}` : undefined }} />
        <div className="min-w-0 flex-1">
          <div className={cn('flex items-center gap-1.5 truncate text-[12.5px]', l.visible ? 'text-slate-100' : 'text-slate-500')}>{l.name}{issues > 0 && <TriangleAlert className="size-3 shrink-0 text-amber-400" />}</div>
          <div className="text-[10.5px] text-slate-500">{fmtInt(l.stats.accepted)} features{l.cluster ? ' · clustered' : ''}</div>
        </div>
        <ChevronDown className={cn('size-3.5 text-slate-600 transition-transform', expanded && 'rotate-180')} />
        <Switch checked={l.visible} onCheckedChange={(v) => patch(l.id, { visible: v })} label={`Toggle ${l.name}`} color={l.color} />
      </div>
      {expanded && (
        <div className="nk-fade space-y-2.5 px-3 pb-3 pt-0.5 text-[11.5px]">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-slate-400">Colour
              <input type="color" value={l.color} onChange={(e) => patch(l.id, { color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent p-0" aria-label="Layer colour" />
            </label>
            <div className="flex flex-1 items-center gap-2 text-slate-400">Opacity<Slider value={l.opacity} min={0.05} max={1} step={0.05} onChange={(v) => patch(l.id, { opacity: v })} label="Layer opacity" /><span className="w-8 text-right tabular-nums">{Math.round(l.opacity * 100)}%</span></div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2 leading-relaxed text-slate-400">
            <div className="mb-1 flex items-center gap-1.5 text-slate-300"><Info className="size-3" /> {KIND_LABELS[l.kind]} {l.synthetic && <SyntheticTag />}</div>
            <div className="truncate">File: <span className="text-slate-300">{l.fileName}</span></div>
            <div>Geometry: <span className="text-slate-300">{Object.entries(l.stats.byGeometry).map(([k, v]) => `${v} ${k}`).join(', ') || '—'}</span></div>
            {(l.stats.rejected > 0 || l.stats.nonSpatial > 0) && <div className="text-amber-300">{l.stats.rejected ? `${l.stats.rejected} rejected` : ''}{l.stats.rejected && l.stats.nonSpatial ? ' · ' : ''}{l.stats.nonSpatial ? `${l.stats.nonSpatial} without geometry` : ''} — see Data Management</div>}
            {l.description && <div className="mt-1 text-slate-500">{l.description}</div>}
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" disabled={!l.stats.bbox} onClick={() => l.stats.bbox && flyTo({ bbox: l.stats.bbox })}><LocateFixed className="size-3.5" />Zoom to layer</Button>
            {!confirm ? <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}><Trash2 className="size-3.5" />Remove</Button>
              : <Button size="sm" variant="danger" onClick={() => remove(l.id)}>Confirm remove</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
