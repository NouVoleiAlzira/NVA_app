/* =====================================================================
   Redes Sociales › EVENTOS › Cartel con estilo
   Diez estilos de cartel deportivo llevados al vóley. Cada uno tiene:
     · t, d: nombre y descripción para elegirlo.
     · p:   cómo se describe el estilo en el encargo (en inglés). Habla de
            papeles de texto (TITLE, SUBTITLE, MATCHUP, DATE…) que el
            encargo rellena con los textos reales.
     · duo: el estilo enfrenta a dos jugadoras (nuestra y rival).
   dibujar(ctx, W, H, id, T) pinta un boceto del estilo con los textos
   de la entrevista (T) para enseñarlo antes de pedir la imagen.
   ===================================================================== */
(function () {
  "use strict";

  const LISTA = [
    { v: "estallido", t: "Estallido", d: "Fondo partido en diagonal, la jugadora rompiéndose en fragmentos y una palabra gigante desgastada.",
      p: "Split-diagonal sports poster. The background is divided by a bold diagonal into two colour fields: on the left a deep navy-blue night scene with rain, mist and sparkling particles; on the right a vivid orange-yellow field. The main subject explodes forward in full action across the split, with the edges of the figure disintegrating into hundreds of flying angular shards and debris. The TITLE is a single gigantic word or two in distressed, cracked, chalky white heavy block letters spanning the full width across the middle; the subject's upper body is behind the letters and the legs in front of them (layered depth). The SUBTITLE or MATCHUP sits lower right in bold condensed italic white letters, stacked on two lines. A faint silhouette of a small Spanish town skyline fades into the bottom right corner. CONTACT small at the bottom left." },
    { v: "nombre", t: "Nombre gigante", d: "Dos líneas de letras enormes rellenas de luces y la jugadora delante, deshaciéndose en tinta.",
      p: "Clean light poster on an off-white, slightly textured background. The TITLE is set across the top half in two lines of gigantic ultra-bold condensed letters that fill the full width; the letters are filled with a deep blue galaxy texture with bokeh lights, glitter and small orange sparks. The main subject is cut out in front of the letters, overlapping them, and the lower part of the figure dissolves into ink splatter and dust particles flying to the sides. A small left-aligned info block in bold condensed uppercase navy letters sits just below the title (MATCHUP, DATE, VENUE). A large translucent blue hand-written brush signature crosses the bottom of the poster (SUBTITLE if any)." },
    { v: "grunge", t: "Grunge vertical", d: "Humo gris y textura, título vertical gigante en naranja y la jugadora de frente ofreciendo el balón.",
      p: "Gritty grunge sports flyer. Background of grey smoke, dust and concrete texture with halftone dots fading at the edges. The main subject stands front-facing, waist-up and centred, holding a volleyball out towards the camera with one hand, strong rim light. The TITLE runs vertically from bottom to top along the left side in gigantic heavy condensed vivid orange letters, partly behind the subject. A small elegant hand-written script word sits above it (SUBTITLE). Top right: a compact black date block with the DATE in large bold orange numbers with the month below. Bottom: a black brush ribbon with the MATCHUP in white italic caps, then two or three short centred lines of white condensed info (TIME, VENUE, INFO) and the CONTACT line in orange." },
    { v: "duelo", t: "Duelo en diagonal", d: "Pabellón con focos, dos jugadoras cortadas en diagonal, un VS metálico y título dorado.", duo: true,
      p: "Big-match versus poster. Background: a packed indoor arena at night with bright floodlights, lens flares and warm golden light streaks. The composition is split by a glowing diagonal: our player occupies the upper left half and the rival player the lower right half, both shown from the chest up, intense and facing the viewer. A large chrome metallic 3D \"VS\" sits in the centre where they meet. The two team names from the MATCHUP are in silver metallic 3D italic letters, each next to its player. The TITLE is at the bottom in huge gold metallic bevelled 3D letters. Below it a thin info row: the DATE stacked on the left, the VENUE and TIME on the right in white condensed caps." },
    { v: "fuegohielo", t: "Azul contra naranja", d: "Dos jugadoras frente a frente, una envuelta en hielo azul y la otra en fuego naranja. Muy de cine.", duo: true,
      p: "Cinematic face-off poster. Two players face each other in profile at eye level, very close, foreheads almost touching, filling the middle of the poster. The left half is engulfed in icy electric blue smoke, frost and cold sparks; the right half in fire, embers and orange-red smoke; the two atmospheres collide in the centre. Our player is on the blue side and the rival on the fire side. Top centre: the TITLE as a bold event logo in white with metallic purple-blue bevel. Below the players: the SUBTITLE in small gold caps, then the DATE huge in white heavy condensed caps, then TIME and VENUE in smaller gold caps." },
    { v: "estadio", t: "Gran final", d: "Pabellón oscuro con focos y confeti, título cromado enorme, pancartas con los equipos y balones en la pista.",
      p: "Grand-final arena poster. A dark indoor volleyball arena seen from court level, with powerful spotlights at the top, light beams and falling confetti and sparks. The TITLE is huge at the top in chrome silver 3D bevelled letters with a dark outline; the SUBTITLE below it in bold yellow caps. In the middle two angled dark metallic banners carry the two team names of the MATCHUP in white condensed caps, separated by a round dark badge with \"VS\". In the foreground two volleyballs rest on the shiny court floor, one on each side, reflecting the lights. A dark band at the bottom holds the DATE, TIME, VENUE and INFO in one or two lines of white condensed caps separated by thin vertical bars." },
    { v: "salpicadura", t: "Salpicadura de tinta", d: "Papel claro, una gran mancha negra detrás del título y el balón en el centro con siluetas alrededor.",
      p: "Urban ink-splash flyer on light grey textured paper with halftone dots. A large black ink splash with drips and splatters sits behind the title area. The SUBTITLE is a thin line of white spaced caps above; the TITLE is huge in white bold condensed letters with a fine dark outline on top of the black splash. Below it a big glossy volleyball (blue, yellow and white panels) floats in the centre with a warm orange glow. Small black silhouettes of volleyball players (spiking, digging, blocking) and a few small balls are scattered around the ball. Angled black boxes with white text carry the DATE on the left and the TIME on the right. Bottom: centred dark condensed lines with VENUE and INFO, then the CONTACT, and a black splatter strip along the bottom edge." },
    { v: "club", t: "Club y temporada", d: "Pista de parqué con el balón en el centro, titular grande blanco y naranja y cajas con la información.",
      p: "Club season / recruitment poster. Background: an indoor volleyball arena with crowd lights in the distance and a glossy wooden court seen in perspective; orange sparks and light streaks; diagonal orange and navy shapes in the corners. A volleyball sits in the centre of the court. The TITLE is at the top in two lines of huge bold italic condensed letters, the first line white and the second vivid orange, both with a thick black outline and drop shadow, slightly tilted. The SUBTITLE below in a bold white condensed line. Below the ball, a big italic caps line (MATCHUP or main info). Two dark rounded info boxes with a plain orange top strip side by side: the left with DATE and TIME, the right with VENUE and INFO. Leave clear space at the bottom centre for the club crest. A dark footer bar with the CONTACT line." },
    { v: "pincelada", t: "Pincelada grunge", d: "Pabellón oscuro, titular desgastado blanco y naranja, pinceladas de color y una caja con fecha y lugar.",
      p: "Dark grunge event poster. Background: a dark arena with blurred crowd and a few bright spotlights at the top right, black brush textures at the edges. Top left: a small italic white tagline (SUBTITLE). Below it the TITLE stacked left-aligned in distressed heavy condensed letters, the first word white and the last word bigger and vivid orange. A bold red-orange brush stroke banner crosses under the title with the MATCHUP in white hand-written brush lettering. A row of three small orange line icons (volleyball, star, trophy). An info box with a thin orange outline holds the DATE (with a calendar icon), the TIME (clock icon) and the VENUE (pin icon). On the right an orange brush stroke carries a short three-line slogan in black italic caps taken from INFO. Bottom: a black footer band with an orange edge and the CONTACT in huge white letters." },
    { v: "accion", t: "Acción vertical", d: "Fondo negro con rayos de luz, primer plano del remate sobre la red y el título en vertical a la derecha.",
      p: "High-energy action flyer. Black background with dark radial light rays bursting from the upper left. Dramatic close-up at the top: a hand spiking the volleyball over the net, with motion blur, sparks and a bright white glow. The TITLE runs vertically down the right edge in gigantic heavy condensed letters with an orange-to-white gradient and grunge texture. Left column, left-aligned: a small white caps line (SUBTITLE), the DATE large in bold orange condensed caps and the TIME in white. An orange ribbon with an arrow tip carries the MATCHUP in bold white caps. Bottom left: VENUE and INFO in small white condensed caps, and the CONTACT in orange. Bottom right: a small white box with a short black word." }
  ];

  /* ---------- Utilidades de dibujo ---------- */
  function azar(semilla) {
    let s = semilla >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const A = px => `${Math.round(px)}px Anton, Impact, sans-serif`;
  const BC = px => `italic 800 ${Math.round(px)}px "Barlow Condensed", sans-serif`;
  const B = (px, w) => `${w || 700} ${Math.round(px)}px Barlow, sans-serif`;
  const PM = px => `${Math.round(px)}px "Permanent Marker", cursive`;

  // Tamaño para que el texto quepa en maxW (sin pasar de px)
  function cabe(ctx, txt, maxW, px, fuente) {
    ctx.font = fuente(px);
    const w = ctx.measureText(txt).width;
    return w > maxW ? Math.max(4, px * maxW / w) : px;
  }
  function texto(ctx, txt, x, y, maxW, px, fuente, color, align, borde) {
    if (!txt) return 0;
    const t = cabe(ctx, txt, maxW, px, fuente);
    ctx.font = fuente(t); ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
    if (borde) { ctx.lineJoin = "round"; ctx.lineWidth = t * borde[1]; ctx.strokeStyle = borde[0]; ctx.strokeText(txt, x, y); }
    ctx.fillStyle = color; ctx.fillText(txt, x, y);
    return t;
  }
  // Parte un título en 1 o 2 líneas equilibradas
  function lineas(t, n) {
    const p = String(t || "").trim().split(/\s+/);
    if (n === 1 || p.length < 2) return [p.join(" ")];
    let mejor = 1, dif = Infinity;
    for (let i = 1; i < p.length; i++) { const d = Math.abs(p.slice(0, i).join(" ").length - p.slice(i).join(" ").length); if (d < dif) { dif = d; mejor = i; } }
    return [p.slice(0, mejor).join(" "), p.slice(mejor).join(" ")];
  }
  function partirVs(vs) {
    const m = String(vs || "").split(/\s+(?:vs\.?|v\.?|-|–|contra)\s+/i);
    return m.length >= 2 ? [m[0].trim(), m.slice(1).join(" ").trim()] : [String(vs || "").trim(), ""];
  }
  function brillo(ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace("A", a)); g.addColorStop(1, color.replace("A", 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function puntos(ctx, n, x, y, w, h, rmin, rmax, color, rnd) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x + rnd() * w, y + rnd() * h, rmin + rnd() * (rmax - rmin), 0, 7); ctx.fill(); }
  }
  function esquirlas(ctx, n, x, y, w, h, tam, colores, rnd) {
    for (let i = 0; i < n; i++) {
      const cx = x + rnd() * w, cy = y + rnd() * h, s = tam * (0.3 + rnd()), a = rnd() * 6.3;
      ctx.fillStyle = colores[i % colores.length];
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
      ctx.lineTo(cx + Math.cos(a + 2.3) * s * 0.7, cy + Math.sin(a + 2.3) * s * 0.7);
      ctx.lineTo(cx + Math.cos(a + 4.1) * s * 0.5, cy + Math.sin(a + 4.1) * s * 0.5);
      ctx.fill();
    }
  }
  function salpicar(ctx, cx, cy, rad, n, color, rnd) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.3, d = Math.pow(rnd(), 0.6) * rad, r = Math.max(0.6, (1 - d / rad) * rad * 0.06 * rnd() + rad * 0.004);
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d * 1.3, cy + Math.sin(a) * d * 0.8, r, 0, 7); ctx.fill();
    }
  }
  // Textura «desgastada» sobre lo último dibujado en una zona
  function desgaste(ctx, x, y, w, h, color, rnd, n) {
    ctx.save(); ctx.globalCompositeOperation = "source-atop";
    puntos(ctx, n || 220, x, y, w, h, w * 0.0015, w * 0.006, color, rnd);
    ctx.restore();
  }
  // Balón de vóley: amarillo, azul y blanco
  function balon(ctx, x, y, r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = "#f5c518"; ctx.fill(); ctx.clip();
    ctx.lineWidth = r * 0.42;
    ctx.strokeStyle = "#1f3cff"; ctx.beginPath(); ctx.arc(x - r * 0.9, y - r * 1.05, r * 1.25, 0.15, 1.45); ctx.stroke();
    ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.arc(x + r * 1.2, y + r * 0.2, r * 1.15, 2.2, 3.9); ctx.stroke();
    ctx.strokeStyle = "#1f3cff"; ctx.beginPath(); ctx.arc(x - r * 0.2, y + r * 1.35, r * 1.0, 3.9, 5.6); ctx.stroke();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, "rgba(255,255,255,.35)"); g.addColorStop(0.6, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0,.35)");
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  // Silueta de jugadora (h = alto). pose: remate | frente | perfil
  const POSES = {
    remate: { cab: [-0.03, -0.4], cuello: [-0.01, -0.31], cadera: [0.04, 0.06], piernas: [[[-0.06, 0.24], [-0.2, 0.36]], [[0.12, 0.22], [0.07, 0.42]]],
      brazos: [[[0.1, -0.46], [0.15, -0.62]], [[-0.14, -0.22], [-0.08, -0.08]]], bal: [0.18, -0.7, 0.06] },
    frente: { cab: [0, -0.4], cuello: [0, -0.31], cadera: [0, 0.08], piernas: [[[-0.07, 0.26], [-0.08, 0.45]], [[0.07, 0.26], [0.08, 0.45]]],
      brazos: [[[-0.13, -0.17], [-0.11, -0.01]], [[0.15, -0.16], [0.13, -0.05]]], bal: [0.14, -0.07, 0.085] }
  };
  function jugadora(ctx, x, y, h, color, pose, borde, espejo) {
    ctx.save(); ctx.translate(x, y); if (espejo) ctx.scale(-1, 1);
    if (pose === "perfil") {   // cabeza y hombros de perfil mirando a la derecha
      const capa = (c, d) => {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.ellipse(-0.02 * h + d, -0.12 * h, 0.15 * h, 0.17 * h, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0.1 * h + d, -0.16 * h); ctx.lineTo(0.17 * h + d, -0.08 * h); ctx.lineTo(0.11 * h + d, -0.04 * h); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-0.2 * h + d, -0.2 * h, 0.06 * h, 0.1 * h, 0.6, 0, 7); ctx.fill();
        ctx.fillRect(-0.08 * h + d, -0.02 * h, 0.13 * h, 0.12 * h);
        ctx.beginPath(); ctx.ellipse(-0.04 * h + d, 0.3 * h, 0.32 * h, 0.22 * h, 0, Math.PI, 0); ctx.fill();
        ctx.fillRect(-0.36 * h + d, 0.3 * h, 0.64 * h, 0.2 * h);
      };
      if (borde) capa(borde, h * 0.012);
      capa(color, 0);
      ctx.restore(); return;
    }
    const P = POSES[pose] || POSES.remate, q = p => [p[0] * h, p[1] * h];
    const trazo = (c, extra) => {
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineCap = ctx.lineJoin = "round";
      const l = (pts, w) => { ctx.lineWidth = w + extra; ctx.beginPath(); ctx.moveTo(...q(P.cuello)); pts.forEach(p => ctx.lineTo(...q(p))); ctx.stroke(); };
      ctx.lineWidth = 0.13 * h + extra; ctx.beginPath(); ctx.moveTo(...q(P.cuello)); ctx.lineTo(...q(P.cadera)); ctx.stroke();
      P.brazos.forEach(b => l(b, 0.055 * h));
      P.piernas.forEach(pi => { ctx.lineWidth = 0.075 * h + extra; ctx.beginPath(); ctx.moveTo(...q(P.cadera)); pi.forEach(p => ctx.lineTo(...q(p))); ctx.stroke(); });
      ctx.beginPath(); ctx.arc(...q(P.cab), 0.068 * h + extra / 2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(P.cab[0] * h - 0.07 * h, P.cab[1] * h + 0.01 * h, 0.03 * h + extra / 2, 0.06 * h + extra / 2, 0.5, 0, 7); ctx.fill();
    };
    if (borde) trazo(borde, h * 0.025);
    trazo(color, 0);
    ctx.restore();
    if (P.bal) balon(ctx, x + (espejo ? -1 : 1) * P.bal[0] * h, y + P.bal[1] * h, P.bal[2] * h);
  }
  function escudo(ctx, im, x, y, d) {
    if (!im) return;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = d * 0.12;
    const k = d / Math.max(im.width, im.height);
    ctx.drawImage(im, x - im.width * k / 2, y - im.height * k / 2, im.width * k, im.height * k);
    ctx.restore();
  }
  function caja(ctx, x, y, w, h, color, rr) {
    ctx.fillStyle = color; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rr || 0); else ctx.rect(x, y, w, h);
    ctx.fill();
  }
  // Pincelada: franja con bordes irregulares
  function pincel(ctx, x, y, w, h, color, rot, rnd) {
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2);
    for (let i = 0; i <= 20; i++) ctx.lineTo(-w / 2 + w * i / 20, -h / 2 + (rnd() - 0.5) * h * 0.25);
    for (let i = 20; i >= 0; i--) ctx.lineTo(-w / 2 + w * i / 20, h / 2 + (rnd() - 0.5) * h * 0.25);
    ctx.fill();
    for (let i = 0; i < 14; i++) ctx.fillRect(-w / 2 - rnd() * w * 0.08, -h / 2 + rnd() * h, w * 0.06 * rnd(), h * 0.06);
    ctx.restore();
  }
  function gradas(ctx, y0, y1, W, rnd, color, n) {
    puntos(ctx, n || 500, 0, y0, W, y1 - y0, W * 0.002, W * 0.005, color, rnd);
  }
  const info = T => [T.hora, T.lugar].filter(Boolean).join(" · ");

  /* ---------- Colores del boceto (principal y acento elegidos) ---------- */
  let PR, PR2, PR3, AC, AC2, AC3;
  const hx = h => { const n = parseInt(String(h).replace("#", ""), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mezclar = (a, b, t) => "#" + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
  const rgb = (h, a) => { const [r, g, b] = hx(h); return `rgba(${r},${g},${b},${a})`; };
  function tonos(c1, c2) {
    PR = c1; PR2 = mezclar(c1, "#ffffff", 0.3); PR3 = mezclar(c1, "#000000", 0.55);
    AC = c2; AC2 = mezclar(c2, "#ffffff", 0.25); AC3 = mezclar(c2, "#000000", 0.45);
  }
  tonos("#1f3cff", "#ff5b00");

  /* ---------- Bocetos ---------- */
  const DIB = {
    estallido(ctx, W, H, T, rnd) {
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, PR); g.addColorStop(0.6, PR3); g.addColorStop(1, "#050a2a");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const o = ctx.createLinearGradient(W * 0.5, 0, W, H); o.addColorStop(0, AC2); o.addColorStop(1, AC);
      ctx.fillStyle = o; ctx.beginPath(); ctx.moveTo(W * 0.66, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * 0.46, H); ctx.fill();
      ctx.strokeStyle = "rgba(170,200,255,.25)"; ctx.lineWidth = Math.max(1, W * 0.002);
      for (let i = 0; i < 90; i++) { const x = rnd() * W * 0.65, y = rnd() * H; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - W * 0.01, y + H * 0.03); ctx.stroke(); }
      esquirlas(ctx, 70, W * 0.15, H * 0.12, W * 0.8, H * 0.75, W * 0.025, ["#0b1236", "#0b1236", AC2, "#e9eefa"], rnd);
      const yT = H * 0.53, lin = lineas(T.titulo.toUpperCase(), 1);
      jugadora(ctx, W * 0.5, H * 0.46, H * 0.62, "#0b1236", "remate", PR2);
      const px = texto(ctx, lin[0], W / 2, yT, W * 0.94, H * 0.2, A, "#f4f6fb");
      desgaste(ctx, 0, yT - px / 2, W, px, rgb(PR3, .55), rnd, 260);
      ctx.save(); ctx.beginPath(); ctx.rect(0, yT + px * 0.32, W, H); ctx.clip();
      jugadora(ctx, W * 0.5, H * 0.46, H * 0.62, "#0b1236", "remate", PR2); ctx.restore();
      const sub = (T.sub || T.vs || "").toUpperCase(), sl = lineas(sub, 2);
      sl.forEach((l, i) => texto(ctx, l, W * 0.94, H * (0.76 + i * 0.055), W * 0.5, W * 0.085, BC, "#ffffff", "right"));
      ctx.fillStyle = rgb(AC3, .55);
      for (let i = 0; i < 12; i++) { const w = W * (0.02 + rnd() * 0.03), h = H * (0.03 + rnd() * 0.08); ctx.fillRect(W * 0.6 + i * W * 0.033, H - h, w, h); }
      texto(ctx, [T.fecha, T.redes].filter(Boolean).join("  ·  "), W * 0.06, H * 0.95, W * 0.5, W * 0.035, B, "#ffffff", "left");
    },

    nombre(ctx, W, H, T, rnd) {
      ctx.fillStyle = "#eef1f7"; ctx.fillRect(0, 0, W, H);
      puntos(ctx, 300, 0, 0, W, H, W * 0.001, W * 0.004, "rgba(40,60,120,.08)", rnd);
      const lin = lineas(T.titulo.toUpperCase(), 2);
      const of = document.createElement("canvas"); of.width = W; of.height = H; const o = of.getContext("2d");
      lin.forEach((l, i) => texto(o, l, W / 2, H * (lin.length === 1 ? 0.24 : 0.16 + i * 0.2), W * 0.95, H * (lin.length === 1 ? 0.22 : 0.19), A, "#000"));
      o.globalCompositeOperation = "source-atop";
      const g = o.createLinearGradient(0, 0, W, H * 0.5); g.addColorStop(0, PR3); g.addColorStop(0.5, PR2); g.addColorStop(1, PR3);
      o.fillStyle = g; o.fillRect(0, 0, W, H);
      puntos(o, 160, 0, 0, W, H * 0.5, W * 0.003, W * 0.02, rgb(PR2, .35), rnd);
      puntos(o, 40, 0, 0, W, H * 0.5, W * 0.002, W * 0.006, rgb(AC2, .8), rnd);
      ctx.drawImage(of, 0, 0);
      salpicar(ctx, W * 0.55, H * 0.8, W * 0.42, 260, "rgba(11,18,54,.85)", rnd);
      salpicar(ctx, W * 0.72, H * 0.62, W * 0.18, 90, "rgba(190,150,40,.8)", rnd);
      jugadora(ctx, W * 0.56, H * 0.6, H * 0.66, PR3, "remate", "#ffffff");
      [T.vs, T.fecha, T.lugar].filter(Boolean).forEach((l, i) => texto(ctx, l.toUpperCase(), W * 0.05, H * (0.58 + i * 0.035), W * 0.36, W * 0.032, BC, PR3, "left"));
      ctx.save(); ctx.translate(W * 0.5, H * 0.9); ctx.rotate(-0.12); ctx.globalAlpha = 0.55;
      texto(ctx, T.sub || "Nou Volei Alzira", 0, 0, W * 0.9, W * 0.15, PM, PR); ctx.restore();
    },

    grunge(ctx, W, H, T, rnd) {
      const g = ctx.createRadialGradient(W * 0.55, H * 0.45, W * 0.05, W * 0.5, H * 0.5, H * 0.7);
      g.addColorStop(0, "#b4b8be"); g.addColorStop(0.55, "#6b7078"); g.addColorStop(1, "#24272d");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 26; i++) brillo(ctx, rnd() * W, rnd() * H, W * (0.15 + rnd() * 0.3), "rgba(255,255,255,A)", 0.12);
      for (let y = 0; y < H; y += W * 0.025) for (let x = 0; x < W; x += W * 0.025) {
        const e = Math.max(0, 1 - Math.min(x, W - x, y, H - y) / (W * 0.18));
        if (e > 0) { ctx.fillStyle = `rgba(20,20,20,${0.35 * e})`; ctx.beginPath(); ctx.arc(x, y, W * 0.007 * e, 0, 7); ctx.fill(); }
      }
      ctx.save(); ctx.translate(W * 0.2, H * 0.55); ctx.rotate(-Math.PI / 2);
      const px = texto(ctx, T.titulo.toUpperCase(), 0, 0, H * 0.78, W * 0.3, A, AC);
      desgaste(ctx, -H * 0.4, -px / 2, H * 0.8, px, "rgba(60,60,60,.45)", rnd, 200);
      ctx.restore();
      if (T.sub) texto(ctx, T.sub, W * 0.2, H * 0.1, W * 0.36, W * 0.06, PM, "#ffffff");
      jugadora(ctx, W * 0.56, H * 0.55, H * 0.8, "#1c1f26", "frente", AC2);
      caja(ctx, W * 0.7, H * 0.05, W * 0.25, H * 0.04, "#0d0d0d");
      texto(ctx, (T.evento || "PARTIDO").toUpperCase(), W * 0.825, H * 0.07, W * 0.22, W * 0.04, BC, "#ffffff");
      texto(ctx, (T.fecha || "").toUpperCase(), W * 0.825, H * 0.13, W * 0.26, W * 0.08, A, AC);
      if (T.vs) { pincel(ctx, W * 0.12, H * 0.8, W * 0.76, H * 0.05, "#0d0d0d", -0.02, rnd); texto(ctx, T.vs.toUpperCase(), W * 0.5, H * 0.825, W * 0.7, W * 0.055, BC, "#ffffff"); }
      [info(T), T.extra].filter(Boolean).forEach((l, i) => texto(ctx, l.toUpperCase(), W / 2, H * (0.885 + i * 0.035), W * 0.9, W * 0.036, BC, "#ffffff"));
      texto(ctx, T.redes, W / 2, H * 0.965, W * 0.8, W * 0.032, B, AC2);
    },

    duelo(ctx, W, H, T, rnd) {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0d1a4a"); g.addColorStop(0.5, "#060c26"); g.addColorStop(1, "#03060f");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      gradas(ctx, H * 0.08, H * 0.42, W, rnd, "rgba(255,190,90,.22)", 700);
      for (let i = 0; i < 6; i++) brillo(ctx, W * (0.08 + i * 0.17), H * 0.12, W * 0.12, "rgba(255,240,200,A)", 0.9);
      ctx.save(); ctx.translate(W / 2, H * 0.47); ctx.rotate(-0.35);
      const lg = ctx.createLinearGradient(-W, 0, W, 0); lg.addColorStop(0, "rgba(255,180,60,0)"); lg.addColorStop(0.5, "rgba(255,200,90,.9)"); lg.addColorStop(1, "rgba(255,180,60,0)");
      ctx.fillStyle = lg; ctx.fillRect(-W, -H * 0.004, W * 2, H * 0.008); ctx.restore();
      jugadora(ctx, W * 0.3, H * 0.27, H * 0.42, PR, "perfil", "#c9d6ff");
      jugadora(ctx, W * 0.7, H * 0.6, H * 0.42, T.rivalColor || "#c1121f", "perfil", "#ffd2b0", true);
      const ch = ctx.createLinearGradient(0, H * 0.4, 0, H * 0.5); ch.addColorStop(0, "#ffffff"); ch.addColorStop(0.5, "#8d97ab"); ch.addColorStop(1, "#f2f4f8");
      texto(ctx, "VS", W / 2, H * 0.455, W * 0.3, W * 0.17, A, ch, "center", ["#0b1236", 0.08]);
      const [l, v] = partirVs(T.vs);
      if (l) { texto(ctx, "LOCAL", W * 0.92, H * 0.17, W * 0.3, W * 0.03, BC, "#f5c518", "right"); texto(ctx, l.toUpperCase(), W * 0.92, H * 0.22, W * 0.46, W * 0.085, BC, "#e6e9f0", "right"); }
      if (v) { texto(ctx, v.toUpperCase(), W * 0.08, H * 0.63, W * 0.46, W * 0.085, BC, "#e6e9f0", "left"); texto(ctx, "VISITANTE", W * 0.08, H * 0.68, W * 0.3, W * 0.03, BC, "#f5c518", "left"); }
      if (T.escL) escudo(ctx, T.escL, W * 0.62, H * 0.2, W * 0.13);
      if (T.escV) escudo(ctx, T.escV, W * 0.38, H * 0.65, W * 0.13);
      const go = ctx.createLinearGradient(0, H * 0.76, 0, H * 0.84); go.addColorStop(0, "#fff3b0"); go.addColorStop(0.5, "#f5b400"); go.addColorStop(1, "#a86b00");
      lineas(T.titulo.toUpperCase(), 2).forEach((t, i, a) => texto(ctx, t, W / 2, H * (a.length === 1 ? 0.8 : 0.77 + i * 0.065), W * 0.9, Math.min(W * 0.15, H * 0.068), A, go, "center", ["#2a1700", 0.06]));
      texto(ctx, (T.fecha || "").toUpperCase(), W / 2, H * 0.9, W * 0.88, W * 0.055, BC, "#ffffff");
      texto(ctx, info(T).toUpperCase(), W / 2, H * 0.945, W * 0.88, W * 0.038, BC, "#c9d0e0");
    },

    fuegohielo(ctx, W, H, T, rnd) {
      const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, "#04122e"); g.addColorStop(0.5, "#1a0b1e"); g.addColorStop(1, "#2a0500");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 14; i++) brillo(ctx, rnd() * W * 0.5, H * (0.25 + rnd() * 0.5), W * 0.25, rgb(PR2, "A"), 0.22);
      for (let i = 0; i < 14; i++) brillo(ctx, W * 0.5 + rnd() * W * 0.5, H * (0.25 + rnd() * 0.5), W * 0.25, rgb(AC, "A"), 0.25);
      puntos(ctx, 120, 0, H * 0.15, W * 0.5, H * 0.65, W * 0.002, W * 0.006, "rgba(190,230,255,.8)", rnd);
      puntos(ctx, 140, W * 0.5, H * 0.15, W * 0.5, H * 0.65, W * 0.002, W * 0.007, "rgba(255,180,60,.85)", rnd);
      jugadora(ctx, W * 0.27, H * 0.47, H * 0.42, "#06142f", "perfil", PR2);
      jugadora(ctx, W * 0.73, H * 0.47, H * 0.42, "#1f0700", "perfil", AC2, true);
      const tg = ctx.createLinearGradient(0, H * 0.06, 0, H * 0.16); tg.addColorStop(0, "#ffffff"); tg.addColorStop(1, "#a9a3ff");
      lineas(T.titulo.toUpperCase(), 2).forEach((t, i, a) => texto(ctx, t, W / 2, H * (a.length === 1 ? 0.1 : 0.08 + i * 0.06), W * 0.8, Math.min(W * 0.1, H * 0.063), A, tg, "center", ["#2a1a6e", 0.08]));
      texto(ctx, (T.sub || T.vs || "").toUpperCase(), W / 2, H * 0.73, W * 0.7, W * 0.04, BC, "#f5c518");
      texto(ctx, (T.fecha || "").toUpperCase(), W / 2, H * 0.79, W * 0.9, W * 0.11, A, "#ffffff");
      texto(ctx, info(T).toUpperCase(), W / 2, H * 0.85, W * 0.85, W * 0.04, BC, "#f5c518");
      if (T.escL || T.escV) { escudo(ctx, T.escL, W * 0.12, H * 0.93, W * 0.14); escudo(ctx, T.escV, W * 0.88, H * 0.93, W * 0.14); }
      for (let i = 0; i < 3; i++) caja(ctx, W * (0.33 + i * 0.12), H * 0.92, W * 0.1, H * 0.03, "rgba(255,255,255,.18)", 4);
    },

    estadio(ctx, W, H, T, rnd) {
      ctx.fillStyle = "#05070d"; ctx.fillRect(0, 0, W, H);
      gradas(ctx, H * 0.3, H * 0.6, W, rnd, "rgba(200,210,240,.2)", 900);
      for (let i = 0; i < 5; i++) {
        const x = W * (0.1 + i * 0.2);
        ctx.fillStyle = "rgba(255,255,255,.05)"; ctx.beginPath(); ctx.moveTo(x - W * 0.02, H * 0.05); ctx.lineTo(x + W * 0.02, H * 0.05); ctx.lineTo(x + W * 0.12, H * 0.6); ctx.lineTo(x - W * 0.12, H * 0.6); ctx.fill();
        brillo(ctx, x, H * 0.05, W * 0.1, "rgba(255,255,255,A)", 0.95);
      }
      const cols = ["#ffffff", "#f5c518", AC2, "#9fb0d8"];
      for (let i = 0; i < 70; i++) { ctx.fillStyle = cols[i % 4]; ctx.save(); ctx.translate(rnd() * W, rnd() * H * 0.6); ctx.rotate(rnd() * 3); ctx.fillRect(0, 0, W * 0.012, W * 0.006); ctx.restore(); }
      ctx.fillStyle = PR; ctx.fillRect(0, H * 0.62, W, H * 0.38);
      ctx.fillStyle = AC2; ctx.beginPath(); ctx.moveTo(W * 0.22, H * 0.62); ctx.lineTo(W * 0.78, H * 0.62); ctx.lineTo(W * 1.15, H); ctx.lineTo(-W * 0.15, H); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = Math.max(1, W * 0.004);
      ctx.beginPath(); ctx.moveTo(W * 0.22, H * 0.62); ctx.lineTo(-W * 0.15, H); ctx.moveTo(W * 0.78, H * 0.62); ctx.lineTo(W * 1.15, H); ctx.moveTo(W * 0.12, H * 0.75); ctx.lineTo(W * 0.88, H * 0.75); ctx.stroke();
      const ch = ctx.createLinearGradient(0, H * 0.12, 0, H * 0.25); ch.addColorStop(0, "#ffffff"); ch.addColorStop(0.5, "#8a93a6"); ch.addColorStop(1, "#eef1f6");
      lineas(T.titulo.toUpperCase(), 2).forEach((t, i, a) => texto(ctx, t, W / 2, H * (a.length === 1 ? 0.18 : 0.14 + i * 0.09), W * 0.9, Math.min(W * 0.2, H * 0.094), A, ch, "center", ["#11141c", 0.06]));
      texto(ctx, (T.sub || "").toUpperCase(), W / 2, H * 0.31, W * 0.85, W * 0.045, B, "#f5c518");
      const [l, v] = partirVs(T.vs);
      if (l || v) {
        [[W * 0.04, l, T.escL], [W * 0.58, v, T.escV]].forEach(([x, n, e]) => {
          ctx.save(); ctx.transform(1, 0, -0.15, 1, 0, 0); caja(ctx, x + W * 0.06, H * 0.53, W * 0.38, H * 0.06, "rgba(30,34,48,.95)"); ctx.restore();
          texto(ctx, (n || "").toUpperCase(), x + W * 0.19, H * 0.56, W * 0.32, W * 0.05, BC, "#ffffff");
          if (e) escudo(ctx, e, x + W * 0.19, H * 0.47, W * 0.12);
        });
        ctx.fillStyle = "#11141c"; ctx.beginPath(); ctx.arc(W / 2, H * 0.56, W * 0.07, 0, 7); ctx.fill();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = W * 0.006; ctx.stroke();
        texto(ctx, "VS", W / 2, H * 0.56, W * 0.1, W * 0.06, A, "#ffffff");
      }
      balon(ctx, W * 0.3, H * 0.8, W * 0.1); balon(ctx, W * 0.7, H * 0.8, W * 0.1);
      caja(ctx, 0, H * 0.9, W, H * 0.1, "rgba(5,7,13,.92)");
      texto(ctx, [T.fecha, T.hora, T.lugar].filter(Boolean).join("  |  ").toUpperCase(), W / 2, H * 0.935, W * 0.92, W * 0.045, BC, "#ffffff");
      texto(ctx, T.extra || T.redes, W / 2, H * 0.97, W * 0.9, W * 0.028, B, "#c5ccdb");
    },

    salpicadura(ctx, W, H, T, rnd) {
      ctx.fillStyle = "#e9e8e4"; ctx.fillRect(0, 0, W, H);
      puntos(ctx, 500, 0, 0, W, H, W * 0.001, W * 0.003, "rgba(0,0,0,.08)", rnd);
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.28, W * 0.4, H * 0.1, -0.05, 0, 7); ctx.fill();
      salpicar(ctx, W / 2, H * 0.28, W * 0.5, 320, "#111", rnd);
      ctx.fillRect(W * 0.3, H * 0.33, W * 0.008, H * 0.05); ctx.fillRect(W * 0.62, H * 0.34, W * 0.006, H * 0.07);
      texto(ctx, (T.sub || "").toUpperCase().split("").join(" "), W / 2, H * 0.08, W * 0.8, W * 0.032, B, "#333");
      lineas(T.titulo.toUpperCase(), 2).forEach((t, i, a) => texto(ctx, t, W / 2, H * (a.length === 1 ? 0.28 : 0.22 + i * 0.11), W * 0.86, Math.min(W * 0.2, H * 0.115), A, "#f4f4f4", "center", ["#000", 0.05]));
      brillo(ctx, W / 2, H * 0.56, W * 0.38, rgb(AC2, "A"), 0.55);
      balon(ctx, W / 2, H * 0.54, W * 0.2);
      jugadora(ctx, W * 0.15, H * 0.47, H * 0.13, "#111", "remate");
      jugadora(ctx, W * 0.86, H * 0.5, H * 0.13, "#111", "remate", null, true);
      balon(ctx, W * 0.2, H * 0.63, W * 0.035); balon(ctx, W * 0.86, H * 0.36, W * 0.028);
      if (T.fecha) { ctx.save(); ctx.translate(W * 0.2, H * 0.68); ctx.rotate(-0.06); caja(ctx, -W * 0.17, -H * 0.03, W * 0.34, H * 0.06, "#111"); texto(ctx, T.fecha.toUpperCase(), 0, 0, W * 0.3, W * 0.045, BC, "#fff"); ctx.restore(); }
      if (T.hora) { ctx.save(); ctx.translate(W * 0.8, H * 0.69); ctx.rotate(0.05); caja(ctx, -W * 0.15, -H * 0.025, W * 0.3, H * 0.05, "#111"); texto(ctx, T.hora.toUpperCase(), 0, 0, W * 0.26, W * 0.045, BC, "#fff"); ctx.restore(); }
      [T.vs, T.lugar, T.extra].filter(Boolean).forEach((l, i) => texto(ctx, l.toUpperCase(), W / 2, H * (0.78 + i * 0.038), W * 0.86, W * 0.04, BC, "#1a1a1a"));
      texto(ctx, T.redes, W / 2, H * 0.9, W * 0.7, W * 0.03, B, "#333");
      salpicar(ctx, W / 2, H * 1.0, W * 0.6, 200, "#111", rnd);
    },

    club(ctx, W, H, T, rnd) {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.5); g.addColorStop(0, "#050a1e"); g.addColorStop(1, "#13224f");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      gradas(ctx, H * 0.22, H * 0.45, W, rnd, "rgba(180,200,255,.18)", 700);
      for (let i = 0; i < 4; i++) brillo(ctx, W * (0.15 + i * 0.23), H * 0.3, W * 0.12, "rgba(220,235,255,A)", 0.6);
      const m = ctx.createLinearGradient(0, H * 0.45, 0, H); m.addColorStop(0, "#d79a5c"); m.addColorStop(1, "#7c4519");
      ctx.fillStyle = m; ctx.beginPath(); ctx.moveTo(W * 0.1, H * 0.45); ctx.lineTo(W * 0.9, H * 0.45); ctx.lineTo(W * 1.3, H); ctx.lineTo(-W * 0.3, H); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = Math.max(1, W * 0.004);
      ctx.beginPath(); ctx.ellipse(W / 2, H * 0.55, W * 0.2, H * 0.04, 0, 0, 7); ctx.moveTo(0, H * 0.55); ctx.lineTo(W, H * 0.55); ctx.stroke();
      ctx.fillStyle = AC; ctx.beginPath(); ctx.moveTo(W, H * 0.6); ctx.lineTo(W, H * 0.8); ctx.lineTo(W * 0.8, H * 0.8); ctx.fill();
      ctx.fillStyle = PR; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.18, 0); ctx.lineTo(0, H * 0.12); ctx.fill();
      esquirlas(ctx, 50, 0, H * 0.3, W, H * 0.4, W * 0.01, [AC2, AC2], rnd);
      const lin = lineas(T.titulo.toUpperCase(), 2);
      ctx.save(); ctx.transform(1, 0, -0.12, 1, H * 0.012, 0);
      lin.forEach((t, i) => texto(ctx, t, W / 2, H * (0.08 + i * 0.085), W * 0.9, Math.min(W * 0.15, H * 0.088), A, i === lin.length - 1 && lin.length > 1 ? AC : "#ffffff", "center", ["#000", 0.1]));
      ctx.restore();
      texto(ctx, (T.sub || "").toUpperCase(), W / 2, H * 0.25, W * 0.8, W * 0.05, BC, "#ffffff", "center", ["#000", 0.08]);
      balon(ctx, W / 2, H * 0.5, W * 0.13);
      texto(ctx, (T.vs || "").toUpperCase(), W / 2, H * 0.66, W * 0.9, W * 0.08, A, "#ffffff", "center", ["#000", 0.08]);
      [[W * 0.04, "CUÁNDO", [T.fecha, T.hora]], [W * 0.52, "DÓNDE", [T.lugar, T.extra]]].forEach(([x, cab, ls]) => {
        caja(ctx, x, H * 0.72, W * 0.44, H * 0.11, "rgba(8,12,30,.88)", W * 0.02); caja(ctx, x, H * 0.72, W * 0.44, H * 0.028, AC, W * 0.02);
        texto(ctx, cab, x + W * 0.22, H * 0.734, W * 0.4, W * 0.032, BC, "#ffffff");
        ls.filter(Boolean).forEach((l, i) => texto(ctx, l, x + W * 0.22, H * (0.77 + i * 0.03), W * 0.4, W * 0.032, B, i ? AC2 : "#ffffff"));
      });
      caja(ctx, 0, H * 0.93, W, H * 0.07, "#05070f");
      texto(ctx, T.redes, W / 2, H * 0.965, W * 0.9, W * 0.032, B, "#ffffff");
    },

    pincelada(ctx, W, H, T, rnd) {
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#151515"); g.addColorStop(1, "#050505");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      gradas(ctx, H * 0.2, H * 0.6, W, rnd, "rgba(255,255,255,.07)", 600);
      brillo(ctx, W * 0.82, H * 0.12, W * 0.25, "rgba(255,255,255,A)", 0.35);
      texto(ctx, T.sub ? T.sub.toUpperCase() : "", W * 0.06, H * 0.06, W * 0.7, W * 0.04, BC, "#ffffff", "left");
      const p = T.titulo.toUpperCase().split(/\s+/), ult = p.length > 1 ? p.pop() : "", pri = p.join(" ");
      const p1 = texto(ctx, pri, W * 0.06, H * 0.15, W * 0.86, W * 0.17, A, "#f2f2f2", "left");
      desgaste(ctx, 0, H * 0.15 - p1 / 2, W, p1, "rgba(20,20,20,.55)", rnd, 160);
      if (ult) { const p2 = texto(ctx, ult, W * 0.06, H * 0.29, W * 0.9, W * 0.25, A, AC, "left"); desgaste(ctx, 0, H * 0.29 - p2 / 2, W, p2, "rgba(20,20,20,.5)", rnd, 160); }
      pincel(ctx, W * 0.02, H * 0.37, W * 0.8, H * 0.06, "#c1121f", -0.05, rnd);
      ctx.save(); ctx.translate(W * 0.42, H * 0.4); ctx.rotate(-0.05); texto(ctx, T.vs || T.extra || "", 0, 0, W * 0.72, W * 0.06, PM, "#ffffff"); ctx.restore();
      ctx.strokeStyle = AC; ctx.lineWidth = Math.max(1.5, W * 0.005);
      [0.12, 0.3, 0.48].forEach((x, i) => {
        const cx = W * x, cy = H * 0.5, r = W * 0.045;
        ctx.beginPath();
        if (i === 0) { ctx.arc(cx, cy, r, 0, 7); ctx.moveTo(cx - r, cy); ctx.quadraticCurveTo(cx, cy - r * 0.6, cx + r, cy); }
        else if (i === 1) { for (let k = 0; k < 11; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx[k ? "lineTo" : "moveTo"](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } }
        else { ctx.moveTo(cx - r * 0.7, cy - r); ctx.lineTo(cx + r * 0.7, cy - r); ctx.quadraticCurveTo(cx + r * 0.7, cy + r * 0.3, cx, cy + r * 0.3); ctx.quadraticCurveTo(cx - r * 0.7, cy + r * 0.3, cx - r * 0.7, cy - r); ctx.moveTo(cx, cy + r * 0.3); ctx.lineTo(cx, cy + r); ctx.moveTo(cx - r * 0.4, cy + r); ctx.lineTo(cx + r * 0.4, cy + r); }
        ctx.stroke();
      });
      ctx.strokeStyle = rgb(AC, .9); ctx.lineWidth = Math.max(1, W * 0.003); ctx.strokeRect(W * 0.05, H * 0.57, W * 0.52, H * 0.18);
      texto(ctx, (T.fecha || "").toUpperCase(), W * 0.08, H * 0.61, W * 0.46, W * 0.055, BC, AC2, "left");
      texto(ctx, (T.hora || "").toUpperCase(), W * 0.08, H * 0.66, W * 0.46, W * 0.045, BC, "#ffffff", "left");
      texto(ctx, (T.lugar || "").toUpperCase(), W * 0.08, H * 0.71, W * 0.46, W * 0.04, BC, "#ffffff", "left");
      pincel(ctx, W * 0.55, H * 0.63, W * 0.44, H * 0.13, AC2, -0.08, rnd);
      ctx.save(); ctx.translate(W * 0.77, H * 0.695); ctx.rotate(-0.08);
      lineas((T.extra || T.sub || "").toUpperCase(), 2).forEach((l, i, a) => texto(ctx, l, 0, (i - (a.length - 1) / 2) * W * 0.06, W * 0.38, W * 0.05, BC, "#111")); ctx.restore();
      caja(ctx, 0, H * 0.85, W, H * 0.15, "#000"); ctx.fillStyle = AC; ctx.fillRect(0, H * 0.85, W, H * 0.006);
      texto(ctx, (T.redes || "").toUpperCase(), W / 2, H * 0.925, W * 0.9, W * 0.1, A, "#f2f2f2");
    },

    accion(ctx, W, H, T, rnd) {
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, W, H);
      const cx = W * 0.32, cy = H * 0.24;
      for (let i = 0; i < 24; i++) {
        const a = i * Math.PI / 12; ctx.fillStyle = i % 2 ? "#141414" : "#0a0a0a";
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * H * 1.5, cy + Math.sin(a) * H * 1.5); ctx.lineTo(cx + Math.cos(a + Math.PI / 12) * H * 1.5, cy + Math.sin(a + Math.PI / 12) * H * 1.5); ctx.fill();
      }
      brillo(ctx, cx, cy, W * 0.4, "rgba(255,255,255,A)", 0.45);
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = Math.max(1, W * 0.002);
      for (let x = 0; x <= W * 0.62; x += W * 0.03) { ctx.beginPath(); ctx.moveTo(x, H * 0.05); ctx.lineTo(x, H * 0.17); ctx.stroke(); }
      for (let y = H * 0.05; y <= H * 0.17; y += W * 0.03) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W * 0.62, y); ctx.stroke(); }
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, H * 0.045, W * 0.63, H * 0.012);
      ctx.strokeStyle = rgb(AC2, .6); ctx.lineWidth = W * 0.008;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx - W * 0.25 - i * W * 0.03, cy + H * 0.06 + i * H * 0.02); ctx.lineTo(cx - W * 0.13, cy + H * 0.02 + i * H * 0.01); ctx.stroke(); }
      ctx.strokeStyle = "#20140c"; ctx.lineCap = "round"; ctx.lineWidth = W * 0.08;
      ctx.beginPath(); ctx.moveTo(cx + W * 0.25, cy + H * 0.28); ctx.lineTo(cx + W * 0.1, cy + H * 0.06); ctx.stroke();
      balon(ctx, cx, cy, W * 0.12);
      ctx.save(); ctx.translate(W * 0.86, H * 0.46); ctx.rotate(Math.PI / 2);
      const vg = ctx.createLinearGradient(-H * 0.4, 0, H * 0.4, 0); vg.addColorStop(0, AC); vg.addColorStop(1, "#ffffff");
      const px = texto(ctx, T.titulo.toUpperCase(), 0, 0, H * 0.84, W * 0.3, A, vg);
      desgaste(ctx, -H * 0.42, -px / 2, H * 0.84, px, "rgba(0,0,0,.45)", rnd, 200); ctx.restore();
      texto(ctx, (T.sub || "").toUpperCase(), W * 0.05, H * 0.5, W * 0.62, W * 0.045, BC, "#ffffff", "left");
      texto(ctx, (T.fecha || "").toUpperCase(), W * 0.05, H * 0.57, W * 0.62, W * 0.09, BC, AC, "left");
      texto(ctx, (T.hora || "").toUpperCase(), W * 0.05, H * 0.625, W * 0.62, W * 0.05, BC, "#ffffff", "left");
      if (T.vs) {
        ctx.fillStyle = AC; ctx.beginPath(); ctx.moveTo(0, H * 0.66); ctx.lineTo(W * 0.66, H * 0.66); ctx.lineTo(W * 0.71, H * 0.69); ctx.lineTo(W * 0.66, H * 0.72); ctx.lineTo(0, H * 0.72); ctx.fill();
        texto(ctx, T.vs.toUpperCase(), W * 0.05, H * 0.69, W * 0.6, W * 0.055, BC, "#ffffff", "left");
      }
      [T.lugar, T.extra].filter(Boolean).forEach((l, i) => texto(ctx, l.toUpperCase(), W * 0.05, H * (0.77 + i * 0.035), W * 0.62, W * 0.035, BC, "#ffffff", "left"));
      texto(ctx, (T.redes || "").toUpperCase(), W * 0.05, H * 0.9, W * 0.62, W * 0.035, BC, AC2, "left");
      if (T.evento) { caja(ctx, W * 0.66, H * 0.9, W * 0.3, H * 0.05, "#ffffff"); texto(ctx, T.evento.toUpperCase(), W * 0.81, H * 0.925, W * 0.26, W * 0.04, BC, "#000"); }
    }
  };

  // Boceto de un estilo. T: textos de la entrevista
  function dibujar(ctx, W, H, id, T) {
    const f = DIB[id];
    tonos(/^#[0-9a-f]{6}$/i.test(T.c1 || "") ? T.c1 : "#1f3cff", /^#[0-9a-f]{6}$/i.test(T.c2 || "") ? T.c2 : "#ff5b00");
    ctx.save();
    if (!f) {   // «Otro»: un boceto neutro con el título
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, PR3); g.addColorStop(1, AC);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      texto(ctx, T.titulo.toUpperCase(), W / 2, H * 0.5, W * 0.9, W * 0.15, A, "#ffffff");
    } else f(ctx, W, H, T, azar(id.length * 977 + 13));
    ctx.restore();
  }

  window.evEstilos = { LISTA, dibujar, partirVs };
})();
