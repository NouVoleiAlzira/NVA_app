// Fichas de Federación en el Drive del club (Entrenamientos y Partidos ›
// Fichas de Federación).
//
// Las fichas llevan datos de menores, así que se guardan en una carpeta
// PRIVADA del Drive del club («NVA · Fichas de Federación», solo la ve la
// cuenta del club). La app nunca habla con Drive: esta función comprueba los
// permisos de quien llama y se lo pide al Apps Script del club
// (_shared/drive.ts → supabase/drive/apps-script.gs).
//
// Llamadas desde la app:
//   supabase.functions.invoke("fichas-drive", { body: { accion: "subir", equipo: "NVA A (Cadete)", pdf: "<base64>" } })
//     → { id, actualizado }   (quien pueda editar Fichas de Federación; un entrenador, solo sus equipos)
//   supabase.functions.invoke("fichas-drive", { body: { accion: "leer", equipo: "NVA A (Cadete)" } })
//     → { pdf: "<base64>", nombre }   (quien pueda ver la subsección Fichas de Federación)
// Qué equipo tiene ficha y cuándo se subió: Fichas/drive.json
//   { "<equipo>": { id, actualizado, por } }
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ErrorDrive, llamarScript } from "../_shared/drive.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const INDICE = "Fichas/drive.json";
const MAX_BASE64 = 14_000_000; // ~10 MB de PDF
const nombreFicha = (equipo: string) => `Licencias - ${equipo}.pdf`;

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const { accion, equipo, pdf } = await req.json().catch(() => ({}));
  if (accion !== "subir" && accion !== "leer") return respuesta(400, { error: "Acción no válida" });
  if (typeof equipo !== "string" || !/^[^/\\]{1,100}$/.test(equipo)) return respuesta(400, { error: "Equipo no válido" });

  const comoUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: usuario } = await comoUsuario.auth.getUser();
  if (!usuario?.user) return respuesta(401, { error: "Inicia sesión de nuevo" });

  // Índice leído con la sesión de quien llama (sus permisos de Fichas/)
  const { data: fila } = await comoUsuario.from("archivos").select("contenido, version").eq("ruta", INDICE).maybeSingle();
  let indice: Record<string, { id: string; actualizado: string; por?: string }> = {};
  try { indice = fila ? JSON.parse(fila.contenido) : {}; } catch { indice = {}; }

  try {
    if (accion === "leer") {
      // Llevan datos de menores: hace falta ver la subsección, no basta con la sección
      const { data: acceso } = await comoUsuario.rpc("acceso_menu", { p_menu: "informes.fichas" });
      if (acceso !== "lectura" && acceso !== "escritura") return respuesta(403, { error: "Sin permiso para ver las fichas" });
      const d = await llamarScript({ accion: "leer", carpeta: "fichas", id: indice[equipo]?.id || "", nombre: nombreFicha(equipo) });
      if (!d.pdf) throw new ErrorDrive("Drive no devolvió el PDF");
      return respuesta(200, { pdf: d.pdf, nombre: d.nombre || nombreFicha(equipo) });
    }

    if (typeof pdf !== "string" || !pdf || pdf.length > MAX_BASE64) return respuesta(400, { error: "Falta el PDF o es demasiado grande (máximo 10 MB)" });
    const { data: puede } = await comoUsuario.rpc("puede_escribir", { p_ruta: INDICE, p_equipo: equipo });
    if (!puede) return respuesta(403, { error: `Sin permiso para cambiar la ficha de ${equipo}` });

    // Un Apps Script antiguo no conoce la carpeta privada y guardaría la ficha en
    // la carpeta pública de los PDF de resultados: sin la versión 2 no se sube.
    const v = await llamarScript({ accion: "version" }).catch(() => ({}));
    if (!(v.version >= 2)) throw new ErrorDrive("Hay que actualizar el Apps Script del Drive del club (nueva versión con las Fichas de Federación).", 500);

    const d = await llamarScript({ carpeta: "fichas", nombre: nombreFicha(equipo), pdf, id: indice[equipo]?.id || "" });
    if (!d.id) throw new ErrorDrive("Drive no devolvió el archivo");

    // Se apunta en el índice; si otro lo cambió entretanto, se vuelve a leer
    const { data: perfil } = await comoUsuario.from("perfiles").select("nombre, email").eq("id", usuario.user.id).maybeSingle();
    const entrada = {
      id: d.id,
      actualizado: new Date().toISOString(),
      por: (perfil?.nombre || "").trim() || String(perfil?.email || usuario.user.email || "").split("@")[0],
    };
    let version = fila ? fila.version : null;
    for (let intento = 0; intento < 4; intento++) {
      indice[equipo] = entrada;
      const contenido = JSON.stringify(indice, null, 2);
      const q = version == null
        ? comoUsuario.from("archivos").insert({ ruta: INDICE, contenido, equipo: null }).select("version")
        : comoUsuario.from("archivos").update({ contenido }).eq("ruta", INDICE).eq("version", version).select("version");
      const { data, error } = await q;
      if (!error && data && data.length) return respuesta(200, entrada);
      const { data: otra } = await comoUsuario.from("archivos").select("contenido, version").eq("ruta", INDICE).maybeSingle();
      try { indice = otra ? JSON.parse(otra.contenido) : {}; } catch { indice = {}; }
      version = otra ? otra.version : null;
    }
    throw new ErrorDrive("La ficha está en Drive, pero no se pudo apuntar en la app. Vuelve a subirla.", 500);
  } catch (e) {
    return respuesta(e instanceof ErrorDrive ? e.status : 502, { error: e instanceof Error ? e.message : String(e) });
  }
});
