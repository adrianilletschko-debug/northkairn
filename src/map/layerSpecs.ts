/**
 * Builds MapLibre style layers for a GeoLayer, based on its kind, the user's colour/opacity
 * and the active thematic mode. Pure — returns specs; MapView applies/diffs them.
 */
import type { GeoLayer } from '../geo/types';
import type { ViewSettings } from '../state/store';
import { COND_COLORS, INCIDENT_COLORS, LANDUSE_COLORS, MAINT_COLORS, matchExpr, RISK_COLORS, TRAFFIC_COLORS } from '../theme/colors';

export interface SubLayer { id: string; interactive: boolean; spec: any }

const POLY = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const LINE = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const PT = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];
const and = (...xs: any[]) => { const v = xs.filter(Boolean); return v.length === 1 ? v[0] : ['all', ...v]; };
/** pixel width for a real-world width in metres (approx. at 27°N), exponential in zoom */
const metres = (m: number, min = 1) => ['interpolate', ['exponential', 2], ['zoom'], 8, Math.max(min, m / 545), 12, Math.max(min, m / 34), 16, Math.max(min, m / 2.13), 20, m / 0.133];
/** zoom-interpolated metres with a per-feature choice between two widths (zoom must stay outermost) */
const metresCase = (cond: any, a: number, b: number, minA = 1, minB = 1) => ['interpolate', ['exponential', 2], ['zoom'], 8, ['case', cond, Math.max(minA, a / 545), Math.max(minB, b / 545)], 12, ['case', cond, Math.max(minA, a / 34), Math.max(minB, b / 34)], 16, ['case', cond, Math.max(minA, a / 2.13), Math.max(minB, b / 2.13)], 20, ['case', cond, a / 0.133, b / 0.133]];
const metresSigned = (m: number) => ['interpolate', ['exponential', 2], ['zoom'], 8, m / 545, 12, m / 34, 16, m / 2.13, 20, m / 0.133];

export const sourceId = (l: GeoLayer) => `nk-src-${l.id}`;

