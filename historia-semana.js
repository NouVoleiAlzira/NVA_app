/* =====================================================================
   Stories · Partidos y Resultados de la semana (Redes Sociales › Stories)
   Los partidos salen de «Calendario de partidos» (carteles-auto.js) y la
   story se dibuja aquí mismo en un lienzo 1080×1920, con 10 estilos
   (5 sin fotos y 5 con fotos). Por defecto, todos los partidos van en una
   sola story; se pueden repartir en varias páginas eligiendo cuáles van
   en cada una. Escudos y colores: DATOS.xls (Equipos NVA y OTROS Equipos).
   El borrador se crea con historia-editor.js (nvaStory.crearBorrador).
   ===================================================================== */
(function () {
  "use strict";

  const W = 1080, H = 1920;
  const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const XLSX_SRI = "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw";
  const LOGO_CLUB = "LOGOs/LOGO NVA 800x800.png";
  const SIN_ESCUDO = "LOGOs/noescudo.png";
  const ESTILO_KEY = "NVA_STORY_SEMANA_ESTILO";
  const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  const DIAS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
  const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const apos = (t) => String(t || "").replace(/([A-Za-zÀ-ÿ]),(?=[A-Za-zÀ-ÿ])/g, "$1'");
  const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  /* ---------- Imágenes ---------- */
  const imagenes = new Map();
  function cargarImg(src) {
    if (!src) return Promise.resolve(null);
    if (!imagenes.has(src)) imagenes.set(src, new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = src;
    }));
    return imagenes.get(src);
  }

  /* ---------- DATOS.xls: escudos y colores ---------- */
  let xlsxPromesa = null, fichasPromesa = null;
  function asegurarXlsx() {
    if (window.XLSX) return Promise.resolve();
    if (!xlsxPromesa) xlsxPromesa = new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = XLSX_URL; s.integrity = XLSX_SRI; s.crossOrigin = "anonymous"; s.async = true;
      s.onload = () => ok();
      s.onerror = () => { xlsxPromesa = null; mal(new Error("No se pudo cargar el lector de Excel")); };
      document.head.appendChild(s);
    });
    return xlsxPromesa;
  }

  function cargarFichas() {
    if (!fichasPromesa) fichasPromesa = (async () => {
      await asegurarXlsx();
      const r = await fetch("DATOS.xls", { cache: "no-cache" });
      if (!r.ok) throw new Error("No se ha podido leer DATOS.xls");
      const wb = XLSX.read(new Uint8Array(await r.arrayBuffer()), { type: "array" });
      const hoja = (pista) => {
        const n = wb.SheetNames.find(s => sinAcentos(s).includes(pista));
        return n ? XLSX.utils.sheet_to_json(wb.Sheets[n]) : [];
      };
      const fila = (f) => ({
        equipo: String(f.EQUIPO || f.Equipo || f.Nombre || "").trim(),
        categoria: String(f.CATEGORIA || f["CATEGORÍA"] || f.Categoria || "").trim(),
        logo: String(f.LOGO || f.Logo || "").trim(),
        color: String(f.COLOR || f.Color || "").trim()
      });
      return { nva: hoja("NVA").map(fila).filter(f => f.equipo), otros: hoja("OTRO").map(fila).filter(f => f.equipo) };
    })().catch(e => { fichasPromesa = null; throw e; });
    return fichasPromesa;
  }

  const rutaLogo = (v) => {
    if (!v) return "";
    const s = /\.(png|jpe?g|svg)$/i.test(v) ? v : v + ".png";
    return /^logos[\\/]/i.test(s) ? s : "LOGOs/" + s;
  };

  // Mismo criterio que Partidos.html (similitudNombres): 1 = mismo nombre, desde 0.8 = mismo equipo
  const IGNORAR = new Set(["CV", "CD", "CB", "CLUB", "DE", "DEL", "LA", "EL", "LES", "ELS", "VOLEI", "VOLEY", "VOLEIBOL", "VOLEYBOL", "C", "V"]);
  function tokens(t) {
    let s = sinAcentos(t).replace(/NOU\s+VOLE[IY]\s+ALZIRA/g, "NVA").replace(/\bNVA\s+ALZIRA\b/g, "NVA");
    return s.replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(w => w && !IGNORAR.has(w));
  }
  function distancia(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function similitud(a, b) {
    const ta = tokens(a), tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    if (ta.join(" ") === tb.join(" ")) return 1;
    const sueltos = (x) => x.filter(w => w.length === 1 || /^\d+$/.test(w)).sort().join(",");
    if (sueltos(ta) !== sueltos(tb)) return 0;
    const ca = ta.join(""), cb = tb.join("");
    const sc = 1 - distancia(ca, cb) / Math.max(ca.length, cb.length);
    if (sc >= 0.88) return sc;
    const [peq, gran] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    let ok = 0;
    peq.forEach(w => { if (gran.some(g => g === w || (w.length >= 5 && g.length >= 5 && distancia(w, g) <= 1))) ok++; });
    if (ok === peq.length && peq.length >= 2) return 0.85;
    const ratio = ok / gran.length;
    return ratio >= 0.8 ? ratio : 0;
  }
  const catBase = (c) => sinAcentos(c).split(/\s+/)[0] || "";

  function buscarFicha(lista, nombre, categoria) {
    const base = catBase(categoria);
    let mejor = null, valor = 0;
    lista.forEach(f => {
      let v = similitud(nombre, f.equipo);
      if (v < 0.8) return;
      if (base && catBase(f.categoria) === base) v += 0.5;   // misma categoría primero
      if (v > valor) { mejor = f; valor = v; }
    });
    return mejor;
  }

  /* ---------- Partidos ---------- */
  function rangoResultados() {      // lunes a domingo de la semana pasada (o la actual si hoy es domingo)
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    const dom = new Date(hoy); dom.setDate(hoy.getDate() - ((hoy.getDay() + 7) % 7));
    const lun = new Date(dom); lun.setDate(dom.getDate() - 6);
    return { desde: isoDia(lun), hasta: isoDia(dom) };
  }
  function rangoProximos() {        // de mañana al domingo siguiente
    const ini = new Date(); ini.setHours(12, 0, 0, 0); ini.setDate(ini.getDate() + 1);
    const fin = new Date(ini); fin.setDate(ini.getDate() + ((7 - ini.getDay()) % 7));
    if ((fin - ini) / 864e5 < 3) fin.setDate(fin.getDate() + 7);
    return { desde: isoDia(ini), hasta: isoDia(fin) };
  }

  function fechaCorta(iso) {
    const d = new Date(iso + "T12:00:00");
    return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
  }

  // "7 – 8 NOVIEMBRE 2026", "31 OCTUBRE – 2 NOVIEMBRE 2026"
  function textoFechas(desde, hasta) {
    const a = new Date(desde + "T12:00:00"), b = new Date(hasta + "T12:00:00");
    if (desde === hasta) return `${a.getDate()} ${MESES[a.getMonth()]} ${a.getFullYear()}`;
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()} – ${b.getDate()} ${MESES[b.getMonth()]} ${b.getFullYear()}`;
    if (a.getFullYear() === b.getFullYear()) return `${a.getDate()} ${MESES[a.getMonth()]} – ${b.getDate()} ${MESES[b.getMonth()]} ${b.getFullYear()}`;
    return `${a.getDate()} ${MESES[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MESES[b.getMonth()]} ${b.getFullYear()}`;
  }

  const limpiarClub = (n) => apos(n).replace(/nou\s+v[oò]le[iy]\s+alzira/gi, "NVA").replace(/\s+/g, " ").trim().toUpperCase();

  // p: partido de cartelCollect -> datos listos para dibujar
  async function prepararPartido(p, fichas) {
    const nva = buscarFicha(fichas.nva, p.team.name, p.team.category);
    const rival = buscarFicha(fichas.otros, limpiarClub(p.rival), p.team.category);
    const club = { nombre: (nva && nva.equipo) || p.team.name.toUpperCase(), logo: await cargarImg(rutaLogo(nva && nva.logo) || LOGO_CLUB) };
    const otro = { nombre: limpiarClub(p.rival), logo: await cargarImg(rutaLogo(rival && rival.logo)) || await cargarImg(SIN_ESCUDO) };
    if (!club.logo) club.logo = await cargarImg(LOGO_CLUB);
    let color = (nva && nva.color) || "";
    if (color && !color.startsWith("#")) color = "#" + color;
    if (!/^#[0-9a-f]{6}$/i.test(color)) color = "#f5c518";
    const res = p.res || null;
    const nvaSets = res ? (p.home ? res.setsL : res.setsV) : null, rivSets = res ? (p.home ? res.setsV : res.setsL) : null;
    return {
      id: `${p.key}|${p.fecha}|${p.rival}`,
      cat: ((nva && nva.categoria) || p.team.category || "").toUpperCase().replace(/DIVISION/, "DIV."),
      color, local: p.home ? club : otro, visit: p.home ? otro : club, nvaLocal: !!p.home,
      fecha: p.fecha, dia: fechaCorta(p.fecha), hora: p.hora || "", campo: apos(p.campo || "").toUpperCase(),
      res: !!res, setsL: res ? res.setsL : null, setsV: res ? res.setsV : null, sets: res ? res.sets || [] : [],
      gana: res ? nvaSets > rivSets : null, foto: null
    };
  }

  /* =====================================================================
     Dibujo
     ===================================================================== */
  const F = (px, peso, cursiva, familia) => `${cursiva ? "italic " : ""}${peso || 800} ${Math.round(px)}px "${familia || "Barlow Condensed"}"`;
  const FB = (px, peso) => F(px, peso || 600, false, "Barlow");

  async function fuentes() {
    if (!document.fonts || !document.fonts.load) return;
    try { await Promise.all([F(40, 800, true), F(40, 700), FB(40, 400), FB(40, 600), FB(40, 700)].map(f => document.fonts.load(f, "ÁBC 0123"))); }
    catch (e) { /* se usa la fuente que haya */ }
  }

  // Generador pseudoaleatorio fijo (las texturas salen siempre iguales)
  function azar(semilla) {
    let s = semilla >>> 0 || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  }

  function lienzo(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
  function mezcla(hex, otro, t) {
    const a = hexRgb(hex), b = hexRgb(otro);
    return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  function luz(hex) { const [r, g, b] = hexRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
  const sobre = (hex) => luz(hex) > 0.6 ? "#111111" : "#ffffff";

  // Desenfoque sin ctx.filter (Safari): reducir y volver a ampliar en pasos
  function difuminar(img, w, h, pasos) {
    let c = lienzo(w, h), k = 1;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    for (let i = 0; i < pasos; i++) {
      k /= 2;
      const d = lienzo(w * k, h * k), x = d.getContext("2d");
      x.imageSmoothingQuality = "high"; x.drawImage(c, 0, 0, d.width, d.height); c = d;
    }
    for (let i = 0; i < pasos; i++) {
      const d = lienzo(c.width * 2, c.height * 2), x = d.getContext("2d");
      x.imageSmoothingQuality = "high"; x.drawImage(c, 0, 0, d.width, d.height); c = d;
    }
    return c;
  }

  // Imagen recortada para llenar el hueco
  // ox, oy: desplazamiento extra en fracciones del hueco (para el editor de fotos)
  function cubrir(ctx, img, x, y, w, h, fx, fy, z, ox, oy) {
    const k = Math.max(w / img.width, h / img.height) * (z || 1), iw = img.width * k, ih = img.height * k;
    ctx.drawImage(img, x + (w - iw) * (fx == null ? 0.5 : fx) + (ox || 0) * w, y + (h - ih) * (fy == null ? 0.35 : fy) + (oy || 0) * h, iw, ih);
    return { w, h };
  }
  // Imagen entera dentro del hueco
  function contener(ctx, img, cx, cy, lado) {
    if (!img) return;
    const k = Math.min(lado / img.width, lado / img.height);
    ctx.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k);
  }

  // Texto en una línea, más pequeño si no cabe
  function ajustar(ctx, txt, maxW, px, fuente) {
    let s = px;
    ctx.font = fuente(s);
    while (s > 8 && ctx.measureText(txt).width > maxW) { s -= 1; ctx.font = fuente(s); }
    return s;
  }
  function texto(ctx, txt, x, y, maxW, px, fuente, color, align) {
    ajustar(ctx, txt, maxW, px, fuente);
    ctx.fillStyle = color; ctx.textAlign = align || "left";
    ctx.fillText(txt, x, y);
  }
  // Texto con espaciado entre letras (dibujado letra a letra)
  function espaciado(ctx, txt, x, y, sep, color, align) {
    const letras = [...txt];
    const ancho = letras.reduce((t, l) => t + ctx.measureText(l).width, 0) + sep * (letras.length - 1);
    let cx = align === "center" ? x - ancho / 2 : align === "right" ? x - ancho : x;
    ctx.fillStyle = color; ctx.textAlign = "left";
    letras.forEach(l => { ctx.fillText(l, cx, y); cx += ctx.measureText(l).width + sep; });
    return ancho;
  }
  // Hasta `max` líneas; reduce el tamaño hasta que quepa. Devuelve {lineas, px}
  function partir(ctx, txt, maxW, px, fuente, max) {
    const palabras = String(txt).split(/\s+/).filter(Boolean);
    for (let s = px; s >= 10; s -= 1) {
      ctx.font = fuente(s);
      const lineas = []; let actual = "";
      palabras.forEach(p => {
        const prueba = actual ? actual + " " + p : p;
        if (ctx.measureText(prueba).width <= maxW || !actual) actual = prueba; else { lineas.push(actual); actual = p; }
      });
      if (actual) lineas.push(actual);
      if (lineas.length <= max && lineas.every(l => ctx.measureText(l).width <= maxW)) return { lineas, px: s };
    }
    ctx.font = fuente(10);
    return { lineas: [palabras.join(" ")], px: 10 };
  }
  // Bloque de líneas centrado verticalmente en cy
  function bloque(ctx, txt, x, cy, maxW, px, fuente, color, align, max, interlinea) {
    const r = partir(ctx, txt, maxW, px, fuente, max || 2), lh = r.px * (interlinea || 0.98);
    ctx.fillStyle = color; ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
    const y0 = cy - (r.lineas.length - 1) * lh / 2;
    r.lineas.forEach((l, i) => ctx.fillText(l, x, y0 + i * lh));
    ctx.textBaseline = "alphabetic";
    return r.lineas.length * lh;
  }

  // Grano fino por toda la superficie
  const texturas = {};
  function grano(ctx, x, y, w, h, alfa, semilla, claro) {
    const k = `${semilla}|${claro ? 1 : 0}`;
    if (!texturas[k]) {
      const c = lienzo(256, 256), t = c.getContext("2d"), d = t.createImageData(256, 256), r = azar(semilla);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = claro ? 255 - v * 0.4 : v; d.data[i + 3] = 255 * r() * 0.5;
      }
      t.putImageData(d, 0, 0); texturas[k] = c;
    }
    ctx.save(); ctx.globalAlpha = alfa; ctx.fillStyle = ctx.createPattern(texturas[k], "repeat"); ctx.fillRect(x, y, w, h); ctx.restore();
  }
  // Vetas diagonales (como las de los carteles del club)
  function vetas(ctx, x, y, w, h, semilla, color, alfa) {
    const r = azar(semilla);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = color;
    for (let i = 0; i < (w + h) / 6; i++) {
      ctx.globalAlpha = alfa * (0.3 + r() * 0.7); ctx.lineWidth = 0.6 + r() * 2.2;
      const x0 = x + r() * (w + h) - h, l = 40 + r() * 260;
      ctx.beginPath(); ctx.moveTo(x0, y + r() * h); ctx.lineTo(x0 + l * 0.8, y + r() * h - l * 0.25); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- Cabecera común: escudo difuminado + título + fechas ---------- */
  let logoClub = null, logoBorroso = null;
  async function prepararLogo() {
    if (logoClub) return;
    logoClub = await cargarImg(LOGO_CLUB);
    if (logoClub) logoBorroso = difuminar(logoClub, 720, 720, 4);
  }

  // o: { texto, acento, fechaTxt, alfaLogo, y, pill, sombra }
  function cabecera(ctx, pag, o) {
    const y = o.y || 150;
    if (logoBorroso) {
      ctx.save(); ctx.globalAlpha = o.alfaLogo == null ? 0.42 : o.alfaLogo;
      if (o.mezcla) ctx.globalCompositeOperation = o.mezcla;
      ctx.drawImage(logoBorroso, W / 2 - 330, y - 120, 660, 660); ctx.restore();
    }
    if (o.sombra) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 4; }
    const palabra = pag.tipo === "resultados" ? "RESULTADOS" : "PARTIDOS";
    texto(ctx, palabra, W / 2, y + 150, 940, 168, (s) => F(s, 800, true), o.texto, "center");
    ctx.font = F(58, 700, false);
    espaciado(ctx, "DE LA SEMANA", W / 2, y + 222, 14, o.acento, "center");
    if (o.sombra) ctx.restore();
    const fechas = textoFechas(pag.desde, pag.hasta);
    ctx.font = FB(34, 700);
    const fw = ctx.measureText(fechas).width + 34 * 0.18 * fechas.length + 56;
    if (o.pill) {
      ctx.fillStyle = o.pill; rr(ctx, W / 2 - fw / 2, y + 252, fw, 60, 30); ctx.fill();
      ctx.font = FB(34, 700); espaciado(ctx, fechas, W / 2, y + 294, 6, o.fechaTxt || "#fff", "center");
    } else {
      ctx.font = FB(34, 700); espaciado(ctx, fechas, W / 2, y + 294, 6, o.fechaTxt || o.texto, "center");
    }
    if (pag.total > 1) {
      ctx.font = FB(26, 700); espaciado(ctx, `${pag.n}/${pag.total}`, W - 70, H - 120, 4, o.texto, "right");
    }
  }

  // Huecos verticales para n partidos entre y0 e y1
  function filas(n, y0, y1, gap, maxH) {
    const h = Math.min(maxH || 330, (y1 - y0 - gap * (n - 1)) / n), tot = h * n + gap * (n - 1);
    const ini = y0 + (y1 - y0 - tot) / 2;
    return Array.from({ length: n }, (_, i) => ({ y: ini + i * (h + gap), h }));
  }
  // Rejilla de 1 o 2 columnas (el último ocupa todo el ancho si son impares)
  function rejilla(n, x0, y0, w, y1, gap) {
    const cols = n <= 3 ? 1 : 2, nf = Math.ceil(n / cols);
    const h = Math.min(n === 1 ? 900 : 640, (y1 - y0 - gap * (nf - 1)) / nf), cw = (w - gap * (cols - 1)) / cols;
    const ini = y0 + (y1 - y0 - (h * nf + gap * (nf - 1))) / 2, out = [];
    for (let i = 0; i < n; i++) {
      const f = Math.floor(i / cols), c = i % cols, ultimoSolo = cols === 2 && i === n - 1 && n % 2 === 1;
      out.push({ x: ultimoSolo ? x0 : x0 + c * (cw + gap), y: ini + f * (h + gap), w: ultimoSolo ? w : cw, h });
    }
    return out;
  }

  const marcador = (p) => `${p.setsL} - ${p.setsV}`;
  const parciales = (p) => p.sets.map(s => `${s.local}-${s.visitante}`).join("  ");
  // Color del número de sets de cada lado: verde el que gana, rojo el que pierde
  const colGana = "#3ddc84", colPierde = "#ff5a5a";
  const colLado = (p, local) => p.setsL === p.setsV ? "#fff" : ((local ? p.setsL > p.setsV : p.setsV > p.setsL) ? colGana : colPierde);

  // Escudo + nombre debajo, centrado en cx
  function equipo(ctx, eq, cx, top, lado, ancho, px, color, sombra) {
    if (sombra) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4; }
    contener(ctx, eq.logo, cx, top + lado / 2, lado);
    if (sombra) ctx.restore();
    bloque(ctx, eq.nombre, cx, top + lado + px * 1.05, ancho, px, (s) => F(s, 800, true), color, "center", 2, 0.95);
  }

  // Marcador "3 - 1" grande con los colores de cada lado
  function tanteo(ctx, p, cx, cy, px, colores) {
    ctx.font = F(px, 800, true); ctx.textBaseline = "middle"; ctx.textAlign = "center";
    const a = String(p.setsL), b = String(p.setsV), g = px * 0.42;
    const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width;
    const cL = colores ? colores[0] : colLado(p, true), cV = colores ? colores[1] : colLado(p, false);
    ctx.fillStyle = cL; ctx.fillText(a, cx - g - wa / 2 + px * 0.04, cy);
    ctx.fillStyle = colores ? colores[2] || "#fff" : "#fff"; ctx.fillText("-", cx, cy);
    ctx.fillStyle = cV; ctx.fillText(b, cx + g + wb / 2 - px * 0.04, cy);
    ctx.textBaseline = "alphabetic";
  }

  // Relleno de una foto que falta: color del equipo + escudo del club
  function sinFoto(ctx, p, x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, mezcla(p.color, "#000000", 0.15)); g.addColorStop(1, mezcla(p.color, "#000000", 0.7));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    vetas(ctx, x, y, w, h, 7 + Math.round(w), "#ffffff", 0.08);
    const club = p.nvaLocal ? p.local : p.visit;
    ctx.save(); ctx.globalAlpha = 0.28; contener(ctx, club.logo, x + w / 2, y + h / 2, Math.min(w, h) * 0.8); ctx.restore();
  }
  // Foto del partido con su ajuste (zoom z y desplazamiento ox, oy libres); se apunta el hueco para el editor.
  // Si la foto no llena el hueco, debajo se ve el fondo del equipo
  const huecos = {};
  function foto(ctx, p, x, y, w, h, fy) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (p.foto) {
      const a = p.ajuste || {};
      if ((a.z || 1) < 1 || a.ox || a.oy) sinFoto(ctx, p, x, y, w, h);
      huecos[p.id] = cubrir(ctx, p.foto, x, y, w, h, 0.5, fy, a.z, a.ox, a.oy);
    } else sinFoto(ctx, p, x, y, w, h);
    ctx.restore();
  }

  // Parciales de los sets ("25-20  23-25 …"); los que gana el club van resaltados en una píldora
  // o: { gana, texto, pierde, align, borde }
  function sets(ctx, p, x, cy, maxW, px, o) {
    if (!p.res || !p.sets.length) return;
    const lista = p.sets.map(s => ({ t: `${s.local}-${s.visitante}`, club: p.nvaLocal ? s.local > s.visitante : s.visitante > s.local }));
    let tam = px, pad, gap, anchos, total;
    for (; tam >= 9; tam -= 1) {
      ctx.font = FB(tam, 700); pad = tam * 0.42; gap = tam * 0.3;
      anchos = lista.map(l => ctx.measureText(l.t).width + pad * 2);
      total = anchos.reduce((a, b) => a + b, 0) + gap * (lista.length - 1);
      if (total <= maxW) break;
    }
    let cx = o.align === "left" ? x : o.align === "right" ? x - total : x - total / 2;
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    lista.forEach((l, i) => {
      const w = anchos[i], hh = tam * 1.45;
      if (l.club) {
        ctx.fillStyle = o.gana; rr(ctx, cx, cy - hh / 2, w, hh, hh / 2); ctx.fill();
        if (o.borde) { ctx.lineWidth = Math.max(1.5, tam * 0.1); ctx.strokeStyle = o.borde; ctx.stroke(); }
      }
      ctx.fillStyle = l.club ? (o.texto || sobre(o.gana)) : o.pierde;
      ctx.fillText(l.t, cx + w / 2, cy + tam * 0.05);
      cx += w + gap;
    });
    ctx.textBaseline = "alphabetic";
  }

  /* =====================================================================
     Los 10 estilos
     ===================================================================== */
  const Y0 = 520, Y1 = 1740;

  // 1 · Marco: tarjetas oscuras con el borde del color del equipo (como los carteles del club)
  function eMarco(ctx, pag) {
    ctx.fillStyle = "#0b0b0c"; ctx.fillRect(0, 0, W, H);
    vetas(ctx, 0, 0, W, H, 11, "#ffffff", 0.07); grano(ctx, 0, 0, W, H, 0.25, 3);
    cabecera(ctx, pag, { texto: "#ffffff", acento: "#f5c518", alfaLogo: 0.5, sombra: true });
    const ps = pag.partidos, R = filas(ps.length, Y0, Y1, 26, 380);
    ps.forEach((p, i) => {
      const { y, h } = R[i], x = 60, w = W - 120, tab = Math.min(70, h * 0.32), r = Math.min(30, h * 0.18);
      ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
      const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "#232325"); g.addColorStop(1, "#0d0d0e");
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h); vetas(ctx, x, y, w, h, 31 + i, "#ffffff", 0.1);
      ctx.fillStyle = p.color; ctx.fillRect(x, y, tab, h);
      ctx.restore();
      ctx.lineWidth = 7; ctx.strokeStyle = p.color; rr(ctx, x, y, w, h, r); ctx.stroke();
      // Categoría en vertical
      ctx.save(); ctx.translate(x + tab / 2 + 2, y + h / 2); ctx.rotate(-Math.PI / 2);
      texto(ctx, p.cat.replace(/\s*\d.*$/, ""), 0, tab * 0.22, h - 24, tab * 0.62, (s) => F(s, 800, true), sobre(p.color), "center");
      ctx.restore();
      const info = p.res ? 0 : Math.min(330, w * 0.36), ax = x + tab + 16, aw = w - tab - 16 - info - (info ? 26 : 16);
      const banda = p.res ? Math.min(64, h * 0.22) : 0, hz = h - banda;
      const lado = Math.min(hz * 0.52, aw * 0.22), nPx = Math.max(18, Math.min(40, hz * 0.14));
      const top = y + (hz - lado - nPx * 2.1) / 2 + (banda ? 4 : 0);
      equipo(ctx, p.local, ax + aw * 0.2, top, lado, aw * 0.38, nPx, "#fff", true);
      equipo(ctx, p.visit, ax + aw * 0.8, top, lado, aw * 0.38, nPx, "#fff", true);
      if (p.res) tanteo(ctx, p, ax + aw / 2, top + lado * 0.5, Math.min(hz * 0.5, 150));
      else texto(ctx, "VS", ax + aw / 2, top + lado / 2 + h * 0.08, aw * 0.2, h * 0.24, (s) => F(s, 800, true), "#9aa0a6", "center");
      if (p.res) {
        sets(ctx, p, ax + aw / 2, y + h - banda / 2 - 4, aw - 20, Math.min(30, banda * 0.5), { gana: p.color, pierde: "#9aa0a6" });
      } else {
        const ix = x + w - info - 10;
        ctx.fillStyle = p.color; ctx.fillRect(ix, y + h * 0.16, 6, h * 0.68);
        const px = Math.min(44, h * 0.17), tx = ix + 24, tw = info - 30;
        texto(ctx, p.dia, tx, y + h * 0.36, tw, px, (s) => F(s, 800, true), "#fff");
        texto(ctx, p.hora ? `${p.hora} H` : "HORA POR CONFIRMAR", tx, y + h * 0.36 + px * 1.1, tw, px * (p.hora ? 1 : 0.6), (s) => F(s, 800, true), "#fff");
        bloque(ctx, p.campo, tx, y + h * 0.36 + px * 1.95, tw, px * 0.62, (s) => F(s, 700), "#c9cdd2", "left", 2);
      }
    });
  }

  // 2 · Crónica: papel claro, tabla de periódico, hairlines
  function eCronica(ctx, pag) {
    ctx.fillStyle = "#f1ece2"; ctx.fillRect(0, 0, W, H); grano(ctx, 0, 0, W, H, 0.35, 5, true);
    cabecera(ctx, pag, { texto: "#14161c", acento: "#d1452b", fechaTxt: "#14161c", alfaLogo: 0.22, mezcla: "multiply" });
    const ps = pag.partidos, R = filas(ps.length, Y0, Y1, 0, 280), x = 70, w = W - 140;
    ctx.fillStyle = "#14161c"; ctx.fillRect(x, R[0].y - 3, w, 5);
    ps.forEach((p, i) => {
      const { y, h } = R[i];
      ctx.fillStyle = "#14161c"; ctx.globalAlpha = 0.85; ctx.fillRect(x, y + h - 1.5, w, i === ps.length - 1 ? 5 : 2); ctx.globalAlpha = 1;
      const cab = Math.min(44, h * 0.2), px = Math.min(52, (h - cab) * 0.3);
      ctx.fillStyle = p.color; ctx.fillRect(x, y + cab * 0.42, 18, 18);
      ctx.font = FB(Math.min(24, cab * 0.6), 700);
      espaciado(ctx, p.cat, x + 30, y + cab * 0.42 + 16, 4, "#14161c");
      if (p.res) sets(ctx, p, x + w, y + cab * 0.42 + 9, w * 0.55, Math.min(24, cab * 0.55), { gana: p.color, pierde: "#8a857b", align: "right", borde: "#14161c" });
      else { ctx.font = FB(Math.min(24, cab * 0.6), 600); espaciado(ctx, [p.dia, p.hora && `${p.hora} H`].filter(Boolean).join(" · "), x + w, y + cab * 0.42 + 16, 3, "#555", "right"); }
      const zona = h - cab - (p.res ? 10 : Math.min(40, h * 0.17)), l1 = y + cab + zona * 0.3, l2 = y + cab + zona * 0.74, lado = Math.min(zona * 0.42, 80);
      const numW = p.res ? 90 : 0;
      [[p.local, l1, p.setsL, true], [p.visit, l2, p.setsV, false]].forEach(([eq, cy, sets, loc]) => {
        contener(ctx, eq.logo, x + lado / 2, cy, lado);
        const nva = loc === p.nvaLocal;
        ctx.textBaseline = "middle";
        texto(ctx, eq.nombre, x + lado + 22, cy + 2, w - lado - 30 - numW, px, (s) => F(s, nva ? 800 : 700, nva), "#14161c");
        if (p.res) texto(ctx, String(sets), x + w, cy + 4, numW, px * 1.5, (s) => F(s, 800, true), (loc ? p.setsL > p.setsV : p.setsV > p.setsL) ? "#14161c" : "#a29d93", "right");
        ctx.textBaseline = "alphabetic";
      });
      if (!p.res && p.campo) {
        ctx.font = FB(Math.min(22, h * 0.08), 400); ctx.fillStyle = "#555"; ctx.textAlign = "left";
        texto(ctx, p.campo, x + lado + 22, y + h - Math.min(14, h * 0.06), w - lado - 22, Math.min(22, h * 0.08), (s) => FB(s, 400), "#555");
      }
    });
  }

  // 3 · Neón: noche azul, líneas de pista y tarjetas que brillan con el color del equipo
  function eNeon(ctx, pag) {
    const g = ctx.createRadialGradient(W / 2, H * 0.35, 80, W / 2, H * 0.5, H * 0.8);
    g.addColorStop(0, "#14205a"); g.addColorStop(1, "#03050f"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.strokeStyle = "rgba(120,170,255,.09)"; ctx.lineWidth = 2;
    for (let i = -10; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 60, H * 0.42); ctx.lineTo(W / 2 + i * 260, H); ctx.stroke(); }
    for (let j = 0; j < 12; j++) { const yy = H * 0.42 + Math.pow(j / 11, 1.8) * H * 0.58; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }
    ctx.restore(); grano(ctx, 0, 0, W, H, 0.12, 9);
    cabecera(ctx, pag, { texto: "#ffffff", acento: "#7cc4ff", alfaLogo: 0.55, pill: "rgba(124,196,255,.16)" });
    const ps = pag.partidos, R = filas(ps.length, Y0, Y1, 30, 360);
    ps.forEach((p, i) => {
      const { y, h } = R[i], x = 70, w = W - 140, r = Math.min(44, h * 0.25);
      ctx.save(); rr(ctx, x, y, w, h, r); ctx.fillStyle = "rgba(8,12,34,.72)"; ctx.fill();
      ctx.shadowColor = p.color; ctx.shadowBlur = 34; ctx.lineWidth = 4; ctx.strokeStyle = p.color; ctx.stroke();
      ctx.shadowBlur = 0; ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,.55)"; rr(ctx, x + 7, y + 7, w - 14, h - 14, r - 6); ctx.stroke(); ctx.restore();
      const pie = Math.min(34, h * 0.13), cab = Math.min(30, h * 0.12);
      ctx.font = FB(cab * 0.8, 700); espaciado(ctx, p.cat, W / 2, y + cab + 14, 6, p.color, "center");
      if (p.res) sets(ctx, p, W / 2, y + h - 12 - pie * 0.45, w - 120, pie * 0.72, { gana: p.color, pierde: "rgba(255,255,255,.6)" });
      else texto(ctx, [p.dia, p.hora && `${p.hora} H`, p.campo].filter(Boolean).join("  ·  "), W / 2, y + h - 18, w - 80, pie * 0.75, (s) => FB(s, 600), "rgba(255,255,255,.75)", "center");
      const zt = y + cab + 26, zh = h - cab - 26 - pie - 18, lado = Math.min(h * 0.5, 150), nPx = Math.min(40, h * 0.17);
      const top = zt + (zh - lado - nPx * 2) / 2;
      ctx.save(); ctx.shadowColor = rgba(p.color, 0.8); ctx.shadowBlur = 24;
      contener(ctx, p.local.logo, x + 50 + lado / 2, y + h / 2, lado); contener(ctx, p.visit.logo, x + w - 50 - lado / 2, y + h / 2, lado); ctx.restore();
      const tw = w - 100 - lado * 2 - 40, cx = W / 2;
      if (p.res) {
        ctx.save(); ctx.shadowColor = p.color; ctx.shadowBlur = 30; tanteo(ctx, p, cx, zt + zh * 0.36, Math.min(zh * 0.62, 130), ["#fff", "#fff", p.color]); ctx.restore();
        bloque(ctx, `${p.local.nombre}  ·  ${p.visit.nombre}`, cx, zt + zh * 0.84, tw, nPx, (s) => F(s, 700), "#dfe6ff", "center", 2);
      } else {
        bloque(ctx, p.local.nombre, cx, zt + zh * 0.2, tw, nPx * 1.1, (s) => F(s, 800, true), "#fff", "center", 1);
        ctx.save(); ctx.shadowColor = p.color; ctx.shadowBlur = 20; texto(ctx, "VS", cx, zt + zh * 0.5 + nPx * 0.4, tw, nPx * 1.2, (s) => F(s, 800, true), p.color, "center"); ctx.restore();
        bloque(ctx, p.visit.nombre, cx, zt + zh * 0.8, tw, nPx * 1.1, (s) => F(s, 800, true), "#fff", "center", 1);
      }
    });
  }

  // 4 · Diagonal: franjas inclinadas con un bloque del color del equipo
  function eDiagonal(ctx, pag) {
    ctx.fillStyle = "#0a1640"; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.07; ctx.fillStyle = "#ffffff";
    for (let i = -4; i < 12; i++) { ctx.beginPath(); ctx.moveTo(i * 180, 0); ctx.lineTo(i * 180 + 70, 0); ctx.lineTo(i * 180 + 70 - 600, H); ctx.lineTo(i * 180 - 600, H); ctx.fill(); }
    ctx.restore(); grano(ctx, 0, 0, W, H, 0.15, 13);
    cabecera(ctx, pag, { texto: "#ffffff", acento: "#ffc400", alfaLogo: 0.45, pill: "#ffc400", fechaTxt: "#0a1640" });
    const ps = pag.partidos, R = filas(ps.length, Y0, Y1, 22, 320);
    ps.forEach((p, i) => {
      const { y, h } = R[i], sk = h * 0.28, x = 40 + (i % 2 ? 24 : 0), w = W - 104, bw = Math.min(260, w * 0.28);
      const poli = (x0, w0) => { ctx.beginPath(); ctx.moveTo(x0 + sk, y); ctx.lineTo(x0 + w0, y); ctx.lineTo(x0 + w0 - sk, y + h); ctx.lineTo(x0, y + h); ctx.closePath(); };
      ctx.fillStyle = "#101d52"; poli(x, w); ctx.fill();
      ctx.save(); poli(x, w); ctx.clip(); vetas(ctx, x, y, w, h, 51 + i, "#ffffff", 0.07); ctx.restore();
      const g = ctx.createLinearGradient(x, y, x + bw, y + h); g.addColorStop(0, p.color); g.addColorStop(1, mezcla(p.color, "#000000", 0.35));
      ctx.fillStyle = g; poli(x, bw + sk); ctx.fill();
      const tc = sobre(p.color), bx = x + (bw + sk) / 2;
      if (p.res) {
        tanteo(ctx, p, bx, y + h * 0.48, Math.min(h * 0.55, 120), [tc, tc, tc]);
        texto(ctx, p.dia, bx, y + h * 0.88, bw * 0.75, Math.min(26, h * 0.12), (s) => FB(s, 700), tc, "center");
      } else {
        texto(ctx, p.dia.split(" ")[0], bx, y + h * 0.3, bw * 0.7, Math.min(30, h * 0.14), (s) => FB(s, 700), tc, "center");
        texto(ctx, p.dia.split(" ")[1], bx, y + h * 0.66, bw * 0.7, Math.min(110, h * 0.42), (s) => F(s, 800, true), tc, "center");
        texto(ctx, p.dia.split(" ")[2] + (p.hora ? ` · ${p.hora}` : ""), bx, y + h * 0.88, bw * 0.75, Math.min(30, h * 0.13), (s) => FB(s, 700), tc, "center");
      }
      const cx = x + bw + sk + 26, cw = w - bw - sk * 2 - 40, lado = Math.min(h * 0.3, 74), nPx = Math.min(40, h * 0.17);
      ctx.font = FB(Math.min(22, h * 0.1), 700); espaciado(ctx, p.cat, cx + 8, y + Math.min(34, h * 0.17), 4, p.color === "#ffffff" ? "#ffc400" : mezcla(p.color, "#ffffff", 0.35));
      [[p.local, y + h * 0.38], [p.visit, y + h * 0.38 + lado * 1.1]].forEach(([eq, cy], k) => {
        const off = k * sk * 0.3;
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(cx + lado / 2 - off, cy, lado / 2 + 4, 0, Math.PI * 2); ctx.fill();
        contener(ctx, eq.logo, cx + lado / 2 - off, cy, lado * 0.82);
        ctx.textBaseline = "middle"; texto(ctx, eq.nombre, cx + lado + 18 - off, cy + 2, cw - lado - 10, nPx, (s) => F(s, 800, true), "#ffffff"); ctx.textBaseline = "alphabetic";
      });
      if (p.res) sets(ctx, p, cx + lado + 18 - sk * 0.3, y + h - Math.min(22, h * 0.1), cw - lado - 30, Math.min(22, h * 0.085), { gana: p.color, pierde: "rgba(255,255,255,.7)", align: "left" });
      if (!p.res && p.campo) texto(ctx, p.campo, cx + lado + 18 - sk * 0.3, y + h - Math.min(12, h * 0.05), cw - lado - 30, Math.min(22, h * 0.09), (s) => FB(s, 600), "rgba(255,255,255,.7)");
    });
  }

  // 5 · Marcador: videomarcador negro con cifras ámbar
  function eMarcador(ctx, pag) {
    ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.045)";
    for (let yy = 8; yy < H; yy += 16) for (let xx = 8; xx < W; xx += 16) ctx.fillRect(xx, yy, 3, 3);
    cabecera(ctx, pag, { texto: "#ffffff", acento: "#ffb300", alfaLogo: 0.38, pill: "#ffb300", fechaTxt: "#050505" });
    const ps = pag.partidos, R = filas(ps.length, Y0, Y1, 24, 320), amb = "#ffb300";
    ps.forEach((p, i) => {
      const { y, h } = R[i], x = 54, w = W - 108, cab = Math.min(48, h * 0.24), filaH = (h - cab) / 2;
      ctx.fillStyle = "#121212"; rr(ctx, x, y, w, h, 12); ctx.fill();
      ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 2; rr(ctx, x, y, w, h, 12); ctx.stroke();
      ctx.save(); rr(ctx, x, y, w, h, 12); ctx.clip(); ctx.fillStyle = p.color; ctx.fillRect(x, y, w, cab); ctx.restore();
      ctx.font = F(cab * 0.62, 800, true); espaciado(ctx, p.cat, x + 20, y + cab * 0.72, 3, sobre(p.color));
      ctx.font = FB(cab * 0.48, 700);
      espaciado(ctx, p.res ? p.dia : [p.dia, p.campo].filter(Boolean).join(" · ").slice(0, 52), x + w - 20, y + cab * 0.7, 2, sobre(p.color), "right");
      const caja = Math.min(filaH * 0.8, 110), lado = Math.min(filaH * 0.7, 76), nPx = Math.min(44, filaH * 0.42);
      [[p.local, p.setsL, 0], [p.visit, p.setsV, 1]].forEach(([eq, sets, k]) => {
        const cy = y + cab + filaH * (k + 0.5);
        if (k === 1) { ctx.fillStyle = "#2a2a2a"; ctx.fillRect(x + 18, y + cab + filaH, w - 36, 2); }
        contener(ctx, eq.logo, x + 24 + lado / 2, cy, lado);
        const derecha = p.res ? caja + 30 + Math.min(p.sets.length, 5) * caja * 0.55 : 0;
        ctx.textBaseline = "middle";
        texto(ctx, eq.nombre, x + 40 + lado, cy + 2, w - lado - 60 - derecha, nPx, (s) => F(s, 800, true), "#f2f2f2");
        if (p.res) {
          const bx = x + w - 20 - caja;
          ctx.fillStyle = "#000"; rr(ctx, bx, cy - caja * 0.45, caja, caja * 0.9, 8); ctx.fill();
          ctx.save(); ctx.shadowColor = amb; ctx.shadowBlur = 16;
          texto(ctx, String(sets), bx + caja / 2, cy + 3, caja, caja * 0.78, (s) => F(s, 800), (k ? p.setsV > p.setsL : p.setsL > p.setsV) ? amb : "#7a5a1a", "center"); ctx.restore();
          p.sets.slice(0, 5).forEach((s, j) => {
            const v = k ? s.visitante : s.local, o = k ? s.local : s.visitante, sx = bx - 16 - (p.sets.slice(0, 5).length - j) * caja * 0.55;
            const delClub = (k === 0) === p.nvaLocal && v > o;
            if (delClub) { ctx.fillStyle = p.color; rr(ctx, sx + 2, cy - caja * 0.3, caja * 0.5, caja * 0.6, 8); ctx.fill(); }
            texto(ctx, String(v), sx + caja * 0.27, cy + 2, caja * 0.5, caja * 0.4, (s2) => F(s2, 800), delClub ? sobre(p.color) : v > o ? "#e8e8e8" : "#6b6b6b", "center");
          });
        }
        ctx.textBaseline = "alphabetic";
      });
      if (!p.res) {
        const bw = Math.min(220, w * 0.24), bx = x + w - 20 - bw, cy = y + cab + filaH;
        ctx.fillStyle = "#000"; rr(ctx, bx, cy - filaH * 0.8, bw, filaH * 1.6, 10); ctx.fill();
        ctx.save(); ctx.shadowColor = amb; ctx.shadowBlur = 18; ctx.textBaseline = "middle";
        texto(ctx, p.hora || "--:--", bx + bw / 2, cy + 4, bw - 20, filaH * 0.9, (s) => F(s, 800), amb, "center"); ctx.restore(); ctx.textBaseline = "alphabetic";
      }
    });
  }

  // 6 · Lateral: tarjeta con marco dorado, datos a la izquierda y foto a la derecha
  function eLateral(ctx, pag) {
    ctx.fillStyle = "#0a0a0b"; ctx.fillRect(0, 0, W, H);
    vetas(ctx, 0, 0, W, H, 17, "#ffffff", 0.07); grano(ctx, 0, 0, W, H, 0.22, 4);
    cabecera(ctx, pag, { texto: "#ffffff", acento: "#e9c46a", alfaLogo: 0.5, sombra: true });
    const ps = pag.partidos, R = filas(ps.length, Y0, Y1, 24, 480);
    ps.forEach((p, i) => {
      const { y, h } = R[i], x = 44, w = W - 88, r = Math.min(22, h * 0.1), fw = w * 0.46;
      const oro = ctx.createLinearGradient(x, y, x + w, y + h); oro.addColorStop(0, "#f7dc85"); oro.addColorStop(0.5, "#b8862a"); oro.addColorStop(1, "#f0cf6e");
      ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
      ctx.fillStyle = "#121214"; ctx.fillRect(x, y, w, h); vetas(ctx, x, y, w, h, 61 + i, "#ffffff", 0.11);
      foto(ctx, p, x + w - fw, y, fw, h);
      const sombraF = ctx.createLinearGradient(x + w - fw, 0, x + w - fw + 40, 0); sombraF.addColorStop(0, "rgba(0,0,0,.6)"); sombraF.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sombraF; ctx.fillRect(x + w - fw, y, 40, h);
      ctx.restore();
      ctx.fillStyle = oro; ctx.fillRect(x + w - fw - 3, y, 6, h);
      ctx.lineWidth = 7; ctx.strokeStyle = oro; rr(ctx, x, y, w, h, r); ctx.stroke();
      const iw = w - fw - 10, cab = Math.min(48, h * 0.17);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x + iw * 0.86, y + 10); ctx.lineTo(x + iw * 0.8, y + 10 + cab); ctx.lineTo(x, y + 10 + cab); ctx.fill();
      ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip(); ctx.fillStyle = p.color; ctx.fillRect(x, y, iw * 0.86, 12); ctx.restore();
      texto(ctx, p.cat, x + 22, y + 10 + cab * 0.76, iw * 0.7, cab * 0.72, (s) => F(s, 800, true), sobre(p.color));
      const banda = p.res ? Math.min(56, h * 0.18) : 0;
      const zt = y + cab + 16, zh = h - cab - 24 - banda, lado = Math.min(zh * 0.52, 120), nPx = Math.min(36, zh * 0.15);
      const top = zt + (zh - lado - nPx * 2.2) / 2;
      if (p.res) sets(ctx, p, x + iw / 2, y + h - banda / 2 - 8, iw - 40, Math.min(26, banda * 0.48), { gana: p.color, pierde: "#b9bcc2" });
      equipo(ctx, p.local, x + iw * 0.2, top, lado, iw * 0.32, nPx, "#fff", true);
      equipo(ctx, p.visit, x + iw * 0.8, top, lado, iw * 0.32, nPx, "#fff", true);
      if (p.res) tanteo(ctx, p, x + iw / 2, top + lado * 0.55, Math.min(lado * 1.25, 130, iw * 0.17));
      else {
        texto(ctx, "VS", x + iw / 2, top + lado * 0.68, iw * 0.2, lado * 0.5, (s) => F(s, 800, true), "#e9c46a", "center");
        texto(ctx, p.dia, x + iw / 2, top + lado + nPx * 0.95, iw * 0.2, nPx * 0.8, (s) => FB(s, 700), "#e9c46a", "center");
        if (p.hora) texto(ctx, `${p.hora} H`, x + iw / 2, top + lado + nPx * 1.95, iw * 0.2, nPx * 0.8, (s) => FB(s, 700), "#fff", "center");
      }
    });
  }

  // 7 · Mosaico: rejilla de fotos con los datos encima
  function eMosaico(ctx, pag) {
    ctx.fillStyle = "#0d1b45"; ctx.fillRect(0, 0, W, H); grano(ctx, 0, 0, W, H, 0.15, 21);
    cabecera(ctx, pag, { texto: "#ffffff", acento: "#57aedf", alfaLogo: 0.5, pill: "#57aedf", fechaTxt: "#0d1b45" });
    const ps = pag.partidos, T = rejilla(ps.length, 44, Y0 - 10, W - 88, Y1 + 30, 16);
    ps.forEach((p, i) => {
      const { x, y, w, h } = T[i], r = 22;
      ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
      foto(ctx, p, x, y, w, h, 0.3);
      const g = ctx.createLinearGradient(0, y + h * 0.35, 0, y + h); g.addColorStop(0, "rgba(5,10,30,0)"); g.addColorStop(1, "rgba(5,10,30,.94)");
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = p.color; ctx.fillRect(x, y + h - 8, w, 8);
      ctx.restore();
      const cab = Math.min(40, h * 0.12);
      ctx.font = F(cab * 0.7, 800, true);
      const cw = ctx.measureText(p.cat).width + 34;
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x + cw + 14, y + 18); ctx.lineTo(x + cw, y + 18 + cab); ctx.lineTo(x, y + 18 + cab); ctx.fill();
      texto(ctx, p.cat, x + 16, y + 18 + cab * 0.76, cw, cab * 0.7, (s) => F(s, 800, true), sobre(p.color));
      const zona = Math.min(h * 0.46, 260), zt = y + h - zona - 8, lado = Math.min(zona * 0.36, w * 0.17), nPx = Math.min(32, zona * 0.13, w * 0.06);
      const ancho = w * 0.36;
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 14;
      contener(ctx, p.local.logo, x + w * 0.2, zt + lado * 0.6, lado); contener(ctx, p.visit.logo, x + w * 0.8, zt + lado * 0.6, lado); ctx.restore();
      bloque(ctx, p.local.nombre, x + w * 0.2, zt + lado * 1.2 + nPx, ancho, nPx, (s) => F(s, 800, true), "#fff", "center", 2);
      bloque(ctx, p.visit.nombre, x + w * 0.8, zt + lado * 1.2 + nPx, ancho, nPx, (s) => F(s, 800, true), "#fff", "center", 2);
      if (p.res) tanteo(ctx, p, x + w / 2, zt + lado * 0.6, Math.min(lado * 1.05, 120));
      else {
        texto(ctx, p.hora || "VS", x + w / 2, zt + lado * 0.8, w * 0.26, lado * 0.5, (s) => F(s, 800, true), "#fff", "center");
        texto(ctx, p.dia, x + w / 2, zt + lado * 0.22, w * 0.26, lado * 0.26, (s) => FB(s, 700), "#7cc4ff", "center");
      }
      if (p.res) sets(ctx, p, x + w / 2, y + h - 30, w - 40, Math.min(24, nPx * 0.8), { gana: p.color, pierde: "rgba(255,255,255,.8)" });
      const pie = p.res ? "" : p.campo;
      if (pie) texto(ctx, pie, x + w / 2, y + h - 22, w - 40, Math.min(22, nPx * 0.75), (s) => FB(s, 600), "rgba(255,255,255,.75)", "center");
    });
  }

  // 8 · Polaroid: fotos con marco blanco, cinta adhesiva y pie escrito
  function ePolaroid(ctx, pag) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#123236"); g.addColorStop(1, "#08181b");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); grano(ctx, 0, 0, W, H, 0.3, 27);
    cabecera(ctx, pag, { texto: "#f8f3e8", acento: "#f4a259", alfaLogo: 0.45, sombra: true });
    const ps = pag.partidos, T = rejilla(ps.length, 60, Y0 + 10, W - 120, Y1 + 20, 40), rnd = azar(99);
    ps.forEach((p, i) => {
      const t = T[i], ang = ((i % 2 ? 1 : -1) * (1.2 + rnd() * 1.6)) * Math.PI / 180;
      const pw = Math.min(t.w, t.h * (ps.length === 1 ? 0.8 : 1.25)), ph = t.h;
      ctx.save(); ctx.translate(t.x + t.w / 2, t.y + t.h / 2); ctx.rotate(ang);
      const x = -pw / 2, y = -ph / 2, m = Math.max(12, pw * 0.035), pie = Math.min(ph * 0.3, 190);
      ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
      ctx.fillStyle = "#f8f6f0"; ctx.fillRect(x, y, pw, ph); ctx.shadowColor = "transparent";
      grano(ctx, x, y, pw, ph, 0.12, 31, true);
      ctx.save(); ctx.beginPath(); ctx.rect(x + m, y + m, pw - m * 2, ph - pie - m); ctx.clip();
      foto(ctx, p, x + m, y + m, pw - m * 2, ph - pie - m, 0.3); ctx.restore();
      ctx.fillStyle = p.color; ctx.fillRect(x + m, y + ph - pie - 2, pw - m * 2, 6);
      // Cinta
      ctx.save(); ctx.translate(0, y + 4); ctx.rotate(-ang * 2); ctx.fillStyle = "rgba(255,248,220,.6)"; ctx.fillRect(-pw * 0.14, -16, pw * 0.28, 34); ctx.restore();
      const cy = y + ph - pie / 2, lado = Math.min(pie * 0.42, 70), nPx = Math.min(30, pie * 0.17, pw * 0.055);
      contener(ctx, p.local.logo, x + m + lado / 2 + 6, cy - pie * 0.12, lado);
      contener(ctx, p.visit.logo, x + pw - m - lado / 2 - 6, cy - pie * 0.12, lado);
      const centro = pw - m * 2 - lado * 2 - 30;
      const linea = p.res ? marcador(p) : (p.hora ? p.hora : "VS");
      const sube = p.res ? pie * 0.12 : 0;
      texto(ctx, linea, 0, cy - pie * 0.02 - sube, centro, Math.min(pie * 0.34, 80), (s) => F(s, 800, true), "#1d1d1d", "center");
      texto(ctx, `${p.local.nombre} · ${p.visit.nombre}`, 0, cy + pie * 0.25 - sube, pw - m * 2 - 20, nPx, (s) => F(s, 700, true), "#3a3a3a", "center");
      if (p.res) sets(ctx, p, 0, Math.min(cy + pie * 0.25 - sube + nPx * 1.2, y + ph - nPx * 0.75), pw - m * 2 - 20, nPx * 0.72, { gana: p.color, pierde: "#8a8a8a", borde: "#1d1d1d" });
      else texto(ctx, `${p.cat} · ${p.dia}`, 0, cy + pie * 0.25 + nPx * 1.1, pw - m * 2 - 20, nPx * 0.72, (s) => FB(s, 600), "#777", "center");
      ctx.restore();
    });
  }

  // 9 · Cinta: franjas de foto a todo lo ancho con una cinta del color del equipo
  function eCinta(ctx, pag) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    cabecera(ctx, pag, { texto: "#ffffff", acento: "#ffffff", alfaLogo: 0.55, pill: "#ffffff", fechaTxt: "#000" });
    const ps = pag.partidos, R = filas(ps.length, Y0, Y1, 10, 420);
    ps.forEach((p, i) => {
      const { y, h } = R[i], sk = h * 0.35, cw = W * 0.56;
      ctx.save(); ctx.beginPath(); ctx.rect(0, y, W, h); ctx.clip();
      foto(ctx, p, W * 0.3, y, W * 0.7, h, 0.35);
      const g = ctx.createLinearGradient(W * 0.3, 0, W * 0.62, 0); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(W * 0.3, y, W * 0.33, h);
      ctx.fillStyle = "#000"; ctx.fillRect(0, y, W * 0.3, h);
      const cg = ctx.createLinearGradient(0, y, cw, y + h); cg.addColorStop(0, p.color); cg.addColorStop(1, mezcla(p.color, "#000000", 0.45));
      ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.lineTo(cw - sk, y + h); ctx.lineTo(0, y + h); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.moveTo(cw + 10, y); ctx.lineTo(cw + 22, y); ctx.lineTo(cw + 22 - sk, y + h); ctx.lineTo(cw + 10 - sk, y + h); ctx.fill();
      ctx.restore();
      const tc = sobre(p.color), ax = 46, aw = cw - sk - 70, lado = Math.min(h * 0.4, 96), cab = Math.min(30, h * 0.12);
      ctx.font = FB(cab * 0.85, 700); const catW = espaciado(ctx, p.cat, ax, y + cab + 12, 4, tc);
      if (p.res) sets(ctx, p, cw - 34, y + cab * 0.62 + 12, cw - 34 - ax - catW - 30, cab * 0.85, { gana: p.color, pierde: rgba(tc === "#ffffff" ? "#ffffff" : "#111111", 0.6), align: "right", borde: tc });
      const cy = y + h * 0.53;
      contener(ctx, p.local.logo, ax + lado / 2, cy, lado);
      contener(ctx, p.visit.logo, ax + aw - lado / 2 + sk * 0.35, cy, lado);
      if (p.res) tanteo(ctx, p, ax + (aw + sk * 0.35) / 2, cy + 2, Math.min(h * 0.42, 120), [tc, tc, tc]);
      else {
        texto(ctx, p.hora || "VS", ax + (aw + sk * 0.35) / 2, cy + h * 0.1, aw - lado * 2 - 20, Math.min(h * 0.3, 90), (s) => F(s, 800, true), tc, "center");
        texto(ctx, p.dia, ax + (aw + sk * 0.35) / 2, cy - Math.min(h * 0.3, 90) * 0.55, aw - lado * 2 - 20, Math.min(30, h * 0.1), (s) => FB(s, 700), tc, "center");
      }
      texto(ctx, `${p.local.nombre} - ${p.visit.nombre}`, ax, y + h - Math.min(18, h * 0.08), aw - sk * 0.4, Math.min(30, h * 0.09), (s) => F(s, 700, true), tc);
      ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(0, y + h + 4, W, 2);
    });
  }

  // 10 · Cristal: la foto de fondo desenfocada y tarjetas de cristal con la foto en círculo
  function eCristal(ctx, pag) {
    const fondo = pag.partidos.find(p => p.foto);
    if (fondo) { const b = difuminar(fondo.foto, 540, 960, 4); ctx.drawImage(b, 0, 0, W, H); }
    else { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, mezcla(pag.partidos[0].color, "#0d1b45", 0.5)); g.addColorStop(1, "#060b1e"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = "rgba(6,10,28,.55)"; ctx.fillRect(0, 0, W, H); grano(ctx, 0, 0, W, H, 0.12, 41);
    cabecera(ctx, pag, { texto: "#ffffff", acento: "#ffffff", alfaLogo: 0.6, pill: "rgba(255,255,255,.18)", sombra: true });
    const ps = pag.partidos, R = filas(ps.length, Y0, Y1, 24, 320);
    ps.forEach((p, i) => {
      const { y, h } = R[i], x = 50, w = W - 100, r = Math.min(40, h * 0.3);
      ctx.save(); rr(ctx, x, y, w, h, r); ctx.fillStyle = "rgba(255,255,255,.13)"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.stroke(); ctx.restore();
      const d = h - 28, fx = x + 14 + d / 2, fy = y + h / 2;
      ctx.save(); ctx.beginPath(); ctx.arc(fx, fy, d / 2, 0, Math.PI * 2); ctx.clip(); foto(ctx, p, fx - d / 2, fy - d / 2, d, d, 0.3); ctx.restore();
      ctx.lineWidth = 6; ctx.strokeStyle = p.color; ctx.beginPath(); ctx.arc(fx, fy, d / 2 + 1, 0, Math.PI * 2); ctx.stroke();
      const cx = x + d + 44, cw = w - d - 70, cab = Math.min(26, h * 0.12), lado = Math.min(h * 0.42, 100), nPx = Math.min(34, h * 0.15);
      ctx.font = FB(cab * 0.9, 700); espaciado(ctx, p.cat, cx, y + cab + Math.min(20, h * 0.1), 4, mezcla(p.color, "#ffffff", 0.3));
      const ly = y + h * 0.5;
      contener(ctx, p.local.logo, cx + lado / 2, ly, lado);
      contener(ctx, p.visit.logo, cx + cw - lado / 2, ly, lado);
      if (p.res) tanteo(ctx, p, cx + cw / 2, ly + 2, Math.min(h * 0.38, 96));
      else texto(ctx, p.hora || "VS", cx + cw / 2, ly + h * 0.09, cw - lado * 2 - 20, Math.min(h * 0.26, 70), (s) => F(s, 800, true), "#fff", "center");
      const nombres = `${p.local.nombre}  ·  ${p.visit.nombre}`;
      texto(ctx, nombres, cx + cw / 2, y + h - Math.min(18, h * 0.08) - nPx * 0.8, cw, nPx * 0.8, (s) => F(s, 700, true), "#fff", "center");
      if (p.res) sets(ctx, p, cx + cw / 2, y + h - Math.min(14, h * 0.06) - nPx * 0.25, cw, nPx * 0.62, { gana: p.color, pierde: "rgba(255,255,255,.75)" });
      if (!p.res) texto(ctx, [p.dia, p.campo].filter(Boolean).join(" · "), cx + cw / 2, y + h - Math.min(14, h * 0.06), cw, nPx * 0.62, (s) => FB(s, 600), "rgba(255,255,255,.75)", "center");
    });
  }

  const ESTILOS = [
    { id: "marco", nombre: "Marco", foto: false, dibujar: eMarco },
    { id: "cronica", nombre: "Crónica", foto: false, dibujar: eCronica },
    { id: "neon", nombre: "Neón", foto: false, dibujar: eNeon },
    { id: "diagonal", nombre: "Diagonal", foto: false, dibujar: eDiagonal },
    { id: "marcador", nombre: "Marcador", foto: false, dibujar: eMarcador },
    { id: "lateral", nombre: "Lateral", foto: true, dibujar: eLateral },
    { id: "mosaico", nombre: "Mosaico", foto: true, dibujar: eMosaico },
    { id: "polaroid", nombre: "Polaroid", foto: true, dibujar: ePolaroid },
    { id: "cinta", nombre: "Cinta", foto: true, dibujar: eCinta },
    { id: "cristal", nombre: "Cristal", foto: true, dibujar: eCristal }
  ];

  // Dibuja una página; escala < 1 para las miniaturas
  function dibujarPagina(estilo, pag, escala) {
    const c = lienzo(W * (escala || 1), H * (escala || 1)), ctx = c.getContext("2d");
    ctx.scale(escala || 1, escala || 1);
    ctx.imageSmoothingQuality = "high";
    (ESTILOS.find(e => e.id === estilo) || ESTILOS[0]).dibujar(ctx, pag);
    return c;
  }

  /* =====================================================================
     Ventana: partidos, páginas y estilo
     ===================================================================== */
  let estado = null;   // { tipo, desde, hasta, items:[{p, sel, pag, foto, fotoUrl, tiene}], paginas, estilo }

  function estiloGuardado() { try { return localStorage.getItem(ESTILO_KEY) || "marco"; } catch (e) { return "marco"; } }

  function cfgGithub() {
    let ig = {};
    try { ig = JSON.parse(localStorage.getItem("NVA_IG_SETTINGS") || "{}"); } catch (e) { /* nada */ }
    const gh = typeof ghSettings !== "undefined" ? ghSettings : {};
    return { token: window.igGetToken ? window.igGetToken() : ig.token, user: gh.user, repo: gh.repo, login: ig.login || "" };
  }

  function modal() {
    document.getElementById("modalNvaSemana")?.remove();
    document.body.insertAdjacentHTML("beforeend", `
  <div class="modal-backdrop active" id="modalNvaSemana" style="z-index:3000;">
    <div class="modal-box" style="max-width:480px; max-height:94vh; overflow:auto;">
      <div class="modal-header">
        <div class="modal-title" data-s="titulo"></div>
        <button class="btn-close-modal" type="button" data-s="cerrar">✕</button>
      </div>
      <div data-s="paso1">
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <label style="flex:1; font-size:0.75rem; color:#475569;">Desde<input type="date" data-s="desde" class="app-input" style="margin-top:2px;"></label>
          <label style="flex:1; font-size:0.75rem; color:#475569;">Hasta<input type="date" data-s="hasta" class="app-input" style="margin-top:2px;"></label>
        </div>
        <p class="ig-info" data-s="info"></p>
        <div data-s="lista" style="display:flex; flex-direction:column; gap:6px; max-height:44vh; overflow:auto;"></div>
        <label style="display:flex; align-items:center; gap:8px; margin:10px 0 4px; font-size:0.8rem; color:#1e293b; cursor:pointer;">
          <input type="checkbox" data-s="dividir" style="width:20px; height:20px; flex:none; accent-color:#2563eb;">📄 Dividir en varias stories</label>
        <div data-s="paginasFila" hidden style="display:flex; align-items:center; gap:8px; font-size:0.8rem; color:#1e293b;">
          Número de stories <select data-s="paginas" class="app-input" style="width:auto; padding:4px 8px;">${[2, 3, 4, 5].map(n => `<option value="${n}">${n}</option>`).join("")}</select>
          <small style="color:#64748b;">Elige en cada partido en cuál va.</small></div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button class="btn-save-session" type="button" data-s="cerrar" style="flex:1; background:#64748b;">Cancelar</button>
          <button class="btn-save-session" type="button" data-s="siguiente" style="flex:2;">🎨 Elegir estilo</button>
        </div>
      </div>
      <div data-s="paso2" hidden>
        <label class="ig-label">Sin fotos</label>
        <div data-s="estilosSin" style="display:grid; grid-template-columns:repeat(5,1fr); gap:6px;"></div>
        <div data-s="conFotos">
        <label class="ig-label" style="margin-top:8px;">Con fotos</label>
        <div data-s="estilosCon" style="display:grid; grid-template-columns:repeat(5,1fr); gap:6px;"></div>
        <small class="ig-info" data-s="avisoFoto"></small>
        </div>
        <label class="ig-label" style="margin-top:8px;">Vista previa</label>
        <div data-s="previa" style="display:flex; gap:8px; overflow-x:auto; padding-bottom:4px;"></div>
        <div data-s="ajustes" hidden>
          <label class="ig-label" style="margin-top:8px;">🔍 Encajar las fotos en este estilo</label>
          <div data-s="ajustesLista" style="display:flex; gap:6px; flex-wrap:wrap;"></div>
        </div>
        <small class="ig-info" data-s="estado"></small>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button class="btn-save-session" type="button" data-s="volver" style="flex:1; background:#64748b;">← Volver</button>
          <button class="btn-save-session" type="button" data-s="crear" style="flex:2;">📲 Crear borrador</button>
        </div>
      </div>
    </div>
  </div>`);
    return document.getElementById("modalNvaSemana");
  }

  const $ = (m, s) => m.querySelector(`[data-s="${s}"]`);

  function elegidos() { return estado.items.filter(it => it.sel && (estado.tipo !== "resultados" || it.p.res)); }

  // Páginas con sus partidos (vacías fuera)
  function paginas() {
    const sel = elegidos(), n = estado.dividir ? estado.paginas : 1, out = [];
    for (let k = 1; k <= n; k++) {
      const ps = sel.filter(it => (estado.dividir ? it.pag : 1) === k).map(it => Object.assign({}, it.p, { foto: estado.tipo === "resultados" ? it.foto || null : null, ajuste: it.ajuste }));
      if (ps.length) out.push(ps);
    }
    return out.map((ps, i) => ({ tipo: estado.tipo, desde: estado.desde, hasta: estado.hasta, partidos: ps, n: i + 1, total: out.length }));
  }

  // Reparto inicial: seguido, el mismo número en cada página
  function repartir() {
    const sel = elegidos(), n = estado.paginas, por = Math.ceil(sel.length / n);
    sel.forEach((it, i) => { it.pag = Math.min(n, Math.floor(i / por) + 1); });
  }

  function pintarLista(m) {
    const t = estado.tipo, sel = elegidos();
    const sinRes = t === "resultados" ? estado.items.filter(it => !it.p.res).length : 0;
    $(m, "info").textContent = !estado.items.length ? "No hay partidos de los equipos del club entre esas fechas en «Calendario de partidos»."
      : `${sel.length} de ${estado.items.length - sinRes} partidos en la story${sinRes ? ` (${sinRes} todavía sin resultado)` : ""}.` + (t === "resultados" ? " Las fotos solo salen en los estilos con fotos." : "");
    $(m, "lista").innerHTML = estado.items.map((it, i) => {
      const p = it.p, off = t === "resultados" && !p.res;
      return `<div style="display:flex; align-items:center; gap:8px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:10px;${it.sel && !off ? "" : " opacity:.5;"}">
        <input type="checkbox" data-sel="${i}" ${it.sel && !off ? "checked" : ""} ${off ? "disabled" : ""} style="width:20px; height:20px; flex:none; accent-color:#2563eb;">
        ${it.fotoUrl ? `<img src="${it.fotoUrl}" alt="" style="width:40px; height:40px; object-fit:cover; border-radius:6px; flex:none;">` : ""}
        <div style="flex:1; min-width:0; font-size:0.76rem; color:#1e293b;"><b>${esc(p.local.nombre)}</b> ${p.res ? esc(marcador(p)) : "vs"} <b>${esc(p.visit.nombre)}</b><br>
          <small style="color:#64748b;">${esc(p.dia)}${p.hora ? " · " + esc(p.hora) : ""} · ${esc(p.cat)}${off ? " · sin resultado" : ""}</small></div>
        ${estado.dividir && it.sel && !off ? `<select data-pag="${i}" class="app-input" style="width:auto; flex:none; padding:4px 6px; font-size:.75rem;">
          ${Array.from({ length: estado.paginas }, (_, k) => `<option value="${k + 1}" ${it.pag === k + 1 ? "selected" : ""}>Story ${k + 1}</option>`).join("")}</select>` : ""}
        ${off || t !== "resultados" ? "" : `<label class="btn-save-session" style="width:auto; flex:none; white-space:nowrap; margin:0; padding:6px 8px; font-size:0.7rem; cursor:pointer; background:${it.foto ? "#64748b" : "var(--btn-fondoVerde)"};">
          ${it.foto ? "📸 Cambiar" : "➕ Foto"}<input type="file" accept="image/*" hidden data-foto="${i}"></label>`}
      </div>`;
    }).join("");
  }

  async function cargarPartidos(m) {
    const lista = $(m, "lista");
    $(m, "info").textContent = "Cargando partidos, escudos y fotos…";
    lista.innerHTML = "";
    const tok = estado.carga = {};
    try {
      const fichas = await cargarFichas();
      const crudos = window.cartelCollect ? window.cartelCollect(estado.desde, estado.hasta, estado.tipo === "resultados") : [];
      const previos = new Map(estado.items.map(it => [it.p.id, it]));
      const nuevos = [];
      for (const c of crudos) {
        const p = await prepararPartido(c, fichas), v = previos.get(p.id);
        nuevos.push(v ? Object.assign(v, { p }) : { p, sel: true, pag: 1, foto: null, fotoUrl: "" });
      }
      if (estado.carga !== tok) return;
      estado.items = nuevos;
      if (estado.tipo === "resultados" && window.igFotosGuardadas) {
        try {
          const fotos = await window.igFotosGuardadas(estado.desde, estado.hasta);
          for (const it of estado.items) {
            if (it.foto) continue;
            const f = fotos.find(x => (similitud(x.home, it.p.local.nombre) >= 0.8 && similitud(x.away, it.p.visit.nombre) >= 0.8) ||
                                      (similitud(x.home, it.p.visit.nombre) >= 0.8 && similitud(x.away, it.p.local.nombre) >= 0.8));
            if (f) { const url = await f.url(); it.foto = await cargarImg(url); it.fotoUrl = it.foto ? url : ""; }
          }
        } catch (e) { console.warn("Fotos guardadas:", e); }
      }
      if (estado.carga !== tok) return;
      if (estado.dividir) repartir();
      pintarLista(m);
    } catch (e) {
      console.error(e);
      $(m, "info").textContent = "No se han podido cargar los partidos: " + e.message;
    }
  }

  async function pintarEstilos(m) {
    const pags = paginas();
    if (!pags.length) return;
    const muestra = pags[0];
    $(m, "avisoFoto").textContent = elegidos().some(it => it.foto) ? "" : "Ningún partido tiene foto: los estilos con fotos usan el color y el escudo del equipo.";
    const res = estado.tipo === "resultados";
    $(m, "conFotos").hidden = !res;
    if (!res) $(m, "avisoFoto").textContent = "";
    for (const [cont, conFoto] of res ? [["estilosSin", false], ["estilosCon", true]] : [["estilosSin", false]]) {
      const el = $(m, cont); el.innerHTML = "";
      ESTILOS.filter(e => e.foto === conFoto).forEach(e => {
        const b = document.createElement("button");
        b.type = "button"; b.dataset.estilo = e.id;
        b.style.cssText = "padding:3px; border-radius:8px; border:2px solid #cbd5e1; background:#fff; cursor:pointer; color:#1e293b; min-width:0;";
        const c = dibujarPagina(e.id, muestra, 0.16);
        c.style.cssText = "width:100%; height:auto; display:block; border-radius:5px;";
        b.appendChild(c);
        b.insertAdjacentHTML("beforeend", `<small style="display:block; font-size:10px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(e.nombre)}</small>`);
        el.appendChild(b);
      });
    }
    marcarEstilo(m);
  }

  function marcarEstilo(m) {
    m.querySelectorAll("[data-estilo]").forEach(b => {
      const si = b.dataset.estilo === estado.estilo;
      b.style.borderColor = si ? "#2563eb" : "#cbd5e1"; b.style.boxShadow = si ? "0 0 0 2px #93c5fd" : "none";
    });
    const conFoto = (ESTILOS.find(e => e.id === estado.estilo) || {}).foto;
    const conImagen = elegidos().filter(it => it.foto);
    $(m, "ajustes").hidden = !(conFoto && conImagen.length);
    $(m, "ajustesLista").innerHTML = conImagen.map(it => `<button type="button" data-ajustar="${estado.items.indexOf(it)}"
      style="display:flex; align-items:center; gap:6px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; padding:3px 8px 3px 3px; cursor:pointer; color:#1e293b; font-size:.72rem; max-width:48%;">
      <img src="${it.fotoUrl}" alt="" style="width:32px; height:32px; object-fit:cover; border-radius:5px; flex:none;">
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">✏️ ${esc(it.p.nvaLocal ? it.p.local.nombre : it.p.visit.nombre)}</span></button>`).join("");
    const previa = $(m, "previa"); previa.innerHTML = "";
    paginas().forEach(pag => {
      const c = dibujarPagina(estado.estilo, pag, 0.3);
      c.style.cssText = "flex:0 0 auto; width:" + (paginas().length > 1 ? "46%" : "70%") + "; height:auto; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,.25);";
      previa.appendChild(c);
    });
  }

  // Editor: la story donde va la foto, arrastrar para moverla y barra (o rueda / pellizco) para el zoom
  function ajustarFoto(it) {
    const pag = paginas().find(pg => pg.partidos.some(p => p.id === it.p.id));
    if (!pag) return Promise.resolve(false);
    const a = Object.assign({ z: 1, ox: 0, oy: 0 }, it.ajuste || {});
    const antes = it.ajuste;
    return new Promise((resolver) => {
      const capa = document.createElement("div");
      capa.setAttribute("role", "dialog"); capa.setAttribute("aria-modal", "true");
      capa.style.cssText = "position:fixed; inset:0; z-index:100010; background:rgba(5,12,35,.88); display:flex; align-items:center; justify-content:center; padding:12px;";
      capa.innerHTML = `
        <div style="background:#0f1d4a; color:#e9eefa; border:1px solid rgba(255,255,255,.15); border-radius:14px; width:100%; max-width:360px; max-height:100%; overflow:auto; padding:14px; display:flex; flex-direction:column; gap:10px; font-family:inherit;">
          <div style="font-weight:800; font-size:1.05rem; color:#fff;">🔍 Encaja la foto</div>
          <canvas data-v style="width:100%; max-width:280px; align-self:center; aspect-ratio:9/16; border-radius:10px; touch-action:none; cursor:grab; box-shadow:0 4px 18px rgba(0,0,0,.4);"></canvas>
          <label style="display:flex; align-items:center; gap:8px; font-size:.9rem;">➖
            <input type="range" data-z min="0.4" max="4" step="0.01" value="${a.z}" style="flex:1;">➕</label>
          <small style="font-size:.8rem; opacity:.85;">Arrastra sobre la story para mover la foto de este partido y usa la barra para acercarla o alejarla.</small>
          <div style="display:flex; gap:8px;">
            <button type="button" data-e="reset" style="flex:1; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,.25); background:transparent; color:#fff; font:inherit; font-weight:700; cursor:pointer;">↺ Centrar</button>
            <button type="button" data-e="no" style="flex:1; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,.25); background:transparent; color:#fff; font:inherit; font-weight:700; cursor:pointer;">Cancelar</button>
            <button type="button" data-e="si" style="flex:1.4; padding:10px; border-radius:10px; border:0; background:#16a34a; color:#fff; font:inherit; font-weight:700; cursor:pointer;">✅ Usar</button>
          </div>
        </div>`;
      document.body.appendChild(capa);
      const lienzoV = capa.querySelector("[data-v]"), zoom = capa.querySelector("[data-z]");
      let pendiente = false, escala = 0.25;
      const pintar = () => {
        pendiente = false;
        it.ajuste = Object.assign({}, a);
        const pg = Object.assign({}, pag, { partidos: pag.partidos.map(p => p.id === it.p.id ? Object.assign({}, p, { ajuste: it.ajuste }) : p) });
        const r = lienzoV.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
        escala = (r.width || 260) * dpr / W;
        const c = dibujarPagina(estado.estilo, pg, escala);
        lienzoV.width = c.width; lienzoV.height = c.height;
        lienzoV.getContext("2d").drawImage(c, 0, 0);
      };
      const repintar = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(pintar); } };
      const cambiarZoom = (z) => { a.z = Math.min(4, Math.max(0.4, z)); zoom.value = String(a.z); repintar(); };
      zoom.oninput = () => cambiarZoom(+zoom.value);
      lienzoV.addEventListener("wheel", (e) => { e.preventDefault(); cambiarZoom(a.z * (e.deltaY < 0 ? 1.06 : 1 / 1.06)); }, { passive: false });
      const dedos = new Map();
      let distancia = 0;
      lienzoV.addEventListener("pointerdown", (e) => { lienzoV.setPointerCapture(e.pointerId); dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
      lienzoV.addEventListener("pointermove", (e) => {
        const prev = dedos.get(e.pointerId);
        if (!prev) return;
        dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (dedos.size === 2) {
          const [p1, p2] = [...dedos.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (distancia) cambiarZoom(a.z * d / distancia);
          distancia = d;
          return;
        }
        // Del movimiento en pantalla al desplazamiento de la foto dentro de su hueco
        const hu = huecos[it.p.id], k = W / lienzoV.getBoundingClientRect().width;
        if (!hu) return;
        a.ox = Math.min(1.5, Math.max(-1.5, a.ox + (e.clientX - prev.x) * k / hu.w));
        a.oy = Math.min(1.5, Math.max(-1.5, a.oy + (e.clientY - prev.y) * k / hu.h));
        repintar();
      });
      const soltar = (e) => { dedos.delete(e.pointerId); distancia = 0; };
      lienzoV.addEventListener("pointerup", soltar);
      lienzoV.addEventListener("pointercancel", soltar);
      const cerrar = (ok) => { capa.remove(); if (!ok) it.ajuste = antes; resolver(ok); };
      capa.querySelector('[data-e="reset"]').onclick = () => { Object.assign(a, { z: 1, ox: 0, oy: 0 }); cambiarZoom(1); };
      capa.querySelector('[data-e="no"]').onclick = () => cerrar(false);
      capa.querySelector('[data-e="si"]').onclick = () => cerrar(true);
      requestAnimationFrame(pintar);
    });
  }

  async function crear(m) {
    const boton = $(m, "crear"), est = $(m, "estado"), cfg = cfgGithub();
    if (!cfg.token || !cfg.user || !cfg.repo) { alert("Falta configurar Instagram o GitHub en Opciones."); return; }
    boton.disabled = true;
    try {
      est.textContent = "Dibujando las stories…";
      const imagenes = [];
      for (const pag of paginas()) {
        const c = dibujarPagina(estado.estilo, pag, 1);
        const blob = await new Promise((ok, mal) => c.toBlob(b => b ? ok(b) : mal(new Error("No se ha podido preparar la story.")), "image/jpeg", 0.92));
        imagenes.push({ blob, final: blob });
      }
      await window.nvaStory.crearBorrador(cfg, imagenes, { tipo: estado.tipo, desde: estado.desde, hasta: estado.hasta }, (t) => { est.textContent = t; });
      try { localStorage.setItem(ESTILO_KEY, estado.estilo); } catch (e) { /* sin almacenamiento */ }
      m.remove();
      alert("Borrador creado. Lo tienes en «Stories»: revísalo, elige la duración y pulsa «Confirmar y publicar».");
      if (window.igHistoriasCargar) window.igHistoriasCargar();
    } catch (e) {
      est.textContent = "";
      alert(e.message);
    } finally {
      boton.disabled = false;
    }
  }

  async function abrir(tipo) {
    tipo = tipo === "resultados" ? "resultados" : "proximos";
    const r = tipo === "resultados" ? rangoResultados() : rangoProximos();
    estado = { tipo, desde: r.desde, hasta: r.hasta, items: [], dividir: false, paginas: 2, estilo: estiloGuardado() };
    const valido = ESTILOS.find(e => e.id === estado.estilo);
    if (!valido || (valido.foto && tipo !== "resultados")) estado.estilo = "marco";
    const m = modal();
    $(m, "titulo").textContent = tipo === "resultados" ? "🏆 Story · Resultados de la semana" : "📅 Story · Partidos de la semana";
    $(m, "desde").value = estado.desde; $(m, "hasta").value = estado.hasta;
    const verPaso = (n) => { $(m, "paso1").hidden = n !== 1; $(m, "paso2").hidden = n !== 2; };
    m.addEventListener("click", async (ev) => {
      if (ev.target === m) return m.remove();
      const b = ev.target.closest("[data-s],[data-estilo],[data-ajustar]");
      if (!b) return;
      if (b.dataset.estilo) { estado.estilo = b.dataset.estilo; marcarEstilo(m); return; }
      if (b.dataset.ajustar != null) { if (await ajustarFoto(estado.items[+b.dataset.ajustar])) marcarEstilo(m); return; }
      const a = b.dataset.s;
      if (a === "cerrar") m.remove();
      else if (a === "volver") verPaso(1);
      else if (a === "crear") crear(m);
      else if (a === "siguiente") {
        if (!elegidos().length) { alert("Marca al menos un partido."); return; }
        b.disabled = true;
        try { await fuentes(); await prepararLogo(); verPaso(2); await pintarEstilos(m); }
        finally { b.disabled = false; }
      }
    });
    m.addEventListener("change", async (ev) => {
      const t = ev.target;
      if (t.dataset.s === "desde" || t.dataset.s === "hasta") {
        let d = $(m, "desde").value, h = $(m, "hasta").value;
        if (!d || !h) return;
        if (d > h) [d, h] = [h, d];
        Object.assign(estado, { desde: d, hasta: h });
        cargarPartidos(m);
      } else if (t.dataset.s === "dividir") {
        estado.dividir = t.checked; $(m, "paginasFila").hidden = !t.checked; $(m, "paginasFila").style.display = t.checked ? "flex" : "none";
        if (t.checked) repartir();
        pintarLista(m);
      } else if (t.dataset.s === "paginas") {
        estado.paginas = +t.value; repartir(); pintarLista(m);
      } else if (t.dataset.sel != null) {
        estado.items[+t.dataset.sel].sel = t.checked; if (estado.dividir) repartir(); pintarLista(m);
      } else if (t.dataset.pag != null) {
        estado.items[+t.dataset.pag].pag = +t.value;
      } else if (t.dataset.foto != null) {
        const it = estado.items[+t.dataset.foto], f = t.files && t.files[0];
        if (!f) return;
        if (it.fotoUrl && it.fotoUrl.startsWith("blob:")) URL.revokeObjectURL(it.fotoUrl);
        it.fotoUrl = URL.createObjectURL(f); it.foto = await cargarImg(it.fotoUrl); it.ajuste = null;
        pintarLista(m);
      }
    });
    $(m, "paginasFila").style.display = "none";
    if (window.cpRefreshFromGitHub && navigator.onLine) { try { await window.cpRefreshFromGitHub(); } catch (e) { console.warn(e); } }
    cargarPartidos(m);
  }

  window.nvaSemana = { abrir, dibujarPagina, prepararPartido, cargarFichas, fuentes, prepararLogo, ESTILOS };
})();
