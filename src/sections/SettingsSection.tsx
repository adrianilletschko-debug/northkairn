import { useState } from 'react';
import { DEFAULT_INTERVENTIONS, type Intervention } from '../decision/config';
import { DEFAULT_STREET_STYLE_URL, useStore } from '../state/store';
import { Button } from '../components/ui/button';
import { Panel, PanelHeader, Segmented } from '../components/ui/misc';
import { Slider } from '../components/ui/slider';
import { Switch } from '../components/ui/switch';
import { SectionShell } from './common';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }){
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] py-3 last:border-0"><div><div className="text-[12.5px] text-slate-200">{label}</div>{hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}</div><div className="shrink-0">{children}</div></div>
  );
}

export function SettingsSection() {
  const view = useStore((s) => s.view); const setView = useStore((s) => s.setView); const toast = useStore((s) => s.toast);
  const [url, setUrl] = useState(view.customTileUrl);
  const [streetUrl, setStreetUrl] = useState(view.streetStyleUrl);
  return (
    <SectionShell title="Settings" sub="Map, rendering and data-source configuration">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <Panel>
          <PanelHeader title="Map view" />
          <div className="px-4 pb-2">
            <Row label="View mode"><Segmented size="sm" value={view.dimension} onChange={(v) => setView({ dimension: v })} options={[{ value: '2d', label: '2D map' }, { value: '3d', label: '3D terrain' }]} /></Row>
            <Row label="Terrain exaggeration" hint="Vertical scale of the 3D terrain"><div className="flex w-[180px] items-center gap-2"><Slider value={view.terrainExaggeration} min={0.5} max={4} step={0.1} onChange={(v) => setView({ terrainExaggeration: v })} label="Terrain exaggeration" /><span className="w-9 text-right text-[12px] tabular-nums text-slate-300">{view.terrainExaggeration.toFixed(1)}×</span></div></Row>
            <Row label="3D buildings & bridges" hint="Extrude polygons that have height attributes"><Switch checked={view.extrude} onCheckedChange={(v) => setView({ extrude: v })} label="3D extrusions" /></Row>
            <Row label="Kilometre labels"><Switch checked={view.kmLabels} onCheckedChange={(v) => setView({ kmLabels: v })} label="Kilometre labels" /></Row>
            <Row label="Risk callouts" hint="Floating cards for the most critical assets & incidents"><Switch checked={view.callouts} onCheckedChange={(v) => setView({ callouts: v })} label="Risk callouts" /></Row>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Traffic animation" sub="Illustrative vehicles moving at the speeds stored in road-segment data" />
          <div className="px-4 pb-2">
            <Row label="Animated vehicles"><Switch checked={view.vehicles} onCheckedChange={(v) => setView({ vehicles: v })} label="Animated vehicles" /></Row>
            <Row label="Playback speed"><div className="flex w-[180px] items-center gap-2"><Slider value={view.vehicleSpeed} min={0.25} max={8} step={0.25} onChange={(v) => setView({ vehicleSpeed: v })} label="Playback speed" /><span className="w-9 text-right text-[12px] tabular-nums text-slate-300">{view.vehicleSpeed}×</span></div></Row>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Performance" />
          <div className="px-4 pb-2">
            <Row label="Point clustering threshold" hint="Point-only layers with more features than this are clustered. Applies to newly imported or reloaded layers.">
              <select value={view.clusterThreshold} onChange={(e) => setView({ clusterThreshold: Number(e.target.value) })} className="h-8 rounded-lg border border-white/10 bg-white/[0.03] px-2 text-[12px] focus:outline-none" aria-label="Clustering threshold">
                {[100, 400, 1000, 5000, 1e9].map((n) => <option className="bg-slate-900" key={n} value={n}>{n >= 1e9 ? 'Never' : `${n} points`}</option>)}
              </select>
            </Row>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Basemap source" sub="No paid map provider is required. The built-in terrain and imagery are generated offline (synthetic)." />
          <div className="space-y-2 px-4 pb-4 pt-2">
            <label className="text-[11.5px] text-slate-400">Custom raster tile URL (XYZ, e.g. an open imagery or OSM-based tile service you are licensed to use)
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tiles.example.org/{z}/{x}/{y}.png" className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[12px] text-slate-100 focus:border-cyan-400/50 focus:outline-none" />
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { if (!/^https?:\/\/.+\{z\}.+\{x\}.+\{y\}/.test(url.trim())) { toast('error', 'The URL must be http(s) and contain {z}, {x} and {y}.'); return; } setView({ customTileUrl: url.trim(), basemap: 'custom' }); toast('info', 'Custom basemap applied. If tiles stay blank, the host may block cross-origin requests or this page may be sandboxed (embedded previews block remote tiles).'); }}>Apply</Button>
              <Button size="sm" variant="ghost" disabled={!view.customTileUrl} onClick={() => { setUrl(''); setView({ customTileUrl: '', basemap: 'dark' }); }}>Remove</Button>
            </div>
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              <label className="text-[11.5px] text-slate-400">Street map vector style URL (MapLibre style JSON, e.g. OpenFreeMap or a self-hosted Protomaps server)
                <input value={streetUrl} onChange={(e) => setStreetUrl(e.target.value)} placeholder={DEFAULT_STREET_STYLE_URL} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[12px] text-slate-100 focus:border-cyan-400/50 focus:outline-none" />
              </label>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => { if (!/^https?:\/\//.test(streetUrl.trim())) { toast('error', 'The URL must be a valid http(s) MapLibre style URL.'); return; } setView({ streetStyleUrl: streetUrl.trim() }); toast('info', 'Street-map style updated. Switch the basemap to “Street map” to see it.'); }}>Apply</Button>
                <Button size="sm" variant="ghost" disabled={streetUrl === DEFAULT_STREET_STYLE_URL} onClick={() => { setStreetUrl(DEFAULT_STREET_STYLE_URL); setView({ streetStyleUrl: DEFAULT_STREET_STYLE_URL }); }}>Reset to OpenFreeMap</Button>
              </div>
            </div>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Prioritization" sub="Default assumptions for the Prioritization & Budget module (per km)"
            right={<Button size="sm" variant="ghost" onClick={() => useStore.getState().resetPriorityInterventions()}>Reset to defaults</Button>} />
          <InterventionsTable />
        </Panel>
        <Panel>
          <PanelHeader title="About this deployment" />
          <div className="space-y-2 px-4 pb-4 pt-2 text-[12px] leading-relaxed text-slate-400">
            <p><span className="text-slate-200">Data:</span> every map feature and statistic comes from the GeoJSON layers listed in Data Management. The demonstration corridor is fictional and synthetic; it does not represent real government infrastructure.</p>
            <p><span className="text-slate-200">Live values:</span> “simulated live” traffic figures replay each sensor’s stored observations at the current IST time. A real deployment plugs a sensor feed (WebSocket/MQTT/REST) into the same interface.</p>
            <p><span className="text-slate-200">Storage:</span> uploaded datasets are kept in memory for this session through a repository interface that is ready to be backed by a PostgreSQL/PostGIS API.</p>
          </div>
        </Panel>
      </div>
    </SectionShell>
  );
}

function InterventionsTable() {
  const interventions = useStore((s) => s.priority.interventions); const setInterventions = useStore((s) => s.setPriorityInterventions);
  const patch = (id: string, field: keyof Intervention, value: number) => setInterventions(interventions.map((iv) => (iv.id === id ? { ...iv, [field]: Math.max(0, value) } : iv)));
  const cell = (id: string, field: keyof Intervention, value: number) => (
    <input type="number" min={0} value={value} onChange={(e) => patch(id, field, Number(e.target.value))}
      className="h-7 w-20 rounded-md border border-white/10 bg-white/[0.03] px-1.5 text-right text-[11.5px] tabular-nums text-slate-100 focus:border-cyan-400/50 focus:outline-none" />
  );
  return (
    <div className="px-4 pb-4 pt-1">
      <table className="w-full text-[11.5px]">
        <thead><tr className="text-left text-slate-500"><th className="pb-1.5 font-normal">Intervention</th><th className="pb-1.5 text-right font-normal">₹ Lakh / km</th><th className="pb-1.5 text-right font-normal">Condition gain</th><th className="pb-1.5 text-right font-normal">Life (yr)</th></tr></thead>
        <tbody>{interventions.map((iv) => (
          <tr key={iv.id} className="border-t border-white/[0.05]">
            <td className="py-1.5 pr-2 text-slate-300">{iv.name}</td>
            <td className="py-1.5 text-right">{cell(iv.id, 'costPerKmLakh', iv.costPerKmLakh)}</td>
            <td className="py-1.5 text-right">{cell(iv.id, 'conditionImprovement', iv.conditionImprovement)}</td>
            <td className="py-1.5 text-right">{cell(iv.id, 'lifeYears', iv.lifeYears)}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="mt-2 text-[10.5px] leading-relaxed text-slate-500">Assumptions, not published cost schedules. Defaults: {DEFAULT_INTERVENTIONS.map((iv) => `${iv.name} ₹${iv.costPerKmLakh}L/km`).join(', ')}.</div>
    </div>
  );
}
