// Copia los datos del repositorio privado (Registro_Entrenamientos) a Supabase.
//   .json / .txt / .md / .csv -> tabla public.archivos (misma ruta)
//   resto (PDF, imágenes, vídeos, música) -> Storage, bucket «privado» (misma ruta)
// Se puede ejecutar varias veces: sobrescribe lo que ya exista con la misma ruta.
//
// Uso (Node 18 o superior, sin instalar nada):
//   git clone https://github.com/NouVoleiAlzira/Registro_Entrenamientos
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/migrar-datos.mjs ./Registro_Entrenamientos
//
// En Windows (PowerShell):
//   $env:SUPABASE_URL="https://xxxx.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="..."
//   node scripts/migrar-datos.mjs ..\Registro_Entrenamientos
//
// La clave service_role salta todas las reglas de seguridad: úsala solo en
// tu ordenador, no la pegues en la app ni la subas a GitHub.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep, extname } from "node:path";

const ORIGEN = process.argv[2];
const URL_SB = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!ORIGEN || !URL_SB || !CLAVE) {
  console.error("Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrar-datos.mjs <carpeta del repo de datos>");
  process.exit(1);
}

const TEXTO = /\.(json|txt|md|csv)$/i;
const IGNORAR = [/^\.git(\/|$)/, /^\.github(\/|$)/, /^README\.md$/i];
const MIME = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const cabeceras = { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` };

async function* recorrer(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* recorrer(p);
    else if (e.isFile()) yield p;
  }
}

function equipoDe(texto) {
  try { const j = JSON.parse(texto); return j && typeof j.equipo === "string" ? j.equipo : null; } catch { return null; }
}

async function subirTextos(filas) {
  for (let i = 0; i < filas.length; i += 50) {
    const lote = filas.slice(i, i + 50);
    const r = await fetch(`${URL_SB}/rest/v1/archivos?on_conflict=ruta`, {
      method: "POST",
      headers: { ...cabeceras, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(lote),
    });
    if (!r.ok) throw new Error(`archivos (${lote[0].ruta}…): ${r.status} ${await r.text()}`);
    console.log(`  textos ${Math.min(i + 50, filas.length)}/${filas.length}`);
  }
}

async function subirBinario(ruta, ruta_local) {
  const datos = await readFile(ruta_local);
  const url = `${URL_SB}/storage/v1/object/privado/${ruta.split("/").map(encodeURIComponent).join("/")}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { ...cabeceras, "Content-Type": MIME[extname(ruta).toLowerCase()] || "application/octet-stream", "x-upsert": "true" },
    body: datos,
  });
  if (!r.ok) throw new Error(`storage ${ruta}: ${r.status} ${await r.text()}`);
}

const textos = [];
const binarios = [];
for await (const p of recorrer(ORIGEN)) {
  const ruta = relative(ORIGEN, p).split(sep).join("/");
  if (IGNORAR.some(re => re.test(ruta))) continue;
  if (TEXTO.test(ruta)) {
    const contenido = await readFile(p, "utf8");
    textos.push({ ruta, contenido, equipo: equipoDe(contenido) });
  } else {
    binarios.push([ruta, p]);
  }
}

console.log(`Encontrados ${textos.length} archivos de texto y ${binarios.length} binarios.`);
await subirTextos(textos);
let hechos = 0, bytes = 0;
for (const [ruta, p] of binarios) {
  await subirBinario(ruta, p);
  bytes += (await stat(p)).size;
  if (++hechos % 10 === 0 || hechos === binarios.length) console.log(`  binarios ${hechos}/${binarios.length} (${(bytes / 1e6).toFixed(1)} MB)`);
}
console.log("Migración terminada.");
