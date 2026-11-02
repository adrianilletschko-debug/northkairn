/**
 * Core of the procedural, offline basemap (pure functions, usable in a Web Worker).
 * Procedural, offline basemap: a synthetic elevation model (terrarium-encoded DEM tiles) and synthetic
 * "aerial" imagery, generated in the browser through MapLibre custom protocols. No paid or remote tile
 * provider is needed. Both are clearly labelled as synthetic in the UI and can be replaced by real
 * sources (e.g. Copernicus DEM / open imagery) via the map style configuration.
 */
import guides from '../demo/terrain-guides.json';

type P = [number, number];
interface Guides { centreline: P[]; rivers: { width: number; coords: P[] }[]; towns: { name: string; centre: P; radiusM: number }[] }
const G = guides as unknown as Guides;

// ---------- noise ----------
function hash2(x: number, y: number) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct: number) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function ridged(x: number, y: number, oct: number) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { const r = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1); s += a * r * r; n += a; a *= 0.5; f *= 2.1; } return s / n; }
const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- distance fields on a coarse grid (computed once, lazily) ----------
const STEP = 0.004;
let field: { x0: number; y0: number; nx: number; ny: number; dC: Float32Array; dR: Float32Array; dT: Float32Array } | null = null;
function segDistKm(px: number, py: number, line: P[], kx: number, ky: number) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i][0] * kx, ay = line[i][1] * ky, bx = line[i + 1][0] * kx, by = line[i + 1][1] * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
    const d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2; if (d < best) best = d;
  }
  return Math.sqrt(best);
}
function ensureField() {
  if (field) return field;
  const all = [...G.centreline, ...G.rivers.flatMap((r) => r.coords)];
  const x0 = Math.min(...all.map((p) => p[0])) - 0.3, x1 = Math.max(...all.map((p) => p[0])) + 0.3;
  const y0 = Math.min(...all.map((p) => p[1])) - 0.3, y1 = Math.max(...all.map((p) => p[1])) + 0.3;
  const nx = Math.ceil((x1 - x0) / STEP) + 1, ny = Math.ceil((y1 - y0) / STEP) + 1;
  const ky = 110.574, kx = 111.32 * Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const dC = new Float32Array(nx * ny), dR = new Float32Array(nx * ny), dT = new Float32Array(nx * ny);
  const cl = G.centreline.filter((_, i) => i % 2 === 0).concat([G.centreline[G.centreline.length - 1]]);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const lng = x0 + i * STEP, lat = y0 + j * STEP, px = lng * kx, py = lat * ky; const k = j * nx + i;
    dC[k] = segDistKm(px, py, cl, kx, ky);
    let r = Infinity; for (const rv of G.rivers) { const d = segDistKm(px, py, rv.coords, kx, ky) - rv.width / 2000; if (d < r) r = d; } dR[k] = r;
    let t = Infinity; for (const tw of G.towns) { const d = Math.hypot(px - tw.centre[0] * kx, py - tw.centre[1] * ky) / (tw.radiusM / 1000); if (d < t) t = d; } dT[k] = t;
  }
  field = { x0, y0, nx, ny, dC, dR, dT };
  return field;
}
function sample(arr: Float32Array, lng: number, lat: number, outside: number) {
  const f = field!; const gx = (lng - f.x0) / STEP, gy = (lat - f.y0) / STEP;
  if (gx < 0 || gy < 0 || gx >= f.nx - 1 || gy >= f.ny - 1) return outside;
  const i = Math.floor(gx), j = Math.floor(gy), tx = gx - i, ty = gy - j, k = j * f.nx + i;
  return (arr[k] * (1 - tx) + arr[k + 1] * tx) * (1 - ty) + (arr[k + f.nx] * (1 - tx) + arr[k + f.nx + 1] * tx) * ty;
}

