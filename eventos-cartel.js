/* =====================================================================
   Redes Sociales › EVENTOS: cartel de un evento por capas.

   1. Entrevista por secciones (se pliegan al terminarlas). Todas las
      preguntas tienen «✏️ Otro» para escribir lo que se quiera.
      · El cartel: evento y formato.
      · Imagen de fondo  → encargo (prompt) para crearla y subirla.
      · Personaje principal → encargo para crearlo sobre fondo verde y
        subirlo; la app quita ese fondo para usarlo como capa.
      · Escudo y patrocinadores.
   2. Montaje por capas: el fondo es siempre la capa 1; personaje, escudo,
      patrocinadores y textos se ordenan en la lista de capas. Cada capa se
      mueve con el dedo y sus esquinas sirven para girar (⟳), cambiar el
      tamaño (⤡) y la opacidad (◐).
   La imagen también se puede generar desde la app con la función de
   Supabase «generar-cartel» si está configurada.

   Modo «Cartel con estilo» (evAbrirCartel("ia")): la entrevista pregunta por
   el escenario, la protagonista y los textos, enseña bocetos de diez estilos
   (eventos-estilos.js) y monta un único encargo para que la IA haga el cartel
   entero. El cartel subido pasa al mismo montaje por capas para ponerle el
   escudo, los patrocinadores y los escudos de los equipos.
   Si el evento es un partido, se elige entre los próximos del calendario y se
   usan sus escudos, fecha, hora y campo.
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
  // Si el evento es un partido: los próximos del calendario
  const PREG_PARTIDO = { id: "partido", tipo: "partido", cuando: () => r.evento === "partido", q: "¿Qué partido es? Estos son los próximos del calendario.", nota: "Uso los escudos de los dos equipos, la fecha, la hora y el campo." };
  SECCIONES[0].preguntas.splice(1, 0, PREG_PARTIDO);

  /* ---------- «Cartel con estilo»: la IA hace el cartel entero ---------- */
  const P = id => SECCIONES.reduce((a, s) => a.concat(s.preguntas), []).find(p => p.id === id);
  const TEXTOS_IA = [
    { id: "titulo", tipo: "texto", q: "Vamos con los textos: los escribes tú y saldrán tal cual. ¿Cuál es el título grande?", ph: "Por ejemplo: GRAN FINAL", nota: "Mejor corto: una o dos palabras lucen más." },
    { id: "subtitulo", tipo: "texto", opcional: true, q: "¿Una frase o categoría que acompañe al título?", ph: "Por ejemplo: Liga autonómica cadete" },
    { id: "vs", tipo: "texto", opcional: true, q: "¿Quién juega? Escríbelo como «local vs visitante».", ph: "Por ejemplo: NVA vs CV Xàtiva" },
    { id: "fecha", tipo: "texto", opcional: true, q: "¿Qué día?", ph: "Por ejemplo: Sábado 24 de mayo" },
    { id: "hora", tipo: "texto", opcional: true, q: "¿A qué hora?", ph: "Por ejemplo: 18:00 h" },
    { id: "lugar", tipo: "texto", opcional: true, q: "¿Dónde es?", ph: "Por ejemplo: Pabellón Municipal de Alzira" },
    { id: "extra", tipo: "texto", largo: true, opcional: true, q: "¿Algo más? Precio, inscripciones, un lema…", ph: "Por ejemplo: Entrada libre. ¡Te esperamos!" },
    { id: "redes", tipo: "texto", opcional: true, q: "¿Web, Instagram o contacto?", ph: "Por ejemplo: @nouvoleialzira" }
  ];
  const COLORES_RIVAL = [
    { v: "rojo", t: "Rojo", c: "#c1121f", p: "a red kit" }, { v: "verde", t: "Verde", c: "#1b8a3a", p: "a green kit" },
    { v: "amarillo", t: "Amarillo", c: "#e0b000", p: "a yellow kit" }, { v: "negro", t: "Negro", c: "#1a1a1a", p: "a black kit" },
    { v: "blanco", t: "Blanco", c: "#d9dde6", p: "a white kit" }, { v: "morado", t: "Morado", c: "#6a1b9a", p: "a purple kit" },
    { v: "celeste", t: "Celeste", c: "#4fa8e0", p: "a sky-blue kit" }
  ];
  const estiloElegido = () => window.evEstilos && window.evEstilos.LISTA.find(e => e.v === r.estiloCartel);
  const SECCIONES_IA = [
    { id: "cartel", t: "🗂️ El cartel", preguntas: [P("evento"), PREG_PARTIDO, P("formato")] },
    { id: "fondo", t: "🌄 El escenario", preguntas: [
      { id: "fTipo", q: "Empecemos por el escenario. ¿Qué se ve detrás?", nota: "El estilo del cartel lo eliges al final; esto es lo que habrá detrás.",
        op: P("fTipo").op.filter(o => o.v !== "sin").concat([{ v: "liso", e: "🎨", t: "Fondo liso con textura", p: "a plain textured backdrop" }]) },
      P("fPaleta"), P("fLuz"), P("fAmb")
    ] },
    { id: "pers", t: "🙋‍♀️ Protagonista", preguntas: [
      Object.assign({}, P("pTipo"), { q: "¿Quién protagoniza el cartel?", op: P("pTipo").op.map(o => o.v === "ninguno" ? { v: "ninguno", e: "🚫", t: "Nadie, solo ambiente" } : o) })
    ].concat(["equip", "dorsal", "nJug", "edad", "rasgos", "complexion", "peloColor", "peinado", "pose", "poseEq", "balon", "plano", "expresion"].map(P)) },
    { id: "textos", t: "🔤 Títulos y textos", preguntas: TEXTOS_IA },
    { id: "logos", t: "🛡️ Escudo y patrocinadores", preguntas: [Object.assign({}, P("patros"), {
      q: "El escudo del club y los patrocinadores los pongo yo encima del cartel. ¿Qué patrocinadores salen? Tócalos por orden de importancia.", nota: "El encargo le pide a la IA que les deje sitio." })] },
    { id: "estilo", t: "✨ Estilo del cartel", preguntas: [
      { id: "estiloCartel", tipo: "estilo", q: "Con todo esto, ¿qué estilo de cartel te gusta más?", nota: "Son bocetos con tus textos. La imagen de verdad la hará la IA." },
      { id: "rivalColor", q: "Este estilo enfrenta a dos jugadoras. ¿De qué color viste el rival?", cuando: () => !!(estiloElegido() || {}).duo, op: COLORES_RIVAL },
      { id: "acabado", q: "¿Y el acabado de la imagen?", op: [{ v: "auto", e: "✨", t: "El que pida el estilo", p: "" }].concat(ESTILOS) }
    ] },
    { id: "encargo", t: "📋 El encargo", preguntas: [{ id: "cartelImg", tipo: "imagen", capa: "fondo", ia: true }] }
  ];
  let modo = "capas";
  const SECC = () => modo === "ia" ? SECCIONES_IA : SECCIONES;

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
  let partidos = null, partidoSel = null, cargandoPartidos = false;

  // Capas del montaje. El fondo es siempre la capa 1; el resto se ordena en E.orden
  // (de atrás hacia delante) y cada texto tiene su propio id.
  let idTexto = 0;
  function capasIniciales() {
    return {
      fondo: { z: 1, ox: 0, oy: 0, op: 1 },
      pers: { x: 0.5, y: 0.6, s: 0.72, rot: 0, op: 1, flip: false },
      logo: { x: 0.5, y: 0.09, s: 0.2, rot: 0, op: 1 },
      escL: { x: 0.28, y: 0.8, s: 0.17, rot: 0, op: 1 },
      escV: { x: 0.72, y: 0.8, s: 0.17, rot: 0, op: 1 },
      patros: { x: 0.74, y: 0.93, s: 1, rot: 0, op: 1, placa: true },
      textos: [],
      orden: ["pers", "escL", "escV", "logo", "patros"],
      ocultas: {}
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

  /* ---------- Estilos de la ventana ----------
     Idea: un «banquillo de diseño» con la pista de vóley como referencia. Fondo azul
     noche de la app, el naranja del club solo para lo que se toca (selección, tiradores,
     botón principal) y líneas de pista blancas finas. Títulos en Barlow Condensed
     cursiva, como un marcador. */
  function ponerCss() {
    if (document.getElementById("evCss")) return;
    const s = document.createElement("style");
    s.id = "evCss";
    s.textContent = `
      .ev-modal { padding: 0 !important; align-items: stretch !important; }
      .ev-box { --ev-noche: #0b1430; --ev-pista: #111d45; --ev-pista2: #172656; --ev-linea: rgba(233,238,250,.14); --ev-tiza: #e9eefa; --ev-gris: #9fb0d8; --ev-naranja: #ff5b00; --ev-naranja2: #ff8a3d; --ev-azul: #2f4dff;
        max-width: 620px !important; width: 100%; margin: 0 auto; padding: 0 !important; display: flex; flex-direction: column; overflow: hidden !important;
        height: 100dvh; max-height: 100dvh !important; border-radius: 0 !important; background: var(--ev-noche) !important; border: 0 !important; color: var(--ev-tiza); }
      @media (min-width: 640px) { .ev-modal { padding: 16px !important; } .ev-box { height: calc(100dvh - 32px); border-radius: 20px !important; border: 1px solid var(--ev-linea) !important; } }
      .ev-cab { display: flex; align-items: center; gap: 12px; padding: 10px 12px 8px 16px; }
      .ev-cab h3 { margin: 0; flex: 1; font-family: "Barlow Condensed", var(--font-display); font-style: italic; font-weight: 800; font-size: 1.35rem; letter-spacing: .01em; color: #fff; }
      .ev-pasos { display: flex; gap: 4px; padding: 0 16px 10px; }
      .ev-pasos span { flex: 1; height: 4px; border-radius: 4px; background: var(--ev-linea); position: relative; }
      .ev-pasos span.hecho { background: var(--ev-tiza); }
      .ev-pasos span.ahora { background: var(--ev-naranja); }
      .ev-escena { flex: none; position: relative; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 6px; padding: 12px;
        background: radial-gradient(ellipse at 50% 120%, rgba(47,77,255,.22), transparent 60%), repeating-linear-gradient(90deg, transparent 0 47px, rgba(233,238,250,.035) 47px 48px), var(--ev-pista); border-block: 1px solid var(--ev-linea); }
      .ev-escena canvas { display: block; max-height: 42dvh; max-width: 100%; border-radius: 6px; box-shadow: 0 18px 40px rgba(0,0,0,.55); touch-action: none; }
      .ev-sel { position: absolute; pointer-events: none; outline: 2px solid var(--ev-naranja); outline-offset: 0; transform-origin: center; }
      .ev-sel::before, .ev-sel::after { content: ""; position: absolute; inset: -7px; border: 2px solid transparent; border-radius: 2px; pointer-events: none;
        background: linear-gradient(var(--ev-naranja), var(--ev-naranja)) top left / 14px 2px no-repeat, linear-gradient(var(--ev-naranja), var(--ev-naranja)) top left / 2px 14px no-repeat,
                    linear-gradient(var(--ev-naranja), var(--ev-naranja)) bottom right / 14px 2px no-repeat, linear-gradient(var(--ev-naranja), var(--ev-naranja)) bottom right / 2px 14px no-repeat; }
      .ev-h { position: absolute; width: 34px; height: 34px; margin: -17px; border-radius: 50%; border: 2px solid #fff; background: var(--ev-naranja); color: #fff; font-size: 15px; line-height: 1; display: grid; place-items: center; pointer-events: auto; touch-action: none; cursor: grab; box-shadow: 0 3px 10px rgba(0,0,0,.45); padding: 0; }
      .ev-h:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
      .ev-h[data-h="accion"] { top: 0; left: 0; background: var(--ev-pista2); }
      .ev-h[data-h="rot"] { top: 0; left: 100%; }
      .ev-h[data-h="esc"] { top: 100%; left: 100%; }
      .ev-h[data-h="op"] { top: 100%; left: 0; background: var(--ev-azul); }
      .ev-medida { position: absolute; left: 50%; top: -38px; transform: translateX(-50%); background: rgba(5,10,30,.85); color: #fff; font: 700 .78rem Barlow, sans-serif; padding: 4px 9px; border-radius: 999px; white-space: nowrap; opacity: 0; transition: opacity .15s; }
      .ev-medida.ver { opacity: 1; }
      .ev-ayuda { text-align: center; font-size: .72rem; line-height: 1.3; color: var(--ev-gris); pointer-events: none; max-width: 40ch; }
      .ev-ayuda:empty { display: none; }
      .ev-box [hidden] { display: none !important; }
      .ev-barra { flex: none; display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--ev-linea); overflow-x: auto; }
      .ev-barra button { flex: 1 0 auto; display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--ev-linea); background: rgba(233,238,250,.05); color: var(--ev-tiza); font: 700 .84rem Barlow, sans-serif; cursor: pointer; }
      .ev-barra button.prim { background: var(--ev-naranja); border-color: var(--ev-naranja); color: #fff; }
      .ev-barra button[aria-pressed="true"] { border-color: var(--ev-naranja2); background: rgba(255,91,0,.16); }
      .ev-cuerpo { flex: 1; overflow-y: auto; padding: 12px 12px 28px; display: flex; flex-direction: column; gap: 10px; overscroll-behavior: contain; }
      .ev-sec { flex: none; border-radius: 16px; background: var(--ev-pista); border: 1px solid var(--ev-linea); overflow: hidden; }
      .ev-sec-cab { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: none; border: 0; color: #fff; font: inherit; cursor: pointer; text-align: left; }
      .ev-sec-ico { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; background: var(--ev-pista2); border: 1px solid var(--ev-linea); }
      .ev-sec.hecha .ev-sec-ico { background: var(--ev-tiza); color: var(--ev-noche); }
      .ev-sec-cab .t { flex: 1; min-width: 0; font-family: "Barlow Condensed", var(--font-display); font-style: italic; font-weight: 800; font-size: 1.08rem; }
      .ev-sec-cab small { display: block; font-family: Barlow, sans-serif; font-style: normal; font-weight: 400; color: var(--ev-gris); font-size: .76rem; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ev-sec-cab .fl { color: var(--ev-gris); transition: transform .2s; }
      .ev-sec-cab[aria-expanded="true"] .fl { transform: rotate(90deg); }
      .ev-sec-cuerpo { padding: 2px 14px 14px; display: flex; flex-direction: column; gap: 14px; }
      .ev-q { display: flex; flex-direction: column; gap: 9px; }
      .ev-q.nueva { animation: evEntra .3s ease; }
      @keyframes evEntra { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) { .ev-q.nueva { animation: none; } .ev-sec-cab .fl { transition: none; } }
      .ev-dice { display: flex; gap: 8px; align-items: flex-start; }
      .ev-dice img { flex: none; width: 26px; height: 26px; border-radius: 50%; background: #fff; }
      .ev-dice p { margin: 0; font-size: .92rem; line-height: 1.38; color: var(--ev-tiza); }
      .ev-dice p small { display: block; color: var(--ev-gris); font-size: .78rem; margin-top: 2px; }
      .ev-ops { display: flex; flex-wrap: wrap; gap: 6px; padding-left: 34px; }
      .ev-op { border: 1px solid var(--ev-linea); background: rgba(233,238,250,.05); color: var(--ev-tiza); border-radius: 999px; padding: 8px 13px; font: 500 .84rem Barlow, sans-serif; cursor: pointer; min-height: 36px; }
      .ev-op:hover { border-color: rgba(233,238,250,.3); }
      .ev-op.sel { background: var(--ev-naranja); border-color: var(--ev-naranja); color: #fff; font-weight: 700; }
      .ev-op.otro { border-style: dashed; }
      .ev-fila { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .ev-q > .ev-fila, .ev-q > .ev-eqs, .ev-q > .ev-patro, .ev-q > .ev-orden, .ev-q > .ev-prompt { margin-left: 34px; }
      .ev-fila input[type=text], .ev-fila input[type=number] { flex: 1; min-width: 0; min-height: 38px; }
      .ev-mini { border: 1px solid var(--ev-linea); background: rgba(233,238,250,.05); color: var(--ev-tiza); border-radius: 10px; min-width: 36px; height: 36px; cursor: pointer; font: 600 .82rem Barlow, sans-serif; padding: 0 10px; }
      .ev-mini.sel { border-color: var(--ev-naranja); background: rgba(255,91,0,.18); }
      .ev-mini:disabled { opacity: .35; cursor: default; }
      .ev-eqs { display: grid; grid-template-columns: repeat(auto-fill, minmax(138px, 1fr)); gap: 8px; }
      .ev-eq { border: 2px solid var(--ev-linea); border-radius: 14px; padding: 6px; display: flex; flex-direction: column; gap: 5px; background: rgba(233,238,250,.04); }
      .ev-eq.sel { border-color: var(--ev-naranja); }
      .ev-eq-img { display: flex; gap: 2px; background: #fff; border: 0; border-radius: 10px; height: 92px; padding: 4px; cursor: pointer; align-items: center; justify-content: center; }
      .ev-eq-img img { flex: 1; min-width: 0; max-height: 100%; object-fit: contain; }
      .ev-eq-img span { color: #555; font-size: .8rem; }
      .ev-eq-nom { font-size: .84rem; font-weight: 700; text-align: center; }
      .ev-eq-acc { display: flex; gap: 4px; justify-content: center; }
      .ev-patro { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
      .ev-patro button { position: relative; background: #fff; border: 3px solid transparent; border-radius: 12px; padding: 6px; height: 58px; cursor: pointer; }
      .ev-patro button img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: auto; }
      .ev-patro button.sel { border-color: var(--ev-naranja); }
      .ev-patro button i { position: absolute; top: -9px; left: -9px; background: var(--ev-naranja); color: #fff; font-style: normal; font-weight: 800; font-size: .74rem; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; border: 2px solid var(--ev-noche); }
      .ev-orden { display: flex; flex-direction: column; gap: 4px; }
      .ev-orden div { display: flex; align-items: center; gap: 6px; font-size: .84rem; }
      .ev-orden div span { flex: 1; }
      .ev-prompt { font-size: .76rem; line-height: 1.45; color: var(--ev-tiza); white-space: pre-wrap; background: rgba(0,0,0,.28); border: 1px solid var(--ev-linea); border-radius: 12px; padding: 10px; max-height: 180px; overflow: auto; user-select: text; -webkit-user-select: text; }
      .ev-estado { font-size: .8rem; color: var(--ev-gris); }
      .ev-acc { display: flex; gap: 6px; flex-wrap: wrap; margin-left: 34px; }
      .ev-acc > * { flex: 1 1 140px; }
      .ev-boton { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 42px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--ev-linea); background: rgba(233,238,250,.06); color: var(--ev-tiza); font: 700 .86rem Barlow, sans-serif; cursor: pointer; }
      .ev-boton.prim { background: var(--ev-naranja); border-color: var(--ev-naranja); color: #fff; }
      .ev-panel { flex: none; border-radius: 16px; background: var(--ev-pista); border: 1px solid var(--ev-linea); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
      .ev-panel h4 { margin: 0; font-family: "Barlow Condensed", var(--font-display); font-style: italic; font-weight: 800; font-size: 1.08rem; color: #fff; display: flex; align-items: center; gap: 8px; }
      .ev-panel h4 small { margin-left: auto; font-family: Barlow, sans-serif; font-style: normal; font-weight: 400; font-size: .74rem; color: var(--ev-gris); }
      .ev-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
      .ev-lista li { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 4px; border-radius: 12px; border: 1px solid transparent; background: rgba(233,238,250,.04); touch-action: pan-y; }
      .ev-lista li.sel { border-color: var(--ev-naranja); background: rgba(255,91,0,.12); }
      .ev-lista li.arrastrando { opacity: .9; box-shadow: 0 8px 22px rgba(0,0,0,.5); position: relative; z-index: 2; background: var(--ev-pista2); }
      .ev-lista li.fija { opacity: .75; }
      .ev-lista .asa { width: 34px; height: 38px; border: 0; background: none; color: var(--ev-gris); font-size: 18px; cursor: grab; touch-action: none; }
      .ev-lista .num { flex: none; width: 22px; text-align: center; font: 800 .8rem "Barlow Condensed", sans-serif; color: var(--ev-gris); }
      .ev-lista .nom { flex: 1; min-width: 0; text-align: left; background: none; border: 0; color: var(--ev-tiza); font: 600 .88rem Barlow, sans-serif; padding: 8px 2px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ev-lista .ojo { border: 0; background: none; font-size: 16px; width: 34px; height: 34px; cursor: pointer; color: var(--ev-tiza); }
      .ev-lista .ojo[aria-pressed="false"] { opacity: .35; }
      .ev-fuentes { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
      .ev-fuentes button { flex: none; min-width: 64px; height: 52px; border-radius: 12px; border: 1px solid var(--ev-linea); background: rgba(233,238,250,.05); color: #fff; font-size: 1.3rem; cursor: pointer; padding: 0 10px; }
      .ev-fuentes button.sel { border-color: var(--ev-naranja); background: rgba(255,91,0,.18); }
      .ev-colores { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .ev-colores button { width: 32px; height: 32px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); cursor: pointer; padding: 0; }
      .ev-colores button.sel { outline: 3px solid var(--ev-naranja); outline-offset: 2px; }
      .ev-colores input[type=color] { width: 36px; height: 36px; border: 0; background: none; padding: 0; }
      .ev-panel textarea { width: 100%; min-height: 64px; resize: vertical; font: 600 1rem Barlow, sans-serif; border-radius: 12px; padding: 10px; }
      .ev-tog { display: flex; gap: 6px; flex-wrap: wrap; }
      .ev-tog button { border: 1px solid var(--ev-linea); background: rgba(233,238,250,.05); color: var(--ev-tiza); border-radius: 999px; padding: 7px 12px; font: 600 .82rem Barlow, sans-serif; cursor: pointer; }
      .ev-tog button[aria-pressed="true"] { background: var(--ev-tiza); color: var(--ev-noche); border-color: var(--ev-tiza); }
      .ev-fila textarea { flex: 1; min-width: 0; min-height: 60px; resize: vertical; font: 500 .95rem Barlow, sans-serif; border-radius: 10px; padding: 8px 10px; }
      .ev-q > .ev-estilos, .ev-q > .ev-partidos { margin-left: 34px; }
      .ev-estilos { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
      .ev-estilo { display: flex; flex-direction: column; gap: 4px; padding: 6px 6px 10px; border-radius: 14px; border: 2px solid var(--ev-linea); background: rgba(233,238,250,.04); color: var(--ev-tiza); text-align: left; cursor: pointer; font: inherit; }
      .ev-estilo canvas { width: 100%; height: auto; border-radius: 8px; display: block; background: #000; }
      .ev-estilo b { font-family: "Barlow Condensed", var(--font-display); font-style: italic; font-weight: 800; font-size: 1.02rem; color: #fff; padding: 2px 2px 0; }
      .ev-estilo small { font-size: .74rem; line-height: 1.3; color: var(--ev-gris); padding: 0 2px; }
      .ev-estilo.sel { border-color: var(--ev-naranja); background: rgba(255,91,0,.12); }
      .ev-partidos { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto; }
      .ev-partido { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 4px 8px; padding: 10px; border-radius: 14px; border: 2px solid var(--ev-linea); background: rgba(233,238,250,.04); color: var(--ev-tiza); cursor: pointer; font: inherit; }
      .ev-partido .eq { display: flex; align-items: center; gap: 6px; min-width: 0; font: 800 italic .9rem "Barlow Condensed", sans-serif; }
      .ev-partido .eq:last-of-type { flex-direction: row-reverse; text-align: right; }
      .ev-partido .eq span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ev-partido img { flex: none; width: 30px; height: 30px; object-fit: contain; }
      .ev-partido > b { color: var(--ev-naranja2); font: 800 italic .85rem "Barlow Condensed", sans-serif; }
      .ev-partido small { grid-column: 1 / -1; text-align: center; color: var(--ev-gris); font-size: .74rem; }
      .ev-partido.sel { border-color: var(--ev-naranja); background: rgba(255,91,0,.12); }
      .ev-box :focus-visible { outline: 2px solid var(--ev-naranja2); outline-offset: 2px; }
    `;
    document.head.appendChild(s);
  }

  /* ---------- Abrir / cerrar ---------- */
  async function abrir(m) {
    modo = m === "ia" ? "ia" : "capas";
    partidos = null; partidoSel = null;
    ponerCss();
    cargarFuentes().then(() => { pintar(); if (capa) dibujarMinis(); });
    r = {}; abiertas = {}; img.fondo = img.pers = img.persOrig = null; E = capasIniciales(); sel = "fondo"; panel = "capas";
    quitarFondo = { activo: true, tol: 70, color: null };
    capa = document.createElement("div");
    capa.className = "cp-modal ev-modal";
    capa.setAttribute("role", "dialog"); capa.setAttribute("aria-modal", "true"); capa.setAttribute("aria-label", "Crear cartel de evento");
    capa.innerHTML = `
      <div class="cp-modal-box ev-box">
        <div class="ev-cab"><h3>${modo === "ia" ? "Cartel con estilo" : "Cartel de evento"}</h3>
          <button type="button" class="btn-close-modal" data-cerrar aria-label="Cerrar">✕</button></div>
        <div class="ev-pasos" id="evPasos" aria-hidden="true"></div>
        <div class="ev-escena" id="evEscena">
          <canvas id="evLienzo" width="270" height="480" aria-label="Vista previa del cartel. Toca una capa para elegirla y arrástrala para moverla."></canvas>
          <div class="ev-sel" id="evSel" hidden>
            <button type="button" class="ev-h" data-h="accion" aria-label="Editar"></button>
            <button type="button" class="ev-h" data-h="rot" aria-label="Girar (arrastra)">⟳</button>
            <button type="button" class="ev-h" data-h="esc" aria-label="Tamaño (arrastra)">⤡</button>
            <button type="button" class="ev-h" data-h="op" aria-label="Opacidad (arrastra arriba o abajo)">◐</button>
            <span class="ev-medida" id="evMedida"></span>
          </div>
          <div class="ev-ayuda" id="evAyuda"></div>
        </div>
        <div class="ev-barra" id="evBarra" hidden></div>
        <div class="ev-cuerpo" id="evCuerpo"><div class="ev-estado">Cargando…</div></div>
      </div>`;
    document.body.appendChild(capa);
    capa.querySelector("[data-cerrar]").onclick = cerrar;
    tocarLienzo(capa.querySelector("#evLienzo"));
    tiradores(capa.querySelector("#evSel"));
    window.addEventListener("resize", colocarSeleccion);
    await cargarCatalogos();
    render(true);
  }
  function cerrar() {
    if (capa && (img.fondo || img.pers || E.textos.length) && !confirm("¿Cerrar el cartel? Se perderá lo que no hayas descargado.")) return;
    window.removeEventListener("resize", colocarSeleccion);
    if (capa) capa.remove();
    capa = null;
  }

  /* ---------- Respuestas ---------- */
  const visible = p => !p.cuando || p.cuando();
  function contestada(p) {
    if (p.tipo === "imagen") return !!img[p.capa] || r[p.id] === "omitir";
    if (p.tipo === "patros") return r.patros_ok === true;
    if (p.tipo === "texto") return !!r[p.id + "_no"] || !!(r[p.id] || "").trim();
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
    if (p.tipo === "texto") return r[p.id + "_no"] ? "" : (r[p.id] || "").trim().split("\n")[0];
    if (p.tipo === "partido" && r.partido !== "otro") return partidoSel ? `${partidoSel.local.nombre} vs ${partidoSel.visit.nombre}` : "";
    if (p.tipo === "estilo" && r.estiloCartel !== "otro") return (estiloElegido() || {}).t || "";
    if (r[p.id] === "otro") return r[p.id + "_o"];
    const o = (p.op || []).find(x => x.v === r[p.id]);
    return o ? o.t : "";
  }
  // Parte del encargo de una respuesta («Otro» → lo escrito)
  function pr(id) {
    if (r[id] === "otro") return (r[id + "_o"] || "").trim();
    const p = SECC().reduce((a, s) => a.concat(s.preguntas), []).find(x => x.id === id), o = p && (p.op || []).find(x => x.v === r[id]);
    return (o && o.p) || "";
  }

  /* ---------- Pintar la entrevista ---------- */
  const ICONOS = { cartel: "🗂️", fondo: "🌄", pers: "🙋‍♀️", logos: "🛡️", textos: "🔤", estilo: "✨", encargo: "📋" };
  function dice(q, nota) {
    return `<div class="ev-dice"><img src="LOGO-NVA.png" alt=""><p>${esc(q)}${nota ? `<small>${esc(nota)}</small>` : ""}</p></div>`;
  }
  let preguntasVistas = new Set();
  function render(primera) {
    const cuerpo = capa && capa.querySelector("#evCuerpo");
    if (!cuerpo) return;
    const scrollAntes = cuerpo.scrollTop;
    let html = "", actual = null;
    for (const s of SECC()) {
      const hecha = completa(s);
      if (!hecha && !actual) actual = s;
      if (!hecha && actual !== s) break;
      const abierta = !hecha || !!abiertas[s.id];
      const resumen = hecha ? s.preguntas.filter(visible).map(etiqueta).filter(Boolean).join(", ") : "";
      html += `<section class="ev-sec${hecha ? " hecha" : ""}"><button type="button" class="ev-sec-cab" data-sec="${s.id}" aria-expanded="${abierta}">
          <span class="ev-sec-ico">${hecha ? "✓" : ICONOS[s.id]}</span>
          <span class="t">${esc(s.t.replace(/^\S+\s/, ""))}${resumen ? `<small>${esc(resumen)}</small>` : ""}</span>${hecha ? `<span class="fl">›</span>` : ""}</button>`;
      if (abierta) {
        html += `<div class="ev-sec-cuerpo">`;
        for (const p of s.preguntas.filter(visible)) {
          const nueva = !preguntasVistas.has(p.id);
          preguntasVistas.add(p.id);
          html += `<div class="ev-q${nueva && !primera ? " nueva" : ""}" data-q="${p.id}">${preguntaHtml(p)}</div>`;
          if (!contestada(p)) break;
        }
        html += `</div>`;
      }
      html += `</section>`;
    }
    const montaje = !actual;
    if (montaje) html = editorHtml() + html;
    cuerpo.innerHTML = html;
    enlazar(cuerpo);
    pintarPasos(actual);
    pintarBarra(montaje);
    if (primera) cuerpo.scrollTop = 0;
    else if (render.saltar) {
      render.saltar = false;
      const q = cuerpo.querySelectorAll(".ev-q"), ult = montaje ? cuerpo.firstElementChild : q[q.length - 1];
      if (ult) ult.scrollIntoView({ block: montaje ? "start" : "nearest", behavior: "smooth" });
    } else cuerpo.scrollTop = scrollAntes;
    pintar();
  }
  function pintarPasos(actual) {
    const el = capa.querySelector("#evPasos");
    const i = actual ? SECC().indexOf(actual) : SECC().length;
    el.innerHTML = SECC().concat([{ id: "montaje" }]).map((s, n) => `<span class="${n < i ? "hecho" : n === i ? "ahora" : ""}"></span>`).join("");
  }
  function pintarBarra(montaje) {
    const b = capa.querySelector("#evBarra");
    b.hidden = !montaje;
    capa.querySelector("#evAyuda").textContent = montaje ? "Toca una capa y arrástrala. Usa las esquinas para girar, cambiar el tamaño y la opacidad." : "";
    if (!montaje) return;
    b.innerHTML = `<button type="button" data-addtexto>＋ Texto</button>
      <button type="button" data-panel="capas" aria-pressed="${panel === "capas"}">☰ Capas</button>
      <button type="button" class="prim" data-bajar>⬇ Descargar</button>`;
    enlazar(b);
  }


  function otroHtml(id, ph) {
    if (r[id] !== "otro") return "";
    return `<div class="ev-fila"><input type="text" maxlength="200" placeholder="${esc(ph || "Escríbelo a tu manera")}" data-otro="${id}" value="${esc(r[id + "_o"] || "")}">
      <button type="button" class="ev-mini" data-otrook="${id}">✓</button></div>`;
  }

  function preguntaHtml(p) {
    if (p.tipo === "imagen") return p.ia ? encargoHtml(p) : imagenHtml(p);
    let h = dice(p.q, p.nota);
    const tipo = p.tipo || "chips";
    if (tipo === "chips" || tipo === "color") {
      h += `<div class="ev-ops">` + opcionesDe(p).map(o =>
        `<button type="button" class="ev-op${o.v === "otro" ? " otro" : ""}${r[p.id] === o.v ? " sel" : ""}" data-op="${p.id}" data-v="${esc(o.v)}">${o.e ? o.e + " " : ""}${esc(o.t)}</button>`).join("") + `</div>`;
      if (tipo === "color" && r[p.id] === "otro") {
        h += `<div class="ev-fila">Elige el color: <input type="color" data-colotro="${p.id}" value="${esc(/^#/.test(r[p.id + "_o"] || "") ? r[p.id + "_o"] : "#1f3cff")}"></div>`;
      } else h += otroHtml(p.id, p.id === "formato" ? "Medidas, por ejemplo 1200x628" : "");
    } else if (tipo === "dorsal") {
      h += `<div class="ev-ops">` + ["1", "3", "5", "7", "9", "10", "11", "14"].map(n =>
        `<button type="button" class="ev-op${r.dorsal === n ? " sel" : ""}" data-op="dorsal" data-v="${n}">${n}</button>`).join("") +
        `<button type="button" class="ev-op otro${r.dorsal === "otro" ? " sel" : ""}" data-op="dorsal" data-v="otro">✏️ Otro</button></div>` + otroHtml("dorsal", "Número del dorsal");
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
          <button type="button" class="ev-op otro${r.equip === "otro" ? " sel" : ""}" data-op="equip" data-v="otro">✏️ Otra (descríbela)</button>
          <span class="ev-estado" id="evEqEstado"></span></div>` + otroHtml("equip", "Describe la equipación");
    } else if (tipo === "texto") {
      const v = r[p.id] || "";
      h += `<div class="ev-fila">${p.largo
        ? `<textarea data-txt="${p.id}" rows="2" maxlength="300" placeholder="${esc(p.ph || "")}">${esc(v)}</textarea>`
        : `<input type="text" maxlength="120" data-txt="${p.id}" placeholder="${esc(p.ph || "")}" value="${esc(v)}">`}
        <button type="button" class="ev-mini" data-txtok="${p.id}" aria-label="Vale">✓</button></div>`;
      if (p.opcional) h += `<div class="ev-ops"><button type="button" class="ev-op${r[p.id + "_no"] ? " sel" : ""}" data-txtno="${p.id}">No lleva</button></div>`;
    } else if (tipo === "partido") {
      if (!partidos) { cargarPartidos(); h += `<div class="ev-estado" style="margin-left:34px">Buscando los próximos partidos…</div>`; }
      else {
        h += partidos.length
          ? `<div class="ev-partidos">` + partidos.map(pa => `<button type="button" class="ev-partido${r.partido === pa.id ? " sel" : ""}" data-partido="${esc(pa.id)}">
              <span class="eq">${pa.local.src ? `<img src="${esc(pa.local.src)}" alt="">` : ""}<span>${esc(pa.local.nombre)}</span></span><b>vs</b>
              <span class="eq">${pa.visit.src ? `<img src="${esc(pa.visit.src)}" alt="">` : ""}<span>${esc(pa.visit.nombre)}</span></span>
              <small>${esc([pa.cat, fechaLarga(pa.fecha) + (pa.hora ? " · " + pa.hora : ""), pa.campo].filter(Boolean).join(" · "))}</small></button>`).join("") + `</div>`
          : `<div class="ev-estado" style="margin-left:34px">No hay partidos en el calendario de las próximas semanas.</div>`;
        h += `<div class="ev-ops"><button type="button" class="ev-op otro${r.partido === "otro" ? " sel" : ""}" data-op="partido" data-v="otro">✏️ Otro partido</button></div>` + otroHtml("partido", "Por ejemplo: NVA Cadete vs CV Xàtiva");
      }
    } else if (tipo === "estilo") {
      const F = formato(), k = 300 / Math.max(F.w, F.h);
      h += `<div class="ev-estilos">` + (window.evEstilos ? window.evEstilos.LISTA : []).map(e => `<button type="button" class="ev-estilo${r.estiloCartel === e.v ? " sel" : ""}" data-op="estiloCartel" data-v="${e.v}">
          <canvas data-mini="${e.v}" width="${Math.round(F.w * k)}" height="${Math.round(F.h * k)}"></canvas><b>${esc(e.t)}</b><small>${esc(e.d)}</small></button>`).join("") + `</div>
        <div class="ev-ops"><button type="button" class="ev-op otro${r.estiloCartel === "otro" ? " sel" : ""}" data-op="estiloCartel" data-v="otro">✏️ Otro estilo</button></div>` +
        otroHtml("estiloCartel", "Describe el estilo, por ejemplo: cómic con colores neón");
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
    let h = dice(esFondo
      ? "Este es el encargo para la imagen de fondo. Cópialo, pégalo en Gemini o ChatGPT y sube aquí la imagen que te dé."
      : "Y este, el del personaje. Lo pido sobre fondo verde liso para recortarlo y que quede como capa." + (fotosEq ? " Adjunta también las fotos de la camiseta." : ""),
      "Si cambias una respuesta, el encargo se actualiza solo.") +
      `<div class="ev-prompt" data-prompt="${p.capa}">${esc(txt)}</div>
      <div class="ev-acc">
        <button type="button" class="ev-boton" data-copiar="${p.capa}">📋 Copiar el encargo</button>
        ${fotosEq ? `<button type="button" class="ev-boton" data-copiareq>📋 Copiar la camiseta</button><button type="button" class="ev-boton" data-fotoseq>👕 Guardar sus fotos</button>` : ""}
      </div>
      <div class="ev-acc">
        <label class="ev-boton prim" style="cursor:pointer">📥 ${tiene ? "Cambiar la imagen" : (esFondo ? "Subir el fondo" : "Subir el personaje")}<input type="file" accept="image/*" data-subir="${p.capa}" hidden></label>
      </div>
      <div class="ev-acc">
        <button type="button" class="ev-op" data-generar="${p.capa}">✨ Generarla desde la app</button>
        ${!tiene && r[p.id] !== "omitir" ? `<button type="button" class="ev-op" data-omitir="${p.id}">La subo luego</button>` : ""}
      </div>
      <div class="ev-estado" data-estado="${p.capa}" style="margin-left:34px"></div>`;
    if (!esFondo && tiene) {
      h += `<div class="ev-fila" style="font-size:.84rem"><label><input type="checkbox" data-qf ${quitarFondo.activo ? "checked" : ""}> Quitar el fondo de color</label></div>
        <label class="ev-fila" style="font-size:.82rem">Tolerancia del recorte <input type="range" data-qftol min="20" max="160" step="1" value="${quitarFondo.tol}" style="flex:1"></label>`;
    }
    return h;
  }

  // Paso final del «Cartel con estilo»: el encargo completo y subir el cartel
  function encargoHtml(p) {
    const est = estiloElegido(), tiene = !!img.fondo;
    const eq = equipaciones.find(e => e.id === r.equip) || {};
    const fotosEq = esPersona() && r.equip !== "otro" && (eq.imagenes || []).length;
    return dice(`Este es el encargo completo del cartel${est ? ` con el estilo «${est.t}»` : ""}. Cópialo y pégalo en Gemini o ChatGPT${fotosEq ? " junto con las fotos de la camiseta" : ""}, y sube aquí el cartel que te dé.`,
        `Encima pondré el escudo del club${(r.patros || []).length ? ", los patrocinadores" : ""}${partidoActivo() ? " y los escudos de los dos equipos" : ""}, y podrás añadir más textos.`) +
      `<div class="ev-prompt" data-prompt="fondo">${esc(promptCartel())}</div>
      <div class="ev-acc">
        <button type="button" class="ev-boton" data-copiar="fondo">📋 Copiar el encargo</button>
        ${fotosEq ? `<button type="button" class="ev-boton" data-copiareq>📋 Copiar la camiseta</button><button type="button" class="ev-boton" data-fotoseq>👕 Guardar sus fotos</button>` : ""}
      </div>
      <div class="ev-acc">
        <label class="ev-boton prim" style="cursor:pointer">📥 ${tiene ? "Cambiar el cartel" : "Subir el cartel creado"}<input type="file" accept="image/*" data-subir="fondo" hidden></label>
      </div>
      <div class="ev-acc">
        <button type="button" class="ev-op" data-generar="fondo">✨ Generarlo desde la app</button>
        ${!tiene && r[p.id] !== "omitir" ? `<button type="button" class="ev-op" data-omitir="${p.id}">Lo subo luego</button>` : ""}
      </div>
      <div class="ev-estado" data-estado="fondo" style="margin-left:34px"></div>`;
  }

  /* ---------- Partidos previstos (calendario) ---------- */
  const DIAS_L = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function fechaLarga(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00"), t = `${DIAS_L[d.getDay()]} ${d.getDate()} de ${MESES_L[d.getMonth()]}`;
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  const partidoActivo = () => r.evento === "partido" && r.partido && r.partido !== "otro" && partidoSel;
  async function cargarPartidos() {
    if (cargandoPartidos) return;
    cargandoPartidos = true;
    const lista = [];
    try {
      const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const hoy = new Date(), fin = new Date(); fin.setDate(fin.getDate() + 60);
      const crudos = window.partidosSemana ? window.partidosSemana(iso(hoy), iso(fin), false) : [];
      let fichas = null;
      try { if (window.nvaSemana) fichas = await window.nvaSemana.cargarFichas(); } catch (e) { fichas = null; }
      for (const c of crudos.slice(0, 40)) {
        let pa = null;
        if (fichas) { try { pa = await window.nvaSemana.prepararPartido(c, fichas); } catch (e) { pa = null; } }
        if (!pa) {   // sin DATOS.xls: solo nombres
          const club = { nombre: c.team.name.toUpperCase(), logo: await cargarImg("LOGO-NVA.png") }, otro = { nombre: String(c.rival || "").toUpperCase(), logo: null };
          pa = { id: `${c.key}|${c.fecha}|${c.rival}`, cat: (c.team.category || "").toUpperCase(), local: c.home ? club : otro, visit: c.home ? otro : club, fecha: c.fecha, hora: c.hora || "", campo: String(c.campo || "").toUpperCase() };
        }
        [pa.local, pa.visit].forEach(e => { e.src = e.logo && e.logo.src ? e.logo.src : ""; });
        lista.push(pa);
      }
    } catch (e) { /* sin calendario */ }
    partidos = lista;
    cargandoPartidos = false;
    if (capa) render();
  }
  const MENUDAS = new Set(["de", "del", "la", "las", "el", "los", "i", "y", "d", "l", "en"]);
  const enFrase = t => String(t || "").toLowerCase().replace(/\p{L}+/gu, (w, i) => i > 0 && MENUDAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1));
  function elegirPartido(id) {
    const pa = (partidos || []).find(x => x.id === id);
    if (!pa) return;
    partidoSel = pa;
    const vs = `${pa.local.nombre} vs ${pa.visit.nombre}`, fecha = fechaLarga(pa.fecha), lugar = enFrase(pa.campo);
    if (modo === "ia") {
      Object.assign(r, { vs, fecha, hora: pa.hora ? pa.hora + " h" : "", lugar });
      ["vs", "fecha", "hora", "lugar"].forEach(k => { delete r[k + "_no"]; if (!r[k]) r[k + "_no"] = true; });
      if (!r.subtitulo && pa.cat) r.subtitulo = enFrase(pa.cat);
    } else {
      // Textos del partido como capas (se pueden mover, cambiar o borrar)
      const viejos = E.textos.filter(t => t.auto).map(t => t.id);
      E.textos = E.textos.filter(t => !t.auto); E.orden = E.orden.filter(x => !viejos.includes(x));
      const base = { f: "deportiva", color: "#ffffff", x: 0.5, rot: 0, op: 1, sombra: true, contorno: false, mayus: true, auto: true };
      const nuevos = [
        Object.assign({}, base, { t: vs, y: 0.7, s: 0.06 }),
        Object.assign({}, base, { t: [fecha, pa.hora ? pa.hora + " h" : ""].filter(Boolean).join(" · "), y: 0.89, s: 0.05, f: "texto" }),
        Object.assign({}, base, { t: lugar, y: 0.935, s: 0.04, f: "texto", mayus: false })
      ].filter(t => t.t).map(t => Object.assign(t, { id: "t" + (++idTexto) }));
      E.textos.push(...nuevos);
      const i = E.orden.indexOf("escL");
      E.orden.splice(i < 0 ? E.orden.length : i, 0, ...nuevos.map(t => t.id));
    }
    responder("partido", id);
  }

  /* ---------- El encargo del cartel entero ---------- */
  function textosIA() {
    const v = id => r[id + "_no"] ? "" : (r[id] || "").trim();
    const ev = r.evento === "otro" ? (r.evento_o || "") : ((P("evento").op.find(o => o.v === r.evento) || {}).t || "");
    const rc = COLORES_RIVAL.find(c => c.v === r.rivalColor);
    return { titulo: v("titulo") || "Tu título", sub: v("subtitulo"), vs: v("vs"), fecha: v("fecha"), hora: v("hora"), lugar: v("lugar"),
      extra: v("extra"), redes: v("redes"), evento: ev, rivalColor: rc ? rc.c : (r.rivalColor === "otro" ? "#7a7a7a" : "") };
  }
  function kitTexto() {
    if (!esPersona()) return "";
    const n = r.pTipo === "jugadora" ? `the shirt number ${r.dorsal === "otro" ? r.dorsal_o : r.dorsal || ""}` : "different shirt numbers";
    if (r.equip === "otro") return `Kit: ${r.equip_o}, with ${n}, knee pads and indoor volleyball shoes.`;
    const eq = equipaciones.find(e => e.id === r.equip) || {};
    return `Use the attached photos of our volleyball jersey (front and back) as reference: ${r.pTipo === "equipo" ? "every player of our club" : "our player"} must wear EXACTLY that kit (same colours, cut, stripes and details), with ${n} and no player name. Knee pads and indoor volleyball shoes.${eq.descripcion ? ` Kit description: ${eq.descripcion}.` : ""}`;
  }
  function sujetoIA() {
    const s = [];
    if (r.pTipo === "jugadora") s.push(`A female volleyball player of our club, ${pr("edad")}, ${pr("rasgos")}, ${pr("complexion")}, ${pr("peloColor")} in ${pr("peinado")}, ${pr("pose")}. ${pr("plano")}, ${pr("expresion")}.`);
    else if (r.pTipo === "equipo") s.push(`${pr("nJug")} of our club, ${pr("edad")}, ${pr("rasgos")}, ${pr("complexion")}, ${pr("peloColor")}, ${pr("peinado")}, ${pr("poseEq")}. ${pr("plano")}, ${pr("expresion")}.`);
    else if (r.pTipo === "balon") s.push(`${pr("balon")}, a volleyball with blue, yellow and white panels.`);
    else if (r.pTipo === "ninguno") s.push("No people: the poster is built with the scene, volleyball elements and the typography.");
    else if (r.pTipo === "otro") s.push(`${pr("pTipo")}.`);
    s.push(kitTexto());
    const est = estiloElegido();
    if (est && est.duo && esPersona()) {
      const rival = (window.evEstilos.partirVs(r.vs_no ? "" : r.vs)[1] || "").trim();
      s.push(`The pose is adapted to the layout described above. The rival player wears ${pr("rivalColor") || "a kit in different colours"}${rival ? ` (team: ${rival})` : ""}, with no logos or brands.`);
    } else if (est && esPersona()) s.push("Adapt the pose and framing to the layout described above if needed.");
    return s.filter(Boolean).join(" ");
  }
  function promptCartel() {
    const F = formato(), est = estiloElegido(), T = textosIA(), ev = pr("evento");
    const estilo = est ? est.p : r.estiloCartel === "otro" ? (r.estiloCartel_o || "").trim() : "Modern, powerful sports poster with a clear hierarchy: a big title, the main subject and an info block.";
    const q = t => `"${String(t).replace(/"/g, "”").replace(/\n+/g, " / ")}"`;
    const roles = [["TITLE", T.titulo], ["SUBTITLE", T.sub], ["MATCHUP", T.vs], ["DATE", T.fecha], ["TIME", T.hora], ["VENUE", T.lugar], ["INFO", T.extra], ["CONTACT", T.redes]].filter(x => x[1]);
    const huecos = ["a clean, uncluttered space at the top centre for the club crest"];
    if ((r.patros || []).length) huecos.push(`a clean strip in a bottom corner for ${r.patros.length} small sponsor logo${r.patros.length > 1 ? "s" : ""}`);
    if (partidoActivo()) huecos.push("a small clean space next to each team name for its crest");
    const partes = [
      `Design a complete, finished ${orientacion(F)} volleyball event poster, ${F.ar} aspect ratio (${F.w}x${F.h} px). Professional sports graphic design, print quality.${ev ? ` It announces ${ev} of the volleyball club Nou Volei Alzira (NVA), from Alzira (Spain), whose colours are navy blue and orange.` : ""}`,
      `STYLE AND LAYOUT: ${estilo}`,
      r.acabado && r.acabado !== "auto" ? `RENDERING: ${pr("acabado")}.` : "",
      `MAIN SUBJECT: ${sujetoIA()}`,
      `SCENE: ${pr("fTipo")}. ${pr("fPaleta")}. ${pr("fLuz")}. ${pr("fAmb")}.`,
      `TEXTS: write ONLY these texts, exactly as given (Spanish, with correct accents and spelling), following the typographic hierarchy of the layout:\n` +
        roles.map(([k, v]) => `${k}: ${q(v)}`).join("\n") + `\nIf the layout mentions a text that is not in this list, leave that element out.`,
      `LOGOS: do not draw any logo, crest, emblem or sponsor brand (they are added afterwards). Leave ${huecos.length > 1 ? huecos.slice(0, -1).join(", ") + " and " + huecos[huecos.length - 1] : huecos[0]}.`,
      "No watermarks and no extra or invented text."
    ];
    return limpiar(partes.filter(Boolean).join("\n\n"));
  }
  const promptDe = capaId => modo === "ia" ? promptCartel() : capaId === "fondo" ? promptFondo() : promptPersonaje();

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

  /* ---------- Montaje por capas ---------- */
  let panel = "capas";
  const textoDe = id => E.textos.find(t => t.id === id);
  const esEscudo = id => id === "escL" || id === "escV";
  const imgEscudo = id => partidoActivo() ? partidoSel[id === "escL" ? "local" : "visit"].logo : null;
  function elemento(id) { return id === "fondo" ? E.fondo : id === "pers" ? E.pers : id === "logo" ? E.logo : id === "patros" ? E.patros : esEscudo(id) ? E[id] : textoDe(id); }
  function existe(id) {
    if (id === "pers") return !!img.pers;
    if (id === "patros") return (r.patros || []).length > 0;
    if (id === "logo") return true;
    if (esEscudo(id)) return !!imgEscudo(id);
    return !!textoDe(id);
  }
  // De atrás hacia delante, sin el fondo
  function ordenVisible() { return E.orden.filter(existe); }
  function nombreCapa(id) {
    if (id === "fondo") return modo === "ia" ? "Cartel de la IA" : "Fondo";
    if (esEscudo(id)) return `Escudo ${partidoSel ? partidoSel[id === "escL" ? "local" : "visit"].nombre : ""}`;
    if (id === "pers") return "Personaje";
    if (id === "logo") return "Escudo del club";
    if (id === "patros") return "Patrocinadores";
    const t = textoDe(id);
    return (t && t.t.trim().split("\n")[0].slice(0, 28)) || "Texto nuevo";
  }
  const ICONO_CAPA = { fondo: "🌄", pers: "🙋‍♀️", logo: "🛡️", patros: "🤝", escL: "🏠", escV: "✈️" };
  function editorHtml() {
    if (sel !== "fondo" && !existe(sel)) sel = "fondo";
    let h = "";
    const t = textoDe(sel);
    if (t) h += panelTexto(t);
    else if (sel === "patros") h += `<div class="ev-panel"><h4>🤝 Patrocinadores</h4>
        <div class="ev-tog"><button type="button" data-placa aria-pressed="${E.patros.placa}">Placa blanca detrás</button></div>${ordenPatrosHtml()}</div>`;
    else if (sel === "pers") h += `<div class="ev-panel"><h4>🙋‍♀️ Personaje</h4><div class="ev-tog"><button type="button" data-flip aria-pressed="${E.pers.flip}">⇋ Volteado</button><button type="button" data-centrar>Centrar</button></div></div>`;
    if (panel === "capas") {
      const lista = ordenVisible().slice().reverse();
      h += `<div class="ev-panel"><h4>☰ Capas <small>Arrastra ⠿ para cambiar el orden</small></h4>
        <ul class="ev-lista" id="evLista">${lista.map(id => filaCapa(id)).join("")}
          <li class="fija${sel === "fondo" ? " sel" : ""}"><span class="asa" aria-hidden="true">🔒</span><span class="num">1</span>
            <button type="button" class="nom" data-capa="fondo">🌄 ${nombreCapa("fondo")}</button></li></ul>
        ${formato() === FORMATOS.story && typeof window.igGetToken === "function" && window.igGetToken() && window.nvaStory ? `<button type="button" class="ev-boton" data-story>📲 Guardar como borrador de Story</button>` : ""}
        <div class="ev-estado" id="evEstado2"></div></div>`;
    } else h += `<div class="ev-estado" id="evEstado2"></div>`;
    return h;
  }
  function filaCapa(id) {
    const n = ordenVisible().indexOf(id) + 2, oculta = !!E.ocultas[id];
    const ico = ICONO_CAPA[id] || "🔤";
    return `<li class="${sel === id ? "sel" : ""}" data-fila="${id}">
      <button type="button" class="asa" data-asa="${id}" aria-label="Mover la capa ${esc(nombreCapa(id))}">⠿</button>
      <span class="num">${n}</span>
      <button type="button" class="nom" data-capa="${id}">${ico} ${esc(nombreCapa(id))}</button>
      <button type="button" class="ojo" data-ojo="${id}" aria-pressed="${!oculta}" aria-label="${oculta ? "Mostrar" : "Ocultar"}">${oculta ? "◌" : "👁"}</button>
      <button type="button" class="ev-mini" data-arriba="${id}" aria-label="Subir una capa">▲</button>
      <button type="button" class="ev-mini" data-abajo="${id}" aria-label="Bajar una capa">▼</button></li>`;
  }
  const COLORES_T = ["#ffffff", "#ff5b00", "#2f4dff", "#f5c518", "#0b1236", "#000000", "#00e5ff", "#ff2d95"];
  function panelTexto(t) {
    return `<div class="ev-panel"><h4>🔤 Texto <small>Tamaño, giro y opacidad en las esquinas</small></h4>
      <textarea data-ttexto placeholder="Escribe el texto. Intro para otra línea.">${esc(t.t)}</textarea>
      <div class="ev-fuentes">${Object.keys(FUENTES).map(k => `<button type="button" class="${t.f === k ? "sel" : ""}" data-tfuente="${k}" title="${esc(FUENTES[k].t)}" aria-label="${esc(FUENTES[k].t)}" style="font-family:'${FUENTES[k].f}'; font-style:${FUENTES[k].w.includes("italic") ? "italic" : "normal"}; font-weight:${FUENTES[k].w.replace("italic", "").trim()}">Aa</button>`).join("")}</div>
      <div class="ev-colores">${COLORES_T.map(c => `<button type="button" class="${t.color === c ? "sel" : ""}" style="background:${c}" data-tcol="${c}" aria-label="Color ${c}"></button>`).join("")}
        <input type="color" data-tcolor value="${esc(t.color)}" aria-label="Otro color"></div>
      <div class="ev-tog">
        <button type="button" data-tflag="mayus" aria-pressed="${!!t.mayus}">MAYÚSCULAS</button>
        <button type="button" data-tflag="sombra" aria-pressed="${!!t.sombra}">Sombra</button>
        <button type="button" data-tflag="contorno" aria-pressed="${!!t.contorno}">Contorno</button>
        <button type="button" data-tdup>Duplicar</button>
        <button type="button" data-tdel>Borrar</button></div></div>`;
  }
  function refrescarEditor() {
    const cuerpo = capa && capa.querySelector("#evCuerpo");
    if (!cuerpo || capa.querySelector("#evBarra").hidden) return;
    // Solo se rehace la parte del montaje (lo de arriba del cuerpo), sin tocar la entrevista
    cuerpo.querySelectorAll(".ev-panel, #evEstado2").forEach(n => n.remove());
    cuerpo.insertAdjacentHTML("afterbegin", editorHtml());
    enlazar(cuerpo, true);
    pintarBarra(true);
  }
  function elegir(id) { sel = id; refrescarEditor(); pintar(); }
  function nuevoTexto() {
    const t = { id: "t" + (++idTexto), t: "", f: "impacto", color: "#ffffff", x: 0.5, y: 0.22 + (E.textos.length % 5) * 0.12, s: 0.11, rot: 0, op: 1, sombra: true, contorno: false, mayus: true };
    E.textos.push(t);
    const i = E.orden.indexOf("logo");   // por debajo del escudo y los patrocinadores
    E.orden.splice(i < 0 ? E.orden.length : i, 0, t.id);
    sel = t.id; refrescarEditor(); pintar();
    const ta = capa.querySelector("[data-ttexto]"); if (ta) ta.focus();
  }
  function moverCapa(id, paso) {   // paso +1 = hacia delante
    const vis = ordenVisible(), i = vis.indexOf(id), j = i + paso;
    if (i < 0 || j < 0 || j >= vis.length) return;
    const a = E.orden.indexOf(vis[i]), b = E.orden.indexOf(vis[j]);
    [E.orden[a], E.orden[b]] = [E.orden[b], E.orden[a]];
    refrescarEditor(); pintar();
  }

  /* ---------- Eventos de la ventana ---------- */
  function responder(id, v) {
    r[id] = v;
    if (id === "formato") E.fondo = Object.assign(E.fondo, { ox: 0, oy: 0 });
    if (id === "pTipo" && v === "ninguno") { img.pers = img.persOrig = null; }
    render.saltar = true;
    render();
  }

  // Fotos de la equipación elegida juntas (delante y detrás) en un PNG
  async function imagenCamiseta() {
    const eq = equipaciones.find(e => e.id === r.equip) || {};
    const fotos = [];
    for (const ru of (eq.imagenes || []).slice(0, 3)) {
      const b = await blobEq(ru).catch(() => null);
      if (!b) continue;
      const im = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = URL.createObjectURL(b); });
      if (im) fotos.push(im);
    }
    if (!fotos.length) throw new Error("No hay fotos de la camiseta");
    const alto = 900, pad = 30, anchos = fotos.map(i => i.width * alto / i.height);
    const cv = document.createElement("canvas");
    cv.width = Math.round(anchos.reduce((a, b) => a + b, 0) + pad * (fotos.length + 1)); cv.height = alto + pad * 2;
    const cx = cv.getContext("2d");
    cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, cv.width, cv.height);
    let x = pad;
    fotos.forEach((im, i) => { cx.drawImage(im, x, pad, anchos[i], alto); x += anchos[i] + pad; });
    return await new Promise((ok, ko) => cv.toBlob(b => b ? ok(b) : ko(new Error("No se pudo crear la imagen")), "image/png"));
  }
  function confirmarTexto(id) {
    const inp = capa.querySelector(`[data-txt="${id}"]`);
    const v = inp ? inp.value.trim() : "";
    if (!v) { if (inp) inp.focus(); return; }
    r[id] = v; delete r[id + "_no"];
    render.saltar = true; render();
  }
  // Bocetos de los estilos con los textos de la entrevista
  function dibujarMinis(c) {
    if (!window.evEstilos) return;
    const T = textosIA();
    (c || capa).querySelectorAll("canvas[data-mini]").forEach(cv => window.evEstilos.dibujar(cv.getContext("2d"), cv.width, cv.height, cv.dataset.mini, T));
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
    c.querySelectorAll("[data-sec]").forEach(b => b.onclick = () => { const s = SECC().find(x => x.id === b.dataset.sec); if (completa(s)) { abiertas[s.id] = !abiertas[s.id]; render(); } });
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
    c.querySelectorAll("[data-txt]").forEach(inp => {
      inp.oninput = () => { r[inp.dataset.txt] = inp.value; delete r[inp.dataset.txt + "_no"]; pintar(); };
      if (inp.tagName === "INPUT") inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); confirmarTexto(inp.dataset.txt); } };
    });
    c.querySelectorAll("[data-txtok]").forEach(b => b.onclick = () => confirmarTexto(b.dataset.txtok));
    c.querySelectorAll("[data-txtno]").forEach(b => b.onclick = () => { const id = b.dataset.txtno; r[id] = ""; r[id + "_no"] = true; render.saltar = true; render(); });
    c.querySelectorAll("[data-partido]").forEach(b => b.onclick = () => elegirPartido(b.dataset.partido));
    dibujarMinis(c);
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
      const txt = promptDe(b.dataset.copiar);
      try { await navigator.clipboard.writeText(txt); b.textContent = "✅ Copiado"; }
      catch (e) {
        const caja = c.querySelector(`[data-prompt="${b.dataset.copiar}"]`), rg = document.createRange();
        rg.selectNodeContents(caja); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg);
        b.textContent = "Mantén pulsado el texto para copiarlo";
      }
      setTimeout(() => { if (b.isConnected) b.textContent = "📋 Copiar el encargo"; }, 2500);
    });
    // Copia las fotos de la camiseta en una sola imagen para pegarla en Gemini o ChatGPT junto al encargo
    c.querySelectorAll("[data-copiareq]").forEach(b => b.onclick = async () => {
      const promesa = imagenCamiseta();
      try {
        if (!navigator.clipboard || !window.ClipboardItem) throw new Error("sin portapapeles");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": promesa })]);
        b.textContent = "✅ Copiada: pégala en el chat";
      } catch (e) {
        const blob = await promesa.catch(() => null);
        if (!blob) { b.textContent = "No hay fotos de la camiseta"; }
        else {
          const f = new File([blob], "camiseta.png", { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); } catch (er) { /* cancelado */ } }
          else { const u = URL.createObjectURL(f), el = document.createElement("a"); el.href = u; el.download = f.name; document.body.appendChild(el); el.click(); el.remove(); }
          b.textContent = "Este navegador no deja copiar imágenes: te la he guardado";
        }
      }
      setTimeout(() => { if (b.isConnected) b.textContent = "📋 Copiar la camiseta"; }, 3500);
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

    // Montaje
    c.querySelectorAll("[data-capa]").forEach(b => b.onclick = () => elegir(b.dataset.capa));
    c.querySelectorAll("[data-addtexto]").forEach(b => b.onclick = nuevoTexto);
    c.querySelectorAll("[data-panel]").forEach(b => b.onclick = () => { panel = panel === "capas" ? "" : "capas"; refrescarEditor(); });
    c.querySelectorAll("[data-ojo]").forEach(b => b.onclick = () => { const id = b.dataset.ojo; E.ocultas[id] = !E.ocultas[id]; refrescarEditor(); pintar(); });
    c.querySelectorAll("[data-arriba]").forEach(b => b.onclick = () => moverCapa(b.dataset.arriba, +1));
    c.querySelectorAll("[data-abajo]").forEach(b => b.onclick = () => moverCapa(b.dataset.abajo, -1));
    c.querySelectorAll("[data-asa]").forEach(b => arrastrarFila(b));
    const centrar = c.querySelector("[data-centrar]");
    if (centrar) centrar.onclick = () => { Object.assign(E.pers, { x: 0.5, y: 0.6, rot: 0 }); pintar(); };
    const flip = c.querySelector("[data-flip]");
    if (flip) flip.onclick = () => { E.pers.flip = !E.pers.flip; flip.setAttribute("aria-pressed", E.pers.flip); pintar(); };
    const placa = c.querySelector("[data-placa]");
    if (placa) placa.onclick = () => { E.patros.placa = !E.patros.placa; placa.setAttribute("aria-pressed", E.patros.placa); pintar(); };
    const t = textoDe(sel);
    if (t) {
      const ta = c.querySelector("[data-ttexto]");
      if (ta) ta.oninput = () => { t.t = ta.value; pintar(); const fila = capa.querySelector(`[data-capa="${sel}"]`); if (fila) fila.textContent = "🔤 " + nombreCapa(sel); };
      c.querySelectorAll("[data-tfuente]").forEach(b => b.onclick = () => { t.f = b.dataset.tfuente; c.querySelectorAll("[data-tfuente]").forEach(x => x.classList.toggle("sel", x === b)); pintar(); });
      c.querySelectorAll("[data-tcol]").forEach(b => b.onclick = () => { t.color = b.dataset.tcol; c.querySelectorAll("[data-tcol]").forEach(x => x.classList.toggle("sel", x === b)); pintar(); });
      const tc = c.querySelector("[data-tcolor]");
      if (tc) tc.oninput = () => { t.color = tc.value; c.querySelectorAll("[data-tcol]").forEach(x => x.classList.remove("sel")); pintar(); };
      c.querySelectorAll("[data-tflag]").forEach(b => b.onclick = () => { const k = b.dataset.tflag; t[k] = !t[k]; b.setAttribute("aria-pressed", t[k]); pintar(); });
      const dup = c.querySelector("[data-tdup]");
      if (dup) dup.onclick = () => {
        const n = Object.assign({}, t, { id: "t" + (++idTexto), y: Math.min(0.95, t.y + 0.07) });
        E.textos.push(n); E.orden.splice(E.orden.indexOf(t.id) + 1, 0, n.id); elegir(n.id);
      };
      const del = c.querySelector("[data-tdel]");
      if (del) del.onclick = () => { E.textos = E.textos.filter(x => x !== t); E.orden = E.orden.filter(x => x !== t.id); elegir("fondo"); };
    }
    c.querySelectorAll("[data-bajar]").forEach(b => b.onclick = descargar);
    const story = c.querySelector("[data-story]");
    if (story) story.onclick = () => guardarStory(story);
  }

  // Reordenar arrastrando el asa ⠿ de una fila (la lista va de delante a atrás)
  function arrastrarFila(asa) {
    asa.onpointerdown = e => {
      const li = asa.closest("li"), ul = li.parentElement;
      const filas = () => Array.from(ul.querySelectorAll("li[data-fila]"));
      asa.setPointerCapture(e.pointerId);
      li.classList.add("arrastrando");
      const y0 = e.clientY;
      let destino = filas().indexOf(li);
      asa.onpointermove = ev => {
        li.style.transform = `translateY(${ev.clientY - y0}px)`;
        const resto = filas().filter(x => x !== li);
        destino = resto.filter(x => { const rc = x.getBoundingClientRect(); return ev.clientY > rc.top + rc.height / 2; }).length;
      };
      asa.onpointerup = asa.onpointercancel = () => {
        asa.onpointermove = asa.onpointerup = asa.onpointercancel = null;
        li.classList.remove("arrastrando"); li.style.transform = "";
        const lista = filas().map(x => x.dataset.fila).filter(x => x !== li.dataset.fila);
        lista.splice(destino, 0, li.dataset.fila);                    // de delante a atrás
        const nuevo = lista.slice().reverse();                        // de atrás a delante
        const otros = E.orden.filter(id => !nuevo.includes(id));      // capas que ahora no están
        E.orden = nuevo.concat(otros);
        refrescarEditor(); pintar();
      };
    };
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
      const body = modo === "ia"
        ? Object.assign({ prompt: promptCartel(), aspecto: F.ar, dorsal: r.dorsal === "otro" ? r.dorsal_o : r.dorsal || "" }, await referenciasEq())
        : capaId === "fondo"
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
      colocarSeleccion();
    });
  }

  function fondoColor(ctx, W, H) {
    const v = r.fColor === "otro" ? (r.fColor_o || "#1f3cff") : (r.fColor || "club");
    if (v === "club") {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, "#0a1f9e"); g.addColorStop(0.6, "#1f3cff"); g.addColorStop(1, "#ff5b00");
      ctx.fillStyle = g;
    } else ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  // cajas: dónde está cada capa (centro, tamaño sin girar y giro) para tocarla y poner los tiradores
  function componer(ctx, W, H, previa) {
    const M = Math.min(W, H);
    cajas = [];
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // Capa 1: el fondo
    if (img.fondo && !E.ocultas.fondo) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      const f = E.fondo, o = img.fondo;
      const s = Math.max(W / o.width, H / o.height) * f.z, dw = o.width * s, dh = o.height * s;
      ctx.globalAlpha = f.op;
      ctx.drawImage(o, (W - dw) / 2 + f.ox * W, (H - dh) / 2 + f.oy * H, dw, dh);
      ctx.globalAlpha = 1;
    } else if (modo === "ia" && window.evEstilos) {
      window.evEstilos.dibujar(ctx, W, H, r.estiloCartel || "", textosIA());
      if (previa) {
        ctx.font = `700 ${M * 0.034}px Barlow, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "top";
        const t = "Boceto", w = ctx.measureText(t).width;
        ctx.fillStyle = "rgba(5,10,30,.75)"; ctx.fillRect(M * 0.03, H - M * 0.09, w + M * 0.04, M * 0.06);
        ctx.fillStyle = "#fff"; ctx.fillText(t, M * 0.05, H - M * 0.078);
      }
    } else {
      fondoColor(ctx, W, H);
      if (previa && hayFondo() && !img.fondo) {
        ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.font = `600 ${M * 0.042}px Barlow, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("Aquí irá la imagen de fondo", W / 2, H / 2);
      }
    }
    cajas.push({ id: "fondo", cx: W / 2, cy: H / 2, w: W, h: H, rot: 0 });

    // El resto, de atrás hacia delante
    for (const id of ordenVisible()) {
      if (E.ocultas[id]) continue;
      if (id === "pers") dibujarPersonaje(ctx, W, H);
      else if (id === "logo") dibujarLogo(ctx, W, H, M);
      else if (esEscudo(id)) dibujarEscudo(ctx, W, H, M, id);
      else if (id === "patros") dibujarPatros(ctx, W, H, M);
      else dibujarTexto(ctx, W, H, M, textoDe(id), previa);
    }
    ctx.restore();
  }
  function dibujarPersonaje(ctx, W, H) {
    const p = E.pers, o = img.pers;
    const h = p.s * H, w = h * o.width / o.height, cx = p.x * W, cy = p.y * H;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(p.rot * Math.PI / 180); if (p.flip) ctx.scale(-1, 1);
    ctx.globalAlpha = p.op; ctx.drawImage(o, -w / 2, -h / 2, w, h); ctx.restore();
    cajas.push({ id: "pers", cx, cy, w, h, rot: p.rot });
  }
  function dibujarLogo(ctx, W, H, M) {
    const logo = imgLista("LOGO-NVA.png");
    if (!logo) return;
    const l = E.logo, s = l.s * M, cx = l.x * W, cy = l.y * H;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(l.rot * Math.PI / 180); ctx.globalAlpha = l.op;
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = M * 0.02;
    ctx.drawImage(logo, -s / 2, -s / 2, s, s); ctx.restore();
    cajas.push({ id: "logo", cx, cy, w: s, h: s, rot: l.rot });
  }
  function dibujarEscudo(ctx, W, H, M, id) {
    const im = imgEscudo(id);
    if (!im) return;
    const l = E[id], s = l.s * M, k = s / Math.max(im.width, im.height), w = im.width * k, h = im.height * k, cx = l.x * W, cy = l.y * H;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(l.rot * Math.PI / 180); ctx.globalAlpha = l.op;
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = M * 0.02;
    ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore();
    cajas.push({ id, cx, cy, w, h, rot: l.rot });
  }
  function dibujarPatros(ctx, W, H, M) {
    const lista = (r.patros || []).map(a => imgLista("Patrocinadores/" + a)).filter(Boolean);
    if (!lista.length) return;
    const P = E.patros, base = M * 0.085 * P.s, gap = M * 0.022 * P.s;
    const factor = i => Math.max(0.5, 1 - i * 0.16);   // el primero, el más grande
    const tam = lista.map((im, i) => { const h = base * factor(i), w = Math.min(h * im.width / im.height, M * 0.3 * factor(i) * P.s); return { im, w, h: w * im.height / im.width }; });
    const ancho = tam.reduce((s, t) => s + t.w, 0) + gap * (tam.length - 1), alto = Math.max(...tam.map(t => t.h));
    const pad = P.placa ? M * 0.018 * P.s : 0, cx = P.x * W, cy = P.y * H;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(P.rot * Math.PI / 180); ctx.globalAlpha = P.op;
    if (P.placa) { ctx.fillStyle = "rgba(255,255,255,.94)"; redondo(ctx, -ancho / 2 - pad, -alto / 2 - pad, ancho + pad * 2, alto + pad * 2, M * 0.02 * P.s); ctx.fill(); }
    let x = -ancho / 2;
    tam.forEach(t => { ctx.drawImage(t.im, x, -t.h / 2, t.w, t.h); x += t.w + gap; });
    ctx.restore();
    cajas.push({ id: "patros", cx, cy, w: ancho + pad * 2, h: alto + pad * 2, rot: P.rot });
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
  function dibujarTexto(ctx, W, H, M, t, previa) {
    if (!t) return;
    const vacio = !t.t.trim();
    if (vacio && !previa) return;   // el texto vacío solo se ve en la vista previa
    const txt = vacio ? "Escribe tu texto" : (t.mayus ? t.t.toUpperCase() : t.t).replace(/\s+$/, "");
    const px = t.s * M, lineas = txt.split("\n"), alto = px * 1.05;
    ctx.save();
    ctx.font = fuenteCss(t.f, px);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    const ancho = Math.max(...lineas.map(l => ctx.measureText(l).width)), altoTot = alto * lineas.length;
    const cx = t.x * W, cy = t.y * H;
    ctx.translate(cx, cy); ctx.rotate(t.rot * Math.PI / 180); ctx.globalAlpha = vacio ? 0.35 * t.op : t.op;
    lineas.forEach((l, i) => {
      const y = -altoTot / 2 + alto * (i + 0.5);
      if (t.contorno) { ctx.lineWidth = px * 0.12; ctx.strokeStyle = esOscuro(t.color) ? "#ffffff" : "#0b1236"; ctx.strokeText(l, 0, y); }
      if (t.sombra) { ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = px * 0.12; ctx.shadowOffsetY = px * 0.04; }
      ctx.fillStyle = t.color; ctx.fillText(l, 0, y);
      ctx.shadowColor = "transparent";
    });
    ctx.restore();
    cajas.push({ id: t.id, cx, cy, w: ancho + px * 0.3, h: altoTot + px * 0.1, rot: t.rot });
  }

  /* ---------- Tocar la vista previa ---------- */
  function puntoLienzo(cv, e) {
    const rc = cv.getBoundingClientRect();
    return { x: (e.clientX - rc.left) * cv.width / rc.width, y: (e.clientY - rc.top) * cv.height / rc.height, k: rc.width / cv.width, rc };
  }
  function dentro(cj, x, y) {   // ¿el punto cae en la caja (girada)?
    const a = -cj.rot * Math.PI / 180, dx = x - cj.cx, dy = y - cj.cy;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= cj.w / 2 + 6 && Math.abs(ly) <= cj.h / 2 + 6;
  }
  const montando = () => capa && !capa.querySelector("#evBarra").hidden;
  function tocarLienzo(cv) {
    let ini = null, ultimoToque = 0;
    cv.addEventListener("pointerdown", e => {
      if (!montando()) return;
      const p = puntoLienzo(cv, e);
      const bajo = cajas.filter(c => dentro(c, p.x, p.y)).map(c => c.id);
      const id = bajo.includes(sel) && sel !== "fondo" ? sel : (bajo[bajo.length - 1] || "fondo");
      const doble = id === sel && Date.now() - ultimoToque < 350;
      ultimoToque = Date.now();
      if (id !== sel) elegir(id);
      if (doble && textoDe(id)) { const ta = capa.querySelector("[data-ttexto]"); if (ta) ta.focus(); }
      const el = elemento(sel);
      ini = { x: e.clientX, y: e.clientY, a: sel === "fondo" ? { x: el.ox, y: el.oy } : { x: el.x, y: el.y } };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", e => {
      if (!ini) return;
      const rc = cv.getBoundingClientRect(), el = elemento(sel);
      const dx = (e.clientX - ini.x) / rc.width, dy = (e.clientY - ini.y) / rc.height;
      if (sel === "fondo") { el.ox = ini.a.x + dx; el.oy = ini.a.y + dy; }
      else {
        el.x = ini.a.x + dx; el.y = ini.a.y + dy;
        // Imán al centro
        if (Math.abs(el.x - 0.5) < 0.012) el.x = 0.5;
      }
      pintar();
    });
    const fin = () => { ini = null; };
    cv.addEventListener("pointerup", fin); cv.addEventListener("pointercancel", fin);
  }

  // Coloca el marco naranja y sus cuatro esquinas sobre la capa elegida
  function colocarSeleccion() {
    if (!capa) return;
    const marco = capa.querySelector("#evSel"), cv = capa.querySelector("#evLienzo"), escena = capa.querySelector("#evEscena");
    const cj = cajas.find(c => c.id === sel);
    if (!montando() || !cj || E.ocultas[sel]) { marco.hidden = true; return; }
    const rc = cv.getBoundingClientRect(), re = escena.getBoundingClientRect(), k = rc.width / cv.width;
    marco.hidden = false;
    Object.assign(marco.style, {
      left: (rc.left - re.left + (cj.cx - cj.w / 2) * k) + "px", top: (rc.top - re.top + (cj.cy - cj.h / 2) * k) + "px",
      width: cj.w * k + "px", height: cj.h * k + "px", transform: `rotate(${cj.rot}deg)`
    });
    const esFondo = sel === "fondo";
    if (esFondo) Object.assign(marco.style, { left: rc.left - re.left + 14 + "px", top: rc.top - re.top + 14 + "px", width: rc.width - 28 + "px", height: rc.height - 28 + "px" });
    const acc = marco.querySelector('[data-h="accion"]');
    acc.hidden = !(textoDe(sel) || sel === "pers");
    acc.textContent = textoDe(sel) ? "✎" : "⇋";
    acc.setAttribute("aria-label", textoDe(sel) ? "Editar el texto" : "Voltear");
    marco.querySelector('[data-h="rot"]').hidden = esFondo;
  }

  // Esquinas: ⟳ girar, ⤡ tamaño, ◐ opacidad (arriba/abajo), ✎ editar texto o ⇋ voltear
  function tiradores(marco) {
    const medida = marco.querySelector("#evMedida");
    marco.querySelectorAll(".ev-h").forEach(h => {
      h.addEventListener("pointerdown", e => {
        e.stopPropagation(); e.preventDefault();
        const tipo = h.dataset.h, el = elemento(sel), cj = cajas.find(c => c.id === sel);
        if (!el || !cj) return;
        if (tipo === "accion") {
          if (textoDe(sel)) { const ta = capa.querySelector("[data-ttexto]"); if (ta) { ta.focus(); ta.scrollIntoView({ block: "nearest" }); } }
          else if (sel === "pers") { E.pers.flip = !E.pers.flip; pintar(); }
          return;
        }
        const cv = capa.querySelector("#evLienzo"), rc = cv.getBoundingClientRect(), k = rc.width / cv.width;
        const cx = rc.left + cj.cx * k, cy = rc.top + cj.cy * k;
        const d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1, a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
        const prop = sel === "fondo" ? "z" : "s";
        const ini = { v: el[prop], rot: el.rot || 0, op: el.op, y: e.clientY };
        h.setPointerCapture(e.pointerId);
        medida.classList.add("ver");
        const mover = ev => {
          if (tipo === "esc") {
            const f = Math.hypot(ev.clientX - cx, ev.clientY - cy) / d0;
            const lim = prop === "z" ? [1, 4] : sel === "pers" ? [0.1, 2] : sel === "patros" ? [0.3, 3] : sel === "logo" || esEscudo(sel) ? [0.05, 0.8] : [0.015, 0.5];
            el[prop] = Math.min(lim[1], Math.max(lim[0], ini.v * f));
            medida.textContent = `Tamaño ${Math.round(el[prop] / ini.v * 100)}%`;
          } else if (tipo === "rot") {
            let g = ini.rot + (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180 / Math.PI;
            g = ((g + 540) % 360) - 180;
            for (const iman of [-180, -90, 0, 90, 180]) if (Math.abs(g - iman) < 4) g = iman;
            el.rot = g;
            medida.textContent = `Giro ${Math.round(g)}°`;
          } else if (tipo === "op") {
            el.op = Math.min(1, Math.max(0.05, ini.op - (ev.clientY - ini.y) / 160));
            medida.textContent = `Opacidad ${Math.round(el.op * 100)}%`;
          }
          pintar();
        };
        const soltar = () => { h.removeEventListener("pointermove", mover); h.removeEventListener("pointerup", soltar); h.removeEventListener("pointercancel", soltar); medida.classList.remove("ver"); };
        h.addEventListener("pointermove", mover); h.addEventListener("pointerup", soltar); h.addEventListener("pointercancel", soltar);
      });
    });
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

