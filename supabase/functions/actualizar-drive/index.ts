// Actualización programada de los PDF «Partidos y Resultados» en Drive.
//
// Hace en el servidor, sin nadie delante, lo mismo que el botón
// «Actualizar vínculos» de Dirección NVA › PDFs Resultados en Drive:
//   1. genera el PDF de cada equipo a partir de su PDF de la federación
//      (Calendarios/<Equipo>.pdf), con el mismo dibujo que la app
//      (_shared/pdf-resultados.js)
//   2. lo guarda en el Drive del club (el mismo archivo: el enlace no cambia)
//   3. apunta los enlaces en DrivePDFs/enlaces.json
// Lo elegido en la app (activa, hora, días) y el resumen de la última vez
// están en DrivePDFs/programada.json.
//
// Quién la llama (siempre con la clave de public.tareas_clave):
//   · pg_cron, cada hora a y 10 (migración 20261026000004). Solo trabaja si
//     está activada, es uno de los días elegidos y la hora elegida (hora de
//     España), y una vez al día. Los 10 minutos dejan terminar antes la
//     actualización programada de los PDF de la federación.
//   · ella misma ({ equipo }) para cada equipo en una llamada aparte:
//     Supabase da 2 s de CPU por llamada y todos en una sola no cabrían.
//   · a mano para probar ({ ahora: true }), sin mirar el día ni la hora.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { getDocumentProxy } from "npm:unpdf@1.4.0";
import { jsPDF } from "npm:jspdf@2.5.1";
import "../_shared/lectura-calendarios.js";
import "../_shared/pdf-resultados.js";
import { rutaPdf } from "../_shared/federacion.ts";
import { guardarEnDrive, nombreDrive } from "../_shared/drive.ts";
import { LOGO_PDF } from "../_shared/logo-pdf.ts";

// deno-lint-ignore no-explicit-any
const L = (globalThis as any).nvaCalLectura;
// deno-lint-ignore no-explicit-any
const R = (globalThis as any).nvaPdfResultados;
// deno-lint-ignore no-explicit-any
type Json = any;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "privado";
const CP_FILE = "CalendarioPartidos.json";
const CONFIG_FILE = "configuracion.json";
const ENLACES_FILE = "DrivePDFs/enlaces.json";
const PROG_FILE = "DrivePDFs/programada.json";
const ZONA = "Europe/Madrid";
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
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
  const { data } = await admin.from("tareas_clave").select("clave").eq("nombre", "actualizar-drive").maybeSingle();
  return data?.clave ?? "";
}

async function leerArchivo(ruta: string): Promise<{ contenido: string; version: number } | null> {
  const { data, error } = await admin.from("archivos").select("contenido, version").eq("ruta", ruta).maybeSingle();
  if (error) throw new Error(`no se pudo leer ${ruta}: ${error.message}`);
  return data;
}
const leerJson = async (ruta: string, vacio: Json = {}) => {
  const f = await leerArchivo(ruta);
  return { obj: f ? JSON.parse(f.contenido) : vacio, version: f ? f.version : null };
};
// Guarda solo si nadie lo ha cambiado desde que se leyó (misma versión)
async function guardarArchivo(ruta: string, contenido: string, version: number | null) {
  const q = version == null
    ? admin.from("archivos").insert({ ruta, contenido, equipo: null }).select("version")
    : admin.from("archivos").update({ ruta, contenido }).eq("ruta", ruta).eq("version", version).select("version");
  const { data, error } = await q;
  if (error) throw new Error(`no se pudo guardar ${ruta}: ${error.message}`);
  return !!(data && data.length);
}
// Lee, cambia y guarda; si otro guardó entretanto, vuelve a empezar
async function cambiarArchivo(ruta: string, cambio: (obj: Json) => void) {
  for (let intento = 0; intento < 4; intento++) {
    const { obj, version } = await leerJson(ruta);
    cambio(obj);
    if (await guardarArchivo(ruta, JSON.stringify(obj, null, 2), version)) return true;
  }
  return false;
}

function ahoraEnEspana(d = new Date()) {
  const dia = d.toLocaleDateString("sv-SE", { timeZone: ZONA });   // AAAA-MM-DD
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", hourCycle: "h23" }).format(d));
  const semana = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    .indexOf(new Intl.DateTimeFormat("en-US", { timeZone: ZONA, weekday: "short" }).format(d));
  return { dia, hora, letra: DIAS[semana] };
}

