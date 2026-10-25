// Descarga los PDF de partidos de la federación (fvbcv.com) y los guarda en
// Storage (bucket «privado») como Calendarios/<Equipo>.pdf, sobrescribiendo.
//
// El navegador no puede bajarlos (fvbcv.com bloquea las descargas desde otras
// webs), pero un servidor sí. Sustituye a la tarea de GitHub
// descargar-calendarios.yml: responde en segundos y sin pasar por GitHub.
//
// Llamada desde la app (botón «Actualizar automáticamente»):
//   supabase.functions.invoke("descargar-calendarios", {
//     body: { idens: { "Enova NVA (Infantil)": "1234", ... } }
//   })
// Respuesta: { resultados: { "<Equipo>": "ok" | "<motivo del fallo>" } }
//
// Los PDF se guardan con la sesión de quien llama, así que los permisos de
// Storage (RLS) deciden si puede escribir en Calendarios/.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "privado";
// Supabase corta la función a los 150 s: a partir de aquí no se empieza otro PDF
// y los que falten se piden en otra pulsación.
const MARGEN_MS = 100_000;
const MAX_EQUIPOS = 60;
const FED_URL = (iden: string) => `https://fvbcv.com/exportar_competiciones.php?idens=${encodeURIComponent(iden)}`;

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Igual que sanitizeFileName() de la app
function nombreArchivo(nombre: string) {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function bajarPdf(iden: string): Promise<Uint8Array> {
  const r = await fetch(FED_URL(iden), {
    headers: { "User-Agent": "Mozilla/5.0 (NVA calendarios)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`la federación respondió ${r.status}`);
  const datos = new Uint8Array(await r.arrayBuffer());
  if (new TextDecoder().decode(datos.slice(0, 5)) !== "%PDF-") throw new Error("la respuesta no es un PDF");
  return datos;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const { idens } = await req.json().catch(() => ({}));
  if (!idens || typeof idens !== "object" || Array.isArray(idens)) return respuesta(400, { error: "Faltan los iden de los equipos" });
  if (Object.keys(idens).length > MAX_EQUIPOS) return respuesta(400, { error: `Como mucho ${MAX_EQUIPOS} equipos a la vez` });

  const comoUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: usuario } = await comoUsuario.auth.getUser();
  const { data: puede } = await comoUsuario.rpc("puede_escribir", { p_ruta: "Calendarios/", p_equipo: null });
  if (!usuario?.user || !puede) return respuesta(403, { error: "Sin permiso para actualizar los PDF" });

  const inicio = Date.now();
  const resultados: Record<string, string> = {};
  for (const [equipo, iden] of Object.entries(idens as Record<string, unknown>)) {
    if (Date.now() - inicio > MARGEN_MS) { resultados[equipo] = "no dio tiempo; vuelve a pulsar «Actualizar automáticamente»"; continue; }
    if (typeof iden !== "string" || !/^\d{4,5}$/.test(iden)) { resultados[equipo] = "iden no válido"; continue; }
    try {
      const pdf = await bajarPdf(iden);
      const { error } = await comoUsuario.storage.from(BUCKET).upload(`Calendarios/${nombreArchivo(equipo)}.pdf`, pdf, {
        upsert: true,
        contentType: "application/pdf",
      });
      resultados[equipo] = error ? `no se pudo guardar: ${error.message}` : "ok";
    } catch (e) {
      resultados[equipo] = e instanceof Error && e.name === "TimeoutError" ? "la federación no respondió" : e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 1000)); // uno a uno, sin saturar la web de la federación
  }
  return respuesta(200, { resultados });
});
