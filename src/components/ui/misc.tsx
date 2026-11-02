import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Panel({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('nk-glass rounded-2xl', className)} {...rest}>{children}</div>;
}

export function PanelHeader({ title, sub, right, className }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-2 px-4 pt-3.5', className)}>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold tracking-tight text-slate-100">{title}</div>
        {sub && <div className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</div>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
    </div>
  );
}

export function Badge({ children, color, className, title }: { children: ReactNode; color?: string; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium leading-none', className)}
      style={color ? { color, borderColor: `${color}55`, background: `${color}1a` } : undefined}>{children}</span>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: color, boxShadow: `0 0 8px ${color}88` }} />;
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-6 text-center">
      {icon && <div className="text-slate-600">{icon}</div>}
      <div className="text-[12.5px] font-medium text-slate-300">{title}</div>
      {children && <div className="max-w-[280px] text-[11.5px] leading-relaxed text-slate-500">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className, size = 'md' }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('inline-flex rounded-lg border border-white/[0.08] bg-black/30 p-0.5', className)} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title} onClick={() => onChange(o.value)}
          className={cn('rounded-md font-medium transition-all', size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[12px]', value === o.value ? 'bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-slate-400 hover:text-slate-200')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-all', active ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-100' : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200')}>
      {color && <span className="size-1.5 rounded-full" style={{ background: color }} />}{children}
    </button>
  );
}

export function SyntheticTag({ className }: { className?: string }) {
  return <span title="Synthetic demonstration data — not real infrastructure data" className={cn('rounded border border-amber-400/30 bg-amber-400/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-amber-300', className)}>Synthetic</span>;
}

export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums tracking-tight" style={{ color: color ?? '#f1f5f9' }}>{value}</div>
      {sub && <div className="mt-0.5 text-[10.5px] text-slate-500">{sub}</div>}
    </div>
  );
}
