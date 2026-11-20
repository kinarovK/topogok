"""Small helpers shared by the source generators (Natural Earth shapefiles → GeoJSON layers).

Pure Python plus numpy and scikit-image (generator only; the app build does not need them).
"""
import json, os, struct

def dbf(path):
    b = open(path, 'rb').read(); n, hl, rl = struct.unpack_from('<IHH', b, 4); fields = []; o = 32
    while b[o] != 0x0D: fields.append((b[o:o + 11].split(b'\0')[0].decode(), b[o + 16])); o += 32
    rows = []
    for i in range(n):
        r = b[hl + i * rl + 1: hl + (i + 1) * rl]; d = {}; k = 0
        for name, ln in fields: d[name] = r[k:k + ln].decode('utf-8', 'replace').strip('\0 '); k += ln
        rows.append(d)
    return rows

def shp_count(path): return (os.path.getsize(path[:-4] + '.shx') - 100) // 8

def shp_box(path, i):
    shx = open(path[:-4] + '.shx', 'rb').read(); b = open(path, 'rb').read()
    o = struct.unpack_from('>i', shx, 100 + 8 * i)[0] * 2 + 8
    return struct.unpack_from('<4d', b, o + 4)

def shp_rings(path, i):
    """Parts of record i (polygon rings or polyline parts) as lists of (x, y)."""
    shx = open(path[:-4] + '.shx', 'rb').read(); b = open(path, 'rb').read()
    o = struct.unpack_from('>i', shx, 100 + 8 * i)[0] * 2 + 8
    nparts, npts = struct.unpack_from('<ii', b, o + 36)
    parts = list(struct.unpack_from(f'<{nparts}i', b, o + 44)) + [npts]; p0 = o + 44 + 4 * nparts
    pts = [struct.unpack_from('<2d', b, p0 + 16 * k) for k in range(npts)]
    return [pts[parts[k]:parts[k + 1]] for k in range(nparts)]

def area(r): return sum(r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1] for k in range(len(r) - 1)) / 2

def inside(p, r):
    x, y = p; c = False
    for k in range(len(r) - 1):
        (ax, ay), (bx, by) = r[k], r[k + 1]
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay): c = not c
    return c

def feature(fid, hu, uk, geometry): return {'type': 'Feature', 'properties': {'id': fid, 'name_hu': hu, 'name_uk': uk}, 'geometry': geometry}
def mpoly(polys): return {'type': 'MultiPolygon', 'coordinates': [[[list(p) for p in r] for r in poly] for poly in polys]}
def ring(*pts): return list(pts) + [pts[0]]
def pt(fid, hu, uk, lon, lat): return feature(fid, hu, uk, {'type': 'Point', 'coordinates': [lon, lat]})
def pts(rows): return [pt(*r) for r in rows]
def line(fid, hu, uk, *p): return feature(fid, hu, uk, {'type': 'LineString', 'coordinates': [list(x) for x in p]})

