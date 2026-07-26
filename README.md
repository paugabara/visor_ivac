# Visor IVAC — Àrea Metropolitana de Barcelona

Visor de mapes web que mostra l'**Índex de Vulnerabilitat al Canvi Climàtic (IVAC)**
de les zones urbanes (seccions censals) de l'Àrea Metropolitana de Barcelona.

L'IVAC mesura la vulnerabilitat social de cada zona urbana davant els episodis i les
onades de calor, cada cop més freqüents i intenses a causa del canvi climàtic, en una
escala de 0 a 100 (com més alt, més vulnerable).

## Funcionalitats

- Mapa de **coropletes contínues** (0–100) de les 18.079 zones urbanes.
- **Popup** per zona amb l'índex total i les 4 dimensions que l'integren, identificada
  per codi de secció censal.
- **Navegació per municipi**, control de capes i diversos **mapes base**.
- **Llegenda** i control de **transparència** de la capa.
- Disseny **responsiu** (adaptat a mòbil).

## Dades i font

- **IVAC** (zones urbanes): índex de vulnerabilitat 0–100 i les seves 4 components.
- **Límits municipals**: els 36 municipis de l'AMB.
- Coordenades en EPSG:4326 (WGS84).

**Font:** Infraestructura de Dades Espacials de l'Àrea Metropolitana de Barcelona
(AMB), 2022. L'estudi metodològic ("La calor en un futur…", IVAC, set. 2022) combina
dades sociodemogràfiques (~2017) i projeccions climàtiques (SMC, 2018); "2022" fa
referència a l'any de l'estudi, no necessàriament a l'any de totes les dades base.

## Tecnologia

Desenvolupat amb HTML, CSS i JavaScript sobre la biblioteca [Leaflet](https://leafletjs.com/).
