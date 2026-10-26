// =====================================================================
//  PDF PARTIDOS Y RESULTADOS: cuadrante local × visitante de la liga
//  de cada equipo, con la clasificación al lado.
//  Los datos salen del PDF de la federación (fvbcv.com) que «Actualizar
//  automáticamente» deja en Calendarios/<Equipo>.pdf.
//  Funciona como «PDF Entrenamientos»: se activa el modo PDF y se elige
//  un equipo, todos los de un entrenador o todos los equipos.
// =====================================================================
(function () {
  const PDF_FOLDER = "Calendarios";
  let cuadranteMode = false;

  // ---------- Modo de selección (reutiliza el modo PDF de app.js) ----------
  const origToggle = window.togglePdfMode;
  const origOpenRange = window.openDateRangeModal;
  const origOpenBatch = window.openBatchDateRangeModal;

  function paintMode() {
    const banner = document.querySelector("#pdfModeBanner span");
    const bTrain = document.getElementById("btnPdfMode");
    const bCuad = document.getElementById("btnPdfCuadrante");
    if (banner) banner.textContent = cuadranteMode
      ? "📌 PDF Partidos y Resultados: selecciona Entrenador y Equipo"
      : "📌 Modo PDF Activo: Selecciona Entrenador y Equipo";
    if (bTrain) bTrain.style.opacity = isPdfMode && !cuadranteMode ? "0.6" : "1";
    if (bCuad) bCuad.style.opacity = isPdfMode && cuadranteMode ? "0.6" : "1";
  }

  window.togglePdfMode = function () {
    if (isPdfMode && cuadranteMode) { salir(); return; }   // «✕ Cancelar» o volver a pulsar
    origToggle.apply(this, arguments);
    if (!isPdfMode) cuadranteMode = false;
    paintMode();
  };

  window.togglePdfCuadranteMode = function () {
    if (isPdfMode && cuadranteMode) { salir(); return; }
    cuadranteMode = true;
    if (!isPdfMode) origToggle();
    paintMode();
  };

  function salir() { cuadranteMode = false; if (isPdfMode) origToggle(); paintMode(); }

  window.openDateRangeModal = function (coach, teamKey) {
    if (!cuadranteMode) return origOpenRange.apply(this, arguments);
    salir();
    generar([teamKey], sanitizeFileName(teamKey));
  };

  window.openBatchDateRangeModal = function (coach) {
    if (!cuadranteMode) return origOpenBatch.apply(this, arguments);
    const keys = [];
    (coach ? [coach] : appData.coaches).forEach(c => getCoachTeamEntries(c).forEach(e => {
      if (!keys.includes(e.teamKey)) keys.push(e.teamKey);
    }));
    if (!keys.length) { alert("No hay equipos asignados."); return; }
    salir();
    generar(keys, coach ? "Equipos_" + sanitizeFileName(coach.name) : "Todos_los_equipos");
  };

  // ---------- Lectura del PDF de la federación ----------
  async function leerPdfGitHub(key) {
    if (!ghSettings.user || !ghSettings.repo || !ghSettings.token) throw new Error("Sin conexión con GitHub configurada (Opciones > GitHub)");
    const r = await fetch(`https://api.github.com/repos/${ghSettings.user}/${ghSettings.repo}/contents/${PDF_FOLDER}/${sanitizeFileName(key)}.pdf`, {
      cache: "no-store",
      headers: { "Authorization": `token ${ghSettings.token}`, "Accept": "application/vnd.github.raw" }
    });
    if (r.status === 404) throw new Error("no hay PDF de competición guardado");
    if (!r.ok) throw new Error("GitHub respondió " + r.status);
    return r.arrayBuffer();
  }

  async function lineasPdf(data) {
    await ensurePdfJs();
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent();
      const lines = [];
      content.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const y = it.transform[5];
        let line = lines.find(l => Math.abs(l.y - y) < 2.5);
        if (!line) { line = { y, items: [] }; lines.push(line); }
        line.items.push({ x: it.transform[4], str: it.str.trim() });
      });
      lines.sort((a, b) => b.y - a.y);
      lines.forEach(l => out.push(l.items.sort((a, b) => a.x - b.x).map(i => i.str).join(" ").replace(/\s+/g, " ").trim()));
    }
    return out;
  }

  // Lectura y dibujo: compartidos con la actualización programada de Drive
  // (supabase/functions/_shared/pdf-resultados.js)
  const R = window.nvaPdfResultados;
  const analizar = R.analizar;
  function info(key) {
    const cp = window.cpGetData ? window.cpGetData() : null;
    return {
      fed: cp && cp.teams && cp.teams[key] && cp.teams[key].fedName,
      team: appData.teams.find(x => getTeamKey(x) === key)
    };
  }
  const dibujar = (pdf, key, d, logo) => R.dibujar(pdf, key, d, logo, info(key));

  async function generar(keys, nombreArchivo) {
    mostrarCargando("Leyendo los PDF de la federación...");
    const fallos = [];
    try {
      await ensureExportLibs();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      const logo = typeof nvaLogoDataUrl === "function" ? await nvaLogoDataUrl() : null;
      let paginas = 0;
      for (const key of keys) {
        mostrarCargando(`Preparando ${key}...`);
        try {
          const d = analizar(await lineasPdf(await leerPdfGitHub(key)));
          if (!d.partidos.length) throw new Error("no se encontraron partidos en el PDF");
          if (paginas) pdf.addPage();
          dibujar(pdf, key, d, logo);
          paginas++;
        } catch (e) { console.warn(key, e); fallos.push(`- ${key}: ${e.message}`); }
      }
      if (paginas) { if (typeof nvaPdfFooters === "function") nvaPdfFooters(pdf); const nombre = `Partidos_y_Resultados_${nombreArchivo}.pdf`;
        pdf.save(nombre);   // la ventana de compartir sale sola (ver más abajo)
      }
      if (fallos.length) alert((paginas ? "Algunos equipos no se han incluido:\n" : "No se pudo generar el PDF:\n") + fallos.join("\n"));
    } catch (e) {
      console.error(e);
      alert("Ocurrió un error al generar el PDF de partidos y resultados.");
    } finally { ocultarCargando(); }
  }

  // ---------- Enviar el PDF por WhatsApp ----------
  // Se abre el menú «Compartir» del sistema con el PDF: se elige WhatsApp y el chat.
  // Sale en TODOS los PDF de la app: se envuelve jsPDF.save en cuanto jsPDF se carga.
  function ventanaWhatsApp(file) {
    const o = document.createElement("div");
    o.className = "cp-modal";
    o.innerHTML = `<div class="cp-modal-box">
      <div class="cp-modal-title">📲 Enviar por WhatsApp</div>
      <div class="cp-modal-txt">PDF descargado. Pulsa <b>Compartir PDF</b>, elige <b>WhatsApp</b> y después el chat o grupo.</div>
      <div class="cp-modal-row">
        <button class="cp-modal-btn cp-modal-stop">Cerrar</button>
        <button class="cp-modal-btn cp-modal-main wa-share">📤 Compartir PDF</button>
      </div>
    </div>`;
    document.body.appendChild(o);
    o.querySelector(".wa-share").onclick = async () => {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: file.name, text: file.name.replace(/\.pdf$/i, "").replace(/_/g, " ") }); o.remove(); }
        catch (e) { if (e.name !== "AbortError") alert("No se pudo compartir: " + e.message); }
      } else {
        alert("Este navegador no deja compartir archivos directamente.\nEl PDF ya está en Descargas: abre WhatsApp y adjúntalo con el clip 📎.");
        o.remove();
      }
    };
    o.querySelector(".cp-modal-stop").onclick = () => o.remove();
  }

  function engancharJsPdf() {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J || J.API.__nvaShare) return;
    // OJO: jsPDF crea «save» dentro de cada documento y luego copia encima lo de
    // jsPDF.API, así que aquí no hay «save» original que llamar: se descarga a mano.
    J.API.save = function (nombre, opciones) {
      const n = String(nombre || "documento.pdf").replace(/\.pdf$/i, "") + ".pdf";
      const blob = this.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = n; a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      try { setTimeout(() => ventanaWhatsApp(new File([blob], n, { type: "application/pdf" })), 300); }
      catch (e) { console.warn("Compartir PDF:", e); }
      return opciones && opciones.returnPromise ? Promise.resolve(this) : this;
    };
    J.API.__nvaShare = true;
  }
  if (typeof loadScriptOnce === "function") {
    const origLoad = window.loadScriptOnce;
    window.loadScriptOnce = function () { return Promise.resolve(origLoad.apply(this, arguments)).then(v => { engancharJsPdf(); return v; }); };
  }
  engancharJsPdf();

  // PDF de un solo equipo (para «PDFs Resultados en Drive»). Lanza un error si falta el PDF de la federación.
  async function pdfDeEquipo(key, logo) {
    await ensureExportLibs();
    const lines = await lineasPdf(await leerPdfGitHub(key));
    return R.pdfDeEquipo(window.jspdf.jsPDF, key, lines, logo, info(key)).output("blob");
  }

  window.nvaCuadrante = { analizar, dibujar, generar, pdfDeEquipo };
})();
