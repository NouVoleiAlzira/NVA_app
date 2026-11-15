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
//   · Hugging Face Inference (FLUX.1-schnell, crédito gratuito mensual pequeño)
//       HF_TOKEN (token «fine-grained» con «Make calls to Inference Providers»)
//       HF_MODELO opcional (por defecto black-forest-labs/FLUX.1-schnell)
//   · Stable Horde / AI Horde (gratis, voluntarios; puede tardar minutos)
//       HORDE_API_KEY opcional (sin ella se usa la anónima 0000000000, más lenta)
//       HORDE_MODELO opcional (por defecto «AlbedoBase XL (SDXL)»)
//   IMAGEN_PROVEEDOR = "cloudflare" | "gemini" | "huggingface" | "horde" fuerza uno
//   cuando la app no elige. La app puede pedir uno concreto con «proveedor».
//
// Acciones (campo «accion» del cuerpo):
//   (ninguna)         genera y devuelve { imagen, mime, proveedor }
//   "proveedores"     devuelve { proveedores: [...], defecto } los que están listos
//   "horde_estado"    con «id»: Horde es asíncrono; la primera llamada devuelve
//                     { pendiente: true, id } y la app pregunta cada pocos segundos
//                     hasta recibir la imagen (así no se pasa el límite de tiempo).
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

// Hugging Face: el router de Inference Providers devuelve la imagen en bruto
// Tamaños múltiplos de 64 y como mucho ~1 megapíxel (Horde no deja más sin kudos)
const TAMANOS_SD: Record<string, [number, number]> = {
  "9:16": [576, 1024],
  "4:5": [832, 1024],
  "1:1": [1024, 1024],
  "3:4": [768, 1024],
  "16:9": [1024, 576],
};

async function conHuggingFace(prompt: string, aspecto: string) {
  const modelo = Deno.env.get("HF_MODELO") ?? "black-forest-labs/FLUX.1-schnell";
  const [w, h] = TAMANOS_SD[aspecto] ?? TAMANOS_SD["4:5"];
  const r = await fetch(`https://router.huggingface.co/hf-inference/models/${modelo}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("HF_TOKEN") ?? ""}`,
      "Content-Type": "application/json",
      Accept: "image/png",
      "x-wait-for-model": "true",
    },
    body: JSON.stringify({ inputs: prompt, parameters: { width: w, height: h, num_inference_steps: 4 } }),
  });
  const tipo = r.headers.get("content-type") || "";
  if (r.status === 402) throw new Error("Hugging Face: se ha gastado el crédito gratuito de este mes");
  if (!r.ok) throw new Error(`Hugging Face respondió ${r.status}: ${(await r.text()).slice(0, 400)}`);
  if (tipo.startsWith("image/")) return { imagen: aBase64(await r.arrayBuffer()), mime: tipo };
  const j = await r.json().catch(() => null);
  throw new Error(`Hugging Face no devolvió ninguna imagen${j?.error ? ": " + j.error : ""}`);
}

// Stable Horde (AI Horde): se encarga, y se pregunta luego por el resultado
const HORDE = "https://aihorde.net/api/v2";
const hordeCabeceras = () => ({
  apikey: Deno.env.get("HORDE_API_KEY") || "0000000000",
  "Client-Agent": "NVA_app:1.0:github.com/NouVoleiAlzira",
  "Content-Type": "application/json",
});

