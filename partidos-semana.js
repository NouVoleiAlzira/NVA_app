/* =====================================================================
   Partidos de la semana
   Partidos de los equipos del club entre dos fechas, sacados de
   «Calendario de partidos» (PDF de fvbcv.com ya leídos). Los usa
   Redes Sociales › Stories (historia-semana.js).
   El marcador de los registros de partido se rellena al actualizar los
   PDF en «Calendario de partidos», no aquí.
   ===================================================================== */
(function () {
  "use strict";

  function teamsByKey() {
    const map = {};
    ((typeof appData !== "undefined" && appData.teams) || []).forEach(t => { map[getTeamKey(t)] = t; });
    return map;
  }

  // Partidos de los equipos del club entre dos fechas (con el cambio local/visitante aplicado)
  function collect(from, to, results) {
    const cp = (window.cpGetData && window.cpGetData()) || {};
    const teams = teamsByKey(), out = [];
    Object.entries(cp.teams || {}).forEach(([key, info]) => {
      const team = teams[key];
      if (!team) return;
      (info.matches || []).forEach(m => {
        if (!m.date || m.date < from || m.date > to) return;
        const mk = [key, m.date, m.rival, m.jornada].join("|");
        const home = cp.homeOv && mk in cp.homeOv ? cp.homeOv[mk] : m.home !== false;
        const res = results && window.cpParseResult ? window.cpParseResult(m.raw) : null;
        out.push({ key, team: { name: team.name, category: team.category }, fecha: m.date, hora: m.time && m.time !== "00:00" ? m.time : "",
          rival: m.rival || "", home, campo: m.venue || "", res });
      });
    });
    // Partido entre dos equipos del club: una sola entrada (la del equipo local)
    const norm = (x) => normalizeTeamName(x);
    const deDos = out.filter(p => !(!p.home && out.some(q => q !== p && q.home && q.fecha === p.fecha && q.hora === p.hora &&
      norm(q.rival) === norm(p.team.name) && norm(p.rival) === norm(q.team.name))));
    return deDos.sort((a, b) => (a.fecha + (a.hora || "99")).localeCompare(b.fecha + (b.hora || "99")) || a.key.localeCompare(b.key));
  }

  window.partidosSemana = (from, to, results) => collect(from, to, results);
})();
