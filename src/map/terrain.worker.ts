/// <reference lib="webworker" />
// Generates synthetic DEM / imagery tiles off the main thread.
import { demPixels, encodePng, satPixels } from './terrainCore';

self.onmessage = async (e: MessageEvent<{ id: number; kind: 'dem' | 'sat'; z: number; x: number; y: number }>) => {
  const { id, kind, z, x, y } = e.data;
  try {
    const px = kind === 'dem' ? demPixels(z, x, y) : satPixels(z, x, y);
    const buf = await encodePng(px);
    (self as unknown as Worker).postMessage({ id, buf }, [buf]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
