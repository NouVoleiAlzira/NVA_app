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

  window.renderDelegados = function () {
    if (!document.documentElement.classList.contains("modo-delegados")) return;
    renderCalendario();
  };
  window.dlgMove = function (delta) { offset += delta; renderCalendario(); };
})();
