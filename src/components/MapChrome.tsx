import { Box, Compass, Expand, Minus, Plus, Ruler, ScanLine, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mapHandle } from '../map/MapView';
import { lengthM } from '../map/overlays';
import { syntheticBounds } from '../map/terrain';
import { cn } from '../lib/utils';
import { useStore } from '../state/store';
import { Button } from './ui/button';
import { Segmented, SyntheticTag } from './ui/misc';

function useBearing() {
  const [b, setB] = useState(0);
  useEffect(() => {
    let off: (() => void) | undefined; const t = setInterval(() => {
      const m = mapHandle.map; if (!m || off) return;
      const h = () => setB(m.getBearing()); m.on('rotate', h); off = () => m.off('rotate', h); clearInterval(t);
    }, 200);
    return () => { clearInterval(t); off?.(); };
  }, []);
  return b;
}

export function MapToolbar() {
  const view = useStore((s) => s.view); const setView = useStore((s) => s.setView); const tool = useStore((s) => s.tool); const setTool = useStore((s) => s.setTool);
  const layers = useStore((s) => s.layers); const flyTo = useStore((s) => s.flyTo); const alignment = useStore((s) => s.alignment);
  const bearing = useBearing();
  const fitAll = () => {
    const bbs = layers.filter((l) => l.visible && l.stats.bbox && l.kind !== 'landuse' && l.kind !== 'boundary').map((l) => l.stats.bbox!);
    if (!bbs.length) return;
    flyTo({ bbox: [Math.min(...bbs.map((b) => b[0])), Math.min(...bbs.map((b) => b[1])), Math.max(...bbs.map((b) => b[2])), Math.max(...bbs.map((b) => b[3]))] });
  };
  const Btn = ({ label, onClick, active, children, disabled }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode; disabled?: boolean }) => (
    <button title={label} aria-label={label} onClick={onClick} disabled={disabled} aria-pressed={active}
      className={cn('grid size-9 place-items-center rounded-lg text-slate-300 transition-all hover:bg-white/[0.08] hover:text-white disabled:opacity-30', active && 'bg-cyan-400/20 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]')}>{children}</button>
  );
  return (
    <div className="nk-glass flex flex-col gap-0.5 rounded-xl p-1">
      <Btn label="Reset north" onClick={() => mapHandle.map?.easeTo({ bearing: 0, duration: 600 })}><Compass className="size-[18px]" style={{ transform: `rotate(${-bearing - 45}deg)` }} /></Btn>
      <Btn label={view.dimension === '3d' ? 'Switch to 2D map view' : 'Switch to 3D terrain view'} active={view.dimension === '3d'} onClick={() => setView({ dimension: view.dimension === '3d' ? '2d' : '3d' })}><span className="text-[11.5px] font-bold">{view.dimension === '3d' ? '3D' : '2D'}</span></Btn>
      <div className="mx-2 my-0.5 h-px bg-white/[0.07]" />
      <Btn label="Zoom in" onClick={() => mapHandle.map?.zoomIn()}><Plus className="size-[18px]" /></Btn>
      <Btn label="Zoom out" onClick={() => mapHandle.map?.zoomOut()}><Minus className="size-[18px]" /></Btn>
      <Btn label="Rotate view 45°" onClick={() => mapHandle.map?.easeTo({ bearing: (mapHandle.map.getBearing() + 45) % 360, duration: 700 })}><Box className="size-[17px]" /></Btn>
      <Btn label="Fit all visible data" onClick={fitAll}><Expand className="size-[17px]" /></Btn>
      <div className="mx-2 my-0.5 h-px bg-white/[0.07]" />
      <Btn label="Measure distance" active={tool === 'measure'} onClick={() => setTool('measure')}><Ruler className="size-[17px]" /></Btn>
      <Btn label={alignment ? 'Corridor analysis: pick a highway section' : 'Corridor analysis needs a highway layer'} disabled={!alignment} active={tool === 'corridor'} onClick={() => setTool('corridor')}><ScanLine className="size-[17px]" /></Btn>
    </div>
  );
}

