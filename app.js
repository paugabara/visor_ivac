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

function estilIVAC(feature) {
  return {
    fillColor: getColor(feature.properties.IVAC),
    fillOpacity: opacitatIVAC,
    color: "#ffffff",
    weight: 0.2,
    opacity: 0.5
  };
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

function onEachIVAC(feature, layer) {
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

  layer.bindPopup(
    `<div class="popup-ivac">
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
     </div>`,
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
    if (!document.getElementById("chk-mascara").checked) map.removeLayer(capaMascara);

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
    <span class="popup-overline">Refugi climàtic · Barcelona</span>
    <b>${esc(p.nom) || "—"}</b>`;
  if (p.adreca) html += `<span class="ref-adr">${esc(p.adreca)}</span>`;
  if (zona) html += `<span class="ref-zona">${zona}</span>`;
  html += renderHorari(p.horari);
  if (p.web || p.email) {
    html += `<div class="ref-block">`;
    if (p.web) html += `<a class="ref-link" href="${esc(p.web)}" target="_blank" rel="noopener">Web del refugi ↗</a>`;
    if (p.email) html += `<a class="ref-link" href="mailto:${esc(p.email)}">${esc(p.email)}</a>`;
    html += `</div>`;
  }
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
      paddingTopLeft: [plegat ? 20 : 345, 20],
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
  if (!capaIVAC) return;
  if (this.checked) { capaIVAC.addTo(map); if (capaAMB) capaAMB.bringToFront(); }
  else map.removeLayer(capaIVAC);
});
document.getElementById("chk-amb").addEventListener("change", function () {
  if (!capaAMB) return;
  if (this.checked) { capaAMB.addTo(map); capaAMB.bringToFront(); }
  else map.removeLayer(capaAMB);
});
document.getElementById("chk-mascara").addEventListener("change", function () {
  if (!capaMascara) return;
  if (this.checked) { capaMascara.addTo(map); capaMascara.bringToBack(); }
  else map.removeLayer(capaMascara);
});
document.getElementById("chk-refugis").addEventListener("change", function () {
  if (!capaRefugis) return;
  if (this.checked) capaRefugis.addTo(map);
  else map.removeLayer(capaRefugis);
});

/* ---------- Llegenda + transparència (targeta flotant al mapa) ---------- */
const controlLlegenda = L.control({ position: "bottomright" });
controlLlegenda.onAdd = function () {
  const div = L.DomUtil.create("div", "map-legend");
  div.innerHTML = `
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
    <div class="map-legend-opacitat">
      <label for="rang-opacitat">Transparència de la capa</label>
      <input type="range" id="rang-opacitat" min="0" max="1" step="0.05" value="${opacitatIVAC}">
    </div>`;

  // Evita que interactuar amb la targeta mogui el mapa
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);

  // Connecta el control de transparència
  div.querySelector("#rang-opacitat").addEventListener("input", function () {
    opacitatIVAC = parseFloat(this.value);
    if (capaIVAC) capaIVAC.setStyle({ fillOpacity: opacitatIVAC });
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
