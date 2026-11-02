"""
NORTHKAIRN demo dataset: NH 5 near Chandigarh (Kharar - Mohali - Zirakpur - Pinjore - Parwanoo).

REAL geometry (open data):
  - NH 5 alignment, other national highways, bridge/flyover locations:
    INDIA_NATIONAL_HIGHWAY.geojson from https://github.com/datta07/INDIAN-SHAPEFILES (MIT licence, data vintage ~2019)
  - District / UT boundaries from the same repository (Census 2011 based)
SYNTHETIC (clearly flagged in every file):
  - all condition, traffic, defect, incident, maintenance, sensor and camera attribute values,
  - the positions of sensors, cameras, defects, incidents and work zones (placed along the real alignment).
Chainage is a section chainage (Km 0 at the western end of the section), not NHAI's official chainage.

Usage: python3 scripts/generate_nh5.py <path-to-INDIAN-SHAPEFILES-checkout>
"""
import json, math, os, random, sys, base64
from datetime import datetime, timedelta, timezone

SRC = sys.argv[1] if len(sys.argv) > 1 else '../realdata/ishp'
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'demo', 'nh5')
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(20261101)
IST = timezone(timedelta(hours=5, minutes=30))
ANCHOR = datetime(2026, 11, 1, 12, 0, tzinfo=IST)
iso_date = lambda d: d.date().isoformat()
iso_ist = lambda d: d.astimezone(IST).replace(microsecond=0).isoformat()
days = lambda n: ANCHOR + timedelta(days=n)
SOURCE = 'datta07/INDIAN-SHAPEFILES (MIT), data vintage ~2019'
SYN = 'SYNTHETIC attribute values for demonstration. Geometry of the highway is real open data; condition, traffic, incidents etc. are invented.'

def km(a, b): return math.hypot((a[0] - b[0]) * 95.6, (a[1] - b[1]) * 111.0)
def r6(p): return [round(p[0], 6), round(p[1], 6)]

# ---------------- 1. chain the NH 5 alignment ----------------
hw = json.load(open(os.path.join(SRC, 'INDIA', 'INDIA_NATIONAL_HIGHWAY.geojson')))
BB = (76.50, 30.60, 77.05, 30.95)
inbb = lambda q: BB[0] < q[0] < BB[2] and BB[1] < q[1] < BB[3]
segs = []
others = []
for f in hw['features']:
    g, p = f['geometry'], f['properties']
    if not g: continue
    lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
    for l in lines:
        l = [q[:2] for q in l]
        if not any(inbb(q) for q in l): continue
        if p['Name'].strip() == 'NH 5': segs.append((l, p))
        else: others.append((l, p))

nodes = []
def node(pt):
    for i, n in enumerate(nodes):
        if km(n, pt) < 0.02: return i
    nodes.append(pt); return len(nodes) - 1
edges = {}
for idx, (l, p) in enumerate(segs):
    a, b = node(l[0]), node(l[-1]); L = sum(km(l[i], l[i + 1]) for i in range(len(l) - 1))
    edges.setdefault(a, []).append((b, L, idx)); edges.setdefault(b, []).append((a, L, idx))
gaps = []
for i in range(len(nodes)):
    for j in range(i + 1, len(nodes)):
        d = km(nodes[i], nodes[j])
        if 0 < d < 2.5:
            k = len(segs); segs.append(([nodes[i], nodes[j]], {'Bridge_Fly': '', 'gap': True}))
            edges.setdefault(i, []).append((j, d * 1.2, k)); edges.setdefault(j, []).append((i, d * 1.2, k))
import heapq
w = min(range(len(nodes)), key=lambda i: nodes[i][0]); e = max(range(len(nodes)), key=lambda i: nodes[i][0])
dist, prev, pq = {w: 0}, {}, [(0, w)]
while pq:
    dd, u = heapq.heappop(pq)
    if dd > dist[u]: continue
    for v, L, idx in edges.get(u, []):
        if dd + L < dist.get(v, 1e18): dist[v] = dd + L; prev[v] = (u, idx); heapq.heappush(pq, (dd + L, v))
parts = []; cur = e
while cur != w: u, idx = prev[cur]; parts.append(idx); cur = u
parts.reverse()
coords, flags = [], []
for idx in parts:
    l = segs[idx][0][:]
    if coords and km(coords[-1], l[0]) > km(coords[-1], l[-1]): l = l[::-1]
    start = len(coords)
    coords += l if not coords else l[1:]
    flags.append(((segs[idx][1].get('Bridge_Fly') or '').strip(), bool(segs[idx][1].get('gap')), max(0, start - 1), len(coords) - 1))
