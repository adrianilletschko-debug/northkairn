import { Crosshair, Layers, MapPin, Milestone, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { featurePasses } from '../geo/filters';
import type { GeoLayer } from '../geo/types';
import { cn } from '../lib/utils';
import { useStore } from '../state/store';

interface Entry { lid: string; fid: string; label: string; sub: string; hay: string; id: string; rank: number }
type Result = { type: 'feature'; e: Entry; layer: GeoLayer } | { type: 'layer'; layer: GeoLayer } | { type: 'coord'; lng: number; lat: number } | { type: 'km'; km: number };

const SKIP_KINDS = new Set(['landuse']);
const ID_KEYS = ['asset_id', 'segment_id', 'incident_id', 'defect_id', 'work_order', 'camera_id', 'sensor_id', 'marker_id', 'building_id', 'zone_id', 'boundary_id', 'feature_id', 'id'];
const TEXT_KEYS = ['name', 'asset_type', 'location', 'incident_type', 'defect_type', 'work_type', 'highway', 'settlement', 'crosses', 'status', 'description'];

function buildIndex(layers: GeoLayer[]): Entry[] {
  const out: Entry[] = [];
  for (const l of layers) {
    if (SKIP_KINDS.has(l.kind)) continue;
    const rank = l.kind === 'building' ? 0 : l.kind === 'marker' ? 1 : 2;
    for (const f of l.data.features) {
      const p = f.properties!; const ids = ID_KEYS.map((k) => p[k]).filter((v) => v !== undefined && v !== null).map(String);
      const hay = [p.__label, ...ids, ...TEXT_KEYS.map((k) => p[k]).filter((v) => typeof v === 'string'), l.name].join(' | ').toLowerCase();
      out.push({ lid: l.id, fid: p.__fid, label: String(p.__label), sub: [p.asset_type ?? l.name, typeof p.__km === 'number' ? `Km ${p.__km.toFixed(1)}` : ''].filter(Boolean).join(' · '), hay, id: (ids[0] ?? '').toLowerCase(), rank });
    }
  }
  return out;
}

function parseCoords(q: string): [number, number] | null {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*°?\s*[NS]?\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*[EW]?$/i); if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a > 40 && b < 40)) return [b, a]; // "lat, lng" (common in India)
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return [a, b];
  return null;
}
function parseKm(q: string): number | null {
  const s = q.trim().toLowerCase();
  let m = s.match(/^(?:km|ch(?:ainage)?)\s*[: ]?\s*(\d+(?:\.\d+)?)$/) || s.match(/^(\d+(?:\.\d+)?)\s*km$/);
  if (m) return Number(m[1]);
  m = s.match(/^(?:km\s*)?(\d+)\s*\+\s*(\d{1,3})$/); if (m) return Number(m[1]) + Number(m[2].padEnd(3, '0')) / 1000;
  return null;
}

