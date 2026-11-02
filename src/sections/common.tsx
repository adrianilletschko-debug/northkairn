import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export function SectionShell({ title, sub, right, children, className }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-4', className)}>
      <div className="flex items-end justify-between gap-3 px-1">
        <div><h1 className="text-[20px] font-semibold tracking-tight text-white">{title}</h1>{sub && <div className="mt-0.5 text-[12px] text-slate-500">{sub}</div>}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => { const s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}
export const ownProps = (p: Record<string, any>) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('__') && !['observations', 'inspection_history', 'images'].includes(k)));

import { copyText } from '../lib/utils';
import { useStore } from '../state/store';
export async function copyWithToast(text: string, what: string) {
  const ok = await copyText(text);
  useStore.getState().toast(ok ? 'success' : 'warning', ok ? `${what} copied to the clipboard.` : 'The clipboard is not available in this view (browser permission).');
}
