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
    otros: ["[onclick=\"openOtros()\"]", "#modalOtros"],
    calendario: ["#secHead_cal", "#secBody_cal"],
    direccion: ["#secHead_direccion", "#secBody_direccion"],
    opciones: ["[onclick=\"promptOwnerPassword()\"]"],
    // Subsecciones («menú.subsección»): solo se muestran u ocultan
    "informes.entrenadores": ["[data-nva-menu=\"informes.entrenadores\"]"],
    "informes.pdf": ["[data-nva-menu=\"informes.pdf\"]"],
    "informes.fichas": ["[data-nva-menu=\"informes.fichas\"]"],
    "informes.drive": ["[data-nva-menu=\"informes.drive\"]"],
    "informes.kilometraje": ["[data-nva-menu=\"informes.kilometraje\"]"],
    "calendario.linea": ["#cpSubHead_tl", "#cpSub_tl"],
    "calendario.avisos": ["#cpSubHead_warn", "#cpSub_warn"],
    "calendario.lista": ["#cpSubHead_list", "#cpSub_list"],
    "calendario.equipos": ["#cpSubHead_teams", "#cpSub_teams"],
    "calendario.programada": ["#cpSubHead_prog", "#cpSub_prog"],
    "direccion.avisos": ["#btnDireccionNVA", "#direccionTeamsContainer"],
    "direccion.consultas": ["[data-nva-menu=\"direccion.consultas\"]"],
    "direccion.horarios": ["[data-nva-menu=\"direccion.horarios\"]"],
    "direccion.registros": ["[data-nva-menu=\"direccion.registros\"]"],
    "instagram.reels": ["#igSubHead_reels", "#igSub_reels"],
    "instagram.stories": ["#igSubHead_stories", "#igSub_stories"],
    "opciones.entrenadores": [".tab-btn[onclick=\"switchTab(1)\"]", "#tabContent1"],
    "opciones.equipos": [".tab-btn[onclick=\"switchTab(2)\"]", "#tabContent2"],
    "opciones.ligas": [".tab-btn[onclick=\"switchTab(3)\"]", "#tabContent3"]
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
  const SALIENDO = "NVA_SALIENDO"; // marca de «cerrar sesión» hasta la siguiente carga
  function borrarSesionGuardada() {
    Object.keys(localStorage).filter(k => k.startsWith("NVA_SUPABASE_AUTH")).forEach(k => localStorage.removeItem(k));
  }
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

  // «sha» de un archivo de texto. La app lo usa como clave de su caché de
  // contenidos (Cache API, sobrevive a «Borrar datos locales»), así que tiene
  // que ser distinto para cada archivo y cada versión: con solo «v1» todos los
  // archivos nuevos compartían clave y se leía el mismo contenido para todos.
  // El número de versión va delante para que guardar() lo siga entendiendo.
  function shaTexto(ruta, version, actualizado) {
    let h = 0x811c9dc5;
    const s = ruta + "|" + (actualizado || "");
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return "v" + version + "-" + (h >>> 0).toString(16);
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
      const { data, error } = await sb.from("archivos").select("contenido, version, actualizado").eq("ruta", ruta).maybeSingle();
      revisar(error);
      if (data) {
        if (/raw/.test(cabecera(init, "Accept"))) return new Response(data.contenido, { status: 200 });
        const b64 = textoAB64(data.contenido);
        return json(200, {
          type: "file", name: nombreDe(ruta), path: ruta, sha: shaTexto(ruta, data.version, data.actualizado), url: urlApi(ruta),
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
    const { data: filas, error } = await sb.from("archivos").select("ruta, version, actualizado, contenido").like("ruta", pref.replace(/[%_]/g, "\\$&") + "%");
    revisar(error);
    (filas || []).forEach(f => {
      const resto = f.ruta.slice(pref.length);
      if (!resto) return;
      if (resto.includes("/")) {
        const dir = resto.split("/")[0];
        items.set(dir, { type: "dir", name: dir, path: pref + dir, sha: "d", size: 0, url: urlApi(pref + dir) });
      } else {
        items.set(resto, {
          type: "file", name: resto, path: f.ruta, sha: shaTexto(f.ruta, f.version, f.actualizado), url: urlApi(f.ruta),
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
        res = await sb.from("archivos").update(fila).eq("ruta", ruta).eq("version", version).select("version, actualizado").maybeSingle();
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
          res = await sb.from("archivos").insert(fila).select("version, actualizado").single();
        }
      } else {
        res = await sb.from("archivos").insert(fila).select("version, actualizado").single();
        if (res.error && res.error.code === "23505") return json(422, { message: "Invalid request.\n\n\"sha\" wasn't supplied." });
      }
      revisar(res.error);
      if (res.error) return esRls(res.error) ? sinPermiso() : json(422, { message: res.error.message });
      lanzarTarea(ruta);
      const sha = shaTexto(ruta, res.data.version, res.data.actualizado);
      return json(cuerpo.sha ? 200 : 201, {
        content: { type: "file", name: nombreDe(ruta), path: ruta, sha },
        commit: { sha, message: cuerpo.message || "" }
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
    .nva-pantalla button.bio{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;margin-bottom:12px;display:flex;flex-direction:column;align-items:center;gap:6px}
    .nva-pantalla button.bio svg{width:56px;height:56px}
    .nva-pantalla .huella{display:block;width:72px;height:72px;margin:0 auto 8px}
    .nva-pantalla .error{color:#b91c1c;font-size:.85rem;min-height:1.2em;margin-bottom:6px}
    #nvaUsuario{font-size:.75rem;opacity:.85;margin-left:6px;cursor:pointer;white-space:nowrap}
    .nva-tabla{width:100%;border-collapse:collapse;font-size:.8rem;color:#0f172a;table-layout:fixed}
    .nva-tabla th,.nva-tabla td{border-bottom:1px solid #e2e8f0;padding:8px 4px;text-align:left;vertical-align:top}
    .nva-tabla th{vertical-align:middle;font-size:.75rem;color:#475569}
    .nva-tabla .nva-email{display:block;font-size:.72rem;color:#64748b;margin-top:4px;overflow-wrap:anywhere}
    .nva-tabla .nva-email[hidden]{display:none}
    .nva-tabla select,.nva-tabla input[type=text]{width:100%;height:32px;box-sizing:border-box;padding:0 8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;font-size:.8rem;color:#0f172a;margin:0}
    .nva-tabla select:disabled{background:#f1f5f9;color:#94a3b8}
    .nva-check{display:flex;align-items:center;justify-content:center;height:32px}
    .nva-check input{width:18px;height:18px;margin:0}
    .nva-tabla .nva-col-rol{width:30%}
        .nva-tabla .nva-col-activo{width:44px;text-align:center}
    .nva-permisos td{vertical-align:middle}
    .nva-permisos .nva-col-acceso{width:110px}
    .nva-seccion{display:block;width:100%;box-sizing:border-box}
    .nva-seccion > summary{cursor:pointer;list-style:none;user-select:none}
    .nva-seccion > summary::-webkit-details-marker{display:none}
    .nva-seccion > summary::after{content:"▸";color:#64748b;font-size:.9rem}
    .nva-seccion[open] > summary::after{content:"▾"}
    .nva-seccion:not([open]) > summary{margin-bottom:0}
    .nva-nombre{display:flex;align-items:center;gap:4px}
    .nva-nombre input{flex:1;min-width:0}
    .nva-info{flex:none;width:24px;height:24px;border-radius:50%;border:1px solid #cbd5e1;background:#f1f5f9;color:#1e3a8a;font-weight:700;font-size:.75rem;padding:0;cursor:pointer}
    .nva-nota{font-size:.75rem;color:#64748b;margin:4px 0}
    .nva-subtitulo{font-size:.8rem;font-weight:700;color:#475569;margin:12px 0 6px}
    .nva-linea{display:flex;align-items:center;gap:8px;font-size:.8rem;color:#0f172a;margin:0 0 8px}
    .nva-linea input{margin:0;width:18px;height:18px}
    .nva-plegar{display:flex;align-items:center;gap:6px;background:none;border:0;padding:0;font:inherit;color:#1e3a8a;font-weight:600;text-align:left;cursor:pointer}
    .nva-plegar::before{content:"▸";color:#64748b}
    .nva-plegar[aria-expanded=true]::before{content:"▾"}
    .nva-permisos .nva-hijo td{background:#f1f5f9}
    .nva-permisos .nva-hijo td:first-child{padding-left:22px;color:#475569}
    .nva-mostrar{display:flex;align-items:center;gap:6px;height:32px;font-size:.8rem;cursor:pointer}
    .nva-mostrar input{margin:0;width:18px;height:18px}
    .nva-roles td{vertical-align:middle}
    .nva-tabla .nva-col-num{width:70px;text-align:center}
    .nva-tabla .nva-col-borrar{width:40px;text-align:center}
    .nva-borrar{background:none;border:0;font-size:1rem;cursor:pointer;padding:4px}
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
      ${bio ? `<button type="button" class="bio" id="nvaEntrarBio">${HUELLA_SVG}Entrar con ${nombreBio().texto}</button>` : ""}
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

  // supabase-js solo borra la sesión guardada si el servidor contesta. En el
  // móvil (red lenta, app que vuelve de segundo plano con el token caducado)
  // esa llamada fallaba o se quedaba esperando, y al recargar se seguía dentro.
  // Ahora se avisa al servidor sin esperar más de 3 s y la sesión de este
  // dispositivo se borra siempre.
  async function salir() {
    const conLimite = (promesa, ms) => Promise.race([promesa.catch(() => null), new Promise(r => setTimeout(r, ms))]);
    await conLimite(sb.auth.signOut(), 3000);
    await conLimite(sb.auth.signOut({ scope: "local" }), 1000);
    try {
      borrarSesionGuardada();
      ["NVA_IG_SETTINGS", "NVA_PERFIL", "NVA_PERMISOS"].forEach(k => localStorage.removeItem(k));
      // Una renovación del token que termine justo ahora podría volver a
      // guardar la sesión antes de recargar: al arrancar se borra otra vez.
      localStorage.setItem(SALIENDO, "1");
    } catch (e) {}
    location.replace(location.pathname + location.search);
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
  // Icono de huella (Material Icons «fingerprint», licencia Apache 2.0)
  const HUELLA_SVG = `<svg viewBox="0 0 24 24" fill="#2f6fed" aria-hidden="true"><path d="M17.81 4.47c-.08 0-.16-.02-.23-.06C15.66 3.42 14 3 12.01 3c-1.98 0-3.86.47-5.57 1.41-.24.13-.54.04-.68-.2-.13-.24-.04-.55.2-.68C7.82 2.52 9.86 2 12.01 2c2.13 0 3.99.47 6.03 1.52.25.13.34.43.21.67-.09.18-.26.28-.44.28zM3.5 9.72c-.1 0-.2-.03-.29-.09-.23-.16-.28-.47-.12-.7.99-1.4 2.25-2.5 3.75-3.27C9.98 4.04 14 4.03 17.15 5.65c1.5.77 2.76 1.86 3.75 3.25.16.22.11.54-.12.7-.23.16-.54.11-.7-.12-.9-1.26-2.04-2.25-3.39-2.94-2.87-1.47-6.54-1.47-9.4.01-1.36.7-2.5 1.7-3.4 2.96-.08.14-.23.21-.39.21zm6.25 12.07c-.13 0-.26-.05-.35-.15-.87-.87-1.34-1.43-2.01-2.64-.69-1.23-1.05-2.73-1.05-4.34 0-2.97 2.54-5.39 5.66-5.39s5.66 2.42 5.66 5.39c0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-2.42-2.09-4.39-4.66-4.39-2.57 0-4.66 1.97-4.66 4.39 0 1.44.32 2.77.93 3.85.64 1.15 1.08 1.64 1.85 2.42.19.2.19.51 0 .71-.11.1-.24.15-.37.15zm7.17-1.85c-1.19 0-2.24-.3-3.1-.89-1.49-1.01-2.38-2.65-2.38-4.39 0-.28.22-.5.5-.5s.5.22.5.5c0 1.41.72 2.74 1.94 3.56.71.48 1.54.71 2.54.71.24 0 .64-.03 1.04-.1.27-.05.53.13.58.41.05.27-.13.53-.41.58-.57.11-1.07.12-1.21.12zM14.91 22c-.04 0-.09-.01-.13-.02-1.59-.44-2.63-1.03-3.72-2.1-1.4-1.39-2.17-3.24-2.17-5.22 0-1.62 1.38-2.94 3.08-2.94 1.7 0 3.08 1.32 3.08 2.94 0 1.07.93 1.94 2.08 1.94s2.08-.87 2.08-1.94c0-3.77-3.25-6.83-7.25-6.83-2.84 0-5.44 1.58-6.61 4.03-.39.81-.59 1.76-.59 2.8 0 .78.07 2.01.67 3.61.1.26-.03.55-.29.64-.26.1-.55-.04-.64-.29-.49-1.31-.73-2.61-.73-3.96 0-1.2.23-2.29.68-3.24 1.33-2.79 4.28-4.6 7.51-4.6 4.55 0 8.25 3.51 8.25 7.83 0 1.62-1.38 2.94-3.08 2.94s-3.08-1.32-3.08-2.94c0-1.07-.93-1.94-2.08-1.94s-2.08.87-2.08 1.94c0 1.71.66 3.31 1.87 4.51.95.94 1.86 1.46 3.27 1.85.27.07.42.35.35.61-.05.23-.26.38-.47.38z"/></svg>`;

  function bioGuardada() {
    try { return JSON.parse(localStorage.getItem(BIO) || "null"); } catch (e) { return null; }
  }
  function olvidarBio() {
    try { localStorage.removeItem(BIO); } catch (e) {}
  }
  function nombreBio() {
    const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    return { texto: apple ? "Face ID" : "huella" };
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
    const { texto } = nombreBio();
    const el = document.createElement("div");
    el.id = "nvaBio";
    el.className = "nva-pantalla";
    el.innerHTML = `<div class="caja">${HUELLA_SVG.replace("<svg ", "<svg class=\"huella\" ")}<h1>¿Entrar con ${texto}?</h1>
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

  // Una subsección sin permiso propio (aún no creada en la base de datos) sigue a su menú
  const acceso = menu => permisos[menu] || (menu.includes(".") ? acceso(menu.split(".")[0]) : "ninguno");

  function aplicarPermisos() {
    Object.keys(MENU_ELEMENTOS).forEach(menu => {
      const ver = acceso(menu) !== "ninguno";
      MENU_ELEMENTOS[menu].forEach(sel => document.querySelectorAll(sel).forEach(n => {
        if (ver) n.removeAttribute("data-nva-oculto"); else n.setAttribute("data-nva-oculto", "");
      }));
    });
    const igVisible = acceso("instagram") !== "ninguno";
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

  // Si la pestaña activa de Opciones está oculta para el rol, se abre la primera visible
  function abrirPrimeraPestana() {
    const botones = Array.from(document.querySelectorAll("#modalOptions .tab-btn"));
    const activa = botones.find(b => b.classList.contains("active"));
    const visible = b => !b.hidden && !b.hasAttribute("data-nva-oculto");
    if (activa && visible(activa)) return;
    const primera = botones.find(visible);
    if (primera) primera.click();
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

  let rolPermisosElegido = null;
  const ROLES_BASE = ["propietario", "administrador", "entrenador", "lectura"];
  async function pintarPanelUsuarios() {
    const caja = document.getElementById("nvaPanelUsuarios");
    if (!caja) return;
    if (!perfil || perfil.rol !== "propietario") { caja.innerHTML = "<p>Solo el propietario gestiona usuarios.</p>"; return; }
    // Al volver a pintar (tras guardar) se mantienen abiertas las secciones y menús que lo estaban
    const abiertas = new Set(Array.from(caja.querySelectorAll("details.nva-seccion[open]")).map(d => d.dataset.seccion));
    const desplegados = new Set(Array.from(caja.querySelectorAll(".nva-plegar[aria-expanded=true]")).map(b => b.dataset.menu));
    caja.innerHTML = "<p>Cargando...</p>";
    const [u, r, m, p] = await Promise.all([
      sb.from("perfiles").select("*").order("email"),
      sb.from("roles").select("*").order("nivel", { ascending: false }),
      sb.from("menus").select("*").order("orden"),
      sb.from("permisos_rol").select("*")
    ]);
    if (u.error || r.error || m.error || p.error) { caja.innerHTML = "<p>No se pudo cargar (¿sin conexión?).</p>"; return; }
    const roles = r.data, menus = m.data;
    const principales = menus.filter(x => !x.padre);
    const hijos = id => menus.filter(x => x.padre === id);

    const normNombre = t => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();
    const opcRol = sel => roles.map(x => `<option value="${esc(x.id)}"${x.id === sel ? " selected" : ""}>${esc(x.nombre)}</option>`).join("");
    const filasUsuarios = u.data.map(x => `
      <tr data-id="${esc(x.id)}">
        <td><div class="nva-nombre"><input type="text" data-campo="nombre" value="${esc(x.nombre)}" placeholder="Nombre"><button type="button" class="nva-info" title="Ver email" aria-label="Ver email">?</button></div><span class="nva-email" hidden>${esc(x.email)}</span></td>
        <td><select data-campo="rol">${opcRol(x.rol)}</select></td>
        <td><div class="nva-check"><input type="checkbox" data-campo="activo"${x.activo ? " checked" : ""}></div></td>
      </tr>`).join("");

    // Permisos: cada menú tiene su nivel; sus subsecciones solo se muestran u ocultan.
    // Una subsección sin fila propia sigue a su menú.
    const nivel = (rol, menu) => (p.data.find(x => x.rol === rol && x.menu === menu) || {}).acceso;
    const opcAcceso = sel => [["ninguno", "—"], ["lectura", "Ver"], ["escritura", "Editar"]]
      .map(([v, t]) => `<option value="${v}"${v === sel ? " selected" : ""}>${t}</option>`).join("");
    if (!roles.some(x => x.id === rolPermisosElegido)) rolPermisosElegido = (roles.find(x => x.id !== "propietario") || roles[0] || {}).id;
    const filasPermisos = roles.map(ro => principales.map(mn => {
      const fijo = ro.id === "propietario";
      const nivelMenu = nivel(ro.id, mn.id) || "ninguno";
      const hs = hijos(mn.id);
      const titulo = hs.length
        ? `<button type="button" class="nva-plegar" data-menu="${esc(mn.id)}" aria-expanded="${desplegados.has(mn.id)}">${esc(mn.nombre)}</button>`
        : esc(mn.nombre);
      return `<tr data-rol="${esc(ro.id)}"><td>${titulo}</td>
        <td><select data-rol="${esc(ro.id)}" data-menu="${esc(mn.id)}"${fijo ? " disabled" : ""}>${opcAcceso(nivelMenu)}</select></td></tr>` +
        hs.map(h => `<tr class="nva-hijo" data-rol="${esc(ro.id)}" data-padre="${esc(mn.id)}"><td>${esc(h.nombre)}</td>
        <td><label class="nva-mostrar"><input type="checkbox" data-rol="${esc(ro.id)}" data-menu="${esc(h.id)}" data-padre="${esc(mn.id)}"${(nivel(ro.id, h.id) || nivelMenu) !== "ninguno" ? " checked" : ""}${fijo || nivelMenu === "ninguno" ? " disabled" : ""}>Mostrar</label></td></tr>`).join("");
    }).join("")).join("");

    const usuariosDeRol = id => u.data.filter(x => x.rol === id).length;
    const filasRoles = roles.map(x => `<tr><td>${esc(x.nombre)}${x.restringir_equipos ? "<br><span class=\"nva-nota\">Solo edita sus equipos</span>" : ""}</td>
      <td class="nva-col-num">${usuariosDeRol(x.id)}</td>
      <td class="nva-col-borrar">${ROLES_BASE.includes(x.id) ? "" : `<button type="button" class="nva-borrar" data-id="${esc(x.id)}" title="Borrar rol" aria-label="Borrar rol">🗑️</button>`}</td></tr>`).join("");

    const seccion = (id, titulo, cuerpo) => `<details class="config-section nva-seccion" data-seccion="${id}"${abiertas.has(id) ? " open" : ""}>
      <summary class="config-subtitle">${titulo}</summary>${cuerpo}</details>`;
    caja.innerHTML = seccion("invitar", "Invitar a un usuario", `
        <input type="email" id="nvaInvEmail" class="app-input" placeholder="Email">
        <input type="text" id="nvaInvNombre" class="app-input" placeholder="Nombre">
        <select id="nvaInvRol" class="app-input">${roles.filter(x => x.id !== "propietario").map(x => `<option value="${esc(x.id)}"${x.id === "entrenador" ? " selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select>
        <button class="btn-save-session" id="nvaInvitar">✉️ Enviar invitación</button>
        <p style="font-size:.75rem;color:#64748b">Le llegará un email para elegir su contraseña.</p>`) +
      seccion("usuarios", "Usuarios", `
        <table class="nva-tabla"><thead><tr><th>Usuario</th><th class="nva-col-rol">Rol</th><th class="nva-col-activo">Activo</th></tr></thead>
        <tbody id="nvaUsuarios">${filasUsuarios}</tbody></table>
        <p class="nva-nota">Los usuarios con rol Entrenador son los entrenadores de la pestaña «Entrenadores y equipos», donde se les asignan los equipos. Dos usuarios no pueden tener el mismo nombre.</p>
        <button class="btn-save-session" id="nvaGuardarUsuarios">💾 Guardar usuarios</button>`) +
      seccion("permisos", "Permisos por rol", `
        <select id="nvaPermRol" class="app-input">${roles.map(x => `<option value="${esc(x.id)}"${x.id === rolPermisosElegido ? " selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select>
        <p id="nvaPermFijo" class="nva-nota" hidden>El propietario siempre puede editarlo todo.</p>
        <table class="nva-tabla nva-permisos"><thead><tr><th>Sección</th><th class="nva-col-acceso">Acceso</th></tr></thead>
        <tbody id="nvaPermisos">${filasPermisos}</tbody></table>
        <p class="nva-nota">«Ver»: solo lectura. «Editar»: lectura y escritura. Los entrenadores solo editan los equipos que tengan asignados en Opciones › Entrenadores y equipos. Pulsa una sección con ▸ para elegir qué subsecciones ve.</p>
        <button class="btn-save-session" id="nvaGuardarPermisos">💾 Guardar permisos</button>`) +
      seccion("roles", "Roles", `
        <table class="nva-tabla nva-roles"><thead><tr><th>Rol</th><th class="nva-col-num">Usuarios</th><th class="nva-col-borrar"></th></tr></thead>
        <tbody>${filasRoles}</tbody></table>
        <div class="nva-subtitulo">Crear un rol</div>
        <input type="text" id="nvaRolNombre" class="app-input" placeholder="Nombre del rol (p. ej. Coordinador)">
        <label class="nva-linea"><input type="checkbox" id="nvaRolEquipos">Solo puede editar los equipos que tenga asignados</label>
        <div style="font-size:.8rem;color:#475569;margin-bottom:4px">Empezar con los permisos de:</div>
        <select id="nvaRolCopia" class="app-input">${roles.map(x => `<option value="${esc(x.id)}"${x.id === "lectura" ? " selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select>
        <button class="btn-save-session" id="nvaCrearRol">➕ Crear rol</button>
        <p class="nva-nota">Después ajusta sus permisos en «Permisos por rol». Los roles de partida no se pueden borrar.</p>`);

    // Los nombres de usuario no se pueden repetir (sin contar mayúsculas ni espacios de más)
    const repetido = (nombres) => nombres.map(normNombre).filter(Boolean).find((n, i, a) => a.indexOf(n) !== i);
    caja.querySelectorAll(".nva-info").forEach(b => b.onclick = () => {
      const email = b.closest("td").querySelector(".nva-email");
      email.hidden = !email.hidden;
    });

    // Permisos: solo se ven las filas del rol elegido y las subsecciones de los menús desplegados
    const rolPerm = caja.querySelector("#nvaPermRol");
    const pintarFilasPermisos = () => {
      const abiertos = new Set(Array.from(caja.querySelectorAll(".nva-plegar[aria-expanded=true]")).map(b => b.dataset.menu));
      caja.querySelectorAll("#nvaPermisos tr").forEach(tr => {
        tr.hidden = tr.dataset.rol !== rolPerm.value || (tr.dataset.padre && !abiertos.has(tr.dataset.padre));
      });
      caja.querySelector("#nvaPermFijo").hidden = rolPerm.value !== "propietario";
    };
    rolPerm.onchange = () => { rolPermisosElegido = rolPerm.value; pintarFilasPermisos(); };
    caja.querySelectorAll(".nva-plegar").forEach(b => b.onclick = () => {
      const abrir = b.getAttribute("aria-expanded") !== "true";
      caja.querySelectorAll(`.nva-plegar[data-menu="${b.dataset.menu}"]`).forEach(x => x.setAttribute("aria-expanded", abrir));
      pintarFilasPermisos();
    });
    caja.querySelectorAll("#nvaPermisos select").forEach(s => s.onchange = () => {
      // Con el menú en «—» sus subsecciones no se ven, da igual lo que marquen
      caja.querySelectorAll(`#nvaPermisos input[data-rol="${s.dataset.rol}"][data-padre="${s.dataset.menu}"]`)
        .forEach(x => { x.disabled = s.value === "ninguno"; });
    });
    pintarFilasPermisos();

    caja.querySelector("#nvaInvitar").onclick = async () => {
      const email = caja.querySelector("#nvaInvEmail").value.trim();
      const nombre = caja.querySelector("#nvaInvNombre").value.trim();
      if (!email) return alert("Escribe el email.");
      if (!nombre) return alert("Escribe el nombre del usuario.");
      if (repetido(u.data.map(x => x.nombre).concat(nombre))) return alert(`Ya hay un usuario que se llama «${nombre}».`);
      const { data, error: e } = await sb.functions.invoke("invitar-usuario", { body: {
        email, nombre, rol: caja.querySelector("#nvaInvRol").value, redirectTo: location.origin + location.pathname
      } });
      if (e || (data && data.error)) return alert("No se pudo invitar: " + ((data && data.error) || e.message));
      alert(`Invitación enviada a ${email}.`);
      if (window.nvaSincronizarEntrenadores) await window.nvaSincronizarEntrenadores();
      pintarPanelUsuarios();
    };
    caja.querySelector("#nvaGuardarUsuarios").onclick = async () => {
      const filas = Array.from(caja.querySelectorAll("#nvaUsuarios tr"));
      const rep = repetido(filas.map(tr => tr.querySelector("[data-campo=nombre]").value));
      if (rep) return alert(`Hay dos usuarios con el mismo nombre («${rep}»). Cambia uno de ellos.`);
      for (const tr of filas) {
        const cambios = {
          nombre: tr.querySelector("[data-campo=nombre]").value.trim() || null,
          rol: tr.querySelector("[data-campo=rol]").value,
          activo: tr.querySelector("[data-campo=activo]").checked
        };
        const { error: e } = await sb.from("perfiles").update(cambios).eq("id", tr.dataset.id);
        if (e) return alert("Error guardando usuarios: " + e.message);
      }
      alert("Usuarios guardados.");
      if (window.nvaSincronizarEntrenadores) await window.nvaSincronizarEntrenadores();
      pintarPanelUsuarios();
    };
    caja.querySelector("#nvaGuardarPermisos").onclick = async () => {
      const filas = Array.from(caja.querySelectorAll("#nvaPermisos select:not([disabled])"))
        .map(s => ({ rol: s.dataset.rol, menu: s.dataset.menu, acceso: s.value }))
        .concat(Array.from(caja.querySelectorAll("#nvaPermisos input[type=checkbox]"))
          .filter(x => x.dataset.rol !== "propietario")
          .map(x => ({ rol: x.dataset.rol, menu: x.dataset.menu, acceso: x.checked ? "lectura" : "ninguno" })));
      const { error: e } = await sb.from("permisos_rol").upsert(filas);
      if (e) return alert("Error guardando permisos: " + e.message);
      alert("Permisos guardados. Cada usuario los verá al volver a abrir la app.");
    };

    caja.querySelector("#nvaCrearRol").onclick = async () => {
      const nombre = caja.querySelector("#nvaRolNombre").value.trim();
      if (!nombre) return alert("Escribe el nombre del rol.");
      if (roles.some(x => x.nombre.toLowerCase() === nombre.toLowerCase())) return alert("Ya hay un rol con ese nombre.");
      const base = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "rol";
      let id = base;
      for (let n = 2; roles.some(x => x.id === id); n++) id = `${base}_${n}`;
      const { error: e1 } = await sb.from("roles").insert({ id, nombre, nivel: 30, gestiona_usuarios: false, restringir_equipos: caja.querySelector("#nvaRolEquipos").checked });
      if (e1) return alert("No se pudo crear el rol: " + e1.message);
      // Permisos de partida: los del rol elegido (el propietario no tiene filas «—»)
      const copia = caja.querySelector("#nvaRolCopia").value;
      const filas = menus.map(mn => ({ rol: id, menu: mn.id,
        acceso: copia === "propietario" ? "escritura" : (nivel(copia, mn.id) || (mn.padre && nivel(copia, mn.padre)) || "ninguno") }));
      const { error: e2 } = await sb.from("permisos_rol").upsert(filas);
      if (e2) alert("El rol se creó, pero no sus permisos: " + e2.message);
      rolPermisosElegido = id;
      alert(`Rol «${nombre}» creado.`);
      pintarPanelUsuarios();
    };
    caja.querySelectorAll(".nva-borrar").forEach(b => b.onclick = async () => {
      const rol = roles.find(x => x.id === b.dataset.id);
      const n = usuariosDeRol(rol.id);
      if (n) return alert(`Hay ${n} usuario${n === 1 ? "" : "s"} con el rol «${rol.nombre}». Cámbiales el rol antes de borrarlo.`);
      if (!confirm(`¿Borrar el rol «${rol.nombre}»?`)) return;
      const { error: e } = await sb.from("roles").delete().eq("id", rol.id);
      if (e) return alert("No se pudo borrar el rol: " + e.message);
      pintarPanelUsuarios();
    });
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
      if (typeof window.openOptionsModal !== "function") return;
      const abrir = async () => { await window.openOptionsModal(); abrirPrimeraPestana(); };
      window.withLoading ? window.withLoading(abrir, "Sincronizando...") : abrir();
    };
    window.nvaPintarPanelUsuarios = pintarPanelUsuarios;

    sb.auth.onAuthStateChange(evento => {
      if (evento === "PASSWORD_RECOVERY") pintarLogin("clave", "Escribe tu nueva contraseña.");
      if (evento === "SIGNED_IN" && !esInvitacion && !perfil && document.getElementById("nvaLogin")) alEntrar();
    });
    if (esInvitacion) pintarLogin("clave");
    else alEntrar();
  }

  try {
    if (localStorage.getItem(SALIENDO)) { borrarSesionGuardada(); localStorage.removeItem(SALIENDO); }
  } catch (e) {}
  if (CFG.url && CFG.anonKey && window.supabase) {
    sb = window.supabase.createClient(CFG.url, CFG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "NVA_SUPABASE_AUTH" }
    });
  }
  // Usuarios con rol Entrenador (son los entrenadores de Opciones › Entrenadores y equipos).
  // Solo el propietario ve todos los perfiles; para el resto devuelve null.
  async function entrenadores() {
    if (!sb || !perfil || perfil.rol !== "propietario") return null;
    const { data, error } = await sb.from("perfiles").select("id,email,nombre").eq("rol", "entrenador").eq("activo", true);
    if (error || !data) return null;
    return data.map(x => ({ id: x.id, email: x.email, nombre: (x.nombre || "").trim() || x.email.split("@")[0] }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  window.nva = {
    get cliente() { return sb; },
    entrenadores,
    get perfil() { return perfil; },
    acceso,
    listo,
    salir
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