# cut at Parwanoo (before the winding hill section)
cut = next(i for i, q in enumerate(coords) if q[0] > 76.965 and q[1] > 30.83)
coords = coords[:cut + 1]
cum = [0.0]
for i in range(1, len(coords)): cum.append(cum[-1] + km(coords[i - 1], coords[i]))
LEN = cum[-1]
print('section length km', round(LEN, 2), 'points', len(coords))

def idx_at(m):
    lo, hi = 0, len(cum) - 1
    while lo < hi - 1:
        mid = (lo + hi) // 2
        if cum[mid] <= m: lo = mid
        else: hi = mid
    return lo
def at(k):
    k = max(0, min(LEN, k)); i = idx_at(k); s = cum[i + 1] - cum[i] or 1e-9; t = (k - cum[i]) / s
    return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t]
def bearing(k):
    a, b = at(k - 0.05), at(k + 0.05)
    return math.atan2((b[0] - a[0]) * 95.6, (b[1] - a[1]) * 111.0)
def off(k, m):  # metres, positive = right of travel (towards Parwanoo)
    p = at(k); br = bearing(k)
    return [p[0] + math.cos(br) * m / 95600, p[1] - math.sin(br) * m / 111000]
def slice_(a, b):
    out = [at(a)] + [coords[i] for i in range(len(coords)) if a < cum[i] < b] + [at(b)]
    return [r6(q) for q in out]
def ribbon(a, b, l, r, step=0.01):
    L, R = [], []; k = a
    while k <= b + 1e-9: L.append(r6(off(k, l))); R.append(r6(off(k, r))); k += step
    ring = L + R[::-1]; ring.append(ring[0]); return ring

def fc(name, desc, feats, synthetic=True):
    meta = {'description': desc, 'crs': 'EPSG:4326', 'corridor': 'NH 5 near Chandigarh (section chainage)', 'geometry_source': SOURCE}
    if synthetic: meta.update({'synthetic': True, 'disclaimer': SYN})
    else: meta.update({'synthetic': False, 'note': 'Real open-data geometry, no synthetic values.'})
    return {'type': 'FeatureCollection', 'name': name, 'metadata': meta, 'features': feats}
F = lambda g, p: {'type': 'Feature', 'geometry': g, 'properties': p}
def noise(x, seed=0):
    return (math.sin(x * 1.7 + seed) + math.sin(x * 0.43 + 2 * seed) * 0.8 + math.sin(x * 3.1 + seed * 3) * 0.3) / 2.1

def dp(pts, eps):  # Douglas-Peucker in degrees
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1e-12
    dmax, imax = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L
        if d > dmax: dmax, imax = d, i
    if dmax > eps: return dp(pts[:imax + 1], eps)[:-1] + dp(pts[imax:], eps)
    return [a, b]

# ---------------- 2. highway network (REAL) ----------------
hw_feats = [F({'type': 'LineString', 'coordinates': [r6(q) for q in dp(coords, 0.00003)]}, {
    'asset_id': 'NH5-SEC', 'name': 'NH 5 · Kharar – Zirakpur – Parwanoo section', 'asset_type': 'National Highway', 'highway': 'NH 5',
    'length_km': round(LEN, 2), 'source': SOURCE, 'note': 'Alignment chained from open-data fragments; one gap near Zirakpur bridged with a straight connector.'})]
for l, p in others:
    clipped = [q for q in l if BB[0] - 0.05 < q[0] < BB[2] + 0.05 and BB[1] - 0.05 < q[1] < BB[3] + 0.05]
    if len(clipped) < 2: continue
    hw_feats.append(F({'type': 'LineString', 'coordinates': [r6(q) for q in dp(clipped, 0.00005)]}, {'name': p['Name'].strip(), 'asset_type': 'National Highway (other)', 'highway': p['Name'].strip(), 'source': SOURCE}))

