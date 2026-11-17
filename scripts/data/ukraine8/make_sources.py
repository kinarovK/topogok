"""8th grade (Ukraine) source layers from Natural Earth 1:10m (public domain, v5.1.1), Ukraine point of view.

Writes GeoJSON layers (one file = one layer) under sources/ukraine8/<topic>/. Run once with a Natural Earth
checkout: python3 make_sources.py <natural-earth-vector> <out-dir>. Hand-placed coordinates are marked below.
"""
import json, os, struct, sys

NE, OUT = sys.argv[1], sys.argv[2]
WINDOW = (18.0, 40.6, 42.0, 53.2)  # lon0, lat0, lon1, lat1: Ukraine with its land and Black Sea neighbours

def dbf(path):
    b = open(path, 'rb').read(); n, hl, rl = struct.unpack_from('<IHH', b, 4); fields = []; o = 32
    while b[o] != 0x0D: fields.append((b[o:o + 11].split(b'\0')[0].decode(), b[o + 16])); o += 32
    rows = []
    for i in range(n):
        r = b[hl + i * rl + 1: hl + (i + 1) * rl]; d = {}; k = 0
        for name, ln in fields: d[name] = r[k:k + ln].decode('utf-8', 'replace').strip('\0 '); k += ln
        rows.append(d)
    return rows

def shp(path, i):
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

def clip(ring):
    """Sutherland–Hodgman clip of a closed ring to the window."""
    x0, y0, x1, y1 = WINDOW; pts = ring[:-1]
    for edge in range(4):
        def ins(p): return [p[0] >= x0, p[1] >= y0, p[0] <= x1, p[1] <= y1][edge]
        def cut(a, b):
            if edge in (0, 2): x = x0 if edge == 0 else x1; t = (x - a[0]) / (b[0] - a[0]); return (x, a[1] + t * (b[1] - a[1]))
            y = y0 if edge == 1 else y1; t = (y - a[1]) / (b[1] - a[1]); return (a[0] + t * (b[0] - a[0]), y)
        out = []
        for k, cur in enumerate(pts):
            prev = pts[k - 1]
            if ins(cur):
                if not ins(prev): out.append(cut(prev, cur))
                out.append(cur)
            elif ins(prev): out.append(cut(prev, cur))
        pts = out
        if not pts: return None
    pts = [p for k, p in enumerate(pts) if k == 0 or p != pts[k - 1]]
    return pts + [pts[0]] if len(pts) >= 3 else None

def polygons(rings):
    """Shapefile rings → clipped [[outer, holes...]]; outer rings are clockwise in shapefiles."""
    outers = [[r] for r in rings if area(r) < 0]
    for h in (r for r in rings if area(r) >= 0):
        for o in outers:
            if inside(h[0], o[0]): o.append(h); break
    out = []
    for poly in outers:
        o = clip(poly[0])
        if not o or abs(area(o)) < 1e-4: continue
        holes = [c for c in (clip(h) for h in poly[1:]) if c and abs(area(c)) > 1e-5]
        out.append([o] + holes)
    return out

