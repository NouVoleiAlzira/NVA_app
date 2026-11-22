// =====================================================================
//  TARJETA DE PARTIDO EN IMAGEN (para enviarla por WhatsApp)
//  window.nvaTarjetaPartido.dibujar(datos, estilo) -> Promise<canvas>
//  datos: { cuando, jornada, local, visitante, nvaLocal (bool), res: { l, v } | null,
//           sets: "25-17 / 23-25 …", campo, anulado: bool, motivo }
//  estilos: "marcador", "diagonal", "red", "entrada"
//  Formato 1080x1350 (4:5), el que mejor se ve en WhatsApp.
// =====================================================================
(function () {
  "use strict";
  const W = 1080, H = 1350;
  const AZUL = "#06123c", AZUL2 = "#0d2a7a", AZUL3 = "#1d4fd8", ORO = "#facc15", ORO2 = "#fde68a", BLANCO = "#ffffff";
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
    do { ctx.font = `${peso} ${f}px ${fuente}`; if (ctx.measureText(texto).width <= maxW) break; f -= 2; } while (f > (minFs || 20));
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
        if (Math.max(ctx.measureText(mejor.a).width, ctx.measureText(mejor.b).width) <= maxW || f <= (minFs || 24)) return { ls: [mejor.a, mejor.b], fs: f };
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
  function grano(ctx, alfa) {   // textura fina de papel/pantalla
    const c = document.createElement("canvas"); c.width = c.height = 160;
    const g = c.getContext("2d"), d = g.createImageData(160, 160);
    let s = 7;
    for (let i = 0; i < d.data.length; i += 4) { s = (s * 16807) % 2147483647; const v = s % 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 * alfa; }
    g.putImageData(d, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = "overlay"; ctx.fillStyle = ctx.createPattern(c, "repeat"); ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  function escudo(ctx, logo, x, y, r, esNva, nombre, oscuro) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = oscuro ? "rgba(255,255,255,0.08)" : "#ffffff"; ctx.fill();
    ctx.lineWidth = Math.max(3, r * 0.06); ctx.strokeStyle = ORO; ctx.stroke();
    ctx.clip();
    if (esNva && logo) ctx.drawImage(logo, x - r * 0.86, y - r * 0.86, r * 1.72, r * 1.72);
    else {
      const ini = String(nombre || "?").replace(/^(CV|CD|CLUB|C\.V\.|VOLEI|VÓLEI|VOLEIBOL)\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      ctx.fillStyle = oscuro ? "#ffffff" : AZUL; ctx.font = `800 ${r * 0.8}px ${F_TIT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ini || "?", x, y + r * 0.04);
    }
    ctx.restore();
  }
  function sello(ctx, motivo, x, y) {   // partido anulado
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.14);
    ctx.font = `800 46px ${F_TIT}`;
    const t = "ANULADO" + (motivo ? " · " + motivo.toUpperCase() : "");
    const w = Math.min(ctx.measureText(t).width + 60, W - 120);
    ajustar(ctx, t, w - 60, 46, 800, F_TIT);
    redondo(ctx, -w / 2, -40, w, 80, 14);
    ctx.fillStyle = "rgba(220,38,38,0.92)"; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, 0, 2);
    ctx.restore();
  }
  function pie(ctx, color) {
    ctx.font = `700 26px ${F_TXT}`; ctx.fillStyle = color; ctx.textBaseline = "middle";
    espaciado(ctx, "NOU VÒLEI ALZIRA", W / 2, H - 52, 8, "center");
  }

  // ---------- 1. Marcador: noche de partido con el resultado como protagonista ----------
  function marcador(ctx, d, a) {
    const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, "#030a26"); bg.addColorStop(0.55, AZUL2); bg.addColorStop(1, "#071a55");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // haz de luz de pabellón
    const luz = ctx.createRadialGradient(W / 2, 640, 40, W / 2, 640, 720);
    luz.addColorStop(0, "rgba(96,165,250,0.40)"); luz.addColorStop(1, "rgba(96,165,250,0)");
    ctx.fillStyle = luz; ctx.fillRect(0, 0, W, H);
    // franjas doradas en diagonal (esquinas)
    ctx.save();
    [[-260, 0.9], [-200, 0.35], [-150, 0.18]].forEach(([o, al], i) => {
      ctx.globalAlpha = al; ctx.fillStyle = i ? ORO2 : ORO;
      ctx.beginPath(); ctx.moveTo(W + o, 0); ctx.lineTo(W + o + 70 - i * 20, 0); ctx.lineTo(W, 330 + o * -0.2 - i * 40); ctx.lineTo(W, 260 + o * -0.2 - i * 40); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-o, H); ctx.lineTo(-o - 70 + i * 20, H); ctx.lineTo(0, H - 330 + o * 0.2 + i * 40); ctx.lineTo(0, H - 260 + o * 0.2 + i * 40); ctx.closePath(); ctx.fill();
    });
    ctx.restore();
    if (a.logo) { ctx.save(); ctx.globalAlpha = 0.06; ctx.drawImage(a.logo, W / 2 - 430, 220, 860, 860); ctx.restore(); }
    // cabecera
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `700 30px ${F_TXT}`; ctx.fillStyle = ORO;
    espaciado(ctx, (d.jornada ? "JORNADA " + d.jornada : "PARTIDO"), W / 2, 112, 12, "center");
    ctx.font = `italic 800 58px ${F_TIT}`; ctx.fillStyle = BLANCO;
    ajustar(ctx, d.cuando.toUpperCase(), W - 160, 58, "italic 800", F_TIT);
    ctx.fillText(d.cuando.toUpperCase(), W / 2, 178);
    ctx.fillStyle = ORO; ctx.fillRect(W / 2 - 60, 226, 120, 6);
    // equipos
    const fila = (nombre, nva, y) => {
      escudo(ctx, a.logo, 190, y, 92, nva, nombre, true);
      const L = lineas(ctx, nombre, 640, 78, "italic 800", F_TIT, 40);
      pintarLineas(ctx, L, 312, y, "italic 800", F_TIT, nva ? ORO : BLANCO, "left", 0.98);
    };
    fila(d.local, d.nvaLocal, 390);
    fila(d.visitante, !d.nvaLocal, 900);
    // marcador
    const cy = 645;
    if (d.res) {
      ctx.save(); ctx.shadowColor = "rgba(250,204,21,0.55)"; ctx.shadowBlur = 50;
      redondo(ctx, W / 2 - 250, cy - 95, 500, 190, 95);
      const gp = ctx.createLinearGradient(0, cy - 95, 0, cy + 95); gp.addColorStop(0, ORO2); gp.addColorStop(1, ORO);
      ctx.fillStyle = gp; ctx.fill(); ctx.restore();
      ctx.fillStyle = AZUL; ctx.font = `150px ${F_MAR}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(`${d.res.l} - ${d.res.v}`, W / 2, cy + 6);
      if (d.sets) { ctx.font = `600 34px ${F_TXT}`; ctx.fillStyle = "rgba(255,255,255,0.85)"; ajustar(ctx, d.sets, W - 200, 34, 600, F_TXT); ctx.fillText(d.sets, W / 2, cy + 140); }
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(140, cy); ctx.lineTo(W / 2 - 130, cy); ctx.moveTo(W / 2 + 130, cy); ctx.lineTo(W - 140, cy); ctx.stroke();
      ctx.save(); ctx.shadowColor = "rgba(250,204,21,0.6)"; ctx.shadowBlur = 40;
      ctx.beginPath(); ctx.arc(W / 2, cy, 105, 0, Math.PI * 2); ctx.fillStyle = ORO; ctx.fill(); ctx.restore();
      ctx.fillStyle = AZUL; ctx.font = `italic 800 108px ${F_TIT}`; ctx.textAlign = "center"; ctx.fillText("VS", W / 2, cy + 6);
    }
    // campo
    ctx.font = `600 34px ${F_TXT}`; ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.textAlign = "center";
    const campo = "📍 " + d.campo.toUpperCase();
    ajustar(ctx, campo, W - 180, 34, 600, F_TXT);
    ctx.fillText(campo, W / 2, 1110);
    if (d.anulado) sello(ctx, d.motivo, W / 2, 645);
    grano(ctx, 0.05);
    pie(ctx, "rgba(255,255,255,0.55)");
  }

  // ---------- 2. Diagonal: el campo partido en dos, cada equipo en su mitad ----------
  function diagonal(ctx, d, a) {
    const corte = (x) => 760 - (x / W) * 220;   // línea de la diagonal
    // mitad de arriba (local)
    const g1 = ctx.createLinearGradient(0, 0, W, 700); g1.addColorStop(0, "#04103a"); g1.addColorStop(1, AZUL3);
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
    // mitad de abajo (visitante) dorada
    const g2 = ctx.createLinearGradient(0, 600, 0, H); g2.addColorStop(0, ORO2); g2.addColorStop(1, "#f59e0b");
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.moveTo(0, corte(0)); ctx.lineTo(W, corte(W)); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    // rayas finas paralelas a la diagonal
    ctx.save(); ctx.globalAlpha = 0.10; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    for (let k = -900; k < 1400; k += 28) { ctx.beginPath(); ctx.moveTo(0, corte(0) + k); ctx.lineTo(W, corte(W) + k); ctx.stroke(); }
    ctx.restore();
    // borde blanco de la diagonal
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(0, corte(0)); ctx.lineTo(W, corte(W)); ctx.stroke();
    // cabecera
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillStyle = ORO; ctx.font = `800 30px ${F_TXT}`;
    espaciado(ctx, d.jornada ? "JORNADA " + d.jornada : "PARTIDO", 80, 104, 10, "left");
    ctx.fillStyle = BLANCO; ctx.font = `italic 800 54px ${F_TIT}`;
    ajustar(ctx, d.cuando.toUpperCase(), W - 330, 54, "italic 800", F_TIT);
    ctx.fillText(d.cuando.toUpperCase(), 80, 160);
    if (a.logo) ctx.drawImage(a.logo, W - 220, 50, 150, 150);
    // local
    escudo(ctx, a.logo, 170, 400, 90, d.nvaLocal, d.local, true);
    const L1 = lineas(ctx, d.local, 720, 92, "italic 800", F_TIT, 44);
    pintarLineas(ctx, L1, 290, 400, "italic 800", F_TIT, d.nvaLocal ? ORO : BLANCO, "left", 0.96);
    ctx.font = `700 26px ${F_TXT}`; ctx.fillStyle = "rgba(255,255,255,0.65)"; espaciado(ctx, "LOCAL", 290, 400 - L1.ls.length * L1.fs * 0.5 - 30, 8, "left");
    // visitante
    escudo(ctx, a.logo, W - 170, 1000, 90, !d.nvaLocal, d.visitante, false);
    const L2 = lineas(ctx, d.visitante, 720, 92, "italic 800", F_TIT, 44);
    pintarLineas(ctx, L2, W - 290, 1000, "italic 800", F_TIT, AZUL, "right", 0.96);
    ctx.font = `700 26px ${F_TXT}`; ctx.fillStyle = "rgba(6,18,60,0.6)"; espaciado(ctx, "VISITANTE", W - 290, 1000 - L2.ls.length * L2.fs * 0.5 - 30, 8, "right");
    // centro: resultado o VS sobre la diagonal
    const cx = W / 2, cy = corte(cx);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.atan2(220, W));
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    const ancho = d.res ? 440 : 230;
    redondo(ctx, -ancho / 2, -82, ancho, 164, 30); ctx.fillStyle = AZUL; ctx.fill();
    ctx.shadowColor = "transparent"; ctx.lineWidth = 8; ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = d.res ? ORO : BLANCO; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = d.res ? `130px ${F_MAR}` : `italic 800 112px ${F_TIT}`;
    ctx.fillText(d.res ? `${d.res.l} - ${d.res.v}` : "VS", 0, 6);
    ctx.restore();
    if (d.res && d.sets) {
      ctx.font = `700 32px ${F_TXT}`; ctx.fillStyle = AZUL; ctx.textAlign = "center";
      ajustar(ctx, d.sets, W - 200, 32, 700, F_TXT); ctx.fillText(d.sets, W / 2, cy + 140);
    }
    // campo
    ctx.textAlign = "left"; ctx.font = `700 32px ${F_TXT}`; ctx.fillStyle = AZUL;
    const campo = "📍 " + d.campo.toUpperCase();
    ajustar(ctx, campo, W - 160, 32, 700, F_TXT);
    ctx.fillText(campo, 80, 1200);
    if (d.anulado) sello(ctx, d.motivo, W / 2, cy - 190);
    grano(ctx, 0.04);
    pie(ctx, "rgba(6,18,60,0.6)");
  }

  // ---------- 3. Red: la malla de la red como fondo y tipografía enorme ----------
  function red(ctx, d, a) {
    ctx.fillStyle = "#040b24"; ctx.fillRect(0, 0, W, H);
    // malla en perspectiva suave
    ctx.save(); ctx.strokeStyle = "rgba(147,197,253,0.13)"; ctx.lineWidth = 2;
    for (let x = -40; x <= W + 40; x += 46) { ctx.beginPath(); ctx.moveTo(x, 300); ctx.lineTo(x + (x - W / 2) * 0.08, 1050); ctx.stroke(); }
    for (let y = 300; y <= 1050; y += 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
    // cinta superior e inferior de la red
    ["#ffffff", "#ffffff"].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i ? 1050 : 286, W, 16); });
    // arco del balón (trayectoria) con brillo
    ctx.save(); ctx.strokeStyle = ORO; ctx.lineWidth = 6; ctx.setLineDash([2, 22]); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(90, 1000); ctx.quadraticCurveTo(W * 0.55, -80, W - 120, 470); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.shadowColor = ORO; ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.arc(W - 120, 470, 34, 0, Math.PI * 2); ctx.fillStyle = ORO; ctx.fill(); ctx.restore();
    ctx.strokeStyle = AZUL; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(W - 120, 470, 34, 0, Math.PI * 2); ctx.moveTo(W - 154, 470); ctx.quadraticCurveTo(W - 120, 440, W - 86, 470); ctx.moveTo(W - 120, 436); ctx.quadraticCurveTo(W - 100, 470, W - 120, 504); ctx.stroke();
    // cabecera
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ORO; ctx.font = `150px ${F_MAR}`;
    ctx.fillText(d.jornada ? "J" + d.jornada : "NVA", 70, 210);
    const jw = ctx.measureText(d.jornada ? "J" + d.jornada : "NVA").width;
    ctx.fillStyle = BLANCO; ctx.font = `italic 800 46px ${F_TIT}`; ctx.textBaseline = "middle";
    const partes = d.cuando.toUpperCase().split(" · ");
    ajustar(ctx, partes[0], W - jw - 140, 46, "italic 800", F_TIT);
    ctx.fillText(partes[0], 100 + jw, 120);
    ctx.fillStyle = ORO; ctx.font = `italic 800 64px ${F_TIT}`; ctx.fillText(partes[1] || "", 100 + jw, 180);
    // equipos sobre la red
    const bloque = (nombre, nva, y, maxW) => {
      const L = lineas(ctx, nombre, maxW, 104, "italic 800", F_TIT, 50);
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 18;
      pintarLineas(ctx, L, 80, y, "italic 800", F_TIT, nva ? ORO : BLANCO, "left", 0.95);
      ctx.restore();
    };
    bloque(d.local, d.nvaLocal, 440, W - 300);   // deja sitio al balón
    bloque(d.visitante, !d.nvaLocal, 900, W - 160);
    // marcador en franja
    const cy = 670;
    ctx.fillStyle = ORO; ctx.beginPath(); ctx.moveTo(0, cy - 70); ctx.lineTo(d.res ? 620 : 380, cy - 70); ctx.lineTo(d.res ? 560 : 320, cy + 70); ctx.lineTo(0, cy + 70); ctx.closePath(); ctx.fill();
    ctx.fillStyle = AZUL; ctx.font = `120px ${F_MAR}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(d.res ? `${d.res.l} - ${d.res.v}` : "VS", 80, cy + 6);
    if (d.res && d.sets) {
      ctx.fillStyle = BLANCO; ctx.font = `700 30px ${F_TXT}`;
      const s = d.sets.split(" / ");
      const mitad = Math.ceil(s.length / 2);
      ctx.fillText(s.slice(0, mitad).join("  ·  "), 640, cy - 22);
      ctx.fillText(s.slice(mitad).join("  ·  "), 640, cy + 26);
    }
    // campo
    ctx.textAlign = "left"; ctx.font = `600 34px ${F_TXT}`; ctx.fillStyle = "rgba(255,255,255,0.9)";
    const campo = "📍 " + d.campo.toUpperCase();
    ajustar(ctx, campo, W - 160, 34, 600, F_TXT);
    ctx.fillText(campo, 80, 1150);
    if (a.logo) { ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(a.logo, W - 190, 1170, 110, 110); ctx.restore(); }
    if (d.anulado) sello(ctx, d.motivo, W / 2, cy);
    grano(ctx, 0.05);
    ctx.font = `700 26px ${F_TXT}`; ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.textBaseline = "middle";
    espaciado(ctx, "NOU VÒLEI ALZIRA", 80, H - 70, 8, "left");
  }

  // ---------- 4. Entrada: billete de partido con talón troquelado ----------
  function entrada(ctx, d, a) {
    const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#0b1d5c"); bg.addColorStop(1, "#020818");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // patrón de puntos
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let y = 20; y < H; y += 36) for (let x = (y / 36) % 2 ? 38 : 20; x < W; x += 36) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
    // billete
    const bx = 90, by = 120, bw = W - 180, bh = 1090, talon = 300;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
    redondo(ctx, bx, by, bw, bh, 36); ctx.fillStyle = "#fbfaf5"; ctx.fill(); ctx.restore();
    // muescas del troquel
    const ty = by + bh - talon;
    ctx.save(); ctx.globalCompositeOperation = "destination-out";
    [bx, bx + bw].forEach(x => { ctx.beginPath(); ctx.arc(x, ty, 40, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.strokeStyle = "rgba(6,18,60,0.35)"; ctx.lineWidth = 4; ctx.setLineDash([14, 14]);
    ctx.beginPath(); ctx.moveTo(bx + 60, ty); ctx.lineTo(bx + bw - 60, ty); ctx.stroke(); ctx.setLineDash([]);
    // cinta superior azul con oro
    ctx.save(); redondo(ctx, bx, by, bw, bh, 36); ctx.clip();
    ctx.fillStyle = AZUL; ctx.fillRect(bx, by, bw, 170);
    ctx.fillStyle = ORO; ctx.fillRect(bx, by + 170, bw, 10);
    ctx.restore();
    if (a.logo) ctx.drawImage(a.logo, bx + 36, by + 25, 120, 120);
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = ORO; ctx.font = `700 26px ${F_TXT}`;
    espaciado(ctx, d.jornada ? "JORNADA " + d.jornada : "PARTIDO", bx + 180, by + 62, 8, "left");
    ctx.fillStyle = BLANCO; ctx.font = `italic 800 50px ${F_TIT}`;
    ajustar(ctx, d.cuando.toUpperCase(), bw - 230, 50, "italic 800", F_TIT);
    ctx.fillText(d.cuando.toUpperCase(), bx + 180, by + 112);
    // equipos
    const fila = (nombre, nva, y, rotulo) => {
      escudo(ctx, a.logo, bx + 110, y, 66, nva, nombre, false);
      ctx.font = `700 22px ${F_TXT}`; ctx.fillStyle = "rgba(6,18,60,0.5)"; ctx.textAlign = "left";
      espaciado(ctx, rotulo, bx + 200, y - 56, 6, "left");
      const L = lineas(ctx, nombre, bw - 260, 70, "italic 800", F_TIT, 36);
      pintarLineas(ctx, L, bx + 200, y + 10, "italic 800", F_TIT, AZUL, "left", 0.95);
    };
    fila(d.local, d.nvaLocal, by + 320, "LOCAL");
    fila(d.visitante, !d.nvaLocal, by + 620, "VISITANTE");
    // marcador
    const cy = by + 470;
    if (d.res) {
      redondo(ctx, bx + 60, cy - 50, 280, 100, 50); ctx.fillStyle = AZUL; ctx.fill();
      ctx.fillStyle = ORO; ctx.font = `76px ${F_MAR}`; ctx.textAlign = "center"; ctx.fillText(`${d.res.l} - ${d.res.v}`, bx + 200, cy + 4);
      if (d.sets) { ctx.fillStyle = "rgba(6,18,60,0.7)"; ctx.font = `700 28px ${F_TXT}`; ctx.textAlign = "left"; ajustar(ctx, d.sets, bw - 360, 28, 700, F_TXT); ctx.fillText(d.sets, bx + 370, cy + 2); }
    } else {
      ctx.strokeStyle = "rgba(6,18,60,0.15)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx + 200, cy); ctx.lineTo(bx + bw - 60, cy); ctx.stroke();
      redondo(ctx, bx + 60, cy - 40, 120, 80, 40); ctx.fillStyle = ORO; ctx.fill();
      ctx.fillStyle = AZUL; ctx.font = `italic 800 56px ${F_TIT}`; ctx.textAlign = "center"; ctx.fillText("VS", bx + 120, cy + 3);
    }
    // talón: campo
    ctx.textAlign = "left"; ctx.fillStyle = "rgba(6,18,60,0.5)"; ctx.font = `700 22px ${F_TXT}`;
    espaciado(ctx, "CAMPO", bx + 70, ty + 70, 6, "left");
    const L = lineas(ctx, d.campo, bw - 140, 50, "italic 800", F_TIT, 30);
    pintarLineas(ctx, L, bx + 70, ty + 145, "italic 800", F_TIT, AZUL, "left", 1);
    // código de barras decorativo
    let x = bx + bw - 70, s = 3;
    ctx.fillStyle = AZUL;
    for (let i = 0; i < 26; i++) { s = (s * 7 + 3) % 11; const w = 2 + (s % 4) * 2; x -= w + 5; ctx.fillRect(x, ty + 210, w, 50); }
    if (d.anulado) sello(ctx, d.motivo, W / 2, cy);
    pie(ctx, "rgba(255,255,255,0.55)");
  }

  const ESTILOS = { marcador, diagonal, red, entrada };
  async function dibujar(datos, estilo) {
    const a = await preparar();
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    (ESTILOS[estilo] || marcador)(ctx, datos, a);
    return c;
  }
  window.nvaTarjetaPartido = { dibujar, estilos: Object.keys(ESTILOS) };
})();