# ---------------- 3. road segments (geometry real, attributes SYNTHETIC) ----------------
cond_of = lambda p: 'Excellent' if p >= 85 else 'Good' if p >= 70 else 'Fair' if p >= 55 else 'Poor' if p >= 40 else 'Critical'
cong_of = lambda vc: 'Low' if vc < 0.45 else 'Moderate' if vc < 0.7 else 'Heavy' if vc < 0.9 else 'Critical'
NSEG = int(LEN)
seg_feats, seg_pci, seg_vol = [], [], []
bad = [(24.5, 1.4, 42), (41.0, 1.0, 26), (9.0, 0.8, 18)]
urban = [(31.0, 7.0, 1900), (44.0, 4.0, 1500)]  # Mohali/Chandigarh and Zirakpur stretches (synthetic traffic)
for i in range(NSEG):
    a, b = float(i), float(min(i + 1, LEN)); mid = (a + b) / 2
    pci = 80 + 14 * noise(i * 0.35, 1) + 5 * noise(i * 1.3, 4)
    for c, w_, d in bad: pci -= d * math.exp(-((mid - c) / w_) ** 2)
    pci = max(20, min(97, pci)); seg_pci.append(pci)
    vol = 1600 + sum(v * math.exp(-((mid - c) / w_) ** 2) for c, w_, v in urban) + 250 * noise(i * 0.7, 9)
    vol = int(vol); seg_vol.append(vol)
    vc = vol / 5400 * 1.45; speed = int(max(25, 95 - 72 * max(0, vc - 0.33)))
    cond = cond_of(pci)
    seg_feats.append(F({'type': 'LineString', 'coordinates': slice_(a, b)}, {
        'asset_id': f'NH5-S{i:03d}', 'segment_id': f'NH5-S{i:03d}', 'asset_type': 'Road Segment', 'name': f'NH 5 Km {a:.0f}–{b:.0f}', 'highway': 'NH 5 · Kharar – Parwanoo',
        'km_start': round(a, 3), 'km_end': round(b, 3), 'location': f'Section Km {a:.1f} – {b:.1f}', 'lanes': 4 if mid > 30 else 6,
        'condition': cond, 'pci': round(pci, 1), 'iri_m_per_km': round(1.6 + (100 - pci) * 0.06, 2), 'rut_depth_mm': round(2 + (100 - pci) * 0.18, 1),
        'last_inspection': iso_date(days(-rnd.randint(10, 150))), 'maintenance_status': 'In progress' if cond == 'Critical' else 'Scheduled' if cond == 'Poor' else 'Planned' if cond == 'Fair' and rnd.random() < 0.4 else 'None',
        'risk_level': 'High' if cond == 'Critical' else 'Medium' if cond == 'Poor' else 'Low', 'traffic_volume_vph': vol, 'avg_speed_kmh': speed,
        'vc_ratio': round(vc, 2), 'congestion_level': cong_of(vc), 'data_note': 'Synthetic attribute values'}))

# ---------------- 4. bridges & flyovers (locations REAL, attributes SYNTHETIC) ----------------
runs = []
for kind, gap, s, t in flags:
    if s >= len(cum) or not kind or gap: continue
    t = min(t, len(cum) - 1)
    k = 'Flyover' if 'fly' in kind.lower() else 'Bridge'
    a, b = cum[s], cum[t]
    if runs and runs[-1][0] == k and a - runs[-1][2] < 0.05: runs[-1][2] = b
    else: runs.append([k, a, b])
br_feats = []
nb = 1
for k, a, b in runs:
    if b - a < 0.03: continue
    mid = (a + b) / 2; cond = rnd.choices(['Excellent', 'Good', 'Fair', 'Poor'], [2, 6, 2, 1])[0]
    aid = f"{'FO' if k == 'Flyover' else 'BR'}-NH5-{nb:02d}"; nb += 1
    insp = rnd.randint(20, 400); due = rnd.randint(-30, 240) if cond != 'Poor' else rnd.randint(-20, 15)
    br_feats.append(F({'type': 'Polygon', 'coordinates': [ribbon(a, b, -14, 14, max(0.005, (b - a) / 40))]}, {
        'asset_id': aid, 'name': f'{k} at Km {mid:.1f}', 'asset_type': k, 'km': round(mid, 2), 'location': f'Section Km {a:.2f} – {b:.2f}', 'length_m': int((b - a) * 1000),
        'condition': cond, 'last_inspection': iso_date(days(-insp)), 'next_inspection_due': iso_date(days(due)), 'maintenance_status': 'Inspection overdue' if due < 0 else 'Scheduled' if cond == 'Poor' else 'None',
        'risk_level': 'High' if cond == 'Poor' and k == 'Flyover' else 'Medium' if cond == 'Poor' else 'Low',
        'height_m': 8.0 if k == 'Flyover' else 3.2, 'base_height_m': 6.5 if k == 'Flyover' else 1.6, 'location_source': f'{SOURCE} (Bridge_Fly attribute)',
        'data_note': 'Location real (open data); condition and inspection values synthetic',
        'inspection_history': [{'date': iso_date(days(-insp - j * 210)), 'type': 'Routine inspection' if j % 2 == 0 else 'Principal inspection', 'inspector': 'Synthetic record', 'rating': rnd.randint(5, 8)} for j in range(3)]}))
