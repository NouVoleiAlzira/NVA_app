/* =====================================================================
   Supabase: login, permisos por rol y «puente» de datos
   - Se carga en <head> ANTES que el resto de scripts (sin defer).
   - Nadie usa la app sin iniciar sesión: hasta entonces se muestra la
     pantalla de acceso y las peticiones de datos esperan.
   - La app se escribió para guardar archivos en GitHub con su API de
     «contents». En vez de reescribir cada módulo, este archivo atiende
     esas mismas llamadas (GET/PUT/DELETE a api.github.com/.../contents/…)
     y las resuelve contra Supabase:
       · .json y .txt  -> tabla «archivos»
       · resto (PDF, imágenes, vídeo, música) -> Storage, bucket «privado»
     Las respuestas imitan las de GitHub (content en base64, sha, 404, 409…)
     para que el código existente siga funcionando igual, incluida su cola
     sin conexión.
   - Quién puede leer o escribir cada carpeta lo decide la base de datos
     (RLS). Aquí solo se ocultan los menús sin acceso.
   ===================================================================== */
(function () {
  "use strict";

  const CFG = window.NVA_SUPABASE || {};
  const BUCKET = "privado";
  const TEXTO = /\.(json|txt|md|csv)$/i;
  const MAX_INLINE = 1024 * 1024; // como GitHub: >1 MB no viene el contenido en la respuesta
  // Archivos «solicitud» que arrancan tareas automáticas (GitHub Actions)
  const TAREAS = [
    "Calendarios/solicitud.json",
    "Reels/solicitud.json",
    "Reels/solicitud_historia.json",
    "Reels/publicar.json",
    "Reels/musica/solicitud.json"
  ];

  // Qué partes de la pantalla pertenecen a cada menú (ids de public.menus)
  const MENU_ELEMENTOS = {
    inicio: ["#secHead_wk", "#secBody_wk"],
    informes: ["#secHead_trainings", "#secBody_trainings"],
    tablon: ["#secHead_tablon", "#secBody_tablon"],
    otros: ["[onclick=\"openOtros()\"]", "#screenOtros"],
    calendario: ["#secHead_cal", "#secBody_cal"],
    direccion: ["#secHead_direccion", "#secBody_direccion"],
    carteles: ["[onclick^=\"cartelAuto\"]", "[onclick*=\"Partidos.html\"]", "[onclick*=\"Resultados.html\"]"],
    opciones: ["[onclick=\"promptOwnerPassword()\"]"]
  };

  const origFetch = window.fetch.bind(window);
  const esInvitacion = /type=(invite|recovery)/.test(location.hash);

  // La app comprueba que «GitHub» esté configurado antes de leer o guardar.
  // Se deja un valor fijo: el puente intercepta esas llamadas.
  try {
    const gh = JSON.parse(localStorage.getItem("NVA_GH_SETTINGS") || "{}");
    if (gh.token !== "supabase") {
      localStorage.setItem("NVA_GH_SETTINGS", JSON.stringify({ user: "nva", repo: "datos", token: "supabase" }));
    }
  } catch (e) {}

  let sb = null;
  let perfil = null;
  let permisos = {};
  let resolverListo;
  const listo = new Promise(r => { resolverListo = r; });

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  function b64aBytes(b64) {
    const bin = atob(String(b64 || "").replace(/\s/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesAB64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const textoAB64 = s => bytesAB64(new TextEncoder().encode(s));
  const b64ATexto = b64 => new TextDecoder("utf-8").decode(b64aBytes(b64));
  const nombreDe = ruta => ruta.split("/").pop();
  const urlApi = ruta => "https://api.github.com/repos/nva/datos/contents/" + ruta.split("/").map(encodeURIComponent).join("/");
  const padreDe = ruta => ruta.includes("/") ? ruta.slice(0, ruta.lastIndexOf("/")) : "";

  function json(status, cuerpo) {
    return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
  }
  const noEncontrado = () => json(404, { message: "Not Found" });
  const sinPermiso = () => json(403, { message: "No tienes permiso para modificar estos datos." });

  // Un fallo de red se devuelve como lo haría fetch() (TypeError) para que
  // la cola sin conexión de la app lo trate como «offline».
  function revisar(error) {
    if (!error) return;
    const msg = String(error.message || error);
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) throw new TypeError("Failed to fetch");
  }
  const esRls = e => e && (e.code === "42501" || /row-level security|permission denied/i.test(e.message || ""));

  function cabecera(init, nombre) {
    const h = init && init.headers;
    if (!h) return "";
    if (typeof h.get === "function") return h.get(nombre) || "";
    const k = Object.keys(h).find(x => x.toLowerCase() === nombre.toLowerCase());
    return k ? String(h[k]) : "";
  }

  function tipoMime(ruta) {
    const ext = (ruta.split(".").pop() || "").toLowerCase();
    return {
      pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
      gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", mp3: "audio/mpeg", m4a: "audio/mp4",
      xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }[ext] || "application/octet-stream";
  }

  function equipoDe(texto) {
    try { const j = JSON.parse(texto); return j && typeof j.equipo === "string" ? j.equipo : null; } catch (e) { return null; }
  }

  // ------------------------------------------------------------------
  // Puente: API «contents» de GitHub -> Supabase
  // ------------------------------------------------------------------
  async function infoStorage(ruta) {
    const { data, error } = await sb.storage.from(BUCKET).list(padreDe(ruta), { search: nombreDe(ruta), limit: 100 });
    revisar(error);
    return (data || []).find(o => o.name === nombreDe(ruta) && o.id) || null;
  }

  async function urlFirmada(ruta) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(ruta, 3600);
    return data ? data.signedUrl : null;
  }

  async function leerArchivo(ruta, init) {
    if (TEXTO.test(ruta)) {
      const { data, error } = await sb.from("archivos").select("contenido, version").eq("ruta", ruta).maybeSingle();
      revisar(error);
      if (data) {
        if (/raw/.test(cabecera(init, "Accept"))) return new Response(data.contenido, { status: 200 });
        const b64 = textoAB64(data.contenido);
        return json(200, {
          type: "file", name: nombreDe(ruta), path: ruta, sha: "v" + data.version, url: urlApi(ruta),
          size: new TextEncoder().encode(data.contenido).length,
          encoding: "base64", content: b64,
          download_url: "data:application/octet-stream;base64," + b64
        });
      }
    }
    const obj = await infoStorage(ruta);
    if (obj) {
      const size = (obj.metadata && obj.metadata.size) || 0;
      const url = await urlFirmada(ruta);
      if (/raw/.test(cabecera(init, "Accept"))) return origFetch(url);
      let content = "", encoding = "none";
      if (size <= MAX_INLINE) {
        const { data, error } = await sb.storage.from(BUCKET).download(ruta);
        revisar(error);
        if (data) { content = bytesAB64(new Uint8Array(await data.arrayBuffer())); encoding = "base64"; }
      }
      return json(200, {
        type: "file", name: obj.name, path: ruta, sha: "s" + (obj.updated_at || obj.id), url: urlApi(ruta),
        size, encoding, content, download_url: url
      });
    }
    return null;
  }

  async function listarCarpeta(ruta) {
    const pref = ruta ? ruta.replace(/\/$/, "") + "/" : "";
    const items = new Map();
    const { data: filas, error } = await sb.from("archivos").select("ruta, version, contenido").like("ruta", pref.replace(/[%_]/g, "\\$&") + "%");
    revisar(error);
    (filas || []).forEach(f => {
      const resto = f.ruta.slice(pref.length);
      if (!resto) return;
      if (resto.includes("/")) {
        const dir = resto.split("/")[0];
        items.set(dir, { type: "dir", name: dir, path: pref + dir, sha: "d", size: 0, url: urlApi(pref + dir) });
      } else {
        items.set(resto, {
          type: "file", name: resto, path: f.ruta, sha: "v" + f.version, url: urlApi(f.ruta),
          size: new TextEncoder().encode(f.contenido).length,
          download_url: "data:application/octet-stream;base64," + textoAB64(f.contenido)
        });
      }
    });
    const { data: objs, error: e2 } = await sb.storage.from(BUCKET).list(pref.replace(/\/$/, ""), { limit: 1000, sortBy: { column: "name", order: "asc" } });
    revisar(e2);
    const binarios = (objs || []).filter(o => o.id && o.name !== ".emptyFolderPlaceholder");
    const urls = {};
    if (binarios.length) {
      const { data: firmadas } = await sb.storage.from(BUCKET).createSignedUrls(binarios.map(o => pref + o.name), 3600);
      (firmadas || []).forEach(f => { if (f.path) urls[f.path] = f.signedUrl; });
    }
    (objs || []).forEach(o => {
      if (o.name === ".emptyFolderPlaceholder") return;
      if (!o.id) items.set(o.name, { type: "dir", name: o.name, path: pref + o.name, sha: "d", size: 0, url: urlApi(pref + o.name) });
      else items.set(o.name, {
        type: "file", name: o.name, path: pref + o.name, sha: "s" + (o.updated_at || o.id), url: urlApi(pref + o.name),
        size: (o.metadata && o.metadata.size) || 0, download_url: urls[pref + o.name] || null
      });
    });
    return items.size ? json(200, Array.from(items.values())) : null;
  }

  async function guardar(ruta, init) {
    let cuerpo = {};
    try { cuerpo = JSON.parse(init.body || "{}"); } catch (e) { return json(400, { message: "Body inválido" }); }
    if (TEXTO.test(ruta)) {
      const texto = b64ATexto(cuerpo.content);
      const fila = { ruta, contenido: texto, equipo: equipoDe(texto) };
      let res;
      if (cuerpo.sha) {
        const version = parseInt(String(cuerpo.sha).replace(/^v/, ""), 10);
        res = await sb.from("archivos").update(fila).eq("ruta", ruta).eq("version", version).select("version").maybeSingle();
        revisar(res.error);
        if (res.error) return esRls(res.error) ? sinPermiso() : json(422, { message: res.error.message });
        if (!res.data) {
          const { data: existe } = await sb.from("archivos").select("version").eq("ruta", ruta).maybeSingle();
          if (existe) {
            // RLS no da error al negar un UPDATE: simplemente no cambia filas
            const { data: puede } = await sb.rpc("puede_escribir", { p_ruta: ruta, p_equipo: fila.equipo });
            if (!puede) return sinPermiso();
            return json(409, { message: `${ruta} does not match ${cuerpo.sha}` });
          }
          res = await sb.from("archivos").insert(fila).select("version").single();
        }
      } else {
        res = await sb.from("archivos").insert(fila).select("version").single();
        if (res.error && res.error.code === "23505") return json(422, { message: "Invalid request.\n\n\"sha\" wasn't supplied." });
      }
      revisar(res.error);
      if (res.error) return esRls(res.error) ? sinPermiso() : json(422, { message: res.error.message });
      lanzarTarea(ruta);
      return json(cuerpo.sha ? 200 : 201, {
        content: { type: "file", name: nombreDe(ruta), path: ruta, sha: "v" + res.data.version },
        commit: { sha: "v" + res.data.version, message: cuerpo.message || "" }
      });
    }
    const bytes = b64aBytes(cuerpo.content);
    const { error } = await sb.storage.from(BUCKET).upload(ruta, new Blob([bytes], { type: tipoMime(ruta) }), { upsert: true, contentType: tipoMime(ruta) });
    revisar(error);
    if (error) return esRls(error) || /security|unauthorized|403/i.test(error.message || "") ? sinPermiso() : json(422, { message: error.message });
    const sha = "s" + Date.now();
    return json(cuerpo.sha ? 200 : 201, {
      content: { type: "file", name: nombreDe(ruta), path: ruta, sha, size: bytes.length },
      commit: { sha, message: cuerpo.message || "" }
    });
  }

  async function borrar(ruta) {
    if (TEXTO.test(ruta)) {
      const { data, error } = await sb.from("archivos").delete().eq("ruta", ruta).select("ruta");
      revisar(error);
      if (error) return esRls(error) ? sinPermiso() : json(422, { message: error.message });
      if (data && data.length) return json(200, { content: null, commit: { sha: "borrado" } });
      const { data: existe } = await sb.from("archivos").select("ruta").eq("ruta", ruta).maybeSingle();
      if (existe) return sinPermiso();
    }
    const obj = await infoStorage(ruta);
    if (!obj) return noEncontrado();
    const { data, error } = await sb.storage.from(BUCKET).remove([ruta]);
    revisar(error);
    if (error || !data || !data.length) return sinPermiso();
    return json(200, { content: null, commit: { sha: "borrado" } });
  }

  // Fechas de alta y última modificación (la app las pedía a /commits)
  async function historialDe(ruta) {
    const { data, error } = await sb.from("archivos").select("creado, actualizado").eq("ruta", ruta).maybeSingle();
    revisar(error);
    if (!data) return json(200, []);
    const c = fecha => ({ commit: { author: { date: fecha }, committer: { date: fecha } } });
    return json(200, data.actualizado !== data.creado ? [c(data.actualizado), c(data.creado)] : [c(data.creado)]);
  }

  function lanzarTarea(ruta) {
    if (!TAREAS.includes(ruta)) return;
    sb.functions.invoke("lanzar-tarea", { body: { ruta } }).then(({ error }) => {
      if (error) console.warn("No se pudo lanzar la tarea automática:", error);
    });
  }

  async function atender(url, init) {
    await listo;
    const metodo = ((init && init.method) || "GET").toUpperCase();
    const u = new URL(url);
    const partes = u.pathname.replace(/^\/+/, "").split("/");
    if (partes[0] === "user") return json(200, { login: perfil.email, name: perfil.nombre || perfil.email });
    if (partes[0] !== "repos") return noEncontrado();
    const resto = partes.slice(3);
    if (!resto.length) return json(200, { full_name: "nva/datos", private: true, permissions: { admin: perfil.rol === "propietario", push: true, pull: true } });
    if (resto[0] === "commits") return historialDe(u.searchParams.get("path") || "");
    if (resto[0] !== "contents") return noEncontrado();
    const ruta = resto.slice(1).map(decodeURIComponent).join("/").replace(/\/$/, "");
    if (metodo === "PUT") return guardar(ruta, init);
    if (metodo === "DELETE") return borrar(ruta);
    return (ruta && await leerArchivo(ruta, init)) || (await listarCarpeta(ruta)) || noEncontrado();
  }

  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.startsWith("https://api.github.com/")) {
      if (!init && input && typeof input !== "string") init = { method: input.method, headers: input.headers };
      return atender(url, init || {});
    }
    return origFetch(input, init);
  };

  // ------------------------------------------------------------------
  // Pantalla de acceso
  // ------------------------------------------------------------------
  const CSS = `
    [data-nva-oculto]{display:none!important}
    .nva-pantalla{position:fixed;inset:0;z-index:100000;background:#0f172a;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}
    .nva-pantalla .caja{background:#fff;border-radius:16px;max-width:360px;width:100%;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,.4);text-align:center}
    .nva-pantalla img{width:84px;height:84px;object-fit:contain;margin-bottom:8px}
    .nva-pantalla h1{font-size:1.2rem;margin:0 0 4px;color:#0f172a}
    .nva-pantalla p{font-size:.85rem;color:#64748b;margin:0 0 16px}
    .nva-pantalla input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd5e1;border-radius:10px;margin-bottom:10px;font-size:1rem}
    .nva-pantalla button{width:100%;padding:12px;border:0;border-radius:10px;background:#1e3a8a;color:#fff;font-weight:700;font-size:1rem;cursor:pointer}
    .nva-pantalla button.link{background:none;color:#1e3a8a;font-weight:600;font-size:.85rem;margin-top:8px}
    .nva-pantalla button.bio{background:#0f766e;margin-bottom:12px}
    .nva-pantalla .error{color:#b91c1c;font-size:.85rem;min-height:1.2em;margin-bottom:6px}
    #nvaUsuario{font-size:.75rem;opacity:.85;margin-left:6px;cursor:pointer;white-space:nowrap}
    .nva-tabla{width:100%;border-collapse:collapse;font-size:.8rem}
    .nva-tabla th,.nva-tabla td{border-bottom:1px solid #e2e8f0;padding:6px 4px;text-align:left;vertical-align:top}
    .nva-tabla select,.nva-tabla input{font-size:.8rem;padding:4px;max-width:100%}
    .nva-scroll{overflow-x:auto}
    .nva-equipos{display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px;margin:4px 0 8px}
    .nva-equipos label{display:flex;align-items:center;gap:6px;font-size:.8rem;white-space:nowrap}
    .nva-equipos input{margin:0}
    .nva-tabla details summary{cursor:pointer;font-size:.8rem;color:#1e3a8a}
  `;

  function pintarLogin(modo, mensaje) {
    let el = document.getElementById("nvaLogin");
    if (!el) {
      el = document.createElement("div");
      el.id = "nvaLogin";
      el.className = "nva-pantalla";
      document.body.appendChild(el);
    }
    const logo = `<img src="LOGO-NVA.png" alt="">`;
    if (modo === "config") {
      el.innerHTML = `<div class="caja">${logo}<h1>Falta configurar Supabase</h1><p>Rellena la URL y la anon key en <b>supabase-config.js</b>.</p></div>`;
      return;
    }
    if (modo === "clave") {
      el.innerHTML = `<div class="caja">${logo}<h1>Elige tu contraseña</h1><p>${mensaje || "Con ella entrarás en la app a partir de ahora."}</p>
        <div class="error" id="nvaError"></div>
        <input type="password" id="nvaClave1" placeholder="Contraseña nueva (mín. 8)" autocomplete="new-password">
        <input type="password" id="nvaClave2" placeholder="Repite la contraseña" autocomplete="new-password">
        <button id="nvaGuardarClave">Guardar y entrar</button></div>`;
      el.querySelector("#nvaGuardarClave").onclick = guardarClave;
      return;
    }
    // Es un <form> de verdad para que el móvil ofrezca guardar la contraseña
    // en su gestor (llavero de iOS, Google) y rellenarla después.
    const bio = bioGuardada();
    el.innerHTML = `<div class="caja">${logo}<h1>Nou Volei Alzira</h1><p>Inicia sesión para entrar en la app.</p>
      <div class="error" id="nvaError">${esc(mensaje || "")}</div>
      ${bio ? `<button type="button" class="bio" id="nvaEntrarBio">${nombreBio().icono} Entrar con ${nombreBio().texto}</button>` : ""}
      <form id="nvaFormLogin">
        <input type="email" id="nvaEmail" placeholder="Email" autocomplete="username" value="${esc(bio ? bio.email : "")}">
        <input type="password" id="nvaClave" placeholder="Contraseña" autocomplete="current-password">
        <button type="submit" id="nvaEntrar">Entrar</button>
      </form>
      <button type="button" class="link" id="nvaOlvido">¿Has olvidado la contraseña?</button>
      ${bio ? `<button type="button" class="link" id="nvaQuitarBio">No usar ${nombreBio().texto} en este móvil</button>` : ""}</div>`;
    el.querySelector("#nvaFormLogin").onsubmit = e => { e.preventDefault(); entrar(); };
    el.querySelector("#nvaOlvido").onclick = olvido;
    if (bio) {
      el.querySelector("#nvaEntrarBio").onclick = entrarConBio;
      el.querySelector("#nvaQuitarBio").onclick = () => { olvidarBio(); pintarLogin("login", "Hecho. Entra con tu email y contraseña."); };
    }
  }

  const error = t => { const e = document.getElementById("nvaError"); if (e) e.textContent = t; };

  async function entrar() {
    const email = document.getElementById("nvaEmail").value.trim();
    const password = document.getElementById("nvaClave").value;
    if (!email || !password) return error("Escribe tu email y tu contraseña.");
    error("Entrando...");
    const { error: e } = await sb.auth.signInWithPassword({ email, password });
    if (e) return error(/invalid/i.test(e.message) ? "Email o contraseña incorrectos." : e.message);
    ofrecerBio(email, password);
  }

  async function olvido() {
    const email = document.getElementById("nvaEmail").value.trim();
    if (!email) return error("Escribe primero tu email.");
    const { error: e } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    error(e ? e.message : "Te hemos enviado un email para cambiar la contraseña.");
  }

  async function guardarClave() {
    const a = document.getElementById("nvaClave1").value;
    const b = document.getElementById("nvaClave2").value;
    if (a.length < 8) return error("Mínimo 8 caracteres.");
    if (a !== b) return error("Las contraseñas no coinciden.");
    const { error: e } = await sb.auth.updateUser({ password: a });
    if (e) return error(e.message);
    history.replaceState(null, "", location.pathname + location.search);
    await alEntrar();
    if (perfil) ofrecerBio(perfil.email, a);
  }

  async function salir() {
    await sb.auth.signOut();
    try { localStorage.removeItem("NVA_IG_SETTINGS"); } catch (e) {}
    location.reload();
  }

  // ------------------------------------------------------------------
  // Entrar con huella (Android) o Face ID / Touch ID (iPhone)
  // - Al activarlo, el móvil crea una «llave de acceso» (WebAuthn) que solo
  //   usa tras comprobar la huella o la cara.
  // - Con la extensión PRF esa llave da un secreto que nunca sale del móvil.
  //   Con él se cifra la contraseña y se guarda cifrada en este navegador.
  //   Sin la huella o la cara no se puede descifrar.
  // - Al entrar se descifra y se hace el login normal con email y contraseña.
  // ------------------------------------------------------------------
  const BIO = "NVA_BIOMETRIA";
  const BIO_NO = "NVA_BIOMETRIA_NO"; // email que dijo «Ahora no» en este móvil

  function bioGuardada() {
    try { return JSON.parse(localStorage.getItem(BIO) || "null"); } catch (e) { return null; }
  }
  function olvidarBio() {
    try { localStorage.removeItem(BIO); } catch (e) {}
  }
  function nombreBio() {
    const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    return apple ? { texto: "Face ID", icono: "🙂" } : { texto: "huella", icono: "👆" };
  }
  async function bioDisponible() {
    if (!window.isSecureContext || !window.PublicKeyCredential || !window.crypto || !crypto.subtle) return false;
    try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (e) { return false; }
  }

  async function claveDe(secreto) {
    const base = await crypto.subtle.importKey("raw", secreto, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("NVA login") },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  const secretoDe = cred => {
    const r = cred && cred.getClientExtensionResults && cred.getClientExtensionResults().prf;
    return r && r.results && r.results.first ? new Uint8Array(r.results.first) : null;
  };

  // Pide la huella / cara y devuelve el secreto PRF de la llave
  async function pedirSecreto(id, sal) {
    const cred = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id }],
      userVerification: "required",
      timeout: 60000,
      extensions: { prf: { eval: { first: sal } } }
    } });
    const secreto = secretoDe(cred);
    if (!secreto) throw new Error("sin-prf");
    return secreto;
  }

  async function guardarBio(id, sal, secreto, email, password) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cifrado = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await claveDe(secreto), new TextEncoder().encode(password));
    localStorage.setItem(BIO, JSON.stringify({
      email, id: bytesAB64(id), sal: bytesAB64(sal), iv: bytesAB64(iv), dato: bytesAB64(new Uint8Array(cifrado))
    }));
    try { localStorage.removeItem(BIO_NO); } catch (e) {}
  }

  const cancelado = e => e && (e.name === "NotAllowedError" || e.name === "AbortError");

  async function entrarConBio() {
    const g = bioGuardada();
    if (!g) return pintarLogin("login");
    const { texto } = nombreBio();
    error(`Usa tu ${texto}...`);
    let password;
    try {
      const secreto = await pedirSecreto(b64aBytes(g.id), b64aBytes(g.sal));
      const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64aBytes(g.iv) }, await claveDe(secreto), b64aBytes(g.dato));
      password = new TextDecoder().decode(plano);
    } catch (e) {
      if (cancelado(e)) return error(`No se ha podido comprobar tu ${texto}. Vuelve a intentarlo o entra con tu contraseña.`);
      console.warn("Entrada con biometría:", e);
      olvidarBio();
      return pintarLogin("login", `La ${texto} ya no sirve en este móvil. Entra con tu contraseña y vuelve a activarla.`);
    }
    error("Entrando...");
    const { error: e } = await sb.auth.signInWithPassword({ email: g.email, password });
    if (e && /invalid/i.test(e.message)) {
      olvidarBio();
      return pintarLogin("login", `Tu contraseña ha cambiado. Entra con la nueva y vuelve a activar la ${texto}.`);
    }
    if (e) return error(e.message);
  }

  // Tras entrar con contraseña: propone activar la huella / Face ID
  async function ofrecerBio(email, password) {
    const g = bioGuardada();
    let dijoNo = null;
    try { dijoNo = localStorage.getItem(BIO_NO); } catch (e) {}
    if ((g && g.email === email) || dijoNo === email || !(await bioDisponible())) return;
    await listo;
    const { texto, icono } = nombreBio();
    const el = document.createElement("div");
    el.id = "nvaBio";
    el.className = "nva-pantalla";
    el.innerHTML = `<div class="caja"><img src="LOGO-NVA.png" alt=""><h1>${icono} ¿Entrar con ${texto}?</h1>
      <p>La próxima vez que tengas que iniciar sesión podrás usar tu ${texto} en lugar de escribir la contraseña.
      La contraseña se guarda cifrada solo en este móvil.</p>
      <div class="error" id="nvaBioError"></div>
      <button type="button" class="bio" id="nvaBioSi">Activar ${texto}</button>
      <button type="button" class="link" id="nvaBioNo">Ahora no</button></div>`;
    document.body.appendChild(el);
    const aviso = t => { el.querySelector("#nvaBioError").textContent = t; };
    const cerrar = () => { password = null; el.remove(); };
    const si = el.querySelector("#nvaBioSi");
    const noSePuede = () => {
      aviso(`Este móvil o navegador no permite guardar la contraseña con ${texto}. Puedes guardarla en el gestor de contraseñas del móvil cuando te lo ofrezca.`);
      si.textContent = "Cerrar";
      si.onclick = cerrar;
    };
    el.querySelector("#nvaBioNo").onclick = () => { try { localStorage.setItem(BIO_NO, email); } catch (e) {} cerrar(); };
    si.onclick = async () => {
      aviso("");
      const sal = crypto.getRandomValues(new Uint8Array(32));
      let cred;
      try {
        cred = await navigator.credentials.create({ publicKey: {
          rp: { name: "Nou Volei Alzira", id: location.hostname },
          // Mismo id para el mismo usuario: si la vuelve a activar, el móvil reemplaza la llave anterior
          user: { id: new TextEncoder().encode(perfil.id), name: email, displayName: perfil.nombre || email },
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
          timeout: 60000,
          extensions: { prf: { eval: { first: sal } } }
        } });
      } catch (e) {
        if (cancelado(e)) return aviso("Cancelado. Puedes volver a intentarlo.");
        console.warn("Activar biometría:", e);
        return noSePuede();
      }
      const prf = cred.getClientExtensionResults().prf;
      if (!prf || prf.enabled === false) return noSePuede();
      const id = new Uint8Array(cred.rawId);
      const terminar = async secreto => {
        await guardarBio(id, sal, secreto, email, password);
        el.querySelector(".caja").innerHTML = `<h1>✅ ${texto} activada</h1><p>La próxima vez pulsa «Entrar con ${texto}».</p><button type="button" id="nvaBioOk">Seguir</button>`;
        el.querySelector("#nvaBioOk").onclick = cerrar;
      };
      const secreto = secretoDe(cred);
      if (secreto) return terminar(secreto);
      // iPhone y otros no dan el secreto al crear la llave: hay que usarla una vez
      aviso("");
      si.textContent = `Confirmar con ${texto}`;
      si.onclick = async () => {
        try { await terminar(await pedirSecreto(id, sal)); } catch (e) {
          if (cancelado(e)) return aviso("Cancelado. Pulsa otra vez para confirmar.");
          console.warn("Activar biometría:", e);
          noSePuede();
        }
      };
    };
  }

  // ------------------------------------------------------------------
  // Sesión y permisos
  // ------------------------------------------------------------------
  let entrando = null;
  function alEntrar() {
    if (!entrando) entrando = cargarSesion().finally(() => { entrando = null; });
    return entrando;
  }

  async function cargarSesion() {
    const { data: s } = await sb.auth.getSession();
    if (!s.session) return pintarLogin("login");
    const { data: p, error: e1 } = await sb.from("perfiles").select("*").eq("id", s.session.user.id).maybeSingle();
    if (e1 && /failed to fetch/i.test(e1.message || "")) {
      // Sin conexión: se usa el último perfil conocido para poder seguir trabajando
      try { perfil = JSON.parse(localStorage.getItem("NVA_PERFIL") || "null"); permisos = JSON.parse(localStorage.getItem("NVA_PERMISOS") || "{}"); } catch (e) {}
      if (!perfil) return pintarLogin("login", "Sin conexión. Conéctate para iniciar sesión.");
    } else {
      if (!p || !p.activo) { await sb.auth.signOut(); return pintarLogin("login", "Tu cuenta no está activa. Habla con el propietario."); }
      perfil = p;
      const { data: lista } = await sb.rpc("mis_permisos");
      permisos = {};
      (lista || []).forEach(x => { permisos[x.menu] = x.acceso; });
      try { localStorage.setItem("NVA_PERFIL", JSON.stringify(perfil)); localStorage.setItem("NVA_PERMISOS", JSON.stringify(permisos)); } catch (e) {}
    }
    // Instagram: la sección se activa sola si el rol puede escribir en ella
    try {
      if (permisos.instagram === "escritura") localStorage.setItem("NVA_IG_SETTINGS", JSON.stringify({ token: "supabase", login: perfil.email }));
      else localStorage.removeItem("NVA_IG_SETTINGS");
    } catch (e) {}
    const el = document.getElementById("nvaLogin");
    if (el) el.remove();
    aplicarPermisos();
    resolverListo();
  }

  const acceso = menu => permisos[menu] || "ninguno";

  function aplicarPermisos() {
    Object.keys(MENU_ELEMENTOS).forEach(menu => {
      const ver = acceso(menu) !== "ninguno";
      MENU_ELEMENTOS[menu].forEach(sel => document.querySelectorAll(sel).forEach(n => {
        if (ver) n.removeAttribute("data-nva-oculto"); else n.setAttribute("data-nva-oculto", "");
      }));
    });
    const igVisible = acceso("instagram") !== "ninguno" || acceso("carteles") !== "ninguno";
    ["#secHead_instagram", "#secBody_instagram"].forEach(sel => {
      const n = document.querySelector(sel);
      if (n) igVisible ? n.removeAttribute("data-nva-oculto") : n.setAttribute("data-nva-oculto", "");
    });
    if (typeof window.igApplyVisibility === "function") window.igApplyVisibility();
    // Pestañas de Opciones: «Usuarios y permisos» solo para quien gestiona usuarios
    const tabUsuarios = document.querySelector("[data-nva-tab=\"usuarios\"]");
    if (tabUsuarios) tabUsuarios.hidden = perfil.rol !== "propietario";
    pintarUsuarioCabecera();
  }

  function pintarUsuarioCabecera() {
    const engranaje = document.querySelector("[onclick=\"promptOwnerPassword()\"]");
    if (!engranaje || document.getElementById("nvaUsuario")) return;
    const s = document.createElement("span");
    s.id = "nvaUsuario";
    s.title = "Cerrar sesión";
    s.textContent = "👤 " + (perfil.nombre || perfil.email.split("@")[0]);
    s.onclick = () => { if (confirm(`Has entrado como ${perfil.email} (${perfil.rol}).\n\n¿Cerrar sesión?`)) salir(); };
    engranaje.parentNode.insertBefore(s, engranaje.nextSibling);
  }

  // ------------------------------------------------------------------
  // Panel del propietario: usuarios, roles y permisos por menú
  // ------------------------------------------------------------------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

  async function pintarPanelUsuarios() {
    const caja = document.getElementById("nvaPanelUsuarios");
    if (!caja) return;
    if (!perfil || perfil.rol !== "propietario") { caja.innerHTML = "<p>Solo el propietario gestiona usuarios.</p>"; return; }
    caja.innerHTML = "<p>Cargando...</p>";
    const [u, r, m, p, c] = await Promise.all([
      sb.from("perfiles").select("*").order("email"),
      sb.from("roles").select("*").order("nivel", { ascending: false }),
      sb.from("menus").select("*").order("orden"),
      sb.from("permisos_rol").select("*"),
      sb.from("archivos").select("contenido").eq("ruta", "configuracion.json").maybeSingle()
    ]);
    if (u.error || r.error || m.error || p.error) { caja.innerHTML = "<p>No se pudo cargar (¿sin conexión?).</p>"; return; }
    const roles = r.data, menus = m.data;

    // Equipos del club (Opciones › Equipos, en configuracion.json) con el mismo
    // nombre que usa la app: «Nombre (Categoría)». Se añaden los que ya tenga
    // asignados algún usuario aunque ya no existan, para no perderlos al guardar.
    let equiposClub = [];
    try { equiposClub = (JSON.parse(c.data.contenido).teams || []).map(t => `${t.name} (${t.category})`); } catch (_) { }
    u.data.forEach(x => (x.equipos || []).forEach(e => { if (!equiposClub.includes(e)) equiposClub.push(e); }));
    equiposClub = [...new Set(equiposClub)].sort((a, b) => a.localeCompare(b, "es"));
    const casillasEquipos = sel => equiposClub.length
      ? `<div class="nva-equipos">${equiposClub.map(e => `<label><input type="checkbox" value="${esc(e)}"${sel.includes(e) ? " checked" : ""}>${esc(e)}</label>`).join("")}</div>`
      : "<p style=\"font-size:.75rem;color:#64748b\">No hay equipos. Créalos primero en Opciones.</p>";
    const resumenEquipos = sel => sel.length ? sel.length === 1 ? sel[0] : `${sel.length} equipos` : "Ninguno";
    const opcRol = sel => roles.map(x => `<option value="${esc(x.id)}"${x.id === sel ? " selected" : ""}>${esc(x.nombre)}</option>`).join("");
    const filasUsuarios = u.data.map(x => `
      <tr data-id="${esc(x.id)}">
        <td>${esc(x.email)}<br><input type="text" data-campo="nombre" value="${esc(x.nombre)}" placeholder="Nombre"></td>
        <td><select data-campo="rol">${opcRol(x.rol)}</select></td>
        <td data-campo="equipos"><details><summary>${esc(resumenEquipos(x.equipos || []))}</summary>${casillasEquipos(x.equipos || [])}</details></td>
        <td><input type="checkbox" data-campo="activo"${x.activo ? " checked" : ""}></td>
      </tr>`).join("");
    const nivel = (rol, menu) => (p.data.find(x => x.rol === rol && x.menu === menu) || {}).acceso || "ninguno";
    const opcAcceso = sel => [["ninguno", "—"], ["lectura", "Ver"], ["escritura", "Editar"]]
      .map(([v, t]) => `<option value="${v}"${v === sel ? " selected" : ""}>${t}</option>`).join("");
    const filasPermisos = menus.map(mn => `<tr><td>${esc(mn.nombre)}</td>${roles.map(ro =>
      `<td><select data-rol="${esc(ro.id)}" data-menu="${esc(mn.id)}"${ro.id === "propietario" ? " disabled" : ""}>${opcAcceso(nivel(ro.id, mn.id))}</select></td>`).join("")}</tr>`).join("");

    caja.innerHTML = `
      <div class="config-section">
        <div class="config-subtitle">Invitar a un usuario</div>
        <input type="email" id="nvaInvEmail" class="app-input" placeholder="Email">
        <input type="text" id="nvaInvNombre" class="app-input" placeholder="Nombre">
        <select id="nvaInvRol" class="app-input">${roles.filter(x => x.id !== "propietario").map(x => `<option value="${esc(x.id)}"${x.id === "entrenador" ? " selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select>
        <div id="nvaInvEquiposCaja">
          <div style="font-size:.8rem;color:#475569">Equipos que entrena:</div>
          <div id="nvaInvEquipos">${casillasEquipos([])}</div>
        </div>
        <button class="btn-save-session" id="nvaInvitar">✉️ Enviar invitación</button>
        <p style="font-size:.75rem;color:#64748b">Le llegará un email para elegir su contraseña.</p>
      </div>
      <div class="config-section">
        <div class="config-subtitle">Usuarios</div>
        <div class="nva-scroll"><table class="nva-tabla"><thead><tr><th>Usuario</th><th>Rol</th><th>Equipos</th><th>Activo</th></tr></thead>
        <tbody id="nvaUsuarios">${filasUsuarios}</tbody></table></div>
        <button class="btn-save-session" id="nvaGuardarUsuarios">💾 Guardar usuarios</button>
      </div>
      <div class="config-section">
        <div class="config-subtitle">Permisos por rol</div>
        <div class="nva-scroll"><table class="nva-tabla"><thead><tr><th>Menú</th>${roles.map(x => `<th>${esc(x.nombre)}</th>`).join("")}</tr></thead>
        <tbody id="nvaPermisos">${filasPermisos}</tbody></table></div>
        <p style="font-size:.75rem;color:#64748b">«Ver»: solo lectura. «Editar»: lectura y escritura. Los entrenadores solo editan los equipos que tengan asignados.</p>
        <button class="btn-save-session" id="nvaGuardarPermisos">💾 Guardar permisos</button>
      </div>`;

    const marcados = nodo => Array.from(nodo.querySelectorAll("input[type=checkbox]:checked")).map(x => x.value);
    const rolInv = caja.querySelector("#nvaInvRol");
    const rolConEquipos = id => !!(roles.find(x => x.id === id) || {}).restringir_equipos;
    const verEquiposInv = () => { caja.querySelector("#nvaInvEquiposCaja").hidden = !rolConEquipos(rolInv.value); };
    rolInv.onchange = verEquiposInv;
    verEquiposInv();
    caja.querySelectorAll("#nvaUsuarios td[data-campo=equipos]").forEach(td => td.addEventListener("change", () => {
      td.querySelector("summary").textContent = resumenEquipos(marcados(td));
    }));
    caja.querySelector("#nvaInvitar").onclick = async () => {
      const email = caja.querySelector("#nvaInvEmail").value.trim();
      if (!email) return alert("Escribe el email.");
      const { data, error: e } = await sb.functions.invoke("invitar-usuario", { body: {
        email, nombre: caja.querySelector("#nvaInvNombre").value.trim(), rol: caja.querySelector("#nvaInvRol").value,
        equipos: rolConEquipos(rolInv.value) ? marcados(caja.querySelector("#nvaInvEquipos")) : [], redirectTo: location.origin + location.pathname
      } });
      if (e || (data && data.error)) return alert("No se pudo invitar: " + ((data && data.error) || e.message));
      alert(`Invitación enviada a ${email}.`);
      pintarPanelUsuarios();
    };
    caja.querySelector("#nvaGuardarUsuarios").onclick = async () => {
      const filas = Array.from(caja.querySelectorAll("#nvaUsuarios tr"));
      for (const tr of filas) {
        const cambios = {
          nombre: tr.querySelector("[data-campo=nombre]").value.trim() || null,
          rol: tr.querySelector("[data-campo=rol]").value,
          equipos: marcados(tr.querySelector("[data-campo=equipos]")),
          activo: tr.querySelector("[data-campo=activo]").checked
        };
        const { error: e } = await sb.from("perfiles").update(cambios).eq("id", tr.dataset.id);
        if (e) return alert("Error guardando usuarios: " + e.message);
      }
      alert("Usuarios guardados.");
      pintarPanelUsuarios();
    };
    caja.querySelector("#nvaGuardarPermisos").onclick = async () => {
      const filas = Array.from(caja.querySelectorAll("#nvaPermisos select:not([disabled])"))
        .map(s => ({ rol: s.dataset.rol, menu: s.dataset.menu, acceso: s.value }));
      const { error: e } = await sb.from("permisos_rol").upsert(filas);
      if (e) return alert("Error guardando permisos: " + e.message);
      alert("Permisos guardados. Cada usuario los verá al volver a abrir la app.");
    };
  }

  // ------------------------------------------------------------------
  // Arranque
  // ------------------------------------------------------------------
  function arrancar() {
    const estilo = document.createElement("style");
    estilo.textContent = CSS;
    document.head.appendChild(estilo);

    if (!CFG.url || !CFG.anonKey || !window.supabase) { pintarLogin("config"); return; }

    // Opciones: ya no hay contraseña de propietario, decide el rol
    window.promptOwnerPassword = function () {
      if (acceso("opciones") === "ninguno") return alert("Tu rol no tiene acceso a Opciones.");
      if (typeof window.openOptionsModal === "function") window.withLoading ? window.withLoading(window.openOptionsModal, "Sincronizando...") : window.openOptionsModal();
    };
    window.nvaPintarPanelUsuarios = pintarPanelUsuarios;

    sb.auth.onAuthStateChange(evento => {
      if (evento === "PASSWORD_RECOVERY") pintarLogin("clave", "Escribe tu nueva contraseña.");
      if (evento === "SIGNED_IN" && !esInvitacion && !perfil && document.getElementById("nvaLogin")) alEntrar();
    });
    if (esInvitacion) pintarLogin("clave");
    else alEntrar();
  }

  if (CFG.url && CFG.anonKey && window.supabase) {
    sb = window.supabase.createClient(CFG.url, CFG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "NVA_SUPABASE_AUTH" }
    });
  }
  window.nva = {
    get cliente() { return sb; },
    get perfil() { return perfil; },
    acceso,
    listo,
    salir
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
