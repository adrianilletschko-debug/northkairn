import maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mapFilterExpression, featurePasses } from '../geo/filters';
import { flattenGeometry, representativePoint } from '../geo/ingest';
import { getFeature, useStore } from '../state/store';
import { buildSublayers, sourceId } from './layerSpecs';
import { corridorFC, heatmapData, measureFC, riskFC, riskItems } from './overlays';
import { registerSyntheticProtocols, syntheticBounds } from './terrain';
import { VehicleSim } from './vehicles';

export const mapHandle: { map: maplibregl.Map | null } = { map: null };
const EMPTY = { type: 'FeatureCollection', features: [] } as any;

function labelImage(text: string) {
  const s = 2, h = 18 * s, pad = 7 * s; const c = document.createElement('canvas'); let ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `600 ${10.5 * s}px -apple-system, "SF Pro Text", Inter, "Segoe UI", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2; c.width = w; c.height = h + 6 * s; ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `600 ${10.5 * s}px -apple-system, "SF Pro Text", Inter, "Segoe UI", sans-serif`;
  const r = 6 * s; ctx.beginPath(); ctx.roundRect(1, 1, w - 2, h - 2, r); ctx.fillStyle = 'rgba(8,14,28,0.88)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(148,163,184,0.45)'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.lineTo(w / 2, h + 6 * s); ctx.strokeStyle = 'rgba(148,163,184,0.6)'; ctx.stroke();
  ctx.fillStyle = '#e2e8f0'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(text, w / 2, h / 2 + 0.5);
  return ctx.getImageData(0, 0, c.width, c.height);
}

function baseStyle(): any {
  const bounds = syntheticBounds();
  return {
    version: 8,
    sources: {
      'nk-dem': { type: 'raster-dem', tiles: ['nkdem://{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: 12, bounds },
      'nk-dem-hs': { type: 'raster-dem', tiles: ['nkdem://{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: 12, bounds },
      'nk-sat': { type: 'raster', tiles: ['nksat://{z}/{x}/{y}'], tileSize: 256, maxzoom: 15, bounds },
      'nk-empty': { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#060b16' } },
      { id: 'sat', type: 'raster', source: 'nk-sat', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 150 } },
      { id: 'hillshade', type: 'hillshade', source: 'nk-dem-hs', paint: { 'hillshade-shadow-color': '#01040b', 'hillshade-highlight-color': '#2a3d5e', 'hillshade-accent-color': '#0b1630', 'hillshade-exaggeration': 0.6 } },
      { id: 'anchor-data', type: 'line', source: 'nk-empty' },
    ],
  };
}

const OVERLAY_SOURCES = ['nk-kmlabels', 'nk-heat-traffic', 'nk-heat-accidents', 'nk-heat-defects', 'nk-heat-flood', 'nk-corridor', 'nk-vehicles', 'nk-risk', 'nk-sel', 'nk-hover', 'nk-measure'];
const HEAT_RAMPS: Record<string, any[]> = {
  traffic: ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'rgba(34,197,94,0.55)', 0.45, 'rgba(250,204,21,0.75)', 0.7, 'rgba(249,115,22,0.85)', 1, 'rgba(239,68,68,0.95)'],
  accidents: ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'rgba(127,29,29,0.5)', 0.5, 'rgba(220,38,38,0.8)', 1, 'rgba(254,202,202,1)'],
  defects: ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'rgba(146,64,14,0.5)', 0.5, 'rgba(249,115,22,0.8)', 1, 'rgba(254,215,170,1)'],
  flood: ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'rgba(49,46,129,0.45)', 0.5, 'rgba(124,58,237,0.7)', 1, 'rgba(196,181,253,0.95)'],
};

function addOverlays(map: maplibregl.Map) {
  for (const s of OVERLAY_SOURCES) map.addSource(s, { type: 'geojson', data: EMPTY });
  for (const k of ['flood', 'traffic', 'defects', 'accidents']) {
    map.addLayer({ id: `nk-heat-${k}`, type: 'heatmap', source: `nk-heat-${k}`, layout: { visibility: 'none' }, paint: {
      'heatmap-weight': ['coalesce', ['get', 'w'], 0.5], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 14, 2.2],
      'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 8, k === 'flood' ? 10 : 14, 12, k === 'flood' ? 28 : 34, 15, 70], 'heatmap-color': HEAT_RAMPS[k] as any, 'heatmap-opacity': 0.8,
    } });
  }
  map.addLayer({ id: 'nk-corridor-fill', type: 'fill', source: 'nk-corridor', filter: ['==', ['get', 'part'], 'buffer'], paint: { 'fill-color': '#a78bfa', 'fill-opacity': 0.14 } });
  map.addLayer({ id: 'nk-corridor-line', type: 'line', source: 'nk-corridor', filter: ['==', ['get', 'part'], 'buffer'], paint: { 'line-color': '#c4b5fd', 'line-width': 1.6, 'line-dasharray': [3, 2] } });
  map.addLayer({ id: 'nk-corridor-axis', type: 'line', source: 'nk-corridor', filter: ['==', ['get', 'part'], 'axis'], paint: { 'line-color': '#c4b5fd', 'line-width': 3, 'line-opacity': 0.8, 'line-blur': 1 } });
  map.addLayer({ id: 'nk-corridor-end', type: 'circle', source: 'nk-corridor', filter: ['==', ['get', 'part'], 'end'], paint: { 'circle-radius': 7, 'circle-color': '#a78bfa', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  const speedCol: any = ['interpolate', ['linear'], ['get', 'kmh'], 30, '#ef4444', 45, '#f97316', 60, '#facc15', 80, '#4ade80', 95, '#a5f3fc'];
  map.addLayer({ id: 'nk-veh-glow', type: 'circle', source: 'nk-vehicles', minzoom: 10, paint: { 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, 2.5, 14, 5, 17, 18], 'circle-color': speedCol, 'circle-blur': 1, 'circle-opacity': 0.55 } });
  map.addLayer({ id: 'nk-veh', type: 'circle', source: 'nk-vehicles', minzoom: 10, paint: { 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, ['case', ['get', 'truck'], 1.3, 1], 14, ['case', ['get', 'truck'], 2.6, 1.9], 17, ['case', ['get', 'truck'], 8, 5.5]], 'circle-color': '#f8fafc', 'circle-stroke-color': speedCol, 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 2] } });
  map.addLayer({ id: 'nk-risk-ring', type: 'circle', source: 'nk-risk', paint: { 'circle-radius': 14, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 2, 'circle-stroke-color': ['match', ['get', 'level'], 'critical', '#ef4444', '#f59e0b'], 'circle-stroke-opacity': 0.8 } });
  map.addLayer({ id: 'nk-hover-line', type: 'line', source: 'nk-hover', paint: { 'line-color': '#e0f2fe', 'line-width': 2, 'line-opacity': 0.6 } });
  map.addLayer({ id: 'nk-hover-pt', type: 'circle', source: 'nk-hover', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 11, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#e0f2fe', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.7 } });
  map.addLayer({ id: 'nk-sel-fill', type: 'fill', source: 'nk-sel', filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false], paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.18 } });
  map.addLayer({ id: 'nk-sel-glow', type: 'line', source: 'nk-sel', paint: { 'line-color': '#22d3ee', 'line-width': 10, 'line-blur': 6, 'line-opacity': 0.6 } });
  map.addLayer({ id: 'nk-sel-line', type: 'line', source: 'nk-sel', paint: { 'line-color': '#ecfeff', 'line-width': 2.4 } });
  map.addLayer({ id: 'nk-sel-pt', type: 'circle', source: 'nk-sel', filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false], paint: { 'circle-radius': 13, 'circle-color': 'rgba(34,211,238,0.18)', 'circle-stroke-color': '#ecfeff', 'circle-stroke-width': 2.4 } });
  map.addLayer({ id: 'nk-kmlabels', type: 'symbol', source: 'nk-kmlabels', minzoom: 9.5, layout: { 'icon-image': ['get', 'icon'], 'icon-anchor': 'bottom', 'icon-offset': [0, -4], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  map.addLayer({ id: 'nk-measure-line', type: 'line', source: 'nk-measure', paint: { 'line-color': '#facc15', 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
  map.addLayer({ id: 'nk-measure-pt', type: 'circle', source: 'nk-measure', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#0b1220', 'circle-stroke-color': '#facc15', 'circle-stroke-width': 2.5 } });
}

interface Managed { sub: string[]; interactive: string[]; data: any; clustered: boolean; clusterFilterKey: string }

/** prefix for layers/sources merged in from an external vector style (e.g. OpenFreeMap) */
const EXT_PREFIX = 'nk-ext-';
interface ExternalStyle { url: string; layerIds: string[]; sourceIds: string[] }

/**
 * Merges an external MapLibre style (sources + layers) into the live map, inserted below
 * `hillshade` so our own data layers and overlays keep drawing on top. Layer/source ids are
 * prefixed to avoid collisions; `source` references on each layer are rewritten accordingly.
 */
async function mergeExternalStyle(map: maplibregl.Map, url: string): Promise<ExternalStyle> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const style = await res.json();
  const srcIds: Record<string, string> = {};
  const sourceIds: string[] = [];
  for (const [key, src] of Object.entries<any>(style.sources ?? {})) {
    const nid = EXT_PREFIX + key;
    srcIds[key] = nid; sourceIds.push(nid);
    if (!map.getSource(nid)) map.addSource(nid, src);
  }
  const layerIds: string[] = [];
  for (const layer of style.layers ?? []) {
    // skip the basemap's own 3D buildings: real-world extrusions clash with our terrain/sky/pitch
    // and with the digital-twin layers, which are the 3D content this app actually shows
    if (layer.type === 'fill-extrusion') continue;
    const nid = EXT_PREFIX + layer.id;
    layerIds.push(nid);
    if (map.getLayer(nid)) continue;
    const spec: any = { ...layer, id: nid, layout: { ...(layer.layout ?? {}), visibility: 'none' } };
    if (layer.source) spec.source = srcIds[layer.source] ?? layer.source;
    map.addLayer(spec, 'hillshade');
  }
  if (style.glyphs) map.setGlyphs(style.glyphs);
  if (style.sprite) map.setSprite(style.sprite);
  return { url, layerIds, sourceIds };
}

function removeExternalStyle(map: maplibregl.Map, ext: ExternalStyle) {
  for (const id of ext.layerIds) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of ext.sourceIds) if (map.getSource(id)) map.removeSource(id);
}

export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; label: string; layer: string } | null>(null);
  const layers = useStore((s) => s.layers);
  const view = useStore((s) => s.view);
  const filters = useStore((s) => s.filters);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const corridor = useStore((s) => s.corridor);
  const measure = useStore((s) => s.measure);
  const fly = useStore((s) => s.fly);
  const alignment = useStore((s) => s.alignment);
  const dataVersion = useStore((s) => s.dataVersion);
  const layerPanelOpen = useStore((s) => s.layerPanelOpen);
  const managed = useRef(new Map<string, Managed>());
  const interactiveIds = useRef<string[]>([]);
  
  // ---------- init ----------
  useEffect(() => {
    registerSyntheticProtocols();
    const map = new maplibregl.Map({
      container: el.current!, style: baseStyle(), center: [76.335, 27.47], zoom: 11.2, pitch: 62, bearing: -38, maxPitch: 70,
      attributionControl: false, canvasContextAttributes: { antialias: true }, fadeDuration: 150,
    } as any);
    mapHandle.map = map;
    map.on('load', () => {
      addOverlays(map);
      map.setLight({ anchor: 'viewport', color: '#e0f2fe', intensity: 0.32, position: [1.4, 210, 35] } as any);
      setReady(true);
    });
    (window as any).__nkmap = map;
    const ro = new ResizeObserver(() => map.resize()); ro.observe(el.current!);
    return () => { ro.disconnect(); map.remove(); mapHandle.map = null; };
  }, []);

  // ---------- data layers ----------
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready) return;
    const live = new Set(layers.map((l) => l.id));
    for (const [lid, m] of managed.current) if (!live.has(lid)) {
      for (const id of m.sub) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(`nk-src-${lid}`)) map.removeSource(`nk-src-${lid}`);
      managed.current.delete(lid);
    }
    const order: string[] = []; const inter: string[] = [];
    for (const l of layers) {
      const sid = sourceId(l);
      const filt = mapFilterExpression(l, filters);
      // clustered sources cannot be filtered per point by layer filters → filter the data instead
      const clusterKey = l.cluster ? JSON.stringify(filt) : '';
      let m = managed.current.get(l.id);
      if (!m) {
        map.addSource(sid, { type: 'geojson', data: l.renderData as any, promoteId: '__fid', cluster: l.cluster, clusterRadius: 42, clusterMaxZoom: 13, tolerance: 0.3, buffer: 64 } as any);
        m = { sub: [], interactive: [], data: l.renderData, clustered: l.cluster, clusterFilterKey: '' };
        managed.current.set(l.id, m);
      } else if (m.data !== l.renderData) {
        (map.getSource(sid) as maplibregl.GeoJSONSource).setData(l.renderData as any); m.data = l.renderData;
      }
      if (l.cluster && m.clusterFilterKey !== clusterKey) {
        const fc = filt ? { type: 'FeatureCollection', features: l.renderData.features.filter((f) => featurePasses(f.properties, l, filters)) } : l.renderData;
        (map.getSource(sid) as maplibregl.GeoJSONSource).setData(fc as any); m.clusterFilterKey = clusterKey;
      }
      const subs = buildSublayers(l, view, l.cluster ? null : filt);
      const want = new Set(subs.map((s) => s.id));
      for (const id of m.sub) if (!want.has(id) && map.getLayer(id)) map.removeLayer(id);
      for (const s of subs) {
        if (!map.getLayer(s.id)) {
          try { map.addLayer(s.spec, 'anchor-data'); } catch (e) { console.error('layer', s.id, e); continue; }
          if (!map.getLayer(s.id)) continue;
        } else {
          const cur = map.getLayer(s.id)!;
          for (const [k, v] of Object.entries(s.spec.paint || {})) map.setPaintProperty(s.id, k, v);
          for (const [k, v] of Object.entries(s.spec.layout || {})) map.setLayoutProperty(s.id, k, v);
          map.setFilter(s.id, s.spec.filter ?? null);
          void cur;
        }
        order.push(s.id); if (s.interactive) inter.push(s.id);
      }
      m.sub = subs.map((s) => s.id); m.interactive = subs.filter((s) => s.interactive).map((s) => s.id);
    }
    for (const id of order) if (map.getLayer(id)) map.moveLayer(id, 'anchor-data');
    interactiveIds.current = [...inter].reverse();
  }, [ready, layers, view.dimension, view.extrude, view.roadStyle, view.basemap, filters, dataVersion]);

  // ---------- basemap & dimension ----------
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready) return;
    const sat = view.basemap === 'satellite'; const custom = view.basemap === 'custom' && view.customTileUrl.trim();
    const street = view.basemap === 'street';
    map.setLayoutProperty('sat', 'visibility', sat ? 'visible' : 'none');
    if (map.getLayer('custom-raster')) map.removeLayer('custom-raster');
    if (map.getSource('custom-raster')) map.removeSource('custom-raster');
    if (custom) {
      try {
        map.addSource('custom-raster', { type: 'raster', tiles: [view.customTileUrl.trim()], tileSize: 256, maxzoom: 19 });
        map.addLayer({ id: 'custom-raster', type: 'raster', source: 'custom-raster' }, 'hillshade');
      } catch (e) { useStore.getState().toast('error', `Custom basemap could not be added: ${(e as Error).message}`); }
    }
    map.setPaintProperty('hillshade', 'hillshade-exaggeration', sat || custom || street ? 0.18 : 0.6);
    map.setPaintProperty('hillshade', 'hillshade-highlight-color', sat || custom || street ? 'rgba(255,255,255,0.05)' : '#2a3d5e');
    map.setPaintProperty('bg', 'background-color', sat ? '#0b1220' : '#060b16');
  }, [ready, view.basemap, view.customTileUrl]);

  // ---------- street basemap (OpenFreeMap or another configured vector style) ----------
  const externalStyle = useRef<ExternalStyle | null>(null);
  const externalLoading = useRef<string | null>(null);
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready) return;
    const want = view.basemap === 'street';
    const url = view.streetStyleUrl.trim();
    const hide = () => { if (externalStyle.current) for (const id of externalStyle.current.layerIds) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); };
    if (!want) { hide(); return; }
    if (!url) { useStore.getState().toast('error', 'No street-map style URL is configured (Settings → Basemap source).'); return; }
    if (externalStyle.current?.url === url) {
      for (const id of externalStyle.current.layerIds) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
      return;
    }
    if (externalStyle.current) { removeExternalStyle(map, externalStyle.current); externalStyle.current = null; }
    if (externalLoading.current === url) return;
    externalLoading.current = url;
    mergeExternalStyle(map, url).then((ext) => {
      externalLoading.current = null;
      externalStyle.current = ext;
      if (useStore.getState().view.basemap === 'street' && useStore.getState().view.streetStyleUrl.trim() === url) {
        for (const id of ext.layerIds) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
      }
    }).catch((e) => {
      externalLoading.current = null;
      useStore.getState().toast('error', `Street map style could not be loaded: ${(e as Error).message}`);
    });
  }, [ready, view.basemap, view.streetStyleUrl]);

  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready) return;
    if (view.dimension === '3d') {
      map.setTerrain({ source: 'nk-dem', exaggeration: view.terrainExaggeration });
      if (map.getPitch() < 20) map.easeTo({ pitch: 60, bearing: map.getBearing() || -30, duration: 900 });
      map.dragRotate.enable(); map.touchZoomRotate.enableRotation();
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    }
  }, [ready, view.dimension, view.terrainExaggeration]);

  // ---------- heatmaps ----------
  const heat = useMemo(() => (ready ? heatmapData(layers, filters) : null), [ready, layers, filters, dataVersion]);
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready || !heat) return;
    for (const k of ['traffic', 'accidents', 'defects', 'flood'] as const) {
      (map.getSource(`nk-heat-${k}`) as maplibregl.GeoJSONSource).setData(heat[k] as any);
      map.setLayoutProperty(`nk-heat-${k}`, 'visibility', view.heatmaps[k] ? 'visible' : 'none');
    }
  }, [ready, heat, view.heatmaps]);

  // ---------- risk indicators ----------
  const risks = useMemo(() => riskItems(layers, filters), [layers, filters, dataVersion]);
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready) return;
    (map.getSource('nk-risk') as maplibregl.GeoJSONSource).setData(riskFC(risks) as any);
  }, [ready, risks]);

  // ---------- selection highlight ----------
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready) return;
    const hit = getFeature(layers, selection);
    const feats = hit?.feature.geometry ? flattenGeometry(hit.feature.geometry as any).map((g) => ({ type: 'Feature', geometry: g, properties: {} })) : [];
    (map.getSource('nk-sel') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats } as any);
  }, [ready, selection, layers]);

  // ---------- measure & corridor ----------
  useEffect(() => { const map = mapHandle.map; if (!map || !ready) return; (map.getSource('nk-measure') as maplibregl.GeoJSONSource).setData(measureFC(tool === 'measure' || measure.done ? measure.points : []) as any); }, [ready, measure, tool]);
  useEffect(() => { const map = mapHandle.map; if (!map || !ready) return; (map.getSource('nk-corridor') as maplibregl.GeoJSONSource).setData((corridor ? corridorFC(alignment, corridor.a, corridor.b, corridor.bufferM) : EMPTY) as any); }, [ready, corridor, alignment]);
  useEffect(() => {
    const map = mapHandle.map; if (!map) return;
    if (tool !== 'none') { map.doubleClickZoom.disable(); map.getCanvas().style.cursor = 'crosshair'; } else { map.doubleClickZoom.enable(); map.getCanvas().style.cursor = ''; }
  }, [tool]);

  // ---------- initial camera: look up the corridor once an alignment is known ----------
  const demoSet = useStore((s) => s.demoSet);
  const didInit = useRef<string | null>(null);
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready || !alignment) return;
    const key = demoSet ?? 'user';
    if (didInit.current === key || (didInit.current && key === 'user')) return;
    didInit.current = key;
    if (demoSet === 'nh5') {
      const xs = alignment.coords.map((p) => p[0]), ys = alignment.coords.map((p) => p[1]);
      map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top: 120, bottom: 60, left: 340, right: 80 }, pitch: view.dimension === '3d' ? 52 : 0, bearing: view.dimension === '3d' ? -12 : 0, duration: 0 } as any);
      return;
    }
    const km = Math.min(alignment.kmEnd, alignment.km0 + 37.4);
    map.jumpTo({ center: alignment.pointAt(km) as [number, number], zoom: 14.1, pitch: view.dimension === '3d' ? 66 : 0, bearing: view.dimension === '3d' ? alignment.bearingAt(km) - 24 : 0 });
  }, [ready, alignment, demoSet]);

  // ---------- fly requests ----------
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready || !fly) return;
    const padding = { top: 110, bottom: 70, left: layerPanelOpen ? 330 : 70, right: 70 };
    if (fly.bbox) {
      const [a, b, c, d] = fly.bbox; const tiny = Math.abs(c - a) < 0.0005 && Math.abs(d - b) < 0.0005;
      if (tiny) map.flyTo({ center: [(a + c) / 2, (b + d) / 2], zoom: Math.max(map.getZoom(), 15.5), padding, duration: 1400, essential: true });
      else map.fitBounds([[a, b], [c, d]], { padding, duration: 1400, maxZoom: 16.5, pitch: view.dimension === '3d' ? 55 : 0, bearing: map.getBearing() } as any);
    } else if (fly.center) map.flyTo({ center: fly.center as [number, number], zoom: fly.zoom ?? 14, padding, duration: 1400, essential: true, pitch: fly.pitch });
  }, [ready, fly]);

  // ---------- animation: vehicles + risk pulse ----------
  const roadLayer = layers.find((l) => l.kind === 'road');
  const sim = useMemo(() => {
    if (!alignment || !roadLayer) return null;
    const speeds: number[] = [], vols: number[] = [];
    for (const f of roadLayer.data.features) { const k = Math.floor(Number(f.properties?.__km) - alignment.km0); if (k >= 0) { if (typeof f.properties?.__speed === 'number') speeds[k] = f.properties.__speed; if (typeof f.properties?.__vol === 'number') vols[k] = f.properties.__vol; } }
    if (!vols.some((v) => v > 0)) return null;
    const at = (arr: number[], d: number) => (km: number) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(km - alignment.km0)))] ?? d;
    return new VehicleSim(alignment, at(speeds, 80), at(vols, 1500));
  }, [alignment, roadLayer?.renderData]);
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready) return;
    const vehOn = view.vehicles && !!sim && !!roadLayer?.visible;
    for (const id of ['nk-veh', 'nk-veh-glow']) map.setLayoutProperty(id, 'visibility', vehOn ? 'visible' : 'none');
    if (!vehOn) (map.getSource('nk-vehicles') as maplibregl.GeoJSONSource).setData(EMPTY);
    let raf = 0, last = performance.now(), acc = 0;
    // viewport bounds are cached on moveend: with 3D terrain, getBounds() needs a GPU read-back
    let bounds: [number, number, number, number] | null = null;
    const updBounds = () => { const b = map.getBounds(); const px = (b.getEast() - b.getWest()) * 0.5, py = (b.getNorth() - b.getSouth()) * 0.5; bounds = [b.getWest() - px, b.getSouth() - py, b.getEast() + px, b.getNorth() + py]; };
    updBounds(); map.on('moveend', updBounds);
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000); last = t; acc += dt;
      if ((window as any).__nkStatic || document.hidden) { raf = requestAnimationFrame(loop); return; } // test hook / background tab
      const pulse = (Math.sin(t / 380) + 1) / 2;
      if (map.getLayer('nk-risk-ring')) { map.setPaintProperty('nk-risk-ring', 'circle-radius', 10 + pulse * 9); map.setPaintProperty('nk-risk-ring', 'circle-stroke-opacity', 0.9 - pulse * 0.6); }
      if (vehOn && sim) {
        sim.step(dt, view.vehicleSpeed);
        if (acc > 1 / 24 && map.getZoom() >= 10) {
          acc = 0;
          (map.getSource('nk-vehicles') as maplibregl.GeoJSONSource).setData(sim.toFC(bounds) as any);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); map.off('moveend', updBounds); };
  }, [ready, sim, view.vehicles, view.vehicleSpeed, roadLayer?.visible]);

  // ---------- km labels (GPU symbol layer with canvas-drawn icons; no glyphs or DOM markers needed) ----------
  const markerLayer = layers.find((l) => l.kind === 'marker');
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready) return;
    const feats: any[] = [];
    if (view.kmLabels && markerLayer?.visible) {
      for (const f of markerLayer.data.features) {
        const km = Number(f.properties?.km); if (!f.geometry || f.geometry.type !== 'Point' || !Number.isFinite(km) || km % 10 !== 0) continue;
        if (!featurePasses(f.properties!, markerLayer, filters)) continue;
        const icon = `nk-km-${km}`;
        if (!map.hasImage(icon)) map.addImage(icon, labelImage(`Km ${km}`), { pixelRatio: 2 });
        feats.push({ type: 'Feature', geometry: f.geometry, properties: { icon } });
      }
    }
    (map.getSource('nk-kmlabels') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats } as any);
  }, [ready, markerLayer, view.kmLabels, markerLayer?.visible, filters]);

  // ---------- callouts (lightweight DOM overlay positioned with map.project — no terrain read-backs) ----------
  const callouts = useMemo(() => {
    const out: { key: string; coord: number[]; title: string; sub: string; cls: string; sel?: { layerId: string; fid: string } }[] = [];
    const hit = getFeature(layers, selection);
    if (hit?.feature.geometry) {
      const p = hit.feature.properties!; const c = representativePoint(hit.feature.geometry as any);
      if (c) out.push({ key: 'sel', coord: c, title: String(p.__label), sub: [p.asset_type ?? hit.layer.name, p.__cond !== 'Unknown' ? p.__cond : '', typeof p.__km === 'number' ? `Km ${p.__km.toFixed(1)}` : ''].filter(Boolean).join(' · '), cls: 'sel' });
    }
    if (view.callouts) {
      const top = [...risks].sort((a, b) => (a.level === b.level ? (b.at ?? '').localeCompare(a.at ?? '') : a.level === 'critical' ? -1 : 1)).filter((r) => r.fid !== selection?.fid).slice(0, 3);
      for (const r of top) out.push({ key: r.fid, coord: r.coord, title: r.label, sub: `${r.reason}${typeof r.km === 'number' ? ` · Km ${r.km.toFixed(1)}` : ''}`, cls: `alert ${r.level}`, sel: { layerId: r.lid, fid: r.fid } });
    }
    return out;
  }, [selection, layers, risks, view.callouts]);
  const calloutEls = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready) return;
    let raf = 0;
    const place = () => {
      raf = 0; const w = map.getContainer().clientWidth, h = map.getContainer().clientHeight;
      const placed: { x: number; y: number }[] = [];
      for (const c of callouts) {
        const el = calloutEls.current.get(c.key); if (!el) continue;
        const pt = map.project(c.coord as [number, number]);
        // hide anchors far from the camera target (beyond the pitched horizon) and those off-screen
        const ctr = map.getCenter(); const dKm = Math.hypot((c.coord[0] - ctr.lng) * 98.6, (c.coord[1] - ctr.lat) * 110.6);
        const maxKm = 2.6 * 2 ** (14 - map.getZoom()) * (map.getPitch() > 45 ? 1 : 2);
        const on = pt.x > 40 && pt.y > 110 && pt.x < w - 40 && pt.y < h - 30 && map.getZoom() > 8.5 && (c.key === 'sel' || dKm < maxKm);
        // selected callout first; alerts that would overlap an already placed card are hidden
        const free = !placed.some((q) => Math.abs(q.x - pt.x) < 200 && Math.abs(q.y - pt.y) < 58);
        const show = on && free; if (show) placed.push({ x: pt.x, y: pt.y });
        el.style.transform = `translate(${Math.round(pt.x)}px, ${Math.round(pt.y)}px) translate(-50%, calc(-100% - 14px))`; el.style.opacity = show ? '1' : '0'; el.style.pointerEvents = show ? 'auto' : 'none';
      }
    };
    const sched = () => { if (!raf) raf = requestAnimationFrame(place); };
    place(); map.on('move', sched); map.on('resize', sched);
    return () => { map.off('move', sched); map.off('resize', sched); if (raf) cancelAnimationFrame(raf); };
  }, [ready, callouts]);

  // ---------- interaction ----------
  useEffect(() => {
    const map = mapHandle.map; if (!map || !ready) return;
    const pick = (pt: maplibregl.Point) => {
      const ids = ['nk-risk-ring', ...interactiveIds.current].filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
      return map.queryRenderedFeatures([[pt.x - 5, pt.y - 5], [pt.x + 5, pt.y + 5]], { layers: ids });
    };
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const st = useStore.getState();
      if (st.tool === 'measure') {
        if (st.measure.done) st.setMeasure({ points: [[e.lngLat.lng, e.lngLat.lat]], done: false });
        else st.setMeasure({ points: [...st.measure.points, [e.lngLat.lng, e.lngLat.lat]], done: false });
        return;
      }
      if (st.tool === 'corridor') {
        if (!st.alignment) { st.toast('warning', 'Corridor analysis needs a highway alignment layer (a road/highway LineString).'); return; }
        const r = st.alignment.locate([e.lngLat.lng, e.lngLat.lat]); const km = Math.max(st.alignment.km0, Math.min(st.alignment.kmEnd, r.km));
        const picks = [...st.corridorPick, km];
        if (picks.length >= 2) { st.setCorridor({ a: Math.min(picks[0], picks[1]), b: Math.max(picks[0], picks[1]), bufferM: st.corridor?.bufferM ?? 500 }); st.setCorridorPick([]); st.setTool('none'); if (st.section !== 'analytics') st.setSection('analytics'); }
        else { st.setCorridorPick(picks); st.toast('info', `Start set at Km ${km.toFixed(2)} — now click the end of the section.`); }
        return;
      }
      const hits = pick(e.point);
      const h = hits[0];
      if (!h) { st.select(null); return; }
      const p = h.properties as any;
      if (p.point_count !== undefined && p.cluster_id !== undefined) {
        const src = map.getSource(h.source as string) as maplibregl.GeoJSONSource;
        Promise.resolve((src as any).getClusterExpansionZoom(p.cluster_id)).then((z: number) => map.easeTo({ center: (h.geometry as any).coordinates, zoom: z + 0.5 }));
        return;
      }
      if (p.__fid && p.__lid) st.select({ layerId: p.__lid, fid: p.__fid });
    };
    const onDbl = (e: maplibregl.MapMouseEvent) => { const st = useStore.getState(); if (st.tool === 'measure' && st.measure.points.length > 1) { e.preventDefault(); st.setMeasure({ points: st.measure.points, done: true }); } };
    let raf = 0; let lastEvt: maplibregl.MapMouseEvent | null = null;
    const onMove = (e: maplibregl.MapMouseEvent) => {
      lastEvt = e; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0; const ev = lastEvt!; const st = useStore.getState();
        if (st.tool !== 'none') { setHover(null); return; }
        const h = pick(ev.point)[0]; const p = h?.properties as any;
        const hs = map.getSource('nk-hover') as maplibregl.GeoJSONSource | undefined;
        if (p?.__fid) {
          map.getCanvas().style.cursor = 'pointer';
          const layer = st.layers.find((l) => l.id === p.__lid);
          setHover({ x: ev.point.x, y: ev.point.y, label: String(p.__label), layer: layer?.name ?? '' });
          const f = layer?.data.features[Number(String(p.__fid).split(':')[1])];
          hs?.setData({ type: 'FeatureCollection', features: f?.geometry && layer!.kind !== 'landuse' && layer!.kind !== 'boundary' ? flattenGeometry(f.geometry as any).map((g) => ({ type: 'Feature', geometry: g, properties: {} })) : [] } as any);
        } else {
          map.getCanvas().style.cursor = p?.point_count ? 'zoom-in' : '';
          setHover(null); hs?.setData(EMPTY);
        }
      });
    };
    const onOut = () => { setHover(null); (map.getSource('nk-hover') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY); };
    map.on('click', onClick); map.on('dblclick', onDbl); map.on('mousemove', onMove); map.on('mouseout', onOut);
    return () => { map.off('click', onClick); map.off('dblclick', onDbl); map.off('mousemove', onMove); map.off('mouseout', onOut); };
  }, [ready]);

  return (
    <div className="absolute inset-0">
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
        {callouts.map((c) => (
          <div key={c.key} ref={(el) => { if (el) calloutEls.current.set(c.key, el); else calloutEls.current.delete(c.key); }} className={`nk-callout ${c.cls} pointer-events-auto`} style={{ position: 'absolute', left: 0, top: 0, opacity: 0 }}
            onClick={() => c.sel && useStore.getState().select(c.sel, true)}>
            <div className="t">{c.cls.startsWith('alert') && <span className={`dot ${c.cls.split(' ')[1]}`} />}{c.title}</div><div className="s">{c.sub}</div>
          </div>
        ))}
      </div>
      {ready && <ScaleBar />}
      {hover && (
        <div className="pointer-events-none absolute z-20 max-w-[260px] rounded-lg border border-white/10 bg-slate-950/85 px-2.5 py-1.5 text-[11px] shadow-xl backdrop-blur" style={{ left: hover.x + 14, top: hover.y + 12 }}>
          <div className="font-medium text-slate-100">{hover.label}</div>
          <div className="text-slate-400">{hover.layer}</div>
        </div>
      )}
      {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">Initialising 3D map…</div>}
    </div>
  );
}

/** Scale bar computed from zoom & latitude at the map centre (avoids terrain read-backs of unproject). */
function ScaleBar() {
  const [st, setSt] = useState<{ w: number; label: string } | null>(null);
  useEffect(() => {
    const map = mapHandle.map; if (!map) return; let raf = 0;
    const upd = () => {
      raf = 0; const c = map.getCenter(); const mpp = (156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / 2 ** map.getZoom() / 1.0;
      const maxM = mpp * 110; const pow = 10 ** Math.floor(Math.log10(maxM)); const n = maxM / pow; const nice = (n >= 5 ? 5 : n >= 2 ? 2 : 1) * pow;
      setSt({ w: nice / mpp, label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m` });
    };
    const s = () => { if (!raf) raf = requestAnimationFrame(upd); };
    upd(); map.on('move', s); return () => { map.off('move', s); if (raf) cancelAnimationFrame(raf); };
  }, []);
  if (!st) return null;
  return (
    <div className="pointer-events-none absolute bottom-4 right-[68px] z-10 text-[10px] font-medium text-slate-300" title="Scale at map centre">
      <div className="mb-0.5 text-right tabular-nums">{st.label}</div>
      <div className="h-[6px] border-x border-b border-slate-300/80" style={{ width: st.w }} />
    </div>
  );
}
