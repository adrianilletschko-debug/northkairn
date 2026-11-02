import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { FilterButton } from './FilterPanel';
import { SearchBox } from './SearchBox';

export function Header() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  const layers = useStore((s) => s.layers);
  const synthetic = layers.some((l) => l.synthetic); const demoSet = useStore((s) => s.demoSet);
  const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return (
    <header className="relative z-30 flex h-[60px] shrink-0 items-center gap-4 border-b border-white/[0.06] bg-[#050a14]/60 px-6 backdrop-blur-xl">
      <div className="flex flex-1 justify-center"><SearchBox /></div>
      <FilterButton />
      {synthetic && <div title="All demonstration datasets are synthetic and fictional" className="hidden items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-2.5 py-1.5 text-[11px] font-medium text-amber-200 xl:flex"><span className="size-1.5 rounded-full bg-amber-300" />{demoSet === 'nh5' ? 'Demo · real alignment, synthetic values' : 'Demo mode · synthetic data'}</div>}
      <div className="text-right leading-tight"><div className="text-[11px] text-slate-500">{date}</div><div className="text-[13px] font-medium tabular-nums text-slate-200">{time} <span className="text-[10px] text-slate-500">IST</span></div></div>
    </header>
  );
}
