// ===== Página de delegados =====
// Página principal propia para los delegados de los equipos (rol Delegado).
// Se ve con el botón 🪪 de la cabecera, o directamente si el rol solo tiene
// esta página (nva-supabase.js decide qué página se muestra).
// Cada bloque tiene su permiso en Opciones › Permisos por rol › Página de
// delegados. Por ahora:
//   · Calendario (delegados.calendario): el horario de la
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
  const ESTILO_TARJETA = "mezcla";    // diseño de la imagen al «Enviar imagen» (tarjeta-partido.js)
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
  // Escudos y patrocinador del partido (Configuración › Escudos, como las Stories)
  const imagen = src => !src ? Promise.resolve(null) : new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  async function escudosPartido(p) {
    const t = ((datos() || {}).teams || []).find(x => getTeamKey(x) === p.key) || { name: p.key, category: "" };
    const nva = { nombre: t.name, logo: null, club: true }, rival = { nombre: p.rival || "?", logo: null };
    let patro = null;
    const S = window.nvaSemana;
    try {
      if (S && S.cargarFichas) {
        const f = await S.cargarFichas();
        const fn = f.nva.find(x => x.key === p.key) || S.buscarFicha(f.nva, t.name, t.category);
        const nombreRival = S.limpiarClub ? S.limpiarClub(p.rival || "") : p.rival;
        const fr = S.buscarFicha(f.otros, nombreRival, t.category) || S.buscarFicha(f.nva.filter(x => x !== fn), nombreRival, t.category);
        if (fn) { nva.nombre = fn.equipo || nva.nombre; nva.logo = await imagen(fn.logo); patro = await imagen(fn.patro); }
        if (fr) rival.logo = await imagen(fr.logo);
      }
    } catch (e) { console.warn("Escudos:", e); }
    if (!nva.logo) nva.logo = await imagen("LOGOs/LOGO NVA 800x800.png");
    return { nva, rival, patro, categoria: t.category || "" };
  }
  function verPartido(h) {
    const p = h.partido, m = p.m || {};
    const L = window.nvaCalLectura || {};
    const nuestro = nombreEquipo(p.key), rival = p.rival || "?";
    const local = p.casa ? nuestro : rival, visitante = p.casa ? rival : nuestro;
    const jor = jornadaDe(m);
    const cuando = diaLargo(m.date) + (conHora(m) ? " · " + m.time : "");
    const res = L.parseResult ? L.parseResult(m.raw) : null;
    const sets = res && res.sets && res.sets.length ? res.sets.map(s => `${s.local}-${s.visitante}`).join(" / ") : "";
    const sede = campoDe(m);   // el pabellón real; sin él, solo «Local»/«Visitante»
    const mapa = sede ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(sede) : "";
    const motivo = p.anulado ? "Anulado" + (p.motivo ? " · " + (((window.nvaIcoMotivo && window.nvaIcoMotivo(p.motivo)) || "") + " " + p.motivo).trim() : "") : "";

    // Tarjeta: fecha·hora y jornada / local / resultado (pastilla) y sets / visitante / campo (Google Maps)
    const { c, fila } = tarjeta();
    cabecera(fila, cuando, jor ? "Jornada " + jor : "Partido");
    fila("cp-ficha-eq", local);
    const marcador = fila("dlg-ficha-marcador", "");
    const pastilla = document.createElement("span");
    pastilla.className = "dlg-ficha-pastilla" + (res ? "" : " vs");
    pastilla.textContent = res ? `${res.setsL} - ${res.setsV}` : "VS";
    marcador.appendChild(pastilla);
    if (sets) { const x = document.createElement("span"); x.className = "dlg-ficha-sets"; x.textContent = sets; marcador.appendChild(x); }
    fila("cp-ficha-eq", visitante);
    const campo = fila("cp-ficha-campo", "");
    if (mapa) {
      const a = document.createElement("a");
      a.href = mapa; a.target = "_blank"; a.rel = "noopener"; a.className = "dlg-ficha-mapa";
      a.textContent = "📍 " + p.campo;
      campo.appendChild(a);
    } else campo.textContent = "📍 " + p.campo;
    if (motivo) fila("cp-ficha-aviso dlg-ficha-anulado", "🚫 " + motivo);

    // Imagen de la tarjeta: se prepara al abrir para compartirla dentro del mismo toque
    let archivo = null, avisarLista = null;
    const lista = new Promise(ok => { avisarLista = ok; });   // se cumple cuando la imagen está hecha (o ha fallado)
    const nombreImg = ("partido-" + (m.date || "") + "-" + nuestro).replace(/[^\w.-]+/g, "_").slice(0, 80) + ".png";
    if (window.nvaTarjetaPartido) {
      escudosPartido(p).then(e => window.nvaTarjetaPartido.dibujar({
        cuando, jornada: jor || "", categoria: e.categoria,
        local: p.casa ? e.nva : e.rival, visitante: p.casa ? e.rival : e.nva,
        res: res ? { l: res.setsL, v: res.setsV } : null, sets,
        campo: p.campo || "", patro: e.patro, anulado: !!p.anulado, motivo: p.motivo || ""
      }, ESTILO_TARJETA))
        .then(cv => new Promise(ok => cv.toBlob(ok, "image/png")))
        .then(b => { if (b) archivo = new File([b], nombreImg, { type: "image/png" }); })
        .catch(e => console.error("tarjeta-partido", e))
        .finally(() => avisarLista());
    } else avisarLista();
    // En el cuerpo del mensaje va el enlace del campo
    const cuerpo = "📍 " + p.campo + (mapa ? "\n" + mapa : "");
    const enviarImagen = () => {
      if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
        navigator.share({ files: [archivo], text: cuerpo }).catch(e => { if (e && e.name !== "AbortError") console.error(e); });
        return;
      }
      // Sin compartir archivos (p. ej. ordenador): se descarga la imagen y se abre WhatsApp con el texto
      if (archivo) {
        const u = URL.createObjectURL(archivo), a = document.createElement("a");
        a.href = u; a.download = nombreImg; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 4000);
      }
      window.open("https://wa.me/?text=" + encodeURIComponent(cuerpo), "_blank", "noopener");
    };
    nvaAviso("", { nodo: c, si: "Enviar al grupo", alAceptar: enviarImagen });
    // El botón no se puede pulsar hasta que la imagen esté creada (si no, solo se enviaría el texto)
    let hecha = false;
    lista.then(() => { hecha = true; });
    const bloquear = (intentos) => {
      if (hecha) return;
      let n = c; while (n && !(n.querySelector && n.querySelector(".nva-dlg-si"))) n = n.parentElement;
      const b = n && n.querySelector(".nva-dlg-si");
      if (!b) { if (intentos > 0) requestAnimationFrame(() => bloquear(intentos - 1)); return; }
      b.disabled = true; b.classList.add("dlg-btn-espera"); b.textContent = "Preparando imagen…";
      lista.then(() => { b.disabled = false; b.classList.remove("dlg-btn-espera"); b.textContent = "Enviar al grupo"; });
    };
    bloquear(120);
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

  // ---------- Cuadrante: el PDF «Partidos y Resultados» que se sube al Drive del club ----------
  // Se dibuja en el móvil con los mismos datos (el PDF de la federación, que ya está en la
  // caché del dispositivo): así no hay que bajarlo de Drive. «Abrir PDF» abre el de Drive.
  const cuad = {};   // clave del equipo -> { blob, url, paginas: [imagen], cuando } o { error }
  let enlacesDrive = null, enlacesCuando = 0, generando = false;
  const nombrePdf = key => `Partidos y Resultados - ${key}.pdf`;

  async function leerEnlaces() {
    if (enlacesDrive && Date.now() - enlacesCuando < RELEER_MS) return enlacesDrive;
    try {
      const r = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/DrivePDFs/enlaces.json`,
        { headers: { "Authorization": `token ${ghSettings.token}` }, cache: "no-store" });
      enlacesDrive = r.ok ? (JSON.parse(b64_to_utf8((await r.json()).content)) || {}) : (enlacesDrive || {});
    } catch (e) { enlacesDrive = enlacesDrive || {}; }
    enlacesCuando = Date.now();
    return enlacesDrive;
  }
  async function paginasPdf(blob) {
    await ensurePdfJs();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({ scale: 2.2 });
      const cv = document.createElement("canvas");
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push(cv.toDataURL("image/jpeg", 0.88));
    }
    return out;
  }
  async function cargarCuadrantes(claves, siHaceMs) {
    if (generando || !window.nvaCuadrante || !window.nvaCuadrante.pdfDeEquipo) return;
    generando = true;
    try {
      leerEnlaces().then(renderCuadrante);
      const logo = typeof nvaLogoDataUrl === "function" ? await Promise.resolve(nvaLogoDataUrl()).catch(() => null) : null;
      for (const key of claves) {
        const c = cuad[key];
        if (c && !(siHaceMs && Date.now() - c.cuando >= siHaceMs)) continue;
        try {
          const blob = await window.nvaCuadrante.pdfDeEquipo(key, logo);
          const paginas = await paginasPdf(blob);
          if (c && c.url) URL.revokeObjectURL(c.url);
          cuad[key] = { blob, url: URL.createObjectURL(blob), paginas, cuando: Date.now() };
        } catch (e) { cuad[key] = { error: e && e.message || String(e), cuando: Date.now() }; }
        renderCuadrante();
      }
    } finally { generando = false; renderCuadrante(); }
  }
  function renderCuadrante() {
    const caja = document.getElementById("dlgCuadrante");
    const body = document.getElementById("secBody_dlgcua");
    if (!caja || !body || body.classList.contains("collapsed") || !puedeVer("delegados.cuadrante")) return;
    const claves = equiposClasif();
    if (!claves.length) {
      caja.innerHTML = `<p class="dlg-vacio">Todavía no tienes equipos asignados. Pídelo en el club (Opciones › Entrenadores y equipos).</p>`;
      return;
    }
    caja.innerHTML = claves.map(key => {
      const c = cuad[key], k = escapeHtml(key);
      let cuerpo;
      if (!c) cuerpo = `<p class="dlg-vacio">Preparando el PDF…</p>`;
      else if (c.error) cuerpo = `<p class="dlg-vacio">No hay PDF de este equipo todavía (${escapeHtml(/no hay PDF/i.test(c.error) ? "el club aún no ha subido su calendario de la federación" : c.error)}).</p>`;
      else cuerpo = `
        <button type="button" class="dlg-cua-vista" data-k="${k}" onclick="dlgVerCuadrante(this.dataset.k)" aria-label="Ver el PDF de ${k} en grande">
          <img src="${c.paginas[0]}" alt="">
          <span class="dlg-cua-lupa">🔍 Toca para ampliar${c.paginas.length > 1 ? ` · ${c.paginas.length} páginas` : ""}</span>
        </button>
        <div class="dlg-cua-botones">
          <button type="button" class="btn-save-session dlg-cua-btn" data-k="${k}" onclick="dlgAbrirCuadrante(this.dataset.k)">Abrir PDF</button>
          <button type="button" class="btn-save-session dlg-cua-btn" data-k="${k}" onclick="dlgDescargarCuadrante(this.dataset.k)">Descargar PDF</button>
        </div>`;
      return `<div class="dlg-cla-bloque">${claves.length > 1 || !misEquipos() ? `<div class="dlg-par-equipo">${k}</div>` : ""}${cuerpo}</div>`;
    }).join("");
    if (claves.some(k => !cuad[k])) cargarCuadrantes(claves);
  }

  // «Abrir PDF»: el de Drive (el mismo enlace que tienen los jugadores/as); si no hay, el del móvil
  window.dlgAbrirCuadrante = function (key) {
    const e = (enlacesDrive || {})[key], c = cuad[key];
    if (e && e.url) window.open(e.url, "_blank", "noopener");
    else if (c && c.url) window.open(c.url, "_blank");
  };
  window.dlgDescargarCuadrante = function (key) {
    const c = cuad[key];
    if (c && c.blob) {
      const a = document.createElement("a");
      a.href = c.url; a.download = nombrePdf(key);
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    const e = (enlacesDrive || {})[key];
    if (e && e.id) window.open("https://drive.google.com/uc?export=download&id=" + encodeURIComponent(e.id), "_blank", "noopener");
  };

  // Ventana a pantalla completa con zoom (pellizcar, doble toque, botones o Ctrl+rueda) y desplazamiento
  window.dlgVerCuadrante = function (key) {
    const c = cuad[key];
    if (!c || !c.paginas) return;
    const o = document.createElement("div");
    o.className = "dlg-visor";
    o.innerHTML = `
      <div class="dlg-visor-barra">
        <span class="dlg-visor-tit">${escapeHtml(key)}</span>
        <button type="button" class="dlg-visor-b" data-z="-" aria-label="Alejar">−</button>
        <span class="dlg-visor-pct">100%</span>
        <button type="button" class="dlg-visor-b" data-z="+" aria-label="Acercar">+</button>
        <button type="button" class="dlg-visor-b dlg-visor-x" aria-label="Cerrar">✕</button>
      </div>
      <div class="dlg-visor-zona"><div class="dlg-visor-hojas">${c.paginas.map((src, i) => `<img src="${src}" alt="Página ${i + 1}" draggable="false">`).join("")}</div></div>
      <div class="dlg-visor-pie">
        <button type="button" class="btn-save-session dlg-cua-btn" data-a="abrir">Abrir PDF</button>
        <button type="button" class="btn-save-session dlg-cua-btn" data-a="bajar">Descargar PDF</button>
      </div>`;
    document.body.appendChild(o);
    const zona = o.querySelector(".dlg-visor-zona"), hojas = o.querySelector(".dlg-visor-hojas"), pct = o.querySelector(".dlg-visor-pct");
    let zoom = 1;
    // Cambia el zoom manteniendo quieto el punto (px, py) de la zona
    const fijar = (z, px, py) => {
      z = Math.max(1, Math.min(5, z));
      if (px == null) { px = zona.clientWidth / 2; py = zona.clientHeight / 2; }
      const fx = (zona.scrollLeft + px) / zona.scrollWidth, fy = (zona.scrollTop + py) / zona.scrollHeight;
      zoom = z;
      hojas.style.width = (z * 100) + "%";
      zona.scrollLeft = fx * zona.scrollWidth - px;
      zona.scrollTop = fy * zona.scrollHeight - py;
      pct.textContent = Math.round(z * 100) + "%";
    };
    const cerrar = () => { document.removeEventListener("keydown", teclas, true); o.remove(); };
    function teclas(e) { if (e.key === "Escape") { e.preventDefault(); cerrar(); } }
    document.addEventListener("keydown", teclas, true);
    o.querySelector(".dlg-visor-x").onclick = cerrar;
    o.querySelectorAll("[data-z]").forEach(b => { b.onclick = () => fijar(zoom * (b.dataset.z === "+" ? 1.4 : 1 / 1.4)); });
    o.querySelector('[data-a="abrir"]').onclick = () => window.dlgAbrirCuadrante(key);
    o.querySelector('[data-a="bajar"]').onclick = () => window.dlgDescargarCuadrante(key);
    const local = (x, y) => { const r = zona.getBoundingClientRect(); return [x - r.left, y - r.top]; };
    // Pellizcar con dos dedos
    let pin = null, ultimoToque = 0;
    zona.addEventListener("touchstart", e => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches;
        pin = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: zoom };
        e.preventDefault();
      } else if (e.touches.length === 1) {
        const ahora = Date.now();
        if (ahora - ultimoToque < 300) {   // doble toque: acercar / volver al 100%
          const [px, py] = local(e.touches[0].clientX, e.touches[0].clientY);
          fijar(zoom > 1.2 ? 1 : 2.5, px, py);
          e.preventDefault();
        }
        ultimoToque = ahora;
      }
    }, { passive: false });
    zona.addEventListener("touchmove", e => {
      if (!pin || e.touches.length !== 2) return;
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const [px, py] = local((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      fijar(pin.z * d / pin.d, px, py);
      e.preventDefault();
    }, { passive: false });
    zona.addEventListener("touchend", e => { if (e.touches.length < 2) pin = null; });
    zona.addEventListener("wheel", e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const [px, py] = local(e.clientX, e.clientY);
      fijar(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), px, py);
    }, { passive: false });
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
    if (id === "dlgcua" && st[id]) { renderCuadrante(); cargarCuadrantes(equiposClasif(), RELEER_MS); }
    if (id === "dlgpar" && st[id]) {
      renderPartidos();
      // Al abrir se traen los partidos y resultados más recientes (si la última lectura tiene más de 2 min)
      if (window.cpRefreshFromGitHub && navigator.onLine) Promise.resolve(window.cpRefreshFromGitHub(RELEER_MS)).catch(() => {});
    }
  };
  aplicar("dlgpar", !!estado().dlgpar);
  aplicar("dlgcla", !!estado().dlgcla);
  aplicar("dlgcua", !!estado().dlgcua);

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
    renderCuadrante();
  };
  window.dlgMove = function (delta) { offset += delta; renderCalendario(); };
})();
