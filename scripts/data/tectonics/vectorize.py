"""Vectorize the 11 tectonic units of Ukraine from the textbook map image.

Input : sources/tectonics/ukraine-tectonics-source.png (raster map, legend colours)
        public/data/ukraine-administration/<v>/country.geojson (our validated country outline)
Output: build/tectonics/units.geojson (EPSG:4326), build/tectonics/vectorize-report.json,
        build/tectonics/preview.png
Usage : python3 scripts/data/tectonics/vectorize.py
Needs : numpy, scipy, scikit-image, opencv-python, Pillow (see requirements.txt)

Steps: classify pixels by legend colour -> georeference the image to our country outline
(Lambert conic + affine, refined by a 2nd-order polynomial ICP on the coastline/border) ->
fill text/lines/rivers/faults from neighbouring units -> drop specks -> smooth label fields
(argmax of Gaussian-blurred one-hot maps, so shared borders coincide) -> marching squares
-> transform to lon/lat. Only the 11 listed units are written; other land stays background.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage, optimize
from scipy.spatial import cKDTree
from skimage import measure

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'sources/tectonics/ukraine-tectonics-source.png'
COUNTRY = ROOT / 'public/data/ukraine-administration/2026.11.05.1/country.geojson'
OUT = ROOT / 'build/tectonics'

# id, legend RGB, hu, uk, allowed image region (x0, y0, x1, y1) for plausibility filtering
UNITS = [
    ('TU-01', (230, 121, 83), 'Ukrán-pajzs', 'Український щит', None),
    ('TU-02', (239, 164, 146), 'Voronyezsi kristályos masszívum', 'Воронезький кристалічний масив', (520, 0, 1310, 430)),
    ('TU-03', (249, 218, 228), 'Volinyi–Podóliai-tábla', 'Волино-Подільська плита', (0, 0, 430, 460)),
    ('TU-04', (138, 156, 164), 'Donyeci gyűrt szerkezet', 'Донецька складчаста споруда', (900, 250, 1310, 520)),
    ('TU-05', (183, 116, 100), 'Dnyeper–Donyeci-medence', 'Дніпровсько-Донецька западина', None),
    ('TU-06', (235, 155, 42), 'Lembergi-medence', 'Львівська западина', (0, 0, 360, 460)),
    ('TU-07', (246, 200, 120), 'Fekete-tenger melléki medence', 'Причорноморська западина', (380, 380, 1310, 835)),
    ('TU-08', (239, 217, 60), 'Kárpátok előtere menti süllyedék', 'Передкарпатський прогин', (0, 150, 360, 460)),
    ('TU-09', (224, 90, 93), 'Kárpáti gyűrt szerkezet', 'Карпатська складчаста споруда', (0, 150, 360, 460)),
    ('TU-10', (174, 205, 181), 'Kárpátaljai-medence', 'Закарпатський прогин', (0, 250, 260, 460)),
    ('TU-11', (133, 153, 103), 'A Krími-hegység gyűrt-rögös szerkezete', 'Складчасто-брилова споруда Гірського Криму', (700, 650, 1100, 835)),
]
# Land shown on the map but not part of the 11 units (stays non-questionable background).
OTHER_LAND = [(242, 184, 159), (244, 210, 168), (214, 198, 180), (195, 158, 118)]
# West European platform (light blue, near Lviv) - same hue family as rivers/reservoirs, handled separately.
WEP = [(166, 209, 241)]
# Where non-unit land legitimately occurs (WEP near Lviv, Danube/Dobrudja area, Crimea plains and Kerch).
OTHER_REGIONS = [(0, 100, 230, 330), (380, 600, 580, 760), (650, 630, 1150, 835)]
SEA = [(196, 223, 246)]
WHITE = [(255, 255, 255)]
LEGEND_BOXES = [(0, 465, 425, 835), (930, 60, 1200, 145)]

OUTSIDE, OTHER, UNKNOWN = 0, 12, -1
COLOR_TOL = 20.0
MIN_COMPONENT_PX = 250
UPSAMPLE = 2
SIGMA = 1.0  # in original pixels


def load_country() -> list[list[np.ndarray]]:
    fc = json.loads(COUNTRY.read_text(encoding='utf-8'))
    g = fc['features'][0]['geometry']
    polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    return [[np.array(r, float) for r in poly] for poly in polys]


# ---------- projection (spherical Lambert conformal conic) ----------
PHI1, PHI2, PHI0, LON0 = math.radians(45), math.radians(52), math.radians(48.5), math.radians(31)
N = math.log(math.cos(PHI1) / math.cos(PHI2)) / math.log(math.tan(math.pi / 4 + PHI2 / 2) / math.tan(math.pi / 4 + PHI1 / 2))
F = math.cos(PHI1) * math.tan(math.pi / 4 + PHI1 / 2) ** N / N
RHO0 = F / math.tan(math.pi / 4 + PHI0 / 2) ** N


def lcc(ll: np.ndarray) -> np.ndarray:
    lon, lat = np.radians(ll[:, 0]), np.radians(ll[:, 1])
    rho = F / np.tan(np.pi / 4 + lat / 2) ** N
    th = N * (lon - LON0)
    return np.stack([rho * np.sin(th), RHO0 - rho * np.cos(th)], 1)


def poly_terms(xy: np.ndarray, order: int) -> np.ndarray:
    x, y = xy[:, 0], xy[:, 1]
    cols = [np.ones_like(x)]
    for d in range(1, order + 1):
        for i in range(d + 1):
            cols.append(x ** (d - i) * y ** i)
    return np.stack(cols, 1)


def classify(rgb: np.ndarray) -> np.ndarray:
    pal = [u[1] for u in UNITS] + OTHER_LAND + WEP + SEA + WHITE
    codes = [i + 1 for i in range(len(UNITS))] + [OTHER] * len(OTHER_LAND) + [102] * len(WEP) + [100] * len(SEA) + [101] * len(WHITE)
    P = np.array(pal, float)
    d = ((rgb[:, :, None, :] - P[None, None]) ** 2).sum(-1)
    idx = d.argmin(-1)
    lab = np.array(codes)[idx]
    lab[np.sqrt(d.min(-1)) > COLOR_TOL] = UNKNOWN
    for x0, y0, x1, y1 in LEGEND_BOXES:
        lab[y0:y1, x0:x1] = 101
    return lab


def image_land_mask(lab: np.ndarray) -> np.ndarray:
    land = ((lab >= 1) & (lab <= OTHER)) | (lab == 102)
    land = ndimage.binary_closing(land, np.ones((5, 5)), iterations=1)
    land = ndimage.binary_fill_holes(land)
    cc, n = ndimage.label(land)
    sizes = ndimage.sum(land, cc, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 3000]
    return np.isin(cc, keep)


def rasterize(rings_px: list[np.ndarray], shape: tuple[int, int], scale: float = 1.0) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    pts = [np.round((r * scale) * 16).astype(np.int32) for r in rings_px]
    cv2.fillPoly(m, pts, 1, lineType=cv2.LINE_8, shift=4)
    return m.astype(bool)


def clean_ring(ll: np.ndarray) -> np.ndarray | None:
    """Closed ring without repeated points or zero-width spikes (rounding can create both)."""
    pts = [tuple(p) for p in ll]
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    changed = True
    while changed and len(pts) >= 3:
        changed = False
        out = []
        for p in pts:
            if out and out[-1] == p:
                changed = True
                continue
            out.append(p)
        if len(out) > 1 and out[0] == out[-1]:
            out.pop()
            changed = True
        res = []
        n = len(out)
        i = 0
        skip = set()
        for i in range(n):
            a, b, c = out[i - 1], out[i], out[(i + 1) % n]
            # b is a spike tip when the path goes a -> b -> a, or b lies on a straight backtrack
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])
            if cross == 0 and dot <= 0 and i - 1 not in skip:
                skip.add(i)
                changed = True
        pts = [p for i, p in enumerate(out) if i not in skip]
    if len(pts) < 3:
        return None
    return np.array(pts + [pts[0]], float)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
    H, W = rgb.shape[:2]
    lab = classify(rgb)
    land = image_land_mask(lab)
    country = load_country()
    rings_ll = [r for poly in country for r in poly]
    rings_proj = [lcc(r) for r in rings_ll]

    # ---- georeference: affine fit by mask overlap, then polynomial ICP on the outline ----
    allp = np.vstack(rings_proj)
    ys, xs = np.nonzero(land)
    sx = (xs.max() - xs.min()) / (allp[:, 0].max() - allp[:, 0].min())
    sy = (ys.max() - ys.min()) / (allp[:, 1].max() - allp[:, 1].min())
    p0 = np.array([sx, 0, xs.min() - sx * allp[:, 0].min(), 0, -sy, ys.max() + sy * allp[:, 1].min()])
    small = cv2.resize(land.astype(np.uint8), (W // 2, H // 2), interpolation=cv2.INTER_NEAREST).astype(bool)

    def affine(p, xy):
        return np.stack([p[0] * xy[:, 0] + p[1] * xy[:, 1] + p[2], p[3] * xy[:, 0] + p[4] * xy[:, 1] + p[5]], 1)

    def cost(p):
        m = rasterize([affine(p, r) for r in rings_proj], small.shape, 0.5)
        inter = (m & small).sum()
        return -inter / max(1, (m | small).sum())

    res = optimize.minimize(cost, p0, method='Powell', options={'maxiter': 4000, 'xtol': 1e-4, 'ftol': 1e-6})
    p = res.x
    iou_affine = -res.fun

    # Image outline points (border of the land mask), excluding edges touching legend boxes.
    contours = measure.find_contours(np.pad(land, 1).astype(float), 0.5)
    img_pts = np.vstack([c[:, ::-1] - 1 for c in contours if len(c) > 50])
    tree = cKDTree(img_pts)
    dense = []
    for r in rings_proj:
        for a, b in zip(r[:-1], r[1:]):
            dense.append(a)
    dense = np.array(dense)
    coef = None
    current = affine(p, dense)
    for _ in range(8):
        dist, j = tree.query(current)
        keep = dist < max(2.5, np.percentile(dist, 85))
        A = poly_terms(dense[keep], 2)
        cx, *_ = np.linalg.lstsq(A, img_pts[j[keep], 0], rcond=None)
        cy, *_ = np.linalg.lstsq(A, img_pts[j[keep], 1], rcond=None)
        coef = (cx, cy)
        T = poly_terms(dense, 2)
        current = np.stack([T @ cx, T @ cy], 1)
    dist, _ = tree.query(current)

    def fwd(ll: np.ndarray) -> np.ndarray:
        T = poly_terms(lcc(ll), 2)
        return np.stack([T @ coef[0], T @ coef[1]], 1)

    # Inverse: pixel -> lon/lat by a 3rd-order fit on a dense grid (checked below).
    gl = np.stack(np.meshgrid(np.linspace(21.5, 41, 120), np.linspace(43.8, 53, 80)), -1).reshape(-1, 2)
    gp = fwd(gl)
    Ti = poly_terms(gp / 1000.0, 3)
    ilon, *_ = np.linalg.lstsq(Ti, gl[:, 0], rcond=None)
    ilat, *_ = np.linalg.lstsq(Ti, gl[:, 1], rcond=None)

    def inv(px: np.ndarray) -> np.ndarray:
        T = poly_terms(px / 1000.0, 3)
        return np.stack([T @ ilon, T @ ilat], 1)

    inv_err_px = float(np.abs(fwd(inv(gp)) - gp).max())

    # ---- labels inside the true country outline ----
    inside = rasterize([fwd(r) for r in rings_ll], (H, W))
    work = lab.copy()
    work[~inside] = OUTSIDE
    work[inside & ((work == 100) | (work == 101))] = UNKNOWN  # sea-blue rivers, labels
    # Light-blue: keep the West European platform near Lviv as background, everything else
    # (rivers, reservoirs, hatching) is filled from the surrounding unit.
    cc, n = ndimage.label(work == 102)
    for i in range(1, n + 1):
        comp = cc == i
        cy, cx = ndimage.center_of_mass(comp)
        work[comp] = OTHER if (comp.sum() > 100 and cx < 220) else UNKNOWN
    rules = {i + 1: u[4] for i, u in enumerate(UNITS)}

    def allowed(k: int, cx: float, cy: float) -> bool:
        if k == OTHER:
            return any(b[0] <= cx <= b[2] and b[1] <= cy <= b[3] for b in OTHER_REGIONS)
        box = rules.get(k)
        return box is None or (box[0] <= cx <= box[2] and box[1] <= cy <= box[3])

    def refill(w: np.ndarray) -> np.ndarray:
        unknown = (w == UNKNOWN)
        if not unknown.any():
            return w
        _, (iy, ix) = ndimage.distance_transform_edt(unknown, return_indices=True)
        filled = w[iy, ix]
        w = w.copy()
        w[unknown] = filled[unknown]
        return w

    for _ in range(3):
        work = refill(work)
        changed = False
        for k in list(range(1, len(UNITS) + 1)) + [OTHER]:
            cc, n = ndimage.label(work == k)
            if n == 0:
                continue
            sizes = ndimage.sum(np.ones_like(cc), cc, range(1, n + 1))
            coms = ndimage.center_of_mass(np.ones_like(cc), cc, range(1, n + 1))
            for i, (s, (cy, cx)) in enumerate(zip(sizes, coms)):
                bad = s < MIN_COMPONENT_PX or not allowed(k, cx, cy)
                if bad:
                    work[cc == i + 1] = UNKNOWN
                    changed = True
        if not changed:
            break
    work = refill(work)
    work[~inside] = OUTSIDE

    # ---- smooth partition on an upsampled grid; marching squares per unit ----
    U = UPSAMPLE
    up = np.kron(work, np.ones((U, U), int))
    inside_up = rasterize([(fwd(r) + 0.5) * U - 0.5 for r in rings_ll], up.shape)
    classes = list(range(1, len(UNITS) + 1)) + [OTHER]
    top1 = np.full(up.shape, -1.0, np.float32)
    top2 = np.full(up.shape, -1.0, np.float32)
    arg = np.full(up.shape, -1, np.int16)

    def field(k):
        f = ndimage.gaussian_filter((up == k).astype(np.float32), SIGMA * U)
        f[~inside_up] = -1.0
        return f

    for k in classes:
        f = field(k)
        better = f > top1
        top2 = np.where(better, top1, np.maximum(top2, f))
        arg = np.where(better, k, arg)
        top1 = np.where(better, f, top1)
    out_field = np.where(inside_up, -1.0, 1.0).astype(np.float32)

    features = []
    report_units = []
    to_orig = lambda rc: np.stack([(rc[:, 1] + 0.5) / U - 0.5, (rc[:, 0] + 0.5) / U - 0.5], 1)
    for k, (uid, _, hu, uk, _) in enumerate(UNITS, start=1):
        f = field(k)
        other = np.where(arg == k, top2, top1)
        other = np.maximum(other, out_field)
        d = np.pad(f - other, 1, constant_values=-1.0)
        rings = []
        for c in measure.find_contours(d, 0.0):
            c = c - 1
            px = to_orig(c)
            ll = inv(px)
            ll = clean_ring(np.round(ll, 5))
            if ll is None:
                continue
            area_px = 0.5 * np.abs(np.dot(px[:-1, 0], px[1:, 1]) - np.dot(px[1:, 0], px[:-1, 1]))
            if area_px < 60 or len(ll) < 4:
                continue
            rings.append((ll, area_px))
        # nesting: even depth = shell, odd depth = hole
        def inside_ring(pt, ring):
            x, y = pt
            r = ring
            j = len(r) - 1
            c = False
            for i in range(len(r)):
                if (r[i, 1] > y) != (r[j, 1] > y) and x < (r[j, 0] - r[i, 0]) * (y - r[i, 1]) / (r[j, 1] - r[i, 1]) + r[i, 0]:
                    c = not c
                j = i
            return c
        depth = []
        for i, (ri, _) in enumerate(rings):
            probe = ri[0]
            depth.append(sum(1 for j, (rj, _) in enumerate(rings) if j != i and inside_ring(probe, rj)))
        shells = [i for i, dp in enumerate(depth) if dp % 2 == 0]
        polys = {i: [rings[i][0]] for i in shells}
        for i, dp in enumerate(depth):
            if dp % 2 == 1:
                owners = [s for s in shells if inside_ring(rings[i][0][0], rings[s][0]) and depth[s] == dp - 1]
                if owners:
                    polys[min(owners, key=lambda s: rings[s][1])].append(rings[i][0])

        def orient(r, ccw):
            a = np.dot(r[:-1, 0], r[1:, 1]) - np.dot(r[1:, 0], r[:-1, 1])
            return r if (a > 0) == ccw else r[::-1]

        coords = [[orient(poly[0], True).tolist()] + [orient(h, False).tolist() for h in poly[1:]] for poly in polys.values()]
        geom = {'type': 'Polygon', 'coordinates': coords[0]} if len(coords) == 1 else {'type': 'MultiPolygon', 'coordinates': coords}
        features.append({'type': 'Feature', 'id': uid, 'properties': {'id': uid, 'names': {'hu': hu, 'uk': uk}, 'kind': 'tectonic-unit'}, 'geometry': geom})
        report_units.append({'id': uid, 'parts': len(coords), 'vertices': int(sum(len(r) for p in coords for r in p)), 'pixels': int((work == k).sum())})

    fc = {'type': 'FeatureCollection', 'features': features}
    (OUT / 'units.geojson').write_text(json.dumps(fc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    report = {
        'source': str(SRC.relative_to(ROOT)), 'image_size': [W, H],
        'georeference': {
            'model': 'spherical LCC (45N/52N, 31E) + 2nd-order polynomial, ICP on the outline',
            'iou_affine': round(float(iou_affine), 4),
            'outline_residual_px': {'median': round(float(np.median(dist)), 2), 'p90': round(float(np.percentile(dist, 90)), 2), 'max': round(float(dist.max()), 2)},
            'km_per_px_approx': None,
            'inverse_max_error_px': round(inv_err_px, 4),
        },
        'units': report_units,
        'params': {'color_tolerance': COLOR_TOL, 'min_component_px': MIN_COMPONENT_PX, 'upsample': U, 'sigma_px': SIGMA},
    }
    # approximate scale
    a, b = fwd(np.array([[30.0, 48.5], [31.0, 48.5]]))
    report['georeference']['km_per_px_approx'] = round(111.32 * math.cos(math.radians(48.5)) / float(np.linalg.norm(a - b)), 3)
    (OUT / 'vectorize-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # ---- preview: original | result drawn back on the image grid ----
    pal = [(230, 121, 83), (239, 164, 146), (249, 218, 228), (138, 156, 164), (183, 116, 100), (235, 155, 42), (246, 200, 120), (239, 217, 60), (224, 90, 93), (174, 205, 181), (133, 153, 103)]
    canvas = np.full((H, W, 3), 255, np.uint8)
    canvas[inside] = (225, 225, 225)
    for k, feat in enumerate(features, start=1):
        g = feat['geometry']
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        for poly in polys:
            m = np.zeros((H, W), np.uint8)
            cv2.fillPoly(m, [np.round(fwd(np.array(poly[0])) * 16).astype(np.int32)], 1, shift=4)
            for h in poly[1:]:
                cv2.fillPoly(m, [np.round(fwd(np.array(h)) * 16).astype(np.int32)], 0, shift=4)
            canvas[m.astype(bool)] = pal[k - 1]
        for poly in polys:
            for r in poly:
                cv2.polylines(canvas, [np.round(fwd(np.array(r)) * 16).astype(np.int32)], True, (60, 60, 60), 1, cv2.LINE_AA, shift=4)
    for r in rings_ll:
        cv2.polylines(canvas, [np.round(fwd(r) * 16).astype(np.int32)], True, (200, 0, 60), 2, cv2.LINE_AA, shift=4)
    orig = np.asarray(Image.open(SRC).convert('RGB')).copy()
    # Georeferencing check: our country outline drawn onto the source image.
    for r in rings_ll:
        cv2.polylines(orig, [np.round(fwd(r) * 16).astype(np.int32)], True, (0, 90, 255), 1, cv2.LINE_AA, shift=4)
    Image.fromarray(orig).save(OUT / 'georeference-check.png')
    Image.fromarray(np.hstack([orig, np.full((H, 12, 3), 255, np.uint8), canvas])).save(OUT / 'preview.png')
    print(json.dumps(report['georeference'], indent=2))
    for u in report_units:
        print(u)


if __name__ == '__main__':
    main()
