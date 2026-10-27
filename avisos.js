// ===== Mensaje de aviso: entrenamientos y partidos sin registrar =====
// Dirección elige días (esta semana o la anterior); se revisa, para cada
// entrenador, qué entrenamientos (según Horarios.json) y partidos (según el
// calendario) de sus equipos no tienen registro. Los avisos se guardan en
// GitHub (Historial/avisos.json) y le salen a cada entrenador del equipo al
// abrir la app con su usuario (el usuario que se llama igual que el entrenador).
// Con «Aviso automático» marcado, además, a cada entrenador le sale al abrir la
// app lo que le falta por registrar de la semana anterior y de esta (sin hoy).
(function () {
  "use strict";
  const AV_FILE = "Historial/avisos.json";
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  function gh() { try { return typeof ghSettings !== "undefined" ? ghSettings : null; } catch (e) { return null; } }
  const esc = escapeHtml, b64dec = b64_to_utf8, b64enc = utf8_to_b64;   // de app.js
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function fmt(f) { const d = new Date(f + "T12:00:00"); return DIAS[(d.getDay() + 6) % 7] + " " + d.getDate() + "/" + (d.getMonth() + 1); }
  function sanit(n) { return typeof sanitizeFileName === "function" ? sanitizeFileName(n) : String(n || "general").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9_-]/g, "_"); }
  function coaches() { try { return (typeof appData !== "undefined" && appData.coaches) || []; } catch (e) { return []; } }
  function equiposDe(c) {
    try { if (typeof getCoachTeamEntries === "function") return getCoachTeamEntries(c); } catch (e) {}
    return (c.teams || []).map(t => ({ teamKey: t, name: t }));
  }
  // El entrenador de un usuario es el que se llama igual (los nombres de usuario no se repiten)
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function coachDeUsuario(p) {
    const n = norm(p && p.nombre);
    return n ? coaches().find(c => norm(c.name) === n) || null : null;
  }
  // Ids de los entrenadores que tienen usuario (solo quien gestiona usuarios puede verlos todos)
  let conUsuario = null;
  async function cargarConUsuario() {
    conUsuario = null;
    try {
      const sb = window.nva && window.nva.cliente;
      if (!sb) return;
      const { data, error } = await sb.from("perfiles").select("nombre,activo");
      if (error || !data || data.length < 2) return;
      conUsuario = new Set();
      data.filter(p => p.activo).forEach(p => { const c = coachDeUsuario(p); if (c) conUsuario.add(String(c.id)); });
    } catch (e) {}
  }

  // Entrenamientos y partidos anulados (anulaciones.js) no cuentan
  function anulE(team, date) { return !!(window.nvaEntrenoAnulado && window.nvaEntrenoAnulado(team, date)); }
  function anulP(team, date, rival) { return !!(window.nvaPartidoAnulado && window.nvaPartidoAnulado(team, date, rival)); }
  function url(g, path) { return `https://api.github.com/repos/${g.user}/${g.repo}/contents/${path}`; }

  // Devuelve el fichero JSON (o null si no existe)
  async function leer(g, path) {
    const r = await fetch(url(g, path), { headers: { Authorization: `token ${g.token}` }, cache: "no-store" });
    if (r.status === 404) return { sha: "", data: null };
    if (!r.ok) throw new Error("GET " + r.status);
    const j = await r.json();
    let data = null;
    if (j.content) { try { data = JSON.parse(b64dec(j.content)); } catch (e) {} }
    else if (j.download_url) { try { data = await (await fetch(j.download_url, { cache: "no-store" })).json(); } catch (e) {} }
    return { sha: j.sha, data };
  }

  // ¿Está registrado? Entrenamiento: existe el fichero. Partido: existe y tiene jugadores
  // (la carga automática de resultados crea ficheros de partido sin jugadores).
  async function registrado(g, it) {
    const path = it.tipo === "match" ? `Partidos/Partidos_${sanit(it.team)}_${it.date}.json` : `registros/Entrenamientos_${sanit(it.team)}_${it.date}.json`;
    const { data } = await leer(g, path);
    if (!data) return false;
    return it.tipo !== "match" || (Array.isArray(data.jugadores) && data.jugadores.length > 0);
  }
  async function enLotes(arr, fn, n) {
    const out = new Array(arr.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, arr.length) }, async () => { while (i < arr.length) { const k = i++; out[k] = await fn(arr[k]); } }));
    return out;
  }

  // Entrenamientos (según Horarios.json) y partidos (según el calendario) de
  // esos equipos esos días que no están registrados: { teamKey: [items] }
  async function sinRegistrar(g, equipos, fechas) {
    const hz = ((await leer(g, "Horarios.json")).data || {}).trainings || {};
    let cp = window.cpGetData ? window.cpGetData() : null;
    if (!cp || !cp.teams || !Object.keys(cp.teams).length) cp = (await leer(g, "CalendarioPartidos.json")).data || {};
    const teams = cp.teams || {};
    const porEquipo = {};
    const tareas = [];
    equipos.forEach(e => {
      if (porEquipo[e.teamKey]) return;
      const items = porEquipo[e.teamKey] = [];
      fechas.forEach(f => {
        const dow = (new Date(f + "T12:00:00").getDay() + 6) % 7 + 1;   // 1 = lunes
        const tr = (hz[e.teamKey] || []).filter(t => Number(t.day) === dow).sort((a, b) => a.start < b.start ? -1 : 1);
        if (tr.length && !anulE(e.teamKey, f)) items.push({ tipo: "train", team: e.teamKey, equipo: e.name, date: f, hora: tr[0].start });
        ((teams[e.teamKey] || {}).matches || []).filter(m => m.date === f && !/DESCANSA/i.test(m.rival || "") && !anulP(e.teamKey, f, m.rival || "")).forEach(m =>
          items.push({ tipo: "match", team: e.teamKey, equipo: e.name, date: f, hora: m.time && m.time !== "00:00" ? m.time : "", rival: m.rival || "" }));
      });
      tareas.push(...items);
    });
    const ok = await enLotes(tareas, it => registrado(g, it).catch(() => true), 6);
    const falta = new Set(tareas.filter((t, i) => !ok[i]));
    Object.keys(porEquipo).forEach(k => { porEquipo[k] = porEquipo[k].filter(it => falta.has(it)); });
    return porEquipo;
  }
  function ordenar(items) { return items.sort((a, b) => (a.date + a.hora) < (b.date + b.hora) ? -1 : 1); }

  // «Aviso automático»: se guarda en el mismo fichero que los avisos
  async function guardarAvisos(g, cambiar) {
    for (let intento = 0; intento < 3; intento++) {
      const { sha, data } = await leer(g, AV_FILE);
      const nuevo = { automatico: !!(data && data.automatico), avisos: (data && data.avisos) || {} };
      cambiar(nuevo);
      const body = { message: "Avisos de registros pendientes", content: b64enc(JSON.stringify(nuevo, null, 1)) };
      if (sha) body.sha = sha;
      const r = await fetch(url(g, AV_FILE), { method: "PUT", headers: { Authorization: `token ${g.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) return true;
      if (r.status !== 409 && r.status !== 422) return false;
    }
    return false;
  }

  async function cargarAutomatico() {
    const chk = document.getElementById("avAuto");
    chk.disabled = true;
    const g = gh();
    if (!navigator.onLine || !g || !g.user || !g.token) return;
    try { chk.checked = !!((await leer(g, AV_FILE)).data || {}).automatico; chk.disabled = false; } catch (e) {}
  }
  window.avAutomatico = async function (chk) {
    const g = gh(), valor = chk.checked;
    chk.disabled = true;
    let ok = false;
    try { ok = !!g && await guardarAvisos(g, d => { d.automatico = valor; }); } catch (e) {}
    chk.disabled = false;
    if (!ok) { chk.checked = !valor; alert("❌ No se pudo guardar el aviso automático. Inténtalo de nuevo."); }
  };

  // ---------- Ventana de Dirección ----------
  let semana = 0;              // 0 = esta semana, -1 = la anterior
  let resultado = null;        // { coachId: { nombre, items: [] } }
  function lunes(off) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * off); return d; }

  function pintarDias() {
    const l = lunes(semana), hoy = ymd(new Date());
    document.querySelectorAll(".av-sem").forEach(b => b.classList.toggle("on", Number(b.dataset.s) === semana));
    document.getElementById("avDias").innerHTML = DIAS.map((n, i) => {
      const d = new Date(l); d.setDate(l.getDate() + i);
      const f = ymd(d), fut = f > hoy;
      return `<label class="av-dia${fut ? " av-fut" : ""}"><input type="checkbox" value="${f}"${fut ? " disabled" : " checked"}><span>${n}<small>${d.getDate()}/${d.getMonth() + 1}</small></span></label>`;
    }).join("");
    document.getElementById("avRes").innerHTML = "";
    document.getElementById("avEnviar").hidden = true;
    resultado = null;
  }

  window.openAvisos = function () {
    semana = 0;
    document.getElementById("modalAvisos").classList.add("active");
    document.getElementById("avEstado").textContent = "";
    pintarDias();
    cargarAutomatico();
  };
  window.closeAvisos = function () { document.getElementById("modalAvisos").classList.remove("active"); };
  window.avSemana = function (s) { semana = s; pintarDias(); document.getElementById("avEstado").textContent = ""; };

  window.avRevisar = async function () {
    const est = document.getElementById("avEstado");
    const fechas = [...document.querySelectorAll("#avDias input:checked")].map(i => i.value);
    if (!fechas.length) { est.textContent = "Elige al menos un día."; return; }
    const g = gh();
    if (!navigator.onLine || !g || !g.user || !g.token) { est.textContent = "Hace falta conexión con GitHub."; return; }
    est.textContent = "Revisando registros…";
    document.getElementById("avRes").innerHTML = "";
    try {
      const porEquipo = await sinRegistrar(g, coaches().flatMap(equiposDe), fechas);
      resultado = {};
      coaches().forEach(c => {
        const items = [];
        equiposDe(c).forEach(e => items.push(...(porEquipo[e.teamKey] || [])));
        resultado[c.id] = { nombre: c.name, items: ordenar(items) };
      });
      await cargarConUsuario();
      pintarResultado();
      est.textContent = "";
    } catch (e) { est.textContent = "No se pudo revisar: " + e.message; }
  };

  function lineaItem(it) {
    return (it.tipo === "match" ? "🏐 Partido" : "🏃 Entrenamiento") + " · " + it.equipo + " · " + fmt(it.date) + (it.hora ? " " + it.hora : "") + (it.rival ? " vs " + it.rival : "");
  }

  function pintarResultado() {
    const ids = Object.keys(resultado);
    const con = ids.filter(id => resultado[id].items.length);
    let html = con.length ? "" : '<p class="hist-vacio">✅ Todos los entrenadores tienen registrado todo lo de esos días.</p>';
    con.forEach(id => {
      const r = resultado[id];
      html += `<div class="av-coach"><label class="av-coach-head"><input type="checkbox" data-id="${esc(id)}" checked> <b>${esc(r.nombre)}</b> · ${r.items.length} sin registrar${!conUsuario || conUsuario.has(String(id)) ? "" : ' <span class="av-sin">(sin usuario en la app)</span>'}</label><ul>${r.items.map(it => `<li>${esc(lineaItem(it))}</li>`).join("")}</ul></div>`;
    });
    const ok = ids.filter(id => !resultado[id].items.length).map(id => resultado[id].nombre);
    if (con.length && ok.length) html += `<p class="av-ok">✅ Al día: ${esc(ok.join(", "))}</p>`;
    document.getElementById("avRes").innerHTML = html;
    document.getElementById("avEnviar").hidden = !con.length;
  }

  window.avEnviar = async function () {
    const est = document.getElementById("avEstado");
    const g = gh();
    const sel = [...document.querySelectorAll("#avRes input[data-id]:checked")].map(i => i.dataset.id);
    if (!sel.length) { est.textContent = "No hay ningún entrenador marcado."; return; }
    est.textContent = "Enviando avisos…";
    document.getElementById("avEnviar").disabled = true;
    try {
      const creado = new Date().toISOString();
      if (await guardarAvisos(g, d => sel.forEach(id => { d.avisos[id] = { creado, nombre: resultado[id].nombre, items: resultado[id].items }; }))) {
        const nombresSel = sel.map(id => resultado[id].nombre).join(", ");
        est.textContent = "";
        document.getElementById("avEnviar").hidden = true;
        document.getElementById("avRes").innerHTML = `<div style="margin-top:10px;padding:14px;border-radius:10px;background:#dcfce7;color:#14532d;border:1px solid #86efac;text-align:center;font-size:1em;">✅ <b>Aviso enviado</b><br>Para: ${esc(nombresSel)}.<br>Les saldrá al abrir la app con su usuario.</div>`;
        document.getElementById("avRes").scrollIntoView({ block: "nearest" });
        alert("✅ Aviso enviado a: " + nombresSel);
        return;
      }
      est.textContent = "";
      alert("❌ No se pudo enviar el aviso. Inténtalo de nuevo.");
    } catch (e) { est.textContent = ""; alert("❌ No se pudo enviar el aviso: " + e.message); }
    finally { document.getElementById("avEnviar").disabled = false; }
  };

  // ---------- Al abrir la app: aviso al entrenador del usuario que ha entrado ----------
  async function comprobarAlAbrir() {
    try { if (sessionStorage.getItem("nvaAvisoVisto")) return; } catch (e) {}
    const g = gh();
    if (!navigator.onLine || !g || !g.user || !g.token) return;
    try {
      if (window.nva && window.nva.listo) await window.nva.listo;
      if (window.nvaRecargarAnulaciones) await window.nvaRecargarAnulaciones();
      const c = coachDeUsuario(window.nva && window.nva.perfil);
      if (!c) return;
      const { data } = await leer(g, AV_FILE);
      const av = data && data.avisos && data.avisos[c.id];
      let pend = [];
      if (av && (av.items || []).length) {
        const ok = await enLotes(av.items, it => registrado(g, it).catch(() => false), 6);
        pend = av.items.filter((it, i) => !ok[i] && !(it.tipo === "match" ? anulP(it.team, it.date, it.rival || "") : anulE(it.team, it.date)));
      }
      // Aviso automático: desde el lunes de la semana anterior hasta ayer
      if (data && data.automatico) {
        const fechas = [], d = lunes(-1), hoy = ymd(new Date());
        while (ymd(d) < hoy) { fechas.push(ymd(d)); d.setDate(d.getDate() + 1); }
        const porEquipo = await sinRegistrar(g, equiposDe(c), fechas);
        const clave = it => [it.tipo, it.team, it.date, it.rival || ""].join("|");
        const ya = new Set(pend.map(clave));
        Object.values(porEquipo).flat().forEach(it => { if (!ya.has(clave(it))) { ya.add(clave(it)); pend.push(it); } });
      }
      if (!pend.length) return;
      ordenar(pend);
      document.getElementById("avAvisoTxt").innerHTML =
        `<p><b>${esc(c.name || av.nombre || "")}</b>, no constan registrados:</p><ul>${pend.map(it => `<li>${esc(lineaItem(it))}</li>`).join("")}</ul><p>Por favor, regístralos lo antes posible. ¡Gracias!</p>`;
      document.getElementById("modalAvisoEntrenador").classList.add("active");
      try { sessionStorage.setItem("nvaAvisoVisto", "1"); } catch (e) {}
    } catch (e) {}
  }
  window.closeAvisoEntrenador = function () { document.getElementById("modalAvisoEntrenador").classList.remove("active"); };
  window.addEventListener("load", () => setTimeout(comprobarAlAbrir, 2500));
})();
