// Guarda un PDF en el Drive del club a través del Apps Script del club
// (supabase/drive/apps-script.gs). Si el archivo ya existe se cambia su
// contenido y el enlace sigue siendo el mismo.
// La usan subir-drive (botón «Actualizar vínculos»), actualizar-drive
// (actualización programada) y fichas-drive (Fichas de Federación).
//
// Secretos necesarios (supabase secrets set ...):
//   DRIVE_SCRIPT_URL    URL de la aplicación web del Apps Script (termina en /exec)
//   DRIVE_SCRIPT_CLAVE  la misma clave que CLAVE en el Apps Script

export const nombreDrive = (equipo: string) => `Partidos y Resultados - ${equipo}.pdf`;

export class ErrorDrive extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

// Llama al Apps Script con la clave. Devuelve su respuesta o lanza ErrorDrive.
// deno-lint-ignore no-explicit-any
export async function llamarScript(cuerpo: Record<string, unknown>): Promise<any> {
  const url = Deno.env.get("DRIVE_SCRIPT_URL");
  const clave = Deno.env.get("DRIVE_SCRIPT_CLAVE");
  if (!url || !clave) throw new ErrorDrive("Falta configurar DRIVE_SCRIPT_URL y DRIVE_SCRIPT_CLAVE en Supabase", 500);
  try {
    // Apps Script contesta con una redirección a googleusercontent.com: fetch la sigue sola.
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cuerpo, clave }),
      signal: AbortSignal.timeout(60000),
    });
    const texto = await r.text();
    let datos;
    try { datos = JSON.parse(texto); } catch {
      throw new ErrorDrive(`El Apps Script no respondió bien (${r.status}). ¿Está publicado con acceso «Cualquier usuario»?`);
    }
    if (datos.error) throw new ErrorDrive(datos.error);
    return datos;
  } catch (e) {
    if (e instanceof ErrorDrive) throw e;
    throw new ErrorDrive(e instanceof Error && e.name === "TimeoutError" ? "Drive tardó demasiado en responder" : String(e));
  }
}

// pdf en base64; id: el del archivo en Drive si ya existe («» si no)
export async function guardarEnDrive(nombre: string, pdf: string, id = ""): Promise<{ id: string; url: string }> {
  const datos = await llamarScript({ nombre, pdf, id: id || "" });
  if (!datos.url) throw new ErrorDrive("Drive no devolvió el enlace");
  return { id: datos.id, url: datos.url };
}
