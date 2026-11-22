// =====================================================================
//  TARJETA DE PARTIDO EN IMAGEN (para enviarla por WhatsApp)
//  window.nvaTarjetaPartido.dibujar(datos, estilo) -> Promise<canvas>
//  datos: { cuando, jornada, categoria,
//           local: { nombre, logo (Image|null), club (bool) }, visitante: { … },
//           res: { l, v } | null, sets: "25-17 / 23-25 …", campo,
//           patro: Image|null (patrocinador del equipo), anulado: bool, motivo }
//  estilos: "duelo", "franja", "atardecer", "tv"
//  Apaisada 16:9 (1600x900). Capas: fondo azul/naranja → marca de agua del
//  escudo del club → patrocinador → textos y escudos.
// =====================================================================
(function () {
  "use strict";
  const W = 1600, H = 900;
  const AZUL = "#061a52", AZUL2 = "#0b2f8f", AZUL3 = "#1d4ed8", NAR = "#f97316", NAR2 = "#fdba74", NAR3 = "#c2410c", BLANCO = "#ffffff";
  const F_TIT = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const F_TXT = '"Barlow", Arial, sans-serif';
  const F_MAR = '"Anton", "Barlow Condensed", sans-serif';

  // Tipografías de la app (en fonts/) y escudo del club
  let listo = null;
  function preparar() {
    if (listo) return listo;
    const fuentes = [
      new FontFace("Anton", "url(fonts/anton-latin-400-normal.woff2)"),
      new FontFace("Barlow Condensed", "url(fonts/barlow-condensed-latin-800-italic.woff2)", { style: "italic", weight: "600 900" }),
      new FontFace("Barlow Condensed", "url(fonts/barlow-condensed-latin-700-normal.woff2)", { weight: "600 900" }),
      new FontFace("Barlow", "url(fonts/barlow-latin-700-normal.woff2)", { weight: "700 900" }),
      new FontFace("Barlow", "url(fonts/barlow-latin-600-normal.woff2)", { weight: "600" })
    ];
    const logo = new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = "LOGO-NVA.png"; });
    listo = Promise.all([Promise.all(fuentes.map(f => f.load().then(x => document.fonts.add(x)).catch(() => {}))), logo]).then(([, l]) => ({ logo: l }));
    return listo;
  }

  // ---------- utilidades de dibujo ----------
  function ajustar(ctx, texto, maxW, fs, peso, fuente, minFs) {
    let f = fs;
    do { ctx.font = `${peso} ${f}px ${fuente}`; if (ctx.measureText(texto).width <= maxW) break; f -= 2; } while (f > (minFs || 18));
    return f;
  }
  // Texto en una o dos líneas que quepa en maxW
  function lineas(ctx, texto, maxW, fs, peso, fuente, minFs) {
    texto = String(texto || "").toUpperCase();
    ctx.font = `${peso} ${fs}px ${fuente}`;
    if (ctx.measureText(texto).width <= maxW) return { ls: [texto], fs };
    const pal = texto.split(/\s+/);
    if (pal.length > 1) {
      let mejor = null;
      for (let i = 1; i < pal.length; i++) {
        const a = pal.slice(0, i).join(" "), b = pal.slice(i).join(" ");
        const m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
        if (!mejor || m < mejor.m) mejor = { a, b, m };
      }
      let f = fs * 0.86;
      for (;;) {
        ctx.font = `${peso} ${f}px ${fuente}`;
        if (Math.max(ctx.measureText(mejor.a).width, ctx.measureText(mejor.b).width) <= maxW || f <= (minFs || 22)) return { ls: [mejor.a, mejor.b], fs: f };
        f -= 2;
      }
    }
    return { ls: [texto], fs: ajustar(ctx, texto, maxW, fs, peso, fuente, minFs) };
  }
  function pintarLineas(ctx, L, x, yCentro, peso, fuente, color, alin, interl) {
    ctx.font = `${peso} ${L.fs}px ${fuente}`;
    ctx.fillStyle = color; ctx.textAlign = alin || "center"; ctx.textBaseline = "middle";
    const h = L.fs * (interl || 1.02), y0 = yCentro - (L.ls.length - 1) * h / 2;
    L.ls.forEach((t, i) => ctx.fillText(t, x, y0 + i * h));
    return L.ls.length * h;
  }
  function espaciado(ctx, texto, x, y, sep, alin) {
    const chars = [...texto];
    const ancho = chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + sep * (chars.length - 1);
    let cx = alin === "left" ? x : alin === "right" ? x - ancho : x - ancho / 2;
    const prev = ctx.textAlign; ctx.textAlign = "left";
    chars.forEach(c => { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + sep; });
    ctx.textAlign = prev;
    return ancho;
  }
  function redondo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function grano(ctx, alfa) {   // textura fina
    const c = document.createElement("canvas"); c.width = c.height = 160;
    const g = c.getContext("2d"), d = g.createImageData(160, 160);
    let s = 7;
    for (let i = 0; i < d.data.length; i += 4) { s = (s * 16807) % 2147483647; const v = s % 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 * alfa; }
    g.putImageData(d, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = "overlay"; ctx.fillStyle = ctx.createPattern(c, "repeat"); ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  // Imagen encajada (sin deformar) en una caja
  function encajar(ctx, img, x, y, w, h) {
    const r = Math.min(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }
  const iniciales = (n) => String(n || "?").replace(/^(CV|CD|CLUB|C\.V\.|VOLEI|VÓLEI|VOLEIBOL)\s+/i, "").split(/\s+/).filter(Boolean)
    .slice(0, 2).map(p => p[0]).join("").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase() || "?";
  // Escudo del equipo; sin imagen, sus iniciales en un círculo
  function escudo(ctx, eq, cx, cy, lado, opc) {
    opc = opc || {};
    ctx.save();
    if (opc.placa) {   // placa circular detrás
      ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
      ctx.beginPath(); ctx.arc(cx, cy, lado * 0.62, 0, Math.PI * 2); ctx.fillStyle = opc.placa; ctx.fill();
      ctx.shadowColor = "transparent";
      if (opc.aro) { ctx.lineWidth = 6; ctx.strokeStyle = opc.aro; ctx.stroke(); }
    }
    if (eq && eq.logo) {
      if (!opc.placa) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10; }
      encajar(ctx, eq.logo, cx - lado / 2, cy - lado / 2, lado, lado);
    } else {
      if (!opc.placa) { ctx.beginPath(); ctx.arc(cx, cy, lado * 0.5, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke(); }
      ctx.fillStyle = opc.placa ? AZUL : BLANCO; ctx.font = `800 ${lado * 0.42}px ${F_TIT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(iniciales(eq && eq.nombre), cx, cy + lado * 0.02);
    }
    ctx.restore();
  }
  // Capa de marca de agua: escudo del club grande y muy suave
  function marcaAgua(ctx, a, x, y, lado, alfa) {
    if (!a.logo) return;
    ctx.save(); ctx.globalAlpha = alfa; encajar(ctx, a.logo, x - lado / 2, y - lado / 2, lado, lado); ctx.restore();
  }
  // Capa del patrocinador (por debajo de los textos)
  function patrocinador(ctx, img, x, y, w, h, opc) {
    if (!img) return;
    opc = opc || {};
    ctx.save();
    if (opc.placa) {
      redondo(ctx, x - 18, y - 14, w + 36, h + 28, 18);
      ctx.fillStyle = opc.placa; ctx.fill();
    }
    ctx.globalAlpha = opc.alfa == null ? 1 : opc.alfa;
    encajar(ctx, img, x, y, w, h);
    ctx.restore();
  }
  function sello(ctx, motivo, x, y) {   // partido anulado
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.1);
    const t = "ANULADO" + (motivo ? " · " + motivo.toUpperCase() : "");
    ctx.font = `800 54px ${F_TIT}`;
    const w = Math.min(ctx.measureText(t).width + 70, W - 200);
    ajustar(ctx, t, w - 70, 54, 800, F_TIT);
    redondo(ctx, -w / 2, -46, w, 92, 16);
    ctx.fillStyle = "rgba(220,38,38,0.94)"; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, 0, 3);
    ctx.restore();
  }
  const cabeceraTxt = (d) => (d.jornada ? "JORNADA " + d.jornada : "PARTIDO") + (d.categoria ? " · " + d.categoria.toUpperCase() : "");
  const campoTxt = (d) => "📍 " + String(d.campo || "").toUpperCase();
  const marcadorTxt = (d) => d.res ? `${d.res.l} - ${d.res.v}` : "VS";

  // ---------- 1. Duelo: el campo partido en diagonal, azul contra naranja ----------
  function duelo(ctx, d, a) {
    const ga = ctx.createLinearGradient(0, 0, W * 0.6, H);
    ga.addColorStop(0, "#03103a"); ga.addColorStop(1, AZUL2);
    ctx.fillStyle = ga; ctx.fillRect(0, 0, W, H);
    const gn = ctx.createLinearGradient(W, 0, W * 0.45, H);
    gn.addColorStop(0, NAR2); gn.addColorStop(0.45, NAR); gn.addColorStop(1, NAR3);
    ctx.fillStyle = gn;
    ctx.beginPath(); ctx.moveTo(W * 0.62, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * 0.38, H); ctx.closePath(); ctx.fill();
    // filo blanco de la diagonal
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(W * 0.62, 0); ctx.lineTo(W * 0.38, H); ctx.stroke();
    marcaAgua(ctx, a, W / 2, H / 2 + 20, 820, 0.09);
    patrocinador(ctx, d.patro, W / 2 - 150, H - 150, 300, 96, { placa: "rgba(255,255,255,0.92)" });
    // cabecera
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.font = `700 30px ${F_TXT}`; ctx.fillStyle = "rgba(255,255,255,0.9)";
    espaciado(ctx, cabeceraTxt(d), W / 2, 62, 10, "center");
    ctx.font = `italic 800 52px ${F_TIT}`; ctx.fillStyle = BLANCO;
    ajustar(ctx, d.cuando.toUpperCase(), W - 300, 52, "italic 800", F_TIT);
    ctx.fillText(d.cuando.toUpperCase(), W / 2, 118);
    // equipos
    escudo(ctx, d.local, 330, 380, 300);
    escudo(ctx, d.visitante, W - 330, 380, 300);
    pintarLineas(ctx, lineas(ctx, d.local.nombre, 520, 62, "italic 800", F_TIT, 34), 330, 615, "italic 800", F_TIT, BLANCO, "center", 0.98);
    pintarLineas(ctx, lineas(ctx, d.visitante.nombre, 520, 62, "italic 800", F_TIT, 34), W - 330, 615, "italic 800", F_TIT, BLANCO, "center", 0.98);
    // marcador en el centro
    const cy = 400;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 10;
    if (d.res) { redondo(ctx, W / 2 - 190, cy - 92, 380, 184, 40); } else { ctx.beginPath(); ctx.arc(W / 2, cy, 110, 0, Math.PI * 2); }
    ctx.fillStyle = BLANCO; ctx.fill(); ctx.restore();
    ctx.fillStyle = AZUL; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = d.res ? `140px ${F_MAR}` : `italic 800 120px ${F_TIT}`;
    ctx.fillText(marcadorTxt(d), W / 2, cy + 6);
    if (d.sets) {
      ctx.font = `700 30px ${F_TXT}`; ajustar(ctx, d.sets, 560, 30, 700, F_TXT);
      const tw = ctx.measureText(d.sets).width + 48;
      redondo(ctx, W / 2 - tw / 2, cy + 120, tw, 56, 28); ctx.fillStyle = "rgba(6,26,82,0.85)"; ctx.fill();
      ctx.fillStyle = BLANCO; ctx.fillText(d.sets, W / 2, cy + 149);
    }
    // campo
    ctx.font = `600 32px ${F_TXT}`; ctx.fillStyle = BLANCO; ctx.textAlign = "center";
    ajustar(ctx, campoTxt(d), W - 400, 32, 600, F_TXT);
    ctx.fillText(campoTxt(d), W / 2, d.patro ? H - 196 : H - 70);
    if (d.anulado) sello(ctx, d.motivo, W / 2, cy);
    grano(ctx, 0.05);
  }

  // ---------- 2. Franja: azul profundo cruzado por una franja naranja con el resultado ----------
  function franja(ctx, d, a) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.75);
    g.addColorStop(0, AZUL3); g.addColorStop(0.55, AZUL2); g.addColorStop(1, "#020a2a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // líneas finas de pista
    ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 2;
    for (let x = -H; x < W; x += 46) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
    ctx.restore();
    marcaAgua(ctx, a, W - 260, 300, 760, 0.1);
    // franja naranja inclinada
    ctx.save(); ctx.translate(W / 2, 470); ctx.rotate(-0.06);
    const gf = ctx.createLinearGradient(-W, 0, W, 0); gf.addColorStop(0, NAR3); gf.addColorStop(0.5, NAR); gf.addColorStop(1, NAR3);
    ctx.fillStyle = gf; ctx.fillRect(-W, -120, W * 2, 240);
    ctx.fillStyle = NAR2; ctx.fillRect(-W, -132, W * 2, 8); ctx.fillRect(-W, 124, W * 2, 8);
    ctx.restore();
    patrocinador(ctx, d.patro, 70, 48, 250, 90, { placa: "rgba(255,255,255,0.92)" });
    // cabecera arriba a la derecha
    ctx.textBaseline = "middle"; ctx.textAlign = "right";
    ctx.font = `700 28px ${F_TXT}`; ctx.fillStyle = NAR2;
    espaciado(ctx, cabeceraTxt(d), W - 70, 70, 8, "right");
    ctx.font = `italic 800 54px ${F_TIT}`; ctx.fillStyle = BLANCO;
    ajustar(ctx, d.cuando.toUpperCase(), 900, 54, "italic 800", F_TIT);
    ctx.fillText(d.cuando.toUpperCase(), W - 70, 128);
    // escudos sobre la franja y nombres debajo
    escudo(ctx, d.local, 260, 470, 250, { placa: BLANCO, aro: NAR2 });
    escudo(ctx, d.visitante, W - 260, 470, 250, { placa: BLANCO, aro: NAR2 });
    pintarLineas(ctx, lineas(ctx, d.local.nombre, 470, 54, "italic 800", F_TIT, 30), 260, 700, "italic 800", F_TIT, BLANCO, "center", 0.98);
    pintarLineas(ctx, lineas(ctx, d.visitante.nombre, 470, 54, "italic 800", F_TIT, 30), W - 260, 700, "italic 800", F_TIT, BLANCO, "center", 0.98);
    // resultado en la franja
    ctx.save(); ctx.translate(W / 2, 470); ctx.rotate(-0.06);
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
    ctx.fillStyle = BLANCO; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = d.res ? `200px ${F_MAR}` : `italic 800 190px ${F_TIT}`;
    ctx.fillText(marcadorTxt(d), 0, 8);
    ctx.restore();
    if (d.sets) { ctx.font = `700 32px ${F_TXT}`; ctx.fillStyle = NAR2; ctx.textAlign = "center"; ajustar(ctx, d.sets, 560, 32, 700, F_TXT); ctx.fillText(d.sets, W / 2, 648); }
    ctx.font = `600 32px ${F_TXT}`; ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.textAlign = "center";
    ajustar(ctx, campoTxt(d), W - 300, 32, 600, F_TXT);
    ctx.fillText(campoTxt(d), W / 2, H - 62);
    if (d.anulado) sello(ctx, d.motivo, W / 2, 470);
    grano(ctx, 0.05);
  }

  // ---------- 3. Atardecer: degradado azul → naranja y tarjeta de cristal ----------
  function atardecer(ctx, d, a) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#04154a"); g.addColorStop(0.45, AZUL3); g.addColorStop(0.78, NAR); g.addColorStop(1, NAR2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // halos
    [[220, 160, 420, "rgba(96,165,250,0.35)"], [W - 200, H - 120, 480, "rgba(253,186,116,0.45)"]].forEach(([x, y, r, c]) => {
      const h = ctx.createRadialGradient(x, y, 10, x, y, r); h.addColorStop(0, c); h.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = h; ctx.fillRect(0, 0, W, H);
    });
    marcaAgua(ctx, a, 250, H / 2 + 60, 900, 0.12);
    // tarjeta de cristal
    const cx = 120, cyT = 170, cw = W - 240, ch = 590;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
    redondo(ctx, cx, cyT, cw, ch, 44); ctx.fillStyle = "rgba(6,26,82,0.55)"; ctx.fill(); ctx.restore();
    redondo(ctx, cx, cyT, cw, ch, 44); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.stroke();
    patrocinador(ctx, d.patro, W / 2 - 140, cyT + ch - 120, 280, 84, { alfa: 0.95, placa: "rgba(255,255,255,0.9)" });
    // cabecera encima de la tarjeta
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = `italic 800 56px ${F_TIT}`; ctx.fillStyle = BLANCO;
    ajustar(ctx, d.cuando.toUpperCase(), 860, 56, "italic 800", F_TIT);
    ctx.fillText(d.cuando.toUpperCase(), 130, 96);
    ctx.font = `700 26px ${F_TXT}`; ctx.fillStyle = BLANCO; ctx.textAlign = "right";
    const ct = cabeceraTxt(d); ctx.font = `700 26px ${F_TXT}`;
    const cwid = Math.min(ctx.measureText(ct).width + 60, 620);
    redondo(ctx, W - 120 - cwid, 70, cwid, 56, 28); ctx.fillStyle = NAR; ctx.fill();
    ctx.fillStyle = BLANCO; ajustar(ctx, ct, cwid - 40, 26, 700, F_TXT); ctx.textAlign = "center"; ctx.fillText(ct, W - 120 - cwid / 2, 99);
    // equipos
    const ey = cyT + 210;
    escudo(ctx, d.local, cx + 230, ey, 240);
    escudo(ctx, d.visitante, cx + cw - 230, ey, 240);
    pintarLineas(ctx, lineas(ctx, d.local.nombre, 420, 50, "italic 800", F_TIT, 28), cx + 230, ey + 175, "italic 800", F_TIT, BLANCO, "center", 0.98);
    pintarLineas(ctx, lineas(ctx, d.visitante.nombre, 420, 50, "italic 800", F_TIT, 28), cx + cw - 230, ey + 175, "italic 800", F_TIT, BLANCO, "center", 0.98);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.save(); ctx.shadowColor = "rgba(249,115,22,0.7)"; ctx.shadowBlur = 40;
    ctx.fillStyle = BLANCO; ctx.font = d.res ? `170px ${F_MAR}` : `italic 800 160px ${F_TIT}`;
    ctx.fillText(marcadorTxt(d), W / 2, ey - 6); ctx.restore();
    if (d.sets) { ctx.font = `700 32px ${F_TXT}`; ctx.fillStyle = NAR2; ajustar(ctx, d.sets, 520, 32, 700, F_TXT); ctx.fillText(d.sets, W / 2, ey + 120); }
    ctx.font = `600 30px ${F_TXT}`; ctx.fillStyle = BLANCO;
    ajustar(ctx, campoTxt(d), W - 320, 30, 600, F_TXT);
    ctx.fillText(campoTxt(d), W / 2, H - 70);
    if (d.anulado) sello(ctx, d.motivo, W / 2, ey);
    grano(ctx, 0.04);
  }

  // ---------- 4. TV: rótulo de retransmisión con marcador y sets en casillas ----------
  function tv(ctx, d, a) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#071d63"); g.addColorStop(1, "#020b2e");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // haces naranjas
    ctx.save(); ctx.globalAlpha = 0.9;
    [[0, 0.16], [90, 0.1], [170, 0.06]].forEach(([o, al]) => {
      ctx.globalAlpha = al; ctx.fillStyle = NAR;
      ctx.beginPath(); ctx.moveTo(W - 520 + o, 0); ctx.lineTo(W - 380 + o, 0); ctx.lineTo(W - 900 + o, H); ctx.lineTo(W - 1040 + o, H); ctx.closePath(); ctx.fill();
    });
    ctx.restore();
    marcaAgua(ctx, a, W / 2, H / 2, 860, 0.08);
    patrocinador(ctx, d.patro, W - 360, H - 150, 280, 90, { placa: "rgba(255,255,255,0.92)" });
    // barra superior
    ctx.fillStyle = NAR; ctx.fillRect(0, 0, W, 14);
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = `700 28px ${F_TXT}`; ctx.fillStyle = NAR2;
    espaciado(ctx, cabeceraTxt(d), 80, 84, 8, "left");
    ctx.font = `italic 800 60px ${F_TIT}`; ctx.fillStyle = BLANCO;
    ajustar(ctx, d.cuando.toUpperCase(), W - 160, 60, "italic 800", F_TIT);
    ctx.fillText(d.cuando.toUpperCase(), 80, 148);
    // rótulo: [escudo | NOMBRE | marcador | NOMBRE | escudo]
    const ry = 300, rh = 220;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    redondo(ctx, 60, ry, W - 120, rh, 26); ctx.fillStyle = BLANCO; ctx.fill(); ctx.restore();
    const mw = d.res ? 330 : 260;
    ctx.save(); redondo(ctx, 60, ry, W - 120, rh, 26); ctx.clip();
    ctx.fillStyle = AZUL; ctx.fillRect(W / 2 - mw / 2, ry, mw, rh);
    ctx.fillStyle = NAR; ctx.fillRect(60, ry + rh - 12, W - 120, 12);
    ctx.restore();
    escudo(ctx, d.local, 170, ry + rh / 2 - 4, 170);
    escudo(ctx, d.visitante, W - 170, ry + rh / 2 - 4, 170);
    const nw = W / 2 - mw / 2 - 300;
    pintarLineas(ctx, lineas(ctx, d.local.nombre, nw, 58, "italic 800", F_TIT, 28), 280, ry + rh / 2 - 4, "italic 800", F_TIT, AZUL, "left", 0.98);
    pintarLineas(ctx, lineas(ctx, d.visitante.nombre, nw, 58, "italic 800", F_TIT, 28), W - 280, ry + rh / 2 - 4, "italic 800", F_TIT, AZUL, "right", 0.98);
    ctx.fillStyle = BLANCO; ctx.textAlign = "center";
    ctx.font = d.res ? `130px ${F_MAR}` : `italic 800 120px ${F_TIT}`;
    ctx.fillText(marcadorTxt(d), W / 2, ry + rh / 2);
    // sets en casillas
    const sets = String(d.sets || "").split("/").map(s => s.trim()).filter(Boolean);
    if (sets.length) {
      const bw = 150, gap = 18, tot = sets.length * bw + (sets.length - 1) * gap;
      let x = W / 2 - tot / 2;
      sets.forEach((s, i) => {
        redondo(ctx, x, ry + rh + 40, bw, 96, 16); ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "rgba(253,186,116,0.6)"; ctx.stroke();
        ctx.font = `700 20px ${F_TXT}`; ctx.fillStyle = NAR2; ctx.fillText("SET " + (i + 1), x + bw / 2, ry + rh + 66);
        ctx.font = `800 40px ${F_TIT}`; ctx.fillStyle = BLANCO; ctx.fillText(s, x + bw / 2, ry + rh + 106);
        x += bw + gap;
      });
    }
    ctx.textAlign = "left"; ctx.font = `600 32px ${F_TXT}`; ctx.fillStyle = BLANCO;
    ajustar(ctx, campoTxt(d), d.patro ? W - 520 : W - 160, 32, 600, F_TXT);
    ctx.fillText(campoTxt(d), 80, H - 104);
    if (d.anulado) sello(ctx, d.motivo, W / 2, ry + rh / 2);
    grano(ctx, 0.04);
  }

  const ESTILOS = { duelo, franja, atardecer, tv };
  async function dibujar(datos, estilo) {
    const a = await preparar();
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const d = Object.assign({ cuando: "", campo: "" }, datos);
    d.local = Object.assign({ nombre: "" }, d.local); d.visitante = Object.assign({ nombre: "" }, d.visitante);
    (ESTILOS[estilo] || duelo)(ctx, d, a);
    return c;
  }
  window.nvaTarjetaPartido = { dibujar, estilos: Object.keys(ESTILOS) };
})();
