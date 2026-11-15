// =====================================================================
//  Ventanas de aviso propias (en lugar de las del navegador)
//  · nvaAviso(texto)              → Promise (se resuelve al pulsar «Aceptar»)
//  · nvaConfirmar(texto, opc)     → Promise<boolean>
//  · nvaPreguntar(texto, valor)   → Promise<string|null> (null = Cancelar)
//  · window.alert también se sustituye: todas las llamadas existentes a
//    alert() muestran esta ventana (no bloquea, el código sigue).
//  Las ventanas se muestran de una en una, en el orden en que se piden.
// =====================================================================
(function () {
  "use strict";
  let cola = Promise.resolve();

  // Las palabras de borrar/quitar ponen el botón principal en rojo
  const PELIGRO = /(borrar|eliminar|quitar|descartar|cerrar sesi[oó]n|perder|deshacer todos|no se puede deshacer)/i;

  function icono(texto) {
    const t = String(texto).trim();
    if (/^(✅|✔️|🎉)/u.test(t)) return { cls: "ok", ico: "✓" };
    if (/^(❌|⛔|🚫)/u.test(t) || /^(error|no se pudo|no se ha podido|fallo)/i.test(t)) return { cls: "error", ico: "!" };
    if (/^(⚠️|⚠)/u.test(t)) return { cls: "aviso", ico: "!" };
    return null;
  }
  // Quita el emoji del principio cuando ya se pinta el icono redondo
  const sinEmojiInicial = t => String(t).replace(/^\s*(✅|✔️|❌|⛔|🚫|⚠️|⚠)\s*/u, "");

  function abrir(tipo, texto, opc) {
    opc = opc || {};
    return new Promise(resolver => {
      const o = document.createElement("div");
      o.className = "cp-modal nva-dlg";
      o.setAttribute("role", tipo === "aviso" ? "alertdialog" : "dialog");
      o.setAttribute("aria-modal", "true");
      const caja = document.createElement("div");
      caja.className = "cp-modal-box nva-dlg-box";
      const ic = tipo === "aviso" ? icono(texto) : null;
      if (ic) {
        const i = document.createElement("div");
        i.className = "nva-dlg-ico nva-dlg-" + ic.cls;
        i.textContent = ic.ico;
        caja.appendChild(i);
      }
      if (opc.titulo) {
        const h = document.createElement("div");
        h.className = "cp-modal-title nva-dlg-titulo";
        h.textContent = opc.titulo;
        caja.appendChild(h);
      }
      const p = document.createElement("div");
      p.className = "cp-modal-txt nva-dlg-txt";
      p.textContent = ic ? sinEmojiInicial(texto) : String(texto == null ? "" : texto);
      caja.appendChild(p);

      let campo = null;
      if (tipo === "pregunta") {
        campo = document.createElement("input");
        campo.type = "text";
        campo.className = "nva-dlg-campo";
        campo.value = opc.valor == null ? "" : String(opc.valor);
        campo.autocomplete = "off";
        caja.appendChild(campo);
      }

      const fila = document.createElement("div");
      fila.className = "cp-modal-row nva-dlg-botones";
      let bNo = null;
      if (tipo !== "aviso") {
        bNo = document.createElement("button");
        bNo.type = "button";
        bNo.className = "cp-modal-btn nva-dlg-no";
        bNo.textContent = opc.no || "Cancelar";
        fila.appendChild(bNo);
      }
      const bSi = document.createElement("button");
      bSi.type = "button";
      const rojo = opc.peligro != null ? opc.peligro : (tipo === "confirmar" && PELIGRO.test(texto));
      bSi.className = "cp-modal-btn " + (rojo ? "cp-modal-stop" : "cp-modal-main") + " nva-dlg-si";
      bSi.textContent = opc.si || "Aceptar";
      fila.appendChild(bSi);
      caja.appendChild(fila);
      o.appendChild(caja);

      const antes = document.activeElement;
      const cerrar = (valor) => {
        document.removeEventListener("keydown", teclas, true);
        o.classList.add("nva-dlg-fuera");
        setTimeout(() => o.remove(), 140);
        try { if (antes && antes.focus && antes.isConnected) antes.focus({ preventScroll: true }); } catch (e) {}
        resolver(valor);
      };
      const aceptar = () => cerrar(tipo === "pregunta" ? campo.value : tipo === "confirmar" ? true : undefined);
      const cancelar = () => cerrar(tipo === "pregunta" ? null : tipo === "confirmar" ? false : undefined);
      function teclas(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelar(); }
        else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); aceptar(); }
        else if (e.key === "Tab") {           // el foco no sale de la ventana
          const f = [campo, bNo, bSi].filter(Boolean);
          const i = f.indexOf(document.activeElement);
          e.preventDefault();
          f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
        }
      }
      bSi.onclick = aceptar;
      if (bNo) bNo.onclick = cancelar;
      // Tocar fuera solo cierra los avisos (en una pregunta podría ser un toque sin querer)
      o.addEventListener("click", e => { if (e.target === o && tipo === "aviso") aceptar(); });
      document.addEventListener("keydown", teclas, true);
      (document.body || document.documentElement).appendChild(o);
      // Solo se enfoca el campo de texto; Intro/Escape funcionan igual sin foco
      // (así no aparece el marco de foco en los botones al tocar en el móvil)
      if (campo) setTimeout(() => { campo.focus(); campo.select(); }, 30);
      else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    });
  }

  // En cola: nunca se tapan unas a otras
  function enCola(tipo, texto, opc) {
    const r = cola.then(() => abrir(tipo, texto, opc));
    cola = r.catch(() => {});
    return r;
  }

  window.nvaAviso = (texto, opc) => enCola("aviso", texto, opc);
  window.nvaConfirmar = (texto, opc) => enCola("confirmar", texto, opc);
  window.nvaPreguntar = (texto, valor, opc) => enCola("pregunta", texto, Object.assign({}, opc, { valor }));
  window.alert = (texto) => { window.nvaAviso(texto); };
})();
