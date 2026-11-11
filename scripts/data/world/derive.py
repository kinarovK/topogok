#!/usr/bin/env python3
"""Derive the continents + oceans topic from Natural Earth 1:110m land.

Input : shp/ne_110m_land.{shp,dbf}  (public domain, Natural Earth v4.1.0) - read only.
Output: build/world/units.geojson   (6 continents + 5 oceans, hu/uk names)
        build/world/background.geojson (all land; islands not assigned to a continent stay grey)
        build/world/derive-report.json, build/world/preview.png
        build/world/world_continents.shp / world_oceans.shp (+dbf/shx/prj/cpg) for GIS review

Method (no GIS dependencies, only numpy):
  1. The land rings, the lon/lat frame and a set of "cut" polylines are put into one planar
     arrangement (all intersections become shared vertices).
  2. Cut polylines over land only split land faces (Suez, Panama); cut polylines that cross
     water define the ocean limits. Where an ocean limit runs over land it is invisible.
  3. Every face is labeled: land faces by continent (connected land across non-continent cuts,
     plus an explicit island table), water faces by the ocean region (regions come from the
     same arrangement built from the cut lines alone, labeled by seed points).
  4. Faces with the same label are dissolved by keeping only half-edges whose two sides have
     different labels, and chaining them into rings.
Because continents and oceans come from the same edges, they share coastlines exactly.
"""
import json, math, os, re, struct, sys
from collections import defaultdict

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
SRC = os.path.join(ROOT, 'shp', 'ne_110m_land')
OUT = os.path.join(ROOT, 'build', 'world')

NAMES = {
    'C-NA': ('Észak-Amerika', 'Північна Америка', 'continent'),
    'C-SA': ('Dél-Amerika', 'Південна Америка', 'continent'),
    'C-AF': ('Afrika', 'Африка', 'continent'),
    'C-EA': ('Eurázsia', 'Євразія', 'continent'),
    'C-AU': ('Ausztrália', 'Австралія', 'continent'),
    'C-AN': ('Antarktisz', 'Антарктида', 'continent'),
    'O-PA': ('Csendes-óceán', 'Тихий океан', 'ocean'),
    'O-AT': ('Atlanti-óceán', 'Атлантичний океан', 'ocean'),
    'O-IN': ('Indiai-óceán', 'Індійський океан', 'ocean'),
    'O-AR': ('Északi-Jeges-tenger', 'Північний Льодовитий океан', 'ocean'),
    'O-SO': ('Déli-óceán', 'Південний океан', 'ocean'),
}

# Land polygon index (record order in ne_110m_land v4.1.0) -> continent. Unlisted islands are
# oceanic islands and stay grey background (New Zealand, Hawaii, Fiji, Vanuatu, Solomon Is.,
# New Caledonia, Bismarck Archipelago, Kerguelen).
MAINLAND = {112: 'AFEU', 95: 'AMER', 21: 'C-AU', 7: 'C-AN'}
ISLANDS = {
    'C-AN': [0, 1, 2, 3, 4, 5, 6],
    'C-SA': [8, 9, 45],                                  # Tierra del Fuego, Falklands, Trinidad
    'C-AU': [11, 32, 38],                                # Tasmania, Aru, New Guinea
    'C-AF': [20],                                        # Madagascar
    'C-EA': [23, 26, 27, 28, 31, 35, 36, 39, 40, 41, 42, 43, 44, 46, 47, 48, 49, 50, 51, 55, 63, 66,
             67, 68, 69, 70, 71, 72, 73, 79, 80, 81, 83, 89, 91, 93, 94, 101, 104, 106, 109, 115,
             119, 120, 121, 122, 123],                  # Indonesia, Philippines, Japan, Sri Lanka, Mediterranean
                                                         # islands, British Isles, Iceland, Arctic Russia, Svalbard;
                                                         # 91 = Chukotka east of 180°, 93/94 = Wrangel
    'C-NA': [52, 53, 54, 61, 62, 64, 65, 74, 75, 76, 77, 78, 82, 84, 85, 86, 87, 88, 90, 92, 96, 97,
             98, 99, 100, 102, 103, 105, 107, 108, 110, 111, 113, 114, 116, 117, 118, 124, 125, 126],
                                                         # Caribbean, Newfoundland, Alaska islands, Canadian
                                                         # Arctic Archipelago, Greenland
}
LAKE_RINGS = {(112, 1)}  # the Caspian Sea is a hole in the Eurasian land ring: water, but not an ocean

# Continent splits. Each segment starts and ends in water and crosses exactly one isthmus.
CONTINENT_CUTS = [
    [(32.30, 31.70), (32.45, 29.55)],    # Suez: Mediterranean -> Gulf of Suez
    [(-77.35, 9.30), (-78.05, 6.80)],    # Panama-Colombia border: Caribbean -> Pacific
]

