// Guarda un PDF en el Drive del club a través del Apps Script del club
// (supabase/drive/apps-script.gs). Si el archivo ya existe se cambia su
// contenido y el enlace sigue siendo el mismo.
// La usan subir-drive (botón «Actualizar vínculos») y actualizar-drive
// (actualización programada).
//
// Secretos necesarios (supabase secrets set ...):
//   DRIVE_SCRIPT_URL    URL de la aplicación web del Apps Script (termina en /exec)
//   DRIVE_SCRIPT_CLAVE  la misma clave que CLAVE en el Apps Script

export const nombreDrive = (equipo: string) => `Partidos y Resultados - ${equipo}.pdf`;

export class ErrorDrive extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

// pdf en base64; id: el del archivo en Drive si ya existe («» si no)
export async function guardarEnDrive(nombre: string, pdf: string, id = ""): Promise<{ id: string; url: string }> {
  const url = Deno.env.get("DRIVE_SCRIPT_URL");
  const clave = Deno.env.get("DRIVE_SCRIPT_CLAVE");
  if (!url || !clave) throw new ErrorDrive("Falta configurar DRIVE_SCRIPT_URL y DRIVE_SCRIPT_CLAVE en Supabase", 500);
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
      throw new ErrorDrive(`El Apps Script no respondió bien (${r.status}). ¿Está publicado con acceso «Cualquier usuario»?`);
    }
    if (datos.error || !datos.url) throw new ErrorDrive(datos.error || "Drive no devolvió el enlace");
    return { id: datos.id!, url: datos.url };
  } catch (e) {
    if (e instanceof ErrorDrive) throw e;
    throw new ErrorDrive(e instanceof Error && e.name === "TimeoutError" ? "Drive tardó demasiado en responder" : String(e));
  }
}
