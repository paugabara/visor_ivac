/* =========================================================
   Visor IVAC — Àrea Metropolitana de Barcelona
   Índex de Vulnerabilitat al Canvi Climàtic
   ========================================================= */

/* ---------- 1. Mapa base ---------- */
// preferCanvas: renderitza en <canvas> en lloc de SVG.
// Imprescindible pel rendiment amb ~17.000 polígons.
const map = L.map("map", {
  preferCanvas: true,
  center: [41.40, 2.05],   // AMB (àrea de Barcelona)
  zoom: 11
});

// El zoom va a dalt a la dreta (a l'esquerra hi ha el botó de la barra lateral)
map.zoomControl.setPosition("topright");

// Capes base
const positron = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19
  }
).addTo(map);   // CartoDB Positron per defecte

const darkMatter = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19
  }
);

const satellit = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: 'Imatgeria &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
    maxZoom: 19
  }
);

// MapTiler requereix una clau d'API gratuïta.
// IMPORTANT abans de publicar a GitHub: restringeix aquesta clau al teu domini
// des del compte de MapTiler (Account → Keys → Allowed origins), p. ex.
// "https://elteuusuari.github.io/*", perquè ningú altre la pugui reutilitzar.
const MAPTILER_KEY = "wraSA2T2xi8px2KcocPM";
// Estil del mapa (pots canviar-lo per: basic-v2, bright-v2, topo-v2, streets-v2, outdoor-v2...)
const MAPTILER_ESTIL = "dataviz";

