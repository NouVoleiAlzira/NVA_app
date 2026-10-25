/* =====================================================================
   Carteles · carga automática
   «Partidos de la semana» y «Resultados de la semana» se rellenan con los
   datos de «Calendario de partidos» (PDF de fvbcv.com ya leídos).
   Antes de abrir la página del cartel se muestra una ventana con los
   partidos para elegir cuáles se pasan. Los datos viajan a Partidos.html /
   Resultados.html por localStorage (NVA_CARTEL_AUTO).
   El marcador de los registros de partido se rellena al actualizar los
   PDF en «Calendario de partidos», no aquí.
   ===================================================================== */
(function () {
  "use strict";

  const AUTO_KEY = "NVA_CARTEL_AUTO";
  const esc = escapeHtml;
  // En los PDF el apóstrofo sale como coma: "L,ILLA" -> "L'ILLA"
  const apos = (t) => String(t || "").replace(/([A-Za-zÀ-ÿ]),(?=[A-Za-zÀ-ÿ])/g, "$1'");
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmtDay = (s) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const dayName = (s) => DIAS[new Date(s + "T12:00:00").getDay()];

  // Fin de semana anterior (o el actual si hoy es sábado o domingo) para los resultados
  function lastWeekend() {
    const d = new Date(); d.setHours(12, 0, 0, 0);
    const wd = d.getDay();   // 0 dom ... 6 sáb
    const sun = new Date(d);
    if (wd !== 0) sun.setDate(d.getDate() - wd + (wd === 6 ? 7 : 0));
    const sat = new Date(sun); sat.setDate(sun.getDate() - 1);
    return { from: iso(sat), to: iso(sun) };
  }

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

  // ---------- Ventana para elegir los partidos ----------
  function askMatches(tipo, range) {
    const results = tipo === "resultados";
    return new Promise((resolve) => {
      const o = document.createElement("div");
      o.className = "cp-modal";
      o.innerHTML = `<div class="cp-modal-box imp-box">
        <div class="cp-modal-title">${results ? "🏆 Resultados de la semana" : "📅 Partidos de la semana"}</div>
        <div class="ca-range">
          <label>Desde <input type="date" class="ca-from" value="${range.from}"></label>
          <label>Hasta <input type="date" class="ca-to" value="${range.to}"></label>
        </div>
        <div class="cp-modal-txt ca-info"></div>
        <div class="imp-list ca-list"></div>
        <div class="cp-modal-row">
          <button class="cp-modal-btn cp-modal-stop">Cancelar</button>
          <button class="cp-modal-btn cp-modal-main">${results ? "Pasar resultados" : "Pasar partidos"}</button>
        </div>
      </div>`;
      document.body.appendChild(o);
      let items = [];
      const list = o.querySelector(".ca-list"), info = o.querySelector(".ca-info");
      const fill = () => {
        const from = o.querySelector(".ca-from").value, to = o.querySelector(".ca-to").value;
        items = from && to ? collect(from, to, results) : [];
        const ok = items.filter(p => !results || p.res).length;
        info.innerHTML = items.length
          ? `${ok} partido${ok === 1 ? "" : "s"}${results && ok < items.length ? ` con resultado (${items.length - ok} todavía sin resultado)` : ""}. Marca los que quieras pasar al cartel.`
          : `No hay partidos de los equipos del club entre esas fechas en «Calendario de partidos».`;
        list.innerHTML = items.map((p, i) => {
          const local = p.home ? p.key : apos(p.rival), visit = p.home ? apos(p.rival) : p.key;
          const score = p.res ? ` <b class="ca-score">${p.res.setsL} - ${p.res.setsV}</b> ` : " vs ";
          const dis = results && !p.res;
          return `<label class="imp-item ca-item${dis ? " ca-off" : ""}"><input type="checkbox" data-i="${i}" ${dis ? "disabled" : "checked"}>
            <span><b>${dayName(p.fecha)} ${fmtDay(p.fecha)}${p.hora ? " · " + p.hora : ""}</b> ${p.home ? "🏠" : "✈️"}<br>${esc(local)}${score}${esc(visit)}${dis ? " <small>(sin resultado)</small>" : ""}${p.campo ? `<br><small>${esc(apos(p.campo))}</small>` : ""}</span></label>`;
        }).join("");
      };
      o.querySelector(".ca-from").onchange = fill;
      o.querySelector(".ca-to").onchange = fill;
      fill();
      const done = (v) => { o.remove(); resolve(v); };
      o.querySelector(".cp-modal-stop").onclick = () => done(null);
      o.querySelector(".cp-modal-main").onclick = () => {
        const sel = Array.from(list.querySelectorAll("input:checked")).map(c => items[+c.dataset.i]).filter(Boolean);
        if (!sel.length) { alert("Marca al menos un partido."); return; }
        done({ sel, from: o.querySelector(".ca-from").value, to: o.querySelector(".ca-to").value });
      };
    });
  }

  // ---------- Primero solo las fechas (sin leer nada todavía) ----------
  function askDates(tipo, range) {
    const results = tipo === "resultados";
    return new Promise((resolve) => {
      const o = document.createElement("div");
      o.className = "cp-modal";
      o.innerHTML = `<div class="cp-modal-box imp-box">
        <div class="cp-modal-title">${results ? "🏆 Resultados de la semana" : "📅 Partidos de la semana"}</div>
        <div class="cp-modal-txt">Elige las fechas. Después se cargan los datos${results ? " y las fotos" : ""}.</div>
        <div class="ca-range">
          <label>Desde <input type="date" class="ca-from" value="${range.from}"></label>
          <label>Hasta <input type="date" class="ca-to" value="${range.to}"></label>
        </div>
        <div class="cp-modal-row">
          <button class="cp-modal-btn cp-modal-stop">Cancelar</button>
          <button class="cp-modal-btn cp-modal-main">Cargar datos</button>
        </div>
      </div>`;
      document.body.appendChild(o);
      const done = (v) => { o.remove(); resolve(v); };
      o.querySelector(".cp-modal-stop").onclick = () => done(null);
      o.querySelector(".cp-modal-main").onclick = () => {
        const from = o.querySelector(".ca-from").value, to = o.querySelector(".ca-to").value;
        if (!from || !to) { alert("Elige las dos fechas."); return; }
        done(from <= to ? { from, to } : { from: to, to: from });
      };
    });
  }

  async function run(tipo) {
    const results = tipo === "resultados";
    const range0 = results ? lastWeekend() : ((window.cpGetRange && window.cpGetRange()) || {});
    if (!range0.from || !range0.to) { const w = lastWeekend(); range0.from = range0.from || w.from; range0.to = range0.to || w.to; }
    // Primero se eligen las fechas; luego se cargan los datos de partidos más recientes
    const range = await askDates(tipo, range0);
    if (!range) return;
    if (window.cpRefreshFromGitHub && typeof ghSettings !== "undefined" && ghSettings.token && navigator.onLine) {
      mostrarCargando("Cargando el calendario de partidos...");
      try { await window.cpRefreshFromGitHub(); } catch (e) { console.warn(e); }
      finally { ocultarCargando(); }
    }
    const ans = await askMatches(tipo, range);
    if (!ans) return;

    const datos = {
      tipo, creado: new Date().toISOString(), desde: ans.from, hasta: ans.to,
      partidos: ans.sel.map(p => ({ team: p.team, key: p.key, fecha: p.fecha, hora: p.hora, rival: p.rival, home: p.home, campo: p.campo,
        setsL: p.res ? p.res.setsL : null, setsV: p.res ? p.res.setsV : null }))
    };
    try { localStorage.setItem(AUTO_KEY, JSON.stringify(datos)); } catch (e) { alert("No se pudieron preparar los datos del cartel."); return; }
    location.href = (results ? "Resultados.html" : "Partidos.html") + "?auto=1";
  }

  window.cartelAuto = (tipo) => run(tipo).catch(e => { console.error(e); ocultarCargando(); alert("Error en la carga automática: " + e.message); });
})();
