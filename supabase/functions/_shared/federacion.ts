// Descarga de los PDF de partidos de la federación (fvbcv.com).
// La usan actualizar-calendarios (botón «Actualizar ahora» y actualización
// programada) y descargar-calendarios (el antiguo «Actualizar automáticamente»).

export const FED_URL = (iden: string) => `https://fvbcv.com/exportar_competiciones.php?idens=${encodeURIComponent(iden)}`;
export const idenValido = (iden: unknown): iden is string => typeof iden === "string" && /^\d{4,5}$/.test(iden);

// Igual que sanitizeFileName() de la app
export function nombreArchivo(nombre: string) {
  return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "_");
}
export const rutaPdf = (equipo: string) => `Calendarios/${nombreArchivo(equipo)}.pdf`;

export async function bajarPdf(iden: string): Promise<Uint8Array> {
  const r = await fetch(FED_URL(iden), {
    headers: { "User-Agent": "Mozilla/5.0 (NVA calendarios)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`la federación respondió ${r.status}`);
  const datos = new Uint8Array(await r.arrayBuffer());
  if (new TextDecoder().decode(datos.slice(0, 5)) !== "%PDF-") throw new Error("la respuesta no es un PDF");
  return datos;
}

export function motivoFallo(e: unknown) {
  return e instanceof Error && e.name === "TimeoutError" ? "la federación no respondió" : e instanceof Error ? e.message : String(e);
}

// Uno a uno, sin saturar la web de la federación
export const pausa = (ms = 1000) => new Promise((r) => setTimeout(r, ms));
