/**
 * Data-access layer. The UI talks only to a DatasetRepository, so the in-memory implementation
 * used today can be swapped for a PostgreSQL/PostGIS-backed API without touching components.
 */
export interface DatasetRecord {
  id: string;
  name: string;
  fileName: string;
  text: string;            // raw GeoJSON (FeatureCollection)
  source: 'demo' | 'upload' | 'api';
  importedAt: string;
  meta?: Record<string, unknown>;
}

export interface DatasetRepository {
  list(): Promise<DatasetRecord[]>;
  get(id: string): Promise<DatasetRecord | undefined>;
  save(rec: DatasetRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

export class InMemoryDatasetRepository implements DatasetRepository {
  private items = new Map<string, DatasetRecord>();
  async list() { return [...this.items.values()]; }
  async get(id: string) { return this.items.get(id); }
  async save(rec: DatasetRecord) { this.items.set(rec.id, rec); }
  async remove(id: string) { this.items.delete(id); }
}

/**
 * Future backend (PostGIS). Expected REST contract:
 *   GET    {baseUrl}/datasets                         → DatasetRecord[] (without text)
 *   GET    {baseUrl}/datasets/:id/features?bbox=…     → FeatureCollection (ST_AsGeoJSON, viewport-limited)
 *   POST   {baseUrl}/datasets                         → store uploaded GeoJSON (ST_GeomFromGeoJSON, SRID 4326)
 *   DELETE {baseUrl}/datasets/:id
 * Not used by the demo build (no server is configured).
 */
export class HttpDatasetRepository implements DatasetRepository {
  constructor(private baseUrl: string) {}
  async list() { const r = await fetch(`${this.baseUrl}/datasets`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
  async get(id: string) { const r = await fetch(`${this.baseUrl}/datasets/${encodeURIComponent(id)}`); return r.ok ? r.json() : undefined; }
  async save(rec: DatasetRecord) { const r = await fetch(`${this.baseUrl}/datasets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); }
  async remove(id: string) { await fetch(`${this.baseUrl}/datasets/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
}

export const repository: DatasetRepository = new InMemoryDatasetRepository();
