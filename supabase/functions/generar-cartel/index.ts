// Genera la imagen central de un cartel del apartado EVENTOS (Redes Sociales).
//
// La app hace la entrevista y monta el encargo (prompt en inglés). Esta
// función solo comprueba el permiso, añade las fotos de la equipación como
// referencia y llama al servicio de imágenes. El logo del club, los
// patrocinadores y los textos los dibuja la app encima (canvas), así que
// aquí nunca se piden letras ni logos.
//
// Servicio (el primero que tenga sus secretos):
//   · Cloudflare Workers AI (FLUX.2, cupo diario gratuito)
//       CF_ACCOUNT_ID, CF_API_TOKEN   (token con permiso «Workers AI: Read»)
//       CF_MODELO opcional (por defecto @cf/black-forest-labs/flux-2-dev)
//   · Google Gemini (de pago, el que mejor copia la equipación)
//       GEMINI_API_KEY, GEMINI_MODELO opcional (gemini-2.5-flash-image)
//   IMAGEN_PROVEEDOR = "cloudflare" | "gemini" fuerza uno de los dos.
//   APP_URL opcional: de dónde leer Equipacion/ (por defecto la app publicada).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tamaño que se pide a Cloudflare para cada proporción (múltiplos de 16)
const TAMANOS: Record<string, [number, number]> = {
  "9:16": [768, 1360],
  "4:5": [1024, 1280],
  "1:1": [1024, 1024],
  "3:4": [960, 1280],
  "16:9": [1360, 768],
};

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function aBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

type Referencia = { mime: string; datos: ArrayBuffer };

// Solo se leen las imágenes que aparecen en Equipacion/equipacion.json de la app
async function referenciasEquipacion(id: string): Promise<{ refs: Referencia[]; descripcion: string }> {
  const base = (Deno.env.get("APP_URL") ?? "https://nouvoleialzira.github.io/NVA_app").replace(/\/$/, "");
  try {
    const man = await (await fetch(`${base}/Equipacion/equipacion.json`, { cache: "no-store" })).json();
    const eq = (man.equipaciones || []).find((e: { id: string }) => e.id === id) || (man.equipaciones || [])[0];
    if (!eq) return { refs: [], descripcion: "" };
    const refs: Referencia[] = [];
    for (const archivo of (eq.imagenes || []).slice(0, 3)) {
      const r = await fetch(`${base}/Equipacion/${encodeURIComponent(archivo)}`);
      if (r.ok) refs.push({ mime: r.headers.get("content-type") || "image/png", datos: await r.arrayBuffer() });
    }
    return { refs, descripcion: eq.descripcion || "" };
  } catch (_e) {
    return { refs: [], descripcion: "" };
  }
}

async function conCloudflare(prompt: string, aspecto: string, refs: Referencia[]) {
  const cuenta = Deno.env.get("CF_ACCOUNT_ID"), token = Deno.env.get("CF_API_TOKEN");
  const modelo = Deno.env.get("CF_MODELO") ?? "@cf/black-forest-labs/flux-2-dev";
  const [w, h] = TAMANOS[aspecto] ?? TAMANOS["4:5"];
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(w));
  form.append("height", String(h));
  refs.forEach((r, i) => form.append(`input_image_${i}`, new Blob([r.datos], { type: r.mime }), `ref${i}.png`));
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cuenta}/ai/run/${modelo}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const tipo = r.headers.get("content-type") || "";
  if (!r.ok) throw new Error(`Cloudflare respondió ${r.status}: ${(await r.text()).slice(0, 400)}`);
  if (tipo.startsWith("image/")) return { imagen: aBase64(await r.arrayBuffer()), mime: tipo };
  const j = await r.json();
  const img = j?.result?.image ?? j?.image;
  if (!img) throw new Error("Cloudflare no devolvió ninguna imagen");
  return { imagen: img, mime: "image/jpeg" };
}

async function conGemini(prompt: string, aspecto: string, refs: Referencia[]) {
  const modelo = Deno.env.get("GEMINI_MODELO") ?? "gemini-2.5-flash-image";
  const parts: unknown[] = [{ text: prompt }];
  refs.forEach(r => parts.push({ inline_data: { mime_type: r.mime, data: aBase64(r.datos) } }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": Deno.env.get("GEMINI_API_KEY") ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspecto } },
    }),
  });
  if (!r.ok) throw new Error(`Gemini respondió ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const j = await r.json();
  const partes = j?.candidates?.[0]?.content?.parts ?? [];
  const p = partes.find((x: { inlineData?: unknown; inline_data?: unknown }) => x.inlineData || x.inline_data);
  const d = p?.inlineData ?? p?.inline_data;
  if (!d?.data) throw new Error("Gemini no devolvió ninguna imagen (puede que la haya bloqueado su filtro)");
  return { imagen: d.data, mime: d.mimeType ?? d.mime_type ?? "image/png" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const comoUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: usuario } = await comoUsuario.auth.getUser();
  const { data: nivel } = await comoUsuario.rpc("acceso_menu", { p_menu: "instagram.eventos" });
  if (!usuario?.user || nivel !== "escritura") return respuesta(403, { error: "Sin permiso para crear carteles de eventos" });

  const cuerpo = await req.json().catch(() => ({}));
  const prompt = String(cuerpo.prompt || "").slice(0, 4000);
  const aspecto = TAMANOS[cuerpo.aspecto] ? cuerpo.aspecto : "4:5";
  if (!prompt) return respuesta(400, { error: "Falta el encargo (prompt)" });

  const forzado = Deno.env.get("IMAGEN_PROVEEDOR");
  const hayCf = !!(Deno.env.get("CF_ACCOUNT_ID") && Deno.env.get("CF_API_TOKEN"));
  const hayGemini = !!Deno.env.get("GEMINI_API_KEY");
  const proveedor = forzado || (hayCf ? "cloudflare" : hayGemini ? "gemini" : "");
  if (!proveedor) return respuesta(503, { error: "Falta configurar el servicio de imágenes (secretos de Cloudflare o Gemini en Supabase)" });

  let texto = prompt;
  let refs: Referencia[] = [];
  if (cuerpo.equipacion) {
    const eq = await referenciasEquipacion(String(cuerpo.equipacion));
    refs = eq.refs;
    if (refs.length) {
      texto += `\n\nThe player must wear EXACTLY the volleyball kit shown in the reference image${refs.length > 1 ? "s" : ""} (same colours, cut, pattern and details), but with the shirt number ${cuerpo.dorsal ?? ""} and no player name. Do not copy the background of the reference.${eq.descripcion ? ` Kit description: ${eq.descripcion}.` : ""}`;
    } else if (eq.descripcion) {
      texto += `\n\nKit: ${eq.descripcion}${cuerpo.dorsal ? `, shirt number ${cuerpo.dorsal}` : ""}.`;
    }
  }

  try {
    const r = proveedor === "gemini" ? await conGemini(texto, aspecto, refs) : await conCloudflare(texto, aspecto, refs);
    return respuesta(200, { ...r, proveedor, referencias: refs.length });
  } catch (e) {
    return respuesta(502, { error: (e as Error).message });
  }
});
