/* =====================================================================
   Redes Sociales › EVENTOS: asistente para crear el cartel de un evento.

   · La «entrevista» la hace la app: cada respuesta abre la siguiente
     pregunta, siempre con opciones para elegir (como lo haría un
     diseñador de carteles con su cliente).
   · La imagen central la genera una IA a través de la función de Supabase
     «generar-cartel» (Cloudflare FLUX gratis o Gemini). También se puede
     usar una foto propia o un cartel solo de texto.
   · El logo del club, los patrocinadores (esquina, por prioridad y tamaño)
     y todos los textos se dibujan aquí en un canvas, encima de la imagen,
     para que salgan siempre exactos y nítidos.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- Formatos ---------- */
  const FORMATOS = {
    story: { w: 1080, h: 1920, ar: "9:16" },
    post: { w: 1080, h: 1350, ar: "4:5" },
    cuadrado: { w: 1080, h: 1080, ar: "1:1" },
    a4: { w: 1654, h: 2339, ar: "3:4" },
    horizontal: { w: 1920, h: 1080, ar: "16:9" }
  };

  /* ---------- Tipografías (fonts/, licencia OFL) ---------- */
  const FUENTES = {
    impacto: { f: "Anton", w: "400", t: "Impacto condensada", nota: "La de los carteles de partido: compacta y potente" },
    deportiva: { f: "Barlow Condensed", w: "italic 800", t: "Deportiva en cursiva", nota: "Sensación de velocidad" },
    bebas: { f: "Bebas Neue", w: "400", t: "Titular limpia", nota: "Moderna y muy legible" },
    moderna: { f: "Poppins", w: "800", t: "Redonda moderna", nota: "Cercana, para eventos familiares" },
    elegante: { f: "Playfair Display", w: "800", t: "Elegante con serifa", nota: "Galas, cenas, presentaciones" },
    brush: { f: "Permanent Marker", w: "400", t: "Rotulador / brush", nota: "Callejera, juvenil" },
    comic: { f: "Bangers", w: "400", t: "Cómic", nota: "Divertida, ideal con estilo cómic" },
    texto: { f: "Barlow", w: "700", t: "Barlow (la de la app)", nota: "Sobria para datos" }
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

  const COLORES = [
    { v: "#ffffff", t: "Blanco" }, { v: "#ff5b00", t: "Naranja club" }, { v: "#1f3cff", t: "Azul club" },
    { v: "#f5c518", t: "Amarillo" }, { v: "#111111", t: "Negro" }, { v: "#00e5ff", t: "Cian neón" }, { v: "#ff2d95", t: "Rosa neón" }
  ];

  /* ---------- La entrevista ----------
     Cada pregunta: id, q (lo que pregunta el diseñador), nota (por qué lo pregunta),
     tipo (chips | dorsal | texto | color | foto | extras | patros), op (opciones),
     cuando(r) (si se pregunta según lo ya contestado). Las opciones llevan «p»: lo que
     se añade al encargo de la IA (en inglés, que es como mejor responde). */
  const esPersona = r => r.principal === "jugadora" || r.principal === "equipo";
  const usaIA = r => ["jugadora", "equipo", "balon"].includes(r.principal);
  const conImagen = r => usaIA(r) || r.principal === "foto";

  const PREGUNTAS = [
    { id: "evento", bloque: "El encargo", q: "Antes de nada, ¿qué evento vamos a anunciar?", nota: "Me ayuda a proponerte el tono y los textos.",
      op: [
        { v: "partido", e: "🏐", t: "Partido especial" }, { v: "torneo", e: "🏆", t: "Torneo" },
        { v: "campus", e: "☀️", t: "Campus / clínic" }, { v: "presentacion", e: "🎉", t: "Presentación de equipos" },
        { v: "captacion", e: "📣", t: "Captación / inscripciones" }, { v: "puertas", e: "🚪", t: "Jornada de puertas abiertas" },
        { v: "fiesta", e: "🥂", t: "Cena / fiesta del club" }, { v: "solidario", e: "💙", t: "Evento solidario" },
        { v: "otro", e: "✳️", t: "Otro" }
      ] },
    { id: "formato", bloque: "El encargo", q: "¿Dónde se va a ver el cartel? Así elijo las medidas.", nota: "Cada red tiene su tamaño ideal; si lo vas a imprimir, uso más resolución.",
      op: [
        { v: "story", e: "📱", t: "Story Instagram · 1080×1920" }, { v: "post", e: "🖼️", t: "Post vertical · 1080×1350" },
        { v: "cuadrado", e: "⬛", t: "Post cuadrado · 1080×1080" }, { v: "a4", e: "🖨️", t: "Para imprimir · A4/A3" },
        { v: "horizontal", e: "🖥️", t: "Horizontal · web / pantalla" }
      ] },
    { id: "principal", bloque: "La imagen central", q: "¿Qué protagonista quieres en el centro del cartel?", nota: "Es lo primero que mira la gente: tiene que contar el evento de un vistazo.",
      op: [
        { v: "jugadora", e: "🙋‍♀️", t: "Una jugadora (IA)" }, { v: "equipo", e: "👯", t: "Varias jugadoras (IA)" },
        { v: "balon", e: "🏐", t: "El balón como protagonista (IA)" }, { v: "foto", e: "📷", t: "Una foto mía" },
        { v: "tipografia", e: "🔤", t: "Solo texto, sin imagen" }
      ] },
    { id: "foto", bloque: "La imagen central", tipo: "foto", q: "Sube la foto que quieres usar.", nota: "Mejor en vertical y con buena luz. Luego podrás moverla y ampliarla.", cuando: r => r.principal === "foto" },

    { id: "equip", bloque: "La jugadora", q: "Vestirá la equipación del club. ¿Cuál?", cuando: esPersona, nota: "Uso las fotos de la equipación como referencia para la IA.", dinamica: "equipaciones" },
    { id: "dorsal", bloque: "La jugadora", tipo: "dorsal", q: "¿Qué dorsal lleva en la camiseta?", cuando: r => r.principal === "jugadora", nota: "Si es una jugadora concreta, pon su número." },
    { id: "nJug", bloque: "Las jugadoras", q: "¿Cuántas jugadoras salen?", cuando: r => r.principal === "equipo",
      op: [{ v: "2", e: "2️⃣", t: "Dos", p: "two female volleyball players" }, { v: "3", e: "3️⃣", t: "Tres", p: "three female volleyball players" },
           { v: "6", e: "6️⃣", t: "Un seis completo", p: "a full team of six female volleyball players" }, { v: "12", e: "👥", t: "Plantilla entera", p: "a whole squad of about twelve female volleyball players" }] },
    { id: "edad", bloque: "La jugadora", q: "¿Qué edad aparenta?", cuando: esPersona, nota: "Conviene que se parezca a quien quieres atraer al evento.",
      op: [{ v: "alevin", e: "🧒", t: "Alevín (10-11)", p: "about 10 years old (kids category)" }, { v: "infantil", e: "👧", t: "Infantil (12-13)", p: "about 13 years old" },
           { v: "cadete", e: "🧑", t: "Cadete (14-15)", p: "about 15 years old" }, { v: "juvenil", e: "👩", t: "Juvenil (16-18)", p: "about 17 years old" },
           { v: "senior", e: "👩‍🦰", t: "Sénior (adulta)", p: "adult, around 24 years old" }] },
    { id: "rasgos", bloque: "La jugadora", q: "¿Qué rasgos tiene?", cuando: esPersona,
      op: [{ v: "mediterranea", t: "Mediterránea", p: "Mediterranean (Spanish) features, olive skin" }, { v: "europea", t: "Europea clara", p: "fair-skinned European features" },
           { v: "latina", t: "Latina", p: "Latina features" }, { v: "negra", t: "Negra / afrodescendiente", p: "Black, dark skin" },
           { v: "asiatica", t: "Asiática", p: "East Asian features" }, { v: "arabe", t: "Árabe / norteafricana", p: "North African features" },
           { v: "variado", t: "Variado (mezcla)", p: "a diverse mix of ethnicities" }] },
    { id: "complexion", bloque: "La jugadora", q: "¿Y la complexión?", cuando: esPersona,
      op: [{ v: "atletica", t: "Atlética", p: "athletic build" }, { v: "alta", t: "Alta y estilizada", p: "tall and slender build" },
           { v: "fuerte", t: "Potente / musculada", p: "strong, muscular build" }, { v: "normal", t: "Normal", p: "average build" }] },
    { id: "peloColor", bloque: "La jugadora", q: "¿Color de pelo?", cuando: esPersona,
      op: [{ v: "castano", t: "Castaño", p: "brown hair" }, { v: "negro", t: "Negro", p: "black hair" }, { v: "rubio", t: "Rubio", p: "blonde hair" },
           { v: "pelirrojo", t: "Pelirrojo", p: "red hair" }, { v: "tenido", t: "Teñido de color", p: "hair dyed in a bold colour" }, { v: "variado", t: "Variado", p: "different hair colours" }] },
    { id: "peinado", bloque: "La jugadora", q: "¿Y el peinado?", cuando: esPersona,
      op: [{ v: "coleta", t: "Coleta alta", p: "high ponytail" }, { v: "trenza", t: "Trenza", p: "braided hair" }, { v: "trenzas", t: "Trenzas de boxeadora", p: "double dutch braids" },
           { v: "mono", t: "Moño", p: "hair in a bun" }, { v: "corto", t: "Corto", p: "short hair" }, { v: "rizado", t: "Rizado suelto con cinta", p: "curly hair with a headband" }] },
    { id: "pose", bloque: "La jugadora", q: "¿Qué está haciendo? La pose marca toda la energía del cartel.", cuando: r => r.principal === "jugadora",
      op: [{ v: "remate", e: "💥", t: "Rematando en el aire", p: "jumping high and spiking the ball, arm fully extended" },
           { v: "saque", e: "🚀", t: "Saque en salto", p: "doing a jump serve, ball tossed above her" },
           { v: "recepcion", e: "🙌", t: "Recepción de antebrazos", p: "receiving the ball with a forearm pass, low stance" },
           { v: "colocacion", e: "☝️", t: "Colocando", p: "setting the ball with her fingertips above her forehead" },
           { v: "bloqueo", e: "🧱", t: "Bloqueando en la red", p: "blocking at the net with both hands up" },
           { v: "plancha", e: "🤸", t: "Plancha / defensa", p: "diving to save the ball, horizontal in the air" },
           { v: "celebra", e: "🔥", t: "Celebrando un punto", p: "celebrating a point, fist pumping and shouting" },
           { v: "posado", e: "😎", t: "Posado con el balón", p: "standing confidently holding a volleyball on her hip, looking at the camera" }] },
    { id: "poseEq", bloque: "Las jugadoras", q: "¿Cómo las colocamos?", cuando: r => r.principal === "equipo",
      op: [{ v: "pina", t: "Haciendo piña", p: "in a team huddle, arms around each other" }, { v: "celebran", t: "Celebrando juntas", p: "jumping and celebrating together" },
           { v: "linea", t: "Posado en V (tipo póster)", p: "posing in a V formation like a team poster, arms crossed" },
           { v: "accion", t: "En plena jugada", p: "in the middle of a match play, one spiking and the others covering" }] },
    { id: "plano", bloque: "La jugadora", q: "¿Qué encuadre prefieres?", cuando: esPersona, nota: "Cuerpo entero luce la acción; plano medio luce la cara y el dorsal.",
      op: [{ v: "entero", t: "Cuerpo entero", p: "full body shot" }, { v: "medio", t: "Plano medio", p: "medium shot from the waist up" },
           { v: "contrapicado", t: "Contrapicado heroico", p: "low angle heroic shot" }, { v: "dinamico", t: "Primer plano dinámico", p: "dynamic close-up with motion" }] },
    { id: "expresion", bloque: "La jugadora", q: "¿Qué transmite su cara?", cuando: esPersona,
      op: [{ v: "concentrada", t: "Concentrada", p: "focused, determined expression" }, { v: "desafiante", t: "Desafiante", p: "fierce, challenging look" },
           { v: "alegre", t: "Alegre", p: "big joyful smile" }, { v: "grito", t: "Grito de euforia", p: "shouting with euphoria" }] },
    { id: "balon", bloque: "El balón", q: "¿Cómo lo hacemos espectacular?", cuando: r => r.principal === "balon",
      op: [{ v: "fuego", e: "🔥", t: "En llamas", p: "a volleyball on fire flying at high speed" }, { v: "rayos", e: "⚡", t: "Con rayos", p: "a volleyball surrounded by electric lightning" },
           { v: "red", e: "🕸️", t: "Rozando la red", p: "a volleyball just crossing the net, frozen in time" },
           { v: "impacto", e: "💨", t: "Impacto en la pista", p: "a volleyball smashing the court floor with dust and shockwave" },
           { v: "pintura", e: "🎨", t: "Explosión de pintura", p: "a volleyball bursting through splashes of paint" },
           { v: "gigante", e: "🌆", t: "Gigante sobre la ciudad", p: "a giant volleyball floating over a Spanish town at sunset" }] },

    { id: "estilo", bloque: "El estilo", q: "¿Con qué estilo lo dibujamos?", cuando: usaIA, nota: "Define el carácter: realista impone, ilustración es más cercana y juvenil.",
      op: [{ v: "realista", e: "📸", t: "Foto realista", p: "ultra realistic sports photography, sharp focus, 85mm lens" },
           { v: "cine", e: "🎬", t: "Cinematográfico", p: "cinematic movie poster look, dramatic colour grading" },
           { v: "anime", e: "🌸", t: "Anime", p: "anime illustration style, clean cel shading" },
           { v: "comic", e: "💬", t: "Cómic", p: "comic book illustration, bold ink lines, halftone dots" },
           { v: "vector", e: "📐", t: "Ilustración plana", p: "flat vector illustration, bold shapes, minimal shading" },
           { v: "acuarela", e: "🖌️", t: "Acuarela", p: "watercolor painting with paint splashes" },
           { v: "3d", e: "🧸", t: "3D de animación", p: "stylized 3D animated film character render" },
           { v: "pop", e: "🟡", t: "Pop art", p: "pop art style, vivid flat colours" },
           { v: "retro", e: "📼", t: "Retro años 80", p: "retro 1980s sports poster, grain and sunset gradients" }] },
    { id: "fondo", bloque: "El fondo", q: "¿Qué ponemos detrás?", cuando: usaIA, nota: "Un fondo limpio deja respirar los textos; uno con ambiente cuenta más historia.",
      op: [{ v: "pabellon", t: "Pabellón con gradas llenas", p: "background: an indoor volleyball arena with crowded stands, blurred" },
           { v: "pabVacio", t: "Pista con luz dramática", p: "background: an empty indoor court lit by spotlights, dark atmosphere" },
           { v: "liso", t: "Degradado liso", p: "background: a clean smooth studio gradient" },
           { v: "energia", t: "Explosión de energía", p: "background: an explosion of light streaks, sparks and particles" },
           { v: "geometrico", t: "Formas geométricas", p: "background: bold abstract geometric shapes and diagonal stripes" },
           { v: "playa", t: "Playa al atardecer", p: "background: a beach volleyball court at sunset" },
           { v: "ciudad", t: "Ciudad / calle", p: "background: an urban street with murals" },
           { v: "humo", t: "Humo de colores", p: "background: dense coloured smoke" }] },
    { id: "paleta", bloque: "El fondo", q: "¿Qué colores mandan?", cuando: usaIA,
      op: [{ v: "club", t: "Los del club (azul y naranja)", p: "colour palette: royal blue and vivid orange" },
           { v: "calidos", t: "Cálidos", p: "warm colour palette: reds, oranges and yellows" },
           { v: "frios", t: "Fríos", p: "cool colour palette: blues, cyans and purples" },
           { v: "neon", t: "Neón", p: "neon colour palette: electric pink, cyan and purple glow" },
           { v: "bn", t: "Blanco y negro", p: "black and white, high contrast" },
           { v: "pastel", t: "Pastel", p: "soft pastel colour palette" }] },
    { id: "luz", bloque: "El fondo", q: "¿Y la luz?", cuando: usaIA,
      op: [{ v: "contraluz", t: "Contraluz dramático", p: "dramatic rim light and backlight" }, { v: "focos", t: "Focos de estadio", p: "stadium spotlights from above" },
           { v: "natural", t: "Natural y suave", p: "soft natural light" }, { v: "dorada", t: "Hora dorada", p: "golden hour light" }, { v: "estudio", t: "De estudio", p: "professional studio lighting" }] },
    { id: "plano2", bloque: "El fondo", q: "Como no hay imagen, ¿qué fondo pinto?", cuando: r => r.principal === "tipografia",
      op: [{ v: "club", t: "Degradado azul y naranja" }, { v: "noche", t: "Azul noche" }, { v: "naranja", t: "Naranja club" }, { v: "negro", t: "Negro" }, { v: "blanco", t: "Blanco" }] },

    { id: "titulo", bloque: "Los textos", tipo: "texto", q: "Vamos con los textos. ¿Cuál es el titular?", nota: "Corto y directo: 2 a 5 palabras se leen en un segundo.", sugerencias: true },
    { id: "tFuente", bloque: "Los textos", q: "¿Con qué tipografía?", dinamica: "fuentes" },
    { id: "tTam", bloque: "Los textos", q: "¿De qué tamaño?",
      op: [{ v: "xl", t: "Enorme (protagonista)" }, { v: "l", t: "Grande" }, { v: "m", t: "Mediano" }, { v: "s", t: "Discreto" }] },
    { id: "tEstilo", bloque: "Los textos", q: "¿Cómo lo rematamos?", nota: "Sobre una foto, el contorno o la cinta ayudan a que se lea.",
      op: [{ v: "sombra", t: "Relleno con sombra" }, { v: "contorno", t: "Con contorno" }, { v: "hueco", t: "Solo contorno (hueco)" },
           { v: "cinta", t: "Sobre una cinta de color" }, { v: "degradado", t: "Degradado azul-naranja" }, { v: "3d", t: "Efecto 3D" }] },
    { id: "tColor", bloque: "Los textos", tipo: "color", q: "¿De qué color?" },
    { id: "tPos", bloque: "Los textos", q: "¿Dónde va el titular?", nota: "Dejo ese hueco libre en la imagen para que no tape a la jugadora.",
      op: [{ v: "arriba", t: "Arriba" }, { v: "centro", t: "En el centro" }, { v: "abajo", t: "Abajo" }] },
    { id: "extras", bloque: "Los textos", tipo: "extras", q: "¿Qué más ponemos? Fecha, hora, lugar, precio… Añade todos los que quieras.", nota: "Cada texto con su tamaño y color. Deja la lista vacía si no hace falta." },
    { id: "f2", bloque: "Los textos", q: "Tipografía para estos textos:", cuando: r => (r.extras || []).some(x => x.t),
      op: [{ v: "texto", t: "Barlow (sobria)" }, { v: "moderna", t: "Redonda moderna" }, { v: "bebas", t: "Titular limpia" }, { v: "igual", t: "La misma que el titular" }] },

    { id: "logoPos", bloque: "Logos", q: "El escudo del club va siempre. ¿Dónde lo coloco?",
      op: [{ v: "sup-centro", t: "Arriba al centro" }, { v: "sup-izq", t: "Arriba a la izquierda" }, { v: "sup-der", t: "Arriba a la derecha" }, { v: "inf-centro", t: "Abajo al centro" }] },
    { id: "logoTam", bloque: "Logos", q: "¿Tamaño del escudo?",
      op: [{ v: "s", t: "Pequeño" }, { v: "m", t: "Mediano" }, { v: "l", t: "Grande" }] },
    { id: "patros", bloque: "Logos", tipo: "patros", q: "¿Qué patrocinadores salen? Tócalos en orden de importancia: el primero sale más grande.", nota: "Van más pequeños, en una esquina. Puedes reordenarlos con las flechas." },
    { id: "patroEsq", bloque: "Logos", q: "¿En qué esquina van los patrocinadores?", cuando: r => (r.patros || []).length > 0,
      op: [{ v: "inf-der", t: "Abajo a la derecha" }, { v: "inf-izq", t: "Abajo a la izquierda" }, { v: "banda", t: "Banda abajo de lado a lado" }] },
    { id: "patroPlaca", bloque: "Logos", q: "¿Les pongo una placa blanca detrás para que se vean bien?", cuando: r => (r.patros || []).length > 0,
      op: [{ v: "si", t: "Sí, placa blanca" }, { v: "no", t: "No, sin fondo" }] }
  ];

  const SUGERENCIAS = {
    partido: ["PARTIDO DECISIVO", "¡TE NECESITAMOS!", "GRAN FINAL"], torneo: ["TORNEO NVA", "TORNEO DE NAVIDAD", "TROFEO CIUDAD DE ALZIRA"],
    campus: ["CAMPUS DE VERANO", "CLÍNIC DE VÓLEY"], presentacion: ["PRESENTACIÓN DE EQUIPOS", "NUEVA TEMPORADA"],
    captacion: ["¡ÚNETE AL EQUIPO!", "VEN A JUGAR", "INSCRIPCIONES ABIERTAS"], puertas: ["PUERTAS ABIERTAS", "PRUEBA EL VÓLEY"],
    fiesta: ["CENA DEL CLUB", "FIESTA FIN DE TEMPORADA"], solidario: ["VÓLEY SOLIDARIO", "JUGAMOS POR UNA CAUSA"], otro: []
  };
  const TIPOS_EXTRA = [
    { v: "subtitulo", t: "Subtítulo", tam: "m" }, { v: "fecha", t: "📅 Fecha", tam: "m" }, { v: "hora", t: "🕒 Hora", tam: "s" },
    { v: "lugar", t: "📍 Lugar", tam: "s" }, { v: "precio", t: "💶 Precio", tam: "s" }, { v: "info", t: "ℹ️ Info", tam: "s" }
  ];

  /* ---------- Estado ---------- */
  let r = {};                 // respuestas
  let imgPrincipal = null;    // Image: la de la IA o la foto propia
  let ajuste = { z: 1, ox: 0, oy: 0 };
  let equipaciones = [{ id: "primera", nombre: "Primera equipación", imagenes: [] }];
  let patrocinadores = [];    // [{ archivo, nombre }]
  const imgs = {};            // caché de imágenes por url
  let capa = null;

  function cargarImg(url) {
    if (!imgs[url]) imgs[url] = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; });
    return imgs[url];
  }
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function cargarCatalogos() {
    try {
      const j = await (await fetch("Equipacion/equipacion.json", { cache: "no-cache" })).json();
      if (Array.isArray(j.equipaciones) && j.equipaciones.length) equipaciones = j.equipaciones;
    } catch (e) { /* sin catálogo: equipación por defecto */ }
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
      .ev-cab { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--borde, rgba(255,255,255,.12)); }
      .ev-cab b { flex: 1; font-family: var(--font-display); font-size: 1.1rem; color: #fff; }
      .ev-prev { flex: none; display: flex; justify-content: center; padding: 10px; background: rgba(0,0,0,.25); }
      .ev-prev canvas { max-height: 34dvh; max-width: 100%; border-radius: 8px; box-shadow: 0 6px 22px rgba(0,0,0,.45); touch-action: none; }
      .ev-cuerpo { flex: 1; overflow-y: auto; padding: 12px 14px 18px; display: flex; flex-direction: column; gap: 14px; }
      .ev-q { display: flex; flex-direction: column; gap: 8px; animation: evEntra .28s ease; }
      @keyframes evEntra { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      .ev-bloque { font-size: .68rem; letter-spacing: .08em; text-transform: uppercase; color: var(--txt-2, #9fb0d8); font-weight: 700; }
      .ev-burbuja { align-self: flex-start; max-width: 92%; background: rgba(92,132,255,.14); border: 1px solid rgba(92,132,255,.3); border-radius: 4px 14px 14px 14px; padding: 8px 11px; color: var(--txt-1, #e9eefa); font-size: .9rem; line-height: 1.35; }
      .ev-burbuja small { display: block; color: var(--txt-2, #9fb0d8); font-size: .76rem; margin-top: 3px; }
      .ev-ops { display: flex; flex-wrap: wrap; gap: 6px; }
      .ev-op { border: 1px solid var(--tiza-borde, rgba(233,238,250,.16)); background: var(--tiza-fondo, rgba(233,238,250,.07)); color: var(--txt-1, #e9eefa); border-radius: 999px; padding: 7px 12px; font: inherit; font-size: .82rem; cursor: pointer; }
      .ev-op.sel { background: rgba(255,91,0,.22); border-color: #ff7a2e; color: #fff; font-weight: 700; }
      .ev-op small { display: block; font-size: .68rem; opacity: .75; font-weight: 400; }
      .ev-fila { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .ev-fila input[type=text], .ev-fila input[type=number] { flex: 1; min-width: 0; }
      .ev-sw { width: 30px; height: 30px; border-radius: 50%; border: 2px solid rgba(255,255,255,.25); cursor: pointer; padding: 0; }
      .ev-sw.sel { outline: 3px solid #ff7a2e; outline-offset: 2px; }
      .ev-extra { border: 1px solid var(--borde, rgba(255,255,255,.12)); border-radius: 12px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
      .ev-patro { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 6px; }
      .ev-patro button { position: relative; background: #fff; border: 2px solid transparent; border-radius: 10px; padding: 6px; height: 56px; cursor: pointer; }
      .ev-patro button img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: auto; }
      .ev-patro button.sel { border-color: #ff7a2e; }
      .ev-patro button i { position: absolute; top: -7px; left: -7px; background: #ff5b00; color: #fff; font-style: normal; font-weight: 800; font-size: .72rem; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; }
      .ev-orden { display: flex; flex-direction: column; gap: 4px; }
      .ev-orden div { display: flex; align-items: center; gap: 6px; font-size: .82rem; }
      .ev-orden div span { flex: 1; }
      .ev-mini { border: 1px solid var(--tiza-borde, rgba(233,238,250,.16)); background: var(--tiza-fondo, rgba(233,238,250,.07)); color: var(--txt-1, #e9eefa); border-radius: 8px; min-width: 30px; height: 28px; cursor: pointer; font: inherit; }
      .ev-final { border-top: 1px solid var(--borde, rgba(255,255,255,.12)); padding-top: 12px; display: flex; flex-direction: column; gap: 8px; }
      .ev-estado { font-size: .82rem; color: var(--txt-2, #9fb0d8); min-height: 1em; }
      .ev-prompt { font-size: .72rem; color: var(--txt-2, #9fb0d8); white-space: pre-wrap; background: rgba(0,0,0,.2); border-radius: 8px; padding: 8px; max-height: 120px; overflow: auto; }
    `;
    document.head.appendChild(s);
  }

  /* ---------- Abrir / cerrar ---------- */
  async function abrir() {
    ponerCss();
    cargarFuentes().then(() => pintar());
    await cargarCatalogos();
    r = {}; imgPrincipal = null; ajuste = { z: 1, ox: 0, oy: 0 };
    capa = document.createElement("div");
    capa.className = "cp-modal";
    capa.setAttribute("role", "dialog"); capa.setAttribute("aria-modal", "true"); capa.setAttribute("aria-label", "Crear cartel de evento");
    capa.style.padding = "12px";
    capa.innerHTML = `
      <div class="cp-modal-box ev-box">
        <div class="ev-cab"><b>🎨 Cartel de evento</b>
          <button type="button" class="btn-close-modal" data-cerrar aria-label="Cerrar">✕</button></div>
        <div class="ev-prev"><canvas id="evLienzo" width="270" height="480" aria-label="Vista previa del cartel"></canvas></div>
        <div class="ev-cuerpo" id="evCuerpo"></div>
      </div>`;
    document.body.appendChild(capa);
    capa.querySelector("[data-cerrar]").onclick = cerrar;
    capa.addEventListener("click", e => { if (e.target === capa) cerrar(); });
    moverFoto(capa.querySelector("#evLienzo"));
    render(true);
  }
  function cerrar() {
    if (capa && (r.titulo || imgPrincipal) && !confirm("¿Cerrar el cartel? Se perderá lo que no hayas descargado.")) return;
    if (capa) capa.remove();
    capa = null;
  }

  /* ---------- La entrevista en pantalla ---------- */
  const contestada = (p) => {
    if (p.tipo === "extras" || p.tipo === "patros") return r[p.id + "_ok"] === true;
    if (p.tipo === "foto") return !!imgPrincipal;
    return r[p.id] !== undefined && r[p.id] !== "";
  };
  const visibles = () => PREGUNTAS.filter(p => !p.cuando || p.cuando(r));

  function opcionesDe(p) {
    if (p.dinamica === "equipaciones") return equipaciones.map(e => ({ v: e.id, e: "👕", t: e.nombre, nota: (e.imagenes || []).length ? "" : "sin foto de referencia aún" }));
    if (p.dinamica === "fuentes") return Object.keys(FUENTES).map(k => ({ v: k, t: FUENTES[k].t, nota: FUENTES[k].nota, fuente: FUENTES[k] }));
    return p.op || [];
  }

  function render(primera) {
    const cuerpo = capa && capa.querySelector("#evCuerpo");
    if (!cuerpo) return;
    const scrollAntes = cuerpo.scrollTop;
    const lista = visibles();
    let html = "", ultimoBloque = "", pendiente = null;
    for (const p of lista) {
      if (p.bloque !== ultimoBloque) { html += `<div class="ev-bloque">${esc(p.bloque)}</div>`; ultimoBloque = p.bloque; }
      html += `<div class="ev-q" data-q="${p.id}">${preguntaHtml(p)}</div>`;
      if (!contestada(p)) { pendiente = p; break; }
    }
    if (!pendiente) html += finalHtml();
    cuerpo.innerHTML = html;
    enlazar(cuerpo);
    if (primera) cuerpo.scrollTop = 0;
    else if (render.saltar) { cuerpo.scrollTop = cuerpo.scrollHeight; render.saltar = false; }
    else cuerpo.scrollTop = scrollAntes;
    pintar();
  }

  function preguntaHtml(p) {
    let q = p.q;
    if (p.id === "titulo" && r.evento && SUGERENCIAS[r.evento] && SUGERENCIAS[r.evento].length) q += " Te propongo alguno:";
    let h = `<div class="ev-burbuja">${esc(q)}${p.nota ? `<small>${esc(p.nota)}</small>` : ""}</div>`;
    const tipo = p.tipo || "chips";
    if (tipo === "chips") {
      h += `<div class="ev-ops">` + opcionesDe(p).map(o => {
        const estiloF = o.fuente ? ` style="font-family:'${o.fuente.f}'; font-size:.95rem;"` : "";
        return `<button type="button" class="ev-op${r[p.id] === o.v ? " sel" : ""}" data-op="${p.id}" data-v="${esc(o.v)}"${estiloF}>${o.e ? o.e + " " : ""}${esc(o.t)}${o.nota ? `<small style="font-family:inherit">${esc(o.nota)}</small>` : ""}</button>`;
      }).join("") + `</div>`;
    } else if (tipo === "dorsal") {
      h += `<div class="ev-ops">` + ["1", "3", "5", "7", "9", "10", "11", "14"].map(n =>
        `<button type="button" class="ev-op${r.dorsal === n ? " sel" : ""}" data-op="dorsal" data-v="${n}">${n}</button>`).join("") + `</div>
        <div class="ev-fila"><input type="number" min="0" max="99" inputmode="numeric" placeholder="Otro número" data-num="dorsal" value="${["1", "3", "5", "7", "9", "10", "11", "14"].includes(r.dorsal) ? "" : esc(r.dorsal || "")}">
        <button type="button" class="ev-mini" data-ok="dorsal">✓</button></div>`;
    } else if (tipo === "texto") {
      const sug = (SUGERENCIAS[r.evento] || []);
      if (sug.length) h += `<div class="ev-ops">` + sug.map(s => `<button type="button" class="ev-op${r.titulo === s ? " sel" : ""}" data-op="titulo" data-v="${esc(s)}">${esc(s)}</button>`).join("") + `</div>`;
      h += `<div class="ev-fila"><input type="text" maxlength="60" placeholder="Escribe el titular" data-txt="${p.id}" value="${esc(r[p.id] || "")}">
        <button type="button" class="ev-mini" data-ok="${p.id}">✓</button></div>`;
    } else if (tipo === "color") {
      h += `<div class="ev-fila">` + COLORES.map(c => `<button type="button" class="ev-sw${r[p.id] === c.v ? " sel" : ""}" style="background:${c.v}" title="${c.t}" aria-label="${c.t}" data-op="${p.id}" data-v="${c.v}"></button>`).join("") +
        `<label style="display:flex;align-items:center;gap:4px;font-size:.8rem;">Otro <input type="color" data-col="${p.id}" value="${esc(r[p.id] || "#ffffff")}"></label></div>`;
    } else if (tipo === "foto") {
      h += `<div class="ev-fila"><label class="ev-op" style="cursor:pointer">📷 ${imgPrincipal ? "Cambiar foto" : "Elegir foto"}<input type="file" accept="image/*" data-foto hidden></label>
        ${imgPrincipal ? `<small style="color:var(--txt-2)">Arrastra sobre la vista previa para moverla.</small>` : ""}</div>`;
      if (imgPrincipal) h += zoomHtml();
    } else if (tipo === "extras") {
      const ex = r.extras || (r.extras = []);
      h += ex.map((x, i) => `<div class="ev-extra">
        <div class="ev-ops">${TIPOS_EXTRA.map(t => `<button type="button" class="ev-op${x.tipo === t.v ? " sel" : ""}" data-ext="${i}" data-tipo="${t.v}">${t.t}</button>`).join("")}</div>
        <div class="ev-fila"><input type="text" maxlength="80" placeholder="${esc(ejemploExtra(x.tipo))}" data-exttxt="${i}" value="${esc(x.t || "")}">
          <button type="button" class="ev-mini" data-extdel="${i}" aria-label="Quitar este texto">🗑️</button></div>
        <div class="ev-fila">Tamaño: ${["s", "m", "l"].map(t => `<button type="button" class="ev-op${x.tam === t ? " sel" : ""}" data-exttam="${i}" data-v="${t}">${{ s: "Pequeño", m: "Mediano", l: "Grande" }[t]}</button>`).join("")}</div>
        <div class="ev-fila">${COLORES.map(c => `<button type="button" class="ev-sw${x.color === c.v ? " sel" : ""}" style="background:${c.v};width:24px;height:24px" aria-label="${c.t}" data-extcol="${i}" data-v="${c.v}"></button>`).join("")}</div>
      </div>`).join("");
      h += `<div class="ev-fila"><button type="button" class="ev-op" data-extadd>➕ Añadir texto</button>
        ${r.extras_ok ? "" : `<button type="button" class="ev-op" data-extok>${ex.length ? "✓ Ya están todos" : "No hace falta, seguimos"}</button>`}</div>`;
    } else if (tipo === "patros") {
      const sel = r.patros || (r.patros = []);
      h += `<div class="ev-patro">` + patrocinadores.map(pt => {
        const n = sel.indexOf(pt.archivo);
        return `<button type="button" class="${n >= 0 ? "sel" : ""}" data-patro="${esc(pt.archivo)}" title="${esc(pt.nombre)}" aria-label="${esc(pt.nombre)}">${n >= 0 ? `<i>${n + 1}</i>` : ""}<img src="Patrocinadores/${esc(pt.archivo)}" alt=""></button>`;
      }).join("") + `</div>`;
      if (sel.length > 1) h += `<div class="ev-orden">` + sel.map((a, i) => `<div><b>${i + 1}.</b><span>${esc((patrocinadores.find(p => p.archivo === a) || {}).nombre || a)}</span>
        <button type="button" class="ev-mini" data-sube="${i}" ${i === 0 ? "disabled" : ""} aria-label="Subir">▲</button>
        <button type="button" class="ev-mini" data-baja="${i}" ${i === sel.length - 1 ? "disabled" : ""} aria-label="Bajar">▼</button></div>`).join("") + `</div>`;
      if (!r.patros_ok) h += `<div class="ev-fila"><button type="button" class="ev-op" data-patrook>${sel.length ? "✓ Estos" : "Sin patrocinadores"}</button></div>`;
    }
    return h;
  }
  function ejemploExtra(t) {
    return { subtitulo: "Ej.: Categorías alevín a juvenil", fecha: "Ej.: Sábado 14 de diciembre", hora: "Ej.: 10:00 h", lugar: "Ej.: Pabellón Municipal de Alzira", precio: "Ej.: Entrada libre", info: "Ej.: Inscripciones en nouvoleialzira.es" }[t] || "Escribe el texto";
  }
  function zoomHtml() {
    return `<label class="ev-fila" style="font-size:.85rem">➖<input type="range" data-zoom min="0.5" max="3" step="0.01" value="${ajuste.z}" style="flex:1">➕
      <button type="button" class="ev-mini" data-centrar>↺</button></label>`;
  }

  function finalHtml() {
    const ia = usaIA(r);
    return `<div class="ev-final">
      <div class="ev-burbuja">¡Ya lo tengo todo! ${ia ? "Pulsa «Generar imagen» y en unos segundos verás la propuesta. Si no te convence, genera otra: cada vez sale distinta." : "Revisa la vista previa y descárgalo."} Puedes tocar cualquier respuesta de arriba para cambiarla.</div>
      ${ia ? `<button type="button" class="btn-save-session" data-generar style="--c: var(--c-violeta)">✨ ${imgPrincipal ? "Generar otra" : "Generar imagen"}</button>
        <div class="ev-estado" id="evEstado"></div>
        <details><summary style="font-size:.78rem;color:var(--txt-2);cursor:pointer">Ver el encargo que recibe la IA</summary><div class="ev-prompt">${esc(construirPrompt())}</div></details>` : ""}
      ${imgPrincipal && r.principal !== "foto" ? zoomHtml() : ""}
      <button type="button" class="btn-save-session" data-bajar style="--c: var(--c-verde)">⬇️ Descargar el cartel</button>
      ${r.formato === "story" && typeof window.igGetToken === "function" && window.igGetToken() && window.nvaStory ? `<button type="button" class="btn-pdf-mode2" data-story>📲 Guardar como borrador de Story</button>` : ""}
      <div class="ev-estado" id="evEstado2"></div>
    </div>`;
  }

  function responder(id, v) {
    const nueva = r[id] === undefined;
    r[id] = v;
    if (id === "formato") ajuste = { z: 1, ox: 0, oy: 0 };
    if (id === "principal" && v !== "foto" && imgPrincipal && imgPrincipal._foto) imgPrincipal = null;
    if (id === "principal" && v === "foto" && imgPrincipal && !imgPrincipal._foto) imgPrincipal = null;
    render.saltar = nueva;
    render();
  }

  function enlazar(c) {
    c.querySelectorAll("[data-op]").forEach(b => b.onclick = () => responder(b.dataset.op, b.dataset.v));
    c.querySelectorAll("[data-txt]").forEach(inp => {
      inp.oninput = () => { r[inp.dataset.txt] = inp.value; pintar(); };
      inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); if (inp.value.trim()) { render.saltar = true; render(); } } };
    });
    c.querySelectorAll("[data-num]").forEach(inp => inp.onkeydown = e => { if (e.key === "Enter" && inp.value !== "") { e.preventDefault(); responder(inp.dataset.num, String(parseInt(inp.value, 10))); } });
    c.querySelectorAll("[data-ok]").forEach(b => b.onclick = () => {
      const id = b.dataset.ok, inp = c.querySelector(`[data-txt="${id}"], [data-num="${id}"]`);
      if (!inp || !inp.value.trim()) return;
      responder(id, inp.dataset.num ? String(parseInt(inp.value, 10)) : inp.value.trim());
    });
    c.querySelectorAll("[data-col]").forEach(inp => inp.oninput = () => { r[inp.dataset.col] = inp.value; pintar(); });
    c.querySelectorAll("[data-col]").forEach(inp => inp.onchange = () => responder(inp.dataset.col, inp.value));
    const foto = c.querySelector("[data-foto]");
    if (foto) foto.onchange = () => {
      const f = foto.files && foto.files[0];
      if (!f) return;
      const i = new Image();
      i.onload = () => { i._foto = true; imgPrincipal = i; ajuste = { z: 1, ox: 0, oy: 0 }; render.saltar = true; render(); };
      i.src = URL.createObjectURL(f);
    };
    const zoom = c.querySelector("[data-zoom]");
    if (zoom) zoom.oninput = () => { ajuste.z = parseFloat(zoom.value); pintar(); };
    const centrar = c.querySelector("[data-centrar]");
    if (centrar) centrar.onclick = () => { ajuste = { z: 1, ox: 0, oy: 0 }; if (zoom) zoom.value = 1; pintar(); };

    // Textos extra
    const ex = r.extras || [];
    c.querySelectorAll("[data-ext]").forEach(b => b.onclick = () => { const x = ex[+b.dataset.ext]; x.tipo = b.dataset.tipo; x.tam = (TIPOS_EXTRA.find(t => t.v === x.tipo) || {}).tam || x.tam; render(); });
    c.querySelectorAll("[data-exttxt]").forEach(inp => inp.oninput = () => { ex[+inp.dataset.exttxt].t = inp.value; pintar(); });
    c.querySelectorAll("[data-exttam]").forEach(b => b.onclick = () => { ex[+b.dataset.exttam].tam = b.dataset.v; render(); });
    c.querySelectorAll("[data-extcol]").forEach(b => b.onclick = () => { ex[+b.dataset.extcol].color = b.dataset.v; render(); });
    c.querySelectorAll("[data-extdel]").forEach(b => b.onclick = () => { ex.splice(+b.dataset.extdel, 1); render(); });
    const add = c.querySelector("[data-extadd]");
    if (add) add.onclick = () => {
      const usados = ex.map(x => x.tipo), sig = TIPOS_EXTRA.find(t => !usados.includes(t.v)) || TIPOS_EXTRA[5];
      ex.push({ tipo: sig.v, t: "", tam: sig.tam, color: "#ffffff" });
      render();
      const ins = c.querySelectorAll("[data-exttxt]"); if (ins.length) ins[ins.length - 1].focus();
    };
    const exOk = c.querySelector("[data-extok]");
    if (exOk) exOk.onclick = () => { r.extras_ok = true; render.saltar = true; render(); };

    // Patrocinadores
    const sel = r.patros || [];
    c.querySelectorAll("[data-patro]").forEach(b => b.onclick = () => {
      const a = b.dataset.patro, n = sel.indexOf(a);
      if (n >= 0) sel.splice(n, 1); else sel.push(a);
      render();
    });
    c.querySelectorAll("[data-sube]").forEach(b => b.onclick = () => { const i = +b.dataset.sube; [sel[i - 1], sel[i]] = [sel[i], sel[i - 1]]; render(); });
    c.querySelectorAll("[data-baja]").forEach(b => b.onclick = () => { const i = +b.dataset.baja; [sel[i + 1], sel[i]] = [sel[i], sel[i + 1]]; render(); });
    const pOk = c.querySelector("[data-patrook]");
    if (pOk) pOk.onclick = () => { r.patros_ok = true; render.saltar = true; render(); };

    const gen = c.querySelector("[data-generar]");
    if (gen) gen.onclick = () => generar(gen);
    const bajar = c.querySelector("[data-bajar]");
    if (bajar) bajar.onclick = descargar;
    const story = c.querySelector("[data-story]");
    if (story) story.onclick = () => guardarStory(story);
  }

  /* ---------- El encargo para la IA ---------- */
  const opt = (id) => { const p = PREGUNTAS.find(x => x.id === id); return p && (p.op || []).find(o => o.v === r[id]); };
  const pr = (id) => (opt(id) || {}).p || "";

  function construirPrompt() {
    const partes = [];
    const estilo = pr("estilo") || "high quality sports artwork";
    if (r.principal === "jugadora") {
      partes.push(`${estilo}. A female volleyball player, ${pr("edad")}, ${pr("rasgos")}, ${pr("complexion")}, ${pr("peloColor")} in a ${pr("peinado")}, ${pr("pose")}. ${pr("plano")}, ${pr("expresion")}.`);
      partes.push(`She wears the club's volleyball kit with the number ${r.dorsal || ""} on the shirt, knee pads and indoor volleyball shoes.`);
    } else if (r.principal === "equipo") {
      partes.push(`${estilo}. ${pr("nJug")}, ${pr("edad")}, ${pr("rasgos")}, ${pr("complexion")}, ${pr("peloColor")}, ${pr("peinado")}, ${pr("poseEq")}. ${pr("plano")}, ${pr("expresion")}.`);
      partes.push("They all wear the same club volleyball kit with different shirt numbers, knee pads and indoor volleyball shoes.");
    } else if (r.principal === "balon") {
      partes.push(`${estilo}. ${pr("balon")}. The volleyball has blue, yellow and white panels.`);
    }
    partes.push(`${pr("fondo")}. ${pr("paleta")}. ${pr("luz")}.`);
    const hueco = { arriba: "the upper third", centro: "a horizontal band across the middle", abajo: "the lower third" }[r.tPos || "arriba"];
    partes.push(`Poster composition: keep ${hueco} of the image clean and uncluttered (it will hold the headline added later), keep the corners free for logos, main subject well framed and not cut at the edges.`);
    partes.push("IMPORTANT: no text, no letters, no words, no logos, no watermarks anywhere in the image" + (r.principal === "jugadora" ? " (only the shirt number)." : "."));
    return partes.join("\n").replace(/ ,/g, ",").replace(/,\s*,/g, ",").replace(/\s+\./g, ".");
  }

  async function generar(btn) {
    const est = capa.querySelector("#evEstado");
    const sb = window.nva && window.nva.cliente;
    if (!sb) { est.textContent = "No hay conexión con Supabase."; return; }
    btn.disabled = true;
    const t0 = Date.now();
    const reloj = setInterval(() => { est.textContent = `🎨 Pintando la imagen… ${Math.round((Date.now() - t0) / 1000)} s`; }, 500);
    try {
      const { data, error } = await sb.functions.invoke("generar-cartel", {
        body: { prompt: construirPrompt(), aspecto: FORMATOS[r.formato].ar, equipacion: esPersona(r) ? r.equip : "", dorsal: r.dorsal || "" }
      });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch (e) { /* sin detalle */ }
        throw new Error(msg);
      }
      if (!data || !data.imagen) throw new Error((data && data.error) || "La IA no devolvió ninguna imagen");
      const i = new Image();
      await new Promise((ok, ko) => { i.onload = ok; i.onerror = () => ko(new Error("La imagen recibida no se puede abrir")); i.src = `data:${data.mime || "image/png"};base64,${data.imagen}`; });
      imgPrincipal = i; ajuste = { z: 1, ox: 0, oy: 0 };
      clearInterval(reloj);
      render();
      const est2 = capa.querySelector("#evEstado");
      if (est2) est2.textContent = `✅ Lista (${Math.round((Date.now() - t0) / 1000)} s). Arrastra sobre la vista previa para encuadrarla.`;
    } catch (e) {
      clearInterval(reloj);
      est.textContent = "❌ " + e.message;
      btn.disabled = false;
    }
  }

  /* ---------- Dibujo del cartel ---------- */
  function pintar() {
    if (!capa) return;
    if (pintar.pend) return;
    pintar.pend = true;
    requestAnimationFrame(() => {
      pintar.pend = false;
      const cv = capa && capa.querySelector("#evLienzo");
      if (!cv) return;
      const F = FORMATOS[r.formato] || FORMATOS.story;
      const esc2 = Math.min(1, 900 / Math.max(F.w, F.h));
      const w = Math.round(F.w * esc2), h = Math.round(F.h * esc2);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      cv.style.aspectRatio = `${F.w} / ${F.h}`;
      componer(cv.getContext("2d"), w, h, true);
    });
  }

  function cover(ctx, img, W, H, a) {
    const s = Math.max(W / img.width, H / img.height) * (a.z || 1);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (W - dw) / 2 + (a.ox || 0) * W, (H - dh) / 2 + (a.oy || 0) * H, dw, dh);
  }

  async function lienzoFinal() {
    await cargarFuentes();
    const F = FORMATOS[r.formato] || FORMATOS.story;
    const cv = document.createElement("canvas");
    cv.width = F.w; cv.height = F.h;
    await componerAsync(cv.getContext("2d"), F.w, F.h);
    return cv;
  }

  // Logos: se cargan antes para poder dibujar de una vez
  async function logosListos() {
    const urls = ["LOGO-NVA.png"].concat((r.patros || []).map(a => "Patrocinadores/" + a));
    await Promise.all(urls.map(cargarImg));
  }
  async function componerAsync(ctx, W, H) { await logosListos(); componer(ctx, W, H, false); }

  function componer(ctx, W, H, previa) {
    const M = Math.min(W, H), mar = M * 0.05;
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // 1. Fondo / imagen central
    if (imgPrincipal) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      cover(ctx, imgPrincipal, W, H, ajuste);
    } else if (r.principal === "tipografia") {
      fondoPlano(ctx, W, H, r.plano2 || "club");
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#0b1a6b"); g.addColorStop(1, "#ff5b00");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (previa) {
        ctx.fillStyle = "rgba(255,255,255,.18)";
        ctx.font = `700 ${M * 0.05}px Barlow, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const t = r.principal === "foto" ? "Aquí irá tu foto" : r.principal ? "Aquí irá la imagen de la IA" : "Vista previa";
        ctx.fillText(t, W / 2, H / 2);
      }
    }

    // 2. Oscurecer donde va el texto (solo sobre imagen)
    const pos = r.tPos || "arriba";
    if (imgPrincipal && (r.titulo || (r.extras || []).some(x => x.t))) {
      const g = pos === "abajo" ? ctx.createLinearGradient(0, H, 0, H * 0.45) : pos === "arriba" ? ctx.createLinearGradient(0, 0, 0, H * 0.55) : null;
      if (g) { g.addColorStop(0, "rgba(0,0,0,.62)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(0, H * 0.3, W, H * 0.4); }
    }

    // 3. Escudo del club
    const logo = imgsListas["LOGO-NVA.png"];
    const lPos = r.logoPos || "sup-centro", lTam = { s: 0.15, m: 0.21, l: 0.29 }[r.logoTam || "m"] * M;
    let logoRect = null;
    if (logo) {
      let lx = (W - lTam) / 2, ly = mar;
      if (lPos === "sup-izq") lx = mar;
      if (lPos === "sup-der") lx = W - mar - lTam;
      if (lPos === "inf-centro") ly = H - mar - lTam;
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = M * 0.02;
      ctx.drawImage(logo, lx, ly, lTam, lTam); ctx.restore();
      logoRect = { x: lx, y: ly, w: lTam, h: lTam };
    } else cargarImg("LOGO-NVA.png").then(i => { if (i) { imgsListas["LOGO-NVA.png"] = i; pintar(); } });

    // 4. Patrocinadores
    const patroRect = dibujarPatros(ctx, W, H, M, mar);

    // 5. Textos
    dibujarTextos(ctx, W, H, M, mar, pos, logoRect, patroRect, lPos);
    ctx.restore();
  }
  const imgsListas = {};
  function imgLista(url) {
    if (imgsListas[url]) return imgsListas[url];
    cargarImg(url).then(i => { if (i) { imgsListas[url] = i; pintar(); } });
    return null;
  }

  function fondoPlano(ctx, W, H, v) {
    if (v === "club") {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, "#0a1f9e"); g.addColorStop(0.6, "#1f3cff"); g.addColorStop(1, "#ff5b00");
      ctx.fillStyle = g;
    } else ctx.fillStyle = { noche: "#0b1236", naranja: "#ff5b00", negro: "#0d0d0d", blanco: "#f7f7f7" }[v] || "#0b1236";
    ctx.fillRect(0, 0, W, H);
  }

  function dibujarPatros(ctx, W, H, M, mar) {
    const sel = r.patros || [];
    if (!sel.length) return null;
    const lista = sel.map(a => imgLista("Patrocinadores/" + a)).filter(Boolean);
    if (!lista.length) return null;
    const esq = r.patroEsq || "inf-der", placa = r.patroPlaca !== "no";
    const base = M * 0.085, gap = M * 0.022;
    const factor = i => Math.max(0.5, 1 - i * 0.16);   // prioridad → tamaño
    const tam = lista.map((img, i) => { const h = base * factor(i), w = Math.min(h * img.width / img.height, M * 0.3 * factor(i)); return { img, w, h: w * img.height / img.width }; });
    const anchoTotal = tam.reduce((s, t) => s + t.w, 0) + gap * (tam.length - 1);
    const alto = Math.max(...tam.map(t => t.h));
    const pad = placa ? M * 0.018 : 0;
    let x0, y0 = H - mar - alto - pad, rect;
    if (esq === "banda") {
      const bandaH = alto + pad * 2 + M * 0.02;
      rect = { x: 0, y: H - bandaH, w: W, h: bandaH };
      if (placa) { ctx.fillStyle = "rgba(255,255,255,.94)"; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
      x0 = (W - anchoTotal) / 2; y0 = rect.y + (bandaH - alto) / 2;
    } else {
      x0 = esq === "inf-izq" ? mar + pad : W - mar - pad - anchoTotal;
      rect = { x: x0 - pad, y: y0 - pad, w: anchoTotal + pad * 2, h: alto + pad * 2 };
      if (placa) { ctx.fillStyle = "rgba(255,255,255,.94)"; redondo(ctx, rect.x, rect.y, rect.w, rect.h, M * 0.02); ctx.fill(); }
    }
    // El más importante, pegado a la esquina
    const orden = esq === "inf-der" ? tam.slice().reverse() : tam;
    let x = x0;
    orden.forEach(t => { ctx.drawImage(t.img, x, y0 + (alto - t.h) / 2, t.w, t.h); x += t.w + gap; });
    return rect;
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
  function partirLineas(ctx, texto, maxW) {
    const palabras = texto.split(/\s+/).filter(Boolean), lineas = [];
    let act = "";
    palabras.forEach(p => {
      const prueba = act ? act + " " + p : p;
      if (ctx.measureText(prueba).width > maxW && act) { lineas.push(act); act = p; } else act = prueba;
    });
    if (act) lineas.push(act);
    return lineas;
  }

  function dibujarTextos(ctx, W, H, M, mar, pos, logoRect, patroRect, lPos) {
    const bloques = [];
    const maxW = W - mar * 2.4;
    if (r.titulo && r.titulo.trim()) {
      const clave = r.tFuente || "impacto";
      let px = { xl: 0.17, l: 0.13, m: 0.095, s: 0.07 }[r.tTam || "l"] * M;
      const mayus = !["elegante", "brush"].includes(clave);
      const texto = mayus ? r.titulo.toUpperCase() : r.titulo;
      let lineas;
      for (let i = 0; i < 30; i++) {
        ctx.font = fuenteCss(clave, px);
        lineas = partirLineas(ctx, texto, maxW);
        if (lineas.length <= 3 && lineas.every(l => ctx.measureText(l).width <= maxW)) break;
        px *= 0.92;
      }
      bloques.push({ lineas, px, clave, color: r.tColor || "#ffffff", estilo: r.tEstilo || "sombra", alto: px * 0.98, titulo: true });
    }
    const clave2 = !r.f2 || r.f2 === "igual" ? (r.tFuente || "texto") : r.f2;
    (r.extras || []).filter(x => x.t && x.t.trim()).forEach(x => {
      const px = { s: 0.045, m: 0.058, l: 0.078 }[x.tam || "m"] * M;
      ctx.font = fuenteCss(clave2, px);
      const lineas = partirLineas(ctx, x.t.trim(), maxW);
      bloques.push({ lineas, px, clave: clave2, color: x.color || "#ffffff", estilo: "sombra", alto: px * 1.2 });
    });
    if (!bloques.length) return;

    const sep = M * 0.025;
    const altoTotal = bloques.reduce((s, b) => s + b.lineas.length * b.alto, 0) + sep * (bloques.length - 1);
    let arribaLibre = mar, abajoLibre = H - mar;
    if (logoRect && lPos !== "inf-centro") arribaLibre = Math.max(arribaLibre, logoRect.y + logoRect.h + M * 0.03);
    if (logoRect && lPos === "inf-centro") abajoLibre = Math.min(abajoLibre, logoRect.y - M * 0.03);
    if (patroRect) abajoLibre = Math.min(abajoLibre, patroRect.y - M * 0.03);
    let y = pos === "arriba" ? arribaLibre : pos === "abajo" ? abajoLibre - altoTotal : (H - altoTotal) / 2;
    y = Math.max(mar, y);

    ctx.textAlign = "center"; ctx.textBaseline = "top";
    bloques.forEach(b => {
      b.lineas.forEach(l => { linea(ctx, l, W / 2, y, b); y += b.alto; });
      y += sep;
    });
  }

  function linea(ctx, txt, cx, y, b) {
    const px = b.px;
    ctx.font = fuenteCss(b.clave, px);
    const ancho = ctx.measureText(txt).width;
    ctx.save();
    ctx.lineJoin = "round";
    const color = b.color;
    const oscuro = esOscuro(color);
    if (b.estilo === "cinta") {
      const padX = px * 0.25, padY = px * 0.08;
      ctx.fillStyle = oscuro ? "#ffffff" : (color.toLowerCase() === "#ff5b00" ? "#1f3cff" : "#ff5b00");
      ctx.save(); ctx.translate(cx, y + b.alto / 2); ctx.rotate(-0.03);
      ctx.fillRect(-ancho / 2 - padX, -b.alto / 2 + padY * 0.3, ancho + padX * 2, b.alto - padY);
      ctx.restore();
    }
    if (b.estilo === "sombra" || b.estilo === "cinta") {
      if (b.estilo === "sombra") { ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = px * 0.12; ctx.shadowOffsetY = px * 0.04; }
      ctx.fillStyle = color; ctx.fillText(txt, cx, y);
    } else if (b.estilo === "contorno") {
      ctx.lineWidth = px * 0.12; ctx.strokeStyle = oscuro ? "#ffffff" : "#0b1236"; ctx.strokeText(txt, cx, y);
      ctx.fillStyle = color; ctx.fillText(txt, cx, y);
    } else if (b.estilo === "hueco") {
      ctx.lineWidth = Math.max(2, px * 0.045); ctx.strokeStyle = color; ctx.strokeText(txt, cx, y);
    } else if (b.estilo === "degradado") {
      const g = ctx.createLinearGradient(0, y, 0, y + px);
      g.addColorStop(0, "#ff8a3d"); g.addColorStop(0.5, "#ff5b00"); g.addColorStop(1, "#1f3cff");
      ctx.lineWidth = px * 0.1; ctx.strokeStyle = "#ffffff"; ctx.strokeText(txt, cx, y);
      ctx.fillStyle = g; ctx.fillText(txt, cx, y);
    } else if (b.estilo === "3d") {
      const prof = Math.max(3, Math.round(px * 0.07));
      ctx.fillStyle = oscuro ? "#cfd6ff" : "#0b1236";
      for (let i = prof; i > 0; i--) ctx.fillText(txt, cx + i * 0.8, y + i);
      ctx.fillStyle = color; ctx.fillText(txt, cx, y);
    } else { ctx.fillStyle = color; ctx.fillText(txt, cx, y); }
    ctx.restore();
  }
  function esOscuro(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return false;
    const n = parseInt(m[1], 16), rr = n >> 16, g = (n >> 8) & 255, bb = n & 255;
    return (0.299 * rr + 0.587 * g + 0.114 * bb) < 110;
  }

  /* ---------- Mover la imagen con el dedo ---------- */
  function moverFoto(cv) {
    let ini = null;
    cv.addEventListener("pointerdown", e => {
      if (!imgPrincipal) return;
      ini = { x: e.clientX, y: e.clientY, ox: ajuste.ox, oy: ajuste.oy };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", e => {
      if (!ini) return;
      const rc = cv.getBoundingClientRect();
      ajuste.ox = ini.ox + (e.clientX - ini.x) / rc.width;
      ajuste.oy = ini.oy + (e.clientY - ini.y) / rc.height;
      pintar();
    });
    const fin = () => { ini = null; };
    cv.addEventListener("pointerup", fin); cv.addEventListener("pointercancel", fin);
  }

  /* ---------- Guardar ---------- */
  function nombreArchivo() {
    const base = (r.titulo || "evento").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    return `cartel-${base || "evento"}.png`;
  }
  async function descargar() {
    const est = capa.querySelector("#evEstado2");
    est.textContent = "Preparando el cartel…";
    const cv = await lienzoFinal();
    const blob = await new Promise(ok => cv.toBlob(ok, "image/png"));
    const nombre = nombreArchivo();
    const file = new File([blob], nombre, { type: "image/png" });
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
        [{ blob, final: blob }], { tipo: "evento", titulo: r.titulo || "Evento" }, t => { est.textContent = t; });
      est.textContent = "✅ Guardado en Stories como borrador. Revísalo allí antes de publicarlo.";
      if (typeof window.igHistoriasCargar === "function") window.igHistoriasCargar();
    } catch (e) {
      est.textContent = "❌ " + e.message;
      btn.disabled = false;
    }
  }

  window.evAbrirCartel = abrir;
  window.evCartel = { construirPrompt, _estado: () => r, _responder: responder };
})();
