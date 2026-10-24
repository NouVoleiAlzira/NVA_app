// Lanza la tarea automática (GitHub Actions) que corresponde a un archivo
// «solicitud» que la app acaba de guardar en Supabase.
//
// Antes, la app escribía ese archivo en el repositorio de datos y el propio
// push arrancaba el workflow. Ahora el archivo vive en Supabase, así que
// esta función comprueba que quien llama puede escribir en esa ruta y
// arranca el workflow con workflow_dispatch. El workflow lee la solicitud
// y guarda sus resultados en Supabase.
//
// Secretos necesarios (supabase secrets set ...):
//   GITHUB_TOKEN  token con permiso «Actions: write» sobre TAREAS_REPO
//   TAREAS_REPO   repositorio con los workflows (por defecto el repo privado de datos)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WORKFLOWS: Record<string, string> = {
  "Calendarios/solicitud.json": "descargar-calendarios.yml",
  "Reels/solicitud.json": "generar-reels.yml",
  "Reels/solicitud_historia.json": "generar-historias.yml",
  "Reels/publicar.json": "publicar-reels.yml",
  "Reels/musica/solicitud.json": "descargar-musica.yml",
};

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const { ruta } = await req.json().catch(() => ({}));
  const workflow = WORKFLOWS[ruta];
  if (!workflow) return respuesta(400, { error: "Ruta sin tarea asociada" });

  const comoUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: usuario } = await comoUsuario.auth.getUser();
  const { data: puede } = await comoUsuario.rpc("puede_escribir", { p_ruta: ruta, p_equipo: null });
  if (!usuario?.user || !puede) return respuesta(403, { error: "Sin permiso para lanzar esta tarea" });

  const repo = Deno.env.get("TAREAS_REPO") ?? "NouVoleiAlzira/Registro_Entrenamientos";
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { ruta, solicitante: usuario.user.email ?? "" } }),
  });
  if (!r.ok) return respuesta(502, { error: `GitHub respondió ${r.status}`, detalle: await r.text() });
  return respuesta(200, { lanzada: workflow });
});
