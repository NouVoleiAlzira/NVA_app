// Guarda un PDF en el Drive del club (botón «Actualizar vínculos» de
// Dirección NVA › PDFs Resultados en Drive).
//
// La app genera el PDF de cada equipo y lo manda aquí. Esta función
// comprueba que quien llama puede escribir en DrivePDFs/ y lo reenvía al
// Apps Script del club (_shared/drive.ts), que es quien escribe en el
// Drive. Si el archivo ya existe se cambia su contenido y el enlace sigue
// siendo el mismo.
//
// Llamada desde la app:
//   supabase.functions.invoke("subir-drive", {
//     body: { nombre: "Partidos y Resultados - NVA A (Cadete).pdf", pdf: "<base64>", id: "<id en Drive o vacío>" }
//   })
// Respuesta: { id, url } o { error }
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ErrorDrive, guardarEnDrive } from "../_shared/drive.ts";

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

  try {
    return respuesta(200, await guardarEnDrive(nombre, pdf, id || ""));
  } catch (e) {
    return respuesta(e instanceof ErrorDrive ? e.status : 502, { error: e instanceof Error ? e.message : String(e) });
  }
});
