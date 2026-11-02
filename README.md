# NORTHKAIRN — Highway Digital Twin

A GeoJSON-driven, interactive 3D digital twin for highway infrastructure. Built with React, TypeScript,
MapLibre GL JS, Turf.js, Recharts, Tailwind CSS (shadcn/ui-style components), Zustand and Lucide icons.

> **Demo data notice.** Two demo datasets are bundled (Data Management → Demonstration datasets):
>
> 1. **NH 5 near Chandigarh (default).** The alignment Kharar – Mohali – Zirakpur – Parwanoo (65 km), the bridge
>    and flyover locations, and the boundaries of Chandigarh UT, SAS Nagar, Rupnagar and Panchkula are **real open data**
>    from [datta07/INDIAN-SHAPEFILES](https://github.com/datta07/INDIAN-SHAPEFILES) (MIT, data vintage about 2019).
>    **All condition, traffic, defect, incident, sensor and maintenance values are synthetic.** The chainage is a section
>    chainage (Km 0 at the western end), not NHAI's official chainage. Regenerate with
>    `python3 scripts/generate_nh5.py <INDIAN-SHAPEFILES checkout>`.
> 2. **NKC-7 Aravalli Corridor**: a fully fictional, synthetic 100 km corridor (`npm run demo:generate`).
>
> Synthetic files carry `metadata.synthetic: true`, and the UI labels them wherever they appear.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # production build (dist/)
SINGLE=1 npm run build # one self-contained dist/index.html
npm test                # vitest — decision-engine unit tests
npm run demo:generate  # regenerate the synthetic demo GeoJSON (deterministic)
```

## Deployment & access

Netlify builds and publishes `dist/` on every push to `main` (see `netlify.toml`). The deployed site is
gated by a passcode (`netlify/edge-functions/gate.ts`): nothing — not the HTML, not the JS bundle — is
served until a visitor enters the code. Set it once in Netlify → Site configuration → Environment
variables → `SITE_PASSWORD`; the password is never stored in this repo. Leaving it unset disables the
gate (the site behaves as before).

## What it does

| Area | Implementation |
|---|---|
| **3D map** | MapLibre GL JS. 2D/3D toggle, terrain, sky/fog, extruded buildings and bridges, rotate/pitch/zoom controls, scale bar. |
| **Basemap** | No paid provider required. The default is an **offline synthetic DEM and synthetic aerial imagery**, generated in Web Workers through MapLibre custom protocols (`nkdem://`, `nksat://`). A **Street map** option renders a live OpenFreeMap vector style (`tiles.openfreemap.org`, OSM data) alongside the twin's own layers, terrain and tools; its style URL is configurable in Settings (e.g. to point at a self-hosted Protomaps server). Settings → *Basemap source* also accepts any XYZ raster URL you are licensed to use. |
| **GeoJSON pipeline** | `src/geo/` (pure TypeScript, no UI): parse with line/column errors → validate (RFC 7946, EPSG:4326) → normalise attributes → flatten GeometryCollections for rendering → enrich with chainage / offset / district. Supports Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon and GeometryCollection. |
| **No silent drops** | Rejected features are listed with a reason, for example coordinates outside the WGS84 range (a probable projected CRS such as UTM) or an unsupported type like `Circle`. Null-geometry features are kept and listed. Unclosed rings are closed and reported. |
| **Layers** | Drag-and-drop or multi-file upload. Each file becomes its own layer with visibility, colour, opacity, feature count, info, zoom-to, rename, reload (re-validate), replace and remove. The import history is kept for the session. |
| **Styling** | Layer kind is inferred from the file name, the `name` field and the attributes. Road segments can be coloured by layer colour, condition or traffic. Point layers with more than 400 features are clustered (configurable). |
| **Asset panel** | Shows every GeoJSON property. Key fields (ID, type, location, condition, last inspection, maintenance status, risk) display **"Not available"** when absent. It also includes coordinates, length/area, chainage, district, images, inspection history, sensor readings, related maintenance and alerts. |
| **Analytics** | Asset health, traffic flow (time series from `observations`), road condition, incidents, maintenance forecast, alerts and field devices. **All panels are computed from the loaded features after filters.** If the needed attributes are missing, the panel shows an empty state. |
| **Advanced** | Heatmaps (traffic density, accidents, defects, flood risk), pulsing risk indicators and callouts, a distance-measurement tool, corridor analysis (Km range plus buffer, via inputs or by picking on the map), animated traffic, and a copyable Markdown report and CSV. |
| **Prioritization & Budget** | Splits the alignment into 1 km segments, scores a deterioration curve and 4 standard interventions, and greedily ranks segments by benefit per rupee within a ₹ Crore budget and 1-5 year planning period — see the dedicated section below. |
| **Search & filters** | Debounced global search across asset IDs, names, segments, bridges, incidents, `Km 168.4` / `168+400` chainages and `lat, lng` coordinates. Filters cover category, condition, risk, maintenance status, Km range and district, and they update the map and every panel together. |

### Recognised attributes (any casing)

`asset_id`, `name`, `asset_type`, `location`, `condition` / `pci` / `condition_rating` / `status` / `severity`,
`risk_level`, `maintenance_status`, `last_inspection`, `next_inspection_due`, `inspection_history[]`,
`km` / `chainage` / `km_start`+`km_end`, `height_m` / `floors`, `base_height_m`,
`traffic_volume_vph`, `avg_speed_kmh`, `congestion_level` / `vc_ratio`,
`observations[] {t, volume_vph, avg_speed_kmh}`, `incident_type`, `reported_at`, `work_order`,
`start_date`, `end_date`, `images[]`. Anything else is still shown verbatim in the asset panel.

## Architecture

```
src/
  geo/        types, validate, classify (attribute normalisation), ingest, alignment (chainage index), filters
  data/       repository.ts (InMemory + HttpDatasetRepository for a future PostGIS API), demo.ts, sensorFeed.ts
  analytics/  compute.ts — pure statistics from features
  decision/   Prioritization & Budget engine (segments, deterioration, interventions, optimise, scenarios) — pure TypeScript, vitest unit tests
  map/        MapView, layerSpecs (style builder), overlays, vehicles, terrainCore + terrain.worker (synthetic basemap)
  state/      Zustand store (layers, filters, view, tools, selection, history, prioritization config)
  components/ shell, panels (Recharts), asset panel, layer panel, search, filters, ui/ (shadcn-style primitives)
  sections/   Assets, Traffic, Roads, Maintenance, Prioritization, Incidents, Analytics & Reports, Data Management, Settings
scripts/generate-demo.ts  — deterministic synthetic corridor generator
```

### Prioritization & Budget

Answers "which sections should we fix first with budget X, and what happens in 5 years if we do or don't": `src/decision/` is a pure-TypeScript engine, independent of React.

- **Segments** (`segments.ts`) — the alignment is split into ~1 km segments; each one's condition, traffic and risk are the mean (or worst, for risk/maintenance) of the features inside it.
- **Deterioration** (`deterioration.ts`) — condition drops every year, faster under heavier traffic and faster still the worse the road already is. Rates are assumptions, in `config.ts`.
- **Interventions** (`interventions.ts`) — 4 standard treatments (routine maintenance, preventive preservation, overlay/resurfacing, reconstruction), each with a cost (₹ Lakh/km), a condition gain and a service life. Defaults live in `config.ts` and are **editable per session in Settings → Prioritization**.
- **Optimise** (`optimise.ts`) — for a given budget (₹ Crore) and planning period (1-5 years), picks the best-value intervention per segment and greedily funds segments in benefit-per-rupee order until the budget runs out. The weighting sliders (condition / traffic / safety / risk) change which factor dominates the benefit score.
- **Scenarios** (`scenarios.ts`) — compares several fixed budgets (including "do nothing" at ₹0 Cr) over 5 years of simulated deterioration, for the chart in the Prioritization section.

The ranking, the "network condition over 5 years" chart and the map's optional **Priority** layer (Layers → Overlays) all read the same engine. With demo data the costs, gains and resulting ranking are illustrative, not a real pavement management recommendation — the Prioritization section says so.

**Backend readiness.** Components talk to a `DatasetRepository` interface. `HttpDatasetRepository`
documents the REST contract for a PostgreSQL/PostGIS service (`ST_AsGeoJSON`, viewport `bbox`
queries). Live data plugs into the `SensorFeed` interface. The current `SimulatedSensorFeed` replays
stored hourly observations at the current IST time, and the UI labels it "sim."

**Performance.** Filters are evaluated as MapLibre expressions on the GPU, and as the same predicate in JS
for the panels. Layers use viewport tiling (geojson-vt) and clustering. Basemap tiles are generated in workers.
Search is debounced. The vehicle animation renders only inside the cached viewport. The app avoids
terrain GPU read-backs: km labels are a symbol layer, callouts and the scale bar are positioned with
`map.project`.

**deck.gl / Three.js.** Neither is needed yet. MapLibre's native fill-extrusion, heatmap and terrain
draping cover the current views, and they stay correctly draped on terrain. The `layerSpecs` builder is
where a `MapboxOverlay` from `@deck.gl/mapbox` would go for GPU-scale visuals (e.g. Trips for
real vehicle traces).

## Limitations (honest list)

- Terrain and imagery are synthetic and exist only around the fictional NKC-7 corridor. Around NH 5 the map shows the dark basemap until you add a licensed raster source in Settings. Other regions show the dark basemap unless you configure a real raster source.
- Uploaded data is kept in memory for the session. Persistence needs the PostGIS repository.
- The traffic animation is illustrative: its density and speeds follow the segment attributes, but it is not a traffic model.
- Inside sandboxed previews such as the hosted artifact, remote tiles, file downloads and (sometimes) the clipboard are blocked by the host.
