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
// Los equipos de cada delegado se asignan en Opciones › Entrenadores y
// equipos (configuracion.json → delegados[].teams). Quien no es delegado
// (p. ej. el propietario) ve todos los equipos.
(function () {
  "use strict";
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  const DIAS_SEM = DIAS.concat(["Sábado", "Domingo"]);
  let offset = 0;   // 0 = semana en curso

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
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
    const fecha = day => { const d = new Date(mon); d.setDate(mon.getDate() + day - 1); return wkFmt(d); };
    hzDrawSchedule(canvas, {
      subtitle: `Semana del ${mon.getDate()} ${WK_MONTHS[mon.getMonth()]} al ${fri.getDate()} ${WK_MONTHS[fri.getMonth()]} ${fri.getFullYear()}`,
      dayLabels: [0, 1, 2, 3, 4].map(i => { const d = new Date(mon); d.setDate(mon.getDate() + i); return String(d.getDate()); }),
      soloEquipos: equipos || undefined,
      anulado: x => wkAnulado(x.key, fecha(x.day)),
      motivo: x => motivoDe(x.key, fecha(x.day)),
      diaAnulado: day => !!(window.nvaDiaAnulado && window.nvaDiaAnulado(fecha(day)))
    });

    // Lista de los entrenamientos anulados de la semana (además de las rayas)
    const anulados = hzBuildModel(equipos || undefined).sessions
      .filter(x => wkAnulado(x.key, fecha(x.day)))
      .sort((a, b) => a.day - b.day || a.s - b.s);
    // Partidos anulados de la semana (de lunes a domingo) de sus equipos
    const dom = new Date(mon); dom.setDate(mon.getDate() + 6);
    const partidos = (window.nvaPartidosAnulados ? window.nvaPartidosAnulados(wkFmt(mon), wkFmt(dom)) : [])
      .filter(p => !equipos || equipos.indexOf(p.team) !== -1);
    if (!anulados.length && !partidos.length) {
      caja.innerHTML = `<p class="dlg-anulados-nada">✅ Esta semana no hay entrenamientos ni partidos anulados.</p>`;
      return;
    }
    let html = "";
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
          <div class="dlg-par-l2">${lado(enCasa ? nuestro : rival, enCasa, "loc")}<span class="dlg-par-res${res ? " jugado" : ""}">${res ? `${res.setsL} - ${res.setsV}` : "-"}</span>${lado(enCasa ? rival : nuestro, !enCasa, "vis")}</div>
          ${anul ? `<span class="dlg-motivo">🚫 Anulado${anul.motivo ? " · " + escapeHtml(((window.nvaIcoMotivo && window.nvaIcoMotivo(anul.motivo)) || "") + " " + anul.motivo) : ""}</span>` : ""}
        </div>`;
      }).join("");
    });
    caja.innerHTML = html || `<p class="dlg-vacio">Todavía no hay partidos de ${equipos && equipos.length === 1 ? "tu equipo" : "tus equipos"}. Salen cuando el club sube el calendario de la federación.</p>`;
  }

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
    if (id === "dlgpar" && st[id]) {
      renderPartidos();
      // Al abrir se traen los partidos y resultados más recientes
      if (window.cpRefreshFromGitHub && navigator.onLine) Promise.resolve(window.cpRefreshFromGitHub()).then(renderPartidos).catch(() => {});
    }
  };
  aplicar("dlgpar", !!estado().dlgpar);
  // Si se dejó abierta, al entrar también se traen los partidos más recientes
  if (estado().dlgpar && window.nva && window.nva.listo) window.nva.listo.then(() => setTimeout(() => {
    if (window.cpRefreshFromGitHub && navigator.onLine) Promise.resolve(window.cpRefreshFromGitHub()).then(renderPartidos).catch(() => {});
  }, 0));

  window.renderDelegados = function () {
    if (!document.documentElement.classList.contains("modo-delegados")) return;
    renderCalendario();
    renderPartidos();
  };
  window.dlgMove = function (delta) { offset += delta; renderCalendario(); };
})();