async function hordeEncargar(prompt: string, aspecto: string) {
  const [w, h] = TAMANOS_SD[aspecto] ?? TAMANOS_SD["4:5"];
  const modelo = Deno.env.get("HORDE_MODELO") ?? "AlbedoBase XL (SDXL)";
  const negativo = "text, letters, words, watermark, logo, signature, blurry, deformed hands, extra fingers";
  const r = await fetch(`${HORDE}/generate/async`, {
    method: "POST",
    headers: hordeCabeceras(),
    body: JSON.stringify({
      prompt: `${prompt.slice(0, 1800)} ### ${negativo}`,
      params: { width: w, height: h, steps: 25, cfg_scale: 6, sampler_name: "k_euler_a", n: 1, karras: true },
      models: [modelo],
      nsfw: false,
      censor_nsfw: true,
      r2: true,
      shared: false,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(`Stable Horde no aceptó el encargo (${r.status}): ${j.message ?? ""}`);
  return j.id as string;
}

async function hordeEstado(id: string) {
  const c = await fetch(`${HORDE}/generate/check/${encodeURIComponent(id)}`, { headers: hordeCabeceras() });
  const e = await c.json().catch(() => ({}));
  if (!c.ok) throw new Error(`Stable Horde: ${e.message ?? c.status}`);
  if (e.faulted) throw new Error("Stable Horde: el encargo ha fallado; prueba otra vez");
  if (!e.is_possible) throw new Error("Stable Horde: ahora no hay nadie que pueda pintar este modelo; prueba más tarde u otro servicio");
  if (!e.done) {
    return { pendiente: true, id, cola: e.queue_position ?? null, espera: e.wait_time ?? null };
  }
  const s = await fetch(`${HORDE}/generate/status/${encodeURIComponent(id)}`, { headers: hordeCabeceras() });
  const st = await s.json().catch(() => ({}));
  const g = st?.generations?.[0];
  if (!g?.img) throw new Error("Stable Horde no devolvió ninguna imagen");
  if (g.censored) throw new Error("Stable Horde ha censurado la imagen; cambia el encargo");
  if (/^https?:/.test(g.img)) {
    const im = await fetch(g.img);
    if (!im.ok) throw new Error("No se pudo descargar la imagen de Stable Horde");
    return { imagen: aBase64(await im.arrayBuffer()), mime: im.headers.get("content-type") || "image/webp" };
  }
  return { imagen: g.img, mime: "image/webp" };
}

function proveedoresListos() {
  const lista: string[] = [];
  if (Deno.env.get("CF_ACCOUNT_ID") && Deno.env.get("CF_API_TOKEN")) lista.push("cloudflare");
  if (Deno.env.get("GEMINI_API_KEY")) lista.push("gemini");
  if (Deno.env.get("HF_TOKEN")) lista.push("huggingface");
  lista.push("horde"); // siempre disponible: sin clave usa la anónima
  return lista;
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
  const listos = proveedoresListos();
  const forzado = Deno.env.get("IMAGEN_PROVEEDOR") ?? "";
  const defecto = listos.includes(forzado) ? forzado : listos[0];
  if (cuerpo.accion === "proveedores") return respuesta(200, { proveedores: listos, defecto });
  if (cuerpo.accion === "horde_estado") {
    try {
      return respuesta(200, { ...(await hordeEstado(String(cuerpo.id || ""))), proveedor: "horde" });
    } catch (e) {
      return respuesta(502, { error: (e as Error).message });
    }
  }

  const prompt = String(cuerpo.prompt || "").slice(0, 4000);
  const aspecto = TAMANOS[cuerpo.aspecto] ? cuerpo.aspecto : "4:5";
  if (!prompt) return respuesta(400, { error: "Falta el encargo (prompt)" });

  const pedido = String(cuerpo.proveedor || "");
  if (pedido && !listos.includes(pedido)) {
    return respuesta(503, { error: `El servicio «${pedido}» no está configurado (faltan sus secretos en Supabase)` });
  }
  const proveedor = pedido || defecto;
  // Solo Cloudflare y Gemini saben usar fotos de referencia
  const usaRefs = proveedor === "cloudflare" || proveedor === "gemini";

  let texto = prompt;
  let refs: Referencia[] = [];
  // La app manda las fotos de la camiseta elegida (las de serie o las subidas desde la app);
  // si no llegan, se leen las de serie de Equipacion/.
  const enviadas = Array.isArray(cuerpo.referencias) ? cuerpo.referencias.slice(0, 3) : [];
  if (enviadas.length || cuerpo.equipacion) {
    const eq = enviadas.length
      ? {
        refs: enviadas
          .filter((x: { datos?: string }) => typeof x?.datos === "string" && x.datos.length < 1_500_000)
          .map((x: { mime?: string; datos: string }) => ({
            mime: /^image\/(png|jpeg|webp)$/.test(x.mime ?? "") ? x.mime! : "image/jpeg",
            datos: Uint8Array.from(atob(x.datos), (ch) => ch.charCodeAt(0)).buffer,
          })),
        descripcion: String(cuerpo.descripcionEq ?? "").slice(0, 500),
      }
      : await referenciasEquipacion(String(cuerpo.equipacion));
    refs = usaRefs ? eq.refs : [];
    if (refs.length) {
      texto += `\n\nThe player must wear EXACTLY the volleyball kit shown in the reference image${refs.length > 1 ? "s" : ""} (same colours, cut, pattern and details), but with the shirt number ${cuerpo.dorsal ?? ""} and no player name. Do not copy the background of the reference.${eq.descripcion ? ` Kit description: ${eq.descripcion}.` : ""}`;
    } else if (eq.descripcion) {
      texto += `\n\nKit: ${eq.descripcion}${cuerpo.dorsal ? `, shirt number ${cuerpo.dorsal}` : ""}.`;
    }
  }

  try {
    if (proveedor === "horde") {
      const id = await hordeEncargar(texto, aspecto);
      return respuesta(200, { pendiente: true, id, proveedor });
    }
    const r = proveedor === "gemini"
      ? await conGemini(texto, aspecto, refs)
      : proveedor === "huggingface"
      ? await conHuggingFace(texto, aspecto)
      : await conCloudflare(texto, aspecto, refs);
    return respuesta(200, { ...r, proveedor, referencias: refs.length });
  } catch (e) {
    return respuesta(502, { error: (e as Error).message });
  }
});