const maptiler = L.tileLayer(
  `https://api.maptiler.com/maps/${MAPTILER_ESTIL}/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
  {
    attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    maxZoom: 20,
    tileSize: 512,
    zoomOffset: -1,
    crossOrigin: true
  }
);

/* ---------- 1 bis. Capa de temperatura (IDE AMB) ---------- */
// Ràster de temperatura mitjana anual 1981–2010 del servei
// "escenaris_canvi_climatic_2025" (MapServer dinàmic d'ArcGIS). No té cache de
// tessel·les ni WMS operatiu, però sí l'operació "export": demanem a cada
// tessel·la la seva imatge amb el bbox corresponent en EPSG:3857.
const TEMP_BASE = "https://ide.amb.cat/geoserveis/rest/services/escenaris_canvi_climatic_2025/MapServer";
const TEMP_EXPORT = TEMP_BASE + "/export";

// Pane propi: per sobre del mapa base (tilePane, z-index 200) i per sota de les
// dades vectorials (overlayPane, z-index 400), i immune als canvis de mapa base.
map.createPane("tempPane");
map.getPane("tempPane").style.zIndex = 250;
map.getPane("tempPane").style.pointerEvents = "none";

// Pane per a la capa d'increment projectat: per sobre del mapa base i la
// temperatura, però per SOTA de l'overlayPane (canvas de l'IVAC) perquè l'IVAC
// quedi per damunt. Com que la projecció queda sota el canvas, no rep els clics
// directament: el valor es consulta amb el gestor de clic del mapa (identifyIncrement).
map.createPane("projPane");
map.getPane("projPane").style.zIndex = 260;

const ExportTileLayer = L.TileLayer.extend({
  getTileUrl: function (coords) {
    const size = this.getTileSize();
    const nwPx = coords.scaleBy(size);
    const sePx = nwPx.add(size);
    const nw = L.CRS.EPSG3857.project(this._map.unproject(nwPx, coords.z));
    const se = L.CRS.EPSG3857.project(this._map.unproject(sePx, coords.z));
    const bbox = [nw.x, se.y, se.x, nw.y].join(",");
    return `${TEMP_EXPORT}?bbox=${bbox}&bboxSR=3857&imageSR=3857` +
           `&size=256,256&format=png32&transparent=true&layers=show:0&f=image`;
  }
});

const capaTemp = new ExportTileLayer("", {
  pane: "tempPane",
  opacity: 0.7,
  attribution: 'Temperatura &copy; <a href="https://www.amb.cat/">AMB</a> (IDEAMB)'
});

/* ---------- 1 ter. Capa d'increment projectat 2011–2040 (IDE AMB) ---------- */
// Coropleta de l'increment (Δ°C) de temperatura mitjana anual projectat per a
// 2011–2040, escenari RCP4.5, respecte al període de referència. Font:
// servei "canvi_climatic" (camp T_E45A1140TM), pre-processat a un GeoJSON
// estàtic (dades fixes). Rampa DIFERENT de l'absoluta perquè no es confonguin:
// salmó clar (poc escalfament) → granat (molt escalfament).
// Rampa CONTÍNUA violeta (lila clar → violeta fosc): gradual, amb bon recorregut
// de luminància per llegir el diferencial, i deliberadament diferent de l'IVAC
// (spectral) i de la temperatura absoluta (groc→vermell).
const RAMPA_INCR = [
  { p: 1.0, c: [242, 230, 247] },  // #f2e6f7
  { p: 1.4, c: [208, 169, 224] },  // #d0a9e0
  { p: 1.8, c: [168, 96, 201] },   // #a860c9
  { p: 2.2, c: [125, 47, 174] },   // #7d2fae
  { p: 2.6, c: [74, 13, 120] }     // #4a0d78
];
function getColorIncr(v) {
  const val = Math.max(1.0, Math.min(2.6, Number(v)));
  for (let i = 1; i < RAMPA_INCR.length; i++) {
    if (val <= RAMPA_INCR[i].p) {
      const a = RAMPA_INCR[i - 1], b = RAMPA_INCR[i];
      const t = (val - a.p) / (b.p - a.p);
      const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * t);
      const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * t);
      const bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * t);
      return `rgb(${r},${g},${bl})`;
    }
  }
  return "rgb(74,13,120)";
}

let opacitatIncr = 0.8;
function estilIncrement(feature) {
  return { fillColor: getColorIncr(feature.properties.incr), fillOpacity: opacitatIncr, weight: 0 };
}
function popupIncrementHtml(inc) {
  const v = Number(inc);
  return `<div class="popup-ivac">
       <span class="popup-overline">Projecció climàtica · 2011–2040 (RCP4.5)</span>
       <div class="popup-ivac-total" style="border-bottom:none;margin-bottom:0;padding-bottom:0">
         <div class="comp-head">
           <span class="comp-name">Increment de temperatura mitjana anual</span>
           <span class="comp-val comp-val-total">+${v.toFixed(1)} °C</span>
         </div>
       </div>
     </div>`;
}
function onEachIncrement(feature, layer) {
  layer.bindPopup(popupIncrementHtml(feature.properties.incr), { maxWidth: 280 });
}

// Punt dins d'anell (ray casting), coords [lng,lat]
function dinsAnell(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
// Com que la capa d'increment queda sota el canvas de l'IVAC i no rep els clics,
// busquem la cel·la sota el punt i n'obrim el popup des del gestor de clic del mapa.
function identifyIncrement(latlng) {
  if (!capaIncrement) return;
  let val = null;
  capaIncrement.eachLayer((layer) => {
    if (val !== null || !layer.getBounds().contains(latlng)) return;
    if (dinsAnell(latlng.lng, latlng.lat, layer.feature.geometry.coordinates[0])) {
      val = layer.feature.properties.incr;
    }
  });
  if (val !== null) {
    L.popup({ maxWidth: 280 }).setLatLng(latlng).setContent(popupIncrementHtml(val)).openOn(map);
  }
}

// Renderer SVG propi per a la projecció (a diferència del canvas, permet
// retallar-la amb un clipPath a la forma exacta de l'AMB).
const projRenderer = L.svg({ pane: "projPane" });
const SVGNS = "http://www.w3.org/2000/svg";
let capaAMBclip = null;

// Retall (clipPath) amb la forma EXACTA dels municipis de l'AMB. La forma és un
// polígon invisible dibuixat pel mateix renderer SVG; així Leaflet la manté
// sincronitzada en fer zoom/pan i el clipPath (via <use>) la segueix sol.
function aplicaRetallAMB() {
  const svg = projRenderer._container;
  if (!dadesAMB || !svg) return;
  if (!capaAMBclip) {
    const polys = [];
    dadesAMB.features.forEach((f) => {
      const g = f.geometry;
      const ps = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
      ps.forEach((poly) => polys.push([poly[0].map(([lng, lat]) => [lat, lng])]));
    });
    capaAMBclip = L.polygon(polys, {
      renderer: projRenderer, stroke: false, fill: true, fillOpacity: 0, interactive: false
    }).addTo(map);
  }
  if (!svg.querySelector("#amb-clip")) {
    let defs = svg.querySelector("defs");
    if (!defs) { defs = document.createElementNS(SVGNS, "defs"); svg.insertBefore(defs, svg.firstChild); }
    capaAMBclip._path.id = "amb-clip-src";
    const clip = document.createElementNS(SVGNS, "clipPath");
    clip.setAttribute("id", "amb-clip");
    clip.setAttribute("clipPathUnits", "userSpaceOnUse");
    const use = document.createElementNS(SVGNS, "use");
    use.setAttribute("href", "#amb-clip-src");
    use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#amb-clip-src");
    clip.appendChild(use);
    defs.appendChild(clip);
  }
  projRenderer._rootGroup.setAttribute("clip-path", "url(#amb-clip)");
}

// Càrrega mandrosa: només es baixa el GeoJSON el primer cop que s'activa.
let capaIncrement = null, incrementCarregant = false;
function activaIncrement() {
  if (capaIncrement) { capaIncrement.addTo(map); aplicaRetallAMB(); return; }
  if (incrementCarregant) return;
  incrementCarregant = true;
  fetch("temp_increment_2011_2040.geojson")
    .then((r) => r.json())
    .then((data) => {
      capaIncrement = L.geoJSON(data, {
        renderer: projRenderer,
        style: estilIncrement,
        onEachFeature: onEachIncrement
      });
      incrementCarregant = false;
      // Respecta la selecció actual (per si ha canviat mentre carregava)
      if (document.getElementById("sel-temp").value === "increment") {
        capaIncrement.addTo(map);
        aplicaRetallAMB();
      }
    })
    .catch((err) => { incrementCarregant = false; console.error("Error carregant la projecció 2011–2040:", err); });
}

/* ---------- 2. Simbologia IVAC (paleta Spectral) ---------- */
// Rampa Spectral CONTÍNUA: interpola el color segons el valor 0–100.
// Blau (0, poc vulnerable) → verd → groc → taronja → vermell (100, molt vulnerable).
// Els 5 colors d'ancoratge coincideixen amb el gradient de la llegenda.
const RAMPA = [
  { p: 0,   c: [43, 131, 186] },   // #2b83ba
  { p: 25,  c: [171, 221, 164] },  // #abdda4
  { p: 50,  c: [255, 255, 191] },  // #ffffbf
  { p: 75,  c: [253, 174, 97] },   // #fdae61
  { p: 100, c: [215, 25, 28] }     // #d7191c
];

function getColor(v) {
  const val = Math.max(0, Math.min(100, Number(v)));
  for (let i = 1; i < RAMPA.length; i++) {
    if (val <= RAMPA[i].p) {
      const a = RAMPA[i - 1], b = RAMPA[i];
      const t = (val - a.p) / (b.p - a.p);
      const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * t);
      const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * t);
      const bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * t);
      return `rgb(${r},${g},${bl})`;
    }
  }
  return "rgb(215,25,28)";
}

// Opacitat de reblert (controlable des de la barra lateral)
let opacitatIVAC = 0.75;

/* ---------- 2 bis. Mode bivariant: Vulnerabilitat (IVAC) × dèficit de resposta ----------
   Recolora la MATEIXA capa IVAC creuant dues variables en una escala 3×3:
   files = distància al refugi més proper (a prop → lluny), columnes = IVAC (baix → alt).
   El racó FOSC (inferior dret) marca les seccions alhora molt vulnerables i lluny de tot
   refugi: la resposta pública on més falta. Es calcula al client i es cacheja. */
const BIV_M = [
  ["#e8e8e8", "#b0d5df", "#64acbe"],  // a prop d'un refugi
  ["#e4acac", "#ad9ea5", "#627f8c"],  // distància mitjana
  ["#c85a5a", "#985356", "#574249"]   // lluny de tot refugi
];
let modeBivariant = false;   // el mode d'anàlisi és actiu?
let bivReady = false;        // ja s'ha calculat el color bivariant per secció?
let refugiPunts = [];        // [lat,lng] de tots els refugis, per a les distàncies

function estilIVAC(feature) {
  // En mode bivariant, el color surt de la matriu 3×3 (precalculat a _biv).
  if (modeBivariant) {
    const c = feature.properties._biv;
    return {
      fillColor: c || "#e8e8e8",
      fillOpacity: c ? opacitatIVAC : 0,   // seccions sense IVAC: transparents
      color: "#ffffff", weight: 0.15, opacity: 0.4
    };
  }
  return {
    fillColor: getColor(feature.properties.IVAC),
    fillOpacity: opacitatIVAC,
    color: "#ffffff",
    weight: 0.2,
    opacity: 0.5
  };
}

// Calcula la classe bivariant de cada secció (IVAC × distància al refugi més proper)
// i desa el color resultant a feature.properties._biv. Un sol cop: després es cacheja.
function calculaBivariant() {
  if (bivReady) return true;
  if (!capaIVAC || !refugiPunts.length) return false;
  const R = 6371000, rad = Math.PI / 180;
  function distMinim(lat, lng) {
    const cosLat = Math.cos(lat * rad);
    let best = Infinity;
    for (let i = 0; i < refugiPunts.length; i++) {
      const dLat = refugiPunts[i][0] - lat;
      const dLng = (refugiPunts[i][1] - lng) * cosLat;   // aprox. equirectangular
      const d = dLat * dLat + dLng * dLng;               // monotònic: n'hi ha prou per comparar
      if (d < best) best = d;
    }
    return Math.sqrt(best) * rad * R;                     // metres
  }
  const files = [], valsIVAC = [], valsDist = [];
  capaIVAC.eachLayer((ly) => {
    const v = Number(ly.feature.properties.IVAC);
    if (!isFinite(v)) { ly.feature.properties._biv = null; return; }
    const c = ly.getBounds().getCenter();
    const dm = distMinim(c.lat, c.lng);
    files.push([ly.feature, v, dm]);
    valsIVAC.push(v); valsDist.push(dm);
  });
  // Talls per tercils (33è i 66è percentil) de cada variable
  const terciles = (a) => {
    const s = a.slice().sort((x, y) => x - y);
    return [s[(s.length / 3) | 0], s[(2 * s.length / 3) | 0]];
  };
  const [i1, i2] = terciles(valsIVAC), [d1, d2] = terciles(valsDist);
  const classe = (x, a, b) => (x <= a ? 0 : (x <= b ? 1 : 2));
  files.forEach(([f, v, dm]) => {
    const ci = classe(v, i1, i2), cd = classe(dm, d1, d2);
    f.properties._biv = BIV_M[cd][ci];
    f.properties._bivDist = dm;   // metres al refugi més proper
    f.properties._bivCI = ci;     // classe de vulnerabilitat (0..2)
    f.properties._bivCD = cd;     // classe de distància (0..2)
  });
  bivReady = true;
  return true;
}

/* ---------- 3. Interacció per feature ---------- */
// Formata un valor numèric a 1 decimal (o "—" si no existeix)
function fmt(n) {
  return (n === null || n === undefined) ? "—" : Number(n).toFixed(1);
}

// Barra de gradient Spectral continu amb un marcador segons el valor 0–100.
// S'usa als 4 components (l'IVAC total s'interpreta amb la llegenda del mapa).
function barraGradient(val) {
  if (val === null || val === undefined) return "";
  const pct = Math.max(0, Math.min(100, Number(val)));
  return `<div class="comp-bar">
            <div class="comp-bar-marker" style="left:${pct}%"></div>
          </div>`;
}

// Les 4 components de l'ACP que integren l'IVAC (font: AMB, 2022).
// "curt" es mostra a la taula; "desc" apareix com a tooltip en passar el ratolí.
const COMPONENTS = [
  {
    key: "ACP_1",
    curt: "Densitat i manca d'espais verds",
    desc: "Component 1 (21,8% de la variància): zones densament poblades amb manca d'espais verds i baix potencial de producció fotovoltaica. Dimensions d'exposició i adaptació."
  },
  {
    key: "ACP_2",
    curt: "Vulnerabilitat socioeconòmica",
    desc: "Component 2 (17,7%): població amb renda baixa, menys estudis superiors, població estrangera i llars ateses pels serveis socials. Dimensió de sensibilitat social."
  },
  {
    key: "ACP_3",
    curt: "Dones grans en habitatge antic (1951–1980)",
    desc: "Component 3 (15,6%): dones grans en habitatges relativament antics (1951–1980) que passen més calor a l'estiu."
  },
  {
    key: "ACP_4",
    curt: "Gent gran sola en habitatge molt antic (≤1950)",
    desc: "Component 4 (14,2%): gent gran que viu sola en habitatges força antics (anteriors a 1950) i en estat deficient, que passen més calor a l'estiu."
  }
];

// Popup de la capa IVAC en mode "vulnerabilitat": índex global + 4 dimensions ACP.
function popupIvacHtml(feature) {
  const p = feature.properties;
  const files = COMPONENTS.map((c, i) => {
    const val = p[c.key];
    return `<div class="comp-row" title="${c.desc}">
              <div class="comp-head">
                <span class="comp-name"><span class="comp-num">${i + 1}</span> ${c.curt}</span>
                <span class="comp-val">${fmt(val)}</span>
              </div>
              ${barraGradient(val)}
            </div>`;
  }).join("");
  return `<div class="popup-ivac">
       <span class="popup-overline">Zona urbana · secció censal</span>
       <b>${p.NOMMUNI ?? "—"}</b>
       <span class="popup-ref">Secció censal: ${p.MUNDISSEC ?? "—"}</span>
       <div class="popup-ivac-total">
         <div class="comp-head">
           <span class="comp-name">Índex de Vulnerabilitat (IVAC)</span>
           <span class="comp-val comp-val-total">${fmt(p.IVAC)}</span>
         </div>
       </div>
       <div class="popup-ivac-comp">
         <span class="popup-ivac-titol">Valor per dimensió (0–100):</span>
         ${files}
         <span class="popup-ivac-nota">Passa el ratolí per sobre de cada dimensió per veure'n el detall.</span>
         <p class="popup-ivac-footnote"><b>Com llegir-ho:</b> cada factor va de 0 a 100 i indica com de vulnerable és aquesta zona en aquell aspecte comparada amb la resta (com més alt, més vulnerable). L'IVAC de dalt de tot és la valoració global de la zona: no és la suma ni la mitjana dels factors, sinó el resum de tots junts.</p>
       </div>
     </div>`;
}

// Popup en mode "bivariant": ensenya la MATRIU 3×3 de la llegenda amb la cel·la
// on se situa aquesta zona ressaltada, més el valor dels dos factors que la
// determinen (vulnerabilitat + distància al refugi més proper).
function popupBivariantHtml(feature) {
  const p = feature.properties;
  const iv = Number(p.IVAC);
  const dist = p._bivDist;
  const nivIVAC = ["baixa", "mitjana", "alta"][p._bivCI] || "—";
  const nivDist = ["a prop", "distància intermèdia", "lluny"][p._bivCD] || "—";
  const distTxt = (dist == null) ? "—"
    : (dist < 1000 ? Math.round(dist) + " m" : (dist / 1000).toFixed(1) + " km");
  const prioritat = (p._bivCI === 2 && p._bivCD === 2);
  // Matriu 3×3: fila de dalt = més lluny (cd 2), columna de la dreta = més
  // vulnerable (ci 2). Es ressalta la cel·la (cd, ci) d'aquesta secció.
  let grid = "";
  for (let domRow = 0; domRow < 3; domRow++) {
    const cd = 2 - domRow;
    for (let ci = 0; ci < 3; ci++) {
      const on = (cd === p._bivCD && ci === p._bivCI);
      grid += `<i style="background:${BIV_M[cd][ci]}"${on ? ' class="biv-cell-on"' : ''}></i>`;
    }
  }
  return `<div class="popup-ivac">
       <span class="popup-overline">Anàlisi combinada · secció censal</span>
       <b>${p.NOMMUNI ?? "—"}</b>
       <span class="popup-ref">Secció censal: ${p.MUNDISSEC ?? "—"}</span>
       <div class="popup-biv-matrix">
         <div class="biv-wrap">
           <span class="biv-axis-y">Més lluny d'un refugi →</span>
           <div class="biv-grid">${grid}</div>
         </div>
         <div class="biv-axis-x">Més vulnerable (IVAC) →</div>
       </div>
       <div class="popup-biv-rows">
         <div class="comp-head">
           <span class="comp-name">Vulnerabilitat (IVAC)</span>
           <span class="comp-val">${fmt(iv)} · ${nivIVAC}</span>
         </div>
         <div class="comp-head">
           <span class="comp-name">Distància al refugi més proper</span>
           <span class="comp-val">${distTxt} · ${nivDist}</span>
         </div>
       </div>
       ${prioritat ? `<p class="popup-biv-prio">→ Zona de prioritat: molt vulnerable i lluny de tot refugi.</p>` : ``}
       <p class="popup-ivac-footnote">La cel·la ressaltada marca on se situa aquesta zona dins l'escala 3×3.</p>
     </div>`;
}

function onEachIVAC(feature, layer) {
  // Popup dinàmic: s'avalua en obrir-se, de manera que sempre ensenya les dades
  // de la representació activa (vulnerabilitat o bivariant).
  layer.bindPopup(
    (lyr) => modeBivariant ? popupBivariantHtml(lyr.feature) : popupIvacHtml(lyr.feature),
    { maxWidth: 320 }
  );

  // Ressaltat en passar el ratolí per sobre (contorn fosc)
  layer.on({
    mouseover: function (e) {
      e.target.setStyle({ weight: 1.6, color: "#1a1a1a", opacity: 1 });
    },
    mouseout: function (e) {
      if (capaIVAC) capaIVAC.resetStyle(e.target);
    }
  });
}

/* ---------- 4. Estils dels límits municipals (adaptatius) ---------- */
// Sobre mapa clar → línia fosca; sobre mapa fosc → línia blanca puntejada
const estilAMBclar = { color: "#333333", weight: 1.3, fill: false, dashArray: "2 4" };
const estilAMBfosc = { color: "#ffffff", weight: 1.2, fill: false, dashArray: "2 4" };

/* ---------- 4 bis. Màscara "spotlight" fora de l'AMB (adaptativa) ---------- */
// Un únic polígon que cobreix tot el món amb "forats" amb la forma dels
// municipis de l'AMB: així només s'enfosqueix el que queda fora de l'àrea
// d'estudi (on tampoc hi ha dades IVAC), destacant la zona d'interès.
// Sobre mapa clar → vel blanquinós; sobre mapa fosc → vel fosc.
const estilMascaraClar = { stroke: false, fillColor: "#f4f1ec", fillOpacity: 0.55, interactive: false };
const estilMascaraFosc = { stroke: false, fillColor: "#0a0e14", fillOpacity: 0.55, interactive: false };

// Anell exterior gairebé global (lat, lng) que fa de "món" de la màscara.
const MON_EXTERIOR = [[-85, -179.9], [85, -179.9], [85, 179.9], [-85, 179.9]];

// Extreu els anells exteriors de tots els municipis com a forats de la màscara.
// Només l'anell exterior (índex 0) de cada polígon: els forats interns d'un
// municipi (si n'hi ha) han de quedar enfosquits, no retallats.
function foratsAMB(data) {
  const forats = [];
  data.features.forEach((f) => {
    const g = f.geometry;
    const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
    polys.forEach((poly) => {
      forats.push(poly[0].map(([lng, lat]) => [lat, lng]));
    });
  });
  return forats;
}

/* ---------- 5. Càrrega de dades ---------- */
let capaIVAC, capaAMB, capaMascara, capaRefugis;
let dadesAMB = null;   // geometria dels municipis, per retallar la projecció

// 5.1 Capa IVAC (zones urbanes)
fetch("IVAC.geojson")
  .then((r) => r.json())
  .then((data) => {
    capaIVAC = L.geoJSON(data, {
      style: estilIVAC,
      onEachFeature: onEachIVAC
    }).addTo(map);
    // Respecta l'estat inicial del selector de capes
    if (!document.getElementById("chk-ivac").checked) map.removeLayer(capaIVAC);
    if (capaAMB) capaAMB.bringToFront();
  })
  .catch((err) => console.error("Error carregant IVAC.geojson:", err));

// 5.2 Límits municipals AMB (només contorn)
fetch("AMB_municipis.geojson")
  .then((r) => r.json())
  .then((data) => {
    dadesAMB = data;   // desa la geometria per al retall de la projecció
    capaAMB = L.geoJSON(data, {
      style: estilAMBclar,       // el mapa base per defecte és clar → línia fosca
      interactive: false          // deixa passar els clics cap a la capa IVAC
    }).addTo(map);

    // Màscara "spotlight": món exterior + forats amb la forma de l'AMB.
    // IMPORTANT: renderitzador SVG propi (no el canvas compartit del mapa).
    // Amb preferCanvas:true tots els vectors comparteixen un sol <canvas>, i
    // aquest no pinta de manera fiable un únic polígon d'abast mundial durant
    // la càrrega inicial (només es dibuixa després de redimensionar el canvas).
    // Un renderitzador SVG dedicat el pinta correctament sempre i té cost nul
    // (només és un polígon).
    capaMascara = L.polygon(
      [MON_EXTERIOR, ...foratsAMB(data)],
      Object.assign({ renderer: L.svg() }, estilMascaraClar)
    ).addTo(map);
    // La màscara spotlight és fixa (sempre activa); no té control propi.

    capaAMB.bringToFront();
    if (!document.getElementById("chk-amb").checked) map.removeLayer(capaAMB);
    configurarNavegacio();
  })
  .catch((err) => console.error("Error carregant AMB_municipis.geojson:", err));

// 5.3 Refugis climàtics (Open Data BCN) — capa de punts agrupats
// Color índic, deliberadament fora de la rampa Spectral de l'IVAC perquè
// els punts no es confonguin amb els valors de vulnerabilitat.
const REFUGI_COLOR = "#4f46e5";
const estilRefugi = {
  radius: 5,
  fillColor: REFUGI_COLOR,
  color: "#ffffff",
  weight: 1.5,
  opacity: 1,
  fillOpacity: 0.9
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Renderitza l'horari estructurat: agrupa per període (temporada) i,
// dins de cada període, llista dia → hores amb pics.
function renderHorari(horari) {
  const arr = Array.isArray(horari) ? horari : (horari ? [horari] : []);
  if (!arr.length) return "";
  const grups = [];
  arr.forEach((e) => {
    const per = e.periode || "";
    let g = grups[grups.length - 1];
    if (!g || g.periode !== per) { g = { periode: per, files: [] }; grups.push(g); }
    g.files.push(e);
  });
  let out = `<div class="ref-block"><span class="ref-label">Horari</span>`;
  grups.forEach((g) => {
    if (g.periode) out += `<div class="ref-periode">${esc(g.periode)}</div>`;
    out += `<ul class="ref-hores">`;
    g.files.forEach((f) => {
      out += `<li>`;
      if (f.dia) out += `<span class="ref-dia">${esc(f.dia)}</span>`;
      if (f.hores) out += `<span class="ref-hora">${esc(f.hores)}</span>`;
      out += `</li>`;
    });
    out += `</ul>`;
  });
  return out + `</div>`;
}

function popupRefugi(p) {
  const zona = [p.barri, p.districte].filter(Boolean).map(esc).join(" · ");
  let html = `<div class="popup-refugi">
    <span class="popup-overline">Refugi climàtic · ${esc(p.municipi) || "AMB"}</span>
    <b>${esc(p.nom) || "—"}</b>`;
  if (p.tipologia) html += `<span class="ref-tip">${esc(p.tipologia)}</span>`;
  if (p.adreca) html += `<span class="ref-adr">${esc(p.adreca)}</span>`;
  if (zona) html += `<span class="ref-zona">${zona}</span>`;
  html += renderHorari(p.horari);
  if (p.web || p.email) {
    html += `<div class="ref-block">`;
    if (p.web) html += `<a class="ref-link" href="${esc(p.web)}" target="_blank" rel="noopener">Web del refugi ↗</a>`;
    if (p.email) html += `<a class="ref-link" href="mailto:${esc(p.email)}">${esc(p.email)}</a>`;
    html += `</div>`;
  }
  if (p.font) html += `<span class="ref-font">Font: ${esc(p.font)}</span>`;
  html += `</div>`;
  return html;
}

fetch("refugis_climatics.geojson")
  .then((r) => r.json())
  .then((data) => {
    capaRefugis = L.markerClusterGroup({
      showCoverageOnHover: false,   // no dibuixis el polígon d'abast en passar-hi
      maxClusterRadius: 55,
      chunkedLoading: true          // càrrega per lots (542 punts) sense bloquejar
    });
    L.geoJSON(data, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, estilRefugi),
      onEachFeature: (feature, layer) =>
        layer.bindPopup(popupRefugi(feature.properties), { maxWidth: 300 })
    }).addTo(capaRefugis);
    capaRefugis.addTo(map);
    if (!document.getElementById("chk-refugis").checked) map.removeLayer(capaRefugis);
    // Coordenades dels refugis [lat,lng] per al mode bivariant (distància a refugi)
    refugiPunts = data.features
      .map((f) => f.geometry && f.geometry.coordinates)
      .filter((c) => c && c.length >= 2)
      .map((c) => [c[1], c[0]]);
  })
  .catch((err) => console.error("Error carregant refugis_climatics.geojson:", err));

// Selector de municipi + botó per veure tota l'AMB
function configurarNavegacio() {
  const sel = document.getElementById("sel-municipi");
  const boundsMunicipi = {};
  capaAMB.eachLayer((lyr) => {
    const nom = lyr.feature.properties.NOMMUNI;
    if (nom) boundsMunicipi[nom] = lyr.getBounds();
  });
  Object.keys(boundsMunicipi)
    .sort((a, b) => a.localeCompare(b, "ca"))
    .forEach((nom) => {
      const opt = document.createElement("option");
      opt.value = nom;
      opt.textContent = nom;
      sel.appendChild(opt);
    });

  const boundsAMB = capaAMB.getBounds();

  // Enquadra tenint en compte l'amplada de la barra lateral (si està desplegada)
  function enquadra(bounds) {
    const plegat = document.getElementById("app").classList.contains("collapsed");
    map.fitBounds(bounds, {
      paddingTopLeft: [plegat ? 20 : 435, 20],
      paddingBottomRight: [25, 25]
    });
  }

  sel.addEventListener("change", function () {
    if (this.value && boundsMunicipi[this.value]) enquadra(boundsMunicipi[this.value]);
  });
  document.getElementById("btn-reset").addEventListener("click", function () {
    enquadra(boundsAMB);
    sel.value = "";
  });

  // Enquadrament inicial: desplaça l'AMB a la dreta perquè no quedi sota la barra
  enquadra(boundsAMB);
}

/* ---------- 6. Controls de la barra lateral ---------- */
// Mapes base indexats per clau (coincideix amb value dels radios)
const basemaps = { positron: positron, dataviz: maptiler, dark: darkMatter, esri: satellit };
const basesFosques = ["dark", "esri"];   // necessiten línia municipal blanca

function aplicaBasemap(clau) {
  const fosc = basesFosques.includes(clau);
  Object.values(basemaps).forEach((l) => map.removeLayer(l));
  basemaps[clau].addTo(map);
  if (capaAMB) capaAMB.setStyle(fosc ? estilAMBfosc : estilAMBclar);
  if (capaMascara) capaMascara.setStyle(fosc ? estilMascaraFosc : estilMascaraClar);
}

document.querySelectorAll('input[name="basemap"]').forEach((r) => {
  r.addEventListener("change", function () {
    if (this.checked) aplicaBasemap(this.value);
  });
});

// Interruptors de capes temàtiques
document.getElementById("chk-ivac").addEventListener("change", function () {
  if (capaIVAC) {
    if (this.checked) { capaIVAC.addTo(map); if (capaAMB) capaAMB.bringToFront(); }
    else map.removeLayer(capaIVAC);
  }
  actualitzaColorModeDisponible();
});
document.getElementById("chk-amb").addEventListener("change", function () {
  if (!capaAMB) return;
  if (this.checked) { capaAMB.addTo(map); capaAMB.bringToFront(); }
  else map.removeLayer(capaAMB);
});
document.getElementById("chk-refugis").addEventListener("change", function () {
  if (!capaRefugis) return;
  if (this.checked) capaRefugis.addTo(map);
  else map.removeLayer(capaRefugis);
});

// Coloració de la capa IVAC: "vuln" (rampa Spectral 0–100) o "biv" (bivariant
// × distància al refugi més proper). No és una capa a part, sinó una manera de
// pintar la mateixa capa; per això viu dins del grup de vulnerabilitat i en
// canvia alhora l'estil i el popup.
function aplicaColoracio(mode) {
  const biv = (mode === "biv");
  if (biv && !calculaBivariant()) {   // dades encara no llestes: torna a vulnerabilitat
    document.getElementById("col-vuln").checked = true;
    console.warn("Coloració bivariant: dades encara no carregades (IVAC o refugis).");
    return;
  }
  modeBivariant = biv;
  if (capaIVAC) capaIVAC.setStyle(estilIVAC);   // reaplica l'estil; resetStyle i el popup respecten el mode
  const uni = document.getElementById("legend-ivac-uni");
  const lg = document.getElementById("legend-biv");
  if (uni) uni.hidden = biv;
  if (lg) lg.hidden = !biv;
}
document.querySelectorAll('input[name="ivac-color"]').forEach((r) => {
  r.addEventListener("change", function () { if (this.checked) aplicaColoracio(this.value); });
});

// El selector de coloració només té sentit si la capa IVAC és visible.
function actualitzaColorModeDisponible() {
  const on = document.getElementById("chk-ivac").checked;
  const box = document.getElementById("ivac-colormode");
  if (box) box.classList.toggle("disabled", !on);
  document.querySelectorAll('input[name="ivac-color"]').forEach((r) => { r.disabled = !on; });
}
actualitzaColorModeDisponible();
// Recorda l'opacitat de l'IVAC abans d'abaixar-la automàticament amb la temperatura
let opacIVACabansTemp = null;

// Ajusta l'opacitat de l'IVAC i sincronitza el control lliscant de la llegenda
function posaOpacitatIVAC(val) {
  opacitatIVAC = val;
  if (capaIVAC) capaIVAC.setStyle({ fillOpacity: opacitatIVAC });
  const slider = document.getElementById("rang-opacitat");
  if (slider) slider.value = val;
}

// Selector de capa de temperatura (exclusiu): mitjana anual, increment, o cap.
function aplicaSeleccioTemp(val) {
  // Neteja: treu totes dues capes i restaura l'opacitat de l'IVAC si calia
  map.removeLayer(capaTemp);
  if (capaIncrement) map.removeLayer(capaIncrement);
  if (opacIVACabansTemp !== null) { posaOpacitatIVAC(opacIVACabansTemp); opacIVACabansTemp = null; }
  const lt = document.getElementById("legend-temp");
  const li = document.getElementById("legend-increment");
  if (lt) lt.hidden = true;
  if (li) li.hidden = true;

  if (val === "mitjana") {
    capaTemp.addTo(map);
    opacIVACabansTemp = opacitatIVAC;   // abaixa l'IVAC per fer-la comparable
    posaOpacitatIVAC(0.35);
    if (lt) lt.hidden = false;
  } else if (val === "increment") {
    activaIncrement();
    if (li) li.hidden = false;
  }
}
document.getElementById("sel-temp").addEventListener("change", function () {
  aplicaSeleccioTemp(this.value);
});

/* ---------- Valor en clicar ---------- */
// L'increment és vectorial: ja mostra el valor amb el popup del polígon.
// La mitjana anual és un ràster: en clicar, consultem el valor del píxel al
// servei amb l'operació "identify" i el mostrem en un popup.
function identifyTemp(latlng) {
  const size = map.getSize();
  const b = map.getBounds();
  const sw = L.CRS.EPSG3857.project(b.getSouthWest());
  const ne = L.CRS.EPSG3857.project(b.getNorthEast());
  const p = L.CRS.EPSG3857.project(latlng);
  const url = `${TEMP_BASE}/identify?f=json&geometryType=esriGeometryPoint` +
    `&geometry=${p.x},${p.y}&sr=3857&layers=all&tolerance=2&returnGeometry=false` +
    `&mapExtent=${sw.x},${sw.y},${ne.x},${ne.y}&imageDisplay=${size.x},${size.y},96`;
  fetch(url)
    .then((r) => r.json())
    .then((d) => {
      const res = d.results && d.results[0];
      const raw = res && res.attributes &&
        (res.attributes["Stretch.Pixel Value"] || res.attributes["Pixel Value"]);
      const val = raw != null ? parseFloat(raw) : NaN;
      if (isNaN(val)) return;
      L.popup({ maxWidth: 240 })
        .setLatLng(latlng)
        .setContent(
          `<div class="popup-ivac">
             <span class="popup-overline">Temperatura mitjana anual (1981–2010)</span>
             <div class="comp-head" style="margin-top:3px">
               <span class="comp-name">Temperatura</span>
               <span class="comp-val comp-val-total">${val.toFixed(1)} °C</span>
             </div>
           </div>`)
        .openOn(map);
    })
    .catch(() => {});
}
map.on("click", function (e) {
  const sel = document.getElementById("sel-temp").value;
  if (sel === "mitjana") { map.closePopup(); identifyTemp(e.latlng); }
  else if (sel === "increment") identifyIncrement(e.latlng);
});

/* ---------- Llegenda + transparència (targeta flotant al mapa) ---------- */
const controlLlegenda = L.control({ position: "bottomright" });
controlLlegenda.onAdd = function () {
  const div = L.DomUtil.create("div", "map-legend");
  div.innerHTML = `
    <div id="legend-ivac-uni">
      <h4 class="map-legend-title">Índex de Vulnerabilitat (IVAC)</h4>
      <div class="legend-vert">
        <div class="legend-ramp-v"></div>
        <div class="legend-ramp-v-labels">
          <span><b>100</b> · Més vulnerable</span>
          <span>75</span>
          <span>50</span>
          <span>25</span>
          <span><b>0</b> · Menys vulnerable</span>
        </div>
      </div>
    </div>
    <div class="map-legend-biv" id="legend-biv" hidden>
      <h4 class="map-legend-title">Vulnerabilitat × dèficit de resposta</h4>
      <div class="biv-wrap">
        <span class="biv-axis-y">Més lluny d'un refugi →</span>
        <div class="biv-grid">
          <i style="background:#c85a5a"></i><i style="background:#985356"></i><i style="background:#574249"></i>
          <i style="background:#e4acac"></i><i style="background:#ad9ea5"></i><i style="background:#627f8c"></i>
          <i style="background:#e8e8e8"></i><i style="background:#b0d5df"></i><i style="background:#64acbe"></i>
        </div>
      </div>
      <div class="biv-axis-x">Més vulnerable (IVAC) →</div>
      <div class="legend-nota">El <b>racó fosc</b> = seccions molt vulnerables i lluny de tot refugi (prioritat d'actuació). Distància en línia recta al refugi més proper; talls per tercils.</div>
    </div>
    <div class="map-legend-opacitat">
      <label for="rang-opacitat">Transparència de la capa</label>
      <input type="range" id="rang-opacitat" min="0" max="1" step="0.05" value="${opacitatIVAC}">
    </div>
    <div class="map-legend-temp" id="legend-temp" hidden>
      <h4 class="map-legend-title">Temperatura mitjana anual (1981–2010)</h4>
      <div class="legend-vert">
        <div class="legend-ramp-v legend-ramp-temp"></div>
        <div class="legend-ramp-v-labels">
          <span><b>17 °C</b> · Més calor</span>
          <span>16</span>
          <span>15</span>
          <span>14</span>
          <span><b>13 °C</b> · Menys calor</span>
        </div>
      </div>
      <div class="map-legend-opacitat">
        <label for="rang-opacitat-temp">Transparència de la capa</label>
        <input type="range" id="rang-opacitat-temp" min="0" max="1" step="0.05" value="0.7">
      </div>
    </div>
    <div class="map-legend-temp" id="legend-increment" hidden>
      <h4 class="map-legend-title">Increment de temperatura 2011–2040 (RCP4.5)</h4>
      <div class="legend-vert">
        <div class="legend-ramp-v legend-ramp-incr"></div>
        <div class="legend-ramp-v-labels">
          <span><b>+2,5 °C</b> · Més escalfament</span>
          <span>+2,0</span>
          <span>+1,5</span>
          <span><b>+1,0 °C</b> · Menys escalfament</span>
        </div>
      </div>
      <div class="legend-nota">Δ°C respecte al període de referència 1971–2000</div>
      <div class="map-legend-opacitat">
        <label for="rang-opacitat-incr">Transparència de la capa</label>
        <input type="range" id="rang-opacitat-incr" min="0" max="1" step="0.05" value="0.8">
      </div>
    </div>`;

  // Evita que interactuar amb la targeta mogui el mapa
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);

  // Connecta el control de transparència de l'IVAC
  div.querySelector("#rang-opacitat").addEventListener("input", function () {
    opacitatIVAC = parseFloat(this.value);
    if (capaIVAC) capaIVAC.setStyle({ fillOpacity: opacitatIVAC });
  });
  // Connecta el control de transparència de la temperatura
  div.querySelector("#rang-opacitat-temp").addEventListener("input", function () {
    capaTemp.setOpacity(parseFloat(this.value));
  });
  // Connecta el control de transparència de l'increment projectat
  div.querySelector("#rang-opacitat-incr").addEventListener("input", function () {
    opacitatIncr = parseFloat(this.value);
    if (capaIncrement) capaIncrement.setStyle({ fillOpacity: opacitatIncr });
  });

  return div;
};
controlLlegenda.addTo(map);

// Col·lapsar / desplegar la barra lateral
const appEl = document.getElementById("app");
const btnToggle = document.getElementById("sidebar-toggle");
btnToggle.addEventListener("click", function () {
  appEl.classList.toggle("collapsed");
  const collapsat = appEl.classList.contains("collapsed");
  btnToggle.textContent = collapsat ? "›" : "‹";
  btnToggle.setAttribute("aria-expanded", String(!collapsat));
  // Leaflet ha de recalcular la mida un cop acabada l'animació
  setTimeout(() => map.invalidateSize(), 260);
});

// En pantalles petites, la barra arrenca plegada perquè el mapa sigui protagonista
if (window.innerWidth <= 768) {
  appEl.classList.add("collapsed");
  btnToggle.textContent = "›";
  btnToggle.setAttribute("aria-expanded", "false");
}

/* ---------- 9. Escala i símbol del nord (a baix a l'esquerra) ---------- */
// Símbol del nord (el mapa no rota, per tant el nord sempre és amunt)
const nord = L.control({ position: "bottomleft" });
nord.onAdd = function () {
  const div = L.DomUtil.create("div", "nord-control");
  div.innerHTML = `
    <svg viewBox="0 0 40 52" width="34" height="44" aria-label="Nord">
      <polygon points="20,4 30,40 20,32 10,40" fill="#9C3D1A"/>
      <polygon points="20,4 20,32 10,40" fill="#C9662F"/>
      <text x="20" y="52" text-anchor="middle" font-size="13"
            font-weight="700" fill="#9C3D1A">N</text>
    </svg>`;
  return div;
};
nord.addTo(map);

// Barra d'escala mètrica
L.control.scale({ position: "bottomleft", imperial: false, metric: true }).addTo(map);
