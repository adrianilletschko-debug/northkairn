/**
 * Optional demonstration dataset — a FICTIONAL 100 km corridor ("NKC-7 Aravalli Corridor").
 * The files are ordinary GeoJSON and are loaded through exactly the same import pipeline as user uploads.
 * Regenerate with `npm run demo:generate`.
 */
import highway from '../demo/geojson/01_highway_network.geojson?raw';
import segments from '../demo/geojson/02_road_segments.geojson?raw';
import bridges from '../demo/geojson/03_bridges_flyovers.geojson?raw';
import buildings from '../demo/geojson/04_buildings.geojson?raw';
import water from '../demo/geojson/05_water_bodies.geojson?raw';
import drainage from '../demo/geojson/06_drainage.geojson?raw';
import sensors from '../demo/geojson/07_traffic_sensors.geojson?raw';
import cameras from '../demo/geojson/08_cctv_cameras.geojson?raw';
import defects from '../demo/geojson/09_road_defects.geojson?raw';
import maintenance from '../demo/geojson/10_maintenance_zones.geojson?raw';
import flood from '../demo/geojson/11_flood_risk.geojson?raw';
import admin from '../demo/geojson/12_admin_boundaries.geojson?raw';
import landuse from '../demo/geojson/13_land_use.geojson?raw';
import incidents from '../demo/geojson/14_incidents.geojson?raw';
import kms from '../demo/geojson/15_km_markers.geojson?raw';
import lighting from '../demo/geojson/16_signage_lighting.geojson?raw';
import nh5Highway from '../demo/nh5/01_highway_network.geojson?raw';
import nh5Segments from '../demo/nh5/02_road_segments.geojson?raw';
import nh5Bridges from '../demo/nh5/03_bridges_flyovers.geojson?raw';
import nh5Sensors from '../demo/nh5/07_traffic_sensors.geojson?raw';
import nh5Cameras from '../demo/nh5/08_cctv_cameras.geojson?raw';
import nh5Defects from '../demo/nh5/09_road_defects.geojson?raw';
import nh5Works from '../demo/nh5/10_maintenance_zones.geojson?raw';
import nh5Admin from '../demo/nh5/12_admin_boundaries.geojson?raw';
import nh5Incidents from '../demo/nh5/14_incidents.geojson?raw';
import nh5Kms from '../demo/nh5/15_km_markers.geojson?raw';
import type { LayerKind } from '../geo/types';

export interface DemoFile { fileName: string; text: string; kind: LayerKind; visible: boolean }
export type DemoSetId = 'nh5' | 'nkc7';
export interface DemoSet { id: DemoSetId; name: string; description: string; files: DemoFile[] }

/** NH 5 near Chandigarh: REAL highway, bridge/flyover and boundary geometry (open data, MIT) + SYNTHETIC attribute values. */
export const NH5_FILES: DemoFile[] = [
  { fileName: 'nh5_01_highway_network.geojson', text: nh5Highway, kind: 'highway', visible: true },
  { fileName: 'nh5_02_road_segments.geojson', text: nh5Segments, kind: 'road', visible: true },
  { fileName: 'nh5_03_bridges_flyovers.geojson', text: nh5Bridges, kind: 'bridge', visible: true },
  { fileName: 'nh5_07_traffic_sensors.geojson', text: nh5Sensors, kind: 'sensor', visible: true },
  { fileName: 'nh5_08_cctv_cameras.geojson', text: nh5Cameras, kind: 'camera', visible: true },
  { fileName: 'nh5_09_road_defects.geojson', text: nh5Defects, kind: 'defect', visible: true },
  { fileName: 'nh5_10_maintenance_zones.geojson', text: nh5Works, kind: 'maintenance', visible: true },
  { fileName: 'nh5_12_admin_boundaries.geojson', text: nh5Admin, kind: 'boundary', visible: true },
  { fileName: 'nh5_14_incidents.geojson', text: nh5Incidents, kind: 'incident', visible: true },
  { fileName: 'nh5_15_km_markers.geojson', text: nh5Kms, kind: 'marker', visible: true },
];

export const DEMO_FILES: DemoFile[] = [
  { fileName: '01_highway_network.geojson', text: highway, kind: 'highway', visible: true },
  { fileName: '02_road_segments.geojson', text: segments, kind: 'road', visible: true },
  { fileName: '03_bridges_flyovers.geojson', text: bridges, kind: 'bridge', visible: true },
  { fileName: '04_buildings.geojson', text: buildings, kind: 'building', visible: true },
  { fileName: '05_water_bodies.geojson', text: water, kind: 'water', visible: true },
  { fileName: '06_drainage.geojson', text: drainage, kind: 'drainage', visible: false },
  { fileName: '07_traffic_sensors.geojson', text: sensors, kind: 'sensor', visible: true },
  { fileName: '08_cctv_cameras.geojson', text: cameras, kind: 'camera', visible: true },
  { fileName: '09_road_defects.geojson', text: defects, kind: 'defect', visible: true },
  { fileName: '10_maintenance_zones.geojson', text: maintenance, kind: 'maintenance', visible: true },
  { fileName: '11_flood_risk.geojson', text: flood, kind: 'flood', visible: false },
  { fileName: '12_admin_boundaries.geojson', text: admin, kind: 'boundary', visible: true },
  { fileName: '13_land_use.geojson', text: landuse, kind: 'landuse', visible: true },
  { fileName: '14_incidents.geojson', text: incidents, kind: 'incident', visible: true },
  { fileName: '15_km_markers.geojson', text: kms, kind: 'marker', visible: true },
  { fileName: '16_signage_lighting.geojson', text: lighting, kind: 'lighting', visible: false },
];

export const DEMO_SETS: DemoSet[] = [
  { id: 'nh5', name: 'NH 5 near Chandigarh', description: 'Real alignment Kharar – Mohali – Zirakpur – Parwanoo (65 km), real bridge/flyover locations and district boundaries from open data. All condition, traffic and incident values are synthetic.', files: NH5_FILES },
  { id: 'nkc7', name: 'NKC-7 Aravalli Corridor (fictional)', description: 'Fully synthetic 100 km corridor with buildings, land use, rivers, synthetic terrain and imagery.', files: DEMO_FILES },
];
