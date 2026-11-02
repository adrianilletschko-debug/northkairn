/**
 * Illustrative traffic animation: vehicles move along the reference alignment on left-hand-traffic lanes,
 * with density proportional to each segment's traffic volume and speed taken from segment data.
 * This is a visualisation of the loaded attributes — not a microscopic traffic model.
 */
import type { FeatureCollection, Position } from 'geojson';
import type { Alignment } from '../geo/alignment';

interface Lane { pts: Position[]; cum: number[]; len: number; dir: 1 | -1 }
interface Veh { lane: number; s: number; f: number; truck: boolean }

const DISPLAY_FACTOR = 0.25; // fraction of real vehicle density drawn

export class VehicleSim {
  private lanes: Lane[] = [];
  private veh: Veh[] = [];
  constructor(private al: Alignment, private speedAt: (km: number) => number, volAt: (km: number) => number) {
    const km0 = al.km0, km1 = al.kmEnd;
    const offs: [number, 1 | -1][] = [[-7.6, 1], [-11, 1], [-14.4, 1], [7.6, -1], [11, -1], [14.4, -1]];
    const lat0 = al.coords[0][1]; const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
    for (const [off, dir] of offs) {
      const pts = al.offsetLine(km0, km1, off); const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * kx, (pts[i][1] - pts[i - 1][1]) * ky));
      this.lanes.push({ pts, cum, len: cum[cum.length - 1], dir });
    }
    // seed vehicles proportional to density (veh/km = vph / kmh, per direction ≈ half)
    for (let li = 0; li < this.lanes.length; li++) {
      const lane = this.lanes[li];
      for (let s = 0; s < lane.len; s += 100) {
        const km = this.kmAt(lane, s); const vol = volAt(km) / 2 / 3; const sp = Math.max(20, speedAt(km));
        const perKm = (vol / sp) * DISPLAY_FACTOR * (li % 3 === 2 ? 0.7 : 1);
        if (Math.random() < perKm * 0.1) this.veh.push({ lane: li, s: s + Math.random() * 100, f: 0.85 + Math.random() * 0.3, truck: li % 3 === 2 ? Math.random() < 0.6 : Math.random() < 0.15 });
      }
    }
  }
  private kmAt(l: Lane, s: number) { const frac = s / l.len; return this.al.km0 + (l.dir > 0 ? frac : 1 - frac) * (this.al.kmEnd - this.al.km0); }
  private posAt(l: Lane, s: number): Position {
    const m = l.dir > 0 ? s : l.len - s; let lo = 0, hi = l.cum.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (l.cum[mid] <= m) lo = mid; else hi = mid; }
    const t = (m - l.cum[lo]) / (l.cum[lo + 1] - l.cum[lo] || 1);
    return [l.pts[lo][0] + (l.pts[lo + 1][0] - l.pts[lo][0]) * t, l.pts[lo][1] + (l.pts[lo + 1][1] - l.pts[lo][1]) * t];
  }
  get count() { return this.veh.length; }
  step(dt: number, mult: number) {
    for (const v of this.veh) {
      const l = this.lanes[v.lane]; const kmh = this.speedAt(this.kmAt(l, v.s)) * v.f * (v.truck ? 0.82 : 1);
      v.s += (kmh / 3.6) * dt * mult; if (v.s > l.len) v.s -= l.len;
    }
  }
  toFC(bounds: [number, number, number, number] | null): FeatureCollection {
    const features: any[] = [];
    for (const v of this.veh) {
      const l = this.lanes[v.lane]; const c = this.posAt(l, v.s);
      if (bounds && (c[0] < bounds[0] || c[0] > bounds[2] || c[1] < bounds[1] || c[1] > bounds[3])) continue;
      const kmh = this.speedAt(this.kmAt(l, v.s)) * v.f * (v.truck ? 0.82 : 1);
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { kmh: Math.round(kmh), truck: v.truck } });
    }
    return { type: 'FeatureCollection', features };
  }
}