print('bridges/flyovers', len(br_feats))

# ---------------- 5. sensors, cameras, defects, incidents, work zones, km markers (SYNTHETIC) ----------------
def diurnal(h): return 0.22 + 0.55 * math.exp(-((h - 9.2) / 2.1) ** 2) + 0.75 * math.exp(-((h - 18.4) / 2.4) ** 2) + 0.32 * math.exp(-((h - 13.5) / 3) ** 2) - 0.12 * math.exp(-((h - 3.5) / 2) ** 2)
base = datetime(2026, 11, 1, 0, 0, tzinfo=IST)
sens = []
for n, k in enumerate([x + 2.5 for x in range(0, NSEG, 5)], 1):
    if k > LEN: break
    online = n not in (4,)
    peak = seg_vol[min(int(k), NSEG - 1)] * 1.25
    obs = []
    for h in range(24):
        v = int(peak * diurnal(h) * (0.92 + 0.16 * rnd.random())); vc = v / 5400 * 1.45
        obs.append({'t': (base + timedelta(hours=h)).isoformat(), 'volume_vph': v, 'avg_speed_kmh': int(max(25, 97 - 72 * max(0, vc - 0.33) + rnd.uniform(-3, 3)))})
    sens.append(F({'type': 'Point', 'coordinates': r6(off(k, 16))}, {'asset_id': f'TS-NH5-{n:02d}', 'sensor_id': f'TS-NH5-{n:02d}', 'name': f'Traffic sensor Km {k:.1f}', 'asset_type': 'Traffic Sensor',
        'sensor_type': rnd.choice(['ATCC (video)', 'Radar', 'Inductive loop']), 'km': round(k, 1), 'location': f'Section Km {k:.1f}', 'status': 'Online' if online else 'Offline',
        'condition': 'Good' if online else 'Poor', 'maintenance_status': 'None' if online else 'Scheduled', 'risk_level': 'Low', 'observations': obs if online else obs[:10], 'data_note': 'Synthetic'}))
cams = []
for n, k in enumerate([1.2, 6.8, 12.5, 15.9, 19.4, 22.7, 25.6, 29.8, 33.4, 37.9, 42.6], 1):
    if k > LEN: break
    on = n != 6
    cams.append(F({'type': 'Point', 'coordinates': r6(off(k, -18 if n % 2 else 18))}, {'asset_id': f'CAM-NH5-{k:.1f}', 'name': f'CCTV Km {k:.1f}', 'asset_type': 'CCTV Camera', 'camera_type': rnd.choice(['PTZ 30x', 'ANPR', 'Fixed bullet 4K']),
        'km': k, 'location': f'Section Km {k:.1f}', 'status': 'Online' if on else 'Offline', 'condition': 'Good' if on else 'Poor', 'maintenance_status': 'None' if on else 'In progress', 'risk_level': 'Low', 'data_note': 'Synthetic'}))
