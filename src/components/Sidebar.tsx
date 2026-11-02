import { Activity, Boxes, Car, ChartSpline, Database, LayoutDashboard, Landmark, ListOrdered, Route, Settings, TriangleAlert, Wrench } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore, type Section } from '../state/store';
import { Logo } from './Logo';

export const NAV: { id: Section; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'twin', label: 'Digital Twin', icon: Boxes },
  { id: 'assets', label: 'Infrastructure Assets', icon: Landmark },
  { id: 'traffic', label: 'Traffic Monitoring', icon: Car },
  { id: 'roads', label: 'Road Conditions', icon: Route },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'priority', label: 'Prioritization', icon: ListOrdered },
  { id: 'incidents', label: 'Incidents', icon: TriangleAlert },
  { id: 'analytics', label: 'Analytics & Reports', icon: ChartSpline },
  { id: 'data', label: 'Data Management', icon: Database },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const layers = useStore((s) => s.layers);
  const synthetic = layers.some((l) => l.synthetic); const demoSet = useStore((s) => s.demoSet);
  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-white/[0.06] bg-[#050a14]/70 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-5 pb-6 pt-5">
        <Logo />
        <div className="leading-tight">
          <div className="text-[14px] font-bold tracking-[0.14em] text-white">NORTHKAIRN</div>
          <div className="text-[11.5px] text-slate-400">Highway Digital Twin</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map((n) => {
          const active = section === n.id; const Icon = n.icon;
          return (
            <button key={n.id} onClick={() => setSection(n.id)} aria-current={active ? 'page' : undefined}
              className={cn('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition-all duration-200',
                active ? 'bg-gradient-to-r from-cyan-400/[0.16] to-blue-500/[0.06] text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18),0_0_24px_-8px_rgba(34,211,238,0.5)]' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100')}>
              {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />}
              <Icon className={cn('size-[18px]', active ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300')} strokeWidth={1.7} />
              {n.label}
            </button>
          );
        })}
      </nav>
      <div className="m-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-slate-500">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-slate-300"><Activity className="size-3.5 text-cyan-300" /> Data source</div>
        {layers.length === 0 ? 'No datasets loaded.' : demoSet === 'nh5' ? <>NH 5 geometry is <span className="text-cyan-300">real open data</span>; condition, traffic and incident values are <span className="text-amber-300">synthetic</span>.</> : synthetic ? <>Demo corridor uses <span className="text-amber-300">synthetic data</span> — not real government infrastructure data.</> : `${layers.length} uploaded GeoJSON layer(s).`}
      </div>
    </aside>
  );
}