function aBase64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const getTeamKey = (t: Json) => (typeof t === "string" ? t : `${t.name} (${t.category})`);
async function equipos(): Promise<Json[]> {
  const { obj } = await leerJson(CONFIG_FILE);
  const vistos = new Map<string, Json>();
  (obj.teams || []).forEach((t: Json) => { const k = getTeamKey(t); if (!vistos.has(k)) vistos.set(k, t); });
  return [...vistos.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([, t]) => t);
}

// Un equipo: PDF de la federación -> PDF Partidos y Resultados -> Drive
async function subirEquipo(team: Json, id: string) {
  const key = getTeamKey(team);
  const { data, error } = await admin.storage.from(BUCKET).download(rutaPdf(key));
  if (error || !data) throw new Error("no hay PDF de competición guardado");
  const lines = (await L.pdfLines(await getDocumentProxy(new Uint8Array(await data.arrayBuffer())))).map((l: Json) => l.text.trim());
  const { obj: cp } = await leerJson(CP_FILE);
  const fed = cp.teams && cp.teams[key] && cp.teams[key].fedName;
  const pdf = R.pdfDeEquipo(jsPDF, key, lines, LOGO_PDF, { fed, team });
  return guardarEnDrive(nombreDrive(key), aBase64(new Uint8Array(pdf.output("arraybuffer"))), id);
}

// Cada equipo en una llamada aparte (su propio límite de CPU)
async function subirAparte(key: string, id: string, clave: string): Promise<{ id: string; url: string }> {
  const r = await fetch(`${URL_BASE}/functions/v1/actualizar-drive`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", "x-clave-tarea": clave },
    body: JSON.stringify({ equipo: key, id }),
    signal: AbortSignal.timeout(90000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error || `error ${r.status}`);
  return j;
}

async function actualizarTodo(clave: string, manual: boolean) {
  const inicio = Date.now();
  const lista = await equipos();
  const { obj: enlaces } = await leerJson(ENLACES_FILE);
  const nuevos: Record<string, Json> = {};
  const fallos: string[] = [];
  for (const team of lista) {
    const key = getTeamKey(team);
    if (Date.now() - inicio > MARGEN_MS) { fallos.push(`- ${key}: no dio tiempo (se hará la próxima vez)`); continue; }
    try {
      const r = await subirAparte(key, (enlaces[key] && enlaces[key].id) || "", clave);
      nuevos[key] = { id: r.id, url: r.url, actualizado: new Date().toISOString() };
    } catch (e) {
      console.warn(key, e);
      fallos.push(`- ${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const hechos = Object.keys(nuevos).length;
  if (hechos && !await cambiarArchivo(ENLACES_FILE, (obj) => Object.assign(obj, nuevos))) {
    fallos.unshift("⚠️ No se pudieron guardar los vínculos (otros cambios a la vez).");
  }
  const ultima = {
    fecha: new Date().toISOString(), dia: ahoraEnEspana().dia, manual,
    equipos: hechos,
    resumen: (hechos ? [`Actualizados ${hechos} equipo(s).`] : []).concat(fallos.length ? ["No se han podido subir:", ...fallos] : []),
  };
  await cambiarArchivo(PROG_FILE, (obj) => { obj.ultima = ultima; });
  return ultima;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const cuerpo = await req.json().catch(() => ({}));
  const clave = await claveTarea();
  if (!clave || req.headers.get("x-clave-tarea") !== clave) return respuesta(401, { error: "Clave no válida" });

  try {
    // Un equipo (llamada hecha por esta misma función)
    if (cuerpo.equipo) {
      const team = (await equipos()).find((t) => getTeamKey(t) === cuerpo.equipo);
      if (!team) return respuesta(400, { error: "Equipo desconocido" });
      const id = typeof cuerpo.id === "string" && /^[\w-]{10,100}$/.test(cuerpo.id) ? cuerpo.id : "";
      return respuesta(200, await subirEquipo(team, id));
    }

    // Prueba a mano
    if (cuerpo.ahora) return respuesta(200, { ultima: await actualizarTodo(clave, true) });

    // Llamada de cada hora (pg_cron): ¿toca hoy y a esta hora?
    const { obj: prog } = await leerJson(PROG_FILE);
    const { dia, hora, letra } = ahoraEnEspana();
    if (!prog.activa) return respuesta(200, { omitida: "desactivada" });
    if (!(prog.dias || []).includes(letra)) return respuesta(200, { omitida: `hoy (${letra}) no toca` });
    if (Number(prog.hora) !== hora) return respuesta(200, { omitida: `programada a las ${prog.hora}:00` });
    if (prog.ultima && prog.ultima.dia === dia && !prog.ultima.manual) return respuesta(200, { omitida: "ya se hizo hoy" });
    return respuesta(200, { ultima: await actualizarTodo(clave, false) });
  } catch (e) {
    console.error(e);
    return respuesta(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
