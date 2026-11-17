"""One-off fixes of the owner's GeoPackage (2026-11-17, requested by the owner after review).

Replaces hand-drawn rough outlines and broken rivers with Natural Earth 1:10m physical features (public domain)
and adds the missing Missouri and Lake Poopó. Run on a copy; the owner keeps a backup next to the original.
Usage: python3 fix_source.py <gpkg> <natural-earth-vector checkout>
"""
import sqlite3, struct, sys

GPKG, NE = sys.argv[1], sys.argv[2]

def shp_records(base, indices):
    shx = open(base + '.shx', 'rb').read(); shp = open(base + '.shp', 'rb').read(); out = {}
    for i in indices:
        off = struct.unpack_from('>i', shx, 100 + 8 * i)[0] * 2
        o = off + 8; t = struct.unpack_from('<i', shp, o)[0]
        assert t in (3, 5, 13, 15, 23, 25), t
        nparts, npts = struct.unpack_from('<ii', shp, o + 36)
        parts = list(struct.unpack_from(f'<{nparts}i', shp, o + 44)) + [npts]
        p0 = o + 44 + 4 * nparts
        pts = [struct.unpack_from('<2d', shp, p0 + 16 * k) for k in range(npts)]
        out[i] = (t % 10, [pts[parts[k]:parts[k + 1]] for k in range(nparts)])
    return out

def signed_area(r):
    return sum(r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1] for k in range(len(r) - 1)) / 2

def point_in(p, r):
    x, y = p; inside = False
    for k in range(len(r) - 1):
        (ax, ay), (bx, by) = r[k], r[k + 1]
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay): inside = not inside
    return inside

def polygons(rings):
    """Shapefile rings → [[outer, holes...]]: clockwise rings are outers (shapefile convention)."""
    outers = [[r] for r in rings if signed_area(r) < 0]
    for h in (r for r in rings if signed_area(r) >= 0):
        for o in outers:
            if point_in(h[0], o[0]): o.append(h); break
    return outers

def wkb_multipolygon(polys):
    b = struct.pack('<BII', 1, 6, len(polys))
    for poly in polys:
        b += struct.pack('<BII', 1, 3, len(poly))
        for r in poly:
            b += struct.pack('<I', len(r)) + b''.join(struct.pack('<2d', *p) for p in r)
    return b

def wkb_multiline(lines):
    b = struct.pack('<BII', 1, 5, len(lines))
    for l in lines: b += struct.pack('<BII', 1, 2, len(l)) + b''.join(struct.pack('<2d', *p) for p in l)
    return b