// ---------- elevation model ----------
export function elevation(lng: number, lat: number): number {
  ensureField();
  const dC = sample(field!.dC, lng, lat, 50), dR = sample(field!.dR, lng, lat, 50);
  const base = 40 + (lat - 27.2) * 60 - (lng - 76.0) * 15; // relative relief (m) — keeps any tile seams shallow
  const low = (fbm(lng * 16 + 11, lat * 16 - 5, 3) - 0.5) * 70;
  const detail = (fbm(lng * 95, lat * 95, 2) - 0.5) * 9;
  const hills = Math.pow(ridged(lng * 9 + 3, lat * 9 - 7, 4), 2.2) * 400 * smoothstep(1.2, 6.5, dC);
  let natural = base + low + detail + hills;
  natural += -16 * Math.exp(-((Math.max(0, dR) / 0.3) ** 2)) - 6 * Math.exp(-((Math.max(0, dR) / 1.4) ** 2));
  const road = base + low * 0.55;
  const m = 1 - smoothstep(0.08, 0.6, dC);
  const bb = syntheticBounds();
  const edge = Math.min(lng - bb[0], bb[2] - lng, lat - bb[1], bb[3] - lat);
  return (natural * (1 - m) + road * m) * smoothstep(0, 0.14, edge);
}

// ---------- tiles ----------
const lngOf = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const latOf = (y: number, z: number) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
const SIZE = 256, COARSE = 65;

function coarseElevation(z: number, x: number, y: number) {
  const out = new Float32Array(COARSE * COARSE);
  for (let j = 0; j < COARSE; j++) { const lat = latOf(y + j / (COARSE - 1), z); for (let i = 0; i < COARSE; i++) out[j * COARSE + i] = elevation(lngOf(x + i / (COARSE - 1), z), lat); }
  return out;
}
function bilinear(c: Float32Array, u: number, v: number) {
  const gx = u * (COARSE - 1), gy = v * (COARSE - 1); const i = Math.min(COARSE - 2, Math.floor(gx)), j = Math.min(COARSE - 2, Math.floor(gy)); const tx = gx - i, ty = gy - j; const k = j * COARSE + i;
  return (c[k] * (1 - tx) + c[k + 1] * tx) * (1 - ty) + (c[k + COARSE] * (1 - tx) + c[k + COARSE + 1] * tx) * ty;
}

export function demPixels(z: number, x: number, y: number): Uint8ClampedArray {
  {
    const c = coarseElevation(z, x, y); const d = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
      const e = bilinear(c, (i + 0.5) / SIZE, (j + 0.5) / SIZE) + 32768; const k = (j * SIZE + i) * 4;
      d[k] = Math.floor(e / 256); d[k + 1] = Math.floor(e) % 256; d[k + 2] = Math.floor((e - Math.floor(e)) * 256); d[k + 3] = 255;
    }
    return d;
  }
}

