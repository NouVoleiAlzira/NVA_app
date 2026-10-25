// Invita a un usuario nuevo por email con un rol y unos equipos.
// Solo lo puede usar un usuario cuyo rol gestione usuarios (el propietario).
// El registro abierto está desactivado: esta es la única forma de crear cuentas
// además de la del propietario.
//
// Llamada desde la app:
//   supabase.functions.invoke("invitar-usuario", {
//     body: { email, nombre, rol: "administrador", redirectTo }
//   })
// Los equipos no se eligen aquí: son los del entrenador con el mismo nombre
// en Opciones › Entrenadores y equipos.
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

  const { email, nombre, rol = "lectura", redirectTo } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return respuesta(400, { error: "Falta el email o no es válido" });
  if (rol === "propietario") return respuesta(400, { error: "El rol de propietario se asigna desde el panel de usuarios" });

  const admin = createClient(url, service);
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email.trim(), {
    data: { nombre, rol },
    redirectTo,
  });
  if (error) return respuesta(400, { error: error.message });
  return respuesta(200, { id: data.user?.id, email });
});
