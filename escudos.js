// =====================================================================
//  ⚙️ CONFIGURACIÓN DEL CLUB › ESCUDOS
//  - «Equipos del club»: color (el mismo de Horarios) y escudo de cada
//    equipo del club.
//  - «Otros clubes»: un apartado por club con su escudo y sus equipos
//    (se pueden renombrar, borrar o añadir equipos y clubes).
//  - Todo se guarda en la carpeta Escudos/:
//      Escudos/escudos.json        nombres, categorías, colores y escudos
//      Escudos/imagenes/<nombre>.png  las imágenes de los escudos
//  - La primera vez se crea a partir de DATOS.xls y la carpeta LOGOs.
//  - «Actualizar desde los PDF» añade los rivales de los calendarios de
//    partidos (CalendarioPartidos.json) que aún no estén.
//  - El color de un equipo del club es el de Horarios.json (teamColors):
//    al cambiarlo aquí se guarda también allí, y al guardar Horarios se
//    copia aquí (escSincronizarColores).
//  Usa de app.js: appData, getTeamKey, hz, hzPersistLocal, writeGitHubFile,
//  b64_to_utf8, escapeHtml, ghSettings, mostrarCargando, ocultarCargando.
// =====================================================================
(function () {
  "use strict";

  const ESC_FILE = "Escudos/escudos.json";
  const IMG_DIR = "Escudos/imagenes";
  const ESC_LOCAL = "NVA_ESCUDOS";
  const HZ = "Horarios.json";
  const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const XLSX_SRI = "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw";
  const MAX_LADO = 400;   // px del lado mayor al guardar un escudo

  const esc = (s) => escapeHtml(s);
  const caja = () => document.getElementById("escPanel");
  const api = (ruta) => `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${ruta.split("/").map(encodeURIComponent).join("/")}`;
  const uid = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  let datos = cargarLocal();      // null = aún no existe la carpeta Escudos
  let urls = {};                  // ruta de imagen -> URL firmada para verla
  let abiertos = {};              // clubes desplegados
  let filtro = "";
  let estado = "";
  let leido = false;

  function cargarLocal() {
    try { const d = JSON.parse(localStorage.getItem(ESC_LOCAL)); if (d && d.clubes) return normalizar(d); } catch (e) {}
    return null;
  }
  function guardarLocal() { try { localStorage.setItem(ESC_LOCAL, JSON.stringify(datos)); } catch (e) {} }

  function normalizar(d) {
    const out = { version: 1, actualizado: String(d.actualizado || ""), club: {}, clubes: [] };
    Object.keys(d.club || {}).forEach(k => {
      const c = d.club[k] || {};
      out.club[k] = { nombre: String(c.nombre || ""), categoria: String(c.categoria || ""), escudo: String(c.escudo || ""),
        color: /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "" };
    });
    (Array.isArray(d.clubes) ? d.clubes : []).forEach(c => {
      if (!c) return;
      out.clubes.push({ id: String(c.id || uid()), nombre: String(c.nombre || "Club"), escudo: String(c.escudo || ""),
        equipos: (Array.isArray(c.equipos) ? c.equipos : []).filter(e => e && e.nombre)
          .map(e => ({ id: String(e.id || uid()), nombre: String(e.nombre), categoria: String(e.categoria || "") })) });
    });
    return out;
  }

  const puede = (menu) => !window.nva || !window.nva.perfil || window.nva.acceso(menu) === "escritura";
  const puedeEditar = () => puede("opciones.escudos");

  // ---------- Nombres: mismo criterio que las Stories (historia-semana.js) ----------
  const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const IGNORAR = new Set(["CV", "CD", "CB", "CE", "SD", "CLUB", "DE", "DEL", "LA", "EL", "LES", "ELS", "VOLEI", "VOLEY", "VOLEIBOL", "VOLEYBOL", "C", "V"]);
  function tokens(t) {
    const s = sinAcentos(t).replace(/NOU\s+VOLE[IY]\s+ALZIRA/g, "NVA").replace(/\bNVA\s+ALZIRA\b/g, "NVA");
    return s.replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(w => w && !IGNORAR.has(w));
  }
  function distancia(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function similitud(a, b) {
    const ta = tokens(a), tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    if (ta.join(" ") === tb.join(" ")) return 1;
    const sueltos = (x) => x.filter(w => w.length === 1 || /^\d+$/.test(w)).sort().join(",");
    if (sueltos(ta) !== sueltos(tb)) return 0;
    const ca = ta.join(""), cb = tb.join("");
    const sc = 1 - distancia(ca, cb) / Math.max(ca.length, cb.length);
    if (sc >= 0.88) return sc;
    const [peq, gran] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    let ok = 0;
    peq.forEach(w => { if (gran.some(g => g === w || (w.length >= 5 && g.length >= 5 && distancia(w, g) <= 1))) ok++; });
    if (ok === peq.length && peq.length >= 2) return 0.85;
    const ratio = ok / gran.length;
    return ratio >= 0.8 ? ratio : 0;
  }
  // ¿El equipo pertenece al club? Todas las palabras del nombre del club están en el del equipo
  function esDelClub(equipo, club) {
    const tc = tokens(club), te = tokens(equipo);
    if (!tc.length) return false;
    return tc.every(w => te.includes(w));   // palabra exacta: «CV FURIA» no es de «CAMP TURIA»
  }
  const catBase = (c) => sinAcentos(c).split(/\s+/)[0] || "";
  const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "escudo";

  // ---------- Lectura y guardado ----------
  async function leerJson(ruta) {
    const r = await fetch(api(ruta), { cache: "no-store" });
    if (r.status === 404) return { existe: false };
    if (!r.ok) throw new Error(`No se pudo leer ${ruta} (${r.status})`);
    const j = await r.json();
    return { existe: true, data: JSON.parse(b64_to_utf8(j.content || "")) };
  }

  async function leer() {
    if (!navigator.onLine) return;
    try {
      if (!(typeof offlineQueue !== "undefined" && offlineQueue.some(op => op.fileName === ESC_FILE))) {
        const r = await leerJson(ESC_FILE);
        datos = r.existe ? normalizar(r.data) : null;
        if (datos) guardarLocal(); else localStorage.removeItem(ESC_LOCAL);
      }
      await leerImagenes();
    } catch (e) { console.warn("Escudos:", e); }
    leido = true;
  }

  async function leerImagenes() {
    const r = await fetch(api(IMG_DIR), { cache: "no-store" });
    if (!r.ok) return;
    const lista = await r.json();
    urls = {};
    (Array.isArray(lista) ? lista : []).forEach(f => { if (f.type === "file" && f.download_url) urls[f.path] = f.download_url; });
  }

  let temporizador = null;
  function guardar(msg) {
    datos.actualizado = new Date().toISOString();
    guardarLocal();
    setEstado("Guardando…");
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      const ok = await writeGitHubFile(ESC_FILE, datos, msg || "Actualizar escudos");
      setEstado(ok ? "✓ Guardado" : "Guardado en este dispositivo: se enviará al recuperar la conexión");
    }, 700);
  }
  function setEstado(t) { estado = t; const n = document.getElementById("escEstado"); if (n) n.textContent = t; }

  async function subirImagen(ruta, base64) {
    let sha = "";
    try { const g = await fetch(api(ruta), { cache: "no-store" }); if (g.ok) sha = (await g.json()).sha || ""; } catch (e) {}
    const r = await fetch(api(ruta), { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Escudo " + ruta, content: base64, ...(sha && { sha }) }) });
    if (!r.ok) {
      let m = ""; try { m = (await r.json()).message || ""; } catch (e) {}
      throw new Error(m || `No se pudo guardar la imagen (${r.status})`);
    }
  }

  // Redimensiona (máx. 400 px) y pasa a PNG en base64
  function aPng(fuente) {
    return new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, MAX_LADO / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/png").split(",")[1]);
      };
      img.onerror = () => mal(new Error("La imagen no se puede leer"));
      img.src = fuente;
    });
  }
  const archivoAUrl = (f) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(f); });

  // ---------- Color: el mismo que en Horarios ----------
  function colorDe(key) {
    return (typeof hz !== "undefined" && hz.teamColors && hz.teamColors[key]) || (datos && datos.club[key] && datos.club[key].color) || "#dddddd";
  }

  async function guardarColorEnHorarios(key, color) {
    // En este dispositivo: Horarios ve el color al momento
    if (typeof hz !== "undefined") { hz.teamColors[key] = color; if (typeof hzPersistLocal === "function") hzPersistLocal(); }
    if (typeof hzRenderAll === "function") { try { hzRenderAll(); } catch (e) {} }
    if (!puede("direccion.horarios")) {
      nvaAviso("El color se ha guardado en Escudos, pero no tienes permiso para editar Horarios: allí no cambiará hasta que lo cambie alguien con permiso.");
      return false;
    }
    // En Horarios.json solo se cambia ese color (no se envían otros cambios de Horarios sin guardar)
    try {
      if (typeof offlineQueue !== "undefined" && offlineQueue.some(op => op.fileName === HZ)) {
        const op = offlineQueue.filter(o => o.fileName === HZ).pop();
        op.dataObject.teamColors = Object.assign({}, op.dataObject.teamColors, { [key]: color });
        localStorage.setItem("NVA_OFFLINE_QUEUE", JSON.stringify(offlineQueue));
        return true;
      }
      const r = await leerJson(HZ);
      const h = r.existe ? r.data : {};
      h.teamColors = Object.assign({}, h.teamColors, { [key]: color });
      h.updated = new Date().toISOString();
      return await writeGitHubFile(HZ, h, "Color de equipo (desde Escudos)");
    } catch (e) { console.warn(e); return false; }
  }

  // La llama saveHorarios() (app.js): copia los colores de Horarios aquí
  window.escSincronizarColores = async function (colores) {
    if (!colores || !puedeEditar()) return;
    try {
      if (!datos) { const r = await leerJson(ESC_FILE); if (!r.existe) return; datos = normalizar(r.data); }
      let cambia = false;
      (appData.teams || []).forEach(t => {
        const k = getTeamKey(t), c = colores[k];
        if (!c) return;
        if (!datos.club[k]) datos.club[k] = { nombre: t.name, categoria: t.category, escudo: "", color: "" };
        if (datos.club[k].color !== c) { datos.club[k].color = c; cambia = true; }
      });
      if (!cambia) return;
      datos.actualizado = new Date().toISOString();
      guardarLocal();
      await writeGitHubFile(ESC_FILE, datos, "Colores de equipos (desde Horarios)");
      if (caja() && caja().offsetParent) pintar();
    } catch (e) { console.warn("Escudos: no se pudieron copiar los colores", e); }
  };

  // ---------- Primera vez: desde DATOS.xls y LOGOs ----------
  function asegurarXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = XLSX_URL; s.integrity = XLSX_SRI; s.crossOrigin = "anonymous"; s.async = true;
      s.onload = () => ok(); s.onerror = () => mal(new Error("No se pudo cargar el lector de Excel"));
      document.head.appendChild(s);
    });
  }

  async function leerDatosXls() {
    await asegurarXlsx();
    const r = await fetch("DATOS.xls", { cache: "no-cache" });
    if (!r.ok) throw new Error("No se ha podido leer DATOS.xls");
    const wb = XLSX.read(new Uint8Array(await r.arrayBuffer()), { type: "array" });
    const hoja = (p) => { const n = wb.SheetNames.find(s => sinAcentos(s).includes(p)); return n ? XLSX.utils.sheet_to_json(wb.Sheets[n]) : []; };
    const fila = (f) => ({ equipo: String(f.EQUIPO || "").trim(), categoria: String(f.CATEGORIA || f["CATEGORÍA"] || "").trim(),
      logo: String(f.LOGO || "").trim(), color: String(f.COLOR || "").trim() });
    return { nva: hoja("EQUIPOS NVA").map(fila).filter(f => f.equipo), otros: hoja("OTRO").map(fila).filter(f => f.equipo) };
  }

  // Copia LOGOs/<logo>.png a Escudos/imagenes/<nombre>.png (null si no hay imagen)
  async function copiarLogo(logo, nombre, hechos) {
    if (!logo || /^noescudo$/i.test(logo)) return "";
    const ruta = `${IMG_DIR}/${slug(nombre)}.png`;
    if (hechos[ruta] !== undefined) return hechos[ruta];
    try {
      const r = await fetch("LOGOs/" + encodeURIComponent(logo) + (/\.(png|jpe?g)$/i.test(logo) ? "" : ".png"));
      if (!r.ok) { hechos[ruta] = ""; return ""; }
      const url = URL.createObjectURL(await r.blob());
      const b64 = await aPng(url);
      URL.revokeObjectURL(url);
      await subirImagen(ruta, b64);
      hechos[ruta] = ruta;
    } catch (e) { console.warn("Logo", logo, e); hechos[ruta] = ""; }
    return hechos[ruta];
  }

  async function crearDesdeDatos() {
    if (!puedeEditar()) return;
    if (!await nvaConfirmar("Se creará la carpeta Escudos con los equipos, colores y escudos de DATOS.xls y la carpeta LOGOs. ¿Continuar?")) return;
    mostrarCargando("Creando la carpeta Escudos...");
    try {
      const x = await leerDatosXls();
      const hechos = {};
      const nuevo = { version: 1, actualizado: "", club: {}, clubes: [] };

      // Equipos del club
      for (const t of (appData.teams || [])) {
        const key = getTeamKey(t);
        let mejor = null, valor = 0;
        x.nva.forEach(f => {
          let v = similitud(t.name, f.equipo);
          if (v < 0.8) return;
          if (catBase(f.categoria) === catBase(t.category)) v += 0.5;
          if (v > valor) { mejor = f; valor = v; }
        });
        const color = mejor && /^[0-9a-f]{6}$/i.test(mejor.color) ? "#" + mejor.color.toLowerCase() : "";
        nuevo.club[key] = {
          nombre: mejor ? mejor.equipo : t.name, categoria: mejor ? mejor.categoria : t.category,
          escudo: mejor ? await copiarLogo(mejor.logo, "club-" + key, hechos) : "",
          color: (typeof hz !== "undefined" && hz.teamColors[key]) || color
        };
      }

      // Otros clubes: un club por escudo; los «sin escudo» se agrupan por nombre
      const otros = x.otros.filter(f => !tokens(f.equipo).includes("NVA"));
      const porLogo = new Map();
      otros.forEach(f => {
        const k = f.logo && !/^noescudo$/i.test(f.logo) ? "L:" + f.logo.toLowerCase() : null;
        if (k) { if (!porLogo.has(k)) porLogo.set(k, []); porLogo.get(k).push(f); }
      });
      const grupos = Array.from(porLogo.values());
      otros.filter(f => !f.logo || /^noescudo$/i.test(f.logo)).forEach(f => {
        const g = grupos.find(g => g.some(o => similitud(o.equipo, f.equipo) >= 0.8 || esDelClub(f.equipo, o.equipo) || esDelClub(o.equipo, f.equipo)));
        if (g) g.push(f); else grupos.push([f]);
      });
      for (const g of grupos) {
        // Nombre del club: la fila sin categoría (es el nombre general) o el más corto
        const general = g.filter(f => !f.categoria).map(f => f.equipo);
        const nombre = (general.length ? general : g.map(f => f.equipo)).sort((a, b) => a.length - b.length)[0];
        const equipos = [];
        g.filter(f => f.categoria || !g.some(o => o.categoria)).forEach(f => {
          if (!equipos.some(e => e.nombre === f.equipo && e.categoria === f.categoria)) equipos.push({ id: uid(), nombre: f.equipo, categoria: f.categoria });
        });
        const logo = (g.find(f => f.logo && !/^noescudo$/i.test(f.logo)) || {}).logo;
        nuevo.clubes.push({ id: uid(), nombre, escudo: await copiarLogo(logo, nombre, hechos), equipos });
      }
      ordenarClubes(nuevo);
      nuevo.actualizado = new Date().toISOString();
      datos = nuevo;
      guardarLocal();
      const ok = await writeGitHubFile(ESC_FILE, datos, "Crear Escudos desde DATOS.xls");
      await leerImagenes();
      ocultarCargando();
      pintar();
      nvaAviso(`Carpeta Escudos creada: ${Object.keys(datos.club).length} equipos del club y ${datos.clubes.length} clubes rivales.` +
        (ok ? "" : " Se enviará al recuperar la conexión."));
    } catch (e) {
      ocultarCargando();
      nvaAviso("No se pudo crear la carpeta Escudos: " + (e.message || e), { tipo: "error" });
    }
  }

  function ordenarClubes(d) {
    d.clubes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const orden = (c) => ["ALEVIN", "INFANTIL", "CADETE", "JUVENIL", "JUNIOR", "SENIOR"].indexOf(catBase(c));
    d.clubes.forEach(c => c.equipos.sort((a, b) => (orden(a.categoria) - orden(b.categoria)) || a.nombre.localeCompare(b.nombre, "es")));
  }

  // ---------- Actualizar desde los PDF de calendario ----------
  async function leerCalendario() {
    let cp = null;
    try { cp = JSON.parse(localStorage.getItem("NVA_CALENDARIO_PARTIDOS")); } catch (e) {}
    if (navigator.onLine) {
      try { const r = await leerJson("CalendarioPartidos.json"); if (r.existe) cp = r.data; } catch (e) {}
    }
    return (cp && cp.teams) || {};
  }

  async function actualizarDesdePdf() {
    if (!datos || !puedeEditar()) return;
    mostrarCargando("Buscando rivales en los calendarios...");
    try {
      const cal = await leerCalendario();
      const equiposClub = {};
      (appData.teams || []).forEach(t => { equiposClub[getTeamKey(t)] = t; });
      const nuevos = [], clubesNuevos = [];
      Object.keys(cal).forEach(key => {
        const t = equiposClub[key];
        const categoria = (datos.club[key] && datos.club[key].categoria) || (t ? String(t.category || "").toUpperCase() : "");
        (cal[key].matches || []).forEach(m => {
          const rival = String(m.rival || "").replace(/\s+/g, " ").trim();
          if (!rival || /DESCANS/i.test(rival) || tokens(rival).includes("NVA")) return;
          // ¿Ya está? (mismo nombre y misma categoría)
          const ya = datos.clubes.some(c => c.equipos.some(e => similitud(e.nombre, rival) >= 0.8 && (!e.categoria || !categoria || catBase(e.categoria) === catBase(categoria))));
          if (ya) return;
          // ¿De qué club? Primero por equipos parecidos, después por el nombre del club
          let club = null, mejor = 0;
          datos.clubes.forEach(c => {
            let v = Math.max(0, ...c.equipos.map(e => similitud(e.nombre, rival)));
            if (v < 0.8) v = esDelClub(rival, c.nombre) ? 0.75 + tokens(c.nombre).length / 100 : 0;
            if (v > mejor) { mejor = v; club = c; }
          });
          if (!club) {
            club = { id: uid(), nombre: rival, escudo: "", equipos: [] };
            datos.clubes.push(club); clubesNuevos.push(club.nombre);
          }
          if (club.equipos.some(e => e.nombre === rival && e.categoria === categoria)) return;
          club.equipos.push({ id: uid(), nombre: rival, categoria });
          nuevos.push(`${rival} (${categoria || "sin categoría"}) → ${club.nombre}`);
          abiertos[club.id] = true;
        });
      });
      ocultarCargando();
      if (!Object.keys(cal).length) { nvaAviso("No hay calendarios de partidos. Súbelos en Calendario de partidos › Equipos."); return; }
      if (!nuevos.length) { nvaAviso("Ya están todos los rivales de los calendarios."); return; }
      ordenarClubes(datos);
      guardar("Añadir rivales de los calendarios");
      pintar();
      nvaAviso(`Añadidos ${nuevos.length} equipo(s)` + (clubesNuevos.length ? ` y ${clubesNuevos.length} club(es) nuevo(s) sin escudo` : "") +
        ":\n\n" + nuevos.slice(0, 40).join("\n") + (nuevos.length > 40 ? `\n… y ${nuevos.length - 40} más` : "") +
        "\n\nRevisa que cada equipo esté en su club: puedes cambiar los nombres o borrarlos.");
    } catch (e) {
      ocultarCargando();
      nvaAviso("No se pudo actualizar: " + (e.message || e), { tipo: "error" });
    }
  }

  // ---------- Pintado ----------
  function imgHtml(ruta, nombre) {
    const u = ruta && urls[ruta];
    return u ? `<img class="esc-img" src="${esc(u)}" alt="">` : `<span class="esc-img esc-vacio" title="Sin escudo">${esc((tokens(nombre)[0] || "?").slice(0, 2))}</span>`;
  }

  function categorias() {
    const s = new Set();
    Object.values(datos.club).forEach(c => c.categoria && s.add(c.categoria));
    datos.clubes.forEach(c => c.equipos.forEach(e => e.categoria && s.add(e.categoria)));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"));
  }

  function pintar() {
    const box = caja();
    if (!box) return;
    const ed = puedeEditar();
    const dis = ed ? "" : " disabled";
    if (!datos) {
      box.innerHTML = `<div class="config-section">
          <div class="config-subtitle">Escudos</div>
          <p class="esc-nota">${leido ? "Aún no existe la carpeta Escudos." : "Cargando…"}</p>
          ${leido && ed ? `<button class="btn-save-session" data-esc="crear">📥 Crear desde DATOS.xls y LOGOs</button>` : ""}
        </div>`;
      return;
    }
    const teams = appData.teams || [];
    let club = "";
    teams.forEach(t => {
      const key = getTeamKey(t), d = datos.club[key] || {};
      club += `<div class="esc-equipo" data-key="${esc(key)}">
          <label class="esc-escudo" title="Cambiar escudo">${imgHtml(d.escudo, t.name)}${ed ? `<input type="file" accept="image/*" data-esc="img-club" hidden>` : ""}</label>
          <div class="esc-datos">
            <div class="esc-titulo">${esc(t.name)} <small class="badge">${esc(t.category)}</small></div>
            <input type="text" class="app-input" data-esc="club-nombre" value="${esc(d.nombre || t.name)}" placeholder="Nombre en carteles"${dis}>
            <input type="text" class="app-input" data-esc="club-cat" list="escCats" value="${esc(d.categoria || "")}" placeholder="Categoría (como en la federación)"${dis}>
          </div>
          <input type="color" class="esc-color" data-esc="color" value="${esc(colorDe(key))}" title="Color (el mismo que en Horarios)"${dis}>
        </div>`;
    });
    if (!teams.length) club = `<p class="esc-nota">No hay equipos del club. Créalos en la pestaña «Jugadores/as y Equipos».</p>`;

    const f = sinAcentos(filtro).trim();
    const lista = datos.clubes.filter(c => !f || sinAcentos(c.nombre).includes(f) || c.equipos.some(e => sinAcentos(e.nombre).includes(f)));
    let otros = "";
    lista.forEach(c => {
      const abierto = !!abiertos[c.id] || (!!f && lista.length <= 5);
      otros += `<div class="esc-club${abierto ? " open" : ""}" data-id="${esc(c.id)}">
          <button type="button" class="hz-sub-btn${abierto ? " open" : ""}" data-esc="plegar">
            <span class="esc-cab">${imgHtml(c.escudo, c.nombre)}<span>${esc(c.nombre)}</span> <small class="badge">${c.equipos.length}</small></span><span>${abierto ? "🔻" : "➤"}</span>
          </button>`;
      if (abierto) {
        otros += `<div class="hz-sub-panel esc-panel-club">
            <div class="esc-club-head">
              <label class="esc-escudo esc-grande" title="Cambiar escudo">${imgHtml(c.escudo, c.nombre)}${ed ? `<input type="file" accept="image/*" data-esc="img-rival" hidden>` : ""}</label>
              <div class="esc-datos">
                <span class="hz-label">Nombre del club</span>
                <input type="text" class="app-input" data-esc="club-rival-nombre" value="${esc(c.nombre)}"${dis}>
                ${ed ? `<div class="esc-acciones">
                  <button type="button" class="hz-mini-btn" data-esc="elegir-img">🖼️ ${c.escudo ? "Cambiar" : "Subir"} escudo</button>
                  ${c.escudo ? `<button type="button" class="hz-mini-btn" data-esc="quitar-img">Quitar escudo</button>` : ""}
                </div>` : ""}
              </div>
            </div>
            <span class="hz-label">Equipos de este club</span>`;
        c.equipos.forEach(e => {
          otros += `<div class="esc-fila" data-eq="${esc(e.id)}">
              <input type="text" class="app-input" data-esc="eq-nombre" value="${esc(e.nombre)}" placeholder="Nombre"${dis}>
              <input type="text" class="app-input esc-cat" data-esc="eq-cat" list="escCats" value="${esc(e.categoria)}" placeholder="Categoría"${dis}>
              ${ed ? `<button type="button" class="btn-del" data-esc="eq-borrar" title="Borrar equipo">🗑</button>` : ""}
            </div>`;
        });
        if (!c.equipos.length) otros += `<p class="esc-nota">Sin equipos.</p>`;
        if (ed) otros += `<div class="esc-fila esc-nuevo">
              <input type="text" class="app-input" data-esc="nuevo-eq-nombre" placeholder="Nuevo equipo de ${esc(c.nombre)}">
              <input type="text" class="app-input esc-cat" data-esc="nuevo-eq-cat" list="escCats" placeholder="Categoría">
              <button type="button" class="btn-add" data-esc="eq-anadir">+</button>
            </div>
            <button type="button" class="btn-danger-action esc-borrar-club" data-esc="club-borrar">🗑️ Borrar el club ${esc(c.nombre)}</button>`;
        otros += `</div>`;
      }
      otros += `</div>`;
    });
    if (!lista.length) otros = `<p class="esc-nota">${f ? "Ningún club coincide con la búsqueda." : "No hay clubes."}</p>`;

    box.innerHTML = `
      <datalist id="escCats">${categorias().map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      <div class="config-section">
        <div class="config-subtitle">Equipos del club <span class="badge">${teams.length}</span></div>
        <p class="esc-nota">Toca el escudo para cambiarlo. El color es el mismo que el de Horarios: si lo cambias aquí, cambia allí.</p>
        ${club}
      </div>
      <div class="config-section">
        <div class="config-subtitle">Otros clubes <span class="badge">${datos.clubes.length}</span></div>
        ${ed ? `<button type="button" class="btn-save-session esc-actualizar" data-esc="actualizar">🔄 Actualizar desde los PDF de los calendarios</button>
        <p class="esc-nota">Añade los rivales de los calendarios de partidos que aún no estén, cada uno en su club.</p>` : ""}
        <input type="search" class="app-input esc-buscar" data-esc="buscar" value="${esc(filtro)}" placeholder="🔎 Buscar club o equipo">
        ${otros}
        ${ed ? `<div class="input-group esc-nuevo-club">
          <input type="text" class="app-input" data-esc="nuevo-club" placeholder="Nombre del nuevo club">
          <button type="button" class="btn-add" data-esc="club-anadir">+</button>
        </div>` : ""}
      </div>
      <p class="esc-estado" id="escEstado">${esc(estado)}</p>`;
  }

  // ---------- Eventos ----------
  const clubDe = (n) => { const el = n.closest(".esc-club"); return el && datos.clubes.find(c => c.id === el.dataset.id); };
  const equipoDe = (n, c) => { const el = n.closest(".esc-fila"); return el && c && c.equipos.find(e => e.id === el.dataset.eq); };
  const keyDe = (n) => { const el = n.closest(".esc-equipo"); return el && el.dataset.key; };

  async function cambiarImagen(input, ruta, alAcabar) {
    const f = input.files && input.files[0];
    if (!f) return;
    mostrarCargando("Guardando el escudo...");
    try {
      await subirImagen(ruta, await aPng(await archivoAUrl(f)));
      alAcabar(ruta);
      guardar("Cambiar escudo");
      await leerImagenes();
      ocultarCargando();
      pintar();
    } catch (e) {
      ocultarCargando();
      nvaAviso("No se pudo guardar el escudo: " + (e.message || e), { tipo: "error" });
    }
  }

  function enlazar() {
    const box = caja();
    if (!box || box.dataset.enlazado) return;
    box.dataset.enlazado = "1";

    box.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-esc]");
      if (!b || b.tagName === "INPUT") return;
      const a = b.dataset.esc, c = datos && clubDe(b);
      if (a === "crear") return crearDesdeDatos();
      if (a === "actualizar") return actualizarDesdePdf();
      if (a === "plegar") { abiertos[c.id] = !abiertos[c.id]; return pintar(); }
      if (a === "elegir-img") { const i = b.closest(".esc-panel-club").querySelector("[data-esc=img-rival]"); if (i) i.click(); return; }
      if (a === "quitar-img") { c.escudo = ""; guardar("Quitar escudo"); return pintar(); }
      if (a === "eq-borrar") {
        const e = equipoDe(b, c);
        if (!e || !await nvaConfirmar(`¿Borrar el equipo «${e.nombre}»${e.categoria ? " (" + e.categoria + ")" : ""}?`)) return;
        c.equipos = c.equipos.filter(x => x !== e); guardar("Borrar equipo"); return pintar();
      }
      if (a === "eq-anadir") {
        const p = b.closest(".esc-nuevo");
        const nombre = p.querySelector("[data-esc=nuevo-eq-nombre]").value.trim();
        if (!nombre) return;
        c.equipos.push({ id: uid(), nombre, categoria: p.querySelector("[data-esc=nuevo-eq-cat]").value.trim() });
        ordenarClubes(datos); guardar("Añadir equipo"); return pintar();
      }
      if (a === "club-borrar") {
        if (!await nvaConfirmar(`¿Borrar el club «${c.nombre}» y sus ${c.equipos.length} equipo(s)?`)) return;
        datos.clubes = datos.clubes.filter(x => x !== c); guardar("Borrar club"); return pintar();
      }
      if (a === "club-anadir") {
        const i = box.querySelector("[data-esc=nuevo-club]"), nombre = i.value.trim();
        if (!nombre) return;
        if (datos.clubes.some(x => sinAcentos(x.nombre) === sinAcentos(nombre))) { nvaAviso("Ya hay un club con ese nombre."); return; }
        const nuevo = { id: uid(), nombre, escudo: "", equipos: [] };
        datos.clubes.push(nuevo); ordenarClubes(datos); abiertos[nuevo.id] = true; filtro = "";
        guardar("Añadir club"); return pintar();
      }
    });

    box.addEventListener("input", (ev) => {
      if (ev.target.dataset.esc === "buscar") {
        filtro = ev.target.value; const pos = ev.target.selectionStart;
        pintar();
        const n = box.querySelector("[data-esc=buscar]"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
      }
    });

    box.addEventListener("change", (ev) => {
      const n = ev.target, a = n.dataset.esc;
      if (!a || !datos) return;
      const v = n.value.trim();
      if (a === "color") {
        const key = keyDe(n);
        datos.club[key] = Object.assign({ nombre: "", categoria: "", escudo: "" }, datos.club[key], { color: n.value });
        guardar("Color de equipo");
        guardarColorEnHorarios(key, n.value);
        return;
      }
      if (a === "club-nombre" || a === "club-cat") {
        const key = keyDe(n);
        datos.club[key] = Object.assign({ nombre: "", categoria: "", escudo: "", color: "" }, datos.club[key]);
        datos.club[key][a === "club-nombre" ? "nombre" : "categoria"] = v;
        return guardar("Equipo del club");
      }
      if (a === "img-club") {
        const key = keyDe(n);
        return cambiarImagen(n, `${IMG_DIR}/club-${slug(key)}.png`, (ruta) => {
          datos.club[key] = Object.assign({ nombre: "", categoria: "", color: "" }, datos.club[key], { escudo: ruta });
        });
      }
      const c = clubDe(n);
      if (!c) return;
      if (a === "img-rival") return cambiarImagen(n, `${IMG_DIR}/${slug(c.nombre)}.png`, (ruta) => { c.escudo = ruta; });
      if (a === "club-rival-nombre") { if (!v) { n.value = c.nombre; return; } c.nombre = v; ordenarClubes(datos); guardar("Nombre de club"); return pintar(); }
      const e = equipoDe(n, c);
      if (a === "eq-nombre" && e) { if (!v) { n.value = e.nombre; return; } e.nombre = v; return guardar("Nombre de equipo"); }
      if (a === "eq-cat" && e) { e.categoria = v; return guardar("Categoría de equipo"); }
    });
  }

  // Se llama al abrir la pestaña
  window.escAbrir = async function () {
    enlazar();
    pintar();
    await leer();
    pintar();
  };
})();
