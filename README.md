# Visor IVAC — Àrea Metropolitana de Barcelona

Visor de mapes web que relaciona tres dimensions de la calor a l'Àrea Metropolitana
de Barcelona: l'**exposició física** (temperatura actual i projectada), la
**vulnerabilitat social** de la població davant la calor (**Índex de Vulnerabilitat
al Canvi Climàtic, IVAC**) i la **resposta pública** (**xarxa de refugis climàtics**).

L'exposició a la calor no es reparteix de manera homogènia pel territori (densitat,
morfologia urbana i dèficit de verd hi configuren l'efecte illa de calor). L'IVAC
mesura, de 0 a 100 per secció censal, la sensibilitat social i la capacitat
d'adaptació de la ciutadania. I els refugis climàtics —equipaments i espais públics
de confort tèrmic— permeten veure si l'oferta arriba a les zones més vulnerables.

## Funcionalitats

- **IVAC**: coropleta contínua (0–100) de les zones urbanes (seccions censals), amb
  **popup** de l'índex total i les 4 dimensions que l'integren.
- **Capes de temperatura** (excloents, triables amb un desplegable):
  - **Temperatura mitjana anual (1981–2010)** — capa ràster.
  - **Increment projectat 2011–2040 (RCP4.5)** — coropleta de l'increment (Δ°C)
    retallada a la forma exacta de l'AMB amb un `clipPath`.
  - **Valor en clicar**: el ràster consulta el píxel al servei (`identify`); la
    projecció mostra el valor de la cel·la sota el punter.
  - En activar una capa tèrmica, l'IVAC s'atenua automàticament per comparar-les.
- **Refugis climàtics** de tota l'AMB **agrupats en clústers**, amb popup (nom,
  adreça, tipologia i, per als de Barcelona, horari i contacte).
- **Màscara spotlight** fixa que enfosqueix l'exterior de l'AMB.
- **Navegació per municipi**, control de **capes d'informació** i diversos **mapes base**.
- **Llegendes** i controls de **transparència** independents per capa.
- Disseny **responsiu** (adaptat a mòbil) i enquadrament inicial que evita el solapament
  amb el panell lateral.

## Dades

- **IVAC** (zones urbanes): índex de vulnerabilitat 0–100 i les seves 4 components.
- **Refugis climàtics** (≈868): ~547 del municipi de Barcelona i 321 de la resta de
  l'AMB. Es regeneren **automàticament cada mes** des de les fonts en viu
  (vegeu [`AUTOMATITZACIO.md`](AUTOMATITZACIO.md)).
- **Temperatura**: mitjana anual 1981–2010 i increment projectat 2011–2040 (escenari
  RCP4.5), de l'IDE de l'AMB.
- **Límits municipals**: els 36 municipis de l'AMB.
- Coordenades en EPSG:4326 (WGS84).

## Fonts

- **Índex de Vulnerabilitat al Canvi Climàtic (2022)**, **Xarxa metropolitana de
  refugis climàtics (2025)** i **dades de temperatura i escenaris climàtics** —
  Infraestructura de Dades Espacials de l'Àrea Metropolitana de Barcelona (AMB).
  Reutilització segons la Llei 37/2007.
- **Xarxa de refugis climàtics a la ciutat de Barcelona (2026)** —
  [Open Data BCN](https://opendata-ajuntament.barcelona.cat/)
  ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).

L'estudi metodològic de l'IVAC ("La calor en un futur…", set. 2022) combina dades
sociodemogràfiques (~2017) i projeccions climàtiques (SMC, 2018); "2022" fa referència a
l'any de l'estudi, no necessàriament a l'any de totes les dades base.

## Actualització automàtica de dades

La capa de refugis es regenera sola cada mes, sense descàrregues manuals:

- **`build_refugis.py`** — fusiona Open Data BCN (Barcelona, amb horaris) i el servei
  Esri REST de l'IDE AMB (resta de l'AMB) i escriu `refugis_climatics.geojson`.
- **`.github/workflows/actualitza-refugis.yml`** — l'executa mensualment i fa commit
  si hi ha canvis; GitHub Pages es redesplega tot sol.

Detalls a [`AUTOMATITZACIO.md`](AUTOMATITZACIO.md).

## Tecnologia

Desenvolupat amb HTML, CSS i JavaScript sobre [Leaflet](https://leafletjs.com/), amb
[Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) per als
refugis. La capa de temperatura ràster es pinta amb l'operació `export` d'un MapServer
d'ArcGIS; la projecció d'increment és un GeoJSON retallat a l'AMB mitjançant un
`clipPath` SVG. El pipeline de dades usa Python (biblioteca estàndard) i GitHub Actions.