def gpkg_blob(wkb, pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    env = (min(xs), max(xs), min(ys), max(ys))
    return b'GP' + bytes([0, 0b011]) + struct.pack('<i', 4326) + struct.pack('<4d', *env) + wkb, env

def area_from(base, idx):
    recs = shp_records(f'{NE}/{base}', idx); polys = []
    for i in idx: polys += polygons(recs[i][1])
    return polys

def lines_from(base, idx):
    recs = shp_records(f'{NE}/{base}', idx); return [part for i in idx for part in recs[i][1]]

REG = '10m_physical/ne_10m_geography_regions_polys'
RIV = '10m_physical/ne_10m_rivers_lake_centerlines'
LAK = '10m_physical/ne_10m_lakes'

# Közép-Duna-medence: the inner foot of the Alps, Carpathians and Dinarides (hand-traced, ~30 points).
PANNONIAN = [[[
    (15.95, 46.55), (16.05, 47.2), (16.25, 47.75), (16.9, 48.1), (17.25, 48.45), (17.65, 48.6), (18.3, 48.55),
    (18.9, 48.3), (19.6, 48.3), (20.4, 48.5), (21.3, 48.62), (22.1, 48.5), (22.75, 48.3), (23.2, 48.05),
    (23.25, 47.8), (22.7, 47.4), (22.25, 47.0), (22.0, 46.45), (21.8, 45.95), (21.9, 45.55), (21.45, 45.05),
    (21.4, 44.78), (20.6, 44.6), (19.7, 44.72), (19.0, 44.92), (17.8, 45.05), (16.7, 45.25), (15.95, 45.75),
    (16.1, 46.25), (15.95, 46.55),
]]]

# Magellán-szoros: the middle of the strait, traced through Natural Earth 1:10m land (least-cost path that keeps
# away from the shores, via Cape Froward, Paso Tortuoso and Cabo Pilar), simplified to 0.01°.
MAGELLAN = [[(-68.298, -52.420), (-68.298, -52.448), (-68.378, -52.528), (-68.506, -52.528), (-68.722, -52.432), (-68.842, -52.432), (-68.906, -52.456), (-69.106, -52.456), (-69.210, -52.384), (-69.294, -52.364), (-69.402, -52.364), (-69.542, -52.472), (-69.610, -52.504), (-69.734, -52.636), (-69.870, -52.648), (-69.914, -52.672), (-70.142, -52.664), (-70.194, -52.692), (-70.294, -52.688), (-70.442, -52.732), (-70.506, -52.808), (-70.506, -52.912), (-70.670, -53.152), (-70.714, -53.284), (-70.714, -53.380), (-70.738, -53.420), (-70.742, -53.476), (-70.806, -53.600), (-70.838, -53.708), (-71.030, -53.916), (-71.298, -53.952), (-71.326, -53.928), (-71.406, -53.916), (-71.442, -53.892), (-71.618, -53.884), (-71.822, -53.832), (-71.898, -53.792), (-72.062, -53.788), (-72.214, -53.676), (-72.306, -53.648), (-72.354, -53.600), (-72.402, -53.600), (-72.422, -53.568), (-72.466, -53.556), (-72.538, -53.564), (-72.702, -53.504), (-72.766, -53.460), (-72.810, -53.456), (-72.906, -53.392), (-72.998, -53.372), (-73.094, -53.312), (-73.210, -53.268), (-73.314, -53.192), (-73.414, -53.080), (-73.446, -53.076), (-73.482, -53.040), (-73.482, -52.996), (-73.454, -52.976), (-73.806, -52.980), (-73.958, -52.848), (-74.030, -52.820), (-74.230, -52.812), (-74.294, -52.752), (-74.386, -52.748), (-74.482, -52.692), (-74.570, -52.692), (-74.598, -52.720)]]

AREAS = {  # (table, id): new polygons
    ('eszakamerika_teruletek', 'labradorfelsziget'): lambda: area_from(REG, [522]),
    ('eszakamerika_teruletek', 'kozpontisiksag'): lambda: area_from(REG, [685]),
    ('eszakamerika_teruletek', 'nagysiksag'): lambda: area_from(REG, [722]),
    ('delamerika_teruletek', 'laplataalfold'): lambda: area_from(REG, [686, 688]),
    ('delamerika_teruletek', 'orinocoalfold'): lambda: area_from(REG, [687]),
    ('ausztraliaesoceania_teruletek', 'kozpontialfold'): lambda: area_from(REG, [662]),
    ('eurazsia_teruletek', 'kozepdunamedence'): lambda: PANNONIAN,
}
LINES = {
    ('afrika_vonalak', 'kongo'): lambda: lines_from(RIV, [734, 736, 738, 740]),
    # Upper Paraná to the Paraguay confluence, then the lower Paraná and its delta branch; Natural Earth files the
    # Paraguay river under the same name (first part of record 733), which made the river look forked.
    ('delamerika_vonalak', 'parana'): lambda: lines_from(RIV, [648, 649]) + shp_records(f'{NE}/{RIV}', [733])[733][1][1:3]
        # Natural Earth leaves out the stretch under the Itaipu reservoir (Porto Camargo – Guaíra).
        + [[(-53.795, -23.355), (-54.0, -23.7), (-54.246, -24.05)]],
    ('delamerika_vonalak', 'magellanszoros'): lambda: MAGELLAN,
}
NEW = [  # (table, id, name_hu, name_uk, geometry)
    ('eszakamerika_vonalak', 'missouri', 'Missouri', 'Міссурі', lambda: ('line', lines_from(RIV, [1467, 1468]))),
    ('delamerika_teruletek', 'poopoto', 'Poopó-tó', 'Поопо', lambda: ('area', area_from(LAK, [1312]))),
]

# Extreme points of the mainland (owner request 2026-11-17). Names follow the 7th-grade textbook list
# (foldrajzi_nevjegyzek_6-11.md); Australia's are not in that list and use the usual school-atlas set.
POINTS = {
    'afrika_pontok': [
        ('rasangela', 'Ras Angela', 'мис Рас-Енгела', (9.75, 37.345)),
        ('tufok', 'Tű-fok', 'мис Голковий', (20.003, -34.830)),
        ('almadifok', 'Almadi-fok', 'мис Альмаді', (-17.530, 14.743)),
        ('rashafun', 'Ras Hafun', 'мис Рас-Гафун', (51.413, 10.440)),
    ],
    'eurazsia_pontok': [
        ('cseljuszkinfok', 'Cseljuszkin-fok', 'мис Челюскін', (104.28, 77.72)),
        ('piaifok', 'Piai-fok', 'мис Піай', (103.51, 1.265)),
        ('rocafok', 'Roca-fok', 'мис Рока', (-9.500, 38.781)),
        ('gyezsnyovfok', 'Gyezsnyov-fok', 'мис Дежньова', (-169.65, 66.08)),
    ],
    'eszakamerika_pontok': [
        ('murchisonfok', 'Murchison-fok', 'мис Мерчисон', (-94.47, 71.97)),
        ('mariatofok', 'Mariato-fok', 'мис Мар’ято', (-80.88, 7.21)),
        ('princeofwalesfok', 'Prince of Wales-fok', 'мис Принца Уельського', (-168.09, 65.61)),
        ('stcharlesfok', 'St. Charles-fok', 'мис Сент-Чарльз', (-55.62, 52.22)),
    ],
    'delamerika_pontok': [
        ('frowardfok', 'Froward-fok', 'мис Фроуерд', (-71.30, -53.90)),
        ('brancofok', 'Branco-fok', 'мис Кабу-Бранку', (-34.795, -7.148)),
        ('parinasfok', 'Pariñas-fok', 'мис Паріньяс', (-81.33, -4.68)),
    ],
    'ausztraliaesoceania_pontok': [
        ('yorkfok', 'York-fok', 'мис Йорк', (142.53, -10.69)),
        ('delkeletifok', 'Délkeleti-fok', 'мис Південно-Східний', (146.42, -39.13)),
        ('steeppoint', 'Steep Point', 'мис Стіп-Пойнт', (113.155, -26.153)),
        ('byronfok', 'Byron-fok', 'мис Байрон', (153.638, -28.637)),
    ],
}

def ensure_point_table(c, table, template='afrika_pontok'):
    """Creates an empty point layer like `template` (table, R-tree index, triggers, GeoPackage registration)."""
    if c.execute('select 1 from gpkg_contents where table_name=?', (table,)).fetchone(): return
    for typ, name, sql in c.execute("select type, name, sql from sqlite_master where (tbl_name=? or name like ?) and sql is not null and name not like ? order by type = 'trigger', name like 'rtree%'", (template, f'rtree_{template}_geom%', f'rtree_{template}_geom_%')).fetchall():
        if typ in ('table', 'trigger'): c.execute(sql.replace(template, table))
    c.execute("insert into gpkg_contents(table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id) values (?, 'features', ?, '', strftime('%Y-%m-%dT%H:%M:%fZ','now'), null, null, null, null, 4326)", (table, table))
    c.execute("insert into gpkg_geometry_columns values (?, 'geom', 'POINT', 4326, 0, 0)", (table,))
    c.execute("insert into gpkg_extensions values (?, 'geom', 'gpkg_rtree_index', 'http://www.geopackage.org/spec120/#extension_rtree', 'write-only')", (table,))
    c.execute('insert into gpkg_ogr_contents values (?, 0)', (table,))
    print('created', table)

c = sqlite3.connect(GPKG, isolation_level=None)
c.execute('pragma journal_mode=MEMORY'); c.execute('begin')
for t in POINTS: ensure_point_table(c, t)
trig = c.execute("select name, sql from sqlite_master where type='trigger' and name like 'rtree_%'").fetchall()
for name, _ in trig: c.execute(f'drop trigger "{name}"')

def set_geom(table, fid, wkb, pts):
    blob, (x0, x1, y0, y1) = gpkg_blob(wkb, pts)
    c.execute(f'update "{table}" set geom=? where fid=?', (blob, fid))
    c.execute(f'insert or replace into "rtree_{table}_geom"(id, minx, maxx, miny, maxy) values (?,?,?,?,?)', (fid, x0, x1, y0, y1))

for (table, fid_text), make in list(AREAS.items()) + list(LINES.items()):
    row = c.execute(f'select fid from "{table}" where id=?', (fid_text,)).fetchone()
    assert row, (table, fid_text)
    geom = make()
    if (table, fid_text) in AREAS: set_geom(table, row[0], wkb_multipolygon(geom), [p for poly in geom for p in poly[0]])
    else: set_geom(table, row[0], wkb_multiline(geom), [p for l in geom for p in l])
    print('replaced', table, fid_text, len(geom), 'part(s)')
for table, fid_text, hu, uk, make in NEW:
    kind, geom = make()
    if c.execute(f'select 1 from "{table}" where id=?', (fid_text,)).fetchone(): print('exists', fid_text); continue
    c.execute(f'insert into "{table}"(id, name_hu, name_uk) values (?,?,?)', (fid_text, hu, uk))
    fid = c.execute('select last_insert_rowid()').fetchone()[0]
    if kind == 'area': set_geom(table, fid, wkb_multipolygon(geom), [p for poly in geom for p in poly[0]])
    else: set_geom(table, fid, wkb_multiline(geom), [p for l in geom for p in l])
    print('added', table, fid_text)
for table, pts in POINTS.items():
    for fid_text, hu, uk, (x, y) in pts:
        if c.execute(f'select 1 from "{table}" where id=?', (fid_text,)).fetchone(): continue
        c.execute(f'insert into "{table}"(id, name_hu, name_uk) values (?,?,?)', (fid_text, hu, uk))
        fid = c.execute('select last_insert_rowid()').fetchone()[0]
        set_geom(table, fid, struct.pack('<BIdd', 1, 1, x, y), [(x, y)])
    print('points', table, len(pts))
for _, sql in trig: c.execute(sql)
c.execute('commit')
print(c.execute('pragma integrity_check').fetchone()[0])
