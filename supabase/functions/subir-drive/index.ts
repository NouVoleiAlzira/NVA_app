// Guarda un PDF en el Drive del club (botón «Actualizar vínculos» de
// Dirección NVA › PDFs Resultados en Drive).
//
// La app genera el PDF de cada equipo y lo manda aquí. Esta función
// comprueba que quien llama puede escribir en DrivePDFs/ y lo reenvía al
// Apps Script del club (supabase/drive/apps-script.gs), que es quien escribe
// en el Drive. Si el archivo ya existe se cambia su contenido y el enlace
// sigue siendo el mismo.
//
// Llamada desde la app:
//   supabase.functions.invoke("subir-drive", {
//     body: { nombre: "Partidos y Resultados - NVA A (Cadete).pdf", pdf: "<base64>", id: "<id en Drive o vacío>" }
//   })
// Respuesta: { id, url } o { error }
//
// Secretos necesarios (supabase secrets set ...):
//   DRIVE_SCRIPT_URL    URL de la aplicación web del Apps Script (termina en /exec)
//   DRIVE_SCRIPT_CLAVE  la misma clave que CLAVE en el Apps Script
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_BASE64 = 8_000_000; // ~6 MB de PDF

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const { nombre, pdf, id } = await req.json().catch(() => ({}));
  if (typeof nombre !== "string" || !/^[^/\\]{1,150}\.pdf$/i.test(nombre)) return respuesta(400, { error: "Nombre de archivo no válido" });
  if (typeof pdf !== "string" || !pdf || pdf.length > MAX_BASE64) return respuesta(400, { error: "Falta el PDF o es demasiado grande" });
  if (id && (typeof id !== "string" || !/^[\w-]{10,100}$/.test(id))) return respuesta(400, { error: "Id de Drive no válido" });

  const comoUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: usuario } = await comoUsuario.auth.getUser();
  const { data: puede } = await comoUsuario.rpc("puede_escribir", { p_ruta: "DrivePDFs/", p_equipo: null });
  if (!usuario?.user || !puede) return respuesta(403, { error: "Sin permiso para actualizar los PDF en Drive" });

  const url = Deno.env.get("DRIVE_SCRIPT_URL");
  const clave = Deno.env.get("DRIVE_SCRIPT_CLAVE");
  if (!url || !clave) return respuesta(500, { error: "Falta configurar DRIVE_SCRIPT_URL y DRIVE_SCRIPT_CLAVE en Supabase" });

  try {
    // Apps Script contesta con una redirección a googleusercontent.com: fetch la sigue sola.
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave, nombre, pdf, id: id || "" }),
      signal: AbortSignal.timeout(60000),
    });
    const texto = await r.text();
    let datos: { id?: string; url?: string; error?: string };
    try { datos = JSON.parse(texto); } catch {
      return respuesta(502, { error: `El Apps Script no respondió bien (${r.status}). ¿Está publicado con acceso «Cualquier usuario»?` });
    }
    if (datos.error || !datos.url) return respuesta(502, { error: datos.error || "Drive no devolvió el enlace" });
    return respuesta(200, { id: datos.id, url: datos.url });
  } catch (e) {
    return respuesta(502, { error: e instanceof Error && e.name === "TimeoutError" ? "Drive tardó demasiado en responder" : String(e) });
  }
});
