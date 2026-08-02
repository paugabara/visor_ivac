# Actualització automàtica dels refugis climàtics

La capa de refugis climàtics del visor es regenera sola, sense cap descàrrega
ni consulta manual, a partir de les dues fonts oficials en viu.

## Com funciona

- **`build_refugis.py`** — script (només biblioteca estàndard de Python) que:
  1. baixa el JSON d'**Open Data BCN** (dataset `xarxa-refugis-climatics`) i el
     converteix a l'esquema del visor, incloent-hi els horaris estructurats;
  2. consulta el servei **Esri REST de l'IDE AMB**
     (`refugis_climatics/MapServer`, capa 7) amb el filtre
     `NOMMUNI NOT LIKE 'Barcelona'` per obtenir la resta de l'AMB;
  3. fusiona tot i escriu `refugis_climatics.geojson` en UTF-8 net.

- **`.github/workflows/actualitza-refugis.yml`** — executa l'script el **dia 1
  de cada mes** (i també quan el llancis a mà). Si el GeoJSON ha canviat, fa
  commit automàticament; GitHub Pages redesplega el visor tot sol.

## Fonts

| Capa | Font | Endpoint |
|------|------|----------|
| Barcelona | Open Data BCN | `.../resource/d88129fe-7aaa-4ae6-b9fd-908ad3f7480d/download` |
| Resta AMB | IDE AMB (Esri REST) | `https://ide.amb.cat/geoserveis/rest/services/refugis_climatics/MapServer/7/query` |

## Posada en marxa (una sola vegada)

1. Copia al repositori `visor_ivac` els fitxers:
   - `build_refugis.py` (a l'arrel, al costat de `app.js`)
   - `.github/workflows/actualitza-refugis.yml`
2. Puja el `refugis_climatics.geojson` ja regenerat (net i actualitzat).
3. A GitHub: **Settings → Actions → General → Workflow permissions** →
   activa **"Read and write permissions"** (perquè el bot pugui fer commit).
4. Prova-ho: pestanya **Actions → "Actualitza refugis climàtics" → Run workflow**.

## Execució manual local (opcional)

Amb Python 3 instal·lat:

```bash
python build_refugis.py
```

Genera/actualitza `refugis_climatics.geojson` a la mateixa carpeta.

## Notes

- L'`IVAC.geojson` **no** s'inclou en aquesta automatització: és un estudi tancat
  de 2022 que no s'actualitza.
- La cadència és mensual perquè les fonts es refresquen amb poca freqüència;
  es pot canviar editant la línia `cron` del workflow.
- Els refugis de la resta de l'AMB no porten horari a la font (l'IDE AMB no en
  publica); per això només els de Barcelona mostren horari al popup.
