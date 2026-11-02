import { cn } from '../../lib/utils';

export function Slider({ value, min = 0, max = 1, step = 0.01, onChange, className, label }: { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; className?: string; label?: string }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
      className={cn('nk-range h-1 w-full cursor-pointer appearance-none rounded-full', className)} style={{ background: `linear-gradient(90deg,#22d3ee ${p}%,rgba(255,255,255,0.1) ${p}%)` }} />
  );
}

export function RangeSlider({ value, min, max, step = 0.5, onChange }: { value: [number, number]; min: number; max: number; step?: number; onChange: (v: [number, number]) => void }) {
  const a = ((value[0] - min) / (max - min)) * 100, b = ((value[1] - min) / (max - min)) * 100;
  return (
    <div className="relative h-5">
      <div className="absolute top-2 h-1 w-full rounded-full bg-white/10" />
      <div className="absolute top-2 h-1 rounded-full bg-cyan-400" style={{ left: `${a}%`, width: `${b - a}%` }} />
      <input type="range" aria-label="From" min={min} max={max} step={step} value={value[0]} onChange={(e) => onChange([Math.min(Number(e.target.value), value[1]), value[1]])} className="nk-range nk-dual absolute top-0 h-5 w-full appearance-none bg-transparent" />
      <input type="range" aria-label="To" min={min} max={max} step={step} value={value[1]} onChange={(e) => onChange([value[0], Math.max(Number(e.target.value), value[0])])} className="nk-range nk-dual absolute top-0 h-5 w-full appearance-none bg-transparent" />
    </div>
  );
}