defs = []; dn = 1
for i in range(NSEG):
    p = seg_pci[i]; n = rnd.randint(3, 5) if p < 40 else rnd.randint(2, 3) if p < 55 else rnd.randint(0, 2) if p < 70 else (1 if rnd.random() < 0.15 else 0)
    for _ in range(n):
        k = i + rnd.uniform(0.05, 0.95); typ = rnd.choices(['Pothole', 'Alligator cracking', 'Rutting', 'Edge break', 'Ravelling'], [5, 3, 2, 1.5, 1.5])[0]
        sev = rnd.choices(['Critical', 'High', 'Medium'], [3, 3, 1])[0] if p < 40 else rnd.choices(['High', 'Medium', 'Low'], [3, 3, 1])[0] if p < 55 else rnd.choices(['Medium', 'Low'], [2, 4])[0]
        cw = rnd.choice(['A', 'B']); lane = rnd.randint(1, 2); det = days(-rnd.uniform(0.2, 60))
        st = 'Open' if det > ANCHOR - timedelta(days=5) else rnd.choices(['Open', 'Assigned', 'Repaired'], [3, 3, 2])[0]
        defs.append(F({'type': 'Point', 'coordinates': r6(off(k, (-1 if cw == 'A' else 1) * (2 + lane * 3.4)))}, {'asset_id': f'DF-NH5-{dn:03d}', 'defect_id': f'DF-NH5-{dn:03d}', 'name': f'{typ} at Km {k:.1f}', 'asset_type': 'Road Defect',
            'defect_type': typ, 'severity': sev, 'km': round(k, 2), 'location': f'Section Km {k:.1f} – Carriageway {cw}, Lane {lane}', 'lane': f'Lane {lane}', 'detected_on': iso_ist(det), 'status': st,
            'detection_method': rnd.choice(['Survey vehicle (synthetic)', 'Dashcam analytics (synthetic)', 'Patrol report (synthetic)']),
            'condition': 'Critical' if sev == 'Critical' else 'Poor' if sev == 'High' else 'Fair' if sev == 'Medium' else 'Good', 'risk_level': 'High' if sev == 'Critical' else 'Medium' if sev == 'High' else 'Low',
            'maintenance_status': 'Completed' if st == 'Repaired' else 'Scheduled' if st == 'Assigned' else 'Open'})); dn += 1
incs = []; inN = 2201
desc = {'Accident': 'Rear-end collision', 'Road obstruction': 'Debris on carriageway', 'Pothole': 'Pothole reported by patrol', 'Traffic congestion': 'Slow-moving queue at junction', 'Infrastructure failure': 'Street light circuit failure', 'Vehicle breakdown': 'Broken-down truck on shoulder'}
for i in range(32):
    typ = rnd.choices(list(desc), [7, 5, 4, 9, 2, 6])[0]
    k = round(rnd.choice([27.5, 31.0, 36.0, 41.5]) + rnd.uniform(-1.5, 1.5) if rnd.random() < 0.55 else rnd.uniform(0.5, LEN - 0.5), 1)
    hrs = rnd.uniform(0.5, 24 * 14); t = ANCHOR - timedelta(hours=hrs)
    st = rnd.choices(['Open', 'Responding'], [3, 2])[0] if hrs < 6 else rnd.choices(['Responding', 'Cleared'], [1, 3])[0] if hrs < 30 else 'Cleared'
    sev = rnd.choices(['Major', 'Minor', 'Fatal'], [1, 3, 0.2])[0] if typ == 'Accident' else rnd.choices(['Moderate', 'Minor'], [2, 3])[0]
    incs.append(F({'type': 'Point', 'coordinates': r6(off(k, rnd.choice([-1, 1]) * rnd.uniform(4, 11)))}, {'asset_id': f'INC-NH5-{inN}', 'incident_id': f'INC-NH5-{inN}', 'name': f'{typ} at Km {k:.1f}', 'asset_type': 'Incident',
        'incident_type': typ, 'severity': sev, 'km': k, 'location': f'Section Km {k:.1f}', 'reported_at': iso_ist(t), 'status': st, 'description': desc[typ] + ' (synthetic)',
        'risk_level': 'High' if sev in ('Major', 'Fatal') else 'Medium' if sev == 'Moderate' else 'Low', 'source': 'Synthetic'})); inN += 1
works = [(23.6, 25.6, 'Resurfacing (mill & overlay)', 'In progress', -5, 16, 'Critical'), (40.4, 41.6, 'Pothole patching', 'Scheduled', 3, 8, 'High'), (8.5, 9.5, 'Crack sealing', 'Planned', 30, 36, 'Medium'),
         (17.0, 18.0, 'Road marking renewal', 'Completed', -50, -44, 'Low'), (28.0, 30.0, 'Drain desilting', 'In progress', -20, -2, 'Medium'), (12.0, 13.0, 'Crash barrier repair', 'Scheduled', 10, 18, 'Medium')]
