import { cn } from '../../lib/utils';

export function Switch({ checked, onCheckedChange, label, className, color }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; className?: string; color?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={(e) => { e.stopPropagation(); onCheckedChange(!checked); }}
      className={cn('relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200', checked ? 'border-transparent' : 'border-white/10 bg-white/[0.08]', className)}
      style={checked ? { background: color ?? '#0ea5e9', boxShadow: `0 0 12px -2px ${color ?? '#0ea5e9'}` } : undefined}>
      <span className={cn('pointer-events-none block size-3.5 rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-[15px]' : 'translate-x-[1px]')} />
    </button>
  );
}
