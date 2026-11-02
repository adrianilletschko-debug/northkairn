import type { Feature, FeatureCollection, Geometry } from 'geojson';

export type LayerKind =
  | 'highway' | 'road' | 'bridge' | 'building' | 'water' | 'drainage' | 'sensor' | 'camera'
  | 'defect' | 'maintenance' | 'flood' | 'boundary' | 'landuse' | 'incident' | 'marker' | 'lighting' | 'generic';

export const SUPPORTED_GEOMETRIES = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'] as const;
export type SupportedGeometry = (typeof SUPPORTED_GEOMETRIES)[number];

export type Condition = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical' | 'Unknown';
export const CONDITIONS: Condition[] = ['Excellent', 'Good', 'Fair', 'Poor', 'Critical'];
export type Risk = 'Low' | 'Medium' | 'High' | 'Unknown';
export const RISKS: Risk[] = ['Low', 'Medium', 'High'];
export type MaintStatus = 'None' | 'Planned' | 'Scheduled' | 'In progress' | 'Completed' | 'Overdue' | 'Open' | 'Unknown';
export const MAINT_STATUSES: MaintStatus[] = ['None', 'Planned', 'Scheduled', 'In progress', 'Overdue', 'Open', 'Completed'];

/** Normalised, app-derived properties. Prefixed with "__" so they are never shown as source attributes. */
export interface DerivedProps {
  __fid: string;
  __lid: string;
  __cat: string;      // asset category used by analytics & filtering
  __cond: Condition;
  __risk: Risk;
  __maint: MaintStatus;
  __km?: number;      // chainage along the reference alignment
  __off?: number;     // perpendicular offset from the alignment (m)
  __district?: string;
  __label: string;
  __h?: number;       // extrusion height (m)
  __b?: number;       // extrusion base (m)
  __traffic?: 'Low' | 'Moderate' | 'Heavy' | 'Critical' | 'Unknown';
  __vol?: number;
  __speed?: number;
}

export type NKFeature = Feature<Geometry | null, Record<string, any>>;

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
  featureIndex?: number;
}

export interface RejectedFeature {
  index: number;
  reason: string;
  snippet: string;
}

export interface LayerStats {
  total: number;          // features in source file
  accepted: number;       // features kept (incl. non-spatial)
  rendered: number;       // features with geometry
  nonSpatial: number;     // features with null geometry (kept, listed, not drawn)
  rejected: number;
  byGeometry: Record<string, number>;
  bbox: [number, number, number, number] | null;
  propertyKeys: string[];
  pointOnly: boolean;
}

export interface GeoLayer {
  id: string;
  name: string;
  fileName: string;
  description?: string;
  kind: LayerKind;
  color: string;
  opacity: number;
  visible: boolean;
  synthetic: boolean;
  source: 'demo' | 'upload' | 'api';
  importedAt: string;
  /** normalised features (original properties + derived "__" props). */
  data: FeatureCollection<Geometry | null, Record<string, any>>;
  /** features flattened for rendering (GeometryCollections exploded, null geometries removed). */
  renderData: FeatureCollection<Geometry, Record<string, any>>;
  issues: ValidationIssue[];
  rejected: RejectedFeature[];
  stats: LayerStats;
  /** original text, kept so the layer can be reloaded / re-validated. */
  rawText: string;
  order: number;
  cluster: boolean;
}

export interface ImportRecord {
  id: string;
  at: string;
  fileName: string;
  action: 'import' | 'replace' | 'reload' | 'remove' | 'rename' | 'demo';
  ok: boolean;
  layerName?: string;
  summary: string;
}

export interface Filters {
  categories: string[];
  conditions: Condition[];
  risks: Risk[];
  maint: MaintStatus[];
  kmRange: [number, number] | null;
  district: string | null;
}

export const EMPTY_FILTERS: Filters = { categories: [], conditions: [], risks: [], maint: [], kmRange: null, district: null };

export interface Selection {
  layerId: string;
  fid: string;
}