export function buildSublayers(l: GeoLayer, view: ViewSettings, filter: any[] | null): SubLayer[] {
  const src = sourceId(l); const o = l.opacity; const c = l.color; const id = (s: string) => `nk-${l.id}-${s}`;
  const threeD = view.dimension === '3d' && view.extrude;
  const f = (geom: any, extra?: any) => and(geom, extra, filter, l.cluster ? ['!', ['has', 'point_count']] : null);
  const out: SubLayer[] = [];
  const add = (suffix: string, interactive: boolean, spec: any) => out.push({ id: id(suffix), interactive, spec: { id: id(suffix), source: src, ...spec } });

  const condColor = matchExpr('__cond', COND_COLORS, c);
  const trafficColor = matchExpr('__traffic', TRAFFIC_COLORS, c);

  switch (l.kind) {
    case 'road': {
      const col = view.roadStyle === 'condition' ? condColor : view.roadStyle === 'traffic' ? trafficColor : c;
      add('glow', false, { type: 'line', filter: f(LINE), paint: { 'line-color': col, 'line-width': metres(90, 8), 'line-blur': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 16], 'line-opacity': 0.32 * o }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      for (const side of [1, -1]) add(side > 0 ? 'cw-r' : 'cw-l', true, { type: 'line', filter: f(LINE), paint: { 'line-color': col, 'line-width': metres(10, 2.4), 'line-offset': metresSigned(11 * side), 'line-opacity': 0.95 * o }, layout: { 'line-cap': 'butt', 'line-join': 'round' } });
      break;
    }
    case 'highway': {
      const isCw = ['==', ['get', 'asset_type'], 'Carriageway'];
      add('casing', false, { type: 'line', filter: f(LINE), paint: { 'line-color': '#020617', 'line-width': metresCase(isCw, 16, 10, 3, 2), 'line-opacity': 0.85 * o }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
      add('line', true, { type: 'line', filter: f(LINE), paint: { 'line-color': ['case', isCw, '#3b4a63', c], 'line-width': metresCase(isCw, 11.5, 7.5, 2, 1.2), 'line-opacity': ['case', isCw, o, 0.55 * o] }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
      add('edge', false, { type: 'line', filter: f(LINE, isCw), paint: { 'line-color': c, 'line-width': 0.8, 'line-gap-width': metres(11.5, 2), 'line-opacity': 0.75 * o } });
      for (const off of [-3.7, 3.7]) add(`lane${off > 0 ? 'r' : 'l'}`, false, { type: 'line', minzoom: 15, filter: f(LINE, isCw), paint: { 'line-color': '#e2e8f0', 'line-width': 0.8, 'line-offset': metresSigned(off), 'line-dasharray': [3, 5], 'line-opacity': 0.55 * o } });
      break;
    }
    case 'bridge': {
      if (threeD) add('extrude', true, { type: 'fill-extrusion', filter: f(POLY), paint: { 'fill-extrusion-color': ['case', ['==', ['get', 'asset_type'], 'Bridge Pier'], '#64748b', ['match', ['get', '__cond'], 'Poor', '#fb923c', 'Critical', '#ef4444', c]], 'fill-extrusion-height': ['coalesce', ['get', '__h'], 7.5], 'fill-extrusion-base': ['coalesce', ['get', '__b'], 6], 'fill-extrusion-opacity': 0.92 * o } });
      else add('fill', true, { type: 'fill', filter: f(POLY), paint: { 'fill-color': c, 'fill-opacity': 0.75 * o } });
      add('outline', !threeD, { type: 'line', filter: f(POLY), paint: { 'line-color': '#e0f2fe', 'line-width': 1, 'line-opacity': 0.8 * o } });
      add('pt', true, { type: 'circle', filter: f(PT), paint: { 'circle-radius': 3, 'circle-color': '#e0f2fe', 'circle-opacity': o } });
      add('ln', true, { type: 'line', filter: f(LINE), paint: { 'line-color': c, 'line-width': 3, 'line-opacity': o } });
      break;
    }
    case 'building': {
      if (threeD) add('extrude', true, { type: 'fill-extrusion', minzoom: 11, filter: f(POLY), paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', '__h'], 6], 3, '#26324a', 12, '#3d5070', 30, c], 'fill-extrusion-height': ['coalesce', ['get', '__h'], 6], 'fill-extrusion-base': ['coalesce', ['get', '__b'], 0], 'fill-extrusion-opacity': 0.9 * o, 'fill-extrusion-vertical-gradient': true } });
      else add('fill', true, { type: 'fill', minzoom: 10, filter: f(POLY), paint: { 'fill-color': c, 'fill-opacity': 0.7 * o, 'fill-outline-color': '#94a3b8' } });
      add('pt', true, { type: 'circle', filter: f(PT), paint: { 'circle-radius': 3, 'circle-color': c, 'circle-opacity': o } });
      break;
    }
    case 'water': {
      add('fill', true, { type: 'fill', filter: f(POLY), paint: { 'fill-color': view.basemap === 'satellite' ? '#1b4a6b' : '#123a6b', 'fill-opacity': 0.9 * o } });
      add('outline', false, { type: 'line', filter: f(POLY), paint: { 'line-color': c, 'line-width': 1.1, 'line-opacity': 0.7 * o } });
      add('line', true, { type: 'line', filter: f(LINE), paint: { 'line-color': c, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 3.5], 'line-opacity': 0.85 * o }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      add('pt', true, { type: 'circle', filter: f(PT), paint: { 'circle-radius': 4, 'circle-color': c, 'circle-opacity': o } });
      break;
    }
    case 'landuse': {
      const col = matchExpr('land_use', LANDUSE_COLORS, c);
      add('fill', true, { type: 'fill', filter: f(POLY), paint: { 'fill-color': col, 'fill-opacity': (view.basemap === 'dark' ? 0.32 : 0.1) * o } });
      add('outline', false, { type: 'line', minzoom: 11, filter: f(POLY), paint: { 'line-color': '#0f172a', 'line-width': 0.6, 'line-opacity': (view.basemap === 'dark' ? 0.5 : 0) * o } });
      break;
    }
    case 'flood': {
      add('fill', true, { type: 'fill', filter: f(POLY), paint: { 'fill-color': ['match', ['get', '__risk'], 'High', '#7c3aed', 'Medium', c, c], 'fill-opacity': ['match', ['get', '__risk'], 'High', 0.32, 0.18] as any } });
      add('outline', false, { type: 'line', filter: f(POLY), paint: { 'line-color': '#c4b5fd', 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': 0.7 * o } });
      out[out.length - 2].spec.paint['fill-opacity'] = ['*', o, ['match', ['get', '__risk'], 'High', 0.32, 0.18]];
      break;
    }
    case 'boundary': {
      add('line', true, { type: 'line', filter: f(and(['any', POLY, LINE])), paint: { 'line-color': c, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 13, 2], 'line-dasharray': [4, 3], 'line-opacity': 0.55 * o } });
      break;
    }
    case 'maintenance': {
      const col = matchExpr('__maint', MAINT_COLORS, c);
      add('fill', true, { type: 'fill', filter: f(POLY), paint: { 'fill-color': col, 'fill-opacity': 0.22 * o } });
      add('outline', false, { type: 'line', filter: f(POLY), paint: { 'line-color': col, 'line-width': 1.6, 'line-dasharray': [2, 1.5], 'line-opacity': 0.95 * o } });
      add('pt', true, { type: 'circle', filter: f(PT), paint: { 'circle-radius': 6, 'circle-color': col, 'circle-stroke-color': '#0b1220', 'circle-stroke-width': 1.5, 'circle-opacity': o } });
      add('ln', true, { type: 'line', filter: f(LINE), paint: { 'line-color': col, 'line-width': 4, 'line-opacity': 0.8 * o } });
      break;
    }
    case 'drainage': {
      add('line', true, { type: 'line', filter: f(LINE), paint: { 'line-color': ['match', ['get', '__cond'], 'Poor', '#f97316', 'Critical', '#ef4444', c], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 3], 'line-dasharray': [2, 1], 'line-opacity': 0.9 * o } });
      add('pt', true, { type: 'circle', filter: f(PT), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 15, 6], 'circle-color': condColor, 'circle-stroke-color': c, 'circle-stroke-width': 1.5, 'circle-opacity': o, 'circle-stroke-opacity': o } });
      add('fill', true, { type: 'fill', filter: f(POLY), paint: { 'fill-color': c, 'fill-opacity': 0.4 * o } });
      break;
    }
    case 'lighting': {
      add('pt', true, { type: 'circle', filter: f(PT), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, ['case', ['==', ['get', 'asset_type'], 'Street Lighting'], 0.8, 3], 15, ['case', ['==', ['get', 'asset_type'], 'Street Lighting'], 2.6, 6]], 'circle-color': ['match', ['get', '__cond'], 'Poor', '#f97316', 'Critical', '#ef4444', c], 'circle-blur': 0.2, 'circle-opacity': 0.9 * o, 'circle-stroke-width': ['case', ['==', ['get', 'asset_type'], 'Street Lighting'], 0, 1.5], 'circle-stroke-color': '#0b1220' } });
      add('ln', true, { type: 'line', filter: f(LINE), paint: { 'line-color': c, 'line-width': 2, 'line-opacity': o } });
      break;
    }
    case 'marker': {
      add('pt', true, { type: 'circle', minzoom: 9.5, filter: f(PT), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.6, 15, 4.5], 'circle-color': ['case', ['==', ['%', ['coalesce', ['to-number', ['get', 'km']], 1], 5], 0], '#f8fafc', c], 'circle-stroke-color': '#0b1220', 'circle-stroke-width': 1, 'circle-opacity': o } });
      break;
    }
    case 'sensor':
    case 'camera': {
      const col = ['case', ['==', ['get', '__cond'], 'Poor'], '#64748b', c];
      add('halo', false, { type: 'circle', filter: f(PT), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 6, 15, 16], 'circle-color': col, 'circle-opacity': 0.16 * o, 'circle-blur': 0.6 } });
      add('pt', true, { type: 'circle', filter: f(PT), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 15, l.kind === 'camera' ? 6.5 : 7.5], 'circle-color': col, 'circle-stroke-color': '#e0f2fe', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 15, 2], 'circle-opacity': o, 'circle-stroke-opacity': o } });
      break;
    }
    case 'defect': {
      const col = ['match', ['get', '__cond'], 'Critical', '#ef4444', 'Poor', '#f97316', 'Fair', '#fbbf24', '#a3e635'];
      const repaired = ['==', ['get', '__maint'], 'Completed'];
      add('pt', true, { type: 'circle', filter: f(PT), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, ['match', ['get', '__cond'], 'Critical', 4.5, 'Poor', 3.8, 3], 15, ['match', ['get', '__cond'], 'Critical', 10, 'Poor', 8.5, 6.5]], 'circle-color': col, 'circle-stroke-color': '#0b1220', 'circle-stroke-width': 1.5, 'circle-opacity': ['case', repaired, 0.35 * o, o], 'circle-stroke-opacity': o } });
      add('poly', true, { type: 'fill', filter: f(POLY), paint: { 'fill-color': col, 'fill-opacity': 0.6 * o } });
      add('ln', true, { type: 'line', filter: f(LINE), paint: { 'line-color': col, 'line-width': 3, 'line-opacity': o } });
      break;
    }
    case 'incident': {
      const col = matchExpr('incident_type', INCIDENT_COLORS, c);
      const cleared = ['==', ['get', 'status'], 'Cleared'];
      add('halo', false, { type: 'circle', filter: f(PT, ['!', cleared]), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 15, 22], 'circle-color': col, 'circle-opacity': 0.22 * o, 'circle-blur': 0.5 } });
      add('pt', true, { type: 'circle', filter: f(PT), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 15, 8.5], 'circle-color': col, 'circle-stroke-color': ['case', cleared, '#334155', '#ffffff'], 'circle-stroke-width': ['case', cleared, 1, 2], 'circle-opacity': ['case', cleared, 0.45 * o, o], 'circle-stroke-opacity': o } });
      add('poly', true, { type: 'fill', filter: f(POLY), paint: { 'fill-color': col, 'fill-opacity': 0.4 * o } });
      add('ln', true, { type: 'line', filter: f(LINE), paint: { 'line-color': col, 'line-width': 3, 'line-opacity': o } });
      break;
    }
    default: {
      if (threeD) add('extrude', true, { type: 'fill-extrusion', filter: f(POLY, ['has', '__h']), paint: { 'fill-extrusion-color': c, 'fill-extrusion-height': ['get', '__h'], 'fill-extrusion-base': ['coalesce', ['get', '__b'], 0], 'fill-extrusion-opacity': 0.85 * o } });
      add('fill', true, { type: 'fill', filter: f(POLY, threeD ? ['!', ['has', '__h']] : null), paint: { 'fill-color': c, 'fill-opacity': 0.35 * o } });
      add('outline', false, { type: 'line', filter: f(POLY), paint: { 'line-color': c, 'line-width': 1.2, 'line-opacity': 0.9 * o } });
      add('ln', true, { type: 'line', filter: f(LINE), paint: { 'line-color': c, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 15, 4], 'line-opacity': o }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      add('pt', true, { type: 'circle', filter: f(PT), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 15, 7], 'circle-color': c, 'circle-stroke-color': '#0b1220', 'circle-stroke-width': 1.5, 'circle-opacity': o } });
    }
  }
  if (l.cluster) {
    add('cluster', true, { type: 'circle', filter: ['has', 'point_count'], paint: { 'circle-color': c, 'circle-opacity': 0.75 * o, 'circle-stroke-color': '#e0f2fe', 'circle-stroke-width': 1.5, 'circle-radius': ['step', ['get', 'point_count'], 11, 20, 15, 100, 20, 500, 26] } });
  }
  for (const s of out) s.spec.layout = { ...(s.spec.layout || {}), visibility: l.visible ? 'visible' : 'none' };
  return out;
}

export const RISK_FILL = RISK_COLORS;
