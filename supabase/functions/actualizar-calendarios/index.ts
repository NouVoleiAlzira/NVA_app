// Actualización programada de los PDF de partidos de la federación.
//
// Descarga y revisa los PDF de Calendario de partidos en el servidor, sin
// nadie delante:
//   1. baja el PDF de cada equipo con iden y lo guarda en Calendarios/<Equipo>.pdf
//   2. lo lee y comprueba si han cambiado fechas, horas o pabellones
//      (CalendarioPartidos.json: «Sin cambios» / «Con cambios» y su detalle)
//   3. pasa los resultados a los registros de partido que YA existen
//      (Partidos/…json). Si el registro tiene otro resultado no se toca:
//      se pregunta en la app la próxima vez que se pulse «Actualizar ahora».
// Lo elegido en la app (activa, hora) y el resumen de la última vez están en
// CalendarioProgramada.json; los partidos, en CalendarioPartidos.json.
//
// Quién la llama:
//   · pg_cron, cada hora en punto (migración 20261026000003). Solo trabaja si
//     la opción está activada en la app y es la hora elegida (hora de España),
//     y una vez al día. Se identifica con la clave de public.tareas_clave.
//   · la app, botón «Actualizar ahora» ({ ahora: true }), con la sesión de quien
//     pulsa: tiene que poder escribir en Calendarios/.
//   · ella misma ({ leer }) para leer cada PDF en una llamada aparte: Supabase
//     da 2 s de CPU por llamada y leer todos los PDF en una sola no cabría.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { getDocumentProxy } from "npm:unpdf@1.4.0";
import "../_shared/lectura-calendarios.js";
import { bajarPdf, idenValido, motivoFallo, pausa, rutaPdf } from "../_shared/federacion.ts";

// deno-lint-ignore no-explicit-any
const L = (globalThis as any).nvaCalLectura;
// deno-lint-ignore no-explicit-any
type Json = any;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "privado";
const CP_FILE = "CalendarioPartidos.json";
const CONFIG_FILE = "configuracion.json";
const PROG_FILE = "CalendarioProgramada.json";
const ZONA = "Europe/Madrid";
// Supabase corta la función a los 150 s: a partir de aquí no se empieza otro equipo
const MARGEN_MS = 110_000;

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL_BASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function claveTarea(): Promise<string> {
  const { data } = await admin.from("tareas_clave").select("clave").eq("nombre", "actualizar-calendarios").maybeSingle();
  return data?.clave ?? "";
}

async function leerArchivo(ruta: string): Promise<{ contenido: string; version: number } | null> {
  const { data, error } = await admin.from("archivos").select("contenido, version").eq("ruta", ruta).maybeSingle();
  if (error) throw new Error(`no se pudo leer ${ruta}: ${error.message}`);
  return data;
}
// Guarda solo si nadie lo ha cambiado desde que se leyó (misma versión)
async function guardarArchivo(ruta: string, contenido: string, version: number | null, equipo: string | null = null) {
  const q = version == null
    ? admin.from("archivos").insert({ ruta, contenido, equipo }).select("version")
    : admin.from("archivos").update({ ruta, contenido, equipo }).eq("ruta", ruta).eq("version", version).select("version");
  const { data, error } = await q;
  if (error) throw new Error(`no se pudo guardar ${ruta}: ${error.message}`);
  return !!(data && data.length);
}

function ahoraEnEspana(d = new Date()) {
  const dia = d.toLocaleDateString("sv-SE", { timeZone: ZONA });   // AAAA-MM-DD
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", hourCycle: "h23" }).format(d));
  return { dia, hora };
}

function aBase64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function deBase64(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function lineasDe(pdf: Uint8Array) {
  return L.pdfLines(await getDocumentProxy(pdf));
}
// Cada PDF se lee en una llamada aparte (su propio límite de CPU); si falla, aquí mismo
async function leerAparte(pdf: Uint8Array, clave: string) {
  try {
    const r = await fetch(`${URL_BASE}/functions/v1/actualizar-calendarios`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", "x-clave-tarea": clave },
      body: JSON.stringify({ leer: aBase64(pdf) }),
      signal: AbortSignal.timeout(30000),
    });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j.lineas)) return j.lineas; }
    console.warn("Lectura aparte fallida:", r.status, await r.text().catch(() => ""));
  } catch (e) { console.warn("Lectura aparte fallida:", e); }
  return lineasDe(pdf);
}

