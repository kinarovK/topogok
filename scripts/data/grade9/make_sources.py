"""9th grade (economic geography) source layers: sources/grade9/<topic>/*.geojson (one file = one layer).

Countries and land from Natural Earth (public domain; 1:10m countries, Ukraine point of view; 1:110m land). Basin
outlines are rough drafts and point coordinates come from atlas knowledge – both to be checked by the owner.
Ukraine's base outline and its fuel areas are taken over from the 8th grade sources.
Usage: python3 make_sources.py <natural-earth-vector checkout> <out-dir>
"""
import json, os, shutil, struct, sys

NE, OUT = sys.argv[1], sys.argv[2]

def dbf(path):
    b = open(path, 'rb').read(); n, hl, rl = struct.unpack_from('<IHH', b, 4); fields = []; o = 32
    while b[o] != 0x0D: fields.append((b[o:o + 11].split(b'\0')[0].decode(), b[o + 16])); o += 32
    rows = []
    for i in range(n):
        r = b[hl + i * rl + 1: hl + (i + 1) * rl]; d = {}; k = 0
        for name, ln in fields: d[name] = r[k:k + ln].decode('utf-8', 'replace').strip('\0 '); k += ln
        rows.append(d)
    return rows

def shp_rings(path, i):
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
def polygons(rings):
    outers = [[r] for r in rings if area(r) < 0]
    for h in (r for r in rings if area(r) >= 0):
        for o in outers:
            if inside(h[0], o[0]): o.append(h); break
    return outers

