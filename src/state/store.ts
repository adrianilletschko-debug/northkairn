import type { Position } from 'geojson';
import { create } from 'zustand';
import { DEMO_SETS, type DemoSetId } from '../data/demo';
import { repository } from '../data/repository';
import { DEFAULT_INTERVENTIONS, DEFAULT_PRIORITY_WEIGHTS, DEFAULT_SCENARIO_BUDGETS_CR, type Intervention, type PriorityWeights } from '../decision/config';
import { buildAlignment, enrichLayers, type Alignment } from '../geo/alignment';
import { ingestGeoJSONText, newLayerId } from '../geo/ingest';
import { EMPTY_FILTERS, type Filters, type GeoLayer, type ImportRecord, type LayerKind, type Selection } from '../geo/types';

export type Section = 'overview' | 'twin' | 'assets' | 'traffic' | 'roads' | 'maintenance' | 'priority' | 'incidents' | 'analytics' | 'data' | 'settings';
export type RoadStyle = 'default' | 'condition' | 'traffic';
export type Basemap = 'dark' | 'satellite' | 'street' | 'custom';
export type Tool = 'none' | 'measure' | 'corridor';

export interface ViewSettings {
  dimension: '2d' | '3d';
  basemap: Basemap;
  roadStyle: RoadStyle;
  heatmaps: { traffic: boolean; accidents: boolean; defects: boolean; flood: boolean };
  vehicles: boolean;
  callouts: boolean;
  kmLabels: boolean;
  terrainExaggeration: number;
  vehicleSpeed: number;
  clusterThreshold: number;
  customTileUrl: string;
  streetStyleUrl: string;
  extrude: boolean;
}

export const DEFAULT_STREET_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export interface CorridorSelection { a: number; b: number; bufferM: number }
export interface FlyRequest { bbox?: [number, number, number, number]; center?: Position; zoom?: number; ts: number; pitch?: number }
export interface Toast { id: number; kind: 'info' | 'success' | 'error' | 'warning'; text: string }

export interface PriorityConfig {
  budgetCr: number;
  years: number;
  weights: PriorityWeights;
  interventions: Intervention[];
  scenarioBudgetsCr: number[];
  showLayer: boolean;
}
export const DEFAULT_PRIORITY_CONFIG: PriorityConfig = {
  budgetCr: 25, years: 5, weights: DEFAULT_PRIORITY_WEIGHTS, interventions: DEFAULT_INTERVENTIONS,
  scenarioBudgetsCr: DEFAULT_SCENARIO_BUDGETS_CR, showLayer: false,
};

/** draw order (bottom → top) by kind */
export const KIND_Z: LayerKind[] = ['landuse', 'boundary', 'flood', 'water', 'maintenance', 'drainage', 'highway', 'road', 'building', 'bridge', 'lighting', 'marker', 'sensor', 'camera', 'defect', 'incident', 'generic'];
const sortLayers = (ls: GeoLayer[]) => [...ls].sort((a, b) => KIND_Z.indexOf(a.kind) - KIND_Z.indexOf(b.kind) || a.order - b.order);

interface State {
  section: Section;
  layers: GeoLayer[];
  alignment: Alignment | null;
  history: ImportRecord[];
  selection: Selection | null;
  filters: Filters;
  view: ViewSettings;
  tool: Tool;
  corridor: CorridorSelection | null;
  corridorPick: number[];            // chainages clicked on the map while picking a corridor
  measure: { points: Position[]; done: boolean };
  fly: FlyRequest | null;
  toasts: Toast[];
  dataVersion: number;
  layerPanelOpen: boolean;
  filterPanelOpen: boolean;
  priority: PriorityConfig;

