/* =====================================================================
   Redes Sociales › EVENTOS: cartel de un evento por capas.

   1. Entrevista por secciones (se pliegan al terminarlas). Todas las
      preguntas tienen «✏️ Otro» para escribir lo que se quiera.
      · El cartel: evento y formato.
      · Imagen de fondo  → encargo (prompt) para crearla y subirla.
      · Personaje principal → encargo para crearlo sobre fondo verde y
        subirlo; la app quita ese fondo para usarlo como capa.
      · Escudo y patrocinadores.
   2. Editor de capas: fondo, textos por detrás del personaje, personaje,
      textos por delante, escudo y patrocinadores. Todo se mueve con el
      dedo y cada capa tiene su tamaño, ángulo y opacidad.
   La imagen también se puede generar desde la app con la función de
   Supabase «generar-cartel» si está configurada.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- Formatos ---------- */
  const FORMATOS = {
    story: { w: 1080, h: 1920, ar: "9:16", t: "Story Instagram" },
    post: { w: 1080, h: 1350, ar: "4:5", t: "Post vertical" },
    cuadrado: { w: 1080, h: 1080, ar: "1:1", t: "Post cuadrado" },
    a4: { w: 1654, h: 2339, ar: "3:4", t: "Para imprimir A4/A3" },
    horizontal: { w: 1920, h: 1080, ar: "16:9", t: "Horizontal" }
  };
  const AR_IA = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1, "3:4": 3 / 4, "16:9": 16 / 9 };
  function arParecido(w, h) {
    let mejor = "1:1", dif = Infinity;
    Object.keys(AR_IA).forEach(k => { const d = Math.abs(Math.log(AR_IA[k] / (w / h))); if (d < dif) { dif = d; mejor = k; } });
    return mejor;
  }
  function formato() {
    if (r.formato === "otro") {
      const m = /(\d{3,4})\s*[x×*]\s*(\d{3,4})/i.exec(r.formato_o || "");
      if (m) {
        const w = Math.min(4000, +m[1]), h = Math.min(4000, +m[2]);
        return { w, h, ar: arParecido(w, h), t: `${w}×${h}` };
      }
    }
    return FORMATOS[r.formato] || FORMATOS.story;
  }

  /* ---------- Tipografías (fonts/, licencia OFL) ---------- */
  const FUENTES = {
    impacto: { f: "Anton", w: "400", t: "Anton (impacto)" },
    deportiva: { f: "Barlow Condensed", w: "italic 800", t: "Barlow Condensed cursiva" },
    bebas: { f: "Bebas Neue", w: "400", t: "Bebas Neue" },
    moderna: { f: "Poppins", w: "800", t: "Poppins" },
    elegante: { f: "Playfair Display", w: "800", t: "Playfair Display" },
    brush: { f: "Permanent Marker", w: "400", t: "Permanent Marker" },
    comic: { f: "Bangers", w: "400", t: "Bangers" },
    texto: { f: "Barlow", w: "700", t: "Barlow" }
  };
  const ARCHIVOS_FUENTE = [
    ["Anton", "fonts/anton-latin-400-normal.woff2", {}],
    ["Bebas Neue", "fonts/bebas-neue-latin-400-normal.woff2", {}],
    ["Poppins", "fonts/poppins-latin-800-normal.woff2", { weight: "800" }],
    ["Playfair Display", "fonts/playfair-display-latin-800-normal.woff2", { weight: "800" }],
    ["Permanent Marker", "fonts/permanent-marker-latin-400-normal.woff2", {}],
    ["Bangers", "fonts/bangers-latin-400-normal.woff2", {}]
  ];
  let fuentesListas = null;
  function cargarFuentes() {
    if (fuentesListas) return fuentesListas;
    const extra = ARCHIVOS_FUENTE.map(([fam, url, d]) => {
      try { const ff = new FontFace(fam, `url(${url})`, d); document.fonts.add(ff); return ff.load().catch(() => null); }
      catch (e) { return Promise.resolve(null); }
    });
    const app = ["italic 800 40px 'Barlow Condensed'", "700 40px Barlow"].map(s => document.fonts.load(s).catch(() => null));
    fuentesListas = Promise.all(extra.concat(app));
    return fuentesListas;
  }

  /* ---------- La entrevista ----------
     Cada opción lleva «p»: lo que se añade al encargo (en inglés, que es como mejor
     responden Gemini y ChatGPT). «✏️ Otro» se añade solo a todas las preguntas. */
  const esPersona = () => r.pTipo === "jugadora" || r.pTipo === "equipo";
  const hayFondo = () => r.fTipo && r.fTipo !== "sin";
  const hayPers = () => r.pTipo && r.pTipo !== "ninguno";

  const ESTILOS = [
    { v: "realista", e: "📸", t: "Foto realista", p: "ultra realistic sports photography, sharp focus" },
    { v: "cine", e: "🎬", t: "Cinematográfico", p: "cinematic movie poster look, dramatic colour grading" },
    { v: "anime", e: "🌸", t: "Anime", p: "anime illustration style, clean cel shading" },
    { v: "comic", e: "💬", t: "Cómic", p: "comic book illustration, bold ink lines, halftone dots" },
    { v: "vector", e: "📐", t: "Ilustración plana", p: "flat vector illustration, bold shapes, minimal shading" },
    { v: "acuarela", e: "🖌️", t: "Acuarela", p: "watercolor painting" },
    { v: "3d", e: "🧸", t: "3D de animación", p: "stylized 3D animated film render" },
    { v: "pop", e: "🟡", t: "Pop art", p: "pop art style, vivid flat colours" },
    { v: "retro", e: "📼", t: "Retro años 80", p: "retro 1980s poster style, film grain" }
  ];

  const SECCIONES = [
    { id: "cartel", t: "🗂️ El cartel", preguntas: [
      { id: "evento", q: "Antes de nada, ¿qué evento vamos a anunciar?", nota: "Me ayuda a darle el tono a las imágenes.",
        op: [
          { v: "partido", e: "🏐", t: "Partido especial", p: "a special volleyball match" }, { v: "torneo", e: "🏆", t: "Torneo", p: "a volleyball tournament" },
          { v: "campus", e: "☀️", t: "Campus / clínic", p: "a volleyball summer camp" }, { v: "presentacion", e: "🎉", t: "Presentación de equipos", p: "the club's team presentation" },
          { v: "captacion", e: "📣", t: "Captación", p: "a recruitment campaign for new players" }, { v: "fiesta", e: "🥂", t: "Cena / fiesta", p: "the club's party" },
          { v: "solidario", e: "💙", t: "Evento solidario", p: "a charity volleyball event" }
        ] },
      { id: "formato", q: "¿Dónde se va a ver? Así fijo las medidas.", nota: "En «Otro» escribe las medidas, por ejemplo 1200x628.",
        op: Object.keys(FORMATOS).map(k => ({ v: k, t: `${FORMATOS[k].t} · ${FORMATOS[k].w}×${FORMATOS[k].h}` })) }
    ] },

    { id: "fondo", t: "🌄 Imagen de fondo", preguntas: [
      { id: "fTipo", q: "Empecemos por el fondo. ¿Qué escena ponemos detrás?", nota: "Va sin personas: el personaje lo creamos aparte para poder moverlo.",
        op: [
          { v: "pabellon", t: "Pabellón con gradas llenas", p: "an indoor volleyball arena with crowded stands" },
          { v: "pista", t: "Pista vacía con focos", p: "an empty indoor volleyball court lit by spotlights" },
          { v: "red", t: "Red de vóley en primer plano", p: "a volleyball net in the foreground, court behind" },
          { v: "energia", t: "Explosión de energía", p: "an abstract explosion of light streaks, sparks and particles" },
          { v: "geometrico", t: "Formas geométricas", p: "bold abstract geometric shapes and diagonal stripes" },
          { v: "playa", t: "Playa al atardecer", p: "a beach volleyball court at sunset" },
          { v: "ciudad", t: "Ciudad / calle", p: "an urban street with murals" },
          { v: "humo", t: "Humo de colores", p: "dense coloured smoke" },
          { v: "sin", e: "🎨", t: "Sin imagen: color o degradado" }
        ] },
      { id: "fColor", q: "¿Qué color pinto de fondo?", cuando: () => r.fTipo === "sin", tipo: "color",
        op: [{ v: "club", t: "Degradado azul y naranja" }, { v: "#0b1236", t: "Azul noche" }, { v: "#ff5b00", t: "Naranja club" }, { v: "#0d0d0d", t: "Negro" }, { v: "#f7f7f7", t: "Blanco" }] },
      { id: "fEstilo", q: "¿Con qué estilo?", cuando: hayFondo, op: ESTILOS },
      { id: "fPaleta", q: "¿Qué colores mandan?", cuando: hayFondo,
        op: [{ v: "club", t: "Los del club (azul y naranja)", p: "colour palette: navy blue and vivid orange" },
             { v: "calidos", t: "Cálidos", p: "warm colour palette: reds, oranges and yellows" },
             { v: "frios", t: "Fríos", p: "cool colour palette: blues, cyans and purples" },
             { v: "neon", t: "Neón", p: "neon colour palette with glow" },
             { v: "bn", t: "Blanco y negro", p: "black and white, high contrast" },
             { v: "pastel", t: "Pastel", p: "soft pastel colours" }] },
      { id: "fLuz", q: "¿Y la luz?", cuando: hayFondo,
        op: [{ v: "contraluz", t: "Contraluz dramático", p: "dramatic backlight" }, { v: "focos", t: "Focos de estadio", p: "stadium spotlights from above" },
             { v: "natural", t: "Natural y suave", p: "soft natural light" }, { v: "dorada", t: "Hora dorada", p: "golden hour light" }, { v: "noche", t: "Noche con brillos", p: "night atmosphere with glowing lights" }] },
      { id: "fAmb", q: "¿Algún detalle de ambiente?", cuando: hayFondo,
        op: [{ v: "nada", t: "Nada más, limpio", p: "" }, { v: "desenfoque", t: "Desenfoque de profundidad", p: "strong depth of field blur" },
             { v: "confeti", t: "Confeti", p: "confetti falling" }, { v: "niebla", t: "Neblina", p: "light haze in the air" },
             { v: "balones", t: "Balones volando", p: "a few volleyballs flying in the distance" }, { v: "grano", t: "Grano / textura", p: "subtle film grain texture" }] },
      { id: "fondoImg", tipo: "imagen", capa: "fondo", cuando: hayFondo }
    ] },

    { id: "pers", t: "🙋‍♀️ Personaje principal", preguntas: [
      { id: "pTipo", q: "Ahora el protagonista, que irá en otra capa. ¿Quién es?",
        op: [{ v: "jugadora", e: "🙋‍♀️", t: "Una jugadora" }, { v: "equipo", e: "👯", t: "Varias jugadoras" },
             { v: "balon", e: "🏐", t: "El balón" }, { v: "ninguno", e: "🚫", t: "Sin personaje" }] },
      { id: "equip", tipo: "equip", q: "Vestirá la equipación del club. ¿Cuál?", cuando: esPersona, nota: "Las fotos de la camiseta se adjuntan al encargo. Puedes añadir otra equipación o cambiar sus fotos." },
      { id: "dorsal", tipo: "dorsal", q: "¿Qué dorsal lleva?", cuando: () => r.pTipo === "jugadora" },
      { id: "nJug", q: "¿Cuántas jugadoras?", cuando: () => r.pTipo === "equipo",
        op: [{ v: "2", t: "Dos", p: "two female volleyball players" }, { v: "3", t: "Tres", p: "three female volleyball players" },
             { v: "6", t: "Un seis completo", p: "a team of six female volleyball players" }] },
      { id: "edad", q: "¿Qué edad aparenta?", cuando: esPersona,
        op: [{ v: "alevin", t: "Alevín (10-11)", p: "about 10 years old" }, { v: "infantil", t: "Infantil (12-13)", p: "about 13 years old" },
             { v: "cadete", t: "Cadete (14-15)", p: "about 15 years old" }, { v: "juvenil", t: "Juvenil (16-18)", p: "about 17 years old" },
             { v: "senior", t: "Sénior (adulta)", p: "adult, around 24 years old" }] },
      { id: "rasgos", q: "¿Qué rasgos tiene?", cuando: esPersona,
        op: [{ v: "mediterranea", t: "Mediterránea", p: "Mediterranean (Spanish) features, olive skin" }, { v: "europea", t: "Europea clara", p: "fair-skinned European features" },
             { v: "latina", t: "Latina", p: "Latina features" }, { v: "negra", t: "Negra", p: "Black, dark skin" },
             { v: "asiatica", t: "Asiática", p: "East Asian features" }, { v: "arabe", t: "Árabe", p: "North African features" },
             { v: "variado", t: "Variado", p: "a diverse mix of ethnicities" }] },
      { id: "complexion", q: "¿Complexión?", cuando: esPersona,
        op: [{ v: "atletica", t: "Atlética", p: "athletic build" }, { v: "alta", t: "Alta y estilizada", p: "tall and slender build" },
             { v: "fuerte", t: "Potente", p: "strong, muscular build" }, { v: "normal", t: "Normal", p: "average build" }] },
      { id: "peloColor", q: "¿Color de pelo?", cuando: esPersona,
        op: [{ v: "castano", t: "Castaño", p: "brown hair" }, { v: "negro", t: "Negro", p: "black hair" }, { v: "rubio", t: "Rubio", p: "blonde hair" },
             { v: "pelirrojo", t: "Pelirrojo", p: "red hair" }, { v: "variado", t: "Variado", p: "different hair colours" }] },
      { id: "peinado", q: "¿Peinado?", cuando: esPersona,
        op: [{ v: "coleta", t: "Coleta alta", p: "a high ponytail" }, { v: "trenza", t: "Trenza", p: "a braid" }, { v: "trenzas", t: "Dos trenzas", p: "double dutch braids" },
             { v: "mono", t: "Moño", p: "a bun" }, { v: "corto", t: "Corto", p: "short hair" }, { v: "rizado", t: "Rizado con cinta", p: "curly hair with a headband" }] },
      { id: "pose", q: "¿Qué está haciendo?", cuando: () => r.pTipo === "jugadora", nota: "La pose marca toda la energía del cartel.",
        op: [{ v: "remate", e: "💥", t: "Rematando en el aire", p: "jumping high and spiking the ball, arm fully extended" },
             { v: "saque", e: "🚀", t: "Saque en salto", p: "doing a jump serve, ball above her" },
             { v: "recepcion", e: "🙌", t: "Recepción", p: "receiving the ball with a forearm pass, low stance" },
             { v: "colocacion", e: "☝️", t: "Colocando", p: "setting the ball with her fingertips above her forehead" },
             { v: "bloqueo", e: "🧱", t: "Bloqueando", p: "blocking with both hands up" },
             { v: "plancha", e: "🤸", t: "Plancha", p: "diving to save the ball, horizontal in the air" },
             { v: "celebra", e: "🔥", t: "Celebrando", p: "celebrating a point, fist pumping and shouting" },
             { v: "posado", e: "😎", t: "Posado con balón", p: "standing confidently holding a volleyball on her hip, looking at the camera" }] },
      { id: "poseEq", q: "¿Cómo las colocamos?", cuando: () => r.pTipo === "equipo",
        op: [{ v: "pina", t: "Haciendo piña", p: "in a team huddle, arms around each other" }, { v: "celebran", t: "Celebrando juntas", p: "jumping and celebrating together" },
             { v: "v", t: "Posado en V", p: "posing in a V formation, arms crossed" }, { v: "accion", t: "En plena jugada", p: "in the middle of a play, one spiking and the others covering" }] },
      { id: "balon", q: "¿Cómo es el balón?", cuando: () => r.pTipo === "balon",
        op: [{ v: "fuego", e: "🔥", t: "En llamas", p: "a volleyball on fire" }, { v: "rayos", e: "⚡", t: "Con rayos", p: "a volleyball surrounded by electric lightning" },
             { v: "pintura", e: "🎨", t: "Salpicando pintura", p: "a volleyball bursting through paint splashes" }, { v: "limpio", e: "🏐", t: "Limpio y brillante", p: "a clean shiny volleyball" }] },
      { id: "plano", q: "¿Qué encuadre?", cuando: esPersona, nota: "Cuerpo entero luce la acción; plano medio, la cara y el dorsal.",
        op: [{ v: "entero", t: "Cuerpo entero", p: "full body, head to feet" }, { v: "medio", t: "Plano medio", p: "medium shot from the waist up" },
             { v: "contrapicado", t: "Contrapicado heroico", p: "full body seen from a low heroic angle" }] },
      { id: "expresion", q: "¿Qué transmite su cara?", cuando: esPersona,
        op: [{ v: "concentrada", t: "Concentrada", p: "focused, determined expression" }, { v: "desafiante", t: "Desafiante", p: "fierce look" },
             { v: "alegre", t: "Alegre", p: "big joyful smile" }, { v: "grito", t: "Grito de euforia", p: "shouting with euphoria" }] },
      { id: "pEstilo", q: "¿Con qué estilo lo dibujamos?", cuando: hayPers,
        op: [{ v: "igual", e: "🔗", t: "El mismo que el fondo" }].concat(ESTILOS) },
      { id: "persImg", tipo: "imagen", capa: "pers", cuando: hayPers }
    ] },

    { id: "logos", t: "🛡️ Escudo y patrocinadores", preguntas: [
      { id: "patros", tipo: "patros", q: "El escudo del club va siempre. ¿Qué patrocinadores salen? Tócalos por orden de importancia: el primero sale más grande.", nota: "Después los podrás mover y cambiar de tamaño." }
    ] }
  ];
  const TODAS = SECCIONES.reduce((a, s) => a.concat(s.preguntas), []);

  /* ---------- Estado ---------- */
  let r = {};                       // respuestas (id → valor; «otro» guarda el texto en id_o)
  let abiertas = {};                // secciones desplegadas a mano
  const img = { fondo: null, pers: null, persOrig: null };
  let quitarFondo = { activo: true, tol: 70, color: null };
  let E = null;                     // capas del editor
  let sel = "fondo";
  let cajas = [];                   // zonas de cada capa en la vista previa (para tocarlas)
  let equipaciones = [{ id: "primera", nombre: "Primera equipación", imagenes: [] }];
  let patrocinadores = [];
  const imgs = {}, imgsListas = {};
  let capa = null;

  function capasIniciales() {
    return {
      fondo: { z: 1, ox: 0, oy: 0, op: 1 },
      pers: { x: 0.5, y: 0.6, s: 0.72, rot: 0, op: 1, flip: false },
      logo: { x: 0.5, y: 0.09, s: 0.2, rot: 0, op: 1 },
      patros: { x: 0.74, y: 0.93, s: 1, rot: 0, op: 1, placa: true },
      textos: []
    };
  }

  function cargarImg(url) {
    if (!imgs[url]) imgs[url] = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; });
    return imgs[url];
  }
  function imgLista(url) {
    if (imgsListas[url]) return imgsListas[url];
    cargarImg(url).then(i => { if (i) { imgsListas[url] = i; pintar(); } });
    return null;
  }
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Equipaciones ----------
     Las de serie están en Equipacion/ (repo). Si alguien añade o cambia alguna desde la
     app, la lista completa se guarda en Supabase: Eventos/equipaciones.json, con las fotos
     nuevas en Eventos/equipacion/. Cada imagen guarda su ruta completa. */
  const RUTA_EQ = "Eventos/equipaciones.json";
  function datos() {
    if (!window.nvaStory || !window.nvaStory.gh) return null;
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem("NVA_GH_SETTINGS") || "{}"); } catch (e) { /* nada */ }
    return cfg.user ? window.nvaStory.gh(cfg) : null;
  }
  const urlsEq = {};
  // URL que se puede pintar: las de serie, directas; las subidas, desde Supabase
  function urlEq(ruta) {
    if (!urlsEq[ruta]) {
      urlsEq[ruta] = ruta.startsWith("Equipacion/") ? Promise.resolve(ruta)
        : (async () => { const g = datos(); return g ? URL.createObjectURL(await g.blob(ruta)) : ""; })().catch(() => "");
    }
    return urlsEq[ruta];
  }
  async function blobEq(ruta) {
    const u = await urlEq(ruta);
    return u ? (await fetch(u)).blob() : null;
  }
  async function cargarEquipaciones() {
    try {
      const g = datos();
      // Si no hay sesión, el puente de datos espera; no se bloquea la ventana por eso
      const j = g && await Promise.race([g.json(RUTA_EQ), new Promise(ok => setTimeout(() => ok(null), 6000))]);
      if (j && Array.isArray(j.equipaciones) && j.equipaciones.length) { equipaciones = j.equipaciones; return; }
    } catch (e) { /* sin lista propia: las de serie */ }
    try {
      const j = await (await fetch("Equipacion/equipacion.json", { cache: "no-cache" })).json();
      if (Array.isArray(j.equipaciones) && j.equipaciones.length) {
        equipaciones = j.equipaciones.map(e => Object.assign({}, e, { imagenes: (e.imagenes || []).map(a => "Equipacion/" + a) }));
      }
    } catch (e) { /* sin catálogo: equipación por defecto */ }
  }
  async function guardarEquipaciones() {
    const g = datos();
    if (!g) throw new Error("No hay conexión con los datos.");
    await g.putJson(RUTA_EQ, { equipaciones }, "Equipaciones para los carteles de eventos");
  }
  // Las fotos nuevas se guardan a 512 px como máximo (lo que admite la IA)
  async function reducirEq(file) {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("No se puede abrir la imagen")); i.src = URL.createObjectURL(file); });
    const k = Math.min(1, 512 / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    const cx = cv.getContext("2d");
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    return new Promise(ok => cv.toBlob(ok, "image/jpeg", 0.9));
  }
  async function subirFotosEq(files) {
    const g = datos();
    if (!g) throw new Error("No hay conexión con los datos.");
    const rutas = [], base = Date.now().toString(36);
    for (let i = 0; i < Math.min(files.length, 3); i++) {
      const ruta = `Eventos/equipacion/${base}-${i + 1}.jpg`;
      await g.putBlob(ruta, await reducirEq(files[i]), "Foto de equipación");
      rutas.push(ruta);
    }
    return rutas;
  }
  function elegirFotos() {
    return new Promise(ok => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
      inp.onchange = () => ok(Array.from(inp.files || []));
      inp.click();
    });
  }
  async function accionEq(tipo, id) {
    const est = capa && capa.querySelector("#evEqEstado");
    const avisar = t => { if (est) est.textContent = t; };
    try {
      if (tipo === "nueva") {
        const nombre = (prompt("Nombre de la equipación (por ejemplo «Camiseta naranja»):") || "").trim();
        if (!nombre) return;
        alert("Ahora elige de 1 a 3 fotos de la camiseta (delante, detrás…).");
        const files = await elegirFotos();
        if (!files.length) return;
        avisar("Guardando las fotos…");
        const imagenes = await subirFotosEq(files);
        const nueva = { id: "eq" + Date.now().toString(36), nombre, descripcion: "", imagenes };
        equipaciones.push(nueva);
        await guardarEquipaciones();
        r.equip = nueva.id;
        avisar("✅ Equipación añadida.");
      } else if (tipo === "fotos") {
        const eq = equipaciones.find(e => e.id === id);
        if (!eq) return;
        const files = await elegirFotos();
        if (!files.length) return;
        avisar("Guardando las fotos…");
        eq.imagenes = await subirFotosEq(files);
        eq.descripcion = "";   // la descripción antigua ya no vale para las fotos nuevas
        await guardarEquipaciones();
        avisar("✅ Fotos cambiadas.");
      } else if (tipo === "nombre") {
        const eq = equipaciones.find(e => e.id === id);
        if (!eq) return;
        const nombre = (prompt("Nuevo nombre:", eq.nombre) || "").trim();
        if (!nombre) return;
        eq.nombre = nombre;
        await guardarEquipaciones();
      } else if (tipo === "quitar") {
        const eq = equipaciones.find(e => e.id === id);
        if (!eq || equipaciones.length < 2) { alert("Tiene que quedar al menos una equipación."); return; }
        if (!confirm(`¿Quitar «${eq.nombre}» de la lista?`)) return;
        equipaciones = equipaciones.filter(e => e.id !== id);
        await guardarEquipaciones();
        if (r.equip === id) delete r.equip;
      }
      render();
    } catch (e) {
      avisar("❌ " + (e.message || e) + (/permiso|403/i.test(e.message || "") ? " (hace falta «Editar» en Eventos)" : ""));
    }
  }


  async function cargarCatalogos() {
    await cargarEquipaciones();
    try {
      const j = await (await fetch("Patrocinadores/patrocinadores.json", { cache: "no-cache" })).json();
      patrocinadores = (j.equipos || []).map(x => ({ archivo: x.archivo, nombre: x.nombre }))
        .concat((j.comunes || []).map((a, i) => ({ archivo: a, nombre: "Común " + (i + 1) })));
    } catch (e) { patrocinadores = []; }
  }

  /* ---------- Estilos de la ventana ---------- */
  function ponerCss() {
    if (document.getElementById("evCss")) return;
    const s = document.createElement("style");
    s.id = "evCss";
    s.textContent = `
      .ev-box { max-width: 560px !important; width: 100%; padding: 0 !important; display: flex; flex-direction: column; overflow: hidden !important; max-height: calc(100dvh - 24px) !important; }
      .ev-cab { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--borde, rgba(255,255,255,.12)); }
      .ev-cab b { flex: 1; font-family: var(--font-display); font-size: 1.1rem; color: #fff; }
      .ev-prev { flex: none; display: flex; justify-content: center; padding: 8px; background: rgba(0,0,0,.25); }
      .ev-prev canvas { max-height: 36dvh; max-width: 100%; border-radius: 8px; box-shadow: 0 6px 22px rgba(0,0,0,.45); touch-action: none; }
      .ev-cuerpo { flex: 1; overflow-y: auto; padding: 10px 14px 18px; display: flex; flex-direction: column; gap: 10px; }
      .ev-sec { flex: none; border: 1px solid var(--borde, rgba(255,255,255,.12)); border-radius: 14px; overflow: hidden; }
      .ev-sec-cab { width: 100%; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: rgba(255,255,255,.04); border: 0; color: #fff; font: inherit; font-weight: 800; cursor: pointer; text-align: left; }
      .ev-sec-cab small { display: block; font-weight: 400; color: var(--txt-2, #9fb0d8); font-size: .74rem; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ev-sec-cab span.t { flex: 1; min-width: 0; }
      .ev-sec-cuerpo { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 12px; }
      .ev-q { display: flex; flex-direction: column; gap: 8px; animation: evEntra .28s ease; }
      @keyframes evEntra { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      .ev-burbuja { align-self: flex-start; max-width: 94%; background: rgba(92,132,255,.14); border: 1px solid rgba(92,132,255,.3); border-radius: 4px 14px 14px 14px; padding: 8px 11px; color: var(--txt-1, #e9eefa); font-size: .9rem; line-height: 1.35; }
      .ev-burbuja small { display: block; color: var(--txt-2, #9fb0d8); font-size: .76rem; margin-top: 3px; }
      .ev-ops { display: flex; flex-wrap: wrap; gap: 6px; }
      .ev-op { border: 1px solid var(--tiza-borde, rgba(233,238,250,.16)); background: var(--tiza-fondo, rgba(233,238,250,.07)); color: var(--txt-1, #e9eefa); border-radius: 999px; padding: 7px 12px; font: inherit; font-size: .82rem; cursor: pointer; }
      .ev-op.sel { background: rgba(255,91,0,.22); border-color: #ff7a2e; color: #fff; font-weight: 700; }
      .ev-fila { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .ev-fila input[type=text], .ev-fila input[type=number], .ev-fila select, .ev-fila textarea { flex: 1; min-width: 0; }
      .ev-mini { border: 1px solid var(--tiza-borde, rgba(233,238,250,.16)); background: var(--tiza-fondo, rgba(233,238,250,.07)); color: var(--txt-1, #e9eefa); border-radius: 8px; min-width: 30px; height: 30px; cursor: pointer; font: inherit; padding: 0 8px; }
      .ev-mini.sel { border-color: #ff7a2e; background: rgba(255,91,0,.22); }
      .ev-eqs { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
      .ev-eq { border: 2px solid var(--tiza-borde, rgba(233,238,250,.16)); border-radius: 12px; padding: 6px; display: flex; flex-direction: column; gap: 4px; background: var(--tiza-fondo, rgba(233,238,250,.07)); }
      .ev-eq.sel { border-color: #ff7a2e; background: rgba(255,91,0,.14); }
      .ev-eq-img { display: flex; gap: 2px; background: #fff; border: 0; border-radius: 8px; height: 92px; padding: 4px; cursor: pointer; align-items: center; justify-content: center; }
      .ev-eq-img img { flex: 1; min-width: 0; max-height: 100%; object-fit: contain; }
      .ev-eq-img span { color: #555; font-size: .8rem; }
      .ev-eq-nom { font-size: .82rem; font-weight: 700; text-align: center; }
      .ev-eq-acc { display: flex; gap: 4px; justify-content: center; }
      .ev-patro { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 6px; }
      .ev-patro button { position: relative; background: #fff; border: 2px solid transparent; border-radius: 10px; padding: 6px; height: 56px; cursor: pointer; }
      .ev-patro button img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: auto; }
      .ev-patro button.sel { border-color: #ff7a2e; }
      .ev-patro button i { position: absolute; top: -7px; left: -7px; background: #ff5b00; color: #fff; font-style: normal; font-weight: 800; font-size: .72rem; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; }
      .ev-orden { display: flex; flex-direction: column; gap: 4px; }
      .ev-orden div { display: flex; align-items: center; gap: 6px; font-size: .82rem; }
      .ev-orden div span { flex: 1; }
      .ev-prompt { font-size: .74rem; color: var(--txt-1, #e9eefa); white-space: pre-wrap; background: rgba(0,0,0,.25); border-radius: 8px; padding: 8px; max-height: 170px; overflow: auto; user-select: text; -webkit-user-select: text; }
      .ev-estado { font-size: .8rem; color: var(--txt-2, #9fb0d8); }
      .ev-ed { flex: none; border: 1px solid rgba(255,122,46,.45); border-radius: 14px; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
      .ev-ed h4 { margin: 0; font-family: var(--font-display); color: #fff; font-size: 1rem; }
      .ev-capas { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
      .ev-capas .ev-mini { white-space: nowrap; flex: none; }
      .ev-ctl { display: grid; grid-template-columns: 78px 1fr 44px; gap: 6px 8px; align-items: center; font-size: .8rem; }
      .ev-ctl output { text-align: right; color: var(--txt-2, #9fb0d8); font-size: .74rem; }
      .ev-ctl input[type=range] { width: 100%; }
      .ev-ed textarea { width: 100%; min-height: 56px; resize: vertical; font: inherit; border-radius: 10px; padding: 8px; }
    `;
    document.head.appendChild(s);
  }

  /* ---------- Abrir / cerrar ---------- */
  async function abrir() {
    ponerCss();
    cargarFuentes().then(() => pintar());
    r = {}; abiertas = {}; img.fondo = img.pers = img.persOrig = null; E = capasIniciales(); sel = "fondo";
    quitarFondo = { activo: true, tol: 70, color: null };
    capa = document.createElement("div");
    capa.className = "cp-modal";
    capa.setAttribute("role", "dialog"); capa.setAttribute("aria-modal", "true"); capa.setAttribute("aria-label", "Crear cartel de evento");
    capa.style.padding = "12px";
    capa.innerHTML = `
      <div class="cp-modal-box ev-box">
        <div class="ev-cab"><b>🎨 Cartel de evento</b>
          <button type="button" class="btn-close-modal" data-cerrar aria-label="Cerrar">✕</button></div>
        <div class="ev-prev"><canvas id="evLienzo" width="270" height="480" aria-label="Vista previa del cartel: toca una capa para elegirla y arrástrala para moverla"></canvas></div>
        <div class="ev-cuerpo" id="evCuerpo"><div class="ev-estado">Cargando…</div></div>
      </div>`;
    document.body.appendChild(capa);
    capa.querySelector("[data-cerrar]").onclick = cerrar;
    capa.addEventListener("click", e => { if (e.target === capa) cerrar(); });
    tocarLienzo(capa.querySelector("#evLienzo"));
    await cargarCatalogos();
    render(true);
  }
  function cerrar() {
    if (capa && (img.fondo || img.pers || E.textos.length) && !confirm("¿Cerrar el cartel? Se perderá lo que no hayas descargado.")) return;
    if (capa) capa.remove();
    capa = null;
  }

  /* ---------- Respuestas ---------- */
  const visible = p => !p.cuando || p.cuando();
  function contestada(p) {
    if (p.tipo === "imagen") return !!img[p.capa] || r[p.id] === "omitir";
    if (p.tipo === "patros") return r.patros_ok === true;
    if (r[p.id] === undefined || r[p.id] === "") return false;
    if (r[p.id] === "otro") return !!(r[p.id + "_o"] || "").trim();
    return true;
  }
  const completa = s => s.preguntas.filter(visible).every(contestada);
  function opcionesDe(p) { return (p.op || []).concat([{ v: "otro", e: "✏️", t: "Otro" }]); }
  // Texto elegido (para el resumen de la sección)
  function etiqueta(p) {
    if (p.tipo === "imagen") return img[p.capa] ? "imagen ✓" : "sin imagen";
    if (p.tipo === "patros") return (r.patros || []).length ? `${r.patros.length} patrocinador${r.patros.length > 1 ? "es" : ""}` : "sin patrocinadores";
    if (p.tipo === "equip") { if (r.equip === "otro") return r.equip_o; const e = equipaciones.find(x => x.id === r.equip); return e ? e.nombre : ""; }
    if (p.tipo === "dorsal") return "dorsal " + (r.dorsal === "otro" ? r.dorsal_o : r.dorsal);
    if (r[p.id] === "otro") return r[p.id + "_o"];
    const o = (p.op || []).find(x => x.v === r[p.id]);
    return o ? o.t : "";
  }
  // Parte del encargo de una respuesta («Otro» → lo escrito)
  function pr(id) {
    if (r[id] === "otro") return (r[id + "_o"] || "").trim();
    const p = TODAS.find(x => x.id === id), o = p && (p.op || []).find(x => x.v === r[id]);
    return (o && o.p) || "";
  }

  /* ---------- Pintar la entrevista ---------- */
  function render(primera) {
    const cuerpo = capa && capa.querySelector("#evCuerpo");
    if (!cuerpo) return;
    const scrollAntes = cuerpo.scrollTop;
    let html = "", actual = null;
    for (const s of SECCIONES) {
      const hecha = completa(s);
      if (!hecha && !actual) actual = s;
      if (!hecha && actual !== s) break;
      const abierta = !hecha || !!abiertas[s.id];
      const resumen = hecha ? s.preguntas.filter(visible).map(etiqueta).filter(Boolean).join(" · ") : "";
      html += `<div class="ev-sec"><button type="button" class="ev-sec-cab" data-sec="${s.id}" aria-expanded="${abierta}">
          <span class="t">${hecha ? "✓ " : ""}${esc(s.t)}${resumen ? `<small>${esc(resumen)}</small>` : ""}</span><span>${abierta ? "▾" : "▸"}</span></button>`;
      if (abierta) {
        html += `<div class="ev-sec-cuerpo">`;
        for (const p of s.preguntas.filter(visible)) {
          html += `<div class="ev-q" data-q="${p.id}">${preguntaHtml(p)}</div>`;
          if (!contestada(p)) break;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    if (!actual) html += editorHtml();
    cuerpo.innerHTML = html;
    enlazar(cuerpo);
    if (primera) cuerpo.scrollTop = 0;
    else if (render.saltar) { render.saltar = false; const q = cuerpo.querySelectorAll(".ev-q, .ev-ed"); const ult = q[q.length - 1]; if (ult) ult.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    else cuerpo.scrollTop = scrollAntes;
    pintar();
  }

  function otroHtml(id, ph) {
    if (r[id] !== "otro") return "";
    return `<div class="ev-fila"><input type="text" maxlength="200" placeholder="${esc(ph || "Escríbelo a tu manera")}" data-otro="${id}" value="${esc(r[id + "_o"] || "")}">
      <button type="button" class="ev-mini" data-otrook="${id}">✓</button></div>`;
  }

  function preguntaHtml(p) {
    if (p.tipo === "imagen") return imagenHtml(p);
    let h = `<div class="ev-burbuja">${esc(p.q)}${p.nota ? `<small>${esc(p.nota)}</small>` : ""}</div>`;
    const tipo = p.tipo || "chips";
    if (tipo === "chips" || tipo === "color") {
      h += `<div class="ev-ops">` + opcionesDe(p).map(o =>
        `<button type="button" class="ev-op${r[p.id] === o.v ? " sel" : ""}" data-op="${p.id}" data-v="${esc(o.v)}">${o.e ? o.e + " " : ""}${esc(o.t)}</button>`).join("") + `</div>`;
      if (tipo === "color" && r[p.id] === "otro") {
        h += `<div class="ev-fila">Elige el color: <input type="color" data-colotro="${p.id}" value="${esc(/^#/.test(r[p.id + "_o"] || "") ? r[p.id + "_o"] : "#1f3cff")}"></div>`;
      } else h += otroHtml(p.id, p.id === "formato" ? "Medidas, por ejemplo 1200x628" : "");
    } else if (tipo === "dorsal") {
      h += `<div class="ev-ops">` + ["1", "3", "5", "7", "9", "10", "11", "14"].map(n =>
        `<button type="button" class="ev-op${r.dorsal === n ? " sel" : ""}" data-op="dorsal" data-v="${n}">${n}</button>`).join("") +
        `<button type="button" class="ev-op${r.dorsal === "otro" ? " sel" : ""}" data-op="dorsal" data-v="otro">✏️ Otro</button></div>` + otroHtml("dorsal", "Número del dorsal");
    } else if (tipo === "equip") {
      h += `<div class="ev-eqs">` + equipaciones.map(e => `<div class="ev-eq${r.equip === e.id ? " sel" : ""}">
          <button type="button" class="ev-eq-img" data-op="equip" data-v="${esc(e.id)}" aria-label="${esc(e.nombre)}">
            ${(e.imagenes || []).length ? (e.imagenes || []).slice(0, 2).map(ru => `<img data-eqimg="${esc(ru)}" alt="">`).join("") : `<span>Sin fotos</span>`}
          </button>
          <div class="ev-eq-nom">${esc(e.nombre)}</div>
          <div class="ev-eq-acc">
            <button type="button" class="ev-mini" data-eqacc="nombre" data-id="${esc(e.id)}" title="Cambiar nombre" aria-label="Cambiar nombre">✏️</button>
            <button type="button" class="ev-mini" data-eqacc="fotos" data-id="${esc(e.id)}" title="Cambiar fotos" aria-label="Cambiar fotos">📷</button>
            <button type="button" class="ev-mini" data-eqacc="quitar" data-id="${esc(e.id)}" title="Quitar" aria-label="Quitar">🗑️</button>
          </div></div>`).join("") + `</div>
        <div class="ev-fila"><button type="button" class="ev-op" data-eqacc="nueva">➕ Añadir equipación</button>
          <button type="button" class="ev-op${r.equip === "otro" ? " sel" : ""}" data-op="equip" data-v="otro">✏️ Otra (descríbela)</button>
          <span class="ev-estado" id="evEqEstado"></span></div>` + otroHtml("equip", "Describe la equipación");
    } else if (tipo === "patros") {
      const selP = r.patros || (r.patros = []);
      h += `<div class="ev-patro">` + patrocinadores.map(pt => {
        const n = selP.indexOf(pt.archivo);
        return `<button type="button" class="${n >= 0 ? "sel" : ""}" data-patro="${esc(pt.archivo)}" title="${esc(pt.nombre)}" aria-label="${esc(pt.nombre)}">${n >= 0 ? `<i>${n + 1}</i>` : ""}<img src="Patrocinadores/${esc(pt.archivo)}" alt=""></button>`;
      }).join("") + `</div>`;
      h += ordenPatrosHtml();
      if (!r.patros_ok) h += `<div class="ev-fila"><button type="button" class="ev-op" data-patrook>${selP.length ? "✓ Estos" : "Sin patrocinadores"}</button></div>`;
    }
    return h;
  }
  function ordenPatrosHtml() {
    const selP = r.patros || [];
    if (selP.length < 2) return "";
    return `<div class="ev-orden">` + selP.map((a, i) => `<div><b>${i + 1}.</b><span>${esc((patrocinadores.find(p => p.archivo === a) || {}).nombre || a)}</span>
      <button type="button" class="ev-mini" data-sube="${i}" ${i === 0 ? "disabled" : ""} aria-label="Subir">▲</button>
      <button type="button" class="ev-mini" data-baja="${i}" ${i === selP.length - 1 ? "disabled" : ""} aria-label="Bajar">▼</button></div>`).join("") + `</div>`;
  }

  // Paso «imagen» de una sección: encargo para copiar, fotos de la camiseta y subir la imagen
  function imagenHtml(p) {
    const esFondo = p.capa === "fondo";
    const txt = esFondo ? promptFondo() : promptPersonaje();
    const eq = equipaciones.find(e => e.id === r.equip) || {};
    const fotosEq = !esFondo && esPersona() && r.equip !== "otro" && (eq.imagenes || []).length;
    const tiene = !!img[p.capa];
    let h = `<div class="ev-burbuja">${esFondo
      ? "Este es el encargo para la imagen de fondo. Cópialo, pégalo en Gemini o ChatGPT y sube aquí la imagen que te dé."
      : "Y este es el del personaje. Lo pido sobre fondo verde liso para que la app lo recorte y quede como capa." + (fotosEq ? " Adjunta también las fotos de la camiseta." : "")}
      <small>Si algo no te convence, cambia la respuesta arriba y el encargo se actualiza.</small></div>
      <div class="ev-prompt" data-prompt="${p.capa}">${esc(txt)}</div>
      <div class="ev-fila">
        <button type="button" class="btn-pdf-mode2" style="flex:1" data-copiar="${p.capa}">📋 Copiar el encargo</button>
        ${fotosEq ? `<button type="button" class="btn-pdf-mode2" style="flex:1" data-fotoseq>👕 Fotos de la camiseta</button>` : ""}
      </div>
      <label class="btn-save-session" style="--c: var(--c-azul); display:flex; align-items:center; justify-content:center; cursor:pointer;">📥 ${tiene ? "Cambiar la imagen" : (esFondo ? "Subir la imagen de fondo" : "Subir la imagen del personaje")}<input type="file" accept="image/*" data-subir="${p.capa}" hidden></label>
      <div class="ev-fila">
        <button type="button" class="ev-op" data-generar="${p.capa}" style="flex:1">✨ Generarla desde la app</button>
        ${!tiene && r[p.id] !== "omitir" ? `<button type="button" class="ev-op" data-omitir="${p.id}" style="flex:1">La subo luego</button>` : ""}
      </div>
      <div class="ev-estado" data-estado="${p.capa}"></div>`;
    if (!esFondo && tiene) {
      h += `<div class="ev-fila" style="font-size:.82rem"><label><input type="checkbox" data-qf ${quitarFondo.activo ? "checked" : ""}> Quitar el fondo de color</label></div>
        <label class="ev-fila" style="font-size:.8rem">Tolerancia <input type="range" data-qftol min="20" max="160" step="1" value="${quitarFondo.tol}" style="flex:1"></label>`;
    }
    return h;
  }

  /* ---------- Los encargos ---------- */
  function orientacion(F) { return F.w > F.h ? "horizontal" : F.w < F.h ? "vertical" : "square"; }
  function limpiar(t) {
    return t.replace(/\s+,/g, ",").replace(/,\s*,+/g, ",").replace(/\.\s*\./g, ".").replace(/\s+\./g, ".").replace(/ {2,}/g, " ").trim()
      .replace(/(^|[.!?]\s+|\n)([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());   // cada frase con mayúscula
  }
  const estiloFondo = () => pr("fEstilo") || "high quality sports artwork";
  function promptFondo() {
    const F = formato();
    const ev = pr("evento");
    const partes = [
      `Create a ${orientacion(F)} image with ${F.ar} aspect ratio (${F.w}x${F.h} px).`,
      `${estiloFondo()}. Background artwork for a poster${ev ? ` announcing ${ev}` : ""} of a volleyball club: ${pr("fTipo")}. ${pr("fPaleta")}. ${pr("fLuz")}. ${pr("fAmb")}.`,
      "This is ONLY the background layer: no people, no players, no text, no letters, no numbers, no logos, no watermarks.",
      "Keep the central area open with depth (a player will be placed in front later) and leave calmer, slightly darker areas near the top and bottom for titles."
    ];
    return limpiar(partes.join("\n\n"));
  }
  function promptPersonaje() {
    const F = formato();
    const estilo = r.pEstilo === "igual" || !r.pEstilo ? estiloFondo() : pr("pEstilo");
    const vertical = r.pTipo !== "equipo" || F.h >= F.w;
    const partes = [`Create a ${vertical ? "vertical image with 3:4" : "horizontal image with 4:3"} aspect ratio.`];
    if (r.pTipo === "jugadora") {
      partes.push(`${estilo}. A female volleyball player, ${pr("edad")}, ${pr("rasgos")}, ${pr("complexion")}, ${pr("peloColor")} in ${pr("peinado")}, ${pr("pose")}. ${pr("plano")}, ${pr("expresion")}.`);
    } else if (r.pTipo === "equipo") {
      partes.push(`${estilo}. ${pr("nJug")}, ${pr("edad")}, ${pr("rasgos")}, ${pr("complexion")}, ${pr("peloColor")}, ${pr("peinado")}, ${pr("poseEq")}. ${pr("plano")}, ${pr("expresion")}.`);
    } else if (r.pTipo === "balon") {
      partes.push(`${estilo}. ${pr("balon")}, a volleyball with blue, yellow and white panels.`);
    } else if (r.pTipo === "otro") {
      partes.push(`${estilo}. ${pr("pTipo")}.`);
    }
    if (esPersona()) {
      const n = r.pTipo === "jugadora" ? `the shirt number ${r.dorsal === "otro" ? r.dorsal_o : r.dorsal || ""}` : "different shirt numbers";
      if (r.equip === "otro") partes.push(`Kit: ${r.equip_o}, with ${n}, knee pads and indoor volleyball shoes.`);
      else {
        const eq = equipaciones.find(e => e.id === r.equip) || {};
        partes.push(`Use the attached photos of our volleyball jersey (front and back) as reference: ${r.pTipo === "equipo" ? "every player" : "the player"} must wear EXACTLY that kit (same colours, cut, stripes and details), with ${n} and no player name. Knee pads and indoor volleyball shoes.${eq.descripcion ? ` Kit description: ${eq.descripcion}.` : ""}`);
      }
    }
    const luz = hayFondo() ? pr("fLuz") : "";
    if (luz) partes.push(`Light the subject with ${luz}, so it matches a background of ${pr("fTipo")}.`);
    partes.push("IMPORTANT: the subject is isolated on a flat, solid, pure green chroma key background (#00FF00), evenly lit, with no shadows, no floor and no scenery. The whole subject fits inside the frame with some margin, sharp clean edges, no green reflections on the subject. No text, no logos, no watermarks" + (r.pTipo === "jugadora" ? " (only the shirt number)." : "."));
    return limpiar(partes.join("\n\n"));
  }

  /* ---------- Quitar el fondo verde (o de un color liso) del personaje ---------- */
  function procesarPersonaje() {
    const o = img.persOrig;
    if (!o) { img.pers = null; return; }
    const k = Math.min(1, 1600 / Math.max(o.width, o.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(o.width * k); cv.height = Math.round(o.height * k);
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(o, 0, 0, cv.width, cv.height);
    if (!quitarFondo.activo) { img.pers = cv; return; }
    const d = cx.getImageData(0, 0, cv.width, cv.height), px = d.data, W = cv.width, H = cv.height;
    // ¿Ya trae transparencia? Entonces no se toca
    const esquinas = [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]].map(([x, y]) => (y * W + x) * 4);
    if (esquinas.some(i => px[i + 3] < 200)) { img.pers = cv; return; }
    const col = [0, 1, 2].map(c => esquinas.reduce((s, i) => s + px[i + c], 0) / 4);
    quitarFondo.color = col;
    const verde = col[1] > col[0] + 40 && col[1] > col[2] + 40;
    const t1 = quitarFondo.tol, t2 = t1 * 1.6;
    for (let i = 0; i < px.length; i += 4) {
      const dr = px[i] - col[0], dg = px[i + 1] - col[1], db = px[i + 2] - col[2];
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < t1) px[i + 3] = 0;
      else if (dist < t2) px[i + 3] = Math.round(px[i + 3] * (dist - t1) / (t2 - t1));
      if (verde && px[i + 3] > 0) {   // quita el reflejo verde de los bordes
        const m = Math.max(px[i], px[i + 2]);
        if (px[i + 1] > m) px[i + 1] = m;
      }
    }
    cx.putImageData(d, 0, 0);
    img.pers = cv;
  }

  /* ---------- Editor de capas ---------- */
  function nombreCapa(id) {
    if (id === "fondo") return "🌄 Fondo";
    if (id === "pers") return "🙋‍♀️ Personaje";
    if (id === "logo") return "🛡️ Escudo";
    if (id === "patros") return "🤝 Patrocinadores";
    const i = +id.slice(1), t = E.textos[i];
    return `🔤 ${(t && t.t.trim().split("\n")[0].slice(0, 14)) || "Texto " + (i + 1)}`;
  }
  function capasDisponibles() {
    const l = ["fondo"];
    if (img.pers) l.push("pers");
    l.push("logo");
    if ((r.patros || []).length) l.push("patros");
    E.textos.forEach((t, i) => l.push("t" + i));
    return l;
  }
  function editorHtml() {
    if (!capasDisponibles().includes(sel)) sel = "fondo";
    return `<div class="ev-ed">
      <h4>🧩 Montaje por capas</h4>
      <div class="ev-burbuja" style="max-width:100%">Toca una capa en la vista previa (o aquí) y arrástrala para moverla. Los textos pueden ir por delante o por detrás del personaje.</div>
      <div class="ev-capas">${capasDisponibles().map(id => `<button type="button" class="ev-mini${sel === id ? " sel" : ""}" data-capa="${id}">${esc(nombreCapa(id))}</button>`).join("")}
        <button type="button" class="ev-mini" data-addtexto>➕ Texto</button></div>
      <div id="evCtl">${controlesHtml()}</div>
      <button type="button" class="btn-save-session" data-bajar style="--c: var(--c-verde)">⬇️ Descargar el cartel</button>
      ${formato() === FORMATOS.story && typeof window.igGetToken === "function" && window.igGetToken() && window.nvaStory ? `<button type="button" class="btn-pdf-mode2" data-story>📲 Guardar como borrador de Story</button>` : ""}
      <div class="ev-estado" id="evEstado2"></div>
    </div>`;
  }
  function deslizador(prop, txt, min, max, paso, val, fmt) {
    return `<span>${txt}</span><input type="range" data-ctl="${prop}" min="${min}" max="${max}" step="${paso}" value="${val}"><output data-out="${prop}">${fmt ? fmt(val) : val}</output>`;
  }
  const pct = v => Math.round(v * 100) + "%", grados = v => Math.round(v) + "°";
  function controlesHtml() {
    if (sel === "fondo") {
      const f = E.fondo;
      if (!img.fondo) return `<div class="ev-estado">${hayFondo() ? "Aún no has subido la imagen de fondo (sección 🌄)." : "Fondo de color. Cámbialo en la sección 🌄."}</div>`;
      return `<div class="ev-ctl">${deslizador("z", "Zoom", 1, 3, 0.01, f.z, pct)}${deslizador("op", "Opacidad", 0, 1, 0.01, f.op, pct)}</div>
        <div class="ev-fila"><button type="button" class="ev-mini" data-centrar>↺ Centrar</button></div>`;
    }
    if (sel === "pers") {
      const p = E.pers;
      return `<div class="ev-ctl">${deslizador("s", "Tamaño", 0.15, 1.6, 0.01, p.s, pct)}${deslizador("rot", "Ángulo", -180, 180, 1, p.rot, grados)}${deslizador("op", "Opacidad", 0, 1, 0.01, p.op, pct)}</div>
        <div class="ev-fila"><button type="button" class="ev-mini" data-flip>⇋ Voltear</button><button type="button" class="ev-mini" data-centrar>↺ Centrar</button></div>`;
    }
    if (sel === "logo") {
      const l = E.logo;
      return `<div class="ev-ctl">${deslizador("s", "Tamaño", 0.06, 0.6, 0.01, l.s, pct)}${deslizador("rot", "Ángulo", -180, 180, 1, l.rot, grados)}${deslizador("op", "Opacidad", 0, 1, 0.01, l.op, pct)}</div>`;
    }
    if (sel === "patros") {
      const p = E.patros;
      return `<div class="ev-ctl">${deslizador("s", "Tamaño", 0.4, 2.5, 0.01, p.s, pct)}${deslizador("rot", "Ángulo", -180, 180, 1, p.rot, grados)}${deslizador("op", "Opacidad", 0, 1, 0.01, p.op, pct)}</div>
        <div class="ev-fila" style="font-size:.82rem"><label><input type="checkbox" data-placa ${p.placa ? "checked" : ""}> Placa blanca detrás</label></div>${ordenPatrosHtml()}`;
    }
    const i = +sel.slice(1), t = E.textos[i];
    if (!t) return "";
    return `<textarea data-ttexto placeholder="Escribe el texto (Intro para otra línea)">${esc(t.t)}</textarea>
      <div class="ev-fila"><select data-tfuente aria-label="Tipografía">${Object.keys(FUENTES).map(k => `<option value="${k}"${t.f === k ? " selected" : ""}>${esc(FUENTES[k].t)}</option>`).join("")}</select>
        <input type="color" data-tcolor value="${esc(t.color)}" aria-label="Color" style="flex:none;width:44px;height:32px"></div>
      <div class="ev-ctl">${deslizador("s", "Tamaño", 0.02, 0.4, 0.005, t.s, v => Math.round(v * 1000) / 10)}${deslizador("rot", "Ángulo", -180, 180, 1, t.rot, grados)}${deslizador("op", "Opacidad", 0, 1, 0.01, t.op, pct)}</div>
      <div class="ev-fila">
        <button type="button" class="ev-mini${t.capa === "detras" ? " sel" : ""}" data-tcapa="detras">⬇️ Detrás del personaje</button>
        <button type="button" class="ev-mini${t.capa === "delante" ? " sel" : ""}" data-tcapa="delante">⬆️ Delante</button></div>
      <div class="ev-fila" style="font-size:.82rem">
        <label><input type="checkbox" data-tflag="mayus" ${t.mayus ? "checked" : ""}> MAYÚSCULAS</label>
        <label><input type="checkbox" data-tflag="sombra" ${t.sombra ? "checked" : ""}> Sombra</label>
        <label><input type="checkbox" data-tflag="contorno" ${t.contorno ? "checked" : ""}> Contorno</label></div>
      <div class="ev-fila"><button type="button" class="ev-mini" data-tdup>⧉ Duplicar</button><button type="button" class="ev-mini" data-tdel>🗑️ Borrar</button></div>`;
  }
  function refrescarControles() {
    const ed = capa && capa.querySelector(".ev-ed");
    if (!ed) return;
    ed.querySelector(".ev-capas").innerHTML = capasDisponibles().map(id => `<button type="button" class="ev-mini${sel === id ? " sel" : ""}" data-capa="${id}">${esc(nombreCapa(id))}</button>`).join("") +
      `<button type="button" class="ev-mini" data-addtexto>➕ Texto</button>`;
    ed.querySelector("#evCtl").innerHTML = controlesHtml();
    enlazar(ed);
  }
  function elemento(id) { return id === "fondo" ? E.fondo : id === "pers" ? E.pers : id === "logo" ? E.logo : id === "patros" ? E.patros : E.textos[+id.slice(1)]; }

  /* ---------- Eventos de la ventana ---------- */
  function responder(id, v) {
    r[id] = v;
    if (id === "formato") E.fondo = Object.assign(E.fondo, { ox: 0, oy: 0 });
    if (id === "pTipo" && v === "ninguno") { img.pers = img.persOrig = null; }
    render.saltar = true;
    render();
  }

  function cargarArchivo(file) {
    return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("No se puede abrir la imagen")); i.src = URL.createObjectURL(file); });
  }
  async function ponerImagen(capaId, imagen) {
    if (capaId === "fondo") { img.fondo = imagen; E.fondo = { z: 1, ox: 0, oy: 0, op: 1 }; }
    else { img.persOrig = imagen; procesarPersonaje(); }
    render.saltar = true;
    render();
  }

  function enlazar(c) {
    c.querySelectorAll("[data-sec]").forEach(b => b.onclick = () => { const s = SECCIONES.find(x => x.id === b.dataset.sec); if (completa(s)) { abiertas[s.id] = !abiertas[s.id]; render(); } });
    c.querySelectorAll("[data-op]").forEach(b => b.onclick = () => {
      if (b.dataset.v === "otro") { r[b.dataset.op] = "otro"; render(); const inp = capa.querySelector(`[data-otro="${b.dataset.op}"]`); if (inp) inp.focus(); return; }
      responder(b.dataset.op, b.dataset.v);
    });
    c.querySelectorAll("[data-otro]").forEach(inp => {
      inp.oninput = () => { r[inp.dataset.otro + "_o"] = inp.value; };
      inp.onkeydown = e => { if (e.key === "Enter" && inp.value.trim()) { e.preventDefault(); r[inp.dataset.otro + "_o"] = inp.value.trim(); render.saltar = true; render(); } };
    });
    c.querySelectorAll("[data-otrook]").forEach(b => b.onclick = () => {
      const id = b.dataset.otrook, inp = c.querySelector(`[data-otro="${id}"]`);
      if (!inp || !inp.value.trim()) return;
      r[id + "_o"] = inp.value.trim(); render.saltar = true; render();
    });
    c.querySelectorAll("[data-colotro]").forEach(inp => { inp.oninput = () => { r[inp.dataset.colotro + "_o"] = inp.value; pintar(); }; inp.onchange = () => { r[inp.dataset.colotro + "_o"] = inp.value; render.saltar = true; render(); }; });
    c.querySelectorAll("[data-eqimg]").forEach(im => urlEq(im.dataset.eqimg).then(u => { if (u) im.src = u; }));
    c.querySelectorAll("[data-eqacc]").forEach(b => b.onclick = () => accionEq(b.dataset.eqacc, b.dataset.id));

    // Patrocinadores
    const selP = r.patros || [];
    c.querySelectorAll("[data-patro]").forEach(b => b.onclick = () => { const a = b.dataset.patro, n = selP.indexOf(a); if (n >= 0) selP.splice(n, 1); else selP.push(a); render(); });
    c.querySelectorAll("[data-sube]").forEach(b => b.onclick = () => { const i = +b.dataset.sube; [selP[i - 1], selP[i]] = [selP[i], selP[i - 1]]; render(); });
    c.querySelectorAll("[data-baja]").forEach(b => b.onclick = () => { const i = +b.dataset.baja; [selP[i + 1], selP[i]] = [selP[i], selP[i + 1]]; render(); });
    const pOk = c.querySelector("[data-patrook]");
    if (pOk) pOk.onclick = () => { r.patros_ok = true; render.saltar = true; render(); };

    // Imágenes
    c.querySelectorAll("[data-copiar]").forEach(b => b.onclick = async () => {
      const txt = b.dataset.copiar === "fondo" ? promptFondo() : promptPersonaje();
      try { await navigator.clipboard.writeText(txt); b.textContent = "✅ Copiado"; }
      catch (e) {
        const caja = c.querySelector(`[data-prompt="${b.dataset.copiar}"]`), rg = document.createRange();
        rg.selectNodeContents(caja); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg);
        b.textContent = "Mantén pulsado el texto para copiarlo";
      }
      setTimeout(() => { if (b.isConnected) b.textContent = "📋 Copiar el encargo"; }, 2500);
    });
    const fotosEq = c.querySelector("[data-fotoseq]");
    if (fotosEq) fotosEq.onclick = async () => {
      const eq = equipaciones.find(e => e.id === r.equip) || {}, files = [];
      for (const a of eq.imagenes || []) { const b = await blobEq(a); if (b) files.push(new File([b], a.split("/").pop(), { type: b.type || "image/jpeg" })); }
      if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files }); return; } catch (e) { if (e.name === "AbortError") return; } }
      for (const f of files) { const u = URL.createObjectURL(f), el = document.createElement("a"); el.href = u; el.download = f.name; document.body.appendChild(el); el.click(); el.remove(); await new Promise(ok => setTimeout(ok, 400)); }
    };
    c.querySelectorAll("[data-subir]").forEach(inp => inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (f) ponerImagen(inp.dataset.subir, await cargarArchivo(f));
    });
    c.querySelectorAll("[data-omitir]").forEach(b => b.onclick = () => responder(b.dataset.omitir, "omitir"));
    c.querySelectorAll("[data-generar]").forEach(b => b.onclick = () => generar(b));
    const qf = c.querySelector("[data-qf]");
    if (qf) qf.onchange = () => { quitarFondo.activo = qf.checked; procesarPersonaje(); pintar(); };
    const qft = c.querySelector("[data-qftol]");
    if (qft) qft.onchange = () => { quitarFondo.tol = +qft.value; procesarPersonaje(); pintar(); };

    // Editor
    c.querySelectorAll("[data-capa]").forEach(b => b.onclick = () => { sel = b.dataset.capa; refrescarControles(); pintar(); });
    const add = c.querySelector("[data-addtexto]");
    if (add) add.onclick = () => {
      E.textos.push({ t: "", f: "impacto", color: "#ffffff", x: 0.5, y: 0.25 + (E.textos.length % 5) * 0.1, s: 0.1, rot: 0, op: 1, capa: "delante", sombra: true, contorno: false, mayus: true });
      sel = "t" + (E.textos.length - 1);
      refrescarControles(); pintar();
      const ta = capa.querySelector("[data-ttexto]"); if (ta) ta.focus();
    };
    c.querySelectorAll("[data-ctl]").forEach(inp => inp.oninput = () => {
      const el = elemento(sel); if (!el) return;
      el[inp.dataset.ctl] = parseFloat(inp.value);
      const out = c.querySelector(`[data-out="${inp.dataset.ctl}"]`);
      if (out) out.textContent = { op: pct, rot: grados, z: pct }[inp.dataset.ctl] ? { op: pct, rot: grados, z: pct }[inp.dataset.ctl](el[inp.dataset.ctl]) : (sel[0] === "t" ? Math.round(el.s * 1000) / 10 : pct(el.s));
      pintar();
    });
    const centrar = c.querySelector("[data-centrar]");
    if (centrar) centrar.onclick = () => {
      if (sel === "fondo") Object.assign(E.fondo, { z: 1, ox: 0, oy: 0 });
      if (sel === "pers") Object.assign(E.pers, { x: 0.5, y: 0.6, rot: 0 });
      refrescarControles(); pintar();
    };
    const flip = c.querySelector("[data-flip]");
    if (flip) flip.onclick = () => { E.pers.flip = !E.pers.flip; pintar(); };
    const placa = c.querySelector("[data-placa]");
    if (placa) placa.onchange = () => { E.patros.placa = placa.checked; pintar(); };
    const t = sel[0] === "t" ? E.textos[+sel.slice(1)] : null;
    const ta = c.querySelector("[data-ttexto]");
    if (ta && t) ta.oninput = () => { t.t = ta.value; pintar(); const bt = capa.querySelector(`[data-capa="${sel}"]`); if (bt) bt.textContent = nombreCapa(sel); };
    const tf = c.querySelector("[data-tfuente]");
    if (tf && t) tf.onchange = () => { t.f = tf.value; pintar(); };
    const tc = c.querySelector("[data-tcolor]");
    if (tc && t) tc.oninput = () => { t.color = tc.value; pintar(); };
    c.querySelectorAll("[data-tcapa]").forEach(b => b.onclick = () => { if (t) { t.capa = b.dataset.tcapa; refrescarControles(); pintar(); } });
    c.querySelectorAll("[data-tflag]").forEach(cb => cb.onchange = () => { if (t) { t[cb.dataset.tflag] = cb.checked; pintar(); } });
    const dup = c.querySelector("[data-tdup]");
    if (dup && t) dup.onclick = () => { E.textos.push(Object.assign({}, t, { y: Math.min(0.95, t.y + 0.06) })); sel = "t" + (E.textos.length - 1); refrescarControles(); pintar(); };
    const del = c.querySelector("[data-tdel]");
    if (del && t) del.onclick = () => { E.textos.splice(+sel.slice(1), 1); sel = "fondo"; refrescarControles(); pintar(); };
    const bajar = c.querySelector("[data-bajar]");
    if (bajar) bajar.onclick = descargar;
    const story = c.querySelector("[data-story]");
    if (story) story.onclick = () => guardarStory(story);
  }

  /* ---------- Generar desde la app (si la función está configurada) ---------- */
  async function referenciasEq() {
    if (!esPersona() || r.equip === "otro") return {};
    const eq = equipaciones.find(e => e.id === r.equip) || {};
    const referencias = [];
    for (const ru of (eq.imagenes || []).slice(0, 3)) {
      const b = await blobEq(ru).catch(() => null);
      if (!b) continue;
      const b64 = await new Promise(ok => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1]); f.readAsDataURL(b); });
      referencias.push({ mime: b.type || "image/jpeg", datos: b64 });
    }
    return { equipacion: eq.id || "", descripcionEq: eq.descripcion || eq.nombre || "", referencias };
  }
  async function generar(btn) {
    const capaId = btn.dataset.generar, est = capa.querySelector(`[data-estado="${capaId}"]`);
    const sb = window.nva && window.nva.cliente;
    if (!sb) { est.textContent = "No hay conexión con Supabase."; return; }
    btn.disabled = true;
    const t0 = Date.now();
    const reloj = setInterval(() => { est.textContent = `🎨 Pintando… ${Math.round((Date.now() - t0) / 1000)} s`; }, 500);
    try {
      const F = formato();
      const body = capaId === "fondo"
        ? { prompt: promptFondo(), aspecto: F.ar }
        : Object.assign({ prompt: promptPersonaje(), aspecto: r.pTipo !== "equipo" || F.h >= F.w ? "3:4" : "4:5", dorsal: r.dorsal === "otro" ? r.dorsal_o : r.dorsal || "" }, await referenciasEq());
      const { data, error } = await sb.functions.invoke("generar-cartel", { body });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch (e) { /* sin detalle */ }
        throw new Error(msg);
      }
      if (!data || !data.imagen) throw new Error((data && data.error) || "La IA no devolvió ninguna imagen");
      const i = new Image();
      await new Promise((ok, ko) => { i.onload = ok; i.onerror = () => ko(new Error("La imagen recibida no se puede abrir")); i.src = `data:${data.mime || "image/png"};base64,${data.imagen}`; });
      clearInterval(reloj);
      ponerImagen(capaId, i);
    } catch (e) {
      clearInterval(reloj);
      est.textContent = "❌ " + e.message + " · Puedes copiar el encargo y crearla en Gemini o ChatGPT.";
      btn.disabled = false;
    }
  }

  /* ---------- Dibujo ---------- */
  function pintar() {
    if (!capa || pintar.pend) return;
    pintar.pend = true;
    requestAnimationFrame(() => {
      pintar.pend = false;
      const cv = capa && capa.querySelector("#evLienzo");
      if (!cv) return;
      const F = formato();
      const k = Math.min(1, 900 / Math.max(F.w, F.h));
      const w = Math.round(F.w * k), h = Math.round(F.h * k);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      cv.style.aspectRatio = `${F.w} / ${F.h}`;
      componer(cv.getContext("2d"), w, h, true);
    });
  }

  function fondoColor(ctx, W, H) {
    const v = r.fColor === "otro" ? (r.fColor_o || "#1f3cff") : (r.fColor || "club");
    if (v === "club" || !hayFondo() && !r.fColor) {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, "#0a1f9e"); g.addColorStop(0.6, "#1f3cff"); g.addColorStop(1, "#ff5b00");
      ctx.fillStyle = g;
    } else ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  function componer(ctx, W, H, previa) {
    const M = Math.min(W, H);
    cajas = [];
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // 1. Fondo
    if (img.fondo) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      const f = E.fondo, o = img.fondo;
      const s = Math.max(W / o.width, H / o.height) * f.z, dw = o.width * s, dh = o.height * s;
      ctx.globalAlpha = f.op;
      ctx.drawImage(o, (W - dw) / 2 + f.ox * W, (H - dh) / 2 + f.oy * H, dw, dh);
      ctx.globalAlpha = 1;
    } else {
      fondoColor(ctx, W, H);
      if (previa && hayFondo()) {
        ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.font = `700 ${M * 0.045}px Barlow, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("Aquí irá la imagen de fondo", W / 2, H / 2);
      }
    }
    cajas.push({ id: "fondo", x: 0, y: 0, w: W, h: H });

    // 2. Textos de detrás, 3. personaje, 4. textos de delante
    E.textos.forEach((t, i) => { if (t.capa === "detras") dibujarTexto(ctx, W, H, M, t, "t" + i); });
    if (img.pers) {
      const p = E.pers, o = img.pers;
      const h = p.s * H, w = h * o.width / o.height;
      const cx = p.x * W, cy = p.y * H;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(p.rot * Math.PI / 180); if (p.flip) ctx.scale(-1, 1);
      ctx.globalAlpha = p.op; ctx.drawImage(o, -w / 2, -h / 2, w, h); ctx.restore();
      cajas.push(caja("pers", cx, cy, w, h, p.rot));
    }
    E.textos.forEach((t, i) => { if (t.capa !== "detras") dibujarTexto(ctx, W, H, M, t, "t" + i); });

    // 5. Escudo
    const logo = imgLista("LOGO-NVA.png");
    if (logo) {
      const l = E.logo, s = l.s * M, cx = l.x * W, cy = l.y * H;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(l.rot * Math.PI / 180); ctx.globalAlpha = l.op;
      ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = M * 0.02;
      ctx.drawImage(logo, -s / 2, -s / 2, s, s); ctx.restore();
      cajas.push(caja("logo", cx, cy, s, s, l.rot));
    }

    // 6. Patrocinadores (el primero, el más grande)
    dibujarPatros(ctx, W, H, M);

    // Marco de la capa elegida (solo en la vista previa)
    if (previa && capa && capa.querySelector(".ev-ed")) {
      const cj = cajas.find(c => c.id === sel);
      if (cj && sel !== "fondo") {
        ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.strokeStyle = "#ff7a2e";
        ctx.strokeRect(cj.x, cj.y, cj.w, cj.h); ctx.restore();
      }
    }
    ctx.restore();
  }
  // Caja recta que envuelve un rectángulo girado (para tocarlo)
  function caja(id, cx, cy, w, h, rot) {
    const a = (rot || 0) * Math.PI / 180, cw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)), ch = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
    return { id, x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch };
  }

  function dibujarPatros(ctx, W, H, M) {
    const selP = r.patros || [];
    if (!selP.length) return;
    const lista = selP.map(a => imgLista("Patrocinadores/" + a)).filter(Boolean);
    if (!lista.length) return;
    const P = E.patros, base = M * 0.085 * P.s, gap = M * 0.022 * P.s;
    const factor = i => Math.max(0.5, 1 - i * 0.16);
    const tam = lista.map((im, i) => { const h = base * factor(i), w = Math.min(h * im.width / im.height, M * 0.3 * factor(i) * P.s); return { im, w, h: w * im.height / im.width }; });
    const ancho = tam.reduce((s, t) => s + t.w, 0) + gap * (tam.length - 1), alto = Math.max(...tam.map(t => t.h));
    const pad = P.placa ? M * 0.018 * P.s : 0;
    const cx = P.x * W, cy = P.y * H;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(P.rot * Math.PI / 180); ctx.globalAlpha = P.op;
    if (P.placa) { ctx.fillStyle = "rgba(255,255,255,.94)"; redondo(ctx, -ancho / 2 - pad, -alto / 2 - pad, ancho + pad * 2, alto + pad * 2, M * 0.02 * P.s); ctx.fill(); }
    let x = -ancho / 2;
    tam.forEach(t => { ctx.drawImage(t.im, x, -t.h / 2, t.w, t.h); x += t.w + gap; });
    ctx.restore();
    cajas.push(caja("patros", cx, cy, ancho + pad * 2, alto + pad * 2, P.rot));
  }
  function redondo(ctx, x, y, w, h, rr) {
    ctx.beginPath();
    ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
  }
  function fuenteCss(clave, px) {
    const f = FUENTES[clave] || FUENTES.impacto;
    return `${f.w} ${px}px '${f.f}', Impact, sans-serif`;
  }
  function esOscuro(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return false;
    const n = parseInt(m[1], 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 110;
  }
  function dibujarTexto(ctx, W, H, M, t, id) {
    const txt = (t.mayus ? t.t.toUpperCase() : t.t).replace(/\s+$/, "");
    if (!txt.trim()) return;
    const px = t.s * M, lineas = txt.split("\n"), alto = px * 1.05;
    ctx.save();
    ctx.font = fuenteCss(t.f, px);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    const ancho = Math.max(...lineas.map(l => ctx.measureText(l).width)), altoTot = alto * lineas.length;
    const cx = t.x * W, cy = t.y * H;
    ctx.translate(cx, cy); ctx.rotate(t.rot * Math.PI / 180); ctx.globalAlpha = t.op;
    lineas.forEach((l, i) => {
      const y = -altoTot / 2 + alto * (i + 0.5);
      if (t.contorno) { ctx.lineWidth = px * 0.12; ctx.strokeStyle = esOscuro(t.color) ? "#ffffff" : "#0b1236"; ctx.strokeText(l, 0, y); }
      if (t.sombra) { ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = px * 0.12; ctx.shadowOffsetY = px * 0.04; }
      ctx.fillStyle = t.color; ctx.fillText(l, 0, y);
      ctx.shadowColor = "transparent";
    });
    ctx.restore();
    cajas.push(caja(id, cx, cy, ancho + px * 0.2, altoTot, t.rot));
  }

  /* ---------- Tocar y arrastrar sobre la vista previa ---------- */
  function tocarLienzo(cv) {
    let ini = null;
    cv.addEventListener("pointerdown", e => {
      if (!E || !capa.querySelector(".ev-ed")) return;
      const rc = cv.getBoundingClientRect();
      const x = (e.clientX - rc.left) * cv.width / rc.width, y = (e.clientY - rc.top) * cv.height / rc.height;
      // La capa de más arriba que esté bajo el dedo (la elegida tiene preferencia)
      const bajo = cajas.filter(c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h).map(c => c.id);
      const id = bajo.includes(sel) && sel !== "fondo" ? sel : (bajo[bajo.length - 1] || "fondo");
      if (id !== sel) { sel = id; refrescarControles(); }
      const el = elemento(sel);
      ini = { x: e.clientX, y: e.clientY, a: id === "fondo" ? { x: el.ox, y: el.oy } : { x: el.x, y: el.y } };
      cv.setPointerCapture(e.pointerId);
      pintar();
    });
    cv.addEventListener("pointermove", e => {
      if (!ini) return;
      const rc = cv.getBoundingClientRect(), el = elemento(sel);
      const dx = (e.clientX - ini.x) / rc.width, dy = (e.clientY - ini.y) / rc.height;
      if (sel === "fondo") { el.ox = ini.a.x + dx; el.oy = ini.a.y + dy; }
      else { el.x = ini.a.x + dx; el.y = ini.a.y + dy; }
      pintar();
    });
    const fin = () => { ini = null; };
    cv.addEventListener("pointerup", fin); cv.addEventListener("pointercancel", fin);
  }

  /* ---------- Guardar ---------- */
  async function lienzoFinal() {
    await cargarFuentes();
    await Promise.all(["LOGO-NVA.png"].concat((r.patros || []).map(a => "Patrocinadores/" + a)).map(u => cargarImg(u).then(i => { if (i) imgsListas[u] = i; })));
    const F = formato();
    const cv = document.createElement("canvas");
    cv.width = F.w; cv.height = F.h;
    const selAntes = sel;
    componer(cv.getContext("2d"), F.w, F.h, false);
    sel = selAntes;
    pintar();
    return cv;
  }
  function nombreArchivo() {
    const t = (E.textos[0] && E.textos[0].t) || "evento";
    const base = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    return `cartel-${base || "evento"}.png`;
  }
  async function descargar() {
    const est = capa.querySelector("#evEstado2");
    est.textContent = "Preparando el cartel…";
    const cv = await lienzoFinal();
    const blob = await new Promise(ok => cv.toBlob(ok, "image/png"));
    const nombre = nombreArchivo(), file = new File([blob], nombre, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); est.textContent = ""; return; }
      catch (e) { if (e.name === "AbortError") { est.textContent = ""; return; } }
    }
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    est.textContent = "✅ Descargado.";
  }
  async function guardarStory(btn) {
    const est = capa.querySelector("#evEstado2");
    btn.disabled = true;
    try {
      const cv = await lienzoFinal();
      const blob = await new Promise(ok => cv.toBlob(ok, "image/jpeg", 0.92));
      const gh = JSON.parse(localStorage.getItem("NVA_GH_SETTINGS") || "{}");
      const ig = JSON.parse(localStorage.getItem("NVA_IG_SETTINGS") || "{}");
      await window.nvaStory.crearBorrador({ token: window.igGetToken(), user: gh.user, repo: gh.repo, login: ig.login || "" },
        [{ blob, final: blob }], { tipo: "evento", titulo: (E.textos[0] && E.textos[0].t) || "Evento" }, t => { est.textContent = t; });
      est.textContent = "✅ Guardado en Stories como borrador. Revísalo allí antes de publicarlo.";
      if (typeof window.igHistoriasCargar === "function") window.igHistoriasCargar();
    } catch (e) {
      est.textContent = "❌ " + e.message;
      btn.disabled = false;
    }
  }

  window.evAbrirCartel = abrir;
  window.evCartel = { promptFondo, promptPersonaje, _estado: () => ({ r, E, sel }), _img: img, _poner: ponerImagen };
})();
