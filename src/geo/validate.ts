/**
 * GeoJSON parsing & validation (RFC 7946, EPSG:4326 expected).
 * Pure functions — no UI or map dependencies.
 * Invalid features are never silently discarded: they are returned in `rejected` with a reason.
 */
import type { Geometry, Position } from 'geojson';
import { SUPPORTED_GEOMETRIES, type NKFeature, type RejectedFeature, type ValidationIssue } from './types';

export interface ParseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export function parseJsonText(text: string): ParseResult {
  if (!text || !text.trim()) return { ok: false, error: 'The file is empty.' };
  try {
    return { ok: true, value: JSON.parse(text.replace(/^﻿/, '')) };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const m = msg.match(/position (\d+)/);
    if (m) {
      const pos = Number(m[1]);
      const before = text.slice(0, pos);
      const line = before.split('\n').length;
      const col = pos - before.lastIndexOf('\n');
      return { ok: false, error: `Invalid JSON at line ${line}, column ${col}: ${msg.replace(/ in JSON at position \d+.*$/, '')}` };
    }
    return { ok: false, error: `Invalid JSON: ${msg}` };
  }
}

export interface ValidationResult {
  ok: boolean;
  fatal?: string;
  features: NKFeature[];
  rejected: RejectedFeature[];
  issues: ValidationIssue[];
  name?: string;
  metadata?: Record<string, any>;
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const snippet = (v: unknown) => { try { const s = JSON.stringify(v); return s.length > 180 ? s.slice(0, 180) + '…' : s; } catch { return String(v); } };

interface GeomCheck { ok: boolean; reason?: string; fixed?: string[]; outOfRange?: boolean }

function checkPosition(p: unknown): string | null {
  if (!Array.isArray(p)) return 'position is not an array';
  if (p.length < 2) return 'position has fewer than 2 values';
  for (let i = 0; i < Math.min(p.length, 3); i++) if (typeof p[i] !== 'number' || !Number.isFinite(p[i])) return 'position contains a non-numeric value';
  return null;
}

function rangeOk(p: Position) { return p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90; }

function checkGeometry(g: any, fixes: string[]): GeomCheck {
  if (!isObj(g)) return { ok: false, reason: 'geometry is not an object' };
  const t = g.type;
  if (!SUPPORTED_GEOMETRIES.includes(t)) return { ok: false, reason: `unsupported geometry type "${t}" (supported: ${SUPPORTED_GEOMETRIES.join(', ')})` };
  if (t === 'GeometryCollection') {
    if (!Array.isArray(g.geometries)) return { ok: false, reason: 'GeometryCollection has no "geometries" array' };
    if (g.geometries.length === 0) return { ok: false, reason: 'GeometryCollection is empty' };
    for (const [i, sub] of g.geometries.entries()) {
      const r = checkGeometry(sub, fixes);
      if (!r.ok) return { ok: false, reason: `GeometryCollection member ${i}: ${r.reason}`, outOfRange: r.outOfRange };
    }
    return { ok: true };
  }
  const c = g.coordinates;
  if (!Array.isArray(c)) return { ok: false, reason: `${t} has no "coordinates" array` };
  const positions: Position[] = [];
  const pos = (p: unknown) => { const e = checkPosition(p); if (e) throw new Error(e); positions.push(p as Position); };
  const line = (l: unknown, min: number, label: string) => { if (!Array.isArray(l)) throw new Error(`${label} is not an array`); if (l.length < min) throw new Error(`${label} needs at least ${min} positions (has ${l.length})`); l.forEach(pos); };
  const ring = (r: unknown, label: string) => {
    if (!Array.isArray(r)) throw new Error(`${label} is not an array`);
    r.forEach(pos);
    const a = r[0] as Position, b = r[r.length - 1] as Position;
    if (r.length >= 3 && (a[0] !== b[0] || a[1] !== b[1])) { r.push([...a]); fixes.push(`${label} was not closed — closed automatically`); }
    if (r.length < 4) throw new Error(`${label} needs at least 4 positions (has ${r.length})`);
  };
  try {
    switch (t) {
      case 'Point': pos(c); break;
      case 'MultiPoint': if (c.length === 0) throw new Error('MultiPoint is empty'); c.forEach(pos); break;
      case 'LineString': line(c, 2, 'LineString'); break;
      case 'MultiLineString': if (c.length === 0) throw new Error('MultiLineString is empty'); c.forEach((l: unknown, i: number) => line(l, 2, `line ${i}`)); break;
      case 'Polygon': if (c.length === 0) throw new Error('Polygon has no rings'); c.forEach((r: unknown, i: number) => ring(r, i === 0 ? 'outer ring' : `hole ${i}`)); break;
      case 'MultiPolygon': if (c.length === 0) throw new Error('MultiPolygon is empty'); c.forEach((p: unknown, j: number) => { if (!Array.isArray(p) || p.length === 0) throw new Error(`polygon ${j} has no rings`); p.forEach((r: unknown, i: number) => ring(r, `polygon ${j} ${i === 0 ? 'outer ring' : `hole ${i}`}`)); }); break;
    }
  } catch (e: any) {
    return { ok: false, reason: `${t}: ${e.message}` };
  }
  const bad = positions.find((p) => !rangeOk(p));
  if (bad) return { ok: false, outOfRange: true, reason: `coordinate [${bad[0]}, ${bad[1]}] is outside the WGS84 range (longitude ±180, latitude ±90). The file is probably in a projected CRS (e.g. UTM / EPSG:32643). Re-project it to EPSG:4326.` };
  return { ok: true };
}

const GEOM_TYPES = new Set<string>(SUPPORTED_GEOMETRIES);

export function validateGeoJSON(input: unknown): ValidationResult {
  const res: ValidationResult = { ok: false, features: [], rejected: [], issues: [] };
  if (!isObj(input)) { res.fatal = 'Top-level value is not a JSON object. A GeoJSON file must contain a FeatureCollection, Feature or Geometry object.'; return res; }
  const t = input.type;
  let raw: unknown[];
  if (t === 'FeatureCollection') {
    if (!Array.isArray(input.features)) { res.fatal = 'FeatureCollection is missing its "features" array.'; return res; }
    raw = input.features;
    if (typeof input.name === 'string') res.name = input.name;
    if (isObj(input.metadata)) res.metadata = input.metadata;
  } else if (t === 'Feature') {
    raw = [input];
    res.issues.push({ level: 'info', message: 'File contains a single Feature; it was wrapped in a FeatureCollection.' });
  } else if (GEOM_TYPES.has(t)) {
    raw = [{ type: 'Feature', geometry: input, properties: {} }];
    res.issues.push({ level: 'info', message: `File contains a bare ${t} geometry; it was wrapped in a Feature.` });
  } else if (typeof t === 'string') {
    res.fatal = `Unsupported GeoJSON object type "${t}". Expected FeatureCollection, Feature or one of: ${SUPPORTED_GEOMETRIES.join(', ')}.`;
    return res;
  } else {
    res.fatal = 'Object has no "type" member — this does not look like GeoJSON.';
    return res;
  }

  // CRS check (RFC 7946 removed "crs"; older files may still declare one)
  const crsName: string | undefined = isObj(input.crs) && isObj(input.crs.properties) ? String(input.crs.properties.name ?? '') : undefined;
  if (crsName && !/CRS84|4326/i.test(crsName)) {
    res.issues.push({ level: 'warning', message: `File declares CRS "${crsName}". NORTHKAIRN expects EPSG:4326 / WGS84; features with coordinates outside the WGS84 range are rejected.` });
  }

  let outOfRange = 0;
  raw.forEach((f, index) => {
    if (!isObj(f) || f.type !== 'Feature') {
      res.rejected.push({ index, reason: isObj(f) ? `object type is "${f.type}", expected "Feature"` : 'entry is not an object', snippet: snippet(f) });
      return;
    }
    const properties = isObj(f.properties) ? { ...f.properties } : {};
    if (f.properties != null && !isObj(f.properties)) res.issues.push({ level: 'warning', featureIndex: index, message: `Feature ${index}: "properties" is not an object — ignored.` });
    if (f.geometry === null || f.geometry === undefined) {
      res.features.push({ type: 'Feature', id: f.id, geometry: null, properties });
      return;
    }
    const fixes: string[] = [];
    const geometry = structuredCloneSafe(f.geometry);
    const chk = checkGeometry(geometry, fixes);
    if (!chk.ok) {
      if (chk.outOfRange) outOfRange++;
      res.rejected.push({ index, reason: chk.reason!, snippet: snippet(f.geometry) });
      return;
    }
    for (const fx of fixes) res.issues.push({ level: 'warning', featureIndex: index, message: `Feature ${index}: ${fx}.` });
    res.features.push({ type: 'Feature', id: f.id, geometry: geometry as Geometry, properties });
  });

  const nonSpatial = res.features.filter((f) => !f.geometry).length;
  if (nonSpatial) res.issues.push({ level: 'warning', message: `${nonSpatial} feature(s) have no geometry (null). They are kept and listed in the data table but cannot be drawn on the map.` });
  if (res.rejected.length) res.issues.push({ level: 'error', message: `${res.rejected.length} of ${raw.length} feature(s) were rejected — see the list of rejected features for the reason of each.` });
  if (outOfRange && outOfRange === raw.length) res.issues.push({ level: 'error', message: 'All coordinates are outside the WGS84 range. Re-project the file to EPSG:4326 (longitude, latitude in decimal degrees).' });
  if (raw.length === 0) res.issues.push({ level: 'warning', message: 'The FeatureCollection contains no features.' });

  res.ok = res.features.length > 0 || raw.length === 0;
  if (!res.ok) res.fatal = 'No valid features found in this file.';
  return res;
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
