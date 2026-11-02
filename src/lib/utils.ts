import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-IN');
export const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const inr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${fmtInt(n)}`);

export function relTime(iso: string | undefined, now = Date.now()) {
  if (!iso) return '';
  const t = Date.parse(iso); if (!Number.isFinite(t)) return String(iso);
  const s = (now - t) / 1000; const fut = s < 0; const a = Math.abs(s);
  const v = a < 60 ? 'just now' : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} d`;
  return v === 'just now' ? v : fut ? `in ${v}` : `${v} ago`;
}

export function fmtDate(v: unknown) {
  if (typeof v !== 'string') return String(v);
  const t = Date.parse(v); if (!Number.isFinite(t) || !/^\d{4}-\d{2}-\d{2}/.test(v)) return v;
  const d = new Date(t);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return v.length > 10 ? `${date}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST` : date;
}

export const humanKey = (k: string) => k.replace(/_/g, ' ').replace(/\b(km|id|kmh|vph|pci|iri|inr|pcu|aadt|cctv|ptz)\b/gi, (m) => m.toUpperCase()).replace(/^\w/, (m) => m.toUpperCase()).replace(/ Pct$/, ' %').replace(/ M$/, ' (m)').replace(/ M2$/, ' (m²)').replace(/ Mm$/, ' (mm)').replace(/ KMH$/, ' (km/h)').replace(/ VPH$/, ' (veh/h)');

export function copyText(text: string) {
  return navigator.clipboard.writeText(text).then(() => true, () => false);
}
