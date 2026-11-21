// ===== Anulaciones: entrenamientos y partidos que no se celebraron =====
// «Deselección entrenamientos»: modo del calendario semanal; tocar un
// entrenamiento o la cabecera de un día lo marca como anulado (rayas
// diagonales) y deja de contar en los avisos de registros.
// «Deselección partidos»: ventana para anular partidos sin registro.
// «Deselección equipos»: ventana para marcar equipos que no tienen que
// registrar sus entrenamientos (salen con un icono amarillo y no generan aviso).
// Al pulsar «Deselección entrenamientos» o «Deselección partidos» se pide el
// motivo (MOTIVOS); se guarda con cada anulación y lo ven los delegados.
// Se guarda en GitHub (Historial/anulaciones.json) para todos; cada cambio
// sale en el Historial de cambios con la opción de deshacerlo.
(function () {
  "use strict";
  const FILE = "Historial/anulaciones.json";
  const LS = "NVA_ANULACIONES";
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const MOTIVOS = [
    { valor: "Alerta meteorológica", texto: "Alerta meteorológica", ico: "🌧️" },
    { valor: "Instalación NO disponible", texto: "Instalación NO disponible", ico: "🚧" },
    { valor: "Festivo", texto: "Festivo", ico: "📅" },
    { valor: "Motivos sanitarios", texto: "Motivos sanitarios", ico: "🩺" },
    { valor: "Otros eventos", texto: "Otros eventos", ico: "🏆" }
  ];
  window.nvaMotivosAnulacion = MOTIVOS;
  const icoMotivo = m => { const x = MOTIVOS.find(o => o.valor === m); return x ? x.ico : ""; };
  window.nvaIcoMotivo = icoMotivo;
  function elegirMotivo(que, actual) {
    return nvaElegir("¿Por qué se " + que + "?", MOTIVOS, { titulo: "🚫 Motivo de la deselección", actual });
  }
  const conMotivo = m => m ? " (" + m + ")" : "";

  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function gh() { try { return typeof ghSettings !== "undefined" ? ghSettings : null; } catch (e) { return null; } }
  const esc = escapeHtml, b64dec = b64_to_utf8, b64enc = utf8_to_b64;   // de app.js
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function fmt(f) { const d = new Date(f + "T12:00:00"); return DIAS[(d.getDay() + 6) % 7] + " " + d.getDate() + "/" + (d.getMonth() + 1); }
  function vacio() { return { entrenos: {}, dias: {}, partidos: {}, equipos: {}, deshechos: [] }; }
  function norm(d) { d = Object.assign(vacio(), d || {}); ["entrenos", "dias", "partidos", "equipos"].forEach(k => { if (typeof d[k] !== "object" || !d[k]) d[k] = {}; }); if (!Array.isArray(d.deshechos)) d.deshechos = []; return d; }

  let datos = norm(lsGet(LS, null));
  const pkey = (team, date, rival) => team + "|" + date + "|" + (rival || "");

  window.nvaEntrenoAnulado = (team, date) => !!(datos.entrenos[team + "|" + date] || datos.dias[date]);
  window.nvaDiaAnulado = date => !!datos.dias[date];
  window.nvaPartidoAnulado = (team, date, rival) => !!datos.partidos[pkey(team, date, rival)];
  window.nvaEquipoDeselec = team => !!datos.equipos[team];
  window.nvaAccionDeshecha = id => datos.deshechos.indexOf(id) !== -1;
  // Motivo de un entrenamiento anulado (el suyo o el del día entero); "" si no tiene
  window.nvaMotivoEntreno = (team, date) => {
    const e = datos.entrenos[team + "|" + date], d = datos.dias[date];
    return (e && e.motivo) || (d && d.motivo) || "";
  };
  // Partidos anulados entre dos fechas (aaaa-mm-dd), con su motivo
  window.nvaPartidosAnulados = (desde, hasta) => Object.keys(datos.partidos).map(k => {
    const [team, date, rival] = k.split("|");
    return { team, date, rival: rival || "", motivo: datos.partidos[k].motivo || "" };
  }).filter(p => p.date >= desde && p.date <= hasta).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  function redibujar() {
    try { if (typeof renderWeekCalendar === "function") renderWeekCalendar(); } catch (e) {}
    try { if (window.renderDelegados) window.renderDelegados(); } catch (e) {}
  }

  // ---------- GitHub ----------
  function url(g) { return `https://api.github.com/repos/${g.user}/${g.repo}/contents/${FILE}`; }
  async function leer(g) {
    const r = await fetch(url(g), { headers: { Authorization: `token ${g.token}` }, cache: "no-store" });
    if (r.status === 404) return { sha: "", data: vacio() };
    if (!r.ok) throw new Error("GET " + r.status);
    const j = await r.json();
    let data = vacio();
    try { data = norm(JSON.parse(b64dec(j.content))); } catch (e) {}
    return { sha: j.sha, data };
  }
  // Aplica un cambio sobre la versión más reciente de GitHub (o solo en local si no hay conexión)
  let cola = Promise.resolve();
  function cambiar(fn, mensaje) {
    fn(datos); lsSet(LS, datos); redibujar();
    cola = cola.then(async () => {
      const g = gh();
      if (!navigator.onLine || !g || !g.user || !g.token) return;
      for (let i = 0; i < 3; i++) {
        const { sha, data } = await leer(g);
        fn(data);
        const body = { message: mensaje, content: b64enc(JSON.stringify(data, null, 1)) };
        if (sha) body.sha = sha;
        const r = await fetch(url(g), { method: "PUT", headers: { Authorization: `token ${g.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (r.ok) { datos = data; lsSet(LS, datos); redibujar(); return; }
        if (r.status !== 409 && r.status !== 422) return;
      }
    }).catch(() => {});
    return cola;
  }
  async function cargar() {
    const g = gh();
    if (!navigator.onLine || !g || !g.user || !g.token) return;
    try { datos = (await leer(g)).data; lsSet(LS, datos); redibujar(); } catch (e) {}
  }
  window.nvaRecargarAnulaciones = cargar;

  function quien(motivo) {
    const q = { t: new Date().toISOString(), usuario: window.nvaUsuario ? window.nvaUsuario() : "" };
    if (motivo) q.motivo = motivo;
    return q;
  }
  function anotar(texto, deshacer) { if (window.nvaRegistrar) window.nvaRegistrar("anulacion", texto, { deshacer }); }
  function nombreEquipo(k) { return k; }

  // ---------- Entrenamientos (calendario semanal) ----------
  let modo = false, motivoEntrenos = "";
  window.nvaModoAnular = () => modo;
  window.nvaToggleEntreno = function (team, date) {
    const k = team + "|" + date;
    if (datos.dias[date] && !datos.entrenos[k]) { alert("Todo el " + fmt(date) + " está anulado. Toca la cabecera del día para reactivarlo."); return; }
    const anular = !datos.entrenos[k];
    const motivo = anular ? motivoEntrenos : (datos.entrenos[k].motivo || "");
    aplicar({ tipo: "entreno", team, date, anular, motivo });
    anotar((anular ? "🚫 Entrenamiento anulado" + conMotivo(motivo) + ": " : "↩ Entrenamiento reactivado: ") + nombreEquipo(team) + " · " + fmt(date), { tipo: "entreno", team, date, anular: !anular, motivo });
  };
  window.nvaToggleDia = function (date) {
    const anular = !datos.dias[date];
    const motivo = anular ? motivoEntrenos : (datos.dias[date].motivo || "");
    aplicar({ tipo: "dia", date, anular, motivo });
    anotar((anular ? "🚫 Día anulado (todos los entrenamientos)" + conMotivo(motivo) + ": " : "↩ Día reactivado: ") + fmt(date), { tipo: "dia", date, anular: !anular, motivo });
  };
  function aplicar(op) {
    const q = quien(op.anular ? op.motivo : "");
    const fn = d => {
      if (op.tipo === "entreno") { const k = op.team + "|" + op.date; if (op.anular) d.entrenos[k] = q; else delete d.entrenos[k]; }
      else if (op.tipo === "dia") { if (op.anular) d.dias[op.date] = q; else delete d.dias[op.date]; }
      else if (op.tipo === "equipo") { if (op.anular) d.equipos[op.team] = q; else delete d.equipos[op.team]; }
      else if (op.tipo === "partido") { const k = pkey(op.team, op.date, op.rival); if (op.anular) d.partidos[k] = Object.assign({ equipo: op.equipo || op.team }, q); else delete d.partidos[k]; }
    };
    return cambiar(fn, "Anulaciones de registros");
  }

  function pintarMotivoEntrenos() {
    const el = document.getElementById("anulMotivo");
    if (el) el.textContent = icoMotivo(motivoEntrenos) + " " + motivoEntrenos;
  }
  window.nvaCambiarMotivoEntrenos = async function () {
    const m = await elegirMotivo("deseleccionan estos entrenamientos", motivoEntrenos);
    if (m) { motivoEntrenos = m; pintarMotivoEntrenos(); }
  };
  window.nvaDeselEntrenos = async function () {
    if (!modo) {
      const m = await elegirMotivo("deseleccionan estos entrenamientos");
      if (!m) return;
      motivoEntrenos = m; pintarMotivoEntrenos();
    }
    modo = !modo;
    document.getElementById("anulBarra").hidden = !modo;
    const btn = document.getElementById("btnDeselEntrenos");
    if (btn) btn.classList.toggle("anul-on", modo);
    if (modo) {
      try { if (typeof applySectionState === "function") applySectionState("wk", true); } catch (e) {}
      const c = document.getElementById("secHead_wk") || document.getElementById("wkCanvas");
      if (c) c.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // ---------- Deshacer desde el Historial ----------
  window.nvaDeshacer = async function (e) {
    const op = e && e.extra && e.extra.deshacer;
    if (!op || window.nvaAccionDeshecha(e.id)) return;
    if (!await nvaConfirmar("¿Deshacer este cambio?\n\n" + e.texto)) return;
    cambiar(d => { if (d.deshechos.indexOf(e.id) === -1) d.deshechos.push(e.id); }, "Deshacer anulación");
    aplicar(op);
    anotar("↩ Deshecho: " + e.texto, null);
  };

  // ---------- Partidos ----------
  let semana = 0, motivoPartidos = "";
  function lunes(off) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * off); return d; }
  function partidosSemana() {
    const l = lunes(semana), dom = new Date(l); dom.setDate(l.getDate() + 6);
    const a = ymd(l), b = ymd(dom);
    const cp = window.cpGetData ? window.cpGetData() : null;
    const out = [];
    Object.keys((cp && cp.teams) || {}).forEach(team => ((cp.teams[team] || {}).matches || []).forEach(m => {
      if (m.date >= a && m.date <= b && !/DESCANSA/i.test(m.rival || "")) out.push({ team, date: m.date, hora: m.time && m.time !== "00:00" ? m.time : "", rival: m.rival || "" });
    }));
    return out.sort((x, y) => (x.date + x.hora) < (y.date + y.hora) ? -1 : 1);
  }
  function registrado(p) {
    try { return window.nvaPartidoRegistrado(p.team, p.date, window.nvaNumPartidoCalendario(p.team, p.date, p.hora, p.rival)); } catch (e) { return false; }
  }
  function pintarPartidos() {
    document.querySelectorAll(".anul-sem").forEach(b => b.classList.toggle("on", Number(b.dataset.s) === semana));
    const l = lunes(semana), dom = new Date(l); dom.setDate(l.getDate() + 6);
    document.getElementById("anulSemTxt").textContent = "Del " + l.getDate() + "/" + (l.getMonth() + 1) + " al " + dom.getDate() + "/" + (dom.getMonth() + 1);
    const mp = document.getElementById("anulMotivoPartidos");
    if (mp) mp.textContent = icoMotivo(motivoPartidos) + " " + motivoPartidos;
    const lista = partidosSemana();
    const box = document.getElementById("anulPartidos");
    if (!lista.length) { box.innerHTML = '<p class="hist-vacio">No hay partidos en el calendario esta semana.</p>'; return; }
    box.innerHTML = lista.map((p, i) => {
      const reg = registrado(p), an = window.nvaPartidoAnulado(p.team, p.date, p.rival);
      const mot = an ? (datos.partidos[pkey(p.team, p.date, p.rival)].motivo || "") : "";
      return `<label class="anul-part${an ? " anul-si" : ""}${reg ? " anul-reg" : ""}"><input type="checkbox" data-i="${i}"${an ? " checked" : ""}${reg && !an ? " disabled" : ""}>
        <span><b>${esc(p.team)}</b><br>${esc(fmt(p.date))}${p.hora ? " " + esc(p.hora) : ""} · vs ${esc(p.rival)}${reg ? ' <em>✓ registrado</em>' : ""}${an ? ' <em class="anul-tag">ANULADO</em>' : ""}${mot ? ' <span class="anul-motivo">' + esc(icoMotivo(mot) + " " + mot) + "</span>" : ""}</span></label>`;
    }).join("");
    box.querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
      const p = lista[Number(inp.dataset.i)], anular = inp.checked;
      const previo = datos.partidos[pkey(p.team, p.date, p.rival)];
      const motivo = anular ? motivoPartidos : ((previo && previo.motivo) || "");
      aplicar({ tipo: "partido", team: p.team, date: p.date, rival: p.rival, anular, motivo });
      anotar((anular ? "🚫 Partido anulado" + conMotivo(motivo) + ": " : "↩ Partido reactivado: ") + p.team + " · " + fmt(p.date) + " vs " + p.rival, { tipo: "partido", team: p.team, date: p.date, rival: p.rival, anular: !anular, motivo });
      pintarPartidos();
    }));
  }
  window.openDeselPartidos = async function () {
    const m = await elegirMotivo("deseleccionan estos partidos");
    if (!m) return;
    motivoPartidos = m; semana = 0;
    document.getElementById("modalDeselPartidos").classList.add("active"); pintarPartidos();
  };
  window.anulCambiarMotivoPartidos = async function () {
    const m = await elegirMotivo("deseleccionan estos partidos", motivoPartidos);
    if (m) { motivoPartidos = m; pintarPartidos(); }
  };
  window.closeDeselPartidos = function () { document.getElementById("modalDeselPartidos").classList.remove("active"); };
  window.anulSemana = function (s) { semana = s; pintarPartidos(); };

  // ---------- Equipos ----------
  function equipos() {
    try { return (appData.teams || []).map(t => getTeamKey(t)).filter(Boolean).sort((a, b) => a.localeCompare(b, "es")); } catch (e) { return []; }
  }
  function pintarEquipos() {
    const lista = equipos();
    const box = document.getElementById("deselEquipos");
    if (!lista.length) { box.innerHTML = '<p class="hist-vacio">No hay equipos.</p>'; return; }
    box.innerHTML = lista.map((t, i) => {
      const des = window.nvaEquipoDeselec(t);
      return `<label class="anul-part${des ? " anul-si" : ""}"><input type="checkbox" data-i="${i}"${des ? " checked" : ""}>
        <span><b>${esc(t)}</b>${des ? ' <em class="anul-tag">DESELECCIONADO</em>' : ""}</span></label>`;
    }).join("");
    box.querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
      const team = lista[Number(inp.dataset.i)], anular = inp.checked;
      aplicar({ tipo: "equipo", team, anular });
      anotar((anular ? "🚫 Equipo deseleccionado: " : "↩ Equipo seleccionado de nuevo: ") + team, { tipo: "equipo", team, anular: !anular });
      pintarEquipos();
    }));
  }
  window.openDeselEquipos = function () { document.getElementById("modalDeselEquipos").classList.add("active"); pintarEquipos(); };
  window.closeDeselEquipos = function () { document.getElementById("modalDeselEquipos").classList.remove("active"); };

  window.addEventListener("load", () => setTimeout(cargar, 800));
})();
