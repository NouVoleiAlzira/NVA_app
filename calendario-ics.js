/* =====================================================================
   Tablón de Consultas › Calendario de encuentros (.ics)
   Se eligen uno o varios equipos y se descarga un archivo iCalendar con
   sus partidos, para importarlo en Google Calendar, Outlook o el
   calendario del móvil. Los partidos salen de «Calendario de partidos»
   (PDF de la federación ya leídos), con el cambio local/visitante hecho
   a mano aplicado. Las horas propuestas o los partidos movidos en la
   línea temporal NO se exportan: solo fecha y hora oficiales.
   - Cada partido tiene un identificador fijo (UID): si se vuelve a
     importar el archivo, el calendario actualiza el partido en vez de
     duplicarlo (Google y Outlook lo hacen así).
   - Partido sin hora oficial: evento de todo el día «hora por confirmar».
   - Un equipo puede tener 2 partidos el mismo día: salen los dos.
   ===================================================================== */
(function () {
  "use strict";

  const SEL_KEY = "NVA_ICS_SEL";
  const DUR = 120;   // minutos que dura un partido en el calendario
  const esc = (v) => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v == null ? "" : v));
  const pad = (n) => String(n).padStart(2, "0");
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDay = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
  const hasTime = (m) => !!m.time && m.time !== "00:00";
  const isRest = (m) => /DESCANS/i.test(m.rival || "") || /\bDESCANSA\b/i.test(m.raw || "");
  const norm = (x) => (typeof normalizeTeamName === "function" ? normalizeTeamName(x) : String(x || "").toUpperCase());
  const moveKey = (key, m) => [key, m.date, m.rival || "", m.jornada || ""].join("|");

  let periodo = "proximos";   // "proximos" (desde hoy) o "todo" (toda la temporada)

  function datos() { return (window.cpGetData && window.cpGetData()) || { teams: {} }; }
  function cargarSel() { try { const s = JSON.parse(localStorage.getItem(SEL_KEY)); return Array.isArray(s) ? s : null; } catch (e) { return null; } }
  function guardarSel(s) { try { localStorage.setItem(SEL_KEY, JSON.stringify(s)); } catch (e) {} }

  function teamObj(key) { return ((typeof appData !== "undefined" && appData.teams) || []).find(t => getTeamKey(t) === key); }
  function teamCoaches(key) {
    const coaches = (typeof appData !== "undefined" && appData.coaches) || [];
    return coaches.filter(c => (c.teams || []).some(ref => {
      if (ref === key) return true;
      const t = ((typeof appData !== "undefined" && appData.teams) || []).find(x => getTeamKey(x) === ref || x.name === ref);
      return !!t && getTeamKey(t) === key;
    })).map(c => c.name);
  }
  // Mismo criterio que «Calendario de partidos»: manda el cambio a mano; si no, el pabellón (Palau = casa)
  function isHome(cp, key, m) {
    const mk = moveKey(key, m);
    if (cp.homeOv && mk in cp.homeOv) return cp.homeOv[mk] === true;
    return m.venue ? /PALAU/i.test(m.venue) : m.home === true;
  }

  // Partidos de los equipos elegidos (sin descansos), ordenados por fecha
  function partidos(keys, desde) {
    const cp = datos(), out = [];
    keys.forEach(key => {
      const lista = ((cp.teams[key] || {}).matches || []).filter(m => m.date && !isRest(m));
      lista.forEach(m => {
        if (desde && m.date < desde) return;
        out.push({ key, m, home: isHome(cp, key, m), mk: moveKey(key, m) });
      });
    });
    // Partido entre dos equipos del club elegidos: una sola entrada (la del local; si no se sabe, la primera)
    const t = (k) => { const o = teamObj(k); return o ? o.name : k; };
    const mismo = (p, q) => q !== p && q.key !== p.key && q.m.date === p.m.date && (q.m.time || "") === (p.m.time || "") &&
      norm(q.m.rival) === norm(t(p.key)) && norm(p.m.rival) === norm(t(q.key));
    const unicos = out.filter((p, i) => !out.some((q, j) => mismo(p, q) && (q.home !== p.home ? q.home : j < i)));
    return unicos.sort((a, b) => (a.m.date + (hasTime(a.m) ? a.m.time : "99")).localeCompare(b.m.date + (hasTime(b.m) ? b.m.time : "99")) || a.key.localeCompare(b.key));
  }

  // ---------- iCalendar (RFC 5545) ----------
  const icsText = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
  // Líneas de 75 octetos como máximo (sin partir un carácter UTF-8)
  function fold(line) {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const parts = []; let cur = "", len = 0, max = 75;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      if (len + n > max) { parts.push(cur); cur = ""; len = 0; max = 74; }   // la continuación empieza con un espacio
      cur += ch; len += n;
    }
    parts.push(cur);
    return parts.join("\r\n ");
  }
  const compact = (iso) => iso.replace(/-/g, "");
  const hhmm = (min) => `${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
  const toMin = (t) => { const [h, mi] = t.split(":").map(Number); return h * 60 + mi; };
  const nextDay = (iso) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + 1); return isoDay(d); };
  function utcStamp(d) {
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  }
  // Identificador fijo de un partido: equipo + jornada + rival (así, si cambia la fecha, se actualiza)
  function hash(s) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
    return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }

  const VTIMEZONE = [
    "BEGIN:VTIMEZONE", "TZID:Europe/Madrid", "X-LIC-LOCATION:Europe/Madrid",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
    "END:VTIMEZONE"
  ];

  function construirIcs(lista, nombreCal) {
    const now = new Date(), stamp = utcStamp(now);
    const seq = Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 60000);   // sube en cada exportación: el calendario coge la versión nueva
    const res = window.cpParseResult || (() => null);
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nou Volei Alzira//NVA app//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "X-WR-CALNAME:" + icsText(nombreCal), "X-WR-TIMEZONE:Europe/Madrid"].concat(VTIMEZONE);
    const usados = {};
    lista.forEach((p, i) => {
      const { key, m, home } = p;
      const rival = m.rival || "Rival por confirmar";
      const titulo = "🏐 " + (home ? `${key} vs ${rival}` : `${rival} vs ${key}`);
      let base = m.jornada ? [key, "J" + m.jornada, norm(rival)].join("|") : [key, m.date, norm(rival)].join("|");
      usados[base] = (usados[base] || 0) + 1;
      if (usados[base] > 1) base += "|" + usados[base];   // mismo rival dos veces el mismo día / jornada
      const coaches = teamCoaches(key), r = res(m.raw);
      const desc = [
        home ? "🏠 Local" : "🚌 Visitante",
        m.jornada ? "Jornada " + m.jornada : "",
        hasTime(m) ? "" : "Hora por confirmar",
        coaches.length ? "Entrenador/a: " + coaches.join(", ") : "",
        r ? `Resultado: ${r.setsL}-${r.setsV}` + (r.sets.length ? " (" + r.sets.map(s => s.local + "-" + s.visitante).join(", ") + ")" : "") : ""
      ].filter(Boolean).join("\n");
      const lugar = m.venue || (home ? "Palau d'Esports d'Alzira" : "");
      L.push("BEGIN:VEVENT", "UID:nva-" + hash(base) + "@nouvoleialzira.github.io", "DTSTAMP:" + stamp, "SEQUENCE:" + seq);
      if (hasTime(m)) {
        const ini = toMin(m.time);
        let fin = ini + DUR;
        // Dos partidos seguidos del mismo equipo ese día: el primero acaba cuando empieza el segundo
        const sig = lista.slice(i + 1).find(q => q.key === key && q.m.date === m.date && hasTime(q.m) && toMin(q.m.time) > ini);
        if (sig) fin = Math.min(fin, toMin(sig.m.time));
        let diaFin = m.date;
        if (fin >= 24 * 60) { fin -= 24 * 60; diaFin = nextDay(m.date); }
        L.push(`DTSTART;TZID=Europe/Madrid:${compact(m.date)}T${hhmm(ini)}`, `DTEND;TZID=Europe/Madrid:${compact(diaFin)}T${hhmm(fin)}`);
      } else {
        L.push(`DTSTART;VALUE=DATE:${compact(m.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(m.date))}`);
      }
      L.push("SUMMARY:" + icsText(titulo + (hasTime(m) ? "" : " (hora por confirmar)")));
      if (lugar) L.push("LOCATION:" + icsText(lugar));
      L.push("DESCRIPTION:" + icsText(desc), "CATEGORIES:" + icsText(key), "TRANSP:OPAQUE", "STATUS:" + (hasTime(m) ? "CONFIRMED" : "TENTATIVE"), "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return L.map(fold).join("\r\n") + "\r\n";
  }
  window.nvaConstruirIcs = (keys, desde) => construirIcs(partidos(keys, desde), "Partidos NVA");   // para pruebas

  // ---------- Ventana ----------
  function equipos() {
    const cp = datos();
    return Object.keys(cp.teams || {}).filter(k => ((cp.teams[k] || {}).matches || []).some(m => m.date && !isRest(m)))
      .sort((a, b) => a.localeCompare(b, "es"));
  }
  const desdeFecha = () => (periodo === "proximos" ? isoDay(new Date()) : "");
  function elegidos() {
    return Array.from(document.querySelectorAll("#icsEquipos input:checked")).map(i => i.value);
  }
  function pintar() {
    const box = document.getElementById("icsEquipos");
    if (!box) return;
    document.querySelectorAll("#modalIcs .ics-per").forEach(b => b.classList.toggle("on", b.dataset.p === periodo));
    const lista = equipos();
    if (!lista.length) {
      box.innerHTML = '<p class="hist-vacio">Aún no hay calendarios. Súbelos en «Calendario de partidos › Equipos · PDF Competición».</p>';
      actualizar(); return;
    }
    const prev = cargarSel(), sel = new Set(prev === null ? [] : prev), desde = desdeFecha();
    box.innerHTML = lista.map(k => {
      const n = partidos([k], desde).length;
      return `<label class="anul-part"><input type="checkbox" value="${esc(k)}"${sel.has(k) ? " checked" : ""}>
        <span><b>${esc(k)}</b><br><small>${n ? n + (n === 1 ? " partido" : " partidos") : "sin partidos" + (desde ? " pendientes" : "")}</small></span></label>`;
    }).join("");
    box.querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
      guardarSel(elegidos()); actualizar();
    }));
    actualizar();
  }
  function actualizar() {
    const keys = elegidos(), n = keys.length ? partidos(keys, desdeFecha()).length : 0;
    const est = document.getElementById("icsEstado");
    if (est) est.textContent = keys.length ? `${keys.length} ${keys.length === 1 ? "equipo" : "equipos"} · ${n} ${n === 1 ? "partido" : "partidos"}` : "Marca uno o varios equipos.";
    ["icsBtnDescargar", "icsBtnCompartir"].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = !n; });
    const comp = document.getElementById("icsBtnCompartir");
    if (comp) comp.hidden = !(navigator.canShare && navigator.canShare({ files: [new File(["x"], "a.ics", { type: "text/calendar" })] }));
  }
  function archivo() {
    const keys = elegidos();
    const lista = partidos(keys, desdeFecha());
    if (!lista.length) { alert("No hay partidos para esos equipos."); return null; }
    const nombreCal = keys.length === 1 ? `Partidos ${keys[0]}` : "Partidos NVA";
    const slug = (keys.length === 1 ? keys[0] : "NVA").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return new File([construirIcs(lista, nombreCal)], `Partidos_${slug}_${isoDay(new Date())}.ics`, { type: "text/calendar;charset=utf-8" });
  }

  window.icsAbrir = async function () {
    document.getElementById("modalIcs").classList.add("active");
    pintar();
    // Se recogen los últimos calendarios del servidor y se repinta
    try { if (window.cpRefreshFromGitHub) { await window.cpRefreshFromGitHub(); pintar(); } } catch (e) {}
  };
  window.icsCerrar = function () { document.getElementById("modalIcs").classList.remove("active"); };
  window.icsPeriodo = function (p) { periodo = p; pintar(); };
  window.icsTodos = function (on) {
    document.querySelectorAll("#icsEquipos input").forEach(i => { i.checked = on; });
    guardarSel(elegidos()); actualizar();
  };
  window.icsDescargar = function () {
    const f = archivo();
    if (!f) return;
    const url = URL.createObjectURL(f), a = document.createElement("a");
    a.href = url; a.download = f.name; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  window.icsCompartir = async function () {
    const f = archivo();
    if (!f) return;
    try { await navigator.share({ files: [f], title: f.name }); }
    catch (e) { if (e.name !== "AbortError") { alert("No se pudo compartir. Se descarga el archivo."); window.icsDescargar(); } }
  };
})();
