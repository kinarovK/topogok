"""Mountain ranges as ridge lines (owner decision 2026-11-17): the centre line of each range polygon.

The polygon is rasterised in a Lambert azimuthal plane centred on the range (no distortion worth mentioning at range
size, also across the 180° meridian or near the pole), skeletonised, and the longest path through the skeleton (its
graph diameter) is kept as the main ridge; its ends are carried on to the outline, then it is smoothed and simplified. Helper for
fix_source.py; needs numpy, scipy, scikit-image, networkx and matplotlib (run once on the owner's GeoPackage).
"""
import math
import numpy as np
import networkx as nx
from matplotlib.path import Path
from scipy import ndimage
from skimage.morphology import skeletonize

def _frame(polys):
    """Forward/inverse Lambert azimuthal equal-area projection centred on the polygons (unit sphere)."""
    v = np.array([[math.cos(math.radians(y)) * math.cos(math.radians(x)), math.cos(math.radians(y)) * math.sin(math.radians(x)), math.sin(math.radians(y))] for poly in polys for x, y in poly[0]]).mean(0)
    l0 = math.atan2(v[1], v[0]); p0 = math.atan2(v[2], math.hypot(v[0], v[1]))
    def fwd(pts):
        a = np.radians(np.asarray(pts, float)); l = a[:, 0] - l0; p = a[:, 1]
        k = np.sqrt(2 / (1 + math.sin(p0) * np.sin(p) + math.cos(p0) * np.cos(p) * np.cos(l)))
        return np.c_[k * np.cos(p) * np.sin(l), k * (math.cos(p0) * np.sin(p) - math.sin(p0) * np.cos(p) * np.cos(l))]
    def inv(xy):
        x, y = xy[:, 0], xy[:, 1]; r = np.hypot(x, y); c = 2 * np.arcsin(np.clip(r / 2, 0, 1)); r = np.where(r == 0, 1e-15, r)
        p = np.arcsin(np.cos(c) * math.sin(p0) + y * np.sin(c) * math.cos(p0) / r)
        l = l0 + np.arctan2(x * np.sin(c), r * math.cos(p0) * np.cos(c) - y * math.sin(p0) * np.sin(c))
        lon = (np.degrees(l) + 540) % 360 - 180
        return np.c_[lon, np.degrees(p)]
    return fwd, inv

def ridge(polys, cells=500, smooth=7, simplify=0.004):
    """polys: [[outer, holes...], ...] in lon/lat → list of lines (lon/lat), main ridge of each sizable part."""
    fwd, inv = _frame(polys)
    polys = [[fwd(r) for r in poly] for poly in polys]
    pts = np.vstack([poly[0] for poly in polys])
    x0, y0 = pts[:, 0].min(), pts[:, 1].min(); x1, y1 = pts[:, 0].max(), pts[:, 1].max()
    span = max(x1 - x0, y1 - y0); step = span / cells
    W = int((x1 - x0) / step) + 3; H = int((y1 - y0) / step) + 3
    gx = (np.arange(W) - 1 + 0.5) * step + x0; gy = (np.arange(H) - 1 + 0.5) * step + y0
    X, Y = np.meshgrid(gx, gy); P = np.c_[X.ravel(), Y.ravel()]
    mask = np.zeros(len(P), bool)
    for poly in polys:
        m = Path(poly[0]).contains_points(P)
        for h in poly[1:]: m &= ~Path(h).contains_points(P)
        mask |= m
    mask = mask.reshape(H, W)
    # A little closing so the skeleton does not sprout from jagged outlines.
    mask = ndimage.binary_closing(ndimage.binary_opening(mask, iterations=2), iterations=2)
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    lines = []
    for comp in range(1, n + 1):
        if sizes[comp - 1] < 0.08 * sizes.max(): continue
        sk = skeletonize(lab == comp)
        ys, xs = np.nonzero(sk)
        if len(ys) < 3: continue
        g = nx.Graph(); idx = {(y, x): i for i, (y, x) in enumerate(zip(ys, xs))}
        for (y, x), i in idx.items():
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    j = idx.get((y + dy, x + dx))
                    if j is not None and j != i: g.add_edge(i, j, weight=math.hypot(dx, dy))
        if g.number_of_nodes() < 3: continue
        g = g.subgraph(max(nx.connected_components(g), key=len))
        a = next(iter(g.nodes)); d = nx.single_source_dijkstra_path_length(g, a); b = max(d, key=d.get)
        d2, paths = nx.single_source_dijkstra(g, b); c = max(d2, key=d2.get)
        path = paths[c]
        line = np.array([(gx[xs[i]], gy[ys[i]]) for i in path])
        # The skeleton stops short of the range's ends: carry both ends on along their direction to the outline.
        inside = lambda q: 0 <= (iy := int(round((q[1] - gy[0]) / step))) < H and 0 <= (ix := int(round((q[0] - gx[0]) / step))) < W and lab[iy, ix] == comp
        n = max(2, len(line) // 15)
        for end in (0, 1):
            tip, back = (line[0], line[n]) if end == 0 else (line[-1], line[-1 - n])
            d = tip - back; d = d / (np.linalg.norm(d) or 1); q = tip.copy()
            while inside(q + d * step): q = q + d * step
            line = np.vstack([q, line]) if end == 0 else np.vstack([line, q])
        if len(line) > smooth:
            ker = np.ones(smooth) / smooth
            inner = np.c_[np.convolve(line[:, 0], ker, 'valid'), np.convolve(line[:, 1], ker, 'valid')]
            line = np.vstack([line[0], inner, line[-1]])
        lines.append(inv(dp(line, simplify * span)))
    return [[(round(float(x), 5), round(float(y), 5)) for x, y in l] for l in lines]

def dp(p, t):
    if len(p) < 3: return p
    a, b = p[0], p[-1]; v = b - a; w = p - a; nv = np.linalg.norm(v)
    d = np.abs(v[0] * w[:, 1] - v[1] * w[:, 0]) / nv if nv > 0 else np.linalg.norm(w, axis=1)
    i = int(d.argmax())
    return np.vstack([dp(p[:i + 1], t)[:-1], dp(p[i:], t)]) if d[i] > t else np.vstack([a, b])
