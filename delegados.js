// ===== Página de delegados =====
// Página principal propia para los delegados de los equipos (rol Delegado).
// Se ve con el botón 🪪 de la cabecera, o directamente si el rol solo tiene
// esta página (nva-supabase.js decide qué página se muestra).
// Cada bloque tiene su permiso en Opciones › Permisos por rol › Página de
// delegados. Por ahora:
//   · Calendario de entrenamientos (delegados.calendario): el horario de la
//     semana de SUS equipos con los entrenamientos anulados rayados. Solo se
//     ve: no se puede tocar nada.
// Los equipos de cada delegado se asignan en Opciones › Entrenadores y
// equipos (configuracion.json → delegados[].teams). Quien no es delegado
// (p. ej. el propietario) ve todos los equipos.
(function () {
  "use strict";
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
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

    const mon = wkMonday(offset);
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
    const fecha = day => { const d = new Date(mon); d.setDate(mon.getDate() + day - 1); return wkFmt(d); };
    hzDrawSchedule(canvas, {
      subtitle: `Semana del ${mon.getDate()} ${WK_MONTHS[mon.getMonth()]} al ${fri.getDate()} ${WK_MONTHS[fri.getMonth()]} ${fri.getFullYear()}`,
      dayLabels: [0, 1, 2, 3, 4].map(i => { const d = new Date(mon); d.setDate(mon.getDate() + i); return String(d.getDate()); }),
      soloEquipos: equipos || undefined,
      anulado: x => wkAnulado(x.key, fecha(x.day)),
      diaAnulado: day => !!(window.nvaDiaAnulado && window.nvaDiaAnulado(fecha(day)))
    });

    // Lista de los entrenamientos anulados de la semana (además de las rayas)
    const anulados = hzBuildModel(equipos || undefined).sessions
      .filter(x => wkAnulado(x.key, fecha(x.day)))
      .sort((a, b) => a.day - b.day || a.s - b.s);
    if (!anulados.length) {
      caja.innerHTML = `<p class="dlg-anulados-nada">✅ Esta semana no hay entrenamientos anulados.</p>`;
      return;
    }
    caja.innerHTML = `<div class="dlg-anulados-tit">🚫 Entrenamientos anulados esta semana</div>` +
      anulados.map(x => {
        const d = new Date(fecha(x.day) + "T12:00:00");
        const equipo = `${x.team.name} (${x.team.category})`;
        return `<div class="dlg-anulado"><b>${DIAS[x.day - 1]} ${d.getDate()}</b> · ${escapeHtml(equipo)} · ${hzM2T(x.s)}-${hzM2T(x.e)}</div>`;
      }).join("");
  }

  window.renderDelegados = function () {
    if (!document.documentElement.classList.contains("modo-delegados")) return;
    renderCalendario();
  };
  window.dlgMove = function (delta) { offset += delta; renderCalendario(); };
})();