const fmtDia = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const getTeamKey = (t: Json) => (typeof t === "string" ? t : `${t.name} (${t.category})`);

type Lectura = { key: string; fed: string; matches: Json[]; fileName: string };

async function actualizar(clave: string, quien: string) {
  const inicio = Date.now();
  const fila = await leerArchivo(CP_FILE);
  const cp: Json = fila ? JSON.parse(fila.contenido) : { teams: {}, updated: "" };
  cp.teams = cp.teams || {};
  const conf = await leerArchivo(CONFIG_FILE);
  const equipos: Json[] = (conf ? JSON.parse(conf.contenido).teams : null) || [];
  const conIden = equipos.filter((t) => (cp.idens || {})[getTeamKey(t)]);

  // 1 y 2. Bajar, guardar y leer cada PDF
  const resumen: string[] = [];
  const lecturas: Lectura[] = [];
  for (const team of conIden) {
    const key = getTeamKey(team), iden = cp.idens[key];
    if (Date.now() - inicio > MARGEN_MS) { resumen.push(`- ${key}: no dio tiempo (se hará en la próxima actualización)`); continue; }
    if (!idenValido(iden)) { resumen.push(`- ${key}: iden no válido`); continue; }
    let pdf: Uint8Array;
    try {
      pdf = await bajarPdf(iden);
      const { error } = await admin.storage.from(BUCKET).upload(rutaPdf(key), pdf, { upsert: true, contentType: "application/pdf" });
      if (error) throw new Error(`no se pudo guardar: ${error.message}`);
    } catch (e) {
      resumen.push(`- ${key}: no se pudo descargar (${motivoFallo(e)})`);
      await pausa();
      continue;
    }
    try {
      const lines = await leerAparte(pdf, clave);
      const fed = L.previousFedName(lines, cp.teams[key]) || L.findFedName(lines, team).best;
      if (!fed) resumen.push(`- ${key}: no se reconoce el equipo en el PDF (súbelo con «Actualizar manualmente» para elegirlo)`);
      else {
        const matches = L.extractMatches(lines, fed);
        if (!matches.length) resumen.push(`- ${key}: «${fed}» sin partidos con fecha`);
        else lecturas.push({ key, fed, matches, fileName: rutaPdf(key).split("/").pop()! });
      }
    } catch (e) {
      console.error(e);
      resumen.push(`- ${key}: no se pudo leer el PDF`);
    }
    await pausa();
  }

  // Estado de cada equipo tras aplicar las lecturas (se repite si alguien guarda a la vez)
  const aplicar = (obj: Json, now: string) => {
    obj.teams = obj.teams || {};
    return lecturas.map((x) => ({ x, estado: L.aplicarLectura(obj, x.key, x.fed, x.matches, x.fileName, now) as string }));
  };
  const now = new Date().toISOString();
  const estados = aplicar(cp, now);

  // 3. Resultados a los registros de partido que ya existen
  let grabados = 0, distintos = 0, iguales = 0, fallos = 0;
  for (const p of L.playedMatches(cp, lecturas.map((x) => x.key))) {
    const ruta = L.rutaRegistro(p.key, p.fecha);
    try {
      const reg = await leerArchivo(ruta);
      if (!reg) continue;
      const log = JSON.parse(reg.contenido);
      if (log.equipo !== p.key || log.fecha !== p.fecha) continue;
      const nuevo = L.buildMarcador(p, L.MATCH_SETS_COUNT);
      const oldTxt = L.marcadorTxt(log.marcador);
      if (oldTxt && oldTxt !== L.marcadorTxt(nuevo)) { distintos++; continue; }
      if (oldTxt) { iguales++; continue; }
      log.marcador = nuevo;
      if (await guardarArchivo(ruta, JSON.stringify(log, null, 2), reg.version, log.equipo)) grabados++; else fallos++;
    } catch (e) { console.error(e); fallos++; }
  }

  const lineasEquipo = estados.map(({ x, estado }) => {
    const st = estado === "nuevo" ? "Nuevo (primera carga)" : estado === "con cambios" ? "Con cambios" : "Sin cambios";
    const desde = estado === "sin cambios" && cp.teams[x.key].changedAt ? ` desde ${fmtDia(cp.teams[x.key].changedAt)}` : "";
    return `- ${x.key}: ${x.matches.length} partidos\n   ${st}${desde}`;
  });
  const todo = lineasEquipo.concat(resumen);
  if (grabados + distintos + iguales + fallos) {
    todo.push(`Resultados en registros de partido: ${grabados} grabado(s), ${iguales} sin cambios` +
      (distintos ? `, ${distintos} distinto(s) al grabado (se pregunta al pulsar «Actualizar ahora»)` : "") +
      (fallos ? `, ${fallos} sin guardar por un error` : "") + ".");
  }
  const { dia } = ahoraEnEspana();
  const ultima = {
    fecha: now, dia, manual: !!quien, quien,
    equipos: estados.length, conCambios: estados.filter((e) => e.estado === "con cambios").length,
    resumen: todo,
  };

  // Guardar CalendarioPartidos.json sin pisar lo que otro haya guardado entretanto
  let version = fila ? fila.version : null, obj = cp, guardado = false;
  for (let intento = 0; intento < 4 && !guardado; intento++) {
    if (intento) {
      const fresca = await leerArchivo(CP_FILE);
      obj = fresca ? JSON.parse(fresca.contenido) : { teams: {}, updated: "" };
      version = fresca ? fresca.version : null;
      aplicar(obj, now);
    }
    guardado = await guardarArchivo(CP_FILE, JSON.stringify(obj, null, 2), version);
  }
  if (!guardado) ultima.resumen.unshift("⚠️ No se pudieron guardar los partidos (otros cambios a la vez). Pulsa «Actualizar ahora».");

  // Resumen en CalendarioProgramada.json (sin tocar lo elegido en la app)
  for (let intento = 0; intento < 4; intento++) {
    const pf = await leerArchivo(PROG_FILE);
    const prog = pf ? JSON.parse(pf.contenido) : {};
    prog.ultima = ultima;
    if (await guardarArchivo(PROG_FILE, JSON.stringify(prog, null, 2), pf ? pf.version : null)) return ultima;
  }
  return ultima;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const cuerpo = await req.json().catch(() => ({}));
  const clave = await claveTarea();
  const conClave = !!clave && req.headers.get("x-clave-tarea") === clave;

  try {
    // Lectura de un PDF (llamada hecha por esta misma función)
    if (cuerpo.leer) {
      if (!conClave) return respuesta(401, { error: "Clave no válida" });
      return respuesta(200, { lineas: await lineasDe(deBase64(cuerpo.leer)) });
    }

    // «Actualizar ahora» desde la app
    if (cuerpo.ahora) {
      const comoUsuario = createClient(URL_BASE, ANON, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      const { data: usuario } = await comoUsuario.auth.getUser();
      const { data: puede } = await comoUsuario.rpc("puede_escribir", { p_ruta: "Calendarios/", p_equipo: null });
      if (!usuario?.user || !puede) return respuesta(403, { error: "Sin permiso para actualizar los PDF" });
      if (!clave) return respuesta(500, { error: "Falta la clave de la tarea (migración sin aplicar)" });
      return respuesta(200, { ultima: await actualizar(clave, usuario.user.email ?? "app") });
    }

    // Llamada de cada hora (pg_cron): ¿toca hoy y a esta hora?
    if (!conClave) return respuesta(401, { error: "Clave no válida" });
    const pf = await leerArchivo(PROG_FILE);
    const prog = pf ? JSON.parse(pf.contenido) : {};
    const { dia, hora } = ahoraEnEspana();
    if (!prog.activa) return respuesta(200, { omitida: "desactivada" });
    if (Number(prog.hora) !== hora) return respuesta(200, { omitida: `programada a las ${prog.hora}:00` });
    if (prog.ultima && prog.ultima.dia === dia && !prog.ultima.manual) return respuesta(200, { omitida: "ya se hizo hoy" });
    return respuesta(200, { ultima: await actualizar(clave, "") });
  } catch (e) {
    console.error(e);
    return respuesta(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