def writer(out):
    def write(topic, layer, feats):
        os.makedirs(f'{out}/{topic}', exist_ok=True)
        json.dump({'type': 'FeatureCollection', 'features': feats}, open(f'{out}/{topic}/{layer}.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
        print(topic, layer, len(feats))
    return write

# --- Raster cut and trace ------------------------------------------------------------------------------------------
def grid(window, cell):
    import numpy as np
    x0, y0, x1, y1 = window
    return x0, y1, cell, len(np.arange(y1 - cell / 2, y0, -cell)), len(np.arange(x0 + cell / 2, x1, cell))

def fill_rings(m, rings, g):
    """Even–odd scanline fill of rings into the boolean raster m (row 0 = north edge)."""
    import numpy as np
    x0, y1, cell, H, W = g; y0 = y1 - H * cell
    for r in rings:
        a = np.asarray(r, float); ax, ay, bx, by = a[:-1, 0], a[:-1, 1], a[1:, 0], a[1:, 1]
        lo, hi = np.minimum(ay, by), np.maximum(ay, by); keep = (hi > y0) & (lo < y1) & (ay != by)
        ax, ay, bx, by, lo, hi = ax[keep], ay[keep], bx[keep], by[keep], lo[keep], hi[keep]
        if not len(ax): continue
        r0 = np.clip(np.floor((y1 - hi) / cell - 0.5).astype(int), 0, H - 1); r1 = np.clip(np.ceil((y1 - lo) / cell - 0.5).astype(int), 0, H - 1)
        cnt = r1 - r0 + 1; e = np.repeat(np.arange(len(r0)), cnt); rows = np.repeat(r0, cnt) + (np.arange(cnt.sum()) - np.repeat(np.cumsum(cnt) - cnt, cnt))
        c = y1 - (rows + 0.5) * cell; ok = (c >= lo[e]) & (c < hi[e]); e, rows, c = e[ok], rows[ok], c[ok]
        x = ax[e] + (c - ay[e]) * (bx[e] - ax[e]) / (by[e] - ay[e])
        col = np.clip(np.ceil((x - x0) / cell - 0.5).astype(int), 0, W)
        t = np.zeros((H, W + 1), np.int32); np.add.at(t, (rows, col), 1)
        m ^= (np.cumsum(t, axis=1)[:, :W] % 2).astype(bool)
    return m

def dp(r, t):
    import numpy as np
    p = np.asarray(r); keep = np.zeros(len(p), bool); keep[0] = keep[-1] = True; stack = [(0, len(p) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1: continue
        v = p[b] - p[a]; w = p[a + 1:b] - p[a]; nv = np.hypot(*v)
        d = np.abs(v[0] * w[:, 1] - v[1] * w[:, 0]) / nv if nv > 0 else np.hypot(w[:, 0], w[:, 1])
        k = int(d.argmax())
        if d[k] > t: keep[a + 1 + k] = True; stack += [(a, a + 1 + k), (a + 1 + k, b)]
    return [(round(float(x), 5), round(float(y), 5)) for x, y in p[keep]]

def trace(m, g, min_cells=4, smooth=0.6):
    """Raster → polygons (marching squares; containment depth decides outer rings and holes), lightly simplified."""
    import numpy as np
    from skimage.measure import find_contours
    x0, y1, cell, H, W = g
    rings = []
    for c in find_contours(np.pad(m, 1).astype(float), 0.5):
        r = [(x0 + (j - 1 + 0.5) * cell, y1 - (i - 1 + 0.5) * cell) for i, j in c]
        if len(r) >= 4 and abs(area(r)) > min_cells * cell * cell: rings.append(r)
    outers, holes = [], []
    for r in rings:
        depth = sum(1 for q in rings if q is not r and abs(area(q)) > abs(area(r)) and inside(r[0], q))
        (outers if depth % 2 == 0 else holes).append(r)
    out = [[o] for o in outers]
    for h in holes:
        best = min((o for o in out if inside(h[0], o[0])), key=lambda o: abs(area(o[0])), default=None)
        if best: best.append(h)
    return [[dp(r, cell * smooth) for r in poly] for poly in out]

def raster_polys(rings, window, cell):
    import numpy as np
    g = grid(window, cell)
    return trace(fill_rings(np.zeros((g[3], g[4]), bool), rings, g), g)

def land(path, window, cell):
    """Land polygons of a Natural Earth land file inside the window."""
    x0, y0, x1, y1 = window; rings = []
    for i in range(shp_count(path)):
        bx0, by0, bx1, by1 = shp_box(path, i)
        if bx1 < x0 or bx0 > x1 or by1 < y0 or by0 > y1: continue
        rings += shp_rings(path, i)
    return raster_polys(rings, window, cell)

class Countries:
    """Natural Earth 1:10m countries (Ukraine point of view), rasterised per country."""
    def __init__(self, ne):
        self.path = f'{ne}/10m_cultural/ne_10m_admin_0_countries_ukr.shp'; self.rows = dbf(self.path[:-4] + '.dbf')
    def rings(self, name): return shp_rings(self.path, next(k for k, r in enumerate(self.rows) if r['NAME'] == name))
    def area(self, fid, hu, uk, name, cell=0.05, window=None):
        rs = self.rings(name)
        if window is None:
            xs = [p[0] for r in rs for p in r]; ys = [p[1] for r in rs for p in r]
            window = (max(-180, min(xs) - 0.2), max(-90, min(ys) - 0.2), min(180, max(xs) + 0.2), min(90, max(ys) + 0.2))
        return feature(fid, hu, uk, mpoly(raster_polys(rs, window, cell)))

def rivers(ne, wanted):
    """{id: (hu, uk, [record indices])} → line features from Natural Earth 1:10m rivers."""
    path = f'{ne}/10m_physical/ne_10m_rivers_lake_centerlines.shp'
    return [feature(fid, hu, uk, {'type': 'MultiLineString', 'coordinates': [[list(p) for p in part] for i in idx for part in shp_rings(path, i)]}) for fid, (hu, uk, idx) in wanted.items()]
