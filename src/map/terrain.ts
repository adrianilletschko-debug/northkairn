/**
 * Registers the offline synthetic basemap protocols (nkdem://, nksat://) with MapLibre.
 * Tiles are generated in Web Workers (fallback: main thread) by terrainCore.ts.
 */
import maplibregl from 'maplibre-gl';
import TerrainWorker from './terrain.worker.ts?worker&inline';
import { demPixels, encodePng, satPixels } from './terrainCore';
export { elevation, syntheticBounds } from './terrainCore';

type Job = { resolve: (b: ArrayBuffer) => void; reject: (e: Error) => void };
let workers: Worker[] = []; let rr = 0; let seq = 1; const jobs = new Map<number, Job>();
function initWorkers() {
  try {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const w: Worker = new (TerrainWorker as any)();
      w.onmessage = (e: MessageEvent<{ id: number; buf?: ArrayBuffer; error?: string }>) => { const j = jobs.get(e.data.id); if (!j) return; jobs.delete(e.data.id); e.data.buf ? j.resolve(e.data.buf) : j.reject(new Error(e.data.error)); };
      w.onerror = () => { workers = []; };
      workers.push(w);
    }
  } catch { workers = []; }
}

const cache = new Map<string, Promise<ArrayBuffer>>();
function tile(kind: 'dem' | 'sat', z: number, x: number, y: number): Promise<ArrayBuffer> {
  const key = `${kind}${z}/${x}/${y}`;
  const hit = cache.get(key); if (hit) return hit.then((b) => b.slice(0));
  const p = workers.length
    ? new Promise<ArrayBuffer>((resolve, reject) => { const id = seq++; jobs.set(id, { resolve, reject }); workers[rr++ % workers.length].postMessage({ id, kind, z, x, y }); })
    : encodePng(kind === 'dem' ? demPixels(z, x, y) : satPixels(z, x, y));
  cache.set(key, p); if (cache.size > 900) cache.delete(cache.keys().next().value!);
  p.catch(() => cache.delete(key));
  return p.then((b) => b.slice(0));
}

let registered = false;
export function registerSyntheticProtocols() {
  if (registered) return; registered = true;
  initWorkers();
  const parse = (url: string) => { const m = url.match(/:\/\/(\d+)\/(\d+)\/(\d+)/); return m ? ([Number(m[1]), Number(m[2]), Number(m[3])] as const) : null; };
  maplibregl.addProtocol('nkdem', async (params) => { const t = parse(params.url); if (!t) throw new Error('bad tile url'); return { data: await tile('dem', t[0], t[1], t[2]) }; });
  maplibregl.addProtocol('nksat', async (params) => { const t = parse(params.url); if (!t) throw new Error('bad tile url'); return { data: await tile('sat', t[0], t[1], t[2]) }; });
}