def feature(fid, hu, uk, geometry): return {'type': 'Feature', 'properties': {'id': fid, 'name_hu': hu, 'name_uk': uk}, 'geometry': geometry}
def mpoly(polys): return {'type': 'MultiPolygon', 'coordinates': [[[list(p) for p in r] for r in poly] for poly in polys]}
def ring(*pts): return list(pts) + [pts[0]]
def pt(fid, hu, uk, lon, lat): return feature(fid, hu, uk, {'type': 'Point', 'coordinates': [lon, lat]})
def areas(items): return [feature(i, hu, uk, mpoly([[r]])) for i, hu, uk, r in items]
def write(topic, layer, feats):
    os.makedirs(f'{OUT}/{topic}', exist_ok=True)
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(f'{OUT}/{topic}/{layer}.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(topic, layer, len(feats))

# --- World base ----------------------------------------------------------------------------------------------------
land = 'shp/ne_110m_land.shp'; n = (os.path.getsize(land[:-4] + '.shx') - 100) // 8
WORLD = [feature('land', 'Szárazföld', 'Суходіл', mpoly([p for i in range(n) for p in polygons(shp_rings(land, i))]))]

# --- 1. A világgazdaság országai --------------------------------------------------------------------------------------
countries = f'{NE}/10m_cultural/ne_10m_admin_0_countries_ukr.shp'; rows = dbf(countries[:-4] + '.dbf')
G20 = [  # textbook G20 list plus Kazakhstan (rich in minerals); NE name, id, hu, uk
    ('United States', 'usa', 'Amerikai Egyesült Államok', 'Сполучені Штати Америки'), ('Canada', 'kanada', 'Kanada', 'Канада'),
    ('Mexico', 'mexiko', 'Mexikó', 'Мексика'), ('Brazil', 'brazilia', 'Brazília', 'Бразилія'), ('Argentina', 'argentina', 'Argentína', 'Аргентина'),
    ('United Kingdom', 'egyesultkiralysag', 'Egyesült Királyság', 'Сполучене Королівство'), ('France', 'franciaorszag', 'Franciaország', 'Франція'),
    ('Germany', 'nemetorszag', 'Németország', 'Німеччина'), ('Italy', 'olaszorszag', 'Olaszország', 'Італія'), ('Russia', 'oroszorszag', 'Oroszország', 'Росія'),
    ('Turkey', 'torokorszag', 'Törökország', 'Туреччина'), ('Saudi Arabia', 'szaudarabia', 'Szaúd-Arábia', 'Саудівська Аравія'),
    ('South Africa', 'delafrika', 'Dél-afrikai Köztársaság', 'Південно-Африканська Республіка'), ('India', 'india', 'India', 'Індія'),
    ('China', 'kina', 'Kína', 'Китай'), ('Japan', 'japan', 'Japán', 'Японія'), ('Republic of Korea', 'delkorea', 'Dél-Korea', 'Південна Корея'),
    ('Indonesia', 'indonezia', 'Indonézia', 'Індонезія'), ('Australia', 'ausztralia', 'Ausztrália', 'Австралія'),
    ('Kazakhstan', 'kazahsztan', 'Kazahsztán', 'Казахстан'),
]
def dp(r, t):
    """Douglas–Peucker for a closed ring (keeps the first point); tiny rings are dropped by the caller."""
    import numpy as np
    p = np.asarray(r); keep = np.zeros(len(p), bool); keep[0] = keep[-1] = True; stack = [(0, len(p) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1: continue
        v = p[b] - p[a]; w = p[a + 1:b] - p[a]; nv = np.hypot(*v)
        d = np.abs(v[0] * w[:, 1] - v[1] * w[:, 0]) / nv if nv > 0 else np.hypot(w[:, 0], w[:, 1])
        k = int(d.argmax())
        if d[k] > t: keep[a + 1 + k] = True; stack += [(a, a + 1 + k), (a + 1 + k, b)]
    return [tuple(x) for x in p[keep]]
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

def country(ne_name, cell=0.05):
    """1:10m outline (the Ukraine point-of-view file exists only at this scale) rasterised at `cell` degrees and
    traced back: robust where the source rings are not valid, and light enough for a world map."""
    import numpy as np
    i = next(k for k, r in enumerate(rows) if r['NAME'] == ne_name)
    rings = shp_rings(countries, i)
    xs = [p[0] for r in rings for p in r]; ys = [p[1] for r in rings for p in r]
    win = (max(-180, min(xs) - 0.2), max(-90, min(ys) - 0.2), min(180, max(xs) + 0.2), min(90, max(ys) + 0.2))
    grid = _grid(win, cell)
    m = fill_rings(np.zeros((grid[3], grid[4]), bool), rings, grid)
    return mpoly([[dp(r, cell * 0.6) for r in poly] for poly in trace(m, grid, min_cells=6)])

write('orszagok', 'hatter', WORLD)
write('orszagok', 'g20', [feature(i, hu, uk, country(ne)) for ne, i, hu, uk in G20 if i != 'kazahsztan'])
write('orszagok', 'asvanykincs', [feature(i, hu, uk, country(ne)) for ne, i, hu, uk in G20 if i == 'kazahsztan'])

# --- 2. A világ szén-, kőolaj- és földgázmedencéi (rough drafts) -------------------------------------------------------
write('medencek', 'hatter', WORLD)
write('medencek', 'szen', areas([
    ('felsoszileziai', 'Felső-sziléziai-medence', 'Верхньосілезький басейн', ring((18.2, 50.5), (19.6, 50.4), (19.8, 49.9), (18.5, 49.8))),
    ('kuznyecki', 'Kuznyecki-medence (Kuzbassz)', 'Кузнецький басейн (Кузбас)', ring((85.5, 56.0), (87.5, 55.5), (88.5, 53.8), (87.0, 53.4), (85.8, 54.4))),
    ('karagandai', 'Karagandai-medence', 'Карагандинський басейн', ring((72.0, 50.2), (74.2, 50.2), (74.2, 49.4), (72.0, 49.4))),
    ('eszakkeletkinai', 'Északkelet-kínai szénmedence', 'Північно-Східний Китайський басейн', ring((122.0, 44.0), (126.5, 44.5), (127.0, 42.0), (123.5, 41.2), (121.5, 42.0))),
    ('keletindiai', 'Kelet-indiai szénmedence', 'Східноіндійський басейн', ring((84.0, 24.3), (87.3, 24.0), (87.5, 22.6), (85.0, 22.3), (83.5, 23.0))),
    ('appalache', 'Appalache-medence', 'Аппалацький басейн', ring((-80.5, 42.0), (-77.5, 41.5), (-80.0, 37.0), (-85.5, 33.3), (-87.5, 33.8), (-83.5, 38.0))),
    ('delkeletausztraliai', 'Délkelet-ausztráliai szénmedence', 'Південно-Східний Австралійський басейн', ring((148.0, -21.0), (150.5, -21.5), (152.0, -28.0), (151.5, -34.5), (150.0, -34.0), (149.5, -28.0), (147.5, -24.0))),
]))
write('medencek', 'koolajfoldgaz', areas([
    ('perzsaobol', 'Perzsa-öböl', 'Перська затока', ring((47.0, 31.0), (51.0, 30.0), (56.5, 26.5), (55.5, 23.5), (51.0, 23.0), (48.0, 26.0), (46.0, 29.5))),
    ('guineaiobol', 'Guineai-öböl', 'Гвінейська затока', ring((3.5, 7.0), (9.5, 6.5), (10.0, 2.0), (7.0, 1.5), (4.0, 4.0))),
    ('mexikoiobol', 'Mexikói-öböl', 'Мексиканська затока', ring((-97.5, 30.0), (-88.0, 30.5), (-84.0, 29.0), (-88.0, 26.0), (-94.0, 22.5), (-97.5, 22.0), (-98.0, 26.0))),
    ('nyugatsziberiai', 'Nyugat-szibériai-medence', 'Західносибірський басейн', ring((64.0, 66.0), (72.0, 71.0), (80.0, 68.5), (86.0, 62.0), (82.0, 57.0), (72.0, 56.0), (65.0, 60.0))),
    ('szunda', 'Szunda-medence', 'Зондський басейн', ring((95.5, 5.5), (100.5, 2.5), (106.0, -3.0), (111.0, -6.0), (108.0, -7.5), (103.0, -4.5), (97.5, 1.0))),
    ('szaharai', 'Szaharai-medence', 'Сахарський басейн', ring((2.0, 32.5), (10.0, 32.5), (16.0, 30.0), (15.0, 26.0), (8.0, 26.0), (3.0, 28.0))),
    ('texasi', 'Texasi-medence', 'Техаський басейн', ring((-104.0, 34.0), (-98.0, 34.5), (-96.5, 31.5), (-99.0, 29.0), (-103.0, 30.0))),
    ('nyugatkanadai', 'Nyugat-kanadai-medence', 'Західноканадський басейн', ring((-120.0, 60.0), (-110.0, 60.0), (-110.0, 49.5), (-114.5, 49.0), (-120.0, 54.0))),
    ('eszakitengeri', 'Északi-tengeri-medence', 'Північноморський басейн', ring((0.0, 61.5), (3.5, 62.0), (6.5, 58.5), (5.0, 54.5), (1.5, 53.5), (-1.0, 57.5))),
]))

# --- Ukraine topics (Ukraine outline as base) --------------------------------------------------------------------------
U8 = 'sources/ukraine8'
def ukraine_base(topic): os.makedirs(f'{OUT}/{topic}', exist_ok=True); shutil.copy(f'{U8}/felszin/hatter.geojson', f'{OUT}/{topic}/hatter.geojson')
def subset(path, ids): return [f for f in json.load(open(path))['features'] if f['properties']['id'] in ids]

# 7+8. Energetika: fuel areas (from the 8th grade draft) and the largest power plants.
ukraine_base('energetika')
write('energetika', 'szen', subset(f'{U8}/asvanykincs/szen.geojson', {'donyecimedence', 'lvivvolinyimedence'}))
write('energetika', 'koolajfoldgaz', json.load(open(f'{U8}/asvanykincs/koolajfoldgaz.geojson'))['features'])
write('energetika', 'hoeromuvek', [
    pt('zaporizzsjaihoe', 'Zaporizzsjai hőerőmű', 'Запорізька ТЕС', 34.66, 47.49),
    pt('dnyepermellekihoe', 'Dnyepermelléki hőerőmű', 'Придніпровська ТЕС', 35.12, 48.40),
    pt('tripilljaihoe', 'Tripilljai hőerőmű', 'Трипільська ТЕС', 30.74, 50.13),
    pt('zmijivihoe', 'Zmijivi hőerőmű', 'Зміївська ТЕС', 36.53, 49.59),
    pt('szlovjanszkihoe', 'Szlovjanszki hőerőmű', 'Слов’янська ТЕС', 37.73, 48.86),
    pt('ladizsinihoe', 'Ladizsini hőerőmű', 'Ладижинська ТЕС', 29.26, 48.70),
    pt('burshtynihoe', 'Burshtyni hőerőmű', 'Бурштинська ТЕС', 24.66, 49.21),
])
write('energetika', 'atomeromuvek', [
    pt('zaporizzsjaiae', 'Zaporizzsjai atomerőmű', 'Запорізька АЕС', 34.585, 47.512),
    pt('delukrajnaiae', 'Dél-ukrajnai atomerőmű', 'Південноукраїнська АЕС', 31.22, 47.81),
    pt('rivneiae', 'Rivnei atomerőmű', 'Рівненська АЕС', 25.89, 51.33),
    pt('hmelnickijiae', 'Hmelnickiji atomerőmű', 'Хмельницька АЕС', 26.65, 50.30),
])
write('energetika', 'vizeromuvek', [
    pt('dnyeperive', 'Dnyeperi vízerőmű (DnyiproHESZ)', 'Дніпровська ГЕС (ДніпроГЕС)', 35.087, 47.869),
    pt('dnyeszterive', 'Dnyeszteri vízerőmű', 'Дністровська ГЕС', 27.44, 48.585),
    pt('tasliki', 'Tasliki szivattyús-tározós erőmű', 'Ташлицька ГАЕС', 31.15, 47.86),
])

# 9. Kohászat: one point per centre (a city in several lists appears once) and the ore base.
ukraine_base('kohaszat')
write('kohaszat', 'kozpontok', [
    pt('krivijrih', 'Krivij Rih', 'Кривий Ріг', 33.39, 47.91), pt('dnyipro', 'Dnyipro', 'Дніпро', 35.046, 48.465),
    pt('kamjanszke', 'Kamjanszke', 'Кам’янське', 34.61, 48.51), pt('zaporizzsja', 'Zaporizzsja', 'Запоріжжя', 35.14, 47.84),
    pt('mariupol', 'Mariupol', 'Маріуполь', 37.55, 47.10), pt('donyeck', 'Donyeck', 'Донецьк', 37.803, 48.016),
    pt('makijivka', 'Makijivka', 'Макіївка', 37.96, 48.05), pt('jenakijeve', 'Jenakijeve', 'Єнакієве', 38.21, 48.23),
    pt('alcsevszk', 'Alcsevszk', 'Алчевськ', 38.80, 48.47), pt('nyikopol', 'Nyikopol', 'Нікополь', 34.40, 47.57),
    pt('novomoszkovszk', 'Novomoszkovszk', 'Новомосковськ', 35.25, 48.63), pt('harcizk', 'Harcizk', 'Харцизьк', 38.15, 48.04),
])
write('kohaszat', 'ercek', subset(f'{U8}/asvanykincs/ercek.geojson', {'krivbasz', 'nyikopolimangan'}) + areas([
    ('kremencsukivasercvidek', 'Kremencsuki vasércvidék', 'Кременчуцький залізорудний район', ring((33.45, 49.2), (33.85, 49.2), (33.85, 48.95), (33.45, 48.95))),
    ('bilozerszkeivasercvidek', 'Bilozerszkei vasércvidék', 'Білозерський залізорудний район', ring((34.8, 47.5), (35.15, 47.5), (35.15, 47.25), (34.8, 47.25))),
]) + [pt('velikijtokmak', 'Velikij Tokmak (mangánérc)', 'Великий Токмак (марганцеві руди)', 35.70, 47.22)])

# 10. Gépgyártás: one point per centre.
ukraine_base('gepgyartas')
write('gepgyartas', 'kozpontok', [
    pt('zaporizzsja', 'Zaporizzsja', 'Запоріжжя', 35.14, 47.84), pt('kremencsuk', 'Kremencsuk', 'Кременчук', 33.42, 49.07),
    pt('cserkaszi', 'Cserkaszi', 'Черкаси', 32.06, 49.444), pt('csernyihiv', 'Csernyihiv', 'Чернігів', 31.289, 51.498),
    pt('luck', 'Luck', 'Луцьк', 25.325, 50.747), pt('melitopol', 'Melitopol', 'Мелітополь', 35.37, 46.84),
    pt('proliszki', 'Proliszki', 'Проліски', 30.78, 50.39), pt('salamon', 'Salamon (Szolomonovo)', 'Соломоново', 22.17, 48.42),
    pt('perejaszlav', 'Perejaszlav-Hmelnickij', 'Переяслав', 31.445, 50.065), pt('dnyipro', 'Dnyipro', 'Дніпро', 35.046, 48.465),
    pt('lviv', 'Lviv', 'Львів', 24.03, 49.84), pt('harkiv', 'Harkiv', 'Харків', 36.23, 49.994),
    pt('kijev', 'Kijev', 'Київ', 30.523, 50.45), pt('kamjanszke', 'Kamjanszke', 'Кам’янське', 34.61, 48.51),
    pt('mariupol', 'Mariupol', 'Маріуполь', 37.55, 47.10), pt('mikolajiv', 'Mikolajiv', 'Миколаїв', 31.995, 46.975),
    pt('herszon', 'Herszon', 'Херсон', 32.617, 46.635), pt('kercs', 'Kercs', 'Керч', 36.47, 45.36),
    pt('feodoszija', 'Feodoszija', 'Феодосія', 35.38, 45.03), pt('izmajil', 'Izmajil', 'Ізмаїл', 28.84, 45.35),
    pt('krivijrih', 'Krivij Rih', 'Кривий Ріг', 33.39, 47.91), pt('kramatorszk', 'Kramatorszk', 'Краматорськ', 37.56, 48.72),
    pt('donyeck', 'Donyeck', 'Донецьк', 37.803, 48.016), pt('hmelnickij', 'Hmelnickij', 'Хмельницький', 26.987, 49.423),
    pt('szumi', 'Szumi', 'Суми', 34.798, 50.908), pt('bergyicsiv', 'Bergyicsiv', 'Бердичів', 28.59, 49.90),
])

# 11. Közlekedés: junctions, sea ports (Odesa once, as a port) and pipelines (rough routes in Ukraine).
ukraine_base('kozlekedes')
write('kozlekedes', 'csomopontok', [
    pt('kijev', 'Kijev', 'Київ', 30.523, 50.45), pt('lviv', 'Lviv', 'Львів', 24.03, 49.84), pt('dnyipro', 'Dnyipro', 'Дніпро', 35.046, 48.465),
    pt('harkiv', 'Harkiv', 'Харків', 36.23, 49.994), pt('kovel', 'Kovel', 'Ковель', 24.71, 51.215), pt('fasztyiv', 'Fasztyiv', 'Фастів', 29.92, 50.08),
    pt('zsmerinka', 'Zsmerinka', 'Жмеринка', 28.11, 49.04), pt('kozjatin', 'Kozjatin', 'Козятин', 28.84, 49.71), pt('szmila', 'Szmila', 'Сміла', 31.88, 49.22),
    pt('znamjanka', 'Znamjanka', 'Знам’янка', 32.66, 48.71), pt('sepetyivka', 'Sepetyivka', 'Шепетівка', 27.06, 50.18), pt('csap', 'Csap', 'Чоп', 22.20, 48.43),
])
write('kozlekedes', 'kikotok', [
    pt('odessza', 'Odessza', 'Одеса', 30.73, 46.49), pt('csornomorszk', 'Csornomorszk', 'Чорноморськ', 30.65, 46.30),
    pt('pivdennij', 'Pivdennij', 'Південний', 31.02, 46.62), pt('mikolajiv', 'Mikolajiv', 'Миколаїв', 31.995, 46.975),
    pt('herszon', 'Herszon', 'Херсон', 32.617, 46.635), pt('mariupol', 'Mariupol', 'Маріуполь', 37.55, 47.10),
])
def line(fid, hu, uk, *pts): return feature(fid, hu, uk, {'type': 'LineString', 'coordinates': [list(p) for p in pts]})
write('kozlekedes', 'csovezetekek', [
    line('druzsba', 'Barátság (Druzsba) kőolajvezeték', 'Нафтопровід «Дружба»', (26.6, 51.9), (25.9, 50.9), (25.15, 50.08), (24.2, 49.6), (23.3, 48.95), (22.3, 48.62)),
    line('szojuz', 'Szojuz gázvezeték', 'Газопровід «Союз»', (39.6, 49.6), (37.5, 49.4), (35.0, 49.2), (33.4, 49.07), (30.5, 48.9), (27.5, 48.9), (24.6, 48.95), (23.0, 48.7), (22.3, 48.62)),
    line('urengoj', 'Urengoj–Pomari–Ungvár gázvezeték', 'Газопровід Уренгой–Помари–Ужгород', (35.5, 51.25), (33.5, 50.4), (31.0, 50.0), (28.5, 49.6), (25.5, 49.0), (24.1, 48.75), (22.3, 48.62)),
    line('odesszabrodi', 'Odessza–Brodi kőolajvezeték', 'Нафтопровід Одеса–Броди', (31.02, 46.62), (30.0, 47.6), (28.9, 48.6), (27.5, 49.4), (25.15, 50.08)),
])

# 13. Üdülő- és gyógyhelyek.
ukraine_base('udulohelyek')
write('udulohelyek', 'udulohelyek', [
    pt('truszkavec', 'Truszkavec', 'Трускавець', 23.51, 49.28), pt('morsin', 'Morsin', 'Моршин', 23.87, 49.15),
    pt('szhidnicja', 'Szhidnicja', 'Східниця', 23.35, 49.22), pt('poljana', 'Poljana', 'Поляна', 22.97, 48.62),
    pt('kekesfured', 'Kékesfüred (Szinyak)', 'Синяк', 22.83, 48.58), pt('sajan', 'Saján', 'Шаян', 23.40, 48.08),
    pt('tiszaborkut', 'Tiszaborkút (Kvaszi)', 'Кваси', 24.28, 48.15), pt('mirhorod', 'Mirhorod', 'Миргород', 33.61, 49.97),
    pt('hmilnik', 'Hmilnik', 'Хмільник', 27.96, 49.56), pt('odessza', 'Odessza', 'Одеса', 30.73, 46.49),
    pt('jevpatorija', 'Jevpatorija', 'Євпаторія', 33.37, 45.19), pt('szaki', 'Szaki', 'Саки', 33.60, 45.13),
    pt('feodoszija', 'Feodoszija', 'Феодосія', 35.38, 45.03), pt('bergyanszk', 'Bergyanszk', 'Бердянськ', 36.79, 46.76),
    pt('jaremcse', 'Jaremcse', 'Яремче', 24.56, 48.45), pt('vorohta', 'Vorohta', 'Ворохта', 24.57, 48.28),
    pt('jalta', 'Jalta', 'Ялта', 34.17, 44.50), pt('alusta', 'Alusta', 'Алушта', 34.41, 44.67), pt('szudak', 'Szudak', 'Судак', 34.97, 44.85),
])
