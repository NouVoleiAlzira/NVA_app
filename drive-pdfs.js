// =====================================================================
//  PDFs RESULTADOS EN DRIVE (Dirección NVA)
//  «Actualizar vínculos» genera el PDF «Partidos y Resultados» de cada
//  equipo (el mismo de cuadrante-pdf.js) y lo guarda en el Drive del club
//  con la función de Supabase «subir-drive». Cada equipo tiene SIEMPRE el
//  mismo archivo: al actualizar se cambia su contenido, no el enlace, así
//  que a los jugadores/as se les pasa una sola vez.
//  Los enlaces se guardan en DrivePDFs/enlaces.json.
//  «Programar»: la función de Supabase actualizar-drive hace lo
//  mismo a la hora y los días elegidos (DrivePDFs/programada.json).
// =====================================================================
(function () {
  const ENLACES_FILE = "DrivePDFs/enlaces.json";
  const nombreDrive = key => `Partidos y Resultados - ${key}.pdf`;

  // null si no se pudo leer (sin conexión); {} si aún no existe
  async function leerJson(ruta) {
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${ruta}`;
    try {
      const r = await fetch(url, { headers: { "Authorization": `token ${ghSettings.token}` }, cache: "no-store" });
      if (r.ok) return JSON.parse(b64_to_utf8((await r.json()).content)) || {};
      if (r.status === 404) return {};
    } catch (e) { console.warn(ruta, e); }
    return null;
  }
  const leerEnlaces = async () => (await leerJson(ENLACES_FILE)) || {};

  function equipos() {
    const keys = [];
    (appData.teams || []).forEach(t => { const k = getTeamKey(t); if (!keys.includes(k)) keys.push(k); });
    return keys.sort((a, b) => a.localeCompare(b, "es"));
  }

  function aBase64(blob) {
    return new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result).split(",")[1]);
      fr.onerror = () => ko(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  async function subir(sb, key, blob, id) {
    const { data, error } = await sb.functions.invoke("subir-drive", {
      body: { nombre: nombreDrive(key), pdf: await aBase64(blob), id: id || "" }
    });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).error || msg; } catch (e) {}
      throw new Error(msg);
    }
    if (!data || !data.url) throw new Error((data && data.error) || "Drive no devolvió el enlace");
    return data;
  }

  window.actualizarVinculosDrive = async function () {
    const sb = window.nva && window.nva.cliente;
    if (!sb) { alert("No hay conexión con Supabase."); return; }
    const keys = equipos();
    if (!keys.length) { alert("No hay equipos dados de alta."); return; }
    if (!confirm(`Se van a generar y subir al Drive del club los PDF de Partidos y Resultados de ${keys.length} equipos.\n\nLos enlaces que ya tienen los jugadores/as no cambian. ¿Continuar?`)) return;

    const enlaces = await leerEnlaces();
    const fallos = [];
    let hechos = 0;
    try {
      const logo = typeof nvaLogoDataUrl === "function" ? await nvaLogoDataUrl() : null;
      for (const key of keys) {
        mostrarCargando(`Subiendo a Drive (${hechos + fallos.length + 1}/${keys.length}): ${key}...`);
        try {
          const blob = await window.nvaCuadrante.pdfDeEquipo(key, logo);
          const r = await subir(sb, key, blob, enlaces[key] && enlaces[key].id);
          enlaces[key] = { id: r.id, url: r.url, actualizado: new Date().toISOString() };
          hechos++;
        } catch (e) { console.warn(key, e); fallos.push(`- ${key}: ${e.message}`); }
      }
      if (hechos) await writeGitHubFile(ENLACES_FILE, enlaces, "Actualizar vínculos de PDFs en Drive");
    } finally { ocultarCargando(); }

    if (fallos.length) alert(`${hechos ? `Actualizados ${hechos} equipos.\n\n` : ""}No se han podido subir:\n${fallos.join("\n")}`);
    if (hechos) verVinculos(enlaces);
  };

  function fechaCorta(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  function copiar(texto, boton) {
    const hecho = () => { const t = boton.textContent; boton.textContent = "✅"; setTimeout(() => { boton.textContent = t; }, 1200); };
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(hecho, () => prompt("Copia el enlace:", texto));
    else prompt("Copia el enlace:", texto);
  }

  const mensaje = (key, url) => `📊 Partidos y resultados de ${key} (se actualiza cada semana):\n${url}`;

  async function verVinculos(enlaces) {
    if (!enlaces) { mostrarCargando("Cargando vínculos..."); try { enlaces = await leerEnlaces(); } finally { ocultarCargando(); } }
    const keys = equipos().filter(k => enlaces[k]);
    Object.keys(enlaces).forEach(k => { if (!keys.includes(k)) keys.push(k); });   // equipos ya dados de baja
    const o = document.createElement("div");
    o.className = "cp-modal";
    o.innerHTML = `<div class="cp-modal-box imp-box">
      <div class="cp-modal-title">🔗 PDFs Resultados en Drive</div>
      <div class="cp-modal-txt">${keys.length
        ? "Pasa a cada equipo su enlace una sola vez: al pulsar «Actualizar vínculos» el PDF se renueva y el enlace sigue siendo el mismo."
        : "Todavía no hay vínculos. Pulsa «Actualizar vínculos» para crear los PDF en el Drive del club."}</div>
      <div class="imp-list">${keys.map((k, i) => `
        <div class="imp-group">
          <div class="imp-group-title">${escapeHtml(k)} <small>· ${escapeHtml(fechaCorta(enlaces[k].actualizado))}</small></div>
          <div class="cp-modal-row">
            <a class="cp-modal-btn" href="${escapeHtml(enlaces[k].url)}" target="_blank" rel="noopener">↗ Abrir</a>
            <button class="cp-modal-btn" data-copiar="${i}">📋 Copiar</button>
            <a class="cp-modal-btn" href="https://wa.me/?text=${encodeURIComponent(mensaje(k, enlaces[k].url))}" target="_blank" rel="noopener">📲 WhatsApp</a>
          </div>
        </div>`).join("")}</div>
      <div class="cp-modal-row">
        <button class="cp-modal-btn cp-modal-stop">Cerrar</button>
        ${keys.length ? `<button class="cp-modal-btn cp-modal-main" data-todos>📋 Copiar todos</button>` : ""}
      </div>
    </div>`;
    document.body.appendChild(o);
    o.querySelectorAll("[data-copiar]").forEach(b => { b.onclick = () => { const k = keys[+b.dataset.copiar]; copiar(mensaje(k, enlaces[k].url), b); }; });
    const todos = o.querySelector("[data-todos]");
    if (todos) todos.onclick = () => copiar(keys.map(k => `${k}: ${enlaces[k].url}`).join("\n"), todos);
    o.querySelector(".cp-modal-stop").onclick = () => o.remove();
    o.onclick = e => { if (e.target === o) o.remove(); };
  }
  window.verVinculosDrive = () => verVinculos();

  // ---------- Programar (función de Supabase actualizar-drive) ----------
  // Cada hora el servidor mira si está activada, si hoy es uno de los días elegidos y si es
  // la hora elegida (hora de España); entonces hace lo mismo que «Actualizar vínculos».
  const PROG_FILE = "DrivePDFs/programada.json";
  const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
  const DIAS_NOMBRE = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  let prog = null;   // null = aún sin leer
  const conDefecto = (p) => Object.assign({ activa: false, hora: 4, dias: DIAS.slice() }, p);

  async function cargarProg() {
    if (typeof ghSettings === "undefined" || !ghSettings.user || !navigator.onLine) return;
    const p = await leerJson(PROG_FILE);
    if (p) prog = conDefecto(p);
    pintarProg();
  }
  function pintarProg() {
    const box = document.getElementById("drvProg");
    if (!box) return;
    if (!prog) { box.innerHTML = ""; return; }
    const pad = (n) => String(n).padStart(2, "0");
    const horas = Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === +prog.hora ? " selected" : ""}>${pad(h)}:00</option>`).join("");
    const u = prog.ultima;
    box.classList.toggle("off", !prog.activa);
    box.innerHTML = `
      <div class="drv-prog-row">
        <label class="drv-prog-check"><input type="checkbox"${prog.activa ? " checked" : ""} onchange="drvSetProg({ activa: this.checked })"> Programar</label>
        <select aria-label="Hora (de España)" onchange="drvSetProg({ hora: +this.value })">${horas}</select>
        <div class="drv-dias" role="group" aria-label="Días">${DIAS.map((d, i) => {
          const on = prog.dias.includes(d);
          return `<button type="button" class="drv-dia${on ? " on" : ""}" aria-pressed="${on}" title="${DIAS_NOMBRE[i]}" onclick="drvToggleDia('${d}')">${d}</button>`;
        }).join("")}</div>
      </div>
      ${u ? `<div class="drv-prog-last">Última: ${escapeHtml(fechaCorta(u.fecha))}${u.manual ? " (a mano)" : ""} · ${u.equipos} equipo(s)${(u.resumen || []).some(l => l.startsWith("- ")) ? " · con avisos" : ""}
        <button type="button" class="cp-chg-btn" onclick="drvVerResumen()">🔍 Ver resumen</button></div>` : ""}`;
  }
  window.drvSetProg = async function (cambio) {
    if (!navigator.onLine) { alert("Sin conexión: no se puede cambiar ahora."); pintarProg(); return; }
    const ultimo = await leerJson(PROG_FILE);   // lo último guardado (p. ej. el resumen de esta noche)
    if (ultimo) prog = conDefecto(ultimo);
    if (typeof cambio === "function") cambio(prog); else Object.assign(prog, cambio);
    const p = window.nva && window.nva.perfil;
    prog.cambiadoPor = p ? ((p.nombre || "").trim() || String(p.email || "").split("@")[0]) : "";
    prog.cambiado = new Date().toISOString();
    pintarProg();
    const ok = await writeGitHubFile(PROG_FILE, prog, "Programar actualización de vínculos de Drive");
    if (!ok) alert("No se pudo guardar el cambio. Revisa la conexión o los permisos.");
  };
  window.drvToggleDia = (d) => drvSetProg(p => {
    p.dias = p.dias.includes(d) ? p.dias.filter(x => x !== d) : DIAS.filter(x => x === d || p.dias.includes(x));
  });
  window.drvVerResumen = function () {
    const u = prog && prog.ultima;
    if (!u) return;
    const o = document.createElement("div");
    o.className = "cp-modal";
    o.innerHTML = `<div class="cp-modal-box imp-box">
      <div class="cp-modal-title">Actualización ${u.manual ? "a mano" : "programada"} de los vínculos</div>
      <div class="cp-modal-txt"><small>${escapeHtml(fechaCorta(u.fecha))}</small></div>
      <div class="cp-modal-txt" style="white-space:pre-line">${escapeHtml((u.resumen || []).join("\n")) || "No se actualizó ningún equipo."}</div>
      <button class="cp-modal-btn cp-modal-main">Cerrar</button>
    </div>`;
    o.addEventListener("click", (e) => { if (e.target === o || e.target.classList.contains("cp-modal-main")) o.remove(); });
    document.body.appendChild(o);
  };
  cargarProg();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") cargarProg(); });
})();
