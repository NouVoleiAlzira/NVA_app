/* =====================================================================
   Dirección NVA › Gestión y Avisos Individuales › «Carga automática»
   Se adjunta un Excel con las columnas Nombre, Apellidos y Equipos y se
   pone el mismo aviso (motivo + color) a todos los jugadores/as de la
   lista que existen en la app. Se informa de los que no se encuentran.
   Del Excel solo se leen esas tres columnas: el resto no se lee ni se
   guarda, y el fichero no sale del navegador.
   ===================================================================== */
(function () {
  "use strict";

  const norm = (s) => normalizeTeamName(s);
  const tokens = (s) => norm(s).split(" ").filter(Boolean);
  // «Laura Torres» en la app y «Laura Torres Cervera» en el Excel (o al revés)
  const formaCorta = (corto, largo) => {
    const a = tokens(corto), b = tokens(largo);
    return a.length >= 2 && a.length < b.length && a[0] === b[0] && a.every(t => b.includes(t));
  };

  let filas = [];              // [{ jugador, equipo }] leídas del Excel
  let color = "#ef4444";

  function estado(txt, cls) {
    const el = document.getElementById("caEstado");
    el.className = "ca-estado" + (cls ? " " + cls : "");
    el.textContent = txt;
  }

  function leerFilas(wb) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    if (!rows.length) return [];
    const head = rows[0].map(h => norm(String(h)));
    let cN = head.findIndex(h => h === "NOMBRE");
    let cA = head.findIndex(h => h.startsWith("APELLIDO"));
    let cE = head.findIndex(h => h.startsWith("EQUIPO"));
    const cabecera = cN >= 0 || cA >= 0;
    if (cN < 0) cN = 0;
    if (cA < 0) cA = 1;
    return rows.slice(cabecera ? 1 : 0).map(r => ({
      jugador: `${String(r[cN] || "").trim()} ${String(r[cA] || "").trim()}`.replace(/\s+/g, " ").trim(),
      equipo: cE >= 0 ? String(r[cE] || "").replace(/\s+/g, " ").trim() : ""
    })).filter(r => r.jugador);
  }

  // Todos los jugadores/as de la app: [{ nombre, equipos: [clave] }]
  function jugadoresApp() {
    const mapa = new Map();
    (appData.teams || []).forEach(t => {
      const key = getTeamKey(t);
      getPlayersForTeamKey(key).forEach(n => {
        if (!mapa.has(n)) mapa.set(n, { nombre: n, equipos: [] });
        mapa.get(n).equipos.push(key);
      });
    });
    return [...mapa.values()];
  }

  // Nombre del jugador/a en la app, o null si no está (o hay varios posibles)
  function buscar(fila, todos) {
    const n = norm(fila.jugador);
    const exacto = todos.filter(p => norm(p.nombre) === n);
    if (exacto.length) return exacto[0].nombre;
    const parecidos = todos.filter(p => formaCorta(p.nombre, fila.jugador) || formaCorta(fila.jugador, p.nombre));
    if (parecidos.length === 1) return parecidos[0].nombre;
    if (parecidos.length > 1 && fila.equipo) {
      const e = norm(fila.equipo);
      const delEquipo = parecidos.filter(p => p.equipos.some(k => norm(k) === e || norm(k.split(" (")[0]) === e));
      if (delEquipo.length === 1) return delEquipo[0].nombre;
    }
    return null;
  }

  function cruzar() {
    const todos = jugadoresApp();
    const encontrados = new Set(), faltan = [];
    filas.forEach(f => {
      const nombre = buscar(f, todos);
      if (nombre) encontrados.add(nombre);
      else if (!faltan.some(x => norm(x.jugador) === norm(f.jugador))) faltan.push(f);
    });
    return { encontrados, faltan };
  }

  function abrir() {
    filas = [];
    color = "#ef4444";
    const input = document.getElementById("caMotivoInput");
    input.value = "NO PAGADO";
    input.style.color = color;
    const picker = document.getElementById("caColorPicker");
    picker.querySelectorAll(".color-circle").forEach(c => {
      c.classList.toggle("selected", c.dataset.color === color);
      c.onclick = () => {
        picker.querySelectorAll(".color-circle").forEach(x => x.classList.remove("selected"));
        c.classList.add("selected");
        color = c.dataset.color;
        input.style.color = color;
      };
    });
    document.getElementById("caBtnExcel").textContent = "📎 Adjuntar Excel";
    estado("Columnas: Nombre, Apellidos y Equipos.");
    document.getElementById("modalCargaAvisos").classList.add("active");
  }

  function cerrar() {
    document.getElementById("modalCargaAvisos").classList.remove("active");
    filas = [];
  }

  async function leerExcel(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    inputEl.value = "";
    if (!file) return;
    estado("Leyendo el Excel...");
    try {
      await window.impEnsureXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      filas = leerFilas(wb);
    } catch (e) {
      console.error(e);
      filas = [];
      estado("No se pudo leer el Excel. La primera vez hace falta conexión para descargar el lector de Excel.", "ca-mal");
      return;
    }
    document.getElementById("caBtnExcel").textContent = "📎 " + file.name;
    if (!filas.length) { estado("No he encontrado jugadores/as en el Excel (columnas Nombre y Apellidos).", "ca-mal"); return; }
    const { encontrados, faltan } = cruzar();
    estado(`${filas.length} en la lista · ${encontrados.size} en la app` + (faltan.length ? ` · ${faltan.length} no encontrados` : ""),
      faltan.length ? "" : "ca-ok");
  }

  async function guardar() {
    if (!filas.length) { nvaAviso("⚠️ Adjunta primero el Excel con la lista de jugadores/as."); return; }
    const motivo = document.getElementById("caMotivoInput").value.trim() || "NO PAGADO";

    mostrarCargando("Guardando avisos...");
    let encontrados, faltan;
    try {
      // Los avisos actuales se traen antes para no pisar los que haya puesto otra persona
      if (ghSettings.user && ghSettings.repo && navigator.onLine) {
        if (offlineQueue.length > 0) await processOfflineQueue();
        try { await fetchWarningsFromGitHub(); } catch (e) { console.warn(e); }
      }
      ({ encontrados, faltan } = cruzar());
      encontrados.forEach(n => { warningsData[n] = { reason: motivo, color }; });
      localStorage.setItem("NVA_WARNINGS_DATA", JSON.stringify(warningsData));
      // Un fichero de avisos por equipo, como al guardarlos a mano
      const claves = (appData.teams || []).map(getTeamKey).filter(k => getPlayersForTeamKey(k).some(n => encontrados.has(n)));
      for (const key of claves) {
        const delEquipo = {};
        getPlayersForTeamKey(key).forEach(n => { if (warningsData[n]) delEquipo[n] = warningsData[n]; });
        await writeGitHubFile(`${WARNINGS_FOLDER}/warning_${sanitizeFileName(key)}.json`, delEquipo, `Carga automática de avisos - ${key}`);
      }
    } finally {
      ocultarCargando();
    }
    cerrar();
    if (typeof refreshDireccionAccordion === "function") refreshDireccionAccordion();

    let txt = `${faltan.length ? "⚠️" : "✅"} Aviso «${motivo}» puesto a ${encontrados.size} jugador${encontrados.size === 1 ? "/a" : "es/as"}.`;
    if (faltan.length) {
      txt += `\n\nNo encontrados en la app (${faltan.length}):\n` +
        faltan.map(f => `• ${f.jugador}${f.equipo ? ` · ${f.equipo}` : ""}`).join("\n");
    }
    nvaAviso(txt, { titulo: "Carga automática" });
  }

  window.caAbrir = abrir;
  window.caCerrar = cerrar;
  window.caElegirExcel = () => document.getElementById("caExcelInput").click();
  window.caLeerExcel = leerExcel;
  window.caGuardar = guardar;
})();