export function BasemapSwitch() {
  const view = useStore((s) => s.view); const setView = useStore((s) => s.setView); const alignment = useStore((s) => s.alignment);
  const bb = syntheticBounds(); const c = alignment?.pointAt((alignment.km0 + alignment.kmEnd) / 2);
  const covered = !c || (c[0] > bb[0] && c[0] < bb[2] && c[1] > bb[1] && c[1] < bb[3]);
  const opts: { value: 'dark' | 'satellite' | 'street' | 'custom'; label: string; title: string }[] = [
    { value: 'dark', label: 'Dark', title: 'Dark map with hillshade' },
    { value: 'satellite', label: 'Satellite', title: 'Synthetic aerial imagery (offline demo)' },
    { value: 'street', label: 'Street map', title: 'OpenFreeMap vector street map (live, OpenStreetMap data)' },
  ];
  if (view.customTileUrl.trim()) opts.push({ value: 'custom', label: 'Custom', title: 'Custom raster tiles from Settings' });
  return (
    <div className="nk-glass flex items-center gap-2 rounded-xl p-1 pr-2.5">
      <Segmented size="sm" value={view.dimension} onChange={(v) => setView({ dimension: v })} options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D terrain' }]} />
      <Segmented size="sm" value={view.basemap} onChange={(v) => setView({ basemap: v })} options={opts} />
      <span className="text-[10px] leading-tight text-slate-500">{view.basemap === 'custom' ? 'Custom tiles' : view.basemap === 'street' ? 'Live vector tiles (OpenFreeMap)' : covered ? <>Terrain & imagery:<br /><span className="text-amber-300/80">synthetic, generated offline</span></> : <>No terrain/imagery here.<br /><span className="text-amber-300/80">Add licensed tiles in Settings</span></>}</span>
    </div>
  );
}

export function BasemapAttribution() {
  const basemap = useStore((s) => s.view.basemap);
  if (basemap !== 'street') return null;
  return <div className="nk-glass select-none rounded-md px-1.5 py-0.5 text-[9.5px] leading-none text-slate-400">OpenFreeMap © OpenMapTiles Data from OpenStreetMap</div>;
}

export function MapTitle() {
  const alignment = useStore((s) => s.alignment); const layers = useStore((s) => s.layers); const demoSet = useStore((s) => s.demoSet);
  const synthetic = layers.some((l) => l.synthetic);
  if (!layers.length) return null;
  const name = alignment?.name ?? layers[0].name;
  return (
    <div className="pointer-events-none select-none">
      <div className="flex items-center gap-2 text-[22px] font-semibold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">{name.replace(' Aravalli Corridor', ' · Aravalli Corridor')}{synthetic && <SyntheticTag className="pointer-events-auto" />}</div>
      <div className="mt-0.5 text-[13px] text-slate-300 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">Digital Twin {alignment ? `| ${(alignment.kmEnd - alignment.km0).toFixed(0)} km (Km ${alignment.km0.toFixed(0)} – ${alignment.kmEnd.toFixed(0)})` : ''}{demoSet === 'nh5' ? ' · real alignment, synthetic attribute values' : demoSet === 'nkc7' ? ' · fictional corridor' : ''}</div>
    </div>
  );
}

export function ToolReadout() {
  const tool = useStore((s) => s.tool); const measure = useStore((s) => s.measure); const setMeasure = useStore((s) => s.setMeasure); const setTool = useStore((s) => s.setTool);
  const pick = useStore((s) => s.corridorPick);
  if (tool === 'measure' || measure.done && measure.points.length > 1) {
    const m = lengthM(measure.points); const segs = measure.points.slice(1).map((p, i) => lengthM([measure.points[i], p]));
    return (
      <div className="nk-glass nk-fade flex items-center gap-3 rounded-xl px-3.5 py-2">
        <Ruler className="size-4 text-yellow-300" />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tabular-nums text-white">{m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${m.toFixed(1)} m`}<span className="ml-2 text-[11px] font-normal text-slate-400">{measure.points.length} point(s){segs.length > 1 ? ` · last leg ${segs[segs.length - 1] >= 1000 ? (segs[segs.length - 1] / 1000).toFixed(2) + ' km' : segs[segs.length - 1].toFixed(0) + ' m'}` : ''}</span></div>
          <div className="text-[11px] text-slate-400">{measure.done ? 'Measurement finished — click the map to start a new one.' : 'Click to add points · double-click to finish'}</div>
        </div>
        <Button size="iconSm" variant="ghost" title="Undo last point" aria-label="Undo last point" disabled={!measure.points.length} onClick={() => setMeasure({ points: measure.points.slice(0, -1), done: false })}><Undo2 /></Button>
        <Button size="sm" variant="secondary" onClick={() => { setMeasure({ points: [], done: false }); if (tool !== 'measure') setTool('measure'); }}>Clear</Button>
        <Button size="iconSm" variant="ghost" aria-label="Close measure tool" onClick={() => { setMeasure({ points: [], done: false }); if (tool === 'measure') setTool('measure'); }}><X /></Button>
      </div>
    );
  }
  if (tool === 'corridor') return (
    <div className="nk-glass nk-fade flex items-center gap-3 rounded-xl px-3.5 py-2">
      <ScanLine className="size-4 text-violet-300" />
      <div className="text-[12.5px] text-slate-200">{pick.length === 0 ? 'Click the START of the highway section to analyse' : `Start Km ${pick[0].toFixed(2)} — now click the END of the section`}</div>
      <Button size="iconSm" variant="ghost" aria-label="Cancel corridor picking" onClick={() => setTool('corridor')}><X /></Button>
    </div>
  );
  return null;
}
