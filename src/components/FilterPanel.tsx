import { SlidersHorizontal, X } from 'lucide-react';
import { useMemo } from 'react';
import { CONTEXT_KINDS } from '../geo/classify';
import { filteredFeatures, filtersActive } from '../geo/filters';
import { CONDITIONS, MAINT_STATUSES, RISKS } from '../geo/types';
import { fmtInt } from '../lib/utils';
import { useStore } from '../state/store';
import { COND_COLORS, MAINT_COLORS, RISK_COLORS } from '../theme/colors';
import { Button } from './ui/button';
import { Chip } from './ui/misc';
import { RangeSlider } from './ui/slider';

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function FilterButton() {
  const filters = useStore((s) => s.filters); const open = useStore((s) => s.filterPanelOpen); const setOpen = useStore((s) => s.setFilterPanelOpen);
  const n = filters.categories.length + filters.conditions.length + filters.risks.length + filters.maint.length + (filters.kmRange ? 1 : 0) + (filters.district ? 1 : 0);
  return (
    <Button variant={open || n ? 'secondary' : 'ghost'} onClick={() => setOpen(!open)} className={n ? 'border-cyan-400/40 text-cyan-100' : ''} aria-expanded={open}>
      <SlidersHorizontal /> Filters {n > 0 && <span className="grid size-5 place-items-center rounded-full bg-cyan-400 text-[10px] font-bold text-slate-950">{n}</span>}
    </Button>
  );
}

export function FilterPanel() {
  const open = useStore((s) => s.filterPanelOpen); const setOpen = useStore((s) => s.setFilterPanelOpen);
  const filters = useStore((s) => s.filters); const setFilters = useStore((s) => s.setFilters); const clear = useStore((s) => s.clearFilters);
  const layers = useStore((s) => s.layers); const alignment = useStore((s) => s.alignment);
  const categories = useMemo(() => { const s = new Set<string>(); for (const l of layers) if (!CONTEXT_KINDS.includes(l.kind)) for (const f of l.data.features) s.add(f.properties!.__cat); return [...s].sort(); }, [layers]);
  const districts = useMemo(() => layers.filter((l) => l.kind === 'boundary').flatMap((l) => l.data.features.map((f) => String(f.properties!.name ?? f.properties!.__label))), [layers]);
  const counts = useMemo(() => {
    if (!open) return null;
    const all = layers.reduce((s, l) => s + l.data.features.length, 0);
    return { all, match: filteredFeatures(layers, filters).length };
  }, [open, layers, filters]);
  if (!open) return null;
  const kmMin = alignment ? Math.floor(alignment.km0) : 0, kmMax = alignment ? Math.ceil(alignment.kmEnd) : 100;
  return (
    <div className="nk-glass-strong nk-fade absolute right-6 top-[60px] z-40 w-[420px] rounded-2xl p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div><div className="text-[14px] font-semibold">Filters</div><div className="text-[11px] text-slate-500">Applied to the map, tables and every analytics panel{counts ? ` · ${fmtInt(counts.match)} of ${fmtInt(counts.all)} features` : ''}</div></div>
        <div className="flex gap-1">{filtersActive(filters) && <Button size="sm" variant="ghost" onClick={clear}>Clear all</Button>}<Button size="iconSm" variant="ghost" aria-label="Close filters" onClick={() => setOpen(false)}><X /></Button></div>
      </div>
      <div className="max-h-[70vh] space-y-4 overflow-auto pr-1">
        <Group label="Asset category">{categories.length ? categories.map((c) => <Chip key={c} active={filters.categories.includes(c)} onClick={() => setFilters({ categories: toggle(filters.categories, c) })}>{c}</Chip>) : <span className="text-[11px] text-slate-500">No asset layers loaded.</span>}</Group>
        <Group label="Condition">{CONDITIONS.map((c) => <Chip key={c} color={COND_COLORS[c]} active={filters.conditions.includes(c)} onClick={() => setFilters({ conditions: toggle(filters.conditions, c) })}>{c}</Chip>)}</Group>
        <Group label="Risk level">{RISKS.map((c) => <Chip key={c} color={RISK_COLORS[c]} active={filters.risks.includes(c)} onClick={() => setFilters({ risks: toggle(filters.risks, c) })}>{c}</Chip>)}</Group>
        <Group label="Maintenance status">{MAINT_STATUSES.map((c) => <Chip key={c} color={MAINT_COLORS[c]} active={filters.maint.includes(c)} onClick={() => setFilters({ maint: toggle(filters.maint, c) })}>{c}</Chip>)}</Group>
        <div>
          <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Geographic area · chainage</span>
            {alignment ? <label className="flex items-center gap-1.5 text-[11.5px] text-slate-400"><input type="checkbox" className="accent-cyan-400" checked={!!filters.kmRange} onChange={(e) => setFilters({ kmRange: e.target.checked ? [kmMin, kmMax] : null })} /> Limit to section</label> : null}</div>
          {alignment ? (filters.kmRange ? <><RangeSlider min={kmMin} max={kmMax} step={0.5} value={filters.kmRange} onChange={(v) => setFilters({ kmRange: v })} /><div className="mt-1 flex justify-between text-[11px] tabular-nums text-slate-400"><span>Km {filters.kmRange[0].toFixed(1)}</span><span>{(filters.kmRange[1] - filters.kmRange[0]).toFixed(1)} km</span><span>Km {filters.kmRange[1].toFixed(1)}</span></div></> : <div className="text-[11px] text-slate-500">Whole corridor (Km {kmMin}–{kmMax}).</div>) : <div className="text-[11px] text-slate-500">Load a road/highway layer to filter by chainage.</div>}
        </div>
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">Administrative area</div>
          {districts.length ? <select value={filters.district ?? ''} onChange={(e) => setFilters({ district: e.target.value || null })} className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[12.5px] text-slate-200 focus:outline-none">
            <option value="" className="bg-slate-900">All districts</option>{districts.map((d) => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
          </select> : <div className="text-[11px] text-slate-500">Load an administrative boundary layer to filter by district.</div>}
        </div>
        <p className="text-[10.5px] leading-relaxed text-slate-500">Condition, risk and maintenance filters apply to asset layers. Context layers (land use, boundaries, water, buildings, flood zones) stay visible.</p>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div><div className="flex flex-wrap gap-1.5">{children}</div></div>;
}
