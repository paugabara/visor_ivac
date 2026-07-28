# Visor IVAC — Àrea Metropolitana de Barcelona

Visor de mapes web que mostra l'**Índex de Vulnerabilitat al Canvi Climàtic (IVAC)**
de les zones urbanes (seccions censals) de l'Àrea Metropolitana de Barcelona, juntament
amb la **xarxa de refugis climàtics** com a part de la resposta a aquesta vulnerabilitat.

L'IVAC mesura la vulnerabilitat social de cada zona urbana davant els episodis i les
onades de calor, cada cop més freqüents i intenses a causa del canvi climàtic, en una
escala de 0 a 100 (com més alt, més vulnerable). Els refugis climàtics són equipaments i
espais públics on la població pot protegir-se de la calor; superposar-los a l'índex
permet veure si les zones més vulnerables tenen refugis a prop —i on en falten.

## Funcionalitats

- Mapa de **coropletes contínues** (0–100) de les 18.079 zones urbanes.
- **Popup** per zona amb l'índex total i les 4 dimensions que l'integren, identificada
  per codi de secció censal.
- Capa de **refugis climàtics** de tota l'AMB (863 punts) **agrupats en clústers**, amb
  popup (nom, adreça, tipologia i, per als de Barcelona, horari i contacte).
- **Màscara** que enfosqueix l'exterior de l'AMB per centrar l'atenció a l'àrea d'estudi.
- **Navegació per municipi**, control de **capes** i diversos **mapes base**.
- **Llegenda** i control de **transparència** de la capa IVAC.
- Disseny **responsiu** (adaptat a mòbil).

## Dades

- **IVAC** (zones urbanes): índex de vulnerabilitat 0–100 i les seves 4 components.
- **Refugis climàtics** (863): 542 del municipi de Barcelona i 321 de la resta de l'AMB.
- **Límits municipals**: els 36 municipis de l'AMB.
- Coordenades en EPSG:4326 (WGS84).

## Fonts

- **Índex de Vulnerabilitat al Canvi Climàtic (2022)** i **Xarxa metropolitana de refugis
  climàtics (2025)** — Infraestructura de Dades Espacials de l'Àrea Metropolitana de
  Barcelona (AMB). Reutilització segons la Llei 37/2007.
- **Xarxa de refugis climàtics a la ciutat de Barcelona (2026)** —
  [Open Data BCN](https://opendata-ajuntament.barcelona.cat/)
  ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).

L'estudi metodològic de l'IVAC ("La calor en un futur…", set. 2022) combina dades
sociodemogràfiques (~2017) i projeccions climàtiques (SMC, 2018); "2022" fa referència a
l'any de l'estudi, no necessàriament a l'any de totes les dades base.

## Tecnologia

Desenvolupat amb HTML, CSS i JavaScript sobre la biblioteca
[Leaflet](https://leafletjs.com/), amb
[Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) per a
l'agrupació dels refugis.