def feature(fid, hu, uk, geometry): return {'type': 'Feature', 'properties': {'id': fid, 'name_hu': hu, 'name_uk': uk}, 'geometry': geometry}
def mpoly(polys): return {'type': 'MultiPolygon', 'coordinates': [[[list(p) for p in r] for r in poly] for poly in polys]}
def write(topic, layer, feats):
    os.makedirs(f'{OUT}/{topic}', exist_ok=True)
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(f'{OUT}/{topic}/{layer}.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(topic, layer, len(feats))

# --- Fekvés és határok ------------------------------------------------------------------------------------------
def land_in_window(cell=0.01):
    """Base land inside the window, cut on a raster (robust where the window edge crosses many coastlines) and
    traced back with marching squares (numpy, matplotlib, scikit-image; generator only)."""
    import numpy as np
    from skimage.measure import find_contours
    land = f'{NE}/10m_physical/ne_10m_land.shp'
    n = (os.path.getsize(land[:-4] + '.shx') - 100) // 8
    x0, y0, x1, y1 = WINDOW
    xs = np.arange(x0 + cell / 2, x1, cell); ys = np.arange(y1 - cell / 2, y0, -cell)
    H, W = len(ys), len(xs); m = np.zeros((H, W), bool)
    shx = open(land[:-4] + '.shx', 'rb').read(); b = open(land, 'rb').read()
    for i in range(n):
        o = struct.unpack_from('>i', shx, 100 + 8 * i)[0] * 2 + 8; bx0, by0, bx1, by1 = struct.unpack_from('<4d', b, o + 4)
        if bx1 < x0 or bx0 > x1 or by1 < y0 or by0 > y1: continue
        # Even–odd scanline fill: every edge toggles the cells right of its crossing on each row it spans.
        for r in shp(land, i):
            a = np.asarray(r); ax, ay, bx, by = a[:-1, 0], a[:-1, 1], a[1:, 0], a[1:, 1]
            lo, hi = np.minimum(ay, by), np.maximum(ay, by); keep = (hi > y0) & (lo < y1) & (ay != by)
            ax, ay, bx, by, lo, hi = ax[keep], ay[keep], bx[keep], by[keep], lo[keep], hi[keep]
            r0 = np.clip(np.floor((y1 - hi) / cell - 0.5).astype(int), 0, H - 1); r1 = np.clip(np.ceil((y1 - lo) / cell - 0.5).astype(int), 0, H - 1)
            cnt = r1 - r0 + 1; e = np.repeat(np.arange(len(r0)), cnt); rows = np.repeat(r0, cnt) + (np.arange(cnt.sum()) - np.repeat(np.cumsum(cnt) - cnt, cnt))
            c = y1 - (rows + 0.5) * cell; ok = (c >= lo[e]) & (c < hi[e]); e, rows, c = e[ok], rows[ok], c[ok]
            x = ax[e] + (c - ay[e]) * (bx[e] - ax[e]) / (by[e] - ay[e])
            col = np.clip(np.ceil((x - x0) / cell - 0.5).astype(int), 0, W)
            t = np.zeros((H, W + 1), np.int32); np.add.at(t, (rows, col), 1)
            m ^= (np.cumsum(t, axis=1)[:, :W] % 2).astype(bool)
    m = np.pad(m, 1).astype(float)
    rings = []
    for c in find_contours(m, 0.5):
        ring = [(round(x0 + (j - 1 + 0.5) * cell, 5), round(y1 - (i - 1 + 0.5) * cell, 5)) for i, j in c]
        if len(ring) >= 4 and abs(area(ring)) > 4 * cell * cell: rings.append(ring)
    # Containment depth decides outer rings (even) and holes (odd).
    polys = []; outers = []
    for r in rings:
        depth = sum(1 for q in rings if q is not r and abs(area(q)) > abs(area(r)) and inside(r[0], q))
        (outers if depth % 2 == 0 else polys).append(r)
    out = [[o] for o in outers]
    for h in polys:
        best = min((o for o in out if inside(h[0], o[0])), key=lambda o: abs(area(o[0])), default=None)
        if best: best.append(h)
    return out

write('fekves', 'hatter', [feature('land', 'Szárazföld', 'Суходіл', mpoly(land_in_window()))])

countries = f'{NE}/10m_cultural/ne_10m_admin_0_countries_ukr.shp'
rows = dbf(countries[:-4] + '.dbf')
COUNTRIES = [  # (NE name, id, hu, uk)
    ('Ukraine', 'ukrajna', 'Ukrajna', 'Україна'),
    ('Poland', 'lengyelorszag', 'Lengyelország', 'Польща'), ('Slovakia', 'szlovakia', 'Szlovákia', 'Словаччина'),
    ('Hungary', 'magyarorszag', 'Magyarország', 'Угорщина'), ('Romania', 'romania', 'Románia', 'Румунія'),
    ('Moldova', 'moldova', 'Moldova', 'Молдова'), ('Belarus', 'feheroroszorszag', 'Fehéroroszország', 'Білорусь'),
    ('Russia', 'oroszorszag', 'Oroszország', 'Росія'), ('Bulgaria', 'bulgaria', 'Bulgária', 'Болгарія'),
    ('Turkey', 'torokorszag', 'Törökország', 'Туреччина'), ('Georgia', 'gruzia', 'Grúzia', 'Грузія'),
]
feats = []
for ne_name, fid, hu, uk in COUNTRIES:
    i = next(k for k, r in enumerate(rows) if r['NAME'] == ne_name)
    feats.append(feature(fid, hu, uk, mpoly(polygons(shp(countries, i)))))
write('fekves', 'orszagok', feats)

marine = f'{NE}/10m_physical/ne_10m_geography_marine_polys.shp'
mrows = dbf(marine[:-4] + '.dbf')
seas = []
for ne_name, fid, hu, uk in [('Black Sea', 'feketetenger', 'Fekete-tenger', 'Чорне море'), ('Sea of Azov', 'azovitenger', 'Azovi-tenger', 'Азовське море')]:
    i = next(k for k, r in enumerate(mrows) if r['name'] == ne_name)
    seas.append(feature(fid, hu, uk, mpoly(polygons(shp(marine, i)))))
write('fekves', 'tengerek', seas)

# Mountains as ridge lines (as on the continent maps): the Carpathians as on the Eurasia map (ridge of the Natural
# Earth range polygon, from the continent GeoPackage); the Crimean Mountains hand-traced, to be checked by the owner.
import sqlite3
_g = sqlite3.connect('sources/continents/foldrajz_07_osztaly.gpkg').execute("select geom from eurazsia_hegysegek where id='karpatok'").fetchone()[0]
_b = _g[8 + [0, 32, 48, 48, 64][(_g[3] >> 1) & 7]:]
_n = struct.unpack_from('<I', _b, 5)[0]; _o = 9; _lines = []
for _ in range(_n):
    _k = struct.unpack_from('<I', _b, _o + 5)[0]; _lines.append([list(struct.unpack_from('<2d', _b, _o + 9 + 16 * j)) for j in range(_k)]); _o += 9 + 16 * _k
CARPATHIANS = {'type': 'MultiLineString', 'coordinates': _lines}
write('fekves', 'hegysegek', [
    feature('karpatok', 'Kárpátok', 'Карпати', CARPATHIANS),
    feature('krimihegyseg', 'Krími-hegység', 'Кримські гори', {'type': 'LineString', 'coordinates': [
        [33.62, 44.50], [33.95, 44.55], [34.25, 44.72], [34.55, 44.82], [34.90, 44.90], [35.20, 44.97]]}),
])
# Extreme points and the geographic centre (textbook names; coordinates from atlas knowledge).
write('fekves', 'pontok', [
    feature('hremjacs', 'Hremjacs', 'Грем’яч', {'type': 'Point', 'coordinates': [33.19, 52.37]}),
    feature('saricsfok', 'Szarics-fok', 'мис Сарич', {'type': 'Point', 'coordinates': [33.73, 44.39]}),
    feature('salamon', 'Salamon', 'Соломонове', {'type': 'Point', 'coordinates': [22.15, 48.41]}),
    feature('rannjazorja', 'Rannja Zorja', 'Рання Зоря', {'type': 'Point', 'coordinates': [40.22, 49.25]}),
    feature('marjanyivka', 'Marjanyivka', 'Мар’янівка', {'type': 'Point', 'coordinates': [31.48, 49.02]}),
])
