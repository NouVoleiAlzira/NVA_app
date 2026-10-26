// =====================================================================
//  LECTURA DE LOS PDF DE PARTIDOS DE LA FEDERACIÓN (código compartido)
//  Lo usan la app (calendario-partidos.js, en el navegador) y la función
//  de Supabase actualizar-calendarios (actualización programada), para que
//  las dos lean los PDF, detecten cambios y saquen resultados igual.
//  - En el navegador se carga con <script> y queda en window.nvaCalLectura.
//  - En la función se importa («import "../_shared/lectura-calendarios.js"»)
//    y queda en globalThis.nvaCalLectura.
//  Solo funciones puras: nada de pantalla, avisos ni guardado.
// =====================================================================
(function (raiz) {
  "use strict";
  const pad = (n) => String(n).padStart(2, "0");

  // Igual que normalizeTeamName() y sanitizeFileName() de app.js
  function normalizeTeamName(n) {
    return (n || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  }
  function sanitizeFileName(name) {
    if (!name) return "general";
    return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  }
  const moveKey = (team, m) => [team, m.date, m.rival || "", m.jornada || ""].join("|");

  // ---------- Texto del PDF en líneas y celdas (pdf.js) ----------
  async function pdfLines(pdf) {
    const out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent();
      const lines = [];
      content.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const y = it.transform[5], x = it.transform[4];
        let line = lines.find(l => Math.abs(l.y - y) < 2.5);
        if (!line) { line = { y, items: [] }; lines.push(line); }
        line.items.push({ x, w: it.width || 0, str: it.str.trim() });
      });
      lines.sort((a, b) => b.y - a.y);
      lines.forEach(l => {
        l.items.sort((a, b) => a.x - b.x);
        // Celdas: textos separados por un hueco grande son columnas distintas
        const cells = [];
        let prevEnd = -1e9;
        l.items.forEach(it => {
          if (cells.length && it.x - prevEnd < 6) cells[cells.length - 1] += " " + it.str;
          else cells.push(it.str);
          prevEnd = it.x + it.w;
        });
        out.push({ text: l.items.map(i => i.str).join(" ").replace(/\s+/g, " "), cells: cells.map(c => c.replace(/\s+/g, " ").trim()) });
      });
    }
    return out;
  }

  const RE_DATE = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/;
  const RE_TIME = /\b(\d{1,2})[:.h](\d{2})\b(?![\/\-.]\d)/;
  const RE_JOR = /JORNADA\s*(\d+)/i;

  function parseDate(s) {
    const m = s.match(RE_DATE);
    if (!m) return "";
    let y = parseInt(m[3], 10); if (y < 100) y += 2000;
    const mo = parseInt(m[2], 10), d = parseInt(m[1], 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  function parseTime(s) {
    const clean = s.replace(new RegExp(RE_DATE.source, "g"), " ");
    const m = clean.match(RE_TIME);
    if (!m) return "";
    const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : "";
  }
  const isDataCell = (c) => !/[A-Za-zÀ-ÿ]{2,}/.test(c.replace(RE_DATE, "").replace(/\bh\b/i, ""));
  const tokens = (n) => normalizeTeamName(n).split(" ").filter(Boolean);

  // Cuántas palabras del nombre buscado aparecen en el texto (0..1)
  function score(name, text) {
    const t = " " + normalizeTeamName(text) + " ";
    const tk = tokens(name);
    if (!tk.length) return 0;
    if (t.includes(" " + tk.join(" ") + " ")) return 1;
    return tk.filter(w => t.includes(" " + w + " ")).length / tk.length;
  }

  // Posibles nombres de equipo en celdas de líneas con fecha (para elegir si no se encuentra)
  function candidateNames(lines) {
    const count = {};
    lines.forEach(l => {
      if (!RE_DATE.test(l.text) && !RE_TIME.test(l.text)) return;
      l.cells.forEach(c => {
        if (isDataCell(c) || c.length < 3 || RE_JOR.test(c)) return;
        c.split(/\s+-\s+/).forEach(part => {
          const k = part.trim(); if (k.length >= 3) count[k] = (count[k] || 0) + 1;
        });
      });
    });
    return Object.keys(count).filter(k => count[k] >= 2).sort((a, b) => count[b] - count[a]);
  }

  // Los equipos del club pueden aparecer como «NVA» o «Nou Volei Alzira»
  const isClubName = (n) => /\bNVA\b|NOU VOLE[IY]S? ALZIRA/.test(normalizeTeamName(n));
  function findFedName(lines, team) {
    const names = candidateNames(lines);
    const club = names.filter(isClubName);
    const wanted = [team.name, `${team.name} ${team.category}`];
    const sc = (n) => Math.max(...wanted.map(w => score(w, n)));
    let best = null;
    if (club.length === 1) best = club[0];
    else {
      const pool = (club.length ? club : names).map(n => ({ n, s: sc(n) })).sort((x, y) => y.s - x.s);
      if (pool.length && pool[0].s >= 0.99 && !(pool[1] && pool[1].s >= pool[0].s)) best = pool[0].n;
      else if (club.length && pool[0].s >= 0.5 && !(pool[1] && pool[1].s >= pool[0].s)) best = pool[0].n;
    }
    // Para preguntar: primero los del club
    return { best, names: club.concat(names.filter(n => !club.includes(n))) };
  }
  // El nombre con que se reconoció el equipo la última vez, si sigue en el PDF
  function previousFedName(lines, prev) {
    return prev && prev.fedName && lines.some(l => normalizeTeamName(l.text).includes(normalizeTeamName(prev.fedName))) ? prev.fedName : null;
  }

  function extractMatches(lines, fed) {
    const fedN = normalizeTeamName(fed);
    const matches = [];
    let curDate = "", curJor = "";
    lines.forEach((l, i) => {
      const jm = l.text.match(RE_JOR); if (jm) curJor = jm[1];
      const d = parseDate(l.text);
      if (d && !normalizeTeamName(l.text).includes(fedN)) curDate = d; // cabecera de jornada con fecha
      if (!normalizeTeamName(l.text).includes(fedN)) return;
      // Fecha/hora en la línea, o en la siguiente/anterior si el PDF las parte
      const near = [l, lines[i + 1], lines[i - 1]].filter(Boolean);
      let date = d, time = parseTime(l.text);
      if (!date) date = curDate;
      if (!time) { const n = near.slice(1).find(x => parseTime(x.text) && !/[A-Za-z]{3,}/.test(x.text.replace(RE_TIME, ""))); time = n ? parseTime(n.text) : ""; }
      if (!date) return;
      // Celdas de texto (equipos, campo): separar también "LOCAL - VISITANTE"
      let parts = [];
      l.cells.forEach(c => {
        if (isDataCell(c) || RE_JOR.test(c)) return;
        c.replace(RE_DATE, "").replace(RE_TIME, "").split(/\s+-\s+(?=[A-Za-zÀ-ÿ0-9]{2,})/).forEach(p => { p = p.trim(); if (/[A-Za-zÀ-ÿ]{2,}/.test(p)) parts.push(p); });
      });
      const own = parts.findIndex(p => normalizeTeamName(p).includes(fedN));
      let rival = "", home = null, venue = "";
      if (own >= 0) {
        const ownIsWholeCell = normalizeTeamName(parts[own]) === fedN;
        if (!ownIsWholeCell) { // "NVA A ALGEMESI" en una sola celda: el rival es el resto
          const rest = parts[own].replace(new RegExp(fed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "").replace(/^\s*-\s*|\s*-\s*$/g, "").trim();
          if (rest) { rival = rest; home = normalizeTeamName(parts[own]).indexOf(fedN) === 0; }
        }
        if (!rival) {
          if (own > 0 && (own === parts.length - 1 || own % 2 === 1)) { rival = parts[own - 1]; home = false; venue = parts.slice(own + 1).join(" · "); }
          else if (parts[own + 1]) { rival = parts[own + 1]; home = true; venue = parts.slice(own + 2).join(" · "); }
        } else venue = parts.slice(own + 1).join(" · ");
      }
      // Rival y pabellón pegados en la misma celda ("NOU ALGEMESÍ PAV. 9 OCTUBRE (ALGEMESÍ)")
      if (rival && !venue) {
        const vm = rival.match(/^(.+?)\s+((?:PAB|PAV|PABELL[OÓ]N|POLIDEPORTIVO|POLIESPORTIU|PALAU|PISTAS?|CAMPO|COMPLEJO|CIUTAT|ESTADI|CENTRO|CENTRE|COLEGIO|INSTITUTO|IES|CEIP)\b.*)$/i);
        if (vm && /[A-Za-zÀ-ÿ]{2,}/.test(vm[1])) { rival = vm[1].trim(); venue = vm[2].trim(); }
      }
      if (/DESCANS/i.test(rival) || /\bDESCANSA\b/i.test(l.text)) return;   // jornada de descanso
      matches.push({ date, time, rival, home, venue, jornada: curJor, raw: l.text });
    });
    // Sin duplicados (mismo día y rival)
    const seen = new Set();
    return matches.filter(m => { const k = m.date + m.time + m.rival; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }

  // ---------- Cambios entre lo guardado y el PDF nuevo ----------
  // Solo cuentan los cambios de FECHA, HORA o CAMPO (pabellón);
  // otras diferencias del PDF (nombre del rival, resultados...) no son cambios.
  // Los partidos se emparejan por jornada y local/visitante, o por rival parecido.
  const nrm = (t) => normalizeTeamName(t || "");
  function rivalLike(a, b) {
    const x = nrm(a), y = nrm(b);
    if (!x || !y) return x === y;   // los dos sin rival (p. ej. partido aún sin rival asignado)
    return x === y || x.startsWith(y) || y.startsWith(x);
  }
  function venueChanged(o, n) {
    const ov = nrm(o.venue), nv = nrm(n.venue);
    if (!nv || ov === nv) return false;                 // sin campo en el PDF nuevo: no se considera cambio
    if (!ov && nrm(o.rival).includes(nv)) return false; // antes el campo venía pegado al nombre del rival
    return true;
  }
  function significantChange(o, n) {
    return o.date !== n.date || (o.time || "") !== (n.time || "") || venueChanged(o, n);
  }
  function pairMatches(oldList, newList) {
    const olds = (oldList || []).slice(), used = new Set(), pairs = [], adds = [];
    (newList || []).forEach(n => {
      let best = -1, bestScore = 0;
      olds.forEach((o, k) => {
        if (used.has(k) || !!o.home !== !!n.home) return;
        let sc = 0;
        if (o.jornada && n.jornada && String(o.jornada) === String(n.jornada)) sc += 4;
        if (rivalLike(o.rival, n.rival)) sc += 2;
        if (!sc) return;
        if (o.date === n.date) sc += 1;
        if (sc > bestScore) { bestScore = sc; best = k; }
      });
      if (best >= 0) { used.add(best); pairs.push([olds[best], n]); } else adds.push(n);
    });
    return { pairs, adds, dels: olds.filter((o, k) => !used.has(k)) };
  }
  function diffMatches(oldList, newList) {
    const slim = (m) => ({ date: m.date, time: m.time, rival: m.rival, home: !!m.home, venue: m.venue || "" });
    const r = pairMatches(oldList, newList), out = [];
    r.pairs.forEach(([o, n]) => { if (significantChange(o, n)) out.push({ type: "mod", before: slim(o), after: slim(n) }); });
    r.adds.forEach(n => out.push({ type: "add", after: slim(n) }));
    r.dels.forEach(o => out.push({ type: "del", before: slim(o) }));
    const d = (c) => (c.after || c.before).date + (c.after || c.before).time;
    return out.sort((a, b) => d(a).localeCompare(d(b)));
  }
  // ¿Son los mismos partidos? (sin cambios de fecha, hora ni campo)
  const sameMatches = (a, b) => diffMatches(a, b).length === 0;

  // Si el PDF escribe distinto el rival o la jornada, los partidos movidos y los cambios
  // local/visitante del equipo siguen apuntando al mismo partido.
  function migrarClaves(cp, key, oldList, newList) {
    pairMatches(oldList, newList).pairs.forEach(([o, n]) => {
      const a = moveKey(key, o), b = moveKey(key, n);
      if (a === b) return;
      [cp.moved, cp.homeOv, cp.homeBy].forEach(map => { if (map && a in map && !(b in map)) { map[b] = map[a]; delete map[a]; } });
    });
  }

  // Guarda en cp (CalendarioPartidos.json) los partidos leídos de un equipo.
  // Devuelve "sin cambios", "con cambios" o "nuevo".
  function aplicarLectura(cp, key, fed, matches, fileName, now) {
    now = now || new Date().toISOString();
    const prev = cp.teams[key];
    if (prev && prev.fedName === fed && sameMatches(prev.matches, matches)) {
      prev.changeStatus = "sin";
      migrarClaves(cp, key, prev.matches, matches);
      prev.matches = matches;   // mismos partidos; se guarda el texto nuevo (p. ej. con los resultados)
      prev.changedAt = prev.changedAt || prev.uploadedAt;
      prev.checkedAt = now;
      cp.updated = now;
      return "sin cambios";
    }
    cp.teams[key] = { fedName: fed, fileName, uploadedAt: now, matches, changeStatus: prev ? "con" : "nuevo", changedAt: now, checkedAt: now };
    if (prev) cp.teams[key].changes = diffMatches(prev.matches, matches);
    cp.updated = now;
    return prev ? "con cambios" : "nuevo";
  }

  // ---------- Resultados para los registros de partido ----------
  // Resultado del texto de la fila del PDF: "LOCAL 3 - 1 (25-20/18-25/25-22/25-19) VISITANTE"
  function parseResult(raw) {
    const m = String(raw || "").match(/\s(\d)\s*-\s*(\d)\s*\(([\d\s\-\/]+)\)/);
    if (!m) return null;
    const sets = m[3].split("/").map(x => x.trim().match(/^(\d+)\s*-\s*(\d+)$/)).filter(Boolean)
      .map(x => ({ local: parseInt(x[1], 10), visitante: parseInt(x[2], 10) }));
    return { setsL: parseInt(m[1], 10), setsV: parseInt(m[2], 10), sets };
  }
  // Partidos con resultado de esos equipos (con el cambio local/visitante aplicado)
  function playedMatches(cp, keys) {
    const out = [];
    keys.forEach(key => {
      ((cp.teams[key] || {}).matches || []).forEach(m => {
        const res = parseResult(m.raw);
        if (!res || !m.date) return;
        const mk = moveKey(key, m);
        const home = cp.homeOv && mk in cp.homeOv ? cp.homeOv[mk] : m.home !== false;
        out.push({ key, fecha: m.date, rival: m.rival || "", home, res });
      });
    });
    return out;
  }
  function buildMarcador(p, setsCount) {
    return {
      local: p.home ? p.key : p.rival,
      visitante: p.home ? p.rival : p.key,
      sets: Array.from({ length: setsCount }, (_, i) => p.res.sets[i] || { local: null, visitante: null }),
      setsLocal: p.res.setsL,
      setsVisitante: p.res.setsV
    };
  }
  const numOrNull = (v) => (v === "" || v == null || isNaN(+v)) ? null : +v;
  // Texto del marcador para comparar y para enseñarlo: "3-1 (25-20, 18-25, 25-22, 25-19)"
  function marcadorTxt(m) {
    if (!m) return "";
    const sets = (m.sets || []).map(x => [numOrNull(x && x.local), numOrNull(x && x.visitante)])
      .filter(x => x[0] != null || x[1] != null).map(x => `${x[0] ?? "-"}-${x[1] ?? "-"}`);
    const tot = numOrNull(m.setsLocal) == null && numOrNull(m.setsVisitante) == null ? "" : `${numOrNull(m.setsLocal) ?? "-"}-${numOrNull(m.setsVisitante) ?? "-"}`;
    return (tot + (sets.length ? ` (${sets.join(", ")})` : "")).trim();
  }
  // Registro de partido de un equipo y un día (Partidos/Partidos_<equipo>_<fecha>.json)
  const rutaRegistro = (key, fecha) => `Partidos/Partidos_${sanitizeFileName(key)}_${fecha}.json`;

  raiz.nvaCalLectura = {
    normalizeTeamName, sanitizeFileName, moveKey, pdfLines, parseDate, parseTime,
    findFedName, previousFedName, extractMatches, significantChange, pairMatches, diffMatches,
    sameMatches, migrarClaves, aplicarLectura, parseResult, playedMatches, buildMarcador,
    marcadorTxt, rutaRegistro, MATCH_SETS_COUNT: 5
  };
})(typeof window !== "undefined" ? window : globalThis);