# Ocean limits (lon, lat). Over land they are invisible; over water they are the ocean borders.
J_AM = (-120.0, 64.0)   # Americas line meets the Arctic line
J_EU = (90.0, 62.0)     # Siberian junction
J_AS = (80.0, 40.0)     # Central Asian junction
DRAKE, AGULHAS, TASMAN = -67.27, 20.0, 146.92
OCEAN_CUTS = [
    # Southern Ocean: 60°S
    [(-180.0, -60.0), (DRAKE, -60.0), (AGULHAS, -60.0), (TASMAN, -60.0), (180.0, -60.0)],
    # Atlantic | Pacific: Cape Horn meridian, then over the Americas
    [(DRAKE, -60.0), (DRAKE, -55.9), (-68.6, -54.6), (-69.6, -53.1), (-70.6, -51.0), (-69.0, -40.0),
     (-66.0, -20.0), (-75.0, 1.0), (-76.5, 6.0), (-80.0, 8.5), (-84.0, 10.0), (-87.0, 14.0),
     (-91.0, 16.0), (-97.0, 19.0), (-103.0, 25.0), (-110.0, 40.0), (-115.0, 55.0), J_AM],
    # Arctic limit, west part: Bering Strait, over Alaska and Canada, Fury and Hecla Strait,
    # Baffin Island, Davis Strait, Greenland, Denmark Strait, Iceland, Iceland-Faroe-Shetland, Norway,
    # then over northern Eurasia (south of the White Sea) to the antimeridian.
    [(-180.0, 67.0), (-174.0, 66.3), (-169.75, 66.05), (-168.10, 65.62), (-164.0, 65.3), (-158.0, 65.5),
     (-150.0, 66.0), (-135.0, 66.0), J_AM, (-105.0, 65.0), (-96.0, 66.0), (-87.3, 66.9), (-84.5, 69.0),
     (-82.5, 70.2), (-75.0, 69.0), (-61.4, 66.6), (-52.5, 66.9), (-40.0, 67.0), (-32.5, 68.2),
     (-23.0, 66.2), (-13.5, 65.1), (-7.0, 62.1), (-1.0, 60.6), (6.0, 61.0), (12.0, 63.0), (20.0, 66.4),
     (28.0, 66.0), (32.0, 63.5), (40.0, 62.5), (50.0, 63.0), (65.0, 63.0), J_EU, (120.0, 63.0),
     (145.0, 64.0), (160.0, 65.5), (170.0, 66.0), (180.0, 67.0)],
    # Atlantic | Indian: Cape Agulhas meridian, over Africa, Suez, Middle East
    [(AGULHAS, -60.0), (AGULHAS, -33.0), (25.0, -25.0), (30.0, -5.0), (31.0, 10.0), (32.0, 25.0),
     (32.2, 30.5), (36.5, 33.5), (44.0, 37.5), (60.0, 37.5), J_AS],
    # Atlantic | Pacific in Asia (over land)
    [J_AS, (85.0, 55.0), J_EU],
    # Indian | Pacific: Malay Peninsula, Sumatra, Java, Lesser Sunda Is., Timor, Australia, Bass Strait,
    # Tasmania, then the South East Cape meridian
    [J_AS, (95.0, 30.0), (100.0, 18.0), (98.9, 10.0), (101.5, 4.5), (103.5, 1.6), (102.5, -1.0),
     (104.5, -4.5), (106.5, -6.8), (114.3, -8.2), (117.5, -8.6), (121.0, -8.6), (125.0, -9.2),
     (127.0, -8.6), (131.8, -11.6), (138.0, -25.0), (146.4, -38.9), (146.5, -41.5), (TASMAN, -43.4),
     (TASMAN, -60.0)],
]
OCEAN_SEEDS = {'O-PA': [(-150.0, 0.0), (170.0, 0.0)], 'O-AT': [(-30.0, 0.0)], 'O-IN': [(80.0, -20.0)],
               'O-AR': [(0.0, 88.0)], 'O-SO': [(0.0, -80.0)]}

KEY = 1e9


def key(p):
    return (round(p[0] * KEY), round(p[1] * KEY))


# ---------------------------------------------------------------- shapefile I/O (polygons only)
def read_shp(path):
    b = open(path + '.shp', 'rb').read(); off = 100; recs = []
    while off < len(b):
        _, clen = struct.unpack('>ii', b[off:off + 8]); c = b[off + 8:off + 8 + clen * 2]; off += 8 + clen * 2
        if struct.unpack('<i', c[:4])[0] == 0: recs.append([]); continue
        nparts, npts = struct.unpack('<ii', c[36:44])
        parts = list(struct.unpack('<%di' % nparts, c[44:44 + 4 * nparts])) + [npts]
        p0 = 44 + 4 * nparts
        pts = [struct.unpack('<2d', c[p0 + 16 * i:p0 + 16 * i + 16]) for i in range(npts)]
        recs.append([pts[parts[i]:parts[i + 1]] for i in range(nparts)])
    return recs


