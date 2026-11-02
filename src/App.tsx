import { CircleCheck, CircleX, Info, TriangleAlert, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AssetPanel } from './components/AssetPanel';
import { FilterPanel } from './components/FilterPanel';
import { Header } from './components/Header';
import { LayerPanel } from './components/LayerPanel';
import { BasemapAttribution, BasemapSwitch, MapTitle, MapToolbar, ToolReadout } from './components/MapChrome';
import { AlertsPanel, AssetHealthPanel, IncidentsPanel, MaintenancePanel, RoadConditionPanel, TrafficFlowPanel } from './components/panels/Panels';
import { Sidebar } from './components/Sidebar';
import { MapView } from './map/MapView';
import { AnalyticsSection } from './sections/AnalyticsSection';
import { AssetsSection } from './sections/AssetsSection';
import { DataSection } from './sections/DataSection';
import { IncidentsSection } from './sections/IncidentsSection';
import { MaintenanceSection } from './sections/MaintenanceSection';
import { RoadsSection } from './sections/RoadsSection';
import { SettingsSection } from './sections/SettingsSection';
import { TrafficSection } from './sections/TrafficSection';
import { useStore, type Section } from './state/store';

const SECTION_HASH: Section[] = ['overview', 'twin', 'assets', 'traffic', 'roads', 'maintenance', 'incidents', 'analytics', 'data', 'settings'];

export function App() {
  const section = useStore((s) => s.section);
  const loadDemo = useStore((s) => s.loadDemo);
  useEffect(() => { loadDemo(); (window as any).__nkstore = useStore; }, []);
  // section ↔ #hash (bookmarkable views)
  useEffect(() => {
    const fromHash = () => { const h = location.hash.replace('#', '') as Section; if (SECTION_HASH.includes(h) && h !== useStore.getState().section) useStore.getState().setSection(h); };
    fromHash(); window.addEventListener('hashchange', fromHash); return () => window.removeEventListener('hashchange', fromHash);
  }, []);
  useEffect(() => { try { if (location.hash.replace('#', '') !== section) history.replaceState(null, '', `#${section}`); } catch { /* sandboxed */ } }, [section]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { const st = useStore.getState(); if (st.tool !== 'none') st.setTool(st.tool); else if (st.filterPanelOpen) st.setFilterPanelOpen(false); else st.select(null); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  const right: Partial<Record<Section, { w: string; node: ReactNode }>> = {
    overview: { w: 'w-[360px]', node: <div className="flex h-full min-h-0 flex-col gap-4"><AssetHealthPanel /><TrafficFlowPanel compact /><AlertsPanel className="min-h-0 flex-1" /></div> },
    assets: { w: 'w-[500px]', node: <AssetsSection /> },
    traffic: { w: 'w-[420px]', node: <TrafficSection /> },
    roads: { w: 'w-[440px]', node: <RoadsSection /> },
    maintenance: { w: 'w-[480px]', node: <MaintenanceSection /> },
    incidents: { w: 'w-[440px]', node: <IncidentsSection /> },
    analytics: { w: 'w-[480px]', node: <AnalyticsSection /> },
    data: { w: 'w-[560px]', node: <DataSection /> },
    settings: { w: 'w-[460px]', node: <SettingsSection /> },
  };
  const r = right[section];
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Header />
        <FilterPanel />
        <main className="flex min-h-0 flex-1 gap-4 p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <MapStage />
            {section === 'overview' && (
              <div className="grid h-[214px] shrink-0 grid-cols-3 gap-4">
                <RoadConditionPanel /><IncidentsPanel /><MaintenancePanel />
              </div>
            )}
          </div>
          {r && <div key={section} className={`nk-fade flex min-h-0 shrink-0 flex-col ${r.w}`}>{r.node}</div>}
        </main>
        <Toasts />
      </div>
    </div>
  );
}

function MapStage() {
  const [drag, setDrag] = useState(false); const depth = useRef(0);
  const section = useStore((s) => s.section);
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#060b16] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]"
      onDragEnter={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); depth.current++; setDrag(true); } }}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); depth.current = 0; setDrag(false); const files = [...e.dataTransfer.files]; if (files.length) void useStore.getState().importFiles(files); }}>
      <MapView />
      <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_80px_rgba(2,6,15,0.85)]" />
      <div className="pointer-events-none absolute left-5 top-4 z-10 flex max-h-[calc(100%-96px)] flex-col gap-3">
        <MapTitle />
        <div className="pointer-events-auto min-h-0">{section !== 'data' && <LayerPanel />}</div>
      </div>
      <div className="absolute right-3 top-3 z-10"><MapToolbar /></div>
      <div className="absolute right-[60px] top-3 bottom-14 z-10 flex justify-end pointer-events-none"><div className="pointer-events-auto max-h-full"><AssetPanel /></div></div>
      <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2"><ToolReadout /></div>
      <div className="absolute bottom-3 left-4 z-10"><BasemapSwitch /></div>
      <div className="absolute bottom-10 right-4 z-10"><BasemapAttribution /></div>
      {drag && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-cyan-500/10 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-cyan-300/70 bg-slate-950/80 px-10 py-8 text-center">
            <Upload className="mx-auto mb-2 size-8 text-cyan-300" />
            <div className="text-[15px] font-semibold text-white">Drop GeoJSON files to add layers</div>
            <div className="mt-1 text-[12px] text-slate-400">.geojson / .json · EPSG:4326 · multiple files supported</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts); const dismiss = useStore((s) => s.dismissToast);
  const I = { success: [CircleCheck, '#22c55e'], error: [CircleX, '#ef4444'], warning: [TriangleAlert, '#f59e0b'], info: [Info, '#38bdf8'] } as const;
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-50 flex w-[460px] -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => { const [Icon, c] = I[t.kind]; return (
        <div key={t.id} role="status" className="nk-glass-strong nk-fade pointer-events-auto flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 shadow-2xl">
          <Icon className="mt-0.5 size-4 shrink-0" style={{ color: c }} /><div className="flex-1 text-[12.5px] leading-snug text-slate-200">{t.text}</div>
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-slate-500 hover:text-slate-200"><X className="size-3.5" /></button>
        </div>); })}
    </div>
  );
}
