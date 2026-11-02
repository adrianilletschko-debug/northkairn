import { ArrowDownUp, ClipboardCopy, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ASSET_HEALTH_CATEGORIES, getProp, isSubPart } from '../geo/classify';
import { featurePasses } from '../geo/filters';
import { fmtDate, fmtInt } from '../lib/utils';
import { useStore } from '../state/store';
import { COND_COLORS, MAINT_COLORS, RISK_COLORS } from '../theme/colors';
import { Button } from '../components/ui/button';
import { Badge, Empty, Panel, Segmented, SyntheticTag } from '../components/ui/misc';
import { AssetHealthPanel } from '../components/panels/Panels';
import { copyWithToast, ownProps, SectionShell, toCSV } from './common';

type SortKey = 'id' | 'km' | 'cond' | 'risk' | 'insp';
const COND_RANK: Record<string, number> = { Critical: 0, Poor: 1, Fair: 2, Good: 3, Excellent: 4, Unknown: 5 };
const RISK_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2, Unknown: 3 };

export function AssetsSection() {
  const layers = useStore((s) => s.layers); const filters = useStore((s) => s.filters); const selection = useStore((s) => s.selection); const select = useStore((s) => s.select);
  const [cat, setCat] = useState('All'); const [q, setQ] = useState(''); const [sort, setSort] = useState<SortKey>('cond');
  const all = useMemo(() => layers.flatMap((l) => l.data.features.filter((f) => ASSET_HEALTH_CATEGORIES.includes(f.properties!.__cat) && !isSubPart(f.properties!) && featurePasses(f.properties!, l, filters)).map((f) => ({ l, p: f.properties! }))), [layers, filters]);
  const cats = useMemo(() => ['All', ...ASSET_HEALTH_CATEGORIES.filter((c) => all.some((a) => a.p.__cat === c))], [all]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const r = all.filter((a) => (cat === 'All' || a.p.__cat === cat) && (!s || `${a.p.__label} ${a.p.asset_id ?? ''} ${a.p.asset_type ?? ''} ${a.p.location ?? ''}`.toLowerCase().includes(s)));
    const insp = (p: any) => Date.parse(getProp(p, ['last_inspection']) ?? '') || 0;
    r.sort((a, b) => sort === 'km' ? (a.p.__km ?? 1e9) - (b.p.__km ?? 1e9) : sort === 'cond' ? COND_RANK[a.p.__cond] - COND_RANK[b.p.__cond] || (a.p.__km ?? 0) - (b.p.__km ?? 0) : sort === 'risk' ? RISK_RANK[a.p.__risk] - RISK_RANK[b.p.__risk] : sort === 'insp' ? insp(a.p) - insp(b.p) : String(a.p.asset_id ?? a.p.__label).localeCompare(String(b.p.asset_id ?? b.p.__label)));
    return r;
  }, [all, cat, q, sort]);
  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => <th><button className={`flex items-center gap-1 uppercase ${sort === k ? 'text-cyan-300' : ''}`} onClick={() => setSort(k)}>{children}<ArrowDownUp className="size-3" /></button></th>;
  return (
    <SectionShell title="Infrastructure Assets" sub={<span className="flex items-center gap-1.5">{fmtInt(all.length)} maintainable assets from loaded GeoJSON {all.some((a) => a.l.synthetic) && <SyntheticTag />}</span>}
      right={<Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => copyWithToast(toCSV(rows.map((r) => ({ layer: r.l.name, ...ownProps(r.p) }))), `CSV with ${rows.length} rows`)}><ClipboardCopy className="size-3.5" />Copy CSV</Button>}>
      <AssetHealthPanel className="shrink-0" />
      <Panel className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5"><Search className="size-3.5 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by ID, name, location…" aria-label="Filter assets" className="flex-1 bg-transparent text-[12px] focus:outline-none" /></div>
          <span className="text-[11px] tabular-nums text-slate-500">{fmtInt(rows.length)} rows</span>
        </div>
        <div className="overflow-x-auto px-3 pt-2"><Segmented size="sm" value={cat} onChange={setCat} options={cats.map((c) => ({ value: c, label: c }))} /></div>
        {rows.length === 0 ? <Empty title="No assets match">Adjust the category, search text or global filters.</Empty> : (
          <div className="mt-2 min-h-0 flex-1 overflow-auto">
            <table className="nk-table">
              <thead><tr><Th k="id">Asset</Th><Th k="km">Km</Th><Th k="cond">Condition</Th><Th k="risk">Risk</Th><th>Maintenance</th><Th k="insp">Inspected</Th></tr></thead>
              <tbody>
                {rows.slice(0, 400).map(({ l, p }) => (
                  <tr key={p.__fid} className={`clickable ${selection?.fid === p.__fid ? 'active' : ''}`} onClick={() => select({ layerId: l.id, fid: p.__fid }, true)}>
                    <td className="max-w-[170px]"><div className="truncate font-medium text-slate-100">{p.asset_id ?? p.__label}</div><div className="truncate text-[10.5px] text-slate-500">{p.asset_type ?? l.name}{p.name && p.name !== p.asset_id ? ` · ${p.name}` : ''}</div></td>
                    <td className="tabular-nums">{typeof p.__km === 'number' ? p.__km.toFixed(1) : '—'}</td>
                    <td>{p.__cond !== 'Unknown' ? <Badge color={COND_COLORS[p.__cond]}>{p.__cond}</Badge> : <span className="text-slate-600">n/a</span>}</td>
                    <td>{p.__risk !== 'Unknown' ? <Badge color={RISK_COLORS[p.__risk]}>{p.__risk}</Badge> : <span className="text-slate-600">n/a</span>}</td>
                    <td>{p.__maint !== 'Unknown' ? <span style={{ color: MAINT_COLORS[p.__maint] }}>{p.__maint}</span> : <span className="text-slate-600">n/a</span>}</td>
                    <td className="text-slate-400">{getProp(p, ['last_inspection']) ? fmtDate(getProp(p, ['last_inspection'])) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 400 && <div className="px-3 py-2 text-[11px] text-slate-500">Showing the first 400 of {fmtInt(rows.length)} rows — refine with search or filters.</div>}
          </div>
        )}
      </Panel>
    </SectionShell>
  );
}
