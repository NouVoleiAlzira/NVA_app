// =====================================================================
//  FICHAS Y AUTORIZACIONES DE FEDERACIÓN (Entrenamientos y Partidos)
//  Cada botón abre una ventana con el PDF de cada equipo: «Ver» lo abre y
//  «Descargar» lo guarda en el dispositivo.
//  · Fichas de Federación: el PDF de licencias (Fichas/drive.json).
//  · Autorizaciones de Federación: las autorizaciones federativas
//    (Autorizaciones/drive.json).
//  Llevan datos de menores, así que se guardan en carpetas privadas del
//  Drive del club con la función de Supabase «fichas-drive» (la app nunca
//  habla con Drive). Qué equipo tiene PDF y cuándo se subió: el drive.json
//  de cada una. Los equipos se agrupan por entrenador en secciones
//  desplegables.
// =====================================================================
(function () {
  const MAX_BYTES = 10 * 1024 * 1024;   // lo que acepta fichas-drive

  function equipos() {
    const keys = [];
    (appData.teams || []).forEach(t => { const k = getTeamKey(t); if (!keys.includes(k)) keys.push(k); });
    return keys.sort((a, b) => a.localeCompare(b, "es"));
  }

  // [{ nombre, equipos: [key] }] por entrenador; al final los equipos sin entrenador
  function grupos() {
    const todos = equipos();
    const conEntrenador = new Set();
    const out = (appData.coaches || []).map(c => {
      const keys = getCoachTeamEntries(c).map(e => e.teamKey).filter(k => todos.includes(k));
      keys.forEach(k => conEntrenador.add(k));
      return { nombre: c.name, equipos: keys.sort((a, b) => a.localeCompare(b, "es")) };
    }).filter(g => g.equipos.length).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const sueltos = todos.filter(k => !conEntrenador.has(k));
    if (sueltos.length) out.push({ nombre: "Sin entrenador", equipos: sueltos });
    return out;
  }

  function deBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: "application/pdf" });
  }
  function aBase64(blob) {
    return new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result).split(",")[1]);
      fr.onerror = () => ko(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  function fechaCorta(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  // cfg: { tipo, indice, menu, titulo, inputId, archivo(key), una, plural }
  //   una: «ficha» / «autorización» (singular, femenino); plural: «fichas» / …
  function crearVentana(cfg) {
    const cacheBlobs = {};   // equipo → { actualizado, blob } (solo mientras la app está abierta)
    let indice = {};
    const abiertos = new Set();   // entrenadores desplegados en la ventana
    let equipoSubida = null;
    let ventana = null;

    const puedeEditar = () => !window.nva || !window.nva.acceso || window.nva.acceso(cfg.menu) === "escritura";

    // null si no se pudo leer (sin conexión); {} si aún no existe
    async function leerIndice() {
      const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${cfg.indice}`;
      try {
        const r = await fetch(url, { headers: { "Authorization": `token ${ghSettings.token}` }, cache: "no-store" });
        if (r.ok) return JSON.parse(b64_to_utf8((await r.json()).content)) || {};
        if (r.status === 404) return {};
      } catch (e) { console.warn(cfg.indice, e); }
      return null;
    }

    // --- Llamadas a fichas-drive ---
    async function llamar(cuerpo) {
      const sb = window.nva && window.nva.cliente;
      if (!sb) throw new Error("No hay conexión con Supabase.");
      const { data, error } = await sb.functions.invoke("fichas-drive", { body: { ...cuerpo, tipo: cfg.tipo } });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch (e) {}
        throw new Error(msg);
      }
      if (!data || data.error) throw new Error((data && data.error) || "Drive no respondió");
      return data;
    }

    async function blobDe(key) {
      const enDrive = indice[key];
      if (!enDrive) throw new Error(`${key} todavía no tiene ${cfg.una}.`);
      const c = cacheBlobs[key];
      if (c && c.actualizado === enDrive.actualizado) return c.blob;
      const d = await llamar({ accion: "leer", equipo: key });
      const blob = deBase64(d.pdf);
      cacheBlobs[key] = { actualizado: enDrive.actualizado, blob };
      return blob;
    }

    async function ver(key) {
      // La pestaña se abre ya (gesto del usuario) para que el navegador no la bloquee.
      const w = window.open("", "_blank");
      if (!w) { alert("El navegador ha bloqueado la ventana emergente. Permítela e inténtalo de nuevo."); return; }
      w.opener = null;
      try { w.document.write(`<p style='font-family:sans-serif;padding:20px'>Cargando ${cfg.una}…</p>`); } catch (e) {}
      try {
        w.location.href = URL.createObjectURL(await blobDe(key));
      } catch (e) {
        w.close();
        alert(`No se pudo abrir la ${cfg.una} de ${key}.\n${e.message}`);
      }
    }

    async function descargar(key) {
      mostrarCargando(`Descargando la ${cfg.una} de ${key}...`);
      try {
        const url = URL.createObjectURL(await blobDe(key));
        const a = document.createElement("a");
        a.href = url;
        a.download = cfg.archivo(key);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (e) {
        alert(`No se pudo descargar la ${cfg.una} de ${key}.\n${e.message}`);
      } finally { ocultarCargando(); }
    }

    async function subir(key, blob) {
      const r = await llamar({ accion: "subir", equipo: key, pdf: await aBase64(blob) });
      indice[key] = r;
      cacheBlobs[key] = { actualizado: r.actualizado, blob };
    }

    function elegirPdf(key) {
      equipoSubida = key;
      const input = document.getElementById(cfg.inputId);
      input.value = "";
      input.click();
    }
    document.getElementById(cfg.inputId).addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      const key = equipoSubida;
      equipoSubida = null;
      if (!file || !key) return;
      if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) { alert("El archivo debe ser un PDF."); return; }
      if (file.size > MAX_BYTES) { alert("El PDF es demasiado grande (máximo 10 MB)."); return; }
      if (!navigator.onLine) { alert("Sin conexión: no se puede subir ahora."); return; }
      if (indice[key] && !confirm(`¿Sustituir la ${cfg.una} de ${key} por "${file.name}"?`)) return;
      mostrarCargando(`Guardando la ${cfg.una} de ${key} en el Drive...`);
      try {
        await subir(key, file);
        pintar();
      } catch (err) {
        alert(`No se pudo guardar la ${cfg.una} en el Drive.\n${err.message}`);
      } finally { ocultarCargando(); }
    });

    function pintar() {
      if (!ventana) return;
      const editar = puedeEditar();
      const gs = grupos();
      const keys = [];   // índice de cada botón → equipo
      const fila = k => {
        const i = keys.push(k) - 1;
        const f = indice[k];
        const estado = f ? `${fechaCorta(f.actualizado)}${f.por ? " · " + f.por : ""}` : `sin ${cfg.una}`;
        return `<div class="imp-group">
          <div class="imp-group-title">${escapeHtml(k)} <small>· ${escapeHtml(estado)}</small></div>
          <div class="cp-modal-row">
            ${f ? `<button class="cp-modal-btn" data-ver="${i}">👁 Ver</button>
            <button class="cp-modal-btn" data-bajar="${i}">⬇ Descargar</button>` : ""}
            ${editar ? `<button class="cp-modal-btn" data-subir="${i}">${f ? "✏️ Cambiar" : "⬆ Subir PDF"}</button>` : ""}
            ${!editar && !f ? `<div class="cp-modal-txt"><small>Todavía no se ha subido.</small></div>` : ""}
          </div>
        </div>`;
      };
      ventana.querySelector(".imp-list").innerHTML = gs.length ? gs.map(g => {
        const conPdf = g.equipos.filter(k => indice[k]).length;
        return `<details class="fichas-coach"${abiertos.has(g.nombre) ? " open" : ""} data-coach="${escapeHtml(g.nombre)}">
          <summary>${escapeHtml(g.nombre)} <small>· ${conPdf}/${g.equipos.length} con ${cfg.una}</small></summary>
          <div class="fichas-coach-body">${g.equipos.map(fila).join("")}</div>
        </details>`;
      }).join("") : `<div class="cp-modal-txt">No hay equipos dados de alta.</div>`;
      ventana.querySelectorAll("details.fichas-coach").forEach(d => {
        d.ontoggle = () => { if (d.open) abiertos.add(d.dataset.coach); else abiertos.delete(d.dataset.coach); };
      });
      ventana.querySelectorAll("[data-ver]").forEach(b => { b.onclick = () => ver(keys[+b.dataset.ver]); });
      ventana.querySelectorAll("[data-bajar]").forEach(b => { b.onclick = () => descargar(keys[+b.dataset.bajar]); });
      ventana.querySelectorAll("[data-subir]").forEach(b => { b.onclick = () => elegirPdf(keys[+b.dataset.subir]); });
    }

    return async function abrir() {
      if (ventana) ventana.remove();
      ventana = document.createElement("div");
      ventana.className = "cp-modal fichas-modal";
      ventana.innerHTML = `<div class="cp-modal-box imp-box">
        <div class="cp-modal-title">${cfg.titulo}</div>
        <div class="imp-list"><div class="cp-modal-txt">Cargando...</div></div>
        <button class="cp-modal-btn cp-modal-stop">Cerrar</button>
      </div>`;
      document.body.appendChild(ventana);
      const cerrar = () => { if (ventana) { ventana.remove(); ventana = null; } };
      ventana.querySelector(".cp-modal-stop").onclick = cerrar;
      ventana.onclick = e => { if (e.target === ventana) cerrar(); };

      const i = await leerIndice();
      if (i) indice = i;
      if (!i && !navigator.onLine && ventana) {
        ventana.querySelector(".imp-list").innerHTML = `<div class="cp-modal-txt">Sin conexión: las ${cfg.plural} no se pueden ver ahora.</div>`;
        return;
      }
      pintar();
    };
  }

  window.openFichasFederacion = crearVentana({
    tipo: "fichas",
    indice: "Fichas/drive.json",
    menu: "informes.fichas",
    titulo: "📇 Fichas de Federación",
    inputId: "fichaFileInput",
    archivo: key => `Licencias - ${key}.pdf`,
    una: "ficha",
    plural: "fichas",
  });

  window.openAutorizacionesFederacion = crearVentana({
    tipo: "autorizaciones",
    indice: "Autorizaciones/drive.json",
    menu: "informes.autorizaciones",
    titulo: "📝 Autorizaciones de Federación",
    inputId: "autorizacionFileInput",
    archivo: key => `Autorizaciones - ${key}.pdf`,
    una: "autorización",
    plural: "autorizaciones",
  });
})();
