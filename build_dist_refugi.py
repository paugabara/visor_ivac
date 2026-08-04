#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Calcula, per a cada secció censal de l'IVAC, la distància PER LA XARXA VIÀRIA
(a peu) al refugi climàtic més proper i l'escriu a dist_refugi.json (secció ->
metres). No modifica IVAC.geojson.

Xarxa: IDE AMB, guia metropolitana del carrerer (capa GAMB_TR, 93k trams).
S'exclouen els tipus no caminables (autopista / autovia / cinturó).

Mètode eficient (no es calcula ruta secció->refugi una a una):
  1) graf NO dirigit -> nodes = extrems de tram, pes = longitud del tram
  2) s'hi enganxen (snap) refugis i centroides de secció al node més proper
  3) UN sol Dijkstra multi-origen des de tots els refugis alhora -> cada node
     queda amb la distància al refugi més proper
  4) cada secció pren la distància del seu node + el tram d'accés (snap)

Només biblioteca estàndard de Python (com build_refugis.py).
"""

import json
import math
import heapq
import os
import urllib.parse
import urllib.request

# --------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
CARRERER = ("https://ide.amb.cat/geoserveis/rest/services/Cartografia/"
            "guia_metropolitana_carrerer/MapServer/0/query")
EXCLOU = {"Autopista", "Autovia", "Cinturó"}      # tipus de via NO caminables
IVAC_IN = os.path.join(HERE, "IVAC.geojson")
REFUGIS = os.path.join(HERE, "refugis_climatics.geojson")
OUT = os.path.join(HERE, "dist_refugi.json")
CACHE = os.path.join(HERE, "carrerer_cache.json")  # cau del carrerer (evita re-baixar-lo)
KEYFIELD = "id"                                    # identificador únic de polígon
SNAP_DEC = 5                                        # arrodoniment de nodes (~1 m)
CELL = 0.006                                        # cel·la de l'índex (~500 m)
UA = {"User-Agent": "visor-ivac-distancia/1.0 (+github actions)"}
R = 6371000.0


def http_json(url, timeout=180):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def hav(p, q):
    """Distància en metres entre dos punts [lon, lat]."""
    lo1, la1, lo2, la2 = (math.radians(p[0]), math.radians(p[1]),
                          math.radians(q[0]), math.radians(q[1]))
    dla, dlo = la2 - la1, lo2 - lo1
    a = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# --------------------------------------------------------------------------
# 1) Baixada del carrerer (paginat, reprojectat a EPSG:4326)
# --------------------------------------------------------------------------
def fetch_carrerer():
    if os.path.exists(CACHE):
        print("  (reutilitzant la cau local carrerer_cache.json)")
        return json.load(open(CACHE, encoding="utf-8"))
    feats, offset, page, guard = [], 0, 2000, 0
    while guard < 80:
        guard += 1
        qs = urllib.parse.urlencode({
            "where": "1=1",
            "outFields": "TIPUSVIA",
            "outSR": "4326",
            "returnGeometry": "true",
            "resultOffset": offset,
            "resultRecordCount": page,
            "f": "geojson",
        })
        data = http_json("%s?%s" % (CARRERER, qs))
        fs = data.get("features") or []
        if not fs:
            break
        feats.extend(fs)
        print("  trams baixats: %d" % len(feats))
        if len(fs) < page:
            break
        offset += page
    json.dump(feats, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
    return feats


# --------------------------------------------------------------------------
# 2) Construcció del graf (nodes = extrems de tram)
# --------------------------------------------------------------------------
def node_key(pt):
    return (round(pt[0], SNAP_DEC), round(pt[1], SNAP_DEC))


def build_graph(trams):
    # Es nodeja per CADA vèrtex (no només els extrems): així les cruïlles en T
    # queden connectades encara que el tram no estigui partit al punt de creuament.
    adj, coord = {}, {}
    def add(pt):
        k = node_key(pt)
        if k not in adj:
            adj[k] = []
            coord[k] = pt
        return k
    nedge = 0
    for f in trams:
        if (f.get("properties") or {}).get("TIPUSVIA") in EXCLOU:
            continue
        g = f.get("geometry") or {}
        gt, co = g.get("type"), g.get("coordinates")
        if not co:
            continue
        parts = [co] if gt == "LineString" else (co if gt == "MultiLineString" else [])
        for part in parts:
            if len(part) < 2:
                continue
            prev = add(part[0])
            for i in range(1, len(part)):
                cur = add(part[i])
                if cur != prev:
                    w = hav(part[i - 1], part[i])
                    if w > 0:
                        adj[prev].append((cur, w))
                        adj[cur].append((prev, w))
                        nedge += 1
                prev = cur
    return adj, coord, nedge


# --------------------------------------------------------------------------
# 3) Índex espacial de nodes + cerca del més proper (rings de cel·les)
# --------------------------------------------------------------------------
def build_index(coord):
    idx = {}
    for k, pt in coord.items():
        idx.setdefault((int(pt[0] / CELL), int(pt[1] / CELL)), []).append(k)
    return idx


def nearest(pt, coord, idx):
    cx, cy = int(pt[0] / CELL), int(pt[1] / CELL)
    best, bestd, found = None, float("inf"), None
    for ring in range(0, 14):
        for gx in range(cx - ring, cx + ring + 1):
            for gy in range(cy - ring, cy + ring + 1):
                if max(abs(gx - cx), abs(gy - cy)) != ring:
                    continue                       # només el perímetre del ring
                for k in idx.get((gx, gy), ()):
                    d = hav(pt, coord[k])
                    if d < bestd:
                        bestd, best = d, k
        if best is not None:
            if found is None:
                found = ring
            elif ring >= found + 1:                 # un ring de marge i para
                break
    return best, bestd


# --------------------------------------------------------------------------
# 4) Dijkstra multi-origen (des de tots els refugis alhora)
# --------------------------------------------------------------------------
def dijkstra_multi(adj, sources):
    dist = dict(sources)
    pq = [(d, k) for k, d in sources.items()]
    heapq.heapify(pq)
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, float("inf")):
            continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist


# --------------------------------------------------------------------------
# Geometria: centroide (àrea) del polígon d'una secció
# --------------------------------------------------------------------------
def ring_centroid(ring):
    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        cr = x0 * y1 - x1 * y0
        a += cr
        cx += (x0 + x1) * cr
        cy += (y0 + y1) * cr
    if a == 0:
        n = len(ring)
        return [sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n]
    a *= 0.5
    return [cx / (6 * a), cy / (6 * a)]


def centroid(geom):
    gt, co = geom["type"], geom["coordinates"]
    polys = [co] if gt == "Polygon" else co         # MultiPolygon -> [poly, ...]
    best, besta = None, -1.0
    for poly in polys:
        ext = poly[0]
        a = abs(sum(ext[i][0] * ext[i + 1][1] - ext[i + 1][0] * ext[i][1]
                    for i in range(len(ext) - 1)))
        if a > besta:
            besta, best = a, ring_centroid(ext)
    return best


# --------------------------------------------------------------------------
def main():
    print("Baixant el carrerer de l'IDE AMB...")
    trams = fetch_carrerer()
    print("  total trams: %d" % len(trams))

    print("Construint el graf (excloent %s)..." % ", ".join(sorted(EXCLOU)))
    adj, coord, nseg = build_graph(trams)
    print("  nodes: %d | arestes: %d" % (len(coord), nseg))
    idx = build_index(coord)

    print("Enganxant els refugis a la xarxa...")
    refs = json.load(open(REFUGIS, encoding="utf-8"))["features"]
    sources = {}
    for f in refs_iter(refs):
        k, snap = nearest(f, coord, idx)
        if k is not None and snap < sources.get(k, float("inf")):
            sources[k] = snap
    print("  refugis: %d | nodes d'origen: %d" % (len(refs), len(sources)))

    print("Dijkstra multi-origen...")
    dist = dijkstra_multi(adj, sources)

    print("Assignant distància a cada polígon (en ordre de feature)...")
    ivac = json.load(open(IVAC_IN, encoding="utf-8"))["features"]
    out = []                                       # una distància per polígon, EN ORDRE
    for f in ivac:
        geom = f.get("geometry")
        if not geom:
            out.append(None)
            continue
        c = centroid(geom)
        k, snap = nearest(c, coord, idx)
        dm = dist.get(k, float("inf")) + snap if k is not None else float("inf")
        out.append(None if math.isinf(dm) else round(dm))

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, separators=(",", ":"))

    vals = sorted(v for v in out if v is not None)
    sense = sum(1 for v in out if v is None)
    if vals:
        n = len(vals)
        t1, t2 = vals[n // 3], vals[2 * n // 3]
        print("Fet: %d polígons (%d amb distància, %d sense xarxa)."
              % (len(out), len(vals), sense))
        print("  distància (m): min=%d  tercils=%d/%d  màx=%d"
              % (vals[0], t1, t2, vals[-1]))
    print("Escrit %s (array indexat per ordre de feature)" % OUT)


def refs_iter(refs):
    """Coordenades [lon, lat] de cada refugi."""
    pts = []
    for f in refs:
        c = (f.get("geometry") or {}).get("coordinates")
        if c and len(c) >= 2:
            pts.append([c[0], c[1]])
    return pts


if __name__ == "__main__":
    main()
