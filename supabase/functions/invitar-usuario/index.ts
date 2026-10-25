// Invita a un usuario nuevo por email con un rol y unos equipos.
// Solo lo puede usar un usuario cuyo rol gestione usuarios (el propietario).
// El registro abierto está desactivado: esta es la única forma de crear cuentas
// además de la del propietario.
//
// Llamada desde la app:
//   supabase.functions.invoke("invitar-usuario", {
//     body: { email, nombre, rol: "administrador", equipos: ["Enova NVA (Cadete)"] }
//   })
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Cliente con la sesión de quien llama, para comprobar sus permisos.
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: esGestor, error: errGestor } = await comoUsuario.rpc("es_gestor");
  if (errGestor || !esGestor) return respuesta(403, { error: "Solo el propietario puede invitar usuarios" });

  const { email, nombre, rol = "lectura", equipos = [], redirectTo } = await req.json();
  if (!email) return respuesta(400, { error: "Falta el email" });
  if (rol === "propietario") return respuesta(400, { error: "El rol de propietario se asigna desde el panel de usuarios" });

  const admin = createClient(url, service);
  const datos = { nombre, rol, equipos };
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: datos, redirectTo });
  if (!error) return respuesta(200, { id: data.user?.id, email, enviado: true });
  console.error("inviteUserByEmail:", error.status, error.code, error.message);

  if (yaRegistrado(error)) return respuesta(400, { error: "Ya hay una cuenta con ese email" });

  // Si el email no sale (SMTP sin configurar, límite de envíos, dirección no
  // autorizada...), se crea la invitación igualmente y se devuelve el enlace
  // para que el propietario lo mande por WhatsApp o como quiera.
  const { data: enlace, error: errEnlace } = await admin.auth.admin.generateLink({
    type: "invite", email, options: { data: datos, redirectTo },
  });
  if (errEnlace) {
    console.error("generateLink:", errEnlace.status, errEnlace.code, errEnlace.message);
    if (yaRegistrado(errEnlace)) return respuesta(400, { error: "Ya hay una cuenta con ese email" });
    return respuesta(400, { error: `${error.message} (${errEnlace.message})` });
  }
  return respuesta(200, {
    id: enlace.user?.id, email, enviado: false,
    enlace: enlace.properties?.action_link, motivo: error.message,
  });
});

function yaRegistrado(e: { code?: string; message?: string }) {
  return e.code === "email_exists" || /already been registered/i.test(e.message ?? "");
}
