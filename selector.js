// =====================================================================
//  Listas desplegables propias (en lugar de la ventana del navegador)
//  Todas las <select> de la app, también las que se crean después, abren
//  esta ventana con el estilo de la app en vez del selector del sistema
//  (la lista gris de Android o la rueda de iOS). Al elegir se cambia el
//  valor de la <select> y se lanzan «input» y «change», así que el código
//  existente (onchange=…) funciona sin tocarlo.
//  · No se aplica a <select multiple>, <select size="n">, a las desactivadas
//    ni a las que lleven data-nativo.
// =====================================================================
(function () {
  "use strict";
  let abierta = null;          // { sel, capa, cerrar }
  let ultimoToque = 0;         // para no abrir dos veces (toque + ratón)
  let inicio = null;           // posición del dedo al empezar el toque

  const valida = s => s && s.tagName === "SELECT" && !s.multiple && !(s.size > 1) &&
    !s.disabled && !s.matches("[data-nativo], [data-nativo] *") && s.options.length > 0;

  // Texto para el título: aria-label, <label for>, <label> que la envuelve o title
  function titulo(sel) {
    const limpio = t => String(t || "").replace(/\s+/g, " ").trim();
    if (sel.getAttribute("aria-label")) return limpio(sel.getAttribute("aria-label"));
    if (sel.id) {
      const l = document.querySelector(`label[for="${CSS.escape(sel.id)}"]`);
      if (l && limpio(l.textContent)) return limpio(l.textContent);
    }
    const env = sel.closest("label");
    if (env) {
      let t = "";
      env.childNodes.forEach(n => { if (n !== sel && !(n.nodeType === 1 && n.querySelector && (n.tagName === "SELECT" || n.querySelector("select")))) t += " " + n.textContent; });
      if (limpio(t)) return limpio(t);
    }
    if (sel.title) return limpio(sel.title);
    return "";
  }

  function abrir(sel, porToque) {
    if (abierta) abierta.cerrar(false);
    const capa = document.createElement("div");
    capa.className = "nva-sel";
    const caja = document.createElement("div");
    caja.className = "nva-sel-box";
    caja.setAttribute("role", "listbox");
    const tt = titulo(sel);
    if (tt) {
      const h = document.createElement("div");
      h.className = "nva-sel-titulo";
      h.textContent = tt;
      caja.appendChild(h);
      caja.setAttribute("aria-label", tt);
    }
    const lista = document.createElement("div");
    lista.className = "nva-sel-lista";
    caja.appendChild(lista);

    const filas = [];
    let grupo = null;
    Array.from(sel.options).forEach((op, i) => {
      if (op.hidden) return;
      const g = op.parentElement && op.parentElement.tagName === "OPTGROUP" ? op.parentElement : null;
      if (g && g !== grupo) {
        const gh = document.createElement("div");
        gh.className = "nva-sel-grupo";
        gh.textContent = g.label;
        lista.appendChild(gh);
      }
      grupo = g;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nva-sel-op" + (g ? " nva-sel-engrupo" : "");
      b.setAttribute("role", "option");
      const txt = document.createElement("span");
      txt.className = "nva-sel-txt";
      txt.textContent = op.label || op.textContent;
      b.appendChild(txt);
      const marca = document.createElement("span");
      marca.className = "nva-sel-marca";
      b.appendChild(marca);
      if (i === sel.selectedIndex) { b.classList.add("nva-sel-activa"); b.setAttribute("aria-selected", "true"); }
      if (op.disabled || (g && g.disabled)) { b.disabled = true; b.classList.add("nva-sel-off"); }
      else b.addEventListener("click", () => elegir(i));
      b.dataset.i = i;
      lista.appendChild(b);
      filas.push(b);
    });
    capa.appendChild(caja);

    // Se abre justo debajo de la lista (o encima si abajo no cabe). Solo si la
    // lista no se ve (p. ej. oculta) sale en el centro de la pantalla
    const r = sel.getBoundingClientRect();
    const ancho = window.innerWidth, alto = window.innerHeight;
    const pegada = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < alto;
    if (pegada) {
      capa.classList.add("nva-sel-pegada");
      const w = Math.min(Math.max(r.width, 220), ancho - 16);
      const abajo = alto - r.bottom - 12, arriba = r.top - 12;
      const haciaArriba = abajo < 240 && arriba > abajo;
      caja.style.width = w + "px";
      caja.style.left = Math.max(8, Math.min(r.left, ancho - w - 8)) + "px";
      caja.style.maxHeight = Math.max(160, Math.min(420, haciaArriba ? arriba : abajo)) + "px";
      if (haciaArriba) { caja.style.bottom = (alto - r.top + 4) + "px"; caja.classList.add("nva-sel-arriba"); }
      else caja.style.top = (r.bottom + 4) + "px";
    }

    function elegir(i) {
      const cambia = sel.selectedIndex !== i;
      cerrar(true);
      if (!cambia || !sel.isConnected) return;
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function cerrar(devolverFoco) {
      if (!abierta || abierta.capa !== capa) return;
      abierta = null;
      document.removeEventListener("keydown", teclas, true);
      window.removeEventListener("resize", porFuera);
      document.removeEventListener("scroll", alDesplazar, true);
      capa.classList.add("nva-sel-fuera");
      setTimeout(() => capa.remove(), 120);
      sel.classList.remove("nva-sel-abierta");
      if (devolverFoco && !porToque) try { sel.focus({ preventScroll: true }); } catch (e) {}
    }
    const porFuera = () => cerrar(false);
    // Si se mueve la página, la lista dejaría de estar pegada: se cierra
    const alDesplazar = e => { if (!caja.contains(e.target)) cerrar(false); };
    function teclas(e) {
      const act = filas.filter(b => !b.disabled);
      const pos = act.indexOf(document.activeElement);
      if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); cerrar(true); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); e.stopPropagation();
        const n = pos < 0 ? act.findIndex(b => b.classList.contains("nva-sel-activa")) : pos + (e.key === "ArrowDown" ? 1 : -1);
        const b = act[Math.max(0, Math.min(act.length - 1, n < 0 ? 0 : n))];
        if (b) b.focus();
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault(); const b = act[e.key === "Home" ? 0 : act.length - 1]; if (b) b.focus();
      } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        // Saltar a la primera opción que empiece por esa letra
        const k = e.key.toLowerCase();
        const orden = act.slice(pos + 1).concat(act.slice(0, pos + 1));
        const b = orden.find(x => x.textContent.trim().toLowerCase().startsWith(k));
        if (b) { e.preventDefault(); b.focus(); }
      }
    }
    capa.addEventListener("click", e => { if (e.target === capa) cerrar(true); });
    document.addEventListener("keydown", teclas, true);
    window.addEventListener("resize", porFuera);
    document.addEventListener("scroll", alDesplazar, true);
    (document.body || document.documentElement).appendChild(capa);
    sel.classList.add("nva-sel-abierta");
    abierta = { sel, capa, cerrar };

    // La opción elegida, a la vista (y con el foco si se usa el teclado)
    const act = filas.find(b => b.classList.contains("nva-sel-activa"));
    if (act) {
      lista.scrollTop = Math.max(0, act.offsetTop - lista.clientHeight / 2 + act.offsetHeight / 2);
      if (!porToque) act.focus({ preventScroll: true });
    }
    if (porToque && document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  // --- Interceptar la apertura del selector del sistema ---------------
  document.addEventListener("touchstart", e => {
    const s = e.target.closest && e.target.closest("select");
    inicio = valida(s) && e.touches.length === 1 ? { s, x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
  }, { capture: true, passive: true });

  document.addEventListener("touchend", e => {
    const ini = inicio; inicio = null;
    if (!ini) return;
    const t = e.changedTouches[0];
    if (!t || Math.abs(t.clientX - ini.x) > 10 || Math.abs(t.clientY - ini.y) > 10) return;  // era un desplazamiento
    e.preventDefault();          // sin ratón ni «click» simulados: no se abre la lista del sistema
    ultimoToque = Date.now();
    abrir(ini.s, true);
  }, { capture: true, passive: false });

  document.addEventListener("mousedown", e => {
    const s = e.target.closest && e.target.closest("select");
    if (!valida(s)) return;
    e.preventDefault();
    if (e.button !== 0 || Date.now() - ultimoToque < 800) return;
    if (abierta && abierta.sel === s) { abierta.cerrar(true); return; }
    abrir(s);
  }, true);

  document.addEventListener("keydown", e => {
    const s = e.target;
    if (!valida(s) || abierta) return;
    if (e.key === "Enter" || e.key === " " || e.key === "F4" || (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp"))) {
      e.preventDefault();
      abrir(s);
    }
  }, true);

  // Si algo pide la lista del sistema por código (showPicker), sale la propia
  try {
    const orig = HTMLSelectElement.prototype.showPicker;
    if (orig) HTMLSelectElement.prototype.showPicker = function () { return valida(this) ? abrir(this) : orig.call(this); };
  } catch (e) {}

  window.nvaAbrirSelector = sel => { if (valida(sel)) abrir(sel); };
})();
