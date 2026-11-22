// =====================================================================
//  Botón / gesto ATRÁS del móvil
//  Cada pulsación de ATRÁS deshace una "capa", de la de arriba hacia abajo:
//    1. la ventana abierta más alta (lista desplegable, aviso, tarjeta,
//       vista ampliada, visor, ventana de opciones…),
//    2. los modos de la pantalla principal (Modo PDF, Modo anulación),
//    3. las pantallas secundarias (vuelve a la pantalla principal).
//  Solo en la pantalla principal y sin nada abierto, ATRÁS cierra la app
//  (o la manda a segundo plano), como cualquier otra app.
//
//  Cómo funciona: por cada capa abierta hay una entrada propia en el
//  historial del navegador. ATRÁS consume una entrada y aquí se cierra la
//  capa de arriba. Si una capa se cierra con su botón (✕, Cancelar…), la
//  entrada sobrante se quita sola. En la pantalla principal sin nada
//  abierto no queda ninguna entrada propia, así que ATRÁS sale de la app.
// =====================================================================
(function () {
  "use strict";

  const PRINCIPAL = "screenCoachTeam";

  // Ventanas que cuentan como capa (si se ven)
  const VENTANAS = [
    ".nva-sel", ".nva-dlg", ".cp-modal", ".modal-backdrop.active",
    ".dlg-visor", ".cp-tl-full",
    'body > div[style*="position:fixed"]', 'body > div[style*="position: fixed"]'
  ].join(",");
  // Se están cerrando (animación de salida): ya no cuentan
  const SALIENDO = ".nva-dlg-fuera, .nva-sel-fuera";
  // Nunca son capas: pantallas de carga, intro, acceso
  const NO_CAPA = ".loading-overlay, .nva-intro, .nva-pantalla";

  // Botones que cierran una ventana, por orden de preferencia
  const BOTONES_CERRAR = [
    '.cp-tl-full-x, .dlg-visor-x, .btn-close-modal, .hist-cerrar, [data-cerrar], [aria-label="Cerrar"]',
    '[data-e="no"], [data-n="no"], [data-s="cerrar"], [data-ig="cerrar"], [data-est="cancelar"], [data-mu="cancelar"]'
  ];
  const TEXTO_CERRAR = /^(✕|×|✖|✕ cancelar|cerrar|cancelar|volver|entendido|salir|terminar)$/i;

  const visible = el => !!el && el.isConnected && el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== "hidden";

  function ventanasAbiertas() {
    const vw = window.innerWidth, vh = window.innerHeight;
    return Array.from(document.querySelectorAll(VENTANAS)).filter(el => {
      if (el.matches(SALIENDO) || el.matches(NO_CAPA) || !visible(el)) return false;
      // Las capas genéricas (style en línea) solo si tapan la pantalla
      if (!el.matches(".nva-sel, .nva-dlg, .cp-modal, .modal-backdrop, .dlg-visor, .cp-tl-full")) {
        const r = el.getBoundingClientRect();
        if (r.width < vw * 0.9 || r.height < vh * 0.9) return false;
      }
      return true;
    });
  }

  function modosAbiertos() {
    const m = [];
    const pdf = document.getElementById("pdfModeBanner");
    if (visible(pdf)) m.push(pdf);
    const anul = document.getElementById("anulBarra");
    if (anul && !anul.hidden && visible(anul)) m.push(anul);
    return m;
  }

  function pantallaActiva() {
    const a = document.querySelector(".screen.active");
    return a ? a.id : PRINCIPAL;
  }

  function numCapas() {
    return ventanasAbiertas().length + modosAbiertos().length + (pantallaActiva() !== PRINCIPAL ? 1 : 0);
  }

  // La ventana de más arriba: mayor z-index y, a igualdad, la última del documento
  function ventanaSuperior() {
    const vs = ventanasAbiertas();
    if (!vs.length) return null;
    const z = el => parseInt(getComputedStyle(el).zIndex, 10) || 0;
    return vs.reduce((a, b) => (z(b) >= z(a) ? b : a));
  }

  function botonCerrar(el) {
    const ok = b => visible(b) && !b.disabled;
    for (const sel of BOTONES_CERRAR) {
      const b = Array.from(el.querySelectorAll(sel)).find(ok);
      if (b) return b;
    }
    return Array.from(el.querySelectorAll('button, [role="button"]'))
      .find(b => ok(b) && TEXTO_CERRAR.test((b.textContent || "").replace(/\s+/g, " ").trim()));
  }

  function cerrarVentana(el) {
    if (el.matches(".nva-sel")) { el.click(); return; }            // tocar fuera de la lista
    if (el.matches(".nva-dlg")) {
      const no = el.querySelector(".nva-dlg-no");
      if (no) no.click();
      else el.click();                                            // aviso: tocar fuera (sin su acción extra)
      return;
    }
    const b = botonCerrar(el);
    if (b) { b.click(); return; }
    if (el.matches(".modal-backdrop")) { el.classList.remove("active"); return; }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  }

  // Cierra la capa de arriba. Devuelve false si no había nada que cerrar
  function cerrarCapaSuperior() {
    const v = ventanaSuperior();
    if (v) { cerrarVentana(v); return true; }
    const modos = modosAbiertos();
    if (modos.length) {
      const b = botonCerrar(modos[modos.length - 1]);
      if (b) b.click();
      return true;
    }
    if (pantallaActiva() !== PRINCIPAL) {
      const atras = document.getElementById("btnBack");
      if (atras) atras.click();
      else if (typeof goBack === "function") goBack();
      return true;
    }
    return false;
  }

  // ---------- Entradas propias del historial ----------
  const prof = st => (st && typeof st.nvaN === "number" ? st.nvaN : 0);
  let actual = prof(history.state);
  if (!history.state || typeof history.state.nvaN !== "number") {
    try { history.replaceState(Object.assign({}, history.state, { nvaN: 0 }), ""); } catch (e) {}
  }

  let quitando = false, tQuitando = null, tSync = null;

  // El navegador solo respeta las entradas añadidas tras un toque del usuario
  // (si no, ATRÁS se las salta y sale de la app). Sin toque reciente se espera al siguiente.
  const hayToque = () => !navigator.userActivation || navigator.userActivation.isActive;

  function sincronizar() {
    tSync = null;
    if (quitando) return;
    const n = numCapas();
    while (n > actual && hayToque()) {
      actual++;
      history.pushState({ nvaN: actual }, "");
    }
    if (n < actual) {
      // Se cerró algo con su propio botón: se quitan las entradas que sobran
      quitando = true;
      clearTimeout(tQuitando);
      tQuitando = setTimeout(() => { quitando = false; actual = prof(history.state); programar(); }, 1500);
      history.go(n - actual);
    }
  }
  // Sin retraso indicado no se reprograma: así los cambios continuos (animaciones)
  // no aplazan la comprobación indefinidamente
  function programar(ms) {
    if (tSync) { if (ms == null) return; clearTimeout(tSync); }
    tSync = setTimeout(sincronizar, ms == null ? 60 : ms);
  }

  window.addEventListener("popstate", e => {
    const nueva = prof(e.state);
    if (quitando) {
      quitando = false;
      clearTimeout(tQuitando);
      actual = nueva;
      programar();
      return;
    }
    let pasos = actual - nueva;
    actual = nueva;
    // ATRÁS (normalmente un paso): se cierra una capa por cada entrada consumida
    while (pasos-- > 0) { if (!cerrarCapaSuperior()) break; }
    // Se deja terminar el cierre (animaciones, ventanas que preguntan antes de cerrar)
    programar(250);
  });

  // Cualquier cambio en la página puede abrir o cerrar una capa
  new MutationObserver(() => programar()).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "style"]
  });
  // Tras un toque se puede añadir la entrada que quedó pendiente
  ["pointerup", "keydown", "click"].forEach(t => window.addEventListener(t, () => programar(), true));

  programar(0);
})();
