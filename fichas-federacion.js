// =====================================================================
//  FICHAS DE FEDERACIÓN (Entrenamientos y Partidos)
//  El botón abre una ventana con la ficha (PDF de licencias) de cada
//  equipo: «Ver» la abre y «Descargar» la guarda en el dispositivo.
//  Las fichas llevan datos de menores, así que se guardan en una carpeta
//  privada del Drive del club con la función de Supabase «fichas-drive»
//  (la app nunca habla con Drive). Qué equipo tiene ficha y cuándo se
//  subió: Fichas/drive.json.
//  Antes las fichas estaban en la app (Fichas/Licencias_<equipo>.pdf): se
//  siguen pudiendo ver y el botón «Pasar al Drive» las copia al Drive.
// =====================================================================
(function () {
  const INDICE = "Fichas/drive.json";
  const CARPETA_ANTIGUA = "Fichas";
  const MAX_BYTES = 10 * 1024 * 1024;   // lo que acepta fichas-drive
  const nombreFicha = key => `Licencias - ${key}.pdf`;
  const cacheBlobs = {};   // equipo → { actualizado, blob } (solo mientras la app está abierta)
  let indice = {};
  let antiguas = [];       // nombres de los PDF que siguen en la carpeta antigua de la app
  let equipoSubida = null;

  const puedeEditar = () => !window.nva || !window.nva.acceso || window.nva.acceso("informes") === "escritura";

  function equipos() {
    const keys = [];
    (appData.teams || []).forEach(t => { const k = getTeamKey(t); if (!keys.includes(k)) keys.push(k); });
    return keys.sort((a, b) => a.localeCompare(b, "es"));
  }
  const equipoDe = key => (appData.teams || []).find(t => getTeamKey(t) === key) || { name: key, category: "" };

  // null si no se pudo leer (sin conexión); {} si aún no existe
  async function leerIndice() {
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${INDICE}`;
    try {
      const r = await fetch(url, { headers: { "Authorization": `token ${ghSettings.token}` }, cache: "no-store" });
      if (r.ok) return JSON.parse(b64_to_utf8((await r.json()).content)) || {};
      if (r.status === 404) return {};
    } catch (e) { console.warn(INDICE, e); }
    return null;
  }

  // --- Fichas antiguas (guardadas en la app antes de pasar al Drive) ---
  // Se reconocen sin distinguir mayúsculas, acentos, espacios ni signos:
  // "Licencias NVA A (Infantil).pdf", "licencias_nva_a_infantil.pdf"... valen igual.
  function nombreAntiguo(key) {
    const t = equipoDe(key);
    const norm = s => sanitizeFileName(s).replace(/_/g, "").toLowerCase();
    const buscados = [norm("Licencias " + key), norm("Licencias " + t.name), norm("Licencias " + t.category)];
    for (const b of buscados) {
      const hit = antiguas.find(n => norm(n.replace(/\.pdf$/i, "")) === b);
      if (hit) return hit;
    }
    return null;
  }
  async function blobAntiguo(nombre) {
    const url = `https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${CARPETA_ANTIGUA}/${encodeURIComponent(nombre)}`;
    const r = await fetch(url, { headers: { "Accept": "application/vnd.github.raw+json", "Authorization": `token ${ghSettings.token}` }, cache: "no-store" });
    if (!r.ok) throw new Error(`no se pudo leer la ficha antigua (${r.status})`);
    return new Blob([await r.arrayBuffer()], { type: "application/pdf" });
  }

  // --- Llamadas a fichas-drive ---
  async function llamar(cuerpo) {
    const sb = window.nva && window.nva.cliente;
    if (!sb) throw new Error("No hay conexión con Supabase.");
    const { data, error } = await sb.functions.invoke("fichas-drive", { body: cuerpo });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).error || msg; } catch (e) {}
      throw new Error(msg);
    }
    if (!data || data.error) throw new Error((data && data.error) || "Drive no respondió");
    return data;
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

  async function blobDe(key) {
    const enDrive = indice[key];
    if (enDrive) {
      const c = cacheBlobs[key];
      if (c && c.actualizado === enDrive.actualizado) return c.blob;
      const d = await llamar({ accion: "leer", equipo: key });
      const blob = deBase64(d.pdf);
      cacheBlobs[key] = { actualizado: enDrive.actualizado, blob };
      return blob;
    }
    const antiguo = nombreAntiguo(key);
    if (antiguo) return blobAntiguo(antiguo);
    throw new Error(`${key} todavía no tiene ficha.`);
  }

  async function verFicha(key) {
    // La pestaña se abre ya (gesto del usuario) para que el navegador no la bloquee.
    const w = window.open("", "_blank");
    if (!w) { alert("El navegador ha bloqueado la ventana emergente. Permítela e inténtalo de nuevo."); return; }
    w.opener = null;
    try { w.document.write("<p style='font-family:sans-serif;padding:20px'>Cargando ficha…</p>"); } catch (e) {}
    try {
      w.location.href = URL.createObjectURL(await blobDe(key));
    } catch (e) {
      w.close();
      alert(`No se pudo abrir la ficha de ${key}.\n${e.message}`);
    }
  }

  async function descargarFicha(key) {
    mostrarCargando(`Descargando la ficha de ${key}...`);
    try {
      const url = URL.createObjectURL(await blobDe(key));
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreFicha(key);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      alert(`No se pudo descargar la ficha de ${key}.\n${e.message}`);
    } finally { ocultarCargando(); }
  }

  async function subirFicha(key, blob) {
    const r = await llamar({ accion: "subir", equipo: key, pdf: await aBase64(blob) });
    indice[key] = r;
    cacheBlobs[key] = { actualizado: r.actualizado, blob };
  }

  function elegirPdf(key) {
    equipoSubida = key;
    const input = document.getElementById("fichaFileInput");
    input.value = "";
    input.click();
  }
  document.getElementById("fichaFileInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    const key = equipoSubida;
    equipoSubida = null;
    if (!file || !key) return;
    if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) { alert("El archivo debe ser un PDF."); return; }
    if (file.size > MAX_BYTES) { alert("El PDF es demasiado grande (máximo 10 MB)."); return; }
    if (!navigator.onLine) { alert("Sin conexión: no se puede subir ahora."); return; }
    if (indice[key] && !confirm(`¿Sustituir la ficha de ${key} por "${file.name}"?`)) return;
    mostrarCargando(`Guardando la ficha de ${key} en el Drive...`);
    try {
      await subirFicha(key, file);
      pintar();
    } catch (err) {
      alert(`No se pudo guardar la ficha en el Drive.\n${err.message}`);
    } finally { ocultarCargando(); }
  });

  // Copia al Drive las fichas que siguen guardadas en la app
  async function pasarAntiguas() {
    const keys = equipos().filter(k => !indice[k] && nombreAntiguo(k));
    if (!keys.length) return;
    if (!confirm(`Se van a copiar al Drive del club las fichas de ${keys.length} equipos que estaban guardadas en la app. ¿Continuar?`)) return;
    const fallos = [];
    try {
      for (let i = 0; i < keys.length; i++) {
        mostrarCargando(`Pasando al Drive (${i + 1}/${keys.length}): ${keys[i]}...`);
        try {
          const blob = await blobAntiguo(nombreAntiguo(keys[i]));
          if (blob.size > MAX_BYTES) throw new Error("ocupa más de 10 MB");
          await subirFicha(keys[i], blob);
        } catch (e) { fallos.push(`- ${keys[i]}: ${e.message}`); }
      }
    } finally { ocultarCargando(); }
    pintar();
    if (fallos.length) alert(`No se han podido pasar:\n${fallos.join("\n")}`);
  }

  function fechaCorta(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  let ventana = null;
  function pintar() {
    if (!ventana) return;
    const editar = puedeEditar();
    const keys = equipos();
    const pendientes = keys.filter(k => !indice[k] && nombreAntiguo(k)).length;
    ventana.querySelector(".imp-list").innerHTML = keys.length ? keys.map((k, i) => {
      const f = indice[k];
      const antigua = !f && nombreAntiguo(k);
      const estado = f ? `${fechaCorta(f.actualizado)}${f.por ? " · " + f.por : ""}`
        : antigua ? "en la app (sin pasar al Drive)" : "sin ficha";
      return `<div class="imp-group">
        <div class="imp-group-title">${escapeHtml(k)} <small>· ${escapeHtml(estado)}</small></div>
        <div class="cp-modal-row">
          ${f || antigua ? `<button class="cp-modal-btn" data-ver="${i}">👁 Ver</button>
          <button class="cp-modal-btn" data-bajar="${i}">⬇ Descargar</button>` : ""}
          ${editar ? `<button class="cp-modal-btn" data-subir="${i}">${f ? "✏️ Cambiar" : "⬆ Subir PDF"}</button>` : ""}
          ${!editar && !f && !antigua ? `<div class="cp-modal-txt"><small>Todavía no se ha subido.</small></div>` : ""}
        </div>
      </div>`;
    }).join("") : `<div class="cp-modal-txt">No hay equipos dados de alta.</div>`;
    ventana.querySelectorAll("[data-ver]").forEach(b => { b.onclick = () => verFicha(keys[+b.dataset.ver]); });
    ventana.querySelectorAll("[data-bajar]").forEach(b => { b.onclick = () => descargarFicha(keys[+b.dataset.bajar]); });
    ventana.querySelectorAll("[data-subir]").forEach(b => { b.onclick = () => elegirPdf(keys[+b.dataset.subir]); });
    const pasar = ventana.querySelector("[data-pasar]");
    pasar.hidden = !(editar && pendientes);
    pasar.textContent = `📤 Pasar al Drive las fichas de la app (${pendientes})`;
  }

  window.openFichasFederacion = async function () {
    if (ventana) ventana.remove();
    ventana = document.createElement("div");
    ventana.className = "cp-modal fichas-modal";
    ventana.innerHTML = `<div class="cp-modal-box imp-box">
      <div class="cp-modal-title">📇 Fichas de Federación</div>
      <div class="cp-modal-txt">Las fichas de cada equipo, guardadas en una carpeta privada del Drive del club.</div>
      <div class="imp-list"><div class="cp-modal-txt">Cargando...</div></div>
      <button class="cp-modal-btn" data-pasar hidden></button>
      <button class="cp-modal-btn cp-modal-stop">Cerrar</button>
    </div>`;
    document.body.appendChild(ventana);
    const cerrar = () => { if (ventana) { ventana.remove(); ventana = null; } };
    ventana.querySelector(".cp-modal-stop").onclick = cerrar;
    ventana.querySelector("[data-pasar]").onclick = pasarAntiguas;
    ventana.onclick = e => { if (e.target === ventana) cerrar(); };

    const [i, lista] = await Promise.all([leerIndice(), listGitHubFolder(CARPETA_ANTIGUA)]);
    if (i) indice = i;
    if (lista) antiguas = lista.filter(f => f.name && /\.pdf$/i.test(f.name)).map(f => f.name);
    if (!i && !navigator.onLine && ventana) {
      ventana.querySelector(".imp-list").innerHTML = `<div class="cp-modal-txt">Sin conexión: las fichas no se pueden ver ahora.</div>`;
      return;
    }
    pintar();
  };
})();
