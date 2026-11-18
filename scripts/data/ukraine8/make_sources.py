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
def _grid(window, cell):
    import numpy as np
    x0, y0, x1, y1 = window
    return x0, y1, cell, len(np.arange(y1 - cell / 2, y0, -cell)), len(np.arange(x0 + cell / 2, x1, cell))

def fill_rings(m, rings, grid):
    """Even–odd scanline fill of rings into the boolean raster m (row 0 = north edge)."""
    import numpy as np
    x0, y1, cell, H, W = grid; y0 = y1 - H * cell
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

def trace(m, grid, min_cells=4):
    """Raster → polygons (marching squares; containment depth decides outer rings and holes)."""
    import numpy as np
    from skimage.measure import find_contours
    x0, y1, cell, H, W = grid
    rings = []
    for c in find_contours(np.pad(m, 1).astype(float), 0.5):
        ring = [(round(x0 + (j - 1 + 0.5) * cell, 5), round(y1 - (i - 1 + 0.5) * cell, 5)) for i, j in c]
        if len(ring) >= 4 and abs(area(ring)) > min_cells * cell * cell: rings.append(ring)
    outers, holes = [], []
    for r in rings:
        depth = sum(1 for q in rings if q is not r and abs(area(q)) > abs(area(r)) and inside(r[0], q))
        (outers if depth % 2 == 0 else holes).append(r)
    out = [[o] for o in outers]
    for h in holes:
        best = min((o for o in out if inside(h[0], o[0])), key=lambda o: abs(area(o[0])), default=None)
        if best: best.append(h)
    return out

def land_in_window(cell=0.01):
    """Base land inside the window, cut on a raster (robust where the window edge crosses many coastlines)."""
    import numpy as np
    land = f'{NE}/10m_physical/ne_10m_land.shp'
    n = (os.path.getsize(land[:-4] + '.shx') - 100) // 8
    grid = _grid(WINDOW, cell); x0, y0, x1, y1 = WINDOW
    m = np.zeros((grid[3], grid[4]), bool)
    shx = open(land[:-4] + '.shx', 'rb').read(); b = open(land, 'rb').read()
    for i in range(n):
        o = struct.unpack_from('>i', shx, 100 + 8 * i)[0] * 2 + 8; bx0, by0, bx1, by1 = struct.unpack_from('<4d', b, o + 4)
        if bx1 < x0 or bx0 > x1 or by1 < y0 or by0 > y1: continue
        fill_rings(m, shp(land, i), grid)
    return trace(m, grid)

def partition_in_ukraine(units, cell=0.01):
    """Hand-drawn units → cut to Ukraine and to each other: every cell goes to the smallest unit covering it."""
    import numpy as np
    win = (22.0, 44.3, 40.3, 52.45); grid = _grid(win, cell)
    ukr = fill_rings(np.zeros((grid[3], grid[4]), bool), shp('shp/ukraine_country_boundary.shp', 0), grid)
    masks = [(u, fill_rings(np.zeros_like(ukr), [u[3]], grid) & ukr) for u in units]
    claimed = np.zeros_like(ukr); out = []
    for u, m in sorted(masks, key=lambda x: x[1].sum()):
        m = m & ~claimed; claimed |= m
        out.append(feature(u[0], u[1], u[2], mpoly(trace(m, grid))))
    order = [u[0] for u in units]
    return sorted(out, key=lambda f: order.index(f['properties']['id']))

def ring(*pts): return list(pts) + [pts[0]]

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

