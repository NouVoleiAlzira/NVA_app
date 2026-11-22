-- =====================================================================
-- Quitar un usuario por completo (Opciones › Usuarios y permisos)
--
-- borrar_usuario(id) la llama la app cuando el propietario pulsa
-- «Quitar usuario». Borra la cuenta de Supabase Auth (correo, contraseña,
-- sesiones, huella/identidades) y, en cascada, su perfil (nombre, rol,
-- activo). Sus equipos y su sitio como entrenador o delegado en
-- Opciones › Entrenadores y equipos los quita la app justo después.
--
-- Lo que NO se borra (el historial del club no depende de que el usuario
-- siga existiendo):
--   · registros, partidos, informes, PDFs... que creó o editó: se quedan;
--     el campo «actualizado por» pasa a vacío.
--   · el Historial de cambios y los «registrado por» guardan el nombre en
--     texto, así que siguen mostrando quién lo hizo.
--
-- Reglas: solo un propietario activo puede llamarla, nadie puede borrarse
-- a sí mismo y no se puede borrar a un propietario (ni al email del
-- propietario guardado en ajustes).
-- Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function public.borrar_usuario(p_id uuid)
returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_obj public.perfiles;
  v_email text;
begin
  if not exists (select 1 from public.perfiles
                  where id = auth.uid() and activo and rol = 'propietario') then
    raise exception 'Solo el propietario puede quitar usuarios.';
  end if;
  if p_id is null or p_id = auth.uid() then
    raise exception 'No puedes quitarte a ti mismo.';
  end if;

  select * into v_obj from public.perfiles where id = p_id;
  select email into v_email from auth.users where id = p_id;
  if v_obj.id is null and v_email is null then
    raise exception 'Ese usuario ya no existe.';
  end if;
  if v_obj.rol = 'propietario'
     or lower(coalesce(v_obj.email, v_email)) =
        lower(coalesce((select valor from public.ajustes where clave = 'email_propietario'), '')) then
    raise exception 'No se puede quitar al propietario.';
  end if;

  -- Archivos de Storage que subió: se quedan, sin dueño (en proyectos
  -- antiguos ese dueño impedía borrar la cuenta).
  begin
    update storage.objects set owner = null where owner = p_id;
  exception when others then null;
  end;
  begin
    execute 'update storage.objects set owner_id = null where owner_id = $1' using p_id::text;
  exception when others then null;
  end;

  delete from public.perfiles where id = p_id;
  delete from auth.users where id = p_id;   -- identidades, sesiones y tokens van en cascada
  return coalesce(v_obj.email, v_email);
end $$;

revoke all on function public.borrar_usuario(uuid) from public, anon;
grant execute on function public.borrar_usuario(uuid) to authenticated;
