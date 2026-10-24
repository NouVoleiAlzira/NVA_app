-- =====================================================================
-- Alta de perfiles: solo las cuentas invitadas reciben rol y equipos.
--
-- Antes, crear_perfil() tomaba el rol de raw_user_meta_data, que cualquiera
-- puede rellenar al registrarse (supabase.auth.signUp({ options: { data:
-- { rol: 'administrador' } } })). Si el registro abierto llegaba a estar
-- activado, un desconocido podía darse de alta como administrador.
--
-- Ahora:
--   * El email del propietario sigue naciendo 'propietario'.
--   * Una cuenta invitada (auth.users.invited_at no nulo, solo lo pone
--     inviteUserByEmail con la clave service_role) recibe el rol y los
--     equipos de la invitación.
--   * Cualquier otra cuenta nace 'lectura', sin equipos y DESACTIVADA, así
--     que no ve nada hasta que el propietario la active en el panel.
-- =====================================================================

create or replace function public.crear_perfil()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rol     text := 'lectura';
  v_equipos text[] := '{}';
  v_activo  boolean := false;
begin
  if lower(new.email) = lower((select valor from public.ajustes where clave = 'email_propietario')) then
    v_rol := 'propietario';
    v_activo := true;
  elsif new.invited_at is not null then
    v_rol := coalesce(new.raw_user_meta_data->>'rol', 'lectura');
    if v_rol = 'propietario' or not exists (select 1 from public.roles where id = v_rol) then
      v_rol := 'lectura';
    end if;
    v_equipos := coalesce(array(select jsonb_array_elements_text(new.raw_user_meta_data->'equipos')), '{}');
    v_activo := true;
  end if;
  insert into public.perfiles (id, email, nombre, rol, equipos, activo)
  values (new.id, new.email, new.raw_user_meta_data->>'nombre', v_rol, v_equipos, v_activo);
  return new;
end $$;
