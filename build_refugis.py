#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera refugis_climatics.geojson per al visor IVAC (AMB).

Fusiona dues fonts en viu, sense cap descàrrega manual:

  1. Barcelona ...... Open Data BCN (dataset "xarxa-refugis-climatics"),
                      recurs JSON. Inclou horaris, adreça, web i email.
  2. Resta de l'AMB . IDE AMB, servei Esri REST MapServer (capa 7),
                      filtrant NOMMUNI NOT LIKE 'Barcelona'.

Sortida: GeoJSON EPSG:4326 amb l'esquema que consumeix app.js:
  nom, municipi, tipologia, adreca, barri, districte, horari[], web, email, font

Només fa servir la biblioteca estàndard de Python (cap dependència externa),
de manera que s'executa tal qual als runners de GitHub Actions.
"""

import argparse
import html as htmllib
import json
import os
import re
import urllib.parse
import urllib.request

# --------------------------------------------------------------------------
# Fonts
# --------------------------------------------------------------------------
BCN_URL = ("https://opendata-ajuntament.barcelona.cat/data/dataset/"
           "8f9da263-ff41-4765-ab0d-61b97d7a00b2/resource/"
           "d88129fe-7aaa-4ae6-b9fd-908ad3f7480d/download")

AMB_QUERY = ("https://ide.amb.cat/geoserveis/rest/services/"
             "refugis_climatics/MapServer/7/query")
AMB_WHERE = "NOMMUNI NOT LIKE 'Barcelona'"

UA = {"User-Agent": "visor-ivac-refugis/1.0 (+github actions)"}


def http_json(url, timeout=120):
    """Descarrega i descodifica JSON forçant UTF-8 (evita mojibake)."""
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


# --------------------------------------------------------------------------
# Neteja de text i parser d'horaris (taula "timetable" de BCN)
# --------------------------------------------------------------------------
def clean_html(s):
    if not s:
        return ""
    s = re.sub(r"(?i)<br\s*/?>", " ", s)
    s = re.sub(r"(?i)</p>", " ", s)
    s = re.sub(r"(?i)</div>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = htmllib.unescape(s)          # &nbsp; &amp; ...
    s = re.sub(r"\s+", " ", s)       # \s cobreix també el NBSP (U+00A0)
    return s.strip()


def parse_timetable(html_str):
    """
    Converteix la taula HTML d'horaris en una llista d'entrades
    {periode, dia, hores}. Les cel·les 'timetable-period' amb rowspan
    marquen la temporada i s'apliquen a les files següents fins que
    n'apareix una de nova.
    """
    out = []
    if not html_str:
        return out
    periode = ""
    for row in re.split(r"(?i)<tr", html_str):
        if re.search(r"(?i)timetable-header", row):
            continue
        mp = re.search(r'(?is)<td class="timetable-period[^"]*"[^>]*>(.*?)</td>', row)
        if mp:
            periode = clean_html(mp.group(1))
        md = re.search(r'(?is)<td class="timetable-day"[^>]*>(.*?)</td>', row)
        mh = re.search(r'(?is)<td class="timetable-hour"[^>]*>(.*?)</td>', row)
        dia = clean_html(md.group(1)) if md else ""
        hores = clean_html(mh.group(1)) if mh else ""
        if dia or hores:
            out.append({"periode": periode, "dia": dia, "hores": hores})
    return out


def feature(props, lon, lat):
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
    }


# --------------------------------------------------------------------------
# 1) Barcelona — Open Data BCN
# --------------------------------------------------------------------------
def build_bcn():
    data = http_json(BCN_URL)
    feats = []
    for rec in data:
        ll = rec.get("geo_epgs_4326_latlon")
        if not ll or ll.get("lat") is None:
            continue

        addrs = rec.get("addresses") or []
        addr = next((a for a in addrs if a.get("main_address")), None)
        if addr is None and addrs:
            addr = addrs[0]

        adreca = barri = districte = ""
        if addr:
            via = addr.get("address_name") or ""
            num = addr.get("street_number_1")
            if not num and addr.get("start_street_number"):
                num = addr.get("start_street_number")
            num = "" if num is None else str(num).strip()
            adreca = f"{via}, {num}" if num else via
            barri = addr.get("neighborhood_name") or ""
            districte = addr.get("district_name") or ""

        vals = rec.get("values") or []
        w = next((v for v in vals if v.get("attribute_name") == "Web"), None)
        web = str(w.get("url_value") or w.get("value") or "") if w else ""
        m = next((v for v in vals if v.get("attribute_name") == "E-mail"), None)
        email = str(m.get("email_value") or m.get("value") or "") if m else ""

        tt = rec.get("timetable") or {}
        props = {
            "nom": rec.get("name") or "",
            "municipi": "Barcelona",
            "tipologia": "",
            "adreca": adreca,
            "barri": barri,
            "districte": districte,
            "horari": parse_timetable(tt.get("html")),
            "web": web,
            "email": email,
            "font": "Open Data BCN",
        }
        feats.append(feature(props, ll["lon"], ll["lat"]))
    return feats


# --------------------------------------------------------------------------
# 2) Resta de l'AMB — IDE AMB (Esri REST MapServer)
# --------------------------------------------------------------------------
def build_amb():
    feats = []
    offset, page = 0, 1000
    while True:
        qs = urllib.parse.urlencode({
            "where": AMB_WHERE,
            "outFields": "NOMMUNI,NOM_EQUIP,TIPOLOGIA,ADRECA",
            "outSR": "4326",
            "returnGeometry": "true",
            "resultOffset": offset,
            "resultRecordCount": page,
            "f": "json",
        })
        resp = http_json(f"{AMB_QUERY}?{qs}")
        rows = resp.get("features") or []
        if not rows:
            break
        for f in rows:
            a = f.get("attributes", {})
            g = f.get("geometry", {})
            if g.get("x") is None or g.get("y") is None:
                continue
            props = {
                "nom": a.get("NOM_EQUIP") or "",
                "municipi": a.get("NOMMUNI") or "",
                "tipologia": a.get("TIPOLOGIA") or "",
                "adreca": a.get("ADRECA") or "",
                "barri": "",
                "districte": "",
                "horari": [],
                "web": "",
                "email": "",
                "font": "AMB - XMRC",
            }
            feats.append(feature(props, g["x"], g["y"]))
        if not resp.get("exceededTransferLimit"):
            break
        offset += page
    return feats


# --------------------------------------------------------------------------
def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="Genera refugis_climatics.geojson")
    ap.add_argument("-o", "--out",
                    default=os.path.join(here, "refugis_climatics.geojson"),
                    help="Ruta del fitxer GeoJSON de sortida")
    args = ap.parse_args()

    print("Baixant Open Data BCN...")
    bcn = build_bcn()
    print(f"  BCN: {len(bcn)} refugis")

    print("Consultant IDE AMB...")
    amb = build_amb()
    print(f"  AMB: {len(amb)} refugis")

    fc = {"type": "FeatureCollection", "features": bcn + amb}
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(fc, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"Escrit {args.out} ({len(fc['features'])} features)")


if __name__ == "__main__":
    main()