def write_shp(path, records, fields):
    """records: list of (list_of_rings, {field: value}); rings in shapefile order (outer CW, holes CCW)."""
    shp_recs = []
    for rings, _ in records:
        pts = [p for r in rings for p in r]; parts = []; n = 0
        for r in rings: parts.append(n); n += len(r)
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        body = struct.pack('<i4d2i', 5, min(xs), min(ys), max(xs), max(ys), len(rings), len(pts))
        body += struct.pack('<%di' % len(parts), *parts) + b''.join(struct.pack('<2d', *p) for p in pts)
        shp_recs.append(body)
    allx = [p[0] for rs, _ in records for r in rs for p in r]; ally = [p[1] for rs, _ in records for r in rs for p in r]
    bbox = (min(allx), min(ally), max(allx), max(ally))

    def header(length_words):
        return struct.pack('>7i', 9994, 0, 0, 0, 0, 0, length_words) + struct.pack('<2i4d4d', 1000, 5, *bbox, 0, 0, 0, 0)
    shp = b''; shx = b''; off = 50
    for i, body in enumerate(shp_recs):
        shx += struct.pack('>2i', off, len(body) // 2)
        shp += struct.pack('>2i', i + 1, len(body) // 2) + body; off += 4 + len(body) // 2
    open(path + '.shp', 'wb').write(header(50 + len(shp) // 2) + shp)
    open(path + '.shx', 'wb').write(header(50 + len(shx) // 2) + shx)
    # dBASE III with UTF-8 text fields
    flen = {f: 80 for f in fields}
    hdr = struct.pack('<B3BIHH20x', 3, 126, 11, 10, len(records), 32 + 32 * len(fields) + 1, 1 + sum(flen.values()))
    for f in fields:
        hdr += struct.pack('<11sc4xBB14x', f.encode(), b'C', flen[f], 0)
    hdr += b'\r'
    rows = b''
    for _, attrs in records:
        rows += b' ' + b''.join(str(attrs[f]).encode('utf-8')[:flen[f]].ljust(flen[f], b' ') for f in fields)
    open(path + '.dbf', 'wb').write(hdr + rows + b'\x1a')
    open(path + '.cpg', 'w').write('UTF-8')
    open(path + '.prj', 'w').write(open(SRC + '.prj').read())


# ---------------------------------------------------------------- geometry helpers
def signed_area(r):
    a = np.asarray(r); x, y = a[:, 0], a[:, 1]
    return 0.5 * float(np.dot(x[:-1], y[1:]) - np.dot(x[1:], y[:-1]))


def point_in_ring(p, ring):
    a = np.asarray(ring); x0, y0 = a[:-1, 0], a[:-1, 1]; x1, y1 = a[1:, 0], a[1:, 1]
    cond = (y0 > p[1]) != (y1 > p[1])
    with np.errstate(divide='ignore', invalid='ignore'):
        xi = x0 + (p[1] - y0) * (x1 - x0) / (y1 - y0)
    return bool(np.count_nonzero(cond & (p[0] < xi)) % 2)


# ---------------------------------------------------------------- planar arrangement
class Arrangement:
    def __init__(self):
        self.segs = []  # (a, b, attrs) attrs: dict(kind=coast|cut|frame, land_right=bool, src=(poly, ring))

    def add_ring(self, ring, src):
        for a, b in zip(ring[:-1], ring[1:]):
            if a != b: self.segs.append((a, b, {'kind': 'coast', 'src': src}))

    def add_line(self, pts, kind):
        for a, b in zip(pts[:-1], pts[1:]): self.segs.append((tuple(a), tuple(b), {'kind': kind}))

    def build(self):
        segs = self.segs
        A = np.array([s[0] for s in segs], dtype=float); B = np.array([s[1] for s in segs], dtype=float)
        splits = defaultdict(list)  # seg index -> list of (t, point)
        nonfrontier = [i for i, s in enumerate(segs) if s[2]['kind'] != 'coast']
        # intersections: every non-coast segment against all segments (coast rings never cross each other)
        d = B - A
        for i in nonfrontier:
            a, b = A[i], B[i]; r = b - a
            denom = r[0] * d[:, 1] - r[1] * d[:, 0]
            qa = A - a
            with np.errstate(divide='ignore', invalid='ignore'):
                t = (qa[:, 0] * d[:, 1] - qa[:, 1] * d[:, 0]) / denom
                u = (qa[:, 0] * r[1] - qa[:, 1] * r[0]) / denom
            hit = (np.abs(denom) > 1e-15) & (t >= -1e-12) & (t <= 1 + 1e-12) & (u >= -1e-12) & (u <= 1 + 1e-12)
            hit[i] = False
            for j in np.nonzero(hit)[0]:
                p = tuple(a + t[j] * r)
                splits[i].append((float(t[j]), p)); splits[int(j)].append((float(u[j]), p))
            # collinear overlaps (frame edges vs land edges on the frame): split at vertices lying on segment
            col = (np.abs(denom) <= 1e-15)
            col[i] = False
            for j in np.nonzero(col)[0]:
                for p in (A[j], B[j]):
                    cross = (p[0] - a[0]) * r[1] - (p[1] - a[1]) * r[0]
                    if abs(cross) < 1e-9:
                        tt = float(np.dot(p - a, r) / np.dot(r, r))
                        if 1e-12 < tt < 1 - 1e-12: splits[i].append((tt, tuple(p)))
                for p in (a, b):
                    dj = B[j] - A[j]; cross = (p[0] - A[j][0]) * dj[1] - (p[1] - A[j][1]) * dj[0]
                    if abs(cross) < 1e-9:
                        tt = float(np.dot(p - A[j], dj) / np.dot(dj, dj))
                        if 1e-12 < tt < 1 - 1e-12: splits[int(j)].append((tt, tuple(p)))
        self.pts = {}
        edges = {}  # undirected key pair -> attrs (merged)
        for i, (a, b, attrs) in enumerate(segs):
            chain = [(0.0, a)] + sorted(splits.get(i, [])) + [(1.0, b)]
            for (_, p), (_, q) in zip(chain[:-1], chain[1:]):
                kp, kq = key(p), key(q)
                if kp == kq: continue
                self.pts.setdefault(kp, p); self.pts.setdefault(kq, q)
                k = (kp, kq) if kp < kq else (kq, kp)
                e = edges.setdefault(k, {'kinds': set(), 'land_right_dir': None, 'src': None})
                e['kinds'].add(attrs['kind'])
                if attrs['kind'] == 'coast':
                    e['land_right_dir'] = (kp, kq)  # shapefile rule: land is on the right of the ring direction
                    e['src'] = attrs['src']
        self.edges = edges
        # half-edges
        self.he = {}  # (u,v) -> dict
        out = defaultdict(list)
        for (u, v), e in edges.items():
            for s, t in ((u, v), (v, u)):
                self.he[(s, t)] = {'edge': e}
                out[s].append(t)
        self.order = {}
        for u, vs in out.items():
            pu = self.pts[u]
            vs.sort(key=lambda v: math.atan2(self.pts[v][1] - pu[1], self.pts[v][0] - pu[0]))
            self.order[u] = vs
        self.pos = {u: {v: i for i, v in enumerate(vs)} for u, vs in self.order.items()}

    def next_he(self, u, v):
        vs = self.order[v]; i = self.pos[v][u]
        return (v, vs[(i - 1) % len(vs)])  # clockwise neighbour of the twin -> face stays on the left

    def faces(self):
        seen = set(); cycles = []
        for h in self.he:
            if h in seen: continue
            cyc = []; cur = h
            while cur not in seen:
                seen.add(cur); cyc.append(cur); cur = self.next_he(*cur)
            cycles.append(cyc)
        self.cycles = cycles
        self.face_of = {}
        for ci, cyc in enumerate(cycles):
            for h in cyc: self.face_of[h] = ci
        self.ring = [[self.pts[u] for u, _ in cyc] + [self.pts[cyc[0][0]]] for cyc in cycles]
        self.area = [signed_area(r) for r in self.ring]
        return cycles


def interior_point(arr, ci):
    """A point just left of the longest half-edge of cycle ci."""
    best = max(arr.cycles[ci], key=lambda h: math.dist(arr.pts[h[0]], arr.pts[h[1]]))
    p, q = np.array(arr.pts[best[0]]), np.array(arr.pts[best[1]])
    m = (p + q) / 2; d = (q - p) / np.linalg.norm(q - p)
    return tuple(m + 1e-7 * np.array([-d[1], d[0]]))


# ---------------------------------------------------------------- main
def main():
    os.makedirs(OUT, exist_ok=True)
    recs = read_shp(SRC)
    frame = [(-180.0, -90.0), (180.0, -90.0), (180.0, 90.0), (-180.0, 90.0), (-180.0, -90.0)]
    report = {'source': 'Natural Earth 1:110m Physical Vectors, Land, v4.1.0 (public domain)', 'landPolygons': len(recs), 'checks': []}

    # 1) ocean regions from the cut lines alone
    reg = Arrangement(); reg.add_line(frame, 'frame')
    for line in OCEAN_CUTS: reg.add_line(line, 'cut')
    reg.build(); reg.faces()
    region_rings = {}
    for ci, a in enumerate(reg.area):
        if a <= 0: continue
        labs = [lab for lab, seeds in OCEAN_SEEDS.items() for s in seeds if point_in_ring(s, reg.ring[ci])]
        if len(labs) != 1: raise SystemExit(f'ocean region {ci} has seeds {labs}; area {a:.1f}')
        region_rings.setdefault(labs[0], []).append(reg.ring[ci])
    def region_of(p):
        hits = [lab for lab, rs in region_rings.items() if any(point_in_ring(p, r) for r in rs)]
        return hits[0] if len(hits) == 1 else None
    report['checks'].append({'id': 'ocean-regions', 'ok': sorted(region_rings) == sorted(OCEAN_SEEDS), 'detail': {k: len(v) for k, v in region_rings.items()}})

    # 2) full arrangement
    arr = Arrangement(); arr.add_line(frame, 'frame')
    for pi, rings in enumerate(recs):
        for ri, ring in enumerate(rings): arr.add_ring(ring, (pi, ri))
    for line in OCEAN_CUTS: arr.add_line(line, 'cut')
    for line in CONTINENT_CUTS: arr.add_line(line, 'ccut')
    arr.build(); cycles = arr.faces()

    # land / water per cycle: a coast half-edge tells which side is land
    def he_land_left(h):
        e = arr.he[h]['edge']
        if 'coast' not in e['kinds']: return None
        return e['land_right_dir'] != h  # land is right of the stored direction, so left of the reverse
    is_land = {}; src_of = {}
    for ci, cyc in enumerate(cycles):
        vals = [he_land_left(h) for h in cyc]; known = [v for v in vals if v is not None]
        if arr.area[ci] < 0:  # hole boundary or outer frame; resolved later from the containing face
            continue
        if known:
            if len(set(known)) != 1: raise SystemExit(f'cycle {ci}: inconsistent land side')
            is_land[ci] = known[0]
            src_of[ci] = next(arr.he[h]['edge']['src'] for h, v in zip(cyc, vals) if v is not None)
        else:
            p = interior_point(arr, ci)
            is_land[ci] = any(point_in_ring(p, ring) for rings in recs for ring in rings[:1]) and not any(point_in_ring(p, rings[k]) for rings in recs for k in range(1, len(rings)))
            src_of[ci] = None

    pos_cycles = [ci for ci in range(len(cycles)) if arr.area[ci] > 0]
    pos_bbox = {ci: (np.min(np.array(arr.ring[ci]), axis=0), np.max(np.array(arr.ring[ci]), axis=0)) for ci in pos_cycles}

    # holes: the containing face is the smallest positive cycle that contains a point just outside the hole
    container = {}
    for ci in range(len(cycles)):
        if arr.area[ci] >= 0: continue
        if abs(arr.area[ci] + 360 * 180) < 1e-6: container[ci] = None; continue  # outer frame face
        p = interior_point(arr, ci)
        cands = [c for c in pos_cycles if (pos_bbox[c][0] <= p).all() and (p <= pos_bbox[c][1]).all() and point_in_ring(p, arr.ring[c])]
        container[ci] = min(cands, key=lambda c: arr.area[c]) if cands else None
    def face(ci):
        return container.get(ci, ci) if arr.area[ci] < 0 else ci

    # 3a) continents: land faces connected across ocean-cut edges (not across continent cuts)
    parent = {ci: ci for ci in pos_cycles}
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for h, rec in arr.he.items():
        e = rec['edge']
        if 'coast' in e['kinds'] or 'ccut' in e['kinds'] or 'frame' in e['kinds']: continue
        f1, f2 = face(arr.face_of[h]), face(arr.face_of[(h[1], h[0])])
        if f1 is None or f2 is None or f1 == f2: continue
        if is_land.get(f1) and is_land.get(f2): parent[find(f1)] = find(f2)
    comp_src = defaultdict(set); comp_pts = defaultdict(list)
    for ci in pos_cycles:
        if is_land.get(ci):
            r = find(ci)
            if src_of.get(ci) is not None: comp_src[r].add(src_of[ci][0])
            comp_pts[r].extend(arr.ring[ci][:-1])
    island_label = {pi: lab for lab, lst in ISLANDS.items() for pi in lst}
    label = {}
    comp_label = {}
    for r, srcs in comp_src.items():
        if len(srcs) != 1: raise SystemExit(f'land component mixes polygons {srcs}')
        pi = next(iter(srcs)); pts = np.array(comp_pts[r])
        if pi in MAINLAND:
            m = MAINLAND[pi]
            if m == 'AFEU':
                africa = (pts[:, 1] < 31.6) & (pts[:, 0] < 32.45) | (pts[:, 1] < 12.7) & (pts[:, 0] < 52)
                comp_label[r] = 'C-AF' if africa.mean() > 0.5 else 'C-EA'
            elif m == 'AMER':
                comp_label[r] = 'C-SA' if (pts[:, 1] < 8.0).mean() > 0.5 else 'C-NA'
            else:
                comp_label[r] = m
        else:
            comp_label[r] = island_label.get(pi, 'BG')
    for ci in pos_cycles:
        if is_land.get(ci):
            label[ci] = comp_label[find(ci)]
        else:
            if src_of.get(ci) in LAKE_RINGS: label[ci] = 'LAKE'; continue
            lab = region_of(interior_point(arr, ci))
            if lab is None: raise SystemExit(f'water face {ci} outside every ocean region')
            label[ci] = lab
    # a lake face is bounded only by its hole ring; mark it by the ring source
    for ci in pos_cycles:
        if not is_land.get(ci):
            srcs = {arr.he[h]['edge']['src'] for h in cycles[ci] if 'coast' in arr.he[h]['edge']['kinds']}
            if srcs and srcs <= LAKE_RINGS: label[ci] = 'LAKE'

    def lab_of(h):
        f = face(arr.face_of[h]); return label.get(f, 'OUT') if f is not None else 'OUT'

    # 4) dissolve
    def dissolve(target):
        bnd = {h for h in arr.he if lab_of(h) in target and lab_of((h[1], h[0])) not in target}
        rings = []; used = set()
        for h0 in bnd:
            if h0 in used: continue
            ring = [arr.pts[h0[0]]]; h = h0
            while True:
                used.add(h); ring.append(arr.pts[h[1]])
                nx = arr.next_he(*h)
                while nx not in bnd:  # rotate around the vertex through interior edges
                    nx = arr.next_he(nx[1], nx[0])
                h = nx
                if h == h0: break
                if h in used: raise SystemExit('dissolve: ring chaining failed')
            rings.append(ring)
        outers = [r for r in rings if signed_area(r) > 0]; holes = [r for r in rings if signed_area(r) < 0]
        polys = [[o] for o in outers]
        for hl in holes:
            p = hl[0]
            cands = [i for i, o in enumerate(outers) if point_in_ring(((hl[0][0] + hl[1][0]) / 2, (hl[0][1] + hl[1][1]) / 2), o)]
            if not cands: raise SystemExit('hole without shell')
            polys[min(cands, key=lambda i: signed_area(outers[i]))].append(hl)
        return polys

    def r6(ring):
        # round to 1e-6 deg, then drop repeated vertices and A-B-A spikes (the source has one near
        # Haida Gwaii where two vertices differ by 1e-6 deg)
        out = []
        for x, y in ring[:-1]:
            q = [round(x, 6), round(y, 6)]
            if out and out[-1] == q: continue
            if len(out) >= 2 and out[-2] == q: out.pop(); continue
            out.append(q)
        # the same clean-up across the closing vertex
        while len(out) > 3:
            if out[0] == out[-1]: out.pop()
            elif out[1] == out[-1]: out.pop(0); out.pop()
            elif out[-2] == out[0]: out.pop()
            else: break
        return out + [out[0]]

    features = []
    for fid, (hu, uk, kind) in NAMES.items():
        polys = dissolve({fid})
        geom = {'type': 'MultiPolygon', 'coordinates': [[r6(r) for r in p] for p in polys]}
        features.append({'type': 'Feature', 'id': fid, 'properties': {'id': fid, 'names': {'hu': hu, 'uk': uk}, 'kind': kind}, 'geometry': geom})
    bg_polys = dissolve({'C-NA', 'C-SA', 'C-AF', 'C-EA', 'C-AU', 'C-AN', 'BG'})
    background = {'type': 'Feature', 'id': 'LAND', 'properties': {'id': 'LAND'}, 'geometry': {'type': 'MultiPolygon', 'coordinates': [[r6(r) for r in p] for p in bg_polys]}}

    # checks: total areas
    def total(fs):
        return sum(signed_area(r) for f in fs for p in f['geometry']['coordinates'] for r in p)
    land_area = sum(-signed_area(r) for rings in recs for r in rings)  # shapefile outer rings are CW
    cont = [f for f in features if f['properties']['kind'] == 'continent']
    ocean = [f for f in features if f['properties']['kind'] == 'ocean']
    lake_area = sum(arr.area[ci] for ci in pos_cycles if label.get(ci) == 'LAKE')
    bg_area = sum(arr.area[ci] for ci in pos_cycles if label.get(ci) == 'BG')
    report['checks'] += [
        {'id': 'land-area', 'ok': abs(total(cont) + bg_area - land_area) < 1e-3, 'detail': f'continents {total(cont):.3f} + grey islands {bg_area:.3f} vs land {land_area:.3f} deg²'},
        {'id': 'tiling', 'ok': abs(total(cont) + bg_area + total(ocean) + lake_area - 360 * 180) < 1e-3, 'detail': f'continents + islands + oceans + Caspian = {total(cont) + bg_area + total(ocean) + lake_area:.3f} of {360 * 180} deg²'},
    ]
    report['units'] = {f['id']: {'parts': len(f['geometry']['coordinates']), 'vertices': sum(len(r) for p in f['geometry']['coordinates'] for r in p), 'areaDeg2': round(total([f]), 3)} for f in features}
    report['greyIslands'] = sorted(pi for pi in range(len(recs)) if pi not in MAINLAND and pi not in island_label)
    if not all(c['ok'] for c in report['checks']): print(json.dumps(report['checks'], indent=1)); raise SystemExit('checks failed')

    json.dump({'type': 'FeatureCollection', 'features': features}, open(os.path.join(OUT, 'units.geojson'), 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump({'type': 'FeatureCollection', 'features': [background]}, open(os.path.join(OUT, 'background.geojson'), 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump(report, open(os.path.join(OUT, 'derive-report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    # GIS copies (shapefile ring order: outer clockwise, holes counter-clockwise)
    def shp_rings(polys):
        out = []
        for p in polys:
            out.append(list(reversed(p[0]))); out += [list(reversed(h)) for h in p[1:]]
        return out
    for kind, name in (('continent', 'world_continents'), ('ocean', 'world_oceans')):
        recsw = [(shp_rings([[[tuple(c) for c in r] for r in p] for p in f['geometry']['coordinates']]),
                  {'id': f['id'], 'name_hu': f['properties']['names']['hu'], 'name_uk': f['properties']['names']['uk']})
                 for f in features if f['properties']['kind'] == kind]
        write_shp(os.path.join(OUT, name), recsw, ['id', 'name_hu', 'name_uk'])

    display = display_package(features, background)
    json.dump(display, open(os.path.join(OUT, 'display.geojson'), 'w', encoding='utf-8'), ensure_ascii=False)
    if '--no-preview' not in sys.argv: preview(display)
    print(json.dumps(report['checks'], ensure_ascii=False))
    print(json.dumps(report['units'], ensure_ascii=False))


# ---------------------------------------------------------------- Robinson display coordinates
# MapLibre renders Web Mercator only. To show a Robinson map, every vertex is moved to the
# longitude/latitude whose Web Mercator position equals its Robinson position (same scale on both
# axes). The map then *looks* like Robinson, hit-testing stays consistent, and the poles fit
# (pseudo-latitude ±67°). The package therefore holds display coordinates, not geographic ones.
ROBINSON = np.array([  # Snyder: latitude, PLEN, PDFE
    [0, 1.0000, 0.0000], [5, 0.9986, 0.0620], [10, 0.9954, 0.1240], [15, 0.9900, 0.1860], [20, 0.9822, 0.2480],
    [25, 0.9730, 0.3100], [30, 0.9600, 0.3720], [35, 0.9427, 0.4340], [40, 0.9216, 0.4958], [45, 0.8962, 0.5571],
    [50, 0.8679, 0.6176], [55, 0.8350, 0.6769], [60, 0.7986, 0.7346], [65, 0.7597, 0.7903], [70, 0.7186, 0.8435],
    [75, 0.6732, 0.8936], [80, 0.6213, 0.9394], [85, 0.5722, 0.9761], [90, 0.5322, 1.0000]])


def _cubic(table, x):
    """Catmull-Rom interpolation of a table column on the 5° latitude grid."""
    t = np.clip(x, 0, 90) / 5.0; i = np.minimum(np.floor(t).astype(int), 17); f = t - i
    y = np.concatenate([[2 * table[0] - table[1]], table, [2 * table[-1] - table[-2]]])
    p0, p1, p2, p3 = y[i], y[i + 1], y[i + 2], y[i + 3]
    return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f ** 2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)


def robinson_xy(lon, lat):
    """Robinson plane, scaled so the equator spans ±π (the Web Mercator x range)."""
    a = np.abs(lat)
    x = _cubic(ROBINSON[:, 1], a) * np.radians(lon)
    y = np.sign(lat) * _cubic(ROBINSON[:, 2], a) * (1.3523 / 0.8487)
    return x, y


# The Robinson world is drawn at half the size of the Web Mercator world square. MapLibre keeps the
# viewport inside that square (renderWorldCopies: false); at full size a wide or tall map container
# could not zoom out far enough to show the whole Robinson outline.
DISPLAY_SCALE = 0.5


def xy_to_display(x, y):
    x, y = x * DISPLAY_SCALE, y * DISPLAY_SCALE
    return np.degrees(x), np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)


def densify(ring, step=1.0):
    out = []
    for a, b in zip(ring[:-1], ring[1:]):
        n = max(1, int(math.ceil(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / step)))
        out += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n)]
    out.append(ring[-1]); return out


def to_display_geom(geom):
    polys = []
    for poly in geom['coordinates']:
        rings = []
        for r in poly:
            d = np.array(densify([tuple(p) for p in r]))
            lon, lat = xy_to_display(*robinson_xy(d[:, 0], d[:, 1]))
            q = []
            for x, y in zip(lon, lat):
                v = [round(float(x), 6), round(float(y), 6)]
                if not q or q[-1] != v: q.append(v)
            if q[0] != q[-1]: q.append(q[0])
            rings.append(q)
        polys.append(rings)
    return {'type': 'MultiPolygon', 'coordinates': polys}


# Label boxes as the app draws them (src/map/map.module.css .label: 12px, max-width 120px, padding
# 1px 4px). Placement runs on a raster at a reference world width of 1300 px.
REF_PX = 1300
CELL = 2 * math.pi * DISPLAY_SCALE / REF_PX / 2   # raster cell: half a reference pixel, in Mercator radians


CHAR_PX, PAD_PX, LINE_PX, MAX_W_PX = 6.8, 8, 14.4, 120


def label_shapes(name):
    """Candidate label boxes (width, height, max-width) for a name: one line, or wrapped at spaces."""
    words = [w for w in re.split(r'(?<=-)|\s+', name) if w]  # browsers break at spaces and after hyphens
    out = []
    for lines in range(1, min(3, len(words)) + 1):
        best = None
        def splits(ws, k):
            if k == 1: yield [ws]; return
            for c in range(1, len(ws) - k + 2):
                for rest in splits(ws[c:], k - 1): yield [ws[:c]] + rest
        for parts in splits(words, lines):
            wpx = max(len(''.join(w if w.endswith('-') else w + ' ' for w in p).strip()) * CHAR_PX for p in parts) + PAD_PX
            if best is None or wpx < best: best = wpx
        if best <= MAX_W_PX: out.append((best, lines * LINE_PX + 2))
    if not out: out.append((MAX_W_PX, math.ceil(len(name) * CHAR_PX / (MAX_W_PX - PAD_PX)) * LINE_PX + 2))
    return out


def rasterize(polys, xs, ys):
    """Even-odd fill of display-space polygons (Mercator radians) on the cell grid."""
    grid = np.zeros((len(ys), len(xs)), dtype=bool)
    edges = []
    for poly in polys:
        for r in poly:
            a = np.array(r); edges.append(np.hstack([a[:-1], a[1:]]))
    e = np.vstack(edges); x0, y0, x1, y1 = e[:, 0], e[:, 1], e[:, 2], e[:, 3]
    for j, yv in enumerate(ys):
        m = (y0 > yv) != (y1 > yv)
        if not m.any(): continue
        xc = np.sort(x0[m] + (yv - y0[m]) * (x1[m] - x0[m]) / (y1[m] - y0[m]))
        for k in range(0, len(xc) - 1, 2):
            grid[j, np.searchsorted(xs, xc[k]):np.searchsorted(xs, xc[k + 1])] = True
    return grid


def window_full(ok, hw, hh):
    """For each cell: is the (2hw+1)x(2hh+1) window around it entirely True? (summed-area table)"""
    sat = np.zeros((ok.shape[0] + 1, ok.shape[1] + 1), dtype=np.int64)
    sat[1:, 1:] = ok.astype(np.int64).cumsum(0).cumsum(1)
    H, W = ok.shape; res = np.zeros_like(ok)
    if 2 * hh + 1 > H or 2 * hw + 1 > W: return res
    y0 = np.arange(0, H - 2 * hh); x0 = np.arange(0, W - 2 * hw)
    s = sat[y0[:, None] + 2 * hh + 1, x0[None, :] + 2 * hw + 1] - sat[y0[:, None], x0[None, :] + 2 * hw + 1] \
        - sat[y0[:, None] + 2 * hh + 1, x0[None, :]] + sat[y0[:, None], x0[None, :]]
    res[hh:H - hh, hw:W - hw] = s == (2 * hh + 1) * (2 * hw + 1)
    return res


def place_labels(disp_features):
    """One label point per unit, placed where its box fits inside the unit at the smallest map scale.

    A box that lies entirely inside its own unit cannot cover another unit or another label (units do
    not overlap). Long names may wrap (labelWidth sets the label's max-width). labelMinZoom is the zoom
    from which the box fits at the chosen point; the app hides the label below it (src/map/MapView.tsx)."""
    to_m = lambda poly: [[(math.radians(x), math.log(math.tan(math.pi / 4 + math.radians(y) / 2))) for x, y in r] for r in poly]
    polys = {f['id']: [to_m(p) for p in f['geometry']['coordinates']] for f in disp_features}
    allpts = np.array([p for ps in polys.values() for poly in ps for r in poly for p in r])
    xs = np.arange(allpts[:, 0].min(), allpts[:, 0].max(), CELL); ys = np.arange(allpts[:, 1].min(), allpts[:, 1].max(), CELL)
    px = 2  # cells per pixel at the reference width (see CELL)
    zoom_of = lambda world_px: round(math.log2(world_px / (512 * DISPLAY_SCALE)), 2)
    cells = lambda world_px, bw, bh: (int(bw / 2 * px * REF_PX / world_px), int(bh / 2 * px * REF_PX / world_px))
    labels = {}; report = {}
    for f in sorted(disp_features, key=lambda f: f['id']):
        fid = f['id']; inside = rasterize(polys[fid], xs, ys)

        def min_px_anywhere(bw, bh):
            lo, hi = 150, REF_PX * 8
            if not window_full(inside, *cells(hi, bw, bh)).any(): return None
            while hi - lo > 10:
                mid = (lo + hi) // 2
                if window_full(inside, *cells(mid, bw, bh)).any(): hi = mid
                else: lo = mid
            return hi
        shape = {}
        for loc, name in f['properties']['names'].items():
            cands = [(min_px_anywhere(w, h), w, h) for w, h in label_shapes(name)]
            cands = [c for c in cands if c[0] is not None]
            shape[loc] = min(cands)[1:]
        uw = max(v[0] for v in shape.values()); uh = max(v[1] for v in shape.values())
        need = min_px_anywhere(uw, uh)
        ok = window_full(inside, *cells(need, uw, uh))
        jj, ii = np.nonzero(ok)
        biggest = max(polys[fid], key=lambda p: abs(signed_area(p[0])))[0]
        cx, cy = np.mean(np.array(biggest), axis=0)
        k = int(np.argmin((xs[ii] - cx) ** 2 + (ys[jj] - cy) ** 2)); j, i = jj[k], ii[k]
        min_zoom = {}
        for loc, (bw, bh) in shape.items():
            best = REF_PX * 8
            for world_px in range(REF_PX * 8, 149, -10):
                hw, hh = cells(world_px, bw, bh)
                win = inside[max(0, j - hh):j + hh + 1, max(0, i - hw):i + hw + 1]
                if win.shape == (2 * hh + 1, 2 * hw + 1) and win.all(): best = world_px
                else: break
            min_zoom[loc] = zoom_of(best)
        lon, lat = math.degrees(xs[i]), math.degrees(2 * math.atan(math.exp(ys[j])) - math.pi / 2)  # already display space
        width = {loc: math.ceil(v[0]) for loc, v in shape.items()}
        labels[fid] = ([round(float(lon), 6), round(float(lat), 6)], min_zoom, width)
        report[fid] = {'minZoom': min_zoom, 'labelWidthPx': width}
    return labels, report


def display_package(features, background):
    disp = []
    for f in features:
        g = to_display_geom(f['geometry'])
        disp.append({'type': 'Feature', 'id': f['id'], 'properties': dict(f['properties']), 'geometry': g})
    labels, lrep = place_labels(disp)
    for f in disp: f['properties']['label'], f['properties']['labelMinZoom'], f['properties']['labelWidth'] = labels[f['id']]
    bg = {'type': 'Feature', 'id': 'LAND', 'properties': {'id': 'LAND'}, 'geometry': to_display_geom(background['geometry'])}
    xs = [p[0] for f in disp for poly in f['geometry']['coordinates'] for r in poly for p in r]
    ys = [p[1] for f in disp for poly in f['geometry']['coordinates'] for r in poly for p in r]
    bounds = [round(min(xs), 6), round(min(ys), 6), round(max(xs), 6), round(max(ys), 6)]
    return {'type': 'FeatureCollection', 'projection': 'Robinson (pre-projected into Web Mercator display coordinates)',
            'bounds': bounds, 'labels': lrep, 'features': disp, 'background': bg}


def preview(display):
    """Owner preview: the Robinson display data as the app draws it, with the placed hu labels."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.path import Path
    from matplotlib.patches import PathPatch
    to_m = lambda a: np.column_stack([np.radians(a[:, 0]), np.log(np.tan(np.pi / 4 + np.radians(a[:, 1]) / 2))])
    fig, ax = plt.subplots(figsize=(16, 8.5), dpi=110)
    def draw(geom, fc):
        for poly in geom['coordinates']:
            verts = []; codes = []
            for r in poly:
                a = to_m(np.array(r, dtype=float)); verts += a.tolist(); codes += [Path.MOVETO] + [Path.LINETO] * (len(a) - 2) + [Path.CLOSEPOLY]
            ax.add_patch(PathPatch(Path(verts, codes), facecolor=fc, edgecolor='#444444', lw=0.4))
    draw(display['background']['geometry'], '#C9CDD3')
    for f in display['features']: draw(f['geometry'], '#E5DFD2' if f['properties']['kind'] == 'continent' else '#C7DDF0')
    for f in display['features']:
        x, y = to_m(np.array([f['properties']['label']]))[0]
        ax.text(x, y, f['properties']['names']['hu'], ha='center', va='center', fontsize=9, bbox=dict(boxstyle='round,pad=0.2', fc='white', ec='none', alpha=0.85))
    ax.autoscale_view(); ax.set_aspect('equal'); ax.axis('off')
    fig.savefig(os.path.join(OUT, 'preview.png'), bbox_inches='tight'); plt.close(fig)


if __name__ == '__main__':
    main()