  setSection(s: Section): void;
  importText(text: string, fileName: string, opts?: { source?: 'demo' | 'upload'; kind?: LayerKind; visible?: boolean; replaceId?: string; silent?: boolean }): { ok: boolean; error?: string; layer?: GeoLayer };
  importFiles(files: File[]): Promise<void>;
  loadDemo(id?: DemoSetId): void;
  demoSet: DemoSetId | null;
  removeDemo(): void;
  removeLayer(id: string): void;
  renameLayer(id: string, name: string): void;
  reloadLayer(id: string): void;
  replaceLayer(id: string, file: File): Promise<void>;
  patchLayer(id: string, patch: Partial<Pick<GeoLayer, 'visible' | 'opacity' | 'color'>>): void;
  setAllLayersVisible(visible: boolean): void;
  select(sel: Selection | null, fly?: boolean): void;
  setFilters(patch: Partial<Filters>): void;
  clearFilters(): void;
  setView(patch: Partial<ViewSettings>): void;
  setHeatmap(k: keyof ViewSettings['heatmaps'], v: boolean): void;
  setTool(t: Tool): void;
  setCorridor(c: CorridorSelection | null): void;
  setCorridorPick(p: number[]): void;
  setMeasure(m: { points: Position[]; done: boolean }): void;
  flyTo(r: Omit<FlyRequest, 'ts'>): void;
  toast(kind: Toast['kind'], text: string): void;
  dismissToast(id: number): void;
  setLayerPanelOpen(v: boolean): void;
  setFilterPanelOpen(v: boolean): void;
  setPriorityBudget(budgetCr: number): void;
  setPriorityYears(years: number): void;
  setPriorityWeights(patch: Partial<PriorityWeights>): void;
  setPriorityInterventions(interventions: Intervention[]): void;
  resetPriorityInterventions(): void;
  setPriorityShowLayer(v: boolean): void;
}

let toastSeq = 1;
let orderSeq = 1;
const now = () => new Date().toISOString();

function recompute(layers: GeoLayer[]) {
  const sorted = sortLayers(layers);
  const alignment = buildAlignment(sorted);
  enrichLayers(sorted, alignment);
  return { layers: sorted, alignment };
}

