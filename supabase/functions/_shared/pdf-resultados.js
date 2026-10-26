// =====================================================================
//  PDF «PARTIDOS Y RESULTADOS» (código compartido)
//  Cuadrante local × visitante de la liga de un equipo, con la
//  clasificación al lado, a partir del PDF de la federación.
//  Lo usan la app (cuadrante-pdf.js y la cabecera/pie de los demás PDF de
//  app.js) y la función de Supabase actualizar-drive (actualización
//  programada de los PDF en Drive), para que los dos dibujen lo mismo.
//  - En el navegador se carga con <script> y queda en window.nvaPdfResultados.
//  - En la función se importa («import "../_shared/pdf-resultados.js"»)
//    y queda en globalThis.nvaPdfResultados.
//  Necesita lectura-calendarios.js cargado antes (normalizeTeamName).
//  Solo dibuja con jsPDF: nada de pantalla, descargas ni guardado.
// =====================================================================
(function (raiz) {
  "use strict";
  const norm = (n) => raiz.nvaCalLectura.normalizeTeamName(n);

  // ---------- Cabecera y pie comunes a los PDF del club ----------
  // Banda de cabecera: azul noche, escudo en disco blanco, título y línea de ataque amarilla.
  // Devuelve la coordenada Y (mm) donde empieza el contenido.
  function banda(pdf, logo, { kicker, title, sub, h = 26 }) {
    const W = pdf.internal.pageSize.getWidth();
    pdf.setFillColor(13, 27, 69); pdf.rect(0, 0, W, h, "F");
    pdf.setFillColor(21, 41, 106); pdf.triangle(W * 0.55, 0, W, 0, W, h, "F");
    pdf.setFillColor(29, 53, 128); pdf.triangle(W * 0.78, 0, W, 0, W, h, "F");
    pdf.setFillColor(245, 197, 24); pdf.rect(0, h, W, 1.4, "F");
    const r = h * 0.36, cx = 12 + r, cy = h / 2;
    pdf.setFillColor(255, 255, 255); pdf.setDrawColor(245, 197, 24); pdf.setLineWidth(0.7);
    pdf.circle(cx, cy, r, "FD");
    if (logo) pdf.addImage(logo, "PNG", cx - r * 0.88, cy - r * 0.88, r * 1.76, r * 1.76, "nvalogo", "FAST");
    const tx = cx + r + 5;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(245, 197, 24);
    pdf.text(String(kicker || "CLUB NOU VÒLEI ALZIRA").toUpperCase(), tx, cy - 3.6, { charSpace: 0.6 });
    pdf.setFontSize(h > 22 ? 16 : 13); pdf.setTextColor(255, 255, 255);
    pdf.text(String(title || "").toUpperCase(), tx, cy + 2.6);
    if (sub) {
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(147, 163, 207);
      pdf.text(String(sub), tx, cy + 7.6);
    }
    pdf.setLineWidth(0.2);
    return h + 1.4;
  }
  // Pie: fecha de generación (de España), página y marca del club
  function pie(pdf, page, total) {
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 12;
    pdf.setDrawColor(227, 232, 244); pdf.setLineWidth(0.25); pdf.line(M, H - 9, W - M, H - 9);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(148, 163, 184);
    pdf.text("Generado el " + new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" }), M, H - 5);
    if (total > 1) pdf.text(`Página ${page} de ${total}`, W / 2, H - 5, { align: "center" });
    pdf.setFillColor(245, 197, 24); pdf.rect(W - M - 44, H - 6.4, 3.5, 1.1, "F");
    pdf.setFillColor(214, 40, 57); pdf.rect(W - M - 39.5, H - 6.4, 3.5, 1.1, "F");
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(27, 58, 140);
    pdf.text("NOU VÒLEI ALZIRA", W - M, H - 5, { align: "right", charSpace: 0.4 });
  }
  // Recorre todas las páginas al final y pone el pie
  function pies(pdf) {
    const n = pdf.getNumberOfPages();
    for (let i = 1; i <= n; i++) { pdf.setPage(i); pie(pdf, i, n); }
  }

  // ---------- Lectura del PDF de la federación ----------
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

  // lines: texto de cada línea del PDF. Devuelve { titulo, impreso, clasificacion: [...], partidos: [...] }
  function analizar(lines) {
    const res = { titulo: "", impreso: "", clasificacion: [], partidos: [] };
    let enClasif = false;
    lines.forEach(t => {
      if (!res.titulo && /LIGA|DIVISI|GRUPO|FASE/i.test(t) && !/FEDERACI/i.test(t)) res.titulo = t;
      const imp = t.match(/impresi[oó]n:\s*(.+)$/i); if (imp) res.impreso = imp[1];
      if (/^CLASIFICACI[OÓ]N$/i.test(t)) { enClasif = true; return; }
      if (enClasif) {
        const m = t.match(/^(\d+)\s+(.+?)((?:\s+-?\d+){11})$/);
        if (!m) return;
        const n = m[3].trim().split(/\s+/).map(Number);
        res.clasificacion.push({ pos: +m[1], nombre: m[2].trim(), pj: n[0], pg: n[1] + n[2], pp: n[3] + n[4], sf: n[6], sc: n[7], pts: n[10] });
      }
    });
    const nombres = res.clasificacion.map(c => c.nombre);
    if (!nombres.includes("DESCANSA")) nombres.push("DESCANSA");
    nombres.sort((a, b) => b.length - a.length);
    const prefijo = (s) => { for (const n of nombres) { const m = s.match(new RegExp("^" + reEsc(n) + "(?:\\s+|$)")); if (m) return { n, rest: s.slice(m[0].length) }; } return null; };
    lines.forEach(t => {
      const m = t.match(/^(\d{1,2})\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}:\d{2})\s+(.*)$/);
      if (!m) return;
      const loc = prefijo(m[6]); if (!loc) return;
      const r = loc.rest.match(/^(?:(\d)\s*-\s*(\d)(?:\s*\(([^)]*)\))?|-)(?:\s+|$)/); if (!r) return;
      const vis = prefijo(loc.rest.slice(r[0].length)); if (!vis) return;
      if (loc.n === "DESCANSA" || vis.n === "DESCANSA") return;
      res.partidos.push({
        jornada: +m[1], fecha: `${m[4]}-${m[3]}-${m[2]}`, hora: m[5], local: loc.n, visitante: vis.n,
        resultado: r[1] != null ? `${r[1]} - ${r[2]}` : "", sets: r[3] ? r[3].replace(/\s+/g, "") : ""
      });
    });
    return res;
  }

  const esClub = (n) => /\bNVA\b|NOU VOLE[IY]S? ALZIRA/.test(norm(n));
  // fed: nombre del equipo en la federación (CalendarioPartidos.json); team: { name, category } de la app
  function equipoPropio(key, nombres, fed, team) {
    if (fed) { const f = nombres.find(n => norm(n) === norm(fed)) || nombres.find(n => norm(n).includes(norm(fed))); if (f) return f; }
    const club = nombres.filter(esClub);
    if (club.length <= 1) return club[0] || "";
    const pal = norm(team ? team.name : key).split(" ").filter(w => w.length > 1 && w !== "NVA");
    return club.map(n => ({ n, s: pal.filter(w => (" " + norm(n) + " ").includes(" " + w + " ")).length }))
      .sort((a, b) => b.s - a.s)[0].n;
  }

  // ---------- Dibujo con jsPDF (A4 apaisado, una página por equipo) ----------
  const C = {
    gris: [27, 58, 140], grisOsc: [90, 90, 90], borde: [190, 199, 220], azul: [27, 58, 140], gris2: [160, 168, 184],
    rojo: [214, 40, 57], propio: [245, 197, 24], propioCel: [254, 245, 205], club: [190, 210, 250], clubCel: [234, 241, 254],
    noche: [13, 27, 69], diag: [226, 231, 243]
  };
  const fmtFecha = (iso) => { const [y, m, d] = iso.split("-"); return `${+d}-${+m}-${y.slice(2)}`; };

  function encajar(pdf, txt, ancho, tam, min) {
    let s = tam; pdf.setFontSize(s);
    while (s > min && pdf.getTextWidth(txt) > ancho) { s -= 0.25; pdf.setFontSize(s); }
    if (pdf.getTextWidth(txt) <= ancho) return txt;
    while (txt.length > 3 && pdf.getTextWidth(txt + "…") > ancho) txt = txt.slice(0, -1);
    return txt + "…";
  }

  // d: lo que devuelve analizar(). info: { fed, team } (ver equipoPropio)
  function dibujar(pdf, key, d, logo, info) {
    const { fed, team: t } = info || {};
    const W = 297, H = 210, M = 7;
    const propio = equipoPropio(key, d.clasificacion.map(c => c.nombre), fed, t);
    const equipos = d.clasificacion.map(c => c.nombre).filter(n => n !== "DESCANSA");
    d.partidos.forEach(p => [p.local, p.visitante].forEach(n => { if (!equipos.includes(n)) equipos.push(n); }));
    const n = equipos.length;
    const cat = ((d.titulo.match(/ALEV[IÍ]N|INFANTIL|CADETE|JUVENIL|J[UÚ]NIOR|SENIOR|S[EÉ]NIOR/i) || [])[0] || (t ? t.category : "")).toUpperCase();

    // Cabecera
    const yBand = banda(pdf, logo, { kicker: "Club Nou Vòlei Alzira · Partidos y resultados", title: key, sub: `${d.titulo}${d.impreso ? "   ·   Datos fvbcv.com del " + d.impreso : ""}`, h: 20 });

    // Cuadrante
    const x0 = M, y0 = yBand + 4, anchoGrid = 205;
    const cab = 30, cabX = 32;
    const cw = (anchoGrid - cabX) / n;
    const ch = Math.min(15, (H - 12 - y0 - cab) / n);
    const fondo = (nom, cel) => nom === propio ? (cel ? C.propioCel : C.propio) : esClub(nom) ? (cel ? C.clubCel : C.club) : null;
    pdf.setDrawColor(...C.borde); pdf.setLineWidth(0.15);

    // Esquina con diagonal
    pdf.setFillColor(...C.noche); pdf.rect(x0, y0, cabX, cab, "FD");
    pdf.setDrawColor(255); pdf.line(x0, y0, x0 + cabX, y0 + cab); pdf.setDrawColor(...C.borde);
    pdf.setTextColor(245, 197, 24); pdf.setFont("helvetica", "bold");
    pdf.text(encajar(pdf, cat || "LIGA", cabX - 3, 12, 6), x0 + 1.5, y0 + 6);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.5); pdf.setTextColor(233, 238, 250);
    const ang = Math.atan(cab / cabX) * 180 / Math.PI;
    pdf.text("VISITANTE", x0 + cabX * 0.55, y0 + cab * 0.42, { angle: -ang });
    pdf.text("LOCAL", x0 + cabX * 0.30, y0 + cab * 0.62, { angle: -ang });

    equipos.forEach((nom, i) => {
      // Columna (visitante): nombre girado
      const cx = x0 + cabX + i * cw;
      pdf.setFillColor(...(fondo(nom) || C.gris)); pdf.rect(cx, y0, cw, cab, "FD");
      pdf.setFont("helvetica", "bold"); pdf.setTextColor(fondo(nom) ? 0 : 255);
      const tc = encajar(pdf, nom, cab - 3, 6.5, 4);
      pdf.text(tc, cx + cw / 2 + pdf.getFontSize() * 0.12, y0 + cab - 1.5, { angle: 90 });
      // Fila (local)
      const ry = y0 + cab + i * ch;
      pdf.setFillColor(...(fondo(nom) || C.gris)); pdf.rect(x0, ry, cabX, ch, "FD");
      const tf = encajar(pdf, nom, cabX - 2, 6.5, 4);
      pdf.text(tf, x0 + cabX - 1, ry + ch / 2 + 1, { align: "right" });
    });

    equipos.forEach((loc, i) => equipos.forEach((vis, j) => {
      const cx = x0 + cabX + j * cw, ry = y0 + cab + i * ch;
      if (i === j) { pdf.setFillColor(...C.diag); pdf.rect(cx, ry, cw, ch, "FD"); return; }
      const bg = (loc === propio || vis === propio) ? C.propioCel : (esClub(loc) || esClub(vis)) ? C.clubCel : [255, 255, 255];
      pdf.setFillColor(...bg); pdf.rect(cx, ry, cw, ch, "FD");
      const ps = d.partidos.filter(p => p.local === loc && p.visitante === vis);
      const p = ps.find(x => x.resultado) || ps[0];
      if (!p) return;
      const jugado = !!p.resultado, sinHora = p.hora === "00:00";
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(5.5); pdf.setTextColor(...(jugado ? C.azul : C.gris2));
      pdf.text(`Jorn. ${p.jornada}`, cx + 0.8, ry + 2.3);
      pdf.setFontSize(4.3); pdf.setTextColor(...(sinHora && !jugado ? C.rojo : jugado ? C.azul : C.gris2));
      pdf.text(`${fmtFecha(p.fecha)}${sinHora ? "" : " " + p.hora}`, cx + cw - 0.6, ry + 4.4, { align: "right" });
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(Math.min(10, ch * 0.75));
      pdf.setTextColor(...(jugado ? C.azul : C.gris2));
      pdf.text(jugado ? p.resultado : "-", cx + cw / 2, ry + ch * 0.66, { align: "center" });
      if (p.sets) {
        pdf.setFont("helvetica", "normal"); pdf.setTextColor(...C.azul);
        pdf.text(encajar(pdf, `(${p.sets})`, cw - 1, 3.6, 2.5), cx + cw / 2, ry + ch - 0.9, { align: "center" });
      }
    }));
    pdf.setDrawColor(...C.noche); pdf.setLineWidth(0.5); pdf.rect(x0, y0, anchoGrid, cab + n * ch);
    pdf.line(x0 + cabX, y0, x0 + cabX, y0 + cab + n * ch); pdf.line(x0, y0 + cab, x0 + anchoGrid, y0 + cab);

    // Clasificación
    const tx = x0 + anchoGrid + 5, tw = W - M - tx;
    const cols = [["", 6], ["Equipo", 0], ["PJ", 6], ["PG", 6], ["PP", 6], ["SF", 6], ["SC", 6], ["PTS", 8]];
    cols[1][1] = tw - cols.reduce((s, c) => s + c[1], 0);
    const rh = 6.5;
    let y = y0;
    pdf.setLineWidth(0.15);
    pdf.setFillColor(...C.noche); pdf.rect(tx, y, tw, rh, "F"); pdf.setFillColor(245, 197, 24); pdf.rect(tx, y + rh - 0.6, tw, 0.6, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(255);
    let cx = tx;
    cols.forEach(([h, w], k) => { pdf.text(k === 1 ? "CLASIFICACIÓN" : h, k === 1 ? cx + 1 : cx + w / 2, y + 4.4, { align: k === 1 ? "left" : "center" }); cx += w; });
    y += rh;
    d.clasificacion.filter(c => c.nombre !== "DESCANSA").forEach((c, k) => {
      const bg = (fondo(c.nombre) && fondo(c.nombre, true)) || (k % 2 ? [246, 248, 253] : [255, 255, 255]);
      pdf.setFillColor(...bg); pdf.rect(tx, y, tw, rh, "F");
      pdf.setDrawColor(227, 232, 244); pdf.line(tx, y + rh, tx + tw, y + rh);
      const vals = [`${k + 1}º`, c.nombre, c.pj, c.pg, c.pp, c.sf, c.sc, c.pts];
      cx = tx; pdf.setTextColor(0);
      vals.forEach((v, q) => {
        const w = cols[q][1];
        pdf.setFont("helvetica", q === 1 || q === 7 ? "bold" : "normal");
        if (q === 1) pdf.text(encajar(pdf, String(v), w - 2, 6.5, 4.5), cx + 1, y + 4.4);
        else { pdf.setFontSize(q === 7 ? 8 : 6.5); pdf.text(String(v), cx + w / 2, y + 4.4, { align: "center" }); }
        cx += w;
      });
      y += rh;
    });
    pdf.setDrawColor(...C.borde);

    // Leyenda
    y += 6; pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.5); pdf.setTextColor(80);
    [["Filas: equipo local · Columnas: equipo visitante", null], ["Nuestro equipo", C.propio], ["Otros equipos del club", C.club]].forEach(([txt, col]) => {
      if (col) { pdf.setFillColor(...col); pdf.rect(tx, y - 2.6, 4, 3, "F"); }
      pdf.text(txt, tx + (col ? 5.5 : 0), y); y += 4.5;
    });
    pdf.setTextColor(...C.rojo); pdf.text("Fecha en rojo: partido aún sin hora", tx, y); y += 4.5;
    pdf.setTextColor(...C.gris2); pdf.text("Gris: partido pendiente", tx, y);
  }

  // PDF completo de un equipo (una página con cabecera y pie). Lanza un error si no hay partidos.
  function pdfDeEquipo(jsPDF, key, lines, logo, info) {
    const d = analizar(lines);
    if (!d.partidos.length) throw new Error("no se encontraron partidos en el PDF");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    dibujar(pdf, key, d, logo, info);
    pies(pdf);
    return pdf;
  }

  raiz.nvaPdfResultados = { banda, pies, analizar, dibujar, pdfDeEquipo };
})(typeof window !== "undefined" ? window : globalThis);
