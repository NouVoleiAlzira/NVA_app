// Conexión con Supabase (Project Settings › API).
// La «anon key» es pública: la seguridad la ponen el login y las reglas RLS
// de la base de datos. NUNCA pongas aquí la clave «service_role».
window.NVA_SUPABASE = {
  url: "",      // p. ej. "https://abcdefghijkl.supabase.co"
  anonKey: ""   // p. ej. "eyJhbGciOi..."
};