export const useStore = create<State>((set, get) => ({
  section: 'overview',
  demoSet: null,
  layers: [],
  alignment: null,
  history: [],
  selection: null,
  filters: EMPTY_FILTERS,
  view: {
    dimension: '3d', basemap: 'street', roadStyle: 'condition', heatmaps: { traffic: false, accidents: false, defects: false, flood: false },
    vehicles: true, callouts: true, kmLabels: true, terrainExaggeration: 1.6, vehicleSpeed: 1, clusterThreshold: 400, customTileUrl: '', streetStyleUrl: DEFAULT_STREET_STYLE_URL, extrude: true,
  },
  tool: 'none',
  corridor: null,
  corridorPick: [],
  measure: { points: [], done: false },
  fly: null,
  toasts: [],
  dataVersion: 0,
  layerPanelOpen: true,
  filterPanelOpen: false,
  priority: DEFAULT_PRIORITY_CONFIG,

  setSection(section) {
    const roadStyle: Partial<ViewSettings> = section === 'traffic' ? { roadStyle: 'traffic' } : section === 'roads' ? { roadStyle: 'condition' } : {};
    set((s) => ({ section, view: { ...s.view, ...roadStyle } }));
  },

  importText(text, fileName, opts = {}) {
    const st = get();
    const existing = opts.replaceId ? st.layers.find((l) => l.id === opts.replaceId) : undefined;
    const res = ingestGeoJSONText(text, fileName, {
      source: opts.source ?? 'upload', kind: opts.kind ?? (opts.source === 'demo' ? undefined : undefined), visible: existing?.visible ?? opts.visible,
      id: existing ? newLayerId() : undefined, name: existing && existing.fileName === fileName ? existing.name : undefined,
      color: existing?.color, opacity: existing?.opacity, order: existing?.order ?? orderSeq++, clusterThreshold: st.view.clusterThreshold,
    });
    const action: ImportRecord['action'] = opts.replaceId ? 'replace' : opts.source === 'demo' ? 'demo' : 'import';
    if (!res.ok) {
      set((s) => ({ history: [{ id: `H${Date.now()}${Math.random()}`, at: now(), fileName, action, ok: false, summary: res.error }, ...s.history] }));
      if (!opts.silent) get().toast('error', `${fileName}: ${res.error}`);
      return { ok: false, error: res.error };
    }
    const layer = res.layer;
    if (opts.kind) layer.kind = opts.kind;
    const others = st.layers.filter((l) => l.id !== opts.replaceId);
    const { layers, alignment } = recompute([...others, layer]);
    void repository.save({ id: layer.id, name: layer.name, fileName, text, source: layer.source, importedAt: layer.importedAt });
    if (opts.replaceId) void repository.remove(opts.replaceId);
    const s = layer.stats;
    const summary = `${s.accepted} feature(s) accepted${s.rejected ? `, ${s.rejected} rejected` : ''}${s.nonSpatial ? `, ${s.nonSpatial} without geometry` : ''} · ${Object.entries(s.byGeometry).map(([k, v]) => `${v} ${k}`).join(', ') || 'no geometry'}`;
    set((st2) => ({
      layers, alignment, dataVersion: st2.dataVersion + 1,
      selection: opts.replaceId && st2.selection?.layerId === opts.replaceId ? null : st2.selection,
      history: [{ id: `H${Date.now()}${Math.random()}`, at: now(), fileName, action, ok: true, layerName: layer.name, summary }, ...st2.history],
    }));
    if (!opts.silent) get().toast(s.rejected ? 'warning' : 'success', `${layer.name}: ${summary}`);
    return { ok: true, layer };
  },

  async importFiles(files) {
    let firstOk: GeoLayer | undefined;
    for (const f of files) {
      if (!/\.(geo)?json$/i.test(f.name)) { get().toast('error', `${f.name}: unsupported file type. Please upload .geojson or .json files.`); set((s) => ({ history: [{ id: `H${Date.now()}${Math.random()}`, at: now(), fileName: f.name, action: 'import', ok: false, summary: 'Unsupported file type (expected .geojson / .json)' }, ...s.history] })); continue; }
      if (f.size > 250 * 1024 * 1024) { get().toast('error', `${f.name}: file is larger than 250 MB.`); continue; }
      const text = await f.text();
      const r = get().importText(text, f.name, { source: 'upload' });
      if (r.ok && !firstOk) firstOk = r.layer;
    }
    if (firstOk?.stats.bbox) get().flyTo({ bbox: firstOk.stats.bbox });
  },

  loadDemo(id = 'nh5') {
    const st = get();
    if (st.demoSet === id && st.layers.some((l) => l.source === 'demo')) return;
    const demo = DEMO_SETS.find((d) => d.id === id)!;
    let layers = st.layers.filter((l) => l.source !== 'demo');
    const hist: ImportRecord[] = [];
    for (const d of demo.files) {
      const r = ingestGeoJSONText(d.text, d.fileName, { source: 'demo', kind: d.kind, visible: d.visible, order: orderSeq++, clusterThreshold: st.view.clusterThreshold });
      if (r.ok && id === 'nh5' && !r.layer.synthetic) r.layer.description = (r.layer.description ?? '') + ' — real open data (datta07/INDIAN-SHAPEFILES, MIT).';
      if (r.ok) { layers.push(r.layer); hist.push({ id: `H${Date.now()}${Math.random()}`, at: now(), fileName: d.fileName, action: 'demo', ok: true, layerName: r.layer.name, summary: `${r.layer.stats.accepted} synthetic feature(s)` }); }
      else hist.push({ id: `H${Date.now()}${Math.random()}`, at: now(), fileName: d.fileName, action: 'demo', ok: false, summary: r.error });
    }
    const rc = recompute(layers);
    set((s) => ({ ...rc, demoSet: id, selection: null, corridor: null, dataVersion: s.dataVersion + 1, history: [...hist.reverse(), ...s.history] }));
  },

  removeDemo() {
    const st = get();
    const rc = recompute(st.layers.filter((l) => l.source !== 'demo'));
    set((s) => ({ ...rc, demoSet: null, selection: null, dataVersion: s.dataVersion + 1, corridor: null, history: [{ id: `H${Date.now()}`, at: now(), fileName: 'demo dataset', action: 'remove', ok: true, summary: 'Demonstration layers removed' }, ...s.history] }));
  },

  removeLayer(id) {
    const st = get(); const l = st.layers.find((x) => x.id === id); if (!l) return;
    const rc = recompute(st.layers.filter((x) => x.id !== id));
    void repository.remove(id);
    set((s) => ({ ...rc, selection: s.selection?.layerId === id ? null : s.selection, dataVersion: s.dataVersion + 1, history: [{ id: `H${Date.now()}`, at: now(), fileName: l.fileName, action: 'remove', ok: true, layerName: l.name, summary: 'Layer removed' }, ...s.history] }));
  },

  renameLayer(id, name) {
    const l = get().layers.find((x) => x.id === id); if (!l || !name.trim() || name === l.name) return;
    set((s) => ({ layers: s.layers.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)), history: [{ id: `H${Date.now()}`, at: now(), fileName: l.fileName, action: 'rename', ok: true, layerName: name.trim(), summary: `Renamed from “${l.name}”` }, ...s.history] }));
  },

  reloadLayer(id) {
    const l = get().layers.find((x) => x.id === id); if (!l) return;
    const r = get().importText(l.rawText, l.fileName, { source: l.source === 'demo' ? 'demo' : 'upload', kind: l.kind, replaceId: id, silent: true });
    if (r.ok) {
      set((s) => ({ layers: s.layers.map((x) => (x.id === r.layer!.id ? { ...x, name: l.name, source: l.source } : x)), history: s.history.map((h, i) => (i === 0 ? { ...h, action: 'reload' } : h)) }));
      get().toast('success', `${l.name} reloaded and re-validated (${r.layer!.stats.accepted} features).`);
    }
  },

  async replaceLayer(id, file) {
    const l = get().layers.find((x) => x.id === id); if (!l) return;
    const text = await file.text();
    const r = get().importText(text, file.name, { source: 'upload', replaceId: id });
    if (r.ok && r.layer?.stats.bbox) get().flyTo({ bbox: r.layer.stats.bbox });
  },

  patchLayer(id, patch) { set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })); },
  setAllLayersVisible(visible) { set((s) => ({ layers: s.layers.map((l) => ({ ...l, visible })) })); },

  select(selection, fly = false) {
    set({ selection });
    if (selection && fly) {
      const l = get().layers.find((x) => x.id === selection.layerId);
      const f = l?.data.features[Number(selection.fid.split(':')[1])];
      if (f?.geometry) {
        import('../geo/ingest').then(({ geometryBbox }) => { const bb = geometryBbox(f.geometry as any); if (bb) get().flyTo({ bbox: bb }); });
      }
    }
  },

  setFilters(patch) { set((s) => ({ filters: { ...s.filters, ...patch } })); },
  clearFilters() { set({ filters: EMPTY_FILTERS }); },
  setView(patch) { set((s) => ({ view: { ...s.view, ...patch } })); },
  setHeatmap(k, v) { set((s) => ({ view: { ...s.view, heatmaps: { ...s.view.heatmaps, [k]: v } } })); },
  setTool(tool) { set((s) => ({ tool: s.tool === tool ? 'none' : tool, measure: tool === 'measure' ? { points: [], done: false } : s.measure, corridorPick: [] })); },
  setCorridor(corridor) { set({ corridor }); },
  setCorridorPick(corridorPick) { set({ corridorPick }); },
  setMeasure(measure) { set({ measure }); },
  flyTo(r) { set({ fly: { ...r, ts: Date.now() } }); },
  toast(kind, text) { const id = toastSeq++; set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] })); setTimeout(() => get().dismissToast(id), kind === 'error' ? 9000 : 5000); },
  dismissToast(id) { set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })); },
  setLayerPanelOpen(layerPanelOpen) { set({ layerPanelOpen }); },
  setFilterPanelOpen(filterPanelOpen) { set({ filterPanelOpen }); },

  setPriorityBudget(budgetCr) { set((s) => ({ priority: { ...s.priority, budgetCr: Math.max(0, budgetCr) } })); },
  setPriorityYears(years) { set((s) => ({ priority: { ...s.priority, years: Math.max(1, Math.min(5, Math.round(years))) } })); },
  setPriorityWeights(patch) { set((s) => ({ priority: { ...s.priority, weights: { ...s.priority.weights, ...patch } } })); },
  setPriorityInterventions(interventions) { set((s) => ({ priority: { ...s.priority, interventions } })); },
  resetPriorityInterventions() { set((s) => ({ priority: { ...s.priority, interventions: DEFAULT_INTERVENTIONS } })); },
  setPriorityShowLayer(v) { set((s) => ({ priority: { ...s.priority, showLayer: v } })); },
}));

/** Look up a feature by selection. */
export function getFeature(layers: GeoLayer[], sel: Selection | null) {
  if (!sel) return null;
  const layer = layers.find((l) => l.id === sel.layerId); if (!layer) return null;
  const feature = layer.data.features[Number(sel.fid.split(':').pop())];
  return feature ? { layer, feature } : null;
}
