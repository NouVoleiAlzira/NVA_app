// ===== Página de delegados =====
// Página principal propia para los delegados de los equipos (rol Delegado).
// Se ve con el botón 🪪 de la cabecera, o directamente si el rol solo tiene
// esta página (nva-supabase.js decide qué página se muestra).
// Cada bloque tiene su permiso en Opciones › Permisos por rol › Página de
// delegados. Por ahora:
//   · Calendario de entrenamientos (delegados.calendario): el horario de la
//     semana de SUS equipos con los entrenamientos anulados rayados y su
//     motivo (Festivo, Alerta meteorológica…), y debajo la lista de los
//     entrenamientos y partidos anulados de la semana. Solo se ve: no se
//     puede tocar nada.
//   · Partidos (delegados.partidos): sección plegada; al abrirla, los
//     partidos de sus equipos por jornada (CalendarioPartidos.json):
//       1.ª línea: jornada · día y hora · campo
//       2.ª línea: equipo de casa · resultado («X - X» o «-») · visitante
//   · Clasificación (delegados.clasificacion): sección plegada; al abrirla,
//     la tabla de la liga de cada uno de sus equipos, leída del PDF de la
//     federación (Calendarios/<equipo>.pdf): Pos, Equipo, Pj, PG3, PG2,
//     PP1, PP0 y Ptos. Su equipo sale resaltado.
// Los equipos de cada delegado se asignan en Opciones › Entrenadores y
// equipos (configuracion.json → delegados[].teams). Quien no es delegado
// (p. ej. el propietario) ve todos los equipos.
(function () {
  "use strict";
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  const DIAS_SEM = DIAS.concat(["Sábado", "Domingo"]);
  let offset = 0;   // 0 = semana en curso
  const RELEER_MS = 2 * 60 * 1000;   // como mucho una lectura cada 2 minutos (Egress de Supabase)

  const norm = t => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();
  function datos() { try { return appData; } catch (e) { return null; } }   // de app.js

  // Claves de los equipos del delegado conectado; null = todos los equipos
  function misEquipos() {
    const d = datos(), perfil = window.nva && window.nva.perfil;
    if (!d || !perfil) return null;
    const lista = Array.isArray(d.delegados) ? d.delegados : [];
    const yo = lista.find(x => x.usuario && x.usuario === perfil.id)
      || lista.find(x => !x.usuario && norm(x.name) && norm(x.name) === norm(perfil.nombre));
    if (!yo) return perfil.rol === "delegado" ? [] : null;
    // Quien no es del rol Delegado y no tiene equipos marcados ve todos
    if (perfil.rol !== "delegado" && !(yo.teams || []).length) return null;
    const equipos = d.teams || [];
    const claves = new Set();
    (yo.teams || []).forEach(ref => {
      const t = equipos.find(x => getTeamKey(x) === ref) || equipos.find(x => x.name === ref);
      if (t) claves.add(getTeamKey(t));
    });
    return Array.from(claves);
  }

  function puedeVer(menu) {
    return !!(window.nva && window.nva.acceso && window.nva.acceso(menu) !== "ninguno");
  }

  function renderCalendario() {
    const canvas = document.getElementById("dlgCanvas");
    if (!canvas || !puedeVer("delegados.calendario")) return;
    const equipos = misEquipos();
    const sinEquipos = Array.isArray(equipos) && !equipos.length;
    const wrap = canvas.parentNode;
    wrap.hidden = sinEquipos;
    document.getElementById("dlgSinEquipos").hidden = !sinEquipos;
    const caja = document.getElementById("dlgAnulados");
    if (sinEquipos) { caja.innerHTML = ""; return; }

    const motivoDe = (key, f) => window.nvaMotivoEntreno ? window.nvaMotivoEntreno(key, f) : "";
    const etiqueta = m => m ? ` <span class="dlg-motivo">${escapeHtml(((window.nvaIcoMotivo && window.nvaIcoMotivo(m)) || "") + " " + m)}</span>` : "";
    const mon = wkMonday(offset);
    const dom = new Date(mon); dom.setDate(mon.getDate() + 6);
    const fecha = day => { const d = new Date(mon); d.setDate(mon.getDate() + day - 1); return wkFmt(d); };
    const finde = partidosFinde(equipos, fecha(6), fecha(7));
    dibujo = { hits: [], fecha };
    hzDrawSchedule(canvas, {
      hits: dibujo.hits,
      subtitle: `Semana del ${mon.getDate()} ${WK_MONTHS[mon.getMonth()]} al ${dom.getDate()} ${WK_MONTHS[dom.getMonth()]} ${dom.getFullYear()}`,
      dayLabels: [0, 1, 2, 3, 4, 5, 6].map(i => { const d = new Date(mon); d.setDate(mon.getDate() + i); return String(d.getDate()); }),
      soloEquipos: equipos || undefined,
      finde: finde.conHora,
      anulado: x => wkAnulado(x.key, fecha(x.day)),
      motivo: x => motivoDe(x.key, fecha(x.day)),
      diaAnulado: day => !!(window.nvaDiaAnulado && window.nvaDiaAnulado(fecha(day)))
    });

    // Lista de los entrenamientos anulados de la semana (además de las rayas)
    const anulados = hzBuildModel(equipos || undefined).sessions
      .filter(x => wkAnulado(x.key, fecha(x.day)))
      .sort((a, b) => a.day - b.day || a.s - b.s);
    // Partidos anulados de la semana (de lunes a domingo) de sus equipos
    const partidos = (window.nvaPartidosAnulados ? window.nvaPartidosAnulados(wkFmt(mon), wkFmt(dom)) : [])
      .filter(p => !equipos || equipos.indexOf(p.team) !== -1);
    // Partidos del fin de semana que aún no tienen hora (no caben en el dibujo)
    let html = finde.sinHora.length ? `<div class="dlg-anulados-tit">🕒 Partidos del fin de semana sin hora</div>` +
      finde.sinHora.map(p => `<div class="dlg-anulado"><b>${DIAS_SEM[p.day - 1]} ${new Date(fecha(p.day) + "T12:00:00").getDate()}</b> · ${escapeHtml(nombreEquipo(p.key))}${p.rival ? " · vs " + escapeHtml(p.rival) : ""} · hora por confirmar</div>`).join("") : "";
    if (!anulados.length && !partidos.length) {
      caja.innerHTML = html + `<p class="dlg-anulados-nada">✅ Esta semana no hay entrenamientos ni partidos anulados.</p>`;
      return;
    }
    if (anulados.length) html += `<div class="dlg-anulados-tit">🚫 Entrenamientos anulados esta semana</div>` +
      anulados.map(x => {
        const d = new Date(fecha(x.day) + "T12:00:00");
        const equipo = `${x.team.name} (${x.team.category})`;
        return `<div class="dlg-anulado"><b>${DIAS[x.day - 1]} ${d.getDate()}</b> · ${escapeHtml(equipo)} · ${hzM2T(x.s)}-${hzM2T(x.e)}${etiqueta(motivoDe(x.key, fecha(x.day)))}</div>`;
      }).join("");
    if (partidos.length) html += `<div class="dlg-anulados-tit">🚫 Partidos anulados esta semana</div>` +
      partidos.map(p => {
        const d = new Date(p.date + "T12:00:00");
        return `<div class="dlg-anulado"><b>${DIAS_SEM[(d.getDay() + 6) % 7]} ${d.getDate()}</b> · ${escapeHtml(p.team)}${p.rival ? " · vs " + escapeHtml(p.rival) : ""}${etiqueta(p.motivo)}</div>`;
      }).join("");
    caja.innerHTML = html;
  }

  // ---------- Tocar el calendario: tarjeta del entrenamiento o del partido ----------
  let dibujo = { hits: [], fecha: () => "" };   // lo que se pintó en el último dibujo
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const diaLargo = f => { const d = new Date(f + "T12:00:00"); return `${DIAS_SEM[(d.getDay() + 6) % 7]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };

  function tarjeta() {
    const c = document.createElement("div");
    c.className = "cp-ficha dlg-ficha";
    const fila = (cls, txt) => { const x = document.createElement("div"); x.className = cls; x.textContent = txt; c.appendChild(x); return x; };
    return { c, fila };
  }
  function cabecera(fila, izqTxt, derTxt) {
    const cab = fila("cp-ficha-cab", "");
    const izq = document.createElement("span"); izq.className = "cp-ficha-hora"; izq.textContent = izqTxt;
    const der = document.createElement("span"); der.className = "cp-ficha-ent"; der.textContent = derTxt || "";
    cab.append(izq, der);
  }
  function verEntreno(h) {
    const x = h.sesion, f = dibujo.fecha(x.day);
    const info = hzCourtInfo(x.courtId);
    const campo = info ? info.venue.name + (info.venue.courts.length > 1 ? " · " + info.court.name : "") : "";
    const { c, fila } = tarjeta();
    cabecera(fila, diaLargo(f), "Entrenamiento");
    fila("cp-ficha-eq dlg-ficha-equipo", nombreEquipo(x.key));
    fila("dlg-ficha-hora", `🕒 De ${hzM2T(x.s)} a ${hzM2T(x.e)}`);
    if (campo) fila("cp-ficha-campo", "📍 " + campo);
    if (wkAnulado(x.key, f)) {
      const mot = window.nvaMotivoEntreno ? window.nvaMotivoEntreno(x.key, f) : "";
      fila("cp-ficha-aviso dlg-ficha-anulado", "🚫 Anulado" + (mot ? " · " + (((window.nvaIcoMotivo && window.nvaIcoMotivo(mot)) || "") + " " + mot).trim() : ""));
    }
    nvaAviso("", { nodo: c });
  }
  function verPartido(h) {
    const p = h.partido, m = p.m || {};
    const L = window.nvaCalLectura || {};
    const nuestro = nombreEquipo(p.key), rival = p.rival || "?";
    const jor = jornadaDe(m);
    const { c, fila } = tarjeta();
    cabecera(fila, diaLargo(m.date) + (conHora(m) ? " · " + m.time : ""), jor ? "Jornada " + jor : "Partido");
    fila("cp-ficha-eq cp-ficha-local", p.casa ? nuestro : rival);
    const res = L.parseResult ? L.parseResult(m.raw) : null;
    fila("cp-ficha-vs", res ? `${res.setsL} - ${res.setsV}` : "VS");
    fila("cp-ficha-eq", p.casa ? rival : nuestro);
    if (res && res.sets && res.sets.length) fila("dlg-ficha-sets", res.sets.map((s, i) => `Set ${i + 1}: ${s.local}-${s.visitante}`).join(" · "));
    fila("cp-ficha-campo", "📍 " + p.campo + (p.casa === true ? " (local)" : p.casa === false ? " (visitante)" : ""));
    if (p.anulado) fila("cp-ficha-aviso dlg-ficha-anulado", "🚫 Anulado" + (p.motivo ? " · " + (((window.nvaIcoMotivo && window.nvaIcoMotivo(p.motivo)) || "") + " " + p.motivo).trim() : ""));
    nvaAviso("", { nodo: c });
  }
  (function () {
    const canvas = document.getElementById("dlgCanvas");
    if (!canvas) return;
    canvas.addEventListener("click", ev => {
      if (typeof nvaAviso !== "function") return;
      const r = canvas.getBoundingClientRect();
      const px = (ev.clientX - r.left) * canvas.width / r.width, py = (ev.clientY - r.top) * canvas.height / r.height;
      for (let i = dibujo.hits.length - 1; i >= 0; i--) {
        const h = dibujo.hits[i];
        if (!wkPointInPoly(px, py, h.pts)) continue;
        if (h.partido) verPartido(h); else if (h.sesion) verEntreno(h);
        return;
      }
    });
  })();

  // Partidos de sus equipos el sábado y el domingo de la semana mostrada
  const DURACION_PARTIDO = 120;   // min, como en el Calendario de partidos
  function partidosFinde(equipos, sab, domingo) {
    const cp = (window.cpGetData && window.cpGetData()) || { teams: {} };
    const L = window.nvaCalLectura || {};
    const mapa = {};
    (((datos() || {}).teams) || []).forEach(t => { mapa[getTeamKey(t)] = t; });
    const anulados = window.nvaPartidosAnulados ? window.nvaPartidosAnulados(sab, domingo) : [];
    const conHoraL = [], sinHora = [];
    Object.keys(cp.teams || {}).forEach(key => {
      if (equipos && equipos.indexOf(key) === -1) return;
      ((cp.teams[key] || {}).matches || []).forEach(m => {
        if ((m.date !== sab && m.date !== domingo) || /DESCANS/i.test(m.rival || "") || /\bDESCANSA\b/i.test(m.raw || "")) return;
        const mk = L.moveKey ? L.moveKey(key, m) : "";
        const casa = cp.homeOv && mk in cp.homeOv ? cp.homeOv[mk] : m.home !== false;
        const anul = anulados.find(p => p.team === key && p.date === m.date && (p.rival || "") === (m.rival || ""));
        const p = { day: m.date === sab ? 6 : 7, key, team: mapa[key], rival: m.rival || "", casa, m,
          campo: campoDe(m) || (casa ? "Local" : "Visitante"), anulado: !!anul, motivo: anul ? anul.motivo || "" : "" };
        if (!conHora(m)) { sinHora.push(p); return; }
        p.s = hzT2M(m.time); p.e = p.s + DURACION_PARTIDO;
        conHoraL.push(p);
      });
    });
    sinHora.sort((a, b) => a.day - b.day);
    return { conHora: conHoraL, sinHora };
  }

  // ---------- Partidos por jornada ----------
  const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const pad = n => String(n).padStart(2, "0");
  // Jornada: la del PDF o el número de la primera columna de la fila (como calendario-partidos.js)
  const jornadaDe = m => String(m.jornada || (((m.raw || "").match(/^\s*(\d{1,2})\s+\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/) || [])[1] || ""));
  const campoDe = m => String(m.venue || "").replace(/([A-Za-zÀ-ÿ]),(?=[A-Za-zÀ-ÿ])/g, "$1'").trim();
  const conHora = m => !!m.time && m.time !== "00:00";
  function nombreEquipo(key) {
    const t = ((datos() || {}).teams || []).find(x => getTeamKey(x) === key);
    return t ? `${t.name} (${t.category})` : key;
  }

  function renderPartidos() {
    const caja = document.getElementById("dlgPartidos");
    const body = document.getElementById("secBody_dlgpar");
    if (!caja || !body || body.classList.contains("collapsed") || !puedeVer("delegados.partidos")) return;
    const equipos = misEquipos();
    if (Array.isArray(equipos) && !equipos.length) {
      caja.innerHTML = `<p class="dlg-vacio">Todavía no tienes equipos asignados. Pídelo en el club (Opciones › Entrenadores y equipos).</p>`;
      return;
    }
    const cp = (window.cpGetData && window.cpGetData()) || { teams: {} };
    const L = window.nvaCalLectura || {};
    const orden = ((datos() || {}).teams || []).map(getTeamKey);
    const claves = Object.keys(cp.teams || {})
      .filter(k => !equipos || equipos.indexOf(k) !== -1)
      .sort((a, b) => (orden.indexOf(a) + 1 || 999) - (orden.indexOf(b) + 1 || 999) || a.localeCompare(b));
    const anuladoDe = (key, m) => (window.nvaPartidosAnulados ? window.nvaPartidosAnulados(m.date, m.date) : [])
      .find(p => p.team === key && (p.rival || "") === (m.rival || ""));

    let html = "";
    claves.forEach(key => {
      const lista = ((cp.teams[key] || {}).matches || [])
        .filter(m => m.date && !/DESCANS/i.test(m.rival || "") && !/\bDESCANSA\b/i.test(m.raw || ""))
        .sort((a, b) => (parseInt(jornadaDe(a), 10) || 999) - (parseInt(jornadaDe(b), 10) || 999)
          || (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
      if (!lista.length) return;
      if (claves.length > 1 || !equipos) html += `<div class="dlg-par-equipo">${escapeHtml(nombreEquipo(key))}</div>`;
      html += lista.map(m => {
        const mk = L.moveKey ? L.moveKey(key, m) : "";
        const enCasa = cp.homeOv && mk in cp.homeOv ? cp.homeOv[mk] : m.home !== false;
        const nuestro = nombreEquipo(key), rival = m.rival || "?";
        const res = L.parseResult ? L.parseResult(m.raw) : null;
        const d = new Date(m.date + "T12:00:00");
        const dia = `${DIAS_CORTO[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
        const jor = jornadaDe(m);
        const campo = campoDe(m) || (enCasa ? "Local" : "Visitante");
        const anul = anuladoDe(key, m);
        const lado = (txt, nva, cls) => `<span class="${cls}${nva ? " nva" : ""}">${escapeHtml(txt)}</span>`;
        return `<div class="dlg-par${anul ? " anulado" : ""}">
          <div class="dlg-par-l1"><b>${jor ? "Jornada " + escapeHtml(jor) : "Jornada —"}</b><span>${escapeHtml(dia)}${conHora(m) ? " · " + escapeHtml(m.time) : " · hora por confirmar"}</span><span>📍 ${escapeHtml(campo)}</span></div>
          <div class="dlg-par-l2">${lado(enCasa ? nuestro : rival, enCasa, "loc")}${res && res.sets && res.sets.length
            ? `<button type="button" class="dlg-par-res jugado" data-k="${escapeHtml(key + "|" + m.date + "|" + rival)}" aria-expanded="${setsAbiertos.has(key + "|" + m.date + "|" + rival)}" title="Ver los sets" onclick="dlgVerSets(this)">${res.setsL} - ${res.setsV}</button>`
            : `<span class="dlg-par-res${res ? " jugado" : ""}">${res ? `${res.setsL} - ${res.setsV}` : "-"}</span>`}${lado(enCasa ? rival : nuestro, !enCasa, "vis")}</div>
          ${res && res.sets && res.sets.length ? `<div class="dlg-par-sets"${setsAbiertos.has(key + "|" + m.date + "|" + rival) ? "" : " hidden"}>${res.sets.map((x, i) => `<span><small>Set ${i + 1}</small><b>${x.local} - ${x.visitante}</b></span>`).join("")}</div>` : ""}
          ${anul ? `<span class="dlg-motivo">🚫 Anulado${anul.motivo ? " · " + escapeHtml(((window.nvaIcoMotivo && window.nvaIcoMotivo(anul.motivo)) || "") + " " + anul.motivo) : ""}</span>` : ""}
        </div>`;
      }).join("");
    });
    caja.innerHTML = html || `<p class="dlg-vacio">Todavía no hay partidos de ${equipos && equipos.length === 1 ? "tu equipo" : "tus equipos"}. Salen cuando el club sube el calendario de la federación.</p>`;
  }

  // ---------- Clasificación ----------
  const clasif = {};   // clave del equipo -> { d, cuando } o { error }
  let leyendo = false;
  // siHaceMs: se vuelve a leer el PDF de un equipo ya leído solo si la lectura es más antigua que eso
  async function cargarClasificaciones(claves, siHaceMs) {
    if (leyendo || !window.nvaCuadrante || !window.nvaCuadrante.leerEquipo) return;
    leyendo = true;
    try {
      for (const key of claves) {
        if (clasif[key] && !(siHaceMs && Date.now() - clasif[key].cuando >= siHaceMs)) continue;
        try { clasif[key] = { d: await window.nvaCuadrante.leerEquipo(key), cuando: Date.now() }; }
        catch (e) { clasif[key] = { error: e && e.message || String(e), cuando: Date.now() }; }
        renderClasificacion();
      }
    } finally { leyendo = false; renderClasificacion(); }
  }
  function equiposClasif() {
    const equipos = misEquipos();
    const orden = ((datos() || {}).teams || []).map(getTeamKey);
    return (equipos || orden).slice().sort((a, b) => (orden.indexOf(a) + 1 || 999) - (orden.indexOf(b) + 1 || 999));
  }
  function renderClasificacion() {
    const caja = document.getElementById("dlgClasificacion");
    const body = document.getElementById("secBody_dlgcla");
    if (!caja || !body || body.classList.contains("collapsed") || !puedeVer("delegados.clasificacion")) return;
    const claves = equiposClasif();
    if (!claves.length) {
      caja.innerHTML = `<p class="dlg-vacio">Todavía no tienes equipos asignados. Pídelo en el club (Opciones › Entrenadores y equipos).</p>`;
      return;
    }
    const COLS = [["pj", "Pj"], ["pg3", "PG3"], ["pg2", "PG2"], ["pp1", "PP1"], ["pp0", "PP0"], ["pts", "Ptos"]];
    caja.innerHTML = claves.map(key => {
      const c = clasif[key];
      let cuerpo;
      if (!c) cuerpo = `<p class="dlg-vacio">Cargando la clasificación…</p>`;
      else if (c.error) cuerpo = `<p class="dlg-vacio">No hay clasificación de este equipo todavía (${escapeHtml(/no hay PDF/i.test(c.error) ? "el club aún no ha subido su calendario de la federación" : c.error)}).</p>`;
      else {
        const filas = c.d.clasificacion.filter(f => f.nombre !== "DESCANSA");
        cuerpo = !filas.length ? `<p class="dlg-vacio">El PDF de la federación aún no trae la clasificación.</p>` :
          `${c.d.titulo ? `<div class="dlg-cla-liga">${escapeHtml(c.d.titulo)}</div>` : ""}
          <div class="dlg-cla-wrap"><table class="dlg-cla">
            <thead><tr><th>Pos.</th><th class="eq">Equipo</th>${COLS.map(([, t]) => `<th>${t}</th>`).join("")}</tr></thead>
            <tbody>${filas.map(f => `<tr${f.nombre === c.d.propio ? ` class="propio"` : ""}><td class="pos">${f.pos}</td><td class="eq">${escapeHtml(f.nombre)}</td>${COLS.map(([k]) => `<td${k === "pts" ? ` class="pts"` : ""}>${f[k] != null && !isNaN(f[k]) ? f[k] : "-"}</td>`).join("")}</tr>`).join("")}</tbody>
          </table></div>
          ${c.d.impreso ? `<div class="dlg-cla-fecha">Datos de fvbcv.com del ${escapeHtml(c.d.impreso)}</div>` : ""}`;
      }
      return `<div class="dlg-cla-bloque">${claves.length > 1 || !misEquipos() ? `<div class="dlg-par-equipo">${escapeHtml(nombreEquipo(key))}</div>` : ""}${cuerpo}</div>`;
    }).join("");
    if (claves.some(k => !clasif[k])) cargarClasificaciones(claves);
  }

  const setsAbiertos = new Set();
  // Tocar el resultado despliega (o pliega) el resultado de cada set
  window.dlgVerSets = function (btn) {
    const sets = btn.closest(".dlg-par").querySelector(".dlg-par-sets");
    if (!sets) return;
    sets.hidden = !sets.hidden;
    if (sets.hidden) setsAbiertos.delete(btn.dataset.k); else setsAbiertos.add(btn.dataset.k);   // se mantiene al repintar
    btn.setAttribute("aria-expanded", sets.hidden ? "false" : "true");
  };

  // Secciones plegables propias (empiezan plegadas); se recuerda en cada dispositivo
  const PLEGADO = "NVA_DLG_SECCIONES";
  function estado() { try { return JSON.parse(localStorage.getItem(PLEGADO)) || {}; } catch (e) { return {}; } }
  function aplicar(id, abierta) {
    const head = document.getElementById("secHead_" + id), body = document.getElementById("secBody_" + id);
    if (!head || !body) return;
    head.classList.toggle("collapsed", !abierta);
    body.classList.toggle("collapsed", !abierta);
    head.setAttribute("aria-expanded", abierta ? "true" : "false");
  }
  window.dlgToggleSeccion = function (id) {
    const st = estado();
    st[id] = !st[id];
    try { localStorage.setItem(PLEGADO, JSON.stringify(st)); } catch (e) {}
    aplicar(id, st[id]);
    if (id === "dlgcla" && st[id]) { renderClasificacion(); cargarClasificaciones(equiposClasif(), RELEER_MS); }
    if (id === "dlgpar" && st[id]) {
      renderPartidos();
      // Al abrir se traen los partidos y resultados más recientes (si la última lectura tiene más de 2 min)
      if (window.cpRefreshFromGitHub && navigator.onLine) Promise.resolve(window.cpRefreshFromGitHub(RELEER_MS)).catch(() => {});
    }
  };
  aplicar("dlgpar", !!estado().dlgpar);
  aplicar("dlgcla", !!estado().dlgcla);

  // El calendario de partidos ya se lee al arrancar y al volver a la app: cuando llega, se repinta
  document.addEventListener("nva-partidos", () => {
    if (!document.documentElement.classList.contains("modo-delegados")) return;
    renderCalendario(); renderPartidos();
  });
  window.renderDelegados = function () {
    if (!document.documentElement.classList.contains("modo-delegados")) return;
    renderCalendario();
    renderPartidos();
    renderClasificacion();
  };
  window.dlgMove = function (delta) { offset += delta; renderCalendario(); };
})();