wz = []
for n, (a, b, typ, st, s0, s1, pr) in enumerate(works, 1):
    if b > LEN: continue
    overdue = st != 'Completed' and days(s1) < ANCHOR
    wz.append(F({'type': 'Polygon', 'coordinates': [ribbon(a, b, -30, 30, 0.05)]}, {'asset_id': f'WO-NH5-{n:03d}', 'work_order': f'WO-NH5-{n:03d}', 'name': typ, 'asset_type': 'Maintenance Zone', 'work_type': typ,
        'maintenance_status': 'Overdue' if overdue else st, 'priority': pr, 'km_start': a, 'km_end': b, 'location': f'Section Km {a:.1f} – {b:.1f}', 'start_date': iso_date(days(s0)), 'end_date': iso_date(days(s1)),
        'due_date': iso_date(days(s1)), 'contractor': 'Synthetic contractor', 'estimated_cost_inr': rnd.randint(4, 220) * 100000, 'risk_level': 'High' if pr == 'Critical' else 'Medium' if pr == 'High' else 'Low'}))
kms = [F({'type': 'Point', 'coordinates': r6(off(k, 22))}, {'marker_id': f'KM-NH5-{k}', 'name': f'Km {k}', 'km': k, 'asset_type': 'Kilometre Stone', 'note': 'Section chainage (not official NHAI chainage)'}) for k in range(0, int(LEN) + 1)]

# ---------------- 6. administrative boundaries (REAL) ----------------
adm = []
def add_poly(geom, props):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    out = [[[r6(q) for q in (lambda o: o + [o[0]])(dp([q[:2] for q in ring[:-1]], 0.0003))] for ring in poly] for poly in polys]
    out = [[ring for ring in poly if len(ring) >= 4] for poly in out]
    adm.append(F({'type': 'MultiPolygon', 'coordinates': [p for p in out if p]}, props))
for f in json.load(open(os.path.join(SRC, 'STATES', 'CHANDIGARH', 'CHANDIGARH_STATE.geojson')))['features']:
    add_poly(f['geometry'], {'boundary_id': 'UT-CH', 'name': 'Chandigarh (UT)', 'admin_level': 'Union Territory', 'asset_type': 'Administrative Boundary', 'source': SOURCE})
for st, fn, names in [('Punjab', 'PUNJAB/PUNJAB_DISTRICTS.geojson', {'Sahibzada Ajit Singh Nag*': 'SAS Nagar (Mohali)', 'Rupnagar': 'Rupnagar'}), ('Haryana', 'HARYANA/HARYANA_DISTRICTS.geojson', {'Panchkula': 'Panchkula'})]:
    for f in json.load(open(os.path.join(SRC, 'STATES', fn)))['features']:
        n = f['properties']['dtname']
        if n in names: add_poly(f['geometry'], {'boundary_id': f"DIST-{f['properties']['dtcode11']}", 'name': names[n], 'admin_level': f'District ({st})', 'state': st, 'asset_type': 'Administrative Boundary', 'source': SOURCE})

files = [
    ('01_highway_network.geojson', fc('Highway Network', 'NH 5 section and other national highways nearby (real open data)', hw_feats, synthetic=False)),
    ('02_road_segments.geojson', fc('Road Segments', '1-km segments on the real NH 5 alignment; condition & traffic values synthetic', seg_feats)),
    ('03_bridges_flyovers.geojson', fc('Bridges & Flyovers', 'Bridge/flyover locations from open data; condition values synthetic', br_feats)),
    ('07_traffic_sensors.geojson', fc('Traffic Sensors', 'Synthetic sensors with hourly observations for 1 Nov 2026', sens)),
    ('08_cctv_cameras.geojson', fc('CCTV Cameras', 'Synthetic camera positions', cams)),
    ('09_road_defects.geojson', fc('Road Defects', 'Synthetic pavement defects', defs)),
    ('10_maintenance_zones.geojson', fc('Maintenance Zones', 'Synthetic work zones', wz)),
    ('12_admin_boundaries.geojson', fc('Administrative Boundaries', 'Chandigarh UT, SAS Nagar, Rupnagar, Panchkula (real open data)', adm, synthetic=False)),
    ('14_incidents.geojson', fc('Incidents', 'Synthetic incidents (last 14 days)', incs)),
    ('15_km_markers.geojson', fc('Kilometre Markers', 'Section chainage markers (synthetic positions every 1 km)', kms)),
]
for fn in os.listdir(OUT): os.remove(os.path.join(OUT, fn))
for fn, data in files:
    s = json.dumps(data, separators=(',', ':')); open(os.path.join(OUT, fn), 'w').write(s)
    print(f'{fn:32s} {len(data["features"]):5d} features {len(s) / 1024:7.0f} KB')
