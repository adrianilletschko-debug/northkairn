/**
 * Sensor feed abstraction. `SimulatedSensorFeed` replays each sensor's hourly GeoJSON observations
 * at the current time of day (IST) with small jitter, so the dashboard feels live while being honest
 * that it is simulated. A real deployment would implement SensorFeed over WebSocket/MQTT/REST.
 */
export interface SensorReading { sensorId: string; t: number; volumeVph: number; speedKmh: number; simulated: boolean }
export interface SensorFeed { subscribe(cb: (r: SensorReading[]) => void): () => void }

interface Obs { t: string; volume_vph: number; avg_speed_kmh: number }
export interface SensorSeries { sensorId: string; online: boolean; observations: Obs[] }

export const istHourFraction = (d = new Date()) => { const ist = new Date(d.getTime() + 5.5 * 3600000); return ist.getUTCHours() + ist.getUTCMinutes() / 60 + ist.getUTCSeconds() / 3600; };

export function interpolateSeries(obs: Obs[], hour: number): { volume: number; speed: number } | null {
  if (!obs.length) return null;
  const byHour = obs.map((o) => ({ h: istHourFraction(new Date(o.t)), v: o.volume_vph, s: o.avg_speed_kmh })).sort((a, b) => a.h - b.h);
  if (hour <= byHour[0].h) return { volume: byHour[0].v, speed: byHour[0].s };
  for (let i = 0; i < byHour.length - 1; i++) {
    const a = byHour[i], b = byHour[i + 1];
    if (hour >= a.h && hour <= b.h) { const t = (hour - a.h) / (b.h - a.h || 1); return { volume: a.v + (b.v - a.v) * t, speed: a.s + (b.s - a.s) * t }; }
  }
  const last = byHour[byHour.length - 1];
  return hour - last.h <= 1 ? { volume: last.v, speed: last.s } : null; // stale beyond last observation
}

export class SimulatedSensorFeed implements SensorFeed {
  constructor(private series: SensorSeries[], private intervalMs = 2500) {}
  subscribe(cb: (r: SensorReading[]) => void) {
    const tick = () => {
      const h = istHourFraction(); const now = Date.now();
      const out: SensorReading[] = [];
      for (const s of this.series) {
        if (!s.online) continue;
        const v = interpolateSeries(s.observations, h); if (!v) continue;
        const j = 1 + (Math.random() - 0.5) * 0.06;
        out.push({ sensorId: s.sensorId, t: now, volumeVph: Math.round(v.volume * j), speedKmh: Math.round(v.speed * (2 - j)), simulated: true });
      }
      cb(out);
    };
    tick(); const id = setInterval(tick, this.intervalMs);
    return () => clearInterval(id);
  }
}