export function SearchBox() {
  const layers = useStore((s) => s.layers);
  const filters = useStore((s) => s.filters);
  const alignment = useStore((s) => s.alignment);
  const dataVersion = useStore((s) => s.dataVersion);
  const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [open, setOpen] = useState(false); const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => setDq(q), 160); return () => clearTimeout(t); }, [q]);
  const index = useMemo(() => buildIndex(layers), [layers, dataVersion]);
  useEffect(() => { const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); setOpen(true); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  const results: Result[] = useMemo(() => {
    const s = dq.trim().toLowerCase(); if (!s) return [];
    const out: Result[] = [];
    const c = parseCoords(dq); if (c) out.push({ type: 'coord', lng: c[0], lat: c[1] });
    const km = parseKm(dq); if (km !== null && alignment && km >= alignment.km0 - 0.01 && km <= alignment.kmEnd + 0.01) out.push({ type: 'km', km });
    const terms = s.split(/\s+/).filter(Boolean);
    for (const l of layers) if (l.name.toLowerCase().includes(s)) out.push({ type: 'layer', layer: l });
    const scored: [number, Entry][] = [];
    const byId = new Map(layers.map((l) => [l.id, l]));
    for (const e of index) {
      if (!terms.every((t) => e.hay.includes(t))) continue;
      const l = byId.get(e.lid)!; const f = l.data.features[Number(e.fid.split(':')[1])];
      if (!featurePasses(f.properties!, l, filters)) continue;
      const score = (e.id === s ? 100 : e.id.startsWith(s) ? 50 : 0) + (e.label.toLowerCase().startsWith(s) ? 20 : e.label.toLowerCase().includes(s) ? 10 : 0) + e.rank * 3;
      scored.push([score, e]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    for (const [, e] of scored.slice(0, 9)) out.push({ type: 'feature', e, layer: byId.get(e.lid)! });
    return out;
  }, [dq, index, layers, filters, alignment]);
  useEffect(() => setHi(0), [results]);

  const choose = (r: Result) => {
    const st = useStore.getState();
    if (r.type === 'feature') st.select({ layerId: r.e.lid, fid: r.e.fid }, true);
    else if (r.type === 'layer') { if (r.layer.stats.bbox) st.flyTo({ bbox: r.layer.stats.bbox }); if (!r.layer.visible) st.patchLayer(r.layer.id, { visible: true }); }
    else if (r.type === 'coord') st.flyTo({ center: [r.lng, r.lat], zoom: 15 });
    else if (r.type === 'km' && alignment) { st.flyTo({ center: alignment.pointAt(r.km), zoom: 15.5 }); }
    setOpen(false); input.current?.blur();
  };

  return (
    <div ref={box} className="relative w-full max-w-[560px]">
      <div className={cn('flex h-10 items-center gap-2.5 rounded-xl border px-3.5 transition-all', open && q ? 'border-cyan-400/40 bg-[#0b1426] shadow-[0_0_0_4px_rgba(34,211,238,0.08)]' : 'border-white/[0.08] bg-white/[0.04] hover:border-white/[0.14]')}>
        <Search className="size-4 text-slate-500" />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(results.length - 1, h + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); } else if (e.key === 'Enter' && results[hi]) choose(results[hi]); else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); } }}
          placeholder="Search asset ID, bridge, Km 24.5, lat/lng, incident…" aria-label="Search"
          className="h-full flex-1 bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none" />
        {q ? <button aria-label="Clear search" onClick={() => { setQ(''); setDq(''); input.current?.focus(); }} className="text-slate-500 hover:text-slate-200"><X className="size-4" /></button>
          : <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-500">⌘K</kbd>}
      </div>
      {open && dq.trim() && (
        <div className="nk-glass-strong nk-fade absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl shadow-2xl">
          {results.length === 0 ? <div className="px-4 py-3 text-[12.5px] text-slate-400">No matches for “{dq}”. Try an asset ID (e.g. BR-0012), a chainage (Km 168.4) or coordinates (lat, lng).</div> : (
            <ul className="max-h-[420px] overflow-auto py-1">
              {results.map((r, i) => (
                <li key={i}>
                  <button onMouseEnter={() => setHi(i)} onClick={() => choose(r)} className={cn('flex w-full items-center gap-3 px-3.5 py-2 text-left', hi === i && 'bg-cyan-400/10')}>
                    <span className="grid size-7 place-items-center rounded-lg bg-white/[0.05] text-slate-400">
                      {r.type === 'coord' ? <Crosshair className="size-3.5" /> : r.type === 'km' ? <Milestone className="size-3.5" /> : r.type === 'layer' ? <Layers className="size-3.5" /> : <MapPin className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-slate-100">{r.type === 'feature' ? r.e.label : r.type === 'layer' ? r.layer.name : r.type === 'coord' ? `Go to ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}` : `Go to Km ${r.km.toFixed(3)}`}</span>
                      <span className="block truncate text-[11px] text-slate-500">{r.type === 'feature' ? `${r.e.sub} — ${r.layer.name}` : r.type === 'layer' ? `Layer · ${r.layer.stats.accepted} features` : r.type === 'coord' ? 'Coordinates (WGS84)' : alignment?.name}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