const FIELD_COLORS: [number, number, number][] = [[92, 108, 58], [111, 125, 69], [138, 128, 82], [160, 138, 90], [122, 101, 70], [84, 98, 52], [176, 160, 116], [98, 116, 64]];
export function satPixels(z: number, x: number, y: number): Uint8ClampedArray {
  {
    ensureField();
    const c = coarseElevation(z, x, y); const d = new Uint8ClampedArray(SIZE * SIZE * 4);
    const lng0 = lngOf(x, z), lng1 = lngOf(x + 1, z), lat0 = latOf(y, z), lat1 = latOf(y + 1, z);
    const mPerPx = ((lng1 - lng0) * 111320 * Math.cos((lat0 * Math.PI) / 180)) / SIZE;
    for (let j = 0; j < SIZE; j++) {
      const v = (j + 0.5) / SIZE; const lat = lat0 + (lat1 - lat0) * v;
      for (let i = 0; i < SIZE; i++) {
        const u = (i + 0.5) / SIZE; const lng = lng0 + (lng1 - lng0) * u;
        const e = bilinear(c, u, v); const ex = bilinear(c, Math.min(1, u + 1 / 64), v) - e, ey = bilinear(c, u, Math.min(1, v + 1 / 64)) - e;
        const step = mPerPx * 4; const shade = Math.max(0.55, Math.min(1.25, 1 + (-ex + ey) / step * 1.8));
        const dR = sample(field!.dR, lng, lat, 50), dC = sample(field!.dC, lng, lat, 50), dT = sample(field!.dT, lng, lat, 50);
        let r: number, g: number, b: number;
        // agricultural patchwork on a rotated grid
        const mx = lng * 111320 * 0.887, my = lat * 110574; const rx = mx * 0.94 + my * 0.34, ry = -mx * 0.34 + my * 0.94;
        const fx = Math.floor(rx / 210), fy = Math.floor(ry / 140); const h = hash2(fx, fy);
        const fc = FIELD_COLORS[Math.floor(h * FIELD_COLORS.length)];
        const tex = 0.9 + 0.2 * vnoise(rx / 9, ry / 9);
        const hill = smoothstep(140, 300, e) * smoothstep(1.5, 4, dC);
        const forest = smoothstep(0.55, 0.75, fbm(lng * 60, lat * 60, 2)) * 0.8 + hill * 0.7;
        r = fc[0] * tex; g = fc[1] * tex; b = fc[2] * tex;
        const fr = 58 + 20 * vnoise(rx / 6, ry / 6), fg = 72 + 18 * vnoise(rx / 7 + 3, ry / 7), fb = 44;
        const fw = Math.min(1, forest); r = r * (1 - fw) + fr * fw; g = g * (1 - fw) + fg * fw; b = b * (1 - fw) + fb * fw;
        // field boundaries
        const bx = rx / 210 - fx, by = ry / 140 - fy; if ((bx < 0.025 || by < 0.035) && mPerPx < 12) { r *= 0.82; g *= 0.85; b *= 0.82; }
        // settlements
        if (dT < 1) { const blk = hash2(Math.floor(rx / 16), Math.floor(ry / 16)); const tw = smoothstep(1, 0.6, dT) * (blk > 0.25 ? 1 : 0.3); const rc = blk > 0.8 ? [150, 92, 70] : blk > 0.5 ? [176, 168, 152] : [132, 126, 116]; r = r * (1 - tw) + rc[0] * tw; g = g * (1 - tw) + rc[1] * tw; b = b * (1 - tw) + rc[2] * tw; }
        // rivers + sandy banks
        if (dR < 0.06) { const bank = smoothstep(0.06, 0.0, dR); r = r * (1 - bank) + 168 * bank; g = g * (1 - bank) + 150 * bank; b = b * (1 - bank) + 112 * bank; }
        if (dR < 0) { const w = smoothstep(0, -0.02, dR); r = r * (1 - w) + 38 * w; g = g * (1 - w) + 64 * w; b = b * (1 - w) + 72 * w; }
        // highway right-of-way (bare earth/asphalt); vector carriageways draw on top
        if (dC < 0.05) { const rw = smoothstep(0.05, 0.02, dC); r = r * (1 - rw) + 104 * rw; g = g * (1 - rw) + 100 * rw; b = b * (1 - rw) + 92 * rw; }
        const k = (j * SIZE + i) * 4;
        d[k] = Math.min(255, r * shade * 0.92); d[k + 1] = Math.min(255, g * shade * 0.92); d[k + 2] = Math.min(255, b * shade * 0.92); d[k + 3] = 255;
      }
    }
    return d;
  }
}

/** extent covered by the synthetic terrain guides (used to bound the synthetic sources) */
let _bb: [number, number, number, number] | null = null;
export function syntheticBounds(): [number, number, number, number] {
  if (_bb) return _bb;
  const all = [...G.centreline, ...G.rivers.flatMap((r) => r.coords)];
  return (_bb = [Math.min(...all.map((p) => p[0])) - 0.35, Math.min(...all.map((p) => p[1])) - 0.35, Math.max(...all.map((p) => p[0])) + 0.35, Math.max(...all.map((p) => p[1])) + 0.35]);
}

export const TILE_SIZE = SIZE;
export async function encodePng(px: Uint8ClampedArray): Promise<ArrayBuffer> {
  const img = new ImageData(px as any, SIZE, SIZE);
  if (typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(SIZE, SIZE); cv.getContext('2d')!.putImageData(img, 0, 0);
    return await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer();
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE; cv.getContext('2d')!.putImageData(img, 0, 0);
  const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), 'image/png'));
  return await blob.arrayBuffer();
}
