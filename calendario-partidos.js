// =====================================================================
//  CALENDARIO DE PARTIDOS (sección plegable al final de la pantalla principal)
//  - Cada equipo puede subir el PDF de calendario de la federación.
//  - El PDF se lee en el propio dispositivo (pdf.js, el mismo que usa app.js),
//    se busca el equipo y se extraen sus partidos (fecha, hora, rival, campo).
//  - Se guarda en local y en GitHub (CalendarioPartidos.json) para todos.
//  Usa funciones de app.js: ensurePdfJs, normalizeTeamName, getTeamKey,
//  writeGitHubFile, b64_to_utf8, escapeHtml, mostrarCargando, ocultarCargando.
// =====================================================================
(function () {
  const L = window.nvaCalLectura;   // lectura de los PDF, compartida con la actualización programada
  const CP_FILE = "CalendarioPartidos.json";
  const CP_LOCAL = "NVA_CALENDARIO_PARTIDOS";
  const CP_OPEN = "NVA_SEC_CAL_OPEN";
  let cp = loadLocal();
  setTimeout(() => { if (revisarEstadosCambios()) { saveLocal(); render(); } }, 0);

  function loadLocal() {
    try { const d = JSON.parse(localStorage.getItem(CP_LOCAL)); if (d && d.teams) return d; } catch (e) {}
    return { teams: {}, updated: "" };
  }
  function saveLocal() { try { localStorage.setItem(CP_LOCAL, JSON.stringify(cp)); } catch (e) { console.warn(e); } }
  const esc = escapeHtml;
  const pad = (n) => String(n).padStart(2, "0");
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDay = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
  const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  // ---------- Sección plegable (empieza plegada) ----------
  function setOpen(open) {
    const head = document.getElementById("secHead_cal");
    const body = document.getElementById("secBody_cal");
    if (!head || !body) return;
    head.classList.toggle("collapsed", !open);
    body.classList.toggle("collapsed", !open);
    head.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) render();
  }
  window.cpToggleSection = function () {
    const open = document.getElementById("secBody_cal").classList.contains("collapsed");
    try { localStorage.setItem(CP_OPEN, open ? "1" : "0"); } catch (e) {}
    setOpen(open);
  };
  window.cpSectionKey = function (ev) {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); window.cpToggleSection(); }
  };

  // ---------- Rango de fechas con el calendario nativo del dispositivo ----------
  const shortDay = (iso) => { const d = new Date(iso + "T12:00:00"); return `${DIAS[d.getDay()]} ${fmtDay(iso).slice(0, 5)}`; };
  function updateRangeLabel() {
    const f = document.getElementById("cpFrom").value, t = document.getElementById("cpTo").value;
    document.getElementById("cpFromLabel").textContent = f ? shortDay(f) : "--";
    document.getElementById("cpToLabel").textContent = t ? shortDay(t) : "--";
    document.getElementById("cpTo").min = f || "";
  }
  function onFromChange() {
    const from = document.getElementById("cpFrom"), to = document.getElementById("cpTo");
    if (!from.value) return;
    if (!to.value || to.value < from.value) { // fin por defecto: 6 días después
      const d = new Date(from.value + "T12:00:00"); d.setDate(d.getDate() + 6); to.value = isoDay(d);
    }
    updateRangeLabel(); renderMatches();
    // Tras elegir el inicio se abre directamente el calendario del fin (si el navegador lo permite)
    setTimeout(() => { try { if (to.showPicker) to.showPicker(); } catch (e) {} }, 150);
  }
  function onToChange() {
    const from = document.getElementById("cpFrom"), to = document.getElementById("cpTo");
    if (to.value && from.value && to.value < from.value) { const x = from.value; from.value = to.value; to.value = x; }
    updateRangeLabel(); renderMatches();
  }

  // ---------- Pintado ----------
  function render() { renderMatches(); renderTeams(); renderProg(); }

  // =====================================================================
  //  PLANIFICACIÓN: línea temporal, avisos y encaje de partidos sin hora
  //  Premisas en casa (Palau): una franja por fin de semana (sáb/dom mañana/tarde),
  //  2 pistas, infantil/cadete preferiblemente por la mañana, juvenil/senior nunca
  //  sábado por la mañana, y un entrenador no puede tener 2 partidos a la vez (2 h).
  // =====================================================================
  const DUR = 120;                 // duración de un partido (min)
  const SEG = 4;                   // px que se solapan los partidos de un bloque alevín (diagonal)
  const TARDE = 15 * 60;           // a partir de las 15:00 es «tarde»
  const PISTAS = 2;
  const FRANJA_TXT = { "6M": "sábado mañana", "6T": "sábado tarde", "0M": "domingo mañana", "0T": "domingo tarde" };
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const toHHMM = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
  const dow = (iso) => new Date(iso + "T12:00:00").getDay();
  const hasTime = (m) => !!m.time && m.time !== "00:00";
  const isRest = (m) => /DESCANS/i.test(m.rival || "") || /\bDESCANSA\b/i.test(m.raw || "");
  const moveKey = L.moveKey;

  function teamObj(key) { return ((typeof appData !== "undefined" && appData.teams) || []).find(t => getTeamKey(t) === key); }
  function teamGroup(key) {   // "base" = infantil/cadete (y menores), "mayor" = juvenil/senior
    const t = teamObj(key);
    const c = normalizeTeamName((t && t.category) || key);
    if (/JUVENIL|SENIOR|SENIO|ABSOLUT/.test(c)) return "mayor";
    if (/INFANTIL|CADETE|CADET|ALEVIN|BENJAMIN|ESCOLA/.test(c)) return "base";
    return "";
  }
  function teamCoaches(key) {
    const coaches = (typeof appData !== "undefined" && appData.coaches) || [];
    return coaches.filter(c => (c.teams || []).some(ref => {
      if (ref === key) return true;
      const t = ((appData && appData.teams) || []).find(x => getTeamKey(x) === ref || x.name === ref);
      return !!t && getTeamKey(t) === key;
    })).map(c => c.name);
  }
  // Local/visitante: manda el cambio hecho a mano; si no, el pabellón del PDF (un equipo puede
  // salir como local y jugar en otro campo); solo si no hay pabellón, el orden de los equipos.
  const isHome = (m) => m.forced ? m.home === true : (m.venue ? /PALAU/i.test(m.venue) : m.home === true);
  // Alevines: un día al mes, varios partidos seguidos en un mismo pabellón (local o visitante da igual).
  // No ocupan la franja del Palau ni siguen sus premisas; solo cuenta que un entrenador no esté en dos sitios.
  const isAlevin = (key) => { const t = teamObj(key); return /ALEVIN/.test(normalizeTeamName((t && t.category) || key)); };
  const enPalau = (m) => isHome(m) && !m.alevin;
  const placeOf = (m) => isHome(m) ? "Palau" : (m.forced || !m.venue ? `campo de ${m.rival || "rival"}` : m.venue);
  const isWeekend = (iso) => { const d = dow(iso); return d === 6 || d === 0; };
  const franja = (m) => isWeekend(m.date) ? `${dow(m.date)}${m.start < TARDE ? "M" : "T"}` : "";
  function weekendKey(iso) { const d = new Date(iso + "T12:00:00"); if (d.getDay() === 0) d.setDate(d.getDate() - 1); return isoDay(d); }
  const overlap = (a, b) => a.date === b.date && a.start < b.start + DUR && b.start < a.start + DUR;
  const short = (key) => { const t = teamObj(key); return t ? `${t.name} ${String(t.category || "").slice(0, 3)}.` : key; };

  // Avisos de un conjunto de partidos (con .start en minutos). Devuelve [{level, text, ids:[...] }]
  function checkRules(ms) {
    const out = [];
    const add = (level, text, list) => out.push({ level, text, ids: list.map(m => m.id) });
    const home = ms.filter(enPalau);
    // 1. Una sola franja por fin de semana
    const byWk = {};
    home.filter(m => isWeekend(m.date)).forEach(m => { (byWk[weekendKey(m.date)] = byWk[weekendKey(m.date)] || []).push(m); });
    Object.keys(byWk).forEach(wk => {
      const cnt = {};
      byWk[wk].forEach(m => { const f = franja(m); cnt[f] = (cnt[f] || 0) + 1; });
      const fr = Object.keys(cnt);
      if (fr.length > 1) {
        const main = fr.sort((a, b) => cnt[b] - cnt[a])[0];
        add("alta", `Fin de semana ${fmtDay(wk).slice(0, 5)}: se usan ${fr.length} franjas en el Palau (${fr.map(f => FRANJA_TXT[f]).join(", ")}). Solo se puede pedir una.`, byWk[wk].filter(m => franja(m) !== main));
      }
    });
    // 2. Máximo 2 pistas a la vez
    const seenCourt = new Set();
    home.forEach(m => {
      const at = home.filter(o => o.date === m.date && o.start <= m.start && m.start < o.start + DUR);
      if (at.length > PISTAS) {
        const k = at.map(o => o.id).sort().join(",");
        if (!seenCourt.has(k)) { seenCourt.add(k); add("alta", `${fmtDay(m.date).slice(0, 5)} ${toHHMM(m.start)}: ${at.length} partidos a la vez en el Palau y solo hay ${PISTAS} pistas.`, at); }
      }
    });
    home.forEach(m => {
      if (!isWeekend(m.date)) return;
      const g = teamGroup(m.team), f = franja(m);
      // 3. Infantil y cadete, preferiblemente por la mañana
      if (g === "base" && f.endsWith("T")) add("media", `${short(m.team)} juega en casa por la tarde (${FRANJA_TXT[f]}); infantil y cadete preferiblemente por la mañana.`, [m]);
      // 4. Juvenil y senior, nunca sábado por la mañana
      if (g === "mayor" && f === "6M") add("alta", `${short(m.team)} juega en casa el sábado por la mañana; juvenil y senior no pueden.`, [m]);
    });
    // 5 y aviso 2. Mismo entrenador: no puede jugar a la vez (2 h) y, si son campos distintos,
    //    necesita al menos 2 h entre el final de uno y el inicio del otro.
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i], b = ms[j];
      if (a.team === b.team || a.date !== b.date) continue;
      const common = a.coaches.filter(c => b.coaches.includes(c));
      if (!common.length) continue;
      const [p, q] = a.start <= b.start ? [a, b] : [b, a];
      const gap = q.start - (p.start + DUR);          // minutos entre el fin del 1º y el inicio del 2º
      const lugares = placeOf(a) !== placeOf(b);
      const who = `${common.join(", ")}: ${short(p.team)} (${toHHMM(p.start)}, ${placeOf(p)}) y ${short(q.team)} (${toHHMM(q.start)}, ${placeOf(q)})`;
      if (gap < 0) add("alta", `${who} se solapan${lugares ? " y en lugares distintos" : ""}.`, [a, b]);
      else if (lugares && gap < DUR) add("alta", `${who}: en campos distintos solo hay ${Math.floor(gap / 60)}h${pad(gap % 60)} entre el fin de uno y el inicio del otro (mínimo 2h).`, [a, b]);
    }
    return out;
  }
  const cost = (warns) => warns.reduce((s, w) => s + (w.level === "alta" ? 10 : 3), 0);

  // Encaja los partidos sin hora en la mejor hora posible (voraz: primero los más restringidos)
  function planMatches(all) {
    const fixed = all.filter(m => hasTime(m)).map(m => Object.assign(m, { start: toMin(m.time), placed: false }));
    // Partidos movidos a mano en la línea temporal (propuestos o confirmados): se respetan tal cual
    const moved = (cp.moved || {});
    fixed.forEach(m => { if (moved[m.mk]) Object.assign(m, { date: moved[m.mk].date, start: moved[m.mk].start, moved: true }); });
    all.filter(m => !hasTime(m) && moved[m.mk]).forEach(m => { Object.assign(m, { date: moved[m.mk].date, start: moved[m.mk].start, placed: true, moved: true }); fixed.push(m); });
    const free = all.filter(m => !hasTime(m) && !moved[m.mk]);
    free.sort((a, b) => (enPalau(b) - enPalau(a)) || ((teamGroup(b.team) === "mayor") - (teamGroup(a.team) === "mayor")) || a.date.localeCompare(b.date));
    const placed = fixed.slice();
    free.forEach(m => {
      const wk = isWeekend(m.date);
      const cands = [];
      for (let t = wk ? 9 * 60 : 17 * 60; t <= 20 * 60; t += 30) cands.push(t);
      let best = null, bestCost = Infinity;
      cands.forEach(t => {
        const trial = Object.assign({}, m, { start: t });
        const sameDay = placed.filter(o => o.date === m.date || (enPalau(trial) && wk && weekendKey(o.date) === weekendKey(m.date)));
        let c = cost(checkRules(sameDay.concat([trial]))) * 100;
        const g = teamGroup(m.team);
        if (wk && g === "base" && !m.alevin && t >= TARDE) c += 50;                    // preferencia de mañana
        if (wk && g === "mayor" && t < TARDE && dow(m.date) === 6) c += 50;
        // En casa: pegarse a los partidos ya fijados (bloques seguidos en las pistas)
        const homeSame = placed.filter(o => enPalau(o) && o.date === m.date);
        if (enPalau(m) && homeSame.length) c += Math.min(...homeSame.map(o => Math.abs(o.start - t))) / 60;
        else c += Math.abs(t - (wk ? (g === "mayor" ? 17 * 60 : 10 * 60) : 19 * 60)) / 600;  // horas habituales
        if (c < bestCost) { bestCost = c; best = t; }
      });
      m.start = best; m.placed = true;
      placed.push(m);
    });
    return placed;
  }

  // ---------- Subsecciones plegables ----------
  const SUB_KEY = "NVA_CP_SUBS";
  function subState() { try { return JSON.parse(localStorage.getItem(SUB_KEY)) || {}; } catch (e) { return {}; } }
  window.cpToggleSub = function (id) {
    const st = subState();
    const body = document.getElementById("cpSub_" + id);
    const open = body.classList.contains("collapsed");
    st[id] = open;
    try { localStorage.setItem(SUB_KEY, JSON.stringify(st)); } catch (e) {}
    applySub(id, open);
    if (open && id === "teams") renderTeams();
    if (open && id === "prog") { renderProg(); loadProg(); }
  };
  function applySub(id, open) {
    const head = document.getElementById("cpSubHead_" + id), body = document.getElementById("cpSub_" + id);
    if (!head || !body) return;
    head.classList.toggle("collapsed", !open); body.classList.toggle("collapsed", !open);
    head.setAttribute("aria-expanded", open ? "true" : "false");
  }
  function initSubs() {
    const st = subState();
    const def = { tl: true, warn: true, list: false, teams: false, prog: false };
    Object.keys(def).forEach(id => applySub(id, st[id] === undefined ? def[id] : st[id]));
  }

  // ---------- Pintado de partidos, línea temporal y avisos ----------
  function renderMatches() {
    const list = document.getElementById("cpMatches");
    if (!list) return;
    const from = document.getElementById("cpFrom").value;
    const to = document.getElementById("cpTo").value;
    // Se planifica con fines de semana completos aunque el rango los corte
    const fromWk = from ? weekendKey(from) : "", toWk = to ? (() => { const d = new Date(to + "T12:00:00"); d.setDate(d.getDate() + 1); return isoDay(d); })() : "";
    const all = [];
    let n = 0;
    Object.keys(cp.teams).forEach(key => {
      const coaches = teamCoaches(key), alevin = isAlevin(key);
      (cp.teams[key].matches || []).forEach(m => {
        if (isRest(m)) return;   // «DESCANSA» = no hay partido
        const mk = moveKey(key, m);
        const ov = (cp.homeOv || {})[mk];   // campo cambiado a mano (local/visitante)
        const extra = ov === undefined ? {} : { home: ov, forced: true };
        if ((!fromWk || m.date >= fromWk) && (!toWk || m.date <= toWk)) all.push(Object.assign({}, m, { id: "m" + (n++), mk, team: key, coaches, alevin }, extra));
      });
    });
    const planned = planMatches(all);
    const warns = checkRules(planned);
    const rows = planned.filter(m => (!from || m.date >= from) && (!to || m.date <= to))
      .sort((a, b) => (a.date + toHHMM(a.start)).localeCompare(b.date + toHHMM(b.start)));
    lastProposals = rows.filter(m => m.placed && !m.moved);
    lastConfirmed = rows.filter(m => hasTime(m) && !m.moved);   // fecha y hora oficiales, sin mover
    const ids = new Set(rows.map(m => m.id));
    const shownWarns = warns.filter(w => w.ids.some(i => ids.has(i)));
    const warnOf = {};
    shownWarns.forEach(w => w.ids.forEach(i => { (warnOf[i] = warnOf[i] || []).push(w); }));

    const tl = document.getElementById("cpTimeline"), wb = document.getElementById("cpWarnings");
    const wc = document.getElementById("cpWarnCount"), lc = document.getElementById("cpListCount");
    if (lc) lc.textContent = rows.length ? `(${rows.length})` : "";
    if (wc) { wc.textContent = shownWarns.length ? `(${shownWarns.length})` : ""; wc.className = shownWarns.length ? "cp-badge-warn" : ""; }

    if (!rows.length) {
      const any = Object.keys(cp.teams).length;
      const msg = `<div class="cp-empty">${any ? "No hay partidos en esas fechas." : "Aún no hay calendarios. Abre «Equipos» y sube el PDF de partidos de cada equipo."}</div>`;
      list.innerHTML = msg; if (tl) tl.innerHTML = msg; if (wb) wb.innerHTML = `<div class="cp-empty">Sin avisos.</div>`;
      return;
    }

    // --- Lista ---
    let html = "", lastDay = "";
    rows.forEach(m => {
      if (m.date !== lastDay) { lastDay = m.date; html += `<div class="cp-day">${DIAS[dow(m.date)]} ${fmtDay(m.date)}</div>`; }
      const vs = isHome(m) ? `<b>${esc(m.team)}</b> vs ${esc(m.rival || "?")}` : `${esc(m.rival || "?")} vs <b>${esc(m.team)}</b>`;
      const w = warnOf[m.id];
      html += `<div class="cp-match${m.placed ? " cp-placed" : ""}${w ? " cp-has-warn" : ""}">
        <div class="cp-time">${m.placed ? "≈" : ""}${toHHMM(m.start)}</div>
        <div class="cp-info">
          <div class="cp-vs">${vs}${w ? ' <span class="cp-warn-ico" title="Tiene avisos">⚠️</span>' : ""}</div>
          <div class="cp-meta">${isHome(m) ? "🏠 Local" : "🚌 Visitante"}${m.forced ? " (cambiado)" : ""}${m.venue && !m.forced ? " · " + esc(m.venue) : ""}${m.jornada ? " · J" + esc(m.jornada) : ""}${m.coaches.length ? " · " + esc(m.coaches.join(", ")) : ""}</div>
          ${m.placed ? '<div class="cp-meta cp-placed-note">Sin hora oficial: hora propuesta</div>' : ""}
        </div>
        <button type="button" class="cp-swap" data-mk="${esc(m.mk)}" data-home="${isHome(m) ? "0" : "1"}" onclick="cpSwapHome(this)" title="Cambiar campo">${isHome(m) ? "🚌 Pasar a visitante" : "🏠 Pasar a local"}</button>
        </div>`;
    });
    list.innerHTML = html;

    // --- Línea temporal: una fila por día con partidos ---
    if (tl) {
      let minH = 9, maxH = 21;
      rows.forEach(m => { minH = Math.min(minH, Math.floor(m.start / 60)); maxH = Math.max(maxH, Math.ceil((m.start + DUR) / 60)); });
      const span = (maxH - minH) * 60;
      const pct = (min) => ((min - minH * 60) / span * 100).toFixed(2) + "%";
      let ticks = "";
      for (let h = minH; h <= maxH; h += 2) ticks += `<span class="cp-tl-tick" style="left:${pct(h * 60)}">${h}h</span>`;
      const tardeBg = TARDE > minH * 60 && TARDE < maxH * 60 ? `<div class="cp-tl-tarde" style="left:${pct(TARDE)}"></div>` : "";
      let t = `<div class="cp-tl-axis"><div class="cp-tl-label"></div><div class="cp-tl-ticks">${ticks}</div></div>`;
      const days = [];
      if (from && to) { const d = new Date(from + "T12:00:00"); while (isoDay(d) <= to && days.length < 92) { days.push(isoDay(d)); d.setDate(d.getDate() + 1); } }
      rows.forEach(m => { if (!days.includes(m.date)) days.push(m.date); });
      days.sort();
      days.forEach(day => {
        const dm = rows.filter(m => m.date === day).sort((a, b) => a.start - b.start);
        // Grupos: cada partido por separado, salvo los de un mismo equipo alevín, que van juntos en un único bloque
        const grupos = [];
        dm.forEach(m => {
          const g = m.alevin && grupos.find(x => x.alevin === m.team);
          if (g) { g.ms.push(m); g.end = Math.max(g.end, m.start + DUR); }
          else grupos.push({ alevin: m.alevin ? m.team : "", ms: [m], start: m.start, end: m.start + DUR });
        });
        const lanes = [];   // carriles para que no se monten los bloques
        grupos.forEach(g => { let l = lanes.findIndex(end => end <= g.start); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = g.end; g.ms.forEach(m => { m.lane = l; }); });
        // Bloque alevín: cada partido llega hasta el inicio del siguiente, separados por una diagonal
        grupos.filter(g => g.alevin).forEach(g => g.ms.forEach((m, i) => {
          const nx = g.ms[i + 1];
          m.seg = { end: nx ? nx.start : m.start + DUR, first: i === 0, last: !nx };
        }));
        const fr = isWeekend(day) ? [...new Set(dm.filter(enPalau).map(m => franja(m).endsWith("M") ? "mañana" : "tarde"))] : [];
        t += `<div class="cp-tl-row${dm.length ? "" : " empty"}" data-day="${day}"><div class="cp-tl-label"><b>${DIAS[dow(day)]}</b>${fmtDay(day).slice(0, 5)}${fr.length ? `<small>🏠 ${fr.join(" + ")}</small>` : ""}</div>
          <div class="cp-tl-track" style="height:${Math.max(1, lanes.length) * 34 + 4}px">${tardeBg}`;
        dm.forEach(m => {
          const w = warnOf[m.id];
          const cls = ["cp-tl-blk", m.alevin ? "alevin" : isHome(m) ? "home" : "away", m.seg ? "seg" + (m.seg.first ? "" : " seg-l") + (m.seg.last ? "" : " seg-r") : "", m.placed ? "placed" : "", m.moved ? "moved" : "", w ? "warn" : ""].join(" ");
          const tip = `${toHHMM(m.start)}${m.placed ? " (propuesta)" : ""}${m.moved ? " (movido)" : ""} · ${m.team} ${isHome(m) ? "vs" : "en"} ${m.rival || "?"}${m.coaches.length ? " · " + m.coaches.join(", ") : ""}${w ? "\n⚠ " + w.map(x => x.text).join("\n⚠ ") : ""}`;
          const pos = m.seg
            ? `left:calc(${pct(m.start)} - ${SEG}px);width:calc(${pct(minH * 60 + Math.max(15, m.seg.end - m.start))} + ${2 * SEG}px)`
            : `left:${pct(m.start)};width:${pct(minH * 60 + DUR)}`;
          t += `<div class="${cls}" style="${pos};top:${m.lane * 34 + 2}px" title="${esc(tip)}" onclick="cpShowMatch(this)" data-tip="${esc(tip)}" data-mk="${esc(m.mk)}" data-start="${m.start}">
            <span class="cp-tl-t">${w ? "⚠️" : ""}${m.moved ? "✎" : ""}${toHHMM(m.start)}</span><span class="cp-tl-n">${esc(short(m.team))}</span></div>`;
        });
        t += `</div></div>`;
      });
      const nCh = changeList().length;
      t += `<div class="cp-tl-legend"><span><i class="cp-lg home"></i>Casa</span><span><i class="cp-lg away"></i>Fuera</span><span><i class="cp-lg alevin"></i>Alevín</span><span><i class="cp-lg placed"></i>Hora propuesta</span><span><i class="cp-lg warn"></i>Aviso</span><span>✎ Movido</span></div>
        <div class="cp-tl-legend"><span class="cp-tl-hint">Toca un partido para ver el detalle. Mantén pulsado cualquier partido para moverlo (hora o día).</span></div>
        <div class="cp-tl-actions"><button type="button" class="cp-tl-btn" onclick="cpToggleChanges()">📝 Cambios realizados (${nCh}) ${changesOpen ? "▴" : "▾"}</button></div>
        <div class="cp-changes" id="cpChanges" style="${changesOpen ? "" : "display:none"}">${renderChanges()}</div>`;
      tl.dataset.minh = minH; tl.dataset.span = span;
      tl.innerHTML = t;
    }

    // --- Avisos ---
    if (wb) {
      wb.innerHTML = shownWarns.length
        ? shownWarns.map(w => `<div class="cp-warn ${w.level}">⚠️ ${esc(w.text)}${w.ids.some(i => planned.find(m => m.id === i && m.placed)) ? ' <span class="cp-warn-tag">incluye hora propuesta</span>' : ""}</div>`).join("")
        : `<div class="cp-empty cp-ok">✅ Todo cumple las premisas.</div>`;
    }
  }
  window.cpSwapHome = function (btn) {
    cp.homeOv = cp.homeOv || {};
    cp.homeOv[btn.getAttribute("data-mk")] = btn.getAttribute("data-home") === "1";
    cp.homeBy = cp.homeBy || {};
    cp.homeBy[btn.getAttribute("data-mk")] = quienSoy();
    saveMoves();
    renderMatches();
  };
  window.cpShowMatch = function (el) {
    if (drag.justDropped) { drag.justDropped = false; return; }
    alert(el.getAttribute("data-tip"));
  };

  // ---------- Mover partidos propuestos (mantener pulsado y arrastrar) ----------
  const drag = { timer: null, el: null, active: false, justDropped: false, x0: 0, y0: 0, dx: 0 };
  // Quién hace el cambio (usuario con el que se ha entrado en la app)
  function quienSoy() {
    const p = window.nva && window.nva.perfil;
    return p ? ((p.nombre || "").trim() || String(p.email || "").split("@")[0]) : "";
  }
  function saveMoves() {
    cp.updated = new Date().toISOString();
    saveLocal();
    if (typeof writeGitHubFile === "function" && typeof ghSettings !== "undefined" && ghSettings.user && ghSettings.repo && ghSettings.token) {
      writeGitHubFile(CP_FILE, cp, "Mover partido propuesto");
    }
  }
  // ---------- Lista de cambios realizados (movimientos y cambios de campo) ----------
  let changesOpen = false, changesAll = false, lastProposals = [], lastConfirmed = [];
  function selRange() {
    const f = document.getElementById("cpFrom"), t = document.getElementById("cpTo");
    return { from: f ? f.value : "", to: t ? t.value : "" };
  }
  const inSel = (d, r) => (!r.from || d >= r.from) && (!r.to || d <= r.to);
  function matchByKey(mk) {
    for (const key of Object.keys(cp.teams)) for (const m of (cp.teams[key].matches || [])) if (moveKey(key, m) === mk) return Object.assign({ team: key }, m);
    return null;
  }
  const whenTxt = (date, time) => `${DIAS[dow(date)]} ${fmtDay(date).slice(0, 5)} ${time || "sin hora"}`;
  function changeList(all) {
    if (all === undefined) all = changesAll;
    const rg = selRange();
    const out = [];
    const keys = new Set(Object.keys(cp.moved || {}).concat(Object.keys(cp.homeOv || {})));
    keys.forEach(mk => {
      const m = matchByKey(mk);
      if (!m) return;
      const mv0 = (cp.moved || {})[mk];
      if (!all && !inSel(m.date, rg) && !(mv0 && inSel(mv0.date, rg))) return;
      const mv = (cp.moved || {})[mk], hv = (cp.homeOv || {})[mk];
      const vs = `${m.team} vs ${m.rival || "?"}`;
      const items = [];
      const by = (q) => q ? ` (${q})` : "";
      if (mv) items.push(`Horario: ${whenTxt(m.date, hasTime(m) ? m.time : "")} → ${whenTxt(mv.date, toHHMM(mv.start))}${by(mv.by)}`);
      if (hv !== undefined) items.push(`Campo: ${hv ? "visitante → local" : "local → visitante"}${by((cp.homeBy || {})[mk])}`);
      out.push({ mk, vs, items, sort: (mv ? mv.date : m.date) + (mv ? toHHMM(mv.start) : (m.time || "")) });
    });
    return out.sort((a, b) => a.sort.localeCompare(b.sort));
  }
  function renderChanges() {
    const ch = changeList();
    const filt = `<div class="cp-change-actions"><button type="button" class="cp-tl-btn"${changesAll ? "" : ' style="background:var(--balon);color:var(--noche);border-color:var(--balon)"'} onclick="cpChangesScope(false)">Fechas seleccionadas</button>
         <button type="button" class="cp-tl-btn"${changesAll ? ' style="background:var(--balon);color:var(--noche);border-color:var(--balon)"' : ""} onclick="cpChangesScope(true)">TODOS</button></div>`;
    const pdfBtn = `<div class="cp-change-actions"><button type="button" class="cp-tl-btn" onclick="cpChangesPdf()">📄 Crear PDF</button></div>`;
    if (!ch.length) return filt + `<div class="cp-empty">No hay cambios${changesAll ? "" : " en las fechas seleccionadas"}. Mantén pulsado un partido para moverlo, o usa «Pasar a local/visitante» en la lista.</div>` + (lastProposals.length || lastConfirmed.length ? pdfBtn : "");
    return filt + ch.map(c => `<div class="cp-change"><div class="cp-change-txt"><b>${esc(c.vs)}</b>${c.items.map(i => `<div>${esc(i)}</div>`).join("")}</div>
        <button type="button" class="cp-change-undo" data-mk="${esc(c.mk)}" onclick="cpUndoChange(this)" title="Deshacer">↺</button></div>`).join("")
      + `<div class="cp-change-actions"><button type="button" class="cp-tl-btn" onclick="cpChangesPdf()">📄 Crear PDF</button>
         <button type="button" class="cp-tl-btn cp-tl-btn-red" onclick="cpResetMoves()">↺ Deshacer todos</button></div>`;
  }
  window.cpChangesScope = function (all) { changesAll = all; renderMatches(); };
  window.cpToggleChanges = function () { changesOpen = !changesOpen; renderMatches(); };
  window.cpUndoChange = function (btn) {
    const mk = btn.getAttribute("data-mk");
    if (cp.moved) delete cp.moved[mk];
    if (cp.homeOv) delete cp.homeOv[mk];
    if (cp.homeBy) delete cp.homeBy[mk];
    saveMoves(); renderMatches();
  };
  window.cpResetMoves = function () {
    if (!confirm("¿Deshacer todos los cambios (movimientos y cambios de campo)?")) return;
    cp.moved = {}; cp.homeOv = {}; cp.homeBy = {}; saveMoves(); renderMatches();
  };
  window.cpChangesPdf = async function () {
    const ch = changeList();
    // Partido entre dos equipos del club: sale una sola vez
    const conf = [], nT = (t) => normalizeTeamName(t || "");
    lastConfirmed.forEach(m => {
      if (conf.some(k => k.date === m.date && k.time === m.time && nT(k.team).startsWith(nT(m.rival)) && nT(m.team).startsWith(nT(k.rival)))) return;
      conf.push(m);
    });
    const props = lastProposals.slice();
    if (!ch.length && !props.length && !conf.length) return;
    try {
      if (typeof mostrarCargando === "function") mostrarCargando("Creando PDF...");
      await ensureExportLibs();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
      const W = 210, M = 15;
      const logo = typeof nvaLogoDataUrl === "function" ? await nvaLogoDataUrl() : null;
      const from = document.getElementById("cpFrom").value, to = document.getElementById("cpTo").value;
      const cab = () => nvaPdfBand(pdf, logo, { kicker: "Club Nou Vòlei Alzira", title: "Cambios en el calendario", sub: from && to ? `Fechas consultadas: ${fmtDay(from)} - ${fmtDay(to)}` : "" });
      const seccion = (txt) => {
        pdf.setFillColor(214, 40, 57); pdf.rect(M, y - 3.6, 5, 1.2, "F");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(27, 58, 140);
        pdf.text(txt.toUpperCase(), M + 7, y - 2.2, { charSpace: 0.4 });
        pdf.setDrawColor(227, 232, 244); pdf.line(M + 7 + pdf.getTextWidth(txt.toUpperCase()) + 8, y - 3, W - M, y - 3);
        pdf.setTextColor(13, 27, 69); y += 6;
      };
      let y = cab() + 12;
      seccion(`Cambios realizados${changesAll ? " (todos)" : ""}`);
      if (!ch.length) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text("Sin cambios.", M, y); y += 7; }
      ch.forEach((c, i) => {
        const lines = [c.vs].concat(c.items.map(t => "   " + t.replace("→", "->")));
        if (y + lines.length * 5.5 > 278) { pdf.addPage(); y = cab() + 12; }
        pdf.setFillColor(13, 27, 69); pdf.circle(M + 2.6, y - 1.3, 2.6, "F");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(245, 197, 24);
        pdf.text(String(i + 1), M + 2.6, y - 0.2, { align: "center" });
        pdf.setFontSize(11); pdf.setTextColor(13, 27, 69);
        pdf.text(lines[0], M + 8, y); y += 5.5;
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(51, 65, 85);
        lines.slice(1).forEach(l => { pdf.text(pdf.splitTextToSize(l.trim(), W - 2 * M - 8), M + 8, y); y += 5.5; });
        y += 2.5;
      });
      if (props.length) {
        if (y + 20 > 278) { pdf.addPage(); y = cab() + 12; }
        y += 4;
        seccion("Propuestas de partidos (sin hora oficial)");
        props.forEach((m, i) => {
          if (y + 11 > 278) { pdf.addPage(); y = cab() + 12; }
          pdf.setFillColor(245, 197, 24); pdf.circle(M + 2.6, y - 1.3, 2.6, "F");
          pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(13, 27, 69);
          pdf.text(String(i + 1), M + 2.6, y - 0.2, { align: "center" });
          pdf.setFontSize(11);
          pdf.text(`${m.team} ${isHome(m) ? "vs" : "en"} ${m.rival || "?"}`, M + 8, y); y += 5.5;
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(51, 65, 85);
          pdf.text(`Propuesta: ${whenTxt(m.date, toHHMM(m.start))}${isHome(m) ? " (local)" : " (visitante)"}`, M + 8, y); y += 7.5;
        });
      }
      if (conf.length) {
        if (y + 20 > 278) { pdf.addPage(); y = cab() + 12; }
        y += 4;
        seccion("Fechas confirmadas");
        conf.forEach((m, i) => {
          if (y + 11 > 278) { pdf.addPage(); y = cab() + 12; }
          pdf.setFillColor(31, 157, 85); pdf.circle(M + 2.6, y - 1.3, 2.6, "F");
          pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(255, 255, 255);
          pdf.text(String(i + 1), M + 2.6, y - 0.2, { align: "center" });
          pdf.setFontSize(11); pdf.setTextColor(13, 27, 69);
          pdf.text(`${m.team} ${isHome(m) ? "vs" : "en"} ${m.rival || "?"}`, M + 8, y); y += 5.5;
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(51, 65, 85);
          const lugar = isHome(m) ? " (local)" : " (visitante)";
          const ls = pdf.splitTextToSize(`${whenTxt(m.date, m.time)}${lugar}${m.venue ? " · " + m.venue.replace(/([A-Za-zÀ-ÿ]),(?=[A-Za-zÀ-ÿ])/g, "$1'") : ""}`, W - 2 * M - 8);
          pdf.text(ls, M + 8, y); y += 7.5 + (ls.length - 1) * 4.5;
        });
      }
      nvaPdfFooters(pdf);
      pdf.save(`Cambios_partidos_${isoDay(new Date())}.pdf`);
    } catch (e) {
      console.error(e);
      alert("No se pudo crear el PDF. La primera vez hace falta conexión para descargar el generador de PDF.");
    } finally {
      if (typeof ocultarCargando === "function") ocultarCargando();
    }
  };
  function dragTarget(x, y) {
    const tl = document.getElementById("cpTimeline");
    const under = document.elementsFromPoint(x, y).find(e => e.classList && e.classList.contains("cp-tl-row"));
    const row = under || drag.lastRow;
    if (!row) return null;
    drag.lastRow = row;
    const track = row.querySelector(".cp-tl-track");
    const r = track.getBoundingClientRect();
    const minH = +tl.dataset.minh, span = +tl.dataset.span;
    let start = minH * 60 + (x - drag.dx - r.left) / r.width * span;
    start = Math.round(start / 15) * 15;
    start = Math.max(minH * 60, Math.min(minH * 60 + span - DUR, start));
    return { row, track, day: row.dataset.day, start, left: (start - minH * 60) / span * 100 };
  }
  function cancelLongPress() { clearTimeout(drag.timer); drag.timer = null; }
  function onDown(e) {
    const el = e.target.closest(".cp-tl-blk");
    if (!el) return;
    cancelLongPress();
    drag.el = el; drag.x0 = e.clientX; drag.y0 = e.clientY;
    const r = el.getBoundingClientRect(); drag.dx = e.clientX - r.left;
    drag.timer = setTimeout(() => {
      drag.active = true; drag.timer = null;
      el.classList.add("dragging");
      document.body.classList.add("cp-dragging");
      if (navigator.vibrate) try { navigator.vibrate(30); } catch (err) {}
    }, 400);
  }
  function onMove(e) {
    if (drag.timer && (Math.abs(e.clientX - drag.x0) > 8 || Math.abs(e.clientY - drag.y0) > 8)) cancelLongPress();
    if (!drag.active) return;
    e.preventDefault();
    const tg = dragTarget(e.clientX, e.clientY);
    if (!tg) return;
    if (drag.el.parentNode !== tg.track) tg.track.appendChild(drag.el);
    drag.el.style.left = tg.left + "%";
    drag.el.style.top = "2px";
    const lbl = drag.el.querySelector(".cp-tl-t"); if (lbl) lbl.textContent = toHHMM(tg.start);
    drag.target = tg;
  }
  function onUp() {
    cancelLongPress();
    if (!drag.active) { drag.el = null; return; }
    drag.active = false; drag.justDropped = true;
    setTimeout(() => { drag.justDropped = false; }, 400);
    document.body.classList.remove("cp-dragging");
    const mk = drag.el.getAttribute("data-mk"), tg = drag.target;
    drag.el = null; drag.target = null; drag.lastRow = null;
    if (mk && tg) { cp.moved = cp.moved || {}; cp.moved[mk] = { date: tg.day, start: tg.start, by: quienSoy() }; saveMoves(); }
    renderMatches();
  }
  function initDrag() {
    const tl = document.getElementById("cpTimeline");
    if (!tl) return;
    tl.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", () => { cancelLongPress(); if (drag.active) onUp(); });
    tl.addEventListener("contextmenu", (e) => { if (e.target.closest(".cp-tl-blk")) e.preventDefault(); });
  }

  function renderTeams() {
    const box = document.getElementById("cpTeams");
    if (!box || box.closest(".collapsed")) return;
    const teams = (typeof appData !== "undefined" && appData.teams) || [];
    if (!teams.length) { box.innerHTML = `<div class="cp-empty">No hay equipos configurados.</div>`; return; }
    box.innerHTML = `<div class="cp-update-btns">
        <button type="button" class="btn-save-session cp-update-all" onclick="cpUpdateAll()">🔄 Actualizar automáticamente</button>
        <button type="button" class="btn-save-session cp-update-manual${manualMode ? " active" : ""}" aria-pressed="${manualMode}" onclick="cpToggleManual()">✋ Actualizar manualmente</button>
      </div>` + teams.map((t, i) => {
      const key = getTeamKey(t);
      const info = cp.teams[key];
      let change = "";
      if (info && info.changeStatus === "sin") change = `<span class="cp-chg cp-chg-sin">Sin cambios desde ${fmtDay((info.changedAt || info.uploadedAt).slice(0, 10))}${info.checkedAt ? ` · revisado ${fmtDay(info.checkedAt.slice(0, 10))}` : ""}</span>`;
      else if (info && info.changeStatus === "con") change = `<span class="cp-chg cp-chg-con">Con cambios (${fmtDay((info.changedAt || info.uploadedAt).slice(0, 10))}) <button type="button" class="cp-chg-btn" data-key="${esc(key)}" onclick="cpShowChanges(this)">🔍 Ver cambios</button></span>`;
      const status = info
        ? `<span class="wk-mark wk-v">V</span><span class="cp-up">${fmtDay(info.uploadedAt.slice(0, 10))} · ${(info.matches || []).length} partidos</span>${change}`
        : `<span class="cp-up cp-none">Sin PDF</span>`;
      const iden = (cp.idens || {})[key] || "";
      return `<div class="cp-team">
        <div class="cp-team-name">${esc(key)}<div class="cp-team-status">${status}</div></div>
        <label class="cp-iden"><span>Iden</span><input type="text" inputmode="numeric" maxlength="5" placeholder="0000" value="${esc(iden)}" data-key="${esc(key)}" onchange="cpSetIden(this)"></label>
        ${manualMode ? `<button class="cp-upload" onclick="cpPickPdf(${i})">📄 ${info ? "Cambiar" : "Subir"} PDF</button>` : ""}
      </div>`;
    }).join("");
  }

  // Botones de subir/cambiar PDF a mano: solo visibles tras pulsar «Actualizar manualmente»
  let manualMode = false;
  window.cpToggleManual = function () { manualMode = !manualMode; renderTeams(); };

  // Línea del resumen final: «- Equipo: x partidos» y debajo si hay cambios o no
  function fmtRes(key, res, extra) {
    const m = /^«.*», (\d+) partidos · (.+)$/.exec(res);
    if (!m) return `- ${key}: ${res}${extra || ""}`;
    const info = cp.teams[key] || {};
    let st = m[2] === "nuevo" ? "Nuevo (primera carga)" : m[2] === "con cambios" ? "Con cambios" : "Sin cambios";
    if (m[2] === "sin cambios" && (info.changedAt || info.uploadedAt)) st += ` desde ${fmtDay((info.changedAt || info.uploadedAt).slice(0, 10))}`;
    return `- ${key}: ${m[1]} partidos\n   ${st}${extra || ""}`;
  }

  // ---------- Subida y análisis del PDF ----------
  let pickIdx = -1;
  window.cpPickPdf = function (i) {
    pickIdx = i;
    const inp = document.getElementById("cpFileInput");
    inp.value = "";
    inp.click();
  };

  async function pdfLines(file) {
    await ensurePdfJs();
    return L.pdfLines(await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise);
  }

  async function onFile(input) {
    const file = input.files && input.files[0];
    input.value = "";
    const team = ((typeof appData !== "undefined" && appData.teams) || [])[pickIdx];
    if (!file || !team) return;
    const key = getTeamKey(team);
    const res = await processPdf(file, `${sanitizeFileName(key)}.pdf`, team, false);
    if (/(con cambios|nuevo)$/.test(res)) savePdfToGitHub(key, file);   // copia del PDF en Calendarios/<Equipo>.pdf
    if (/partidos · /.test(res)) {
      const reg = await syncResults([key]);
      if (reg) alert(`${key}\n${reg}`);
    }
  }

  // Analiza un PDF y guarda los partidos del equipo. batch = actualización automática
  // (si el equipo se reconoce solo, no se pide confirmación). Devuelve un texto de resultado.
  async function processPdf(file, fileName, team, batch, fedHint, silent) {
    const key = getTeamKey(team);
    mostrarCargando(`Analizando el PDF de ${key}...`);
    let lines;
    try { lines = await pdfLines(file); }
    catch (e) {
      console.error(e); ocultarCargando();
      if (!batch) alert("No se pudo leer el PDF. La primera vez hace falta conexión para descargar el lector de PDF.");
      return "no se pudo leer el PDF";
    }
    ocultarCargando();

    const prev = cp.teams[key];
    let fed = fedHint || L.previousFedName(lines, prev);
    let asked = false;
    if (!fed) {
      const r = L.findFedName(lines, team);
      fed = r.best;
      if (!fed) {
        if (!r.names.length) { if (!batch) alert("No he encontrado partidos con fecha en este PDF."); return "sin partidos con fecha"; }
        if (silent) return "equipo no reconocido";
        const menu = r.names.slice(0, 40).map((n, i) => `${i + 1}. ${n}`).join("\n");
        const ans = prompt(`${key}: no sé cuál es en el PDF.\nEscribe el número del equipo que corresponde (vacío = saltar):\n\n${menu}`);
        const n = parseInt(ans, 10);
        if (!(n >= 1 && n <= Math.min(40, r.names.length))) return "saltado";
        fed = r.names[n - 1]; asked = true;
      }
    }
    const matches = L.extractMatches(lines, fed);
    if (!matches.length) { if (!batch) alert(`He encontrado "${fed}" pero ningún partido con fecha.`); return `«${fed}» sin partidos con fecha`; }
    // ¿Ha cambiado algo respecto a lo que ya había guardado? Si no, no se pide confirmación.
    const same = prev && prev.fedName === fed && L.sameMatches(prev.matches, matches);
    if (!same && !batch && !asked && !confirm(`Equipo encontrado en el PDF: "${fed}"\n${matches.length} partidos (del ${fmtDay(matches[0].date)} al ${fmtDay(matches[matches.length - 1].date)}).\n\n¿Guardar para ${key}?`)) return "cancelado";

    const estado = L.aplicarLectura(cp, key, fed, matches, fileName);
    saveLocal();
    render();
    if (typeof writeGitHubFile === "function" && typeof ghSettings !== "undefined" && ghSettings.user && ghSettings.repo && ghSettings.token) {
      await writeGitHubFile(CP_FILE, cp, `Calendario de partidos de ${key}${same ? ": sin cambios" : ""}`);
    }
    if (same && !batch) alert(`${key}: sin cambios desde el ${fmtDay(cp.teams[key].changedAt.slice(0, 10))}. Se mantiene lo que había.`);
    return `«${fed}», ${matches.length} partidos · ${estado}`;
  }

  // Los «con cambios» guardados con la regla anterior se revisan con la regla nueva
  function revisarEstadosCambios() {
    let tocado = false;
    Object.values(cp.teams || {}).forEach(info => {
      if (info.changeStatus !== "con" || !Array.isArray(info.changes)) return;
      const ch = info.changes.filter(c => c.type !== "mod" || L.significantChange(c.before, c.after));
      if (ch.length === info.changes.length) return;
      info.changes = ch;
      if (!ch.length) info.changeStatus = "sin";
      tocado = true;
    });
    return tocado;
  }

  window.cpShowChanges = function (btn) {
    const key = btn.dataset.key, info = cp.teams[key];
    if (!info) return;
    const line = (m) => `${fmtDay(m.date)} ${m.time && m.time !== "00:00" ? m.time : "(sin hora)"} · ${m.home ? "🏠 vs" : "✈️ en"} ${esc(m.rival)}${m.venue ? `<br><small>${esc(m.venue)}</small>` : ""}`;
    const what = (a, b) => [a.date !== b.date && "fecha", a.time !== b.time && "hora", a.venue !== b.venue && "pabellón"].filter(Boolean).join(", ");
    const list = info.changes;
    const body = !list ? `<div class="cp-modal-txt">No hay detalle guardado de este cambio (se detectó antes de que la app guardara el detalle). La próxima vez que cambie se podrá ver aquí.</div>`
      : !list.length ? `<div class="cp-modal-txt">Solo han cambiado datos que no afectan a los partidos (por ejemplo, resultados).</div>`
      : `<div class="cp-chg-list">${list.map(c => c.type === "add" ? `<div class="cp-chg-item add"><b>➕ Nuevo</b><br>${line(c.after)}</div>`
          : c.type === "del" ? `<div class="cp-chg-item del"><b>➖ Ya no está</b><br>${line(c.before)}</div>`
          : `<div class="cp-chg-item mod"><b>✏️ Cambia ${what(c.before, c.after)}</b><br><s>${line(c.before)}</s><br>${line(c.after)}</div>`).join("")}</div>`;
    const o = document.createElement("div");
    o.className = "cp-modal";
    o.innerHTML = `<div class="cp-modal-box imp-box">
      <div class="cp-modal-title">Cambios · ${esc(key)}</div>
      <div class="cp-modal-txt"><small>Detectados el ${fmtDay((info.changedAt || info.uploadedAt).slice(0, 10))}</small></div>
      ${body}
      <button class="cp-modal-btn cp-modal-main">Cerrar</button>
    </div>`;
    o.addEventListener("click", (e) => { if (e.target === o || e.target.classList.contains("cp-modal-main")) o.remove(); });
    document.body.appendChild(o);
  };

  // ---------- Iden de cada equipo y actualización automática desde la federación ----------
  window.cpSetIden = function (inp) {
    const key = inp.getAttribute("data-key");
    const v = inp.value.replace(/\D/g, "").slice(0, 5);
    inp.value = v;
    if (v && v.length < 4) { inp.classList.add("cp-iden-bad"); return; }
    inp.classList.remove("cp-iden-bad");
    cp.idens = cp.idens || {};
    if (v) cp.idens[key] = v; else delete cp.idens[key];
    saveMoves();
  };

  // Guarda el PDF en GitHub como Calendarios/<Equipo>.pdf (sobrescribe si ya existe)
  const PDF_FOLDER = "Calendarios";
  async function savePdfToGitHub(key, blob) {
    if (typeof ghSettings === "undefined" || !ghSettings.user || !ghSettings.repo || !ghSettings.token) return false;
    const path = `${PDF_FOLDER}/${sanitizeFileName(key)}.pdf`;
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${path}`;
    const headers = { "Authorization": `token ${ghSettings.token}` };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    try {
      let sha = "";
      const g = await fetch(url, { headers, cache: "no-store" });
      if (g.ok) sha = (await g.json()).sha;
      const put = await fetch(url, {
        method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, headers),
        body: JSON.stringify(Object.assign({ message: `PDF de partidos de ${key}`, content: btoa(bin) }, sha ? { sha } : {}))
      });
      return put.ok;
    } catch (e) { console.error("No se pudo guardar el PDF en GitHub:", e); return false; }
  }

  // ---------- Resultados en los registros de partido (Partidos/Partidos_<equipo>_<fecha>.json) ----------
  // Tras leer los PDF, el marcador de cada partido jugado pasa al registro de ese equipo y ese día,
  // solo si el registro ya existe (no se crean registros nuevos).
  // Sin resultado grabado: se graba. Igual al grabado: no se toca. Distinto: se pregunta.

  const parseResult = L.parseResult;
  window.cpParseResult = parseResult;
  // En los PDF el apóstrofo sale como coma: "L,ILLA" -> "L'ILLA"
  const apos = (t) => String(t || "").replace(/([A-Za-zÀ-ÿ]),(?=[A-Za-zÀ-ÿ])/g, "$1'");
  // Partidos con resultado de esos equipos (con el cambio local/visitante aplicado)
  const playedMatches = (keys) => L.playedMatches(cp, keys);
  const buildMarcador = (p) => L.buildMarcador(p, MATCH_SETS_COUNT);
  const findLog = (p) => allMatchLogs.find(l => l.equipo === p.key && l.fecha === p.fecha);
  // Partidos cuyo resultado ya estaba grabado y es distinto: se pregunta cuáles se reescriben
  function askOverwrite(list) {
    return new Promise((resolve) => {
      const o = document.createElement("div");
      o.className = "cp-modal";
      o.innerHTML = `<div class="cp-modal-box imp-box">
        <div class="cp-modal-title">✏️ Resultados distintos a los grabados</div>
        <div class="cp-modal-txt">Estos partidos ya tienen un resultado grabado en su registro que no coincide con el del PDF. Marca los que quieras reescribir.</div>
        <div class="imp-list">${list.map((c, i) => `<label class="imp-item ca-item"><input type="checkbox" data-i="${i}" checked>
          <span><b>${fmtDay(c.p.fecha)} · ${esc(c.p.key)}</b> ${c.p.home ? "🏠" : "✈️"} ${esc(apos(c.p.rival))}<br>
          Grabado: <s>${esc(L.marcadorTxt(c.old))}</s><br>Nuevo: <b class="ca-score">${esc(L.marcadorTxt(c.nuevo))}</b></span></label>`).join("")}</div>
        <div class="cp-modal-row">
          <button class="cp-modal-btn cp-modal-stop">No reescribir</button>
          <button class="cp-modal-btn cp-modal-main">Reescribir marcados</button>
        </div>
      </div>`;
      document.body.appendChild(o);
      const done = (v) => { o.remove(); resolve(v); };
      o.querySelector(".cp-modal-stop").onclick = () => done([]);
      o.querySelector(".cp-modal-main").onclick = () => done(Array.from(o.querySelectorAll("input:checked")).map(c => list[+c.dataset.i]));
    });
  }
  async function saveResultToMatchLog(p, marcador) {
    const log = findLog(p);
    log.marcador = marcador;
    localStorage.setItem("NVA_MATCH_LOGS", JSON.stringify(allMatchLogs));
    return writeGitHubFile(`${MATCH_LOGS_FOLDER}/Partidos_${sanitizeFileName(p.key)}_${p.fecha}.json`, log, `Resultado partido ${p.key} - ${p.fecha}`);
  }
  // Devuelve el resumen para enseñarlo, o "" si no había resultados que pasar
  async function syncResults(keys) {
    const played = playedMatches(keys);
    if (!played.length) return "";
    mostrarCargando("Guardando los resultados en los registros de partido...");
    try {
      // Registros de partido: se sincronizan antes para no pisar datos de otros dispositivos
      if (ghSettings.user && ghSettings.repo && navigator.onLine) {
        if (offlineQueue.length > 0) await processOfflineQueue();
        await fetchMatchLogsFromGitHub();
      }
      const conRegistro = played.filter(findLog);
      if (!conRegistro.length) return "";
      const nuevos = [], distintos = [];
      conRegistro.forEach(p => {
        const nuevo = buildMarcador(p), old = findLog(p).marcador;
        const oldTxt = L.marcadorTxt(old);
        if (!oldTxt) nuevos.push({ p, nuevo });
        else if (oldTxt !== L.marcadorTxt(nuevo)) distintos.push({ p, nuevo, old });
      });
      let reescribir = [];
      if (distintos.length) { ocultarCargando(); reescribir = await askOverwrite(distintos); mostrarCargando("Guardando los resultados en los registros de partido..."); }
      for (const c of nuevos.concat(reescribir)) await saveResultToMatchLog(c.p, c.nuevo);
      const iguales = conRegistro.length - nuevos.length - distintos.length;
      return `Resultados en registros de partido: ${nuevos.length} grabado(s), ${reescribir.length} reescrito(s), ${iguales} sin cambios` +
        (distintos.length - reescribir.length ? `, ${distintos.length - reescribir.length} sin reescribir` : "") + ".";
    } catch (e) {
      console.error(e);
      return "No se pudieron guardar todos los resultados en los registros de partido: " + e.message;
    } finally { ocultarCargando(); }
  }

  // ---------- Actualizar automáticamente (función de Supabase) ----------
  // La función descargar-calendarios baja los PDF desde la federación (el navegador no puede:
  // fvbcv.com bloquea las descargas desde otras webs) y los guarda en Calendarios/<Equipo>.pdf.
  function ghApi(path, opts) {
    const headers = Object.assign({ "Authorization": `token ${ghSettings.token}`, "Accept": "application/vnd.github+json" }, (opts && opts.headers) || {});
    return fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}${path}`, Object.assign({ cache: "no-store" }, opts || {}, { headers }));
  }
  // Devuelve { resultados } (por equipo: "ok" o el motivo del fallo) o { error }
  async function runServerDownload(teams) {
    const sb = window.nva && window.nva.cliente;
    if (!sb) return { error: "no hay conexión con Supabase" };
    mostrarCargando(`Descargando ${teams.length === 1 ? "el PDF" : `los ${teams.length} PDF`} de la federación...`);
    try {
      const idens = {};
      teams.forEach(t => { idens[getTeamKey(t)] = cp.idens[getTeamKey(t)]; });
      const { data, error } = await sb.functions.invoke("descargar-calendarios", { body: { idens } });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch (e) {}
        return { error: msg };
      }
      return { resultados: (data && data.resultados) || {} };
    } catch (e) { console.error(e); return { error: "error de conexión" }; }
    finally { ocultarCargando(); }
  }
  async function readServerPdf(key) {
    const r = await ghApi(`/contents/${PDF_FOLDER}/${sanitizeFileName(key)}.pdf`, { headers: { "Accept": "application/vnd.github.raw" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const blob = await r.blob();
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== "%PDF-") throw new Error("No es un PDF");
    return new File([blob], `${sanitizeFileName(key)}.pdf`, { type: "application/pdf" });
  }

  // Descarga en el servidor los PDF de todos los equipos con iden y, para cada uno,
  // comprueba si los partidos han cambiado respecto a lo guardado (processPdf)
  let updating = false;
  window.cpUpdateAll = async function () {
    if (updating) return;
    const teams = ((typeof appData !== "undefined" && appData.teams) || []).filter(t => (cp.idens || {})[getTeamKey(t)]);
    if (!teams.length) { alert("Escribe primero el iden (4 o 5 dígitos) de algún equipo."); return; }
    if (!navigator.onLine) { alert("Sin conexión: no se pueden descargar los PDF ahora."); return; }
    updating = true;
    const results = [], leidos = [];
    try {
      await fetchFromGitHub();   // comparar con los datos más recientes, no con los de este dispositivo
      const run = await runServerDownload(teams);
      if (run.error) {
        alert(`No se pudo actualizar automáticamente: ${run.error}.\n\nPuedes subir los PDF a mano con «Actualizar manualmente».`);
        return;
      }
      for (let i = 0; i < teams.length; i++) {
        const team = teams[i], key = getTeamKey(team);
        const st = run.resultados[key];
        if (st !== "ok") { results.push(`- ${key}: no se pudo descargar (${st || "sin respuesta"})`); continue; }
        mostrarCargando(`Comprobando ${i + 1}/${teams.length}: ${key}...`);
        let file = null;
        try { file = await readServerPdf(key); } catch (e) { console.warn(`Sin PDF guardado para ${key}:`, e); }
        ocultarCargando();
        if (!file) { results.push(`- ${key}: no se encontró el PDF descargado`); continue; }
        const res = await processPdf(file, file.name, team, true);
        if (/partidos · /.test(res)) leidos.push(key);
        results.push(fmtRes(key, res));
      }
      const reg = await syncResults(leidos);
      if (reg) results.push(reg);
    } finally {
      updating = false;
      ocultarCargando();
    }
    render();
    alert("Actualización terminada:\n\n" + results.join("\n\n"));
  };

  // ---------- Actualización programada (función de Supabase actualizar-calendarios) ----------
  // Cada hora en punto el servidor mira si está activada y si es la hora elegida (hora de España);
  // entonces hace lo mismo que «Actualizar automáticamente», sin preguntar nada: si un registro de
  // partido ya tiene otro resultado no se toca. Lo elegido y el resumen van en su propio archivo
  // para que guardar los partidos desde un dispositivo no lo pise.
  const PROG_FILE = "CalendarioProgramada.json";
  let prog = null;   // null = aún sin leer
  const horaEs = (iso) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  async function loadProg() {
    if (typeof ghSettings === "undefined" || !ghSettings.user || !ghSettings.repo || !navigator.onLine) return prog;
    try {
      const res = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${PROG_FILE}`, { headers: { "Authorization": `token ${ghSettings.token}` }, cache: "no-store" });
      prog = res.ok ? JSON.parse(b64_to_utf8((await res.json()).content)) : (res.status === 404 ? {} : prog);
    } catch (e) { console.error(`Error al cargar ${PROG_FILE}:`, e); }
    renderProg();
    return prog;
  }
  function renderProg() {
    const box = document.getElementById("cpProg");
    if (!box || box.closest(".collapsed")) return;
    if (!prog) { box.innerHTML = `<div class="cp-empty">Cargando…</div>`; return; }
    const hora = prog.hora == null ? 5 : +prog.hora, u = prog.ultima;
    const horas = Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === hora ? " selected" : ""}>${pad(h)}:00</option>`).join("");
    const last = u
      ? `Última: ${fmtDay(u.dia || u.fecha.slice(0, 10))} a las ${horaEs(u.fecha)}${u.manual ? " (prueba)" : ""} · ${u.equipos} equipo(s)${u.conCambios ? `, ${u.conCambios} con cambios` : ""} <button type="button" class="cp-chg-btn" onclick="cpShowProgResumen()">🔍 Ver resumen</button>`
      : "Todavía no se ha hecho ninguna actualización programada.";
    box.innerHTML = `
      <label class="cp-prog-row cp-prog-check"><input type="checkbox"${prog.activa ? " checked" : ""} onchange="cpSetProg({ activa: this.checked })"> Actualizar los PDF automáticamente cada día</label>
      <label class="cp-prog-row"><span>Hora</span><select onchange="cpSetProg({ hora: +this.value })"${prog.activa ? "" : " disabled"}>${horas}</select><span class="cp-prog-txt">hora de España</span></label>
      <div class="cp-prog-txt">Hace lo mismo que «Actualizar automáticamente»: descarga los PDF de los equipos con iden, marca los cambios de fecha, hora o pabellón y pasa los resultados a los registros de partido que ya existen. Si un registro ya tiene otro resultado, no se toca: se decide al pulsar «Actualizar automáticamente».</div>
      <div class="cp-prog-last">${last}</div>
      <div class="cp-prog-btns"><button type="button" class="btn-save-session" onclick="cpProbarProg()">▶️ Probar ahora</button></div>`;
  }
  window.cpSetProg = async function (cambio) {
    if (!navigator.onLine) { alert("Sin conexión: no se puede cambiar ahora."); renderProg(); return; }
    await loadProg();   // lo último guardado (p. ej. el resumen de esta noche)
    prog = Object.assign({ activa: false, hora: 5 }, prog, cambio, { cambiadoPor: quienSoy(), cambiado: new Date().toISOString() });
    renderProg();
    const ok = await writeGitHubFile(PROG_FILE, prog, "Actualización programada de los PDF");
    if (!ok) alert("No se pudo guardar el cambio. Revisa la conexión o los permisos.");
  };
  window.cpShowProgResumen = function () {
    const u = prog && prog.ultima;
    if (!u) return;
    const o = document.createElement("div");
    o.className = "cp-modal";
    o.innerHTML = `<div class="cp-modal-box imp-box">
      <div class="cp-modal-title">Actualización ${u.manual ? "de prueba" : "programada"}</div>
      <div class="cp-modal-txt"><small>${fmtDay(u.dia || u.fecha.slice(0, 10))} a las ${horaEs(u.fecha)}${u.quien ? ` · ${esc(u.quien)}` : ""}</small></div>
      <div class="cp-modal-txt cp-prog-res">${esc((u.resumen || []).join("\n\n")) || "No había equipos con iden."}</div>
      <button class="cp-modal-btn cp-modal-main">Cerrar</button>
    </div>`;
    o.addEventListener("click", (e) => { if (e.target === o || e.target.classList.contains("cp-modal-main")) o.remove(); });
    document.body.appendChild(o);
  };
  // Lanza ahora la misma actualización que hará el servidor a la hora elegida
  window.cpProbarProg = async function () {
    if (updating) return;
    const sb = window.nva && window.nva.cliente;
    if (!sb || !navigator.onLine) { alert("Sin conexión con Supabase."); return; }
    if (!confirm("Se hará ahora en el servidor la misma actualización que la programada (descargar los PDF, comprobar cambios y pasar resultados). Puede tardar un par de minutos.\n\n¿Seguir?")) return;
    updating = true;
    mostrarCargando("Actualizando en el servidor (puede tardar un par de minutos)...");
    let msg;
    try {
      const { data, error } = await sb.functions.invoke("actualizar-calendarios", { body: { ahora: true } });
      if (error) {
        msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch (e) {}
        msg = `No se pudo hacer la actualización: ${msg}.`;
      } else msg = "Actualización terminada:\n\n" + ((data && data.ultima && data.ultima.resumen) || []).join("\n\n");
    } catch (e) { console.error(e); msg = "No se pudo hacer la actualización: error de conexión."; }
    finally { updating = false; ocultarCargando(); }
    await fetchFromGitHub();
    await loadProg();
    alert(msg);
  };

  async function fetchFromGitHub() {
    if (typeof ghSettings === "undefined" || !ghSettings.user || !ghSettings.repo || !navigator.onLine) return;
    if (typeof offlineQueue !== "undefined" && offlineQueue.some(op => op.fileName === CP_FILE)) return;
    const headers = {};
    if (ghSettings.token) headers["Authorization"] = `token ${ghSettings.token}`;
    try {
      const res = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${CP_FILE}`, { headers, cache: "no-store" });
      if (!res.ok) return;
      const data = JSON.parse(b64_to_utf8((await res.json()).content));
      if (data && data.teams) { cp = data; revisarEstadosCambios(); saveLocal(); render(); }
    } catch (e) { console.error(`Error al cargar ${CP_FILE}:`, e); }
  }

  // Acceso para otras partes de la app (partidos de la semana para las Stories)
  window.cpGetData = () => cp;
  window.cpGetRange = () => ({ from: (document.getElementById("cpFrom") || {}).value || "", to: (document.getElementById("cpTo") || {}).value || "" });
  window.cpRefreshFromGitHub = () => fetchFromGitHub();

  function init() {
    const from = document.getElementById("cpFrom"), to = document.getElementById("cpTo");
    if (!from) return;
    // Por defecto: sábado y domingo de la semana siguiente a la actual
    const sat = new Date(); sat.setHours(12, 0, 0, 0);
    sat.setDate(sat.getDate() - ((sat.getDay() + 6) % 7) + 7 + 5);
    const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
    from.value = isoDay(sat); to.value = isoDay(sun);
    from.addEventListener("change", onFromChange);
    to.addEventListener("change", onToChange);
    updateRangeLabel();
    document.getElementById("cpFileInput").addEventListener("change", (e) => onFile(e.target));
    let open = false; try { open = localStorage.getItem(CP_OPEN) === "1"; } catch (e) {}
    initSubs();
    initDrag();
    setOpen(open);
    renderMatches();
    fetchFromGitHub();
    loadProg();
    // Al volver a la app (p. ej. por la mañana) se recogen los cambios de la actualización programada
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { fetchFromGitHub(); loadProg(); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