# --- Hand-drawn drafts (owner decision 2026-11-18): rough outlines from atlas knowledge, to be corrected by the owner.
# These maps show Ukraine alone (as the continent maps show one continent): its outline is the base.
_ukr = polygons(shp('shp/ukraine_country_boundary.shp', 0))
for t in ('felszin', 'asvanykincs', 'ovezetek'):
    os.makedirs(f'{OUT}/{t}', exist_ok=True)
    json.dump({'type': 'FeatureCollection', 'features': [feature('ukrajna', 'Ukrajna', 'Україна', mpoly(_ukr))]}, open(f'{OUT}/{t}/hatter.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))

LOWLANDS = [
    ('poleszjeialfold', 'Poleszjei-alföld', 'Поліська низовина', ring((23.0, 51.6), (24.5, 51.0), (25.5, 50.9), (26.5, 50.85), (27.5, 50.7), (28.5, 50.6), (29.5, 50.6), (30.3, 50.6), (30.6, 51.0), (31.2, 51.2), (32.0, 51.5), (33.0, 51.7), (34.0, 51.9), (34.3, 52.5), (23.0, 52.5))),
    ('dnyepermentialfold', 'Dnyeper menti alföld', 'Придніпровська низовина', ring((30.6, 50.6), (31.5, 51.1), (32.5, 51.35), (33.6, 51.3), (34.3, 50.9), (35.0, 50.3), (35.3, 49.6), (35.5, 49.0), (34.8, 48.6), (33.5, 48.8), (32.5, 49.1), (31.2, 49.6), (30.4, 50.3))),
    ('poltavaisiksag', 'Poltavai-síkság', 'Полтавська рівнина', ring((33.6, 50.2), (34.6, 50.4), (35.4, 49.9), (35.3, 49.2), (34.3, 49.1), (33.5, 49.5))),
    ('feketetengermellekialfold', 'Fekete-tenger-melléki-alföld', 'Причорноморська низовина', ring((28.2, 45.2), (28.8, 46.2), (29.5, 46.9), (30.4, 47.4), (31.5, 47.7), (33.0, 47.55), (34.0, 47.45), (35.3, 47.25), (36.4, 46.85), (36.6, 46.4), (35.5, 45.95), (35.6, 45.3), (35.0, 45.05), (34.0, 44.95), (33.4, 45.0), (32.4, 45.3), (31.0, 45.8), (29.6, 45.3))),
    ('karpataljaialfold', 'Kárpátaljai-alföld', 'Закарпатська низовина', ring((22.1, 48.4), (22.5, 48.65), (22.9, 48.38), (23.25, 48.05), (23.0, 47.9), (22.6, 48.0), (22.2, 48.15))),
]
UPLANDS = [
    ('volinyihatsag', 'Volinyi-hátság', 'Волинська височина', ring((23.8, 50.4), (24.2, 50.95), (25.5, 50.9), (26.5, 50.85), (27.0, 50.6), (26.8, 50.3), (25.5, 50.2), (24.3, 50.1))),
    ('podoliaihatsag', 'Podóliai-hátság', 'Подільська височина', ring((23.9, 50.0), (25.5, 50.15), (26.8, 50.25), (27.8, 50.0), (28.8, 49.6), (29.3, 49.0), (29.3, 48.5), (28.5, 48.2), (27.3, 48.35), (26.2, 48.45), (25.3, 48.6), (24.6, 49.0), (24.1, 49.5))),
    ('elokarpatihatsag', 'Előkárpáti-hátság', 'Передкарпатська височина', ring((23.1, 49.5), (24.0, 49.2), (24.8, 48.75), (25.4, 48.4), (25.8, 48.2), (26.2, 48.05), (25.9, 47.85), (25.2, 48.1), (24.5, 48.5), (23.6, 48.95), (22.9, 49.3))),
    ('dnyepermentihatsag', 'Dnyeper menti hátság', 'Придніпровська височина', ring((28.0, 50.4), (29.5, 50.55), (30.4, 50.3), (31.2, 49.6), (32.5, 49.1), (33.5, 48.7), (34.6, 48.2), (35.2, 47.8), (34.0, 47.5), (33.0, 47.6), (31.5, 47.9), (30.5, 48.2), (29.5, 48.5), (29.3, 49.0), (28.8, 49.6), (28.0, 50.0))),
    ('azovmellekihatsag', 'Azov-melléki-hátság', 'Приазовська височина', ring((35.6, 47.6), (36.6, 47.9), (37.6, 47.7), (38.0, 47.3), (37.2, 47.1), (36.2, 47.0), (35.4, 47.2))),
    ('donyecihatsag', 'Donyeci-hátság', 'Донецька височина', ring((37.3, 48.6), (38.5, 48.9), (39.6, 48.6), (40.2, 48.3), (39.8, 47.9), (38.6, 47.9), (37.6, 48.1))),
    ('kozeporoszhatsag', 'Közép-orosz-hátság nyúlványai', 'Відроги Середньоруської височини', ring((34.0, 52.0), (35.5, 51.3), (36.3, 50.6), (37.5, 50.3), (38.2, 50.0), (36.8, 49.8), (35.5, 50.2), (34.6, 50.9), (34.0, 51.4))),
]
# Lowlands and uplands are cut against each other in one go (no overlaps between the two layers either).
_relief = partition_in_ukraine(LOWLANDS + UPLANDS)
write('felszin', 'alfoldek', [f for f in _relief if f['properties']['id'] in {u[0] for u in LOWLANDS}])
write('felszin', 'hatsagok', [f for f in _relief if f['properties']['id'] in {u[0] for u in UPLANDS}])
write('felszin', 'hegysegek', [
    feature('ukrankarpatok', 'Ukrán-Kárpátok', 'Українські Карпати', {'type': 'LineString', 'coordinates': [[22.6, 49.05], [23.2, 48.85], [23.9, 48.55], [24.45, 48.2], [24.9, 47.95], [25.3, 47.8]]}),
    feature('krimihegyseg', 'Krími-hegység', 'Кримські гори', {'type': 'LineString', 'coordinates': [[33.62, 44.50], [33.95, 44.55], [34.25, 44.72], [34.55, 44.82], [34.90, 44.90], [35.20, 44.97]]}),
])
write('felszin', 'csucsok', [
    feature('hoverla', 'Hoverla', 'Говерла', {'type': 'Point', 'coordinates': [24.5003, 48.1603]}),
    feature('romankos', 'Roman-Kos', 'Роман-Кош', {'type': 'Point', 'coordinates': [34.2425, 44.6136]}),
    feature('kamula', 'Kamula', 'Камула', {'type': 'Point', 'coordinates': [24.36, 49.86]}),
    feature('belmakmohila', 'Belmak-Mohila', 'Бельмак-Могила', {'type': 'Point', 'coordinates': [36.66, 47.23]}),
    feature('mohilamecsetna', 'Mohila-Mecsetna', 'Могила-Мечетна', {'type': 'Point', 'coordinates': [38.85, 48.38]}),
])

def area_feats(items): return [feature(i, hu, uk, mpoly([[r]])) for i, hu, uk, r in items]
write('asvanykincs', 'szen', area_feats([
    ('donyecimedence', 'Donyeci-medence (Donbasz)', 'Донецький басейн (Донбас)', ring((37.1, 48.9), (38.3, 49.0), (39.6, 48.9), (40.2, 48.5), (39.9, 47.9), (38.6, 47.8), (37.4, 47.9), (36.8, 48.3))),
    ('lvivvolinyimedence', 'Lviv–Volinyi-medence', 'Львівсько-Волинський басейн', ring((23.9, 50.9), (24.6, 50.8), (24.6, 50.2), (24.1, 50.1), (23.7, 50.4))),
    ('dnyeperibarnaszen', 'Dnyeperi barnaszénmedence', 'Дніпровський буровугільний басейн', ring((30.0, 49.6), (31.6, 49.5), (33.0, 48.9), (34.3, 48.4), (34.0, 47.9), (32.5, 48.1), (31.0, 48.4), (30.0, 48.8))),
]))
write('asvanykincs', 'koolajfoldgaz', area_feats([
    ('nyugatikoolaj', 'Nyugati (Kárpáti) kőolaj- és földgázvidék', 'Західний (Карпатський) нафтогазоносний регіон', ring((22.9, 49.6), (24.0, 49.3), (25.0, 48.7), (25.8, 48.2), (25.3, 48.0), (24.3, 48.5), (23.2, 49.1))),
    ('keletikoolaj', 'Keleti (Dnyeper–Donyeci) kőolaj- és földgázvidék', 'Східний (Дніпровсько-Донецький) нафтогазоносний регіон', ring((31.5, 51.3), (33.0, 51.0), (35.0, 50.4), (37.5, 49.6), (38.5, 49.0), (37.5, 48.7), (35.5, 49.0), (33.5, 49.6), (31.8, 50.4))),
    ('delikoolaj', 'Déli (Fekete-tenger–Krím) kőolaj- és földgázvidék', 'Південний (Причорноморсько-Кримський) нафтогазоносний регіон', ring((32.0, 46.2), (33.5, 46.0), (35.0, 45.6), (36.0, 45.5), (35.5, 45.0), (33.5, 45.2), (32.0, 45.4))),
]))
write('asvanykincs', 'ercek', area_feats([
    ('krivbasz', 'Krivij Rih-i vasércmedence (Krivbasz)', 'Криворізький залізорудний басейн (Кривбас)', ring((33.2, 48.3), (33.5, 48.25), (33.55, 47.7), (33.35, 47.65), (33.25, 47.9))),
    ('nyikopolimangan', 'Nyikopoli mangánércmedence', 'Нікопольський марганцеворудний басейн', ring((33.9, 47.75), (34.9, 47.65), (34.9, 47.45), (34.0, 47.5))),
]))

write('ovezetek', 'ovezetek', partition_in_ukraine([
    ('vegyeserdok', 'Vegyes erdők övezete (Poleszje)', 'Зона мішаних лісів (Полісся)', ring((23.0, 51.6), (24.5, 51.0), (25.5, 50.9), (26.5, 50.85), (27.5, 50.7), (28.5, 50.6), (29.5, 50.6), (30.3, 50.6), (30.6, 51.0), (31.2, 51.2), (32.0, 51.5), (33.0, 51.7), (34.0, 51.9), (34.3, 52.5), (23.0, 52.5))),
    ('lombleveluerdok', 'Lomblevelű erdők övezete', 'Зона широколистяних лісів', ring((23.4, 50.8), (25.0, 50.85), (25.5, 50.0), (25.2, 49.4), (24.6, 48.9), (23.4, 49.2))),
    ('erdosztyepp', 'Erdőssztyepp', 'Лісостепова зона', ring((25.0, 50.7), (26.5, 50.6), (28.5, 50.5), (30.5, 50.6), (31.5, 51.0), (33.0, 51.4), (34.2, 51.9), (35.5, 51.4), (37.0, 50.6), (38.3, 50.1), (37.5, 49.7), (35.5, 49.3), (33.5, 48.9), (32.0, 48.6), (30.5, 48.5), (29.0, 48.0), (27.5, 48.4), (26.2, 48.4), (25.3, 48.6), (25.2, 49.4), (25.5, 50.0))),
    ('sztyepp', 'Sztyepp', 'Степова зона', ring((27.5, 48.4), (29.0, 48.0), (30.5, 48.5), (32.0, 48.6), (33.5, 48.9), (35.5, 49.3), (37.5, 49.7), (38.3, 50.0), (40.4, 49.9), (40.4, 47.0), (38.0, 46.6), (36.0, 46.0), (35.6, 44.9), (32.4, 45.3), (29.6, 45.3), (28.2, 45.2), (28.4, 46.5), (29.2, 47.5))),
    ('karpatihegyvidek', 'Kárpáti hegyvidék (magassági övezetesség)', 'Українські Карпати (висотна поясність)', ring((22.6, 49.0), (23.0, 49.45), (23.5, 49.2), (24.3, 48.75), (25.2, 48.2), (25.8, 47.9), (25.2, 47.7), (24.4, 47.95), (23.5, 48.0), (22.9, 48.2), (22.5, 48.6))),
    ('krimihegyvidek', 'Krími hegyvidék (magassági övezetesség)', 'Кримські гори (висотна поясність)', ring((33.4, 44.4), (33.6, 44.8), (34.3, 44.95), (35.0, 45.05), (35.5, 45.05), (35.3, 44.8), (34.5, 44.55), (33.7, 44.38))),
]))

# --- Közigazgatás: the oblasts of the administration topic plus their centres (owner request 2026-11-18). ---------
_adm = json.load(open('public/data/ukraine-administration/2026.11.05.1/regions.geojson'))['features']
write('kozigazgatas', 'megyek', [feature(f['id'].lower().replace('-', ''), f['properties']['names']['hu'], f['properties']['names']['uk'], f['geometry']) for f in _adm])
json.dump({'type': 'FeatureCollection', 'features': [feature('ukrajna', 'Ukrajna', 'Україна', mpoly(_ukr))]}, open(f'{OUT}/kozigazgatas/hatter.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
CENTRES = [  # textbook names (foldrajzi_nevjegyzek_6-11.md, 8th grade), city-centre coordinates
    ('vinnyica', 'Vinnyica', 'Вінниця', 28.468, 49.233), ('luck', 'Luck', 'Луцьк', 25.325, 50.747),
    ('dnyipro', 'Dnyipro', 'Дніпро', 35.046, 48.465), ('donyeck', 'Donyeck', 'Донецьк', 37.803, 48.016),
    ('zsitomir', 'Zsitomir', 'Житомир', 28.659, 50.255), ('ungvar', 'Ungvár', 'Ужгород', 22.288, 48.621),
    ('zaporizzsja', 'Zaporizzsja', 'Запоріжжя', 35.140, 47.839), ('ivanofrankivszk', 'Ivano-Frankivszk', 'Івано-Франківськ', 24.711, 48.923),
    ('kijev', 'Kijev', 'Київ', 30.523, 50.450), ('kropivnickij', 'Kropivnickij', 'Кропивницький', 32.262, 48.508),
    ('luhanszk', 'Luhanszk', 'Луганськ', 39.308, 48.574), ('lviv', 'Lviv', 'Львів', 24.030, 49.840),
    ('mikolajiv', 'Mikolajiv', 'Миколаїв', 31.995, 46.975), ('odessza', 'Odessza', 'Одеса', 30.723, 46.483),
    ('poltava', 'Poltava', 'Полтава', 34.551, 49.588), ('rivne', 'Rivne', 'Рівне', 26.252, 50.620),
    ('szumi', 'Szumi', 'Суми', 34.798, 50.908), ('ternopil', 'Ternopil', 'Тернопіль', 25.595, 49.554),
    ('harkiv', 'Harkiv', 'Харків', 36.230, 49.994), ('herszon', 'Herszon', 'Херсон', 32.617, 46.635),
    ('hmelnyickij', 'Hmelnyickij', 'Хмельницький', 26.987, 49.423), ('cserkaszi', 'Cserkaszi', 'Черкаси', 32.060, 49.444),
    ('csernyivci', 'Csernyivci', 'Чернівці', 25.940, 48.292), ('csernyihiv', 'Csernyihiv', 'Чернігів', 31.289, 51.498),
    ('szimferopol', 'Szimferopol', 'Сімферополь', 34.102, 44.952), ('szevasztopol', 'Szevasztopol', 'Севастополь', 33.525, 44.617),
]
write('kozigazgatas', 'kozpontok', [feature(i, hu, uk, {'type': 'Point', 'coordinates': [x, y]}) for i, hu, uk, x, y in CENTRES])
