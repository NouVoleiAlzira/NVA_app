-- =====================================================================
-- Usuarios ↔ entrenadores
--
-- * Los equipos de cada usuario ya no se eligen en Usuarios y permisos:
--   son los del entrenador que se llama igual que el usuario en
--   Opciones › Entrenadores (configuracion.json → coaches[].teams).
--   La columna perfiles.equipos deja de usarse.
-- * Dos usuarios no pueden tener el mismo nombre (sin contar mayúsculas
--   ni espacios de más).
-- =====================================================================

create or replace function public.nombre_normalizado(p text)
returns text
language sql immutable as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '')
$$;

-- Si ya hay dos usuarios con el mismo nombre, esta línea falla: cambia uno
-- de ellos en Opciones › Usuarios y permisos y vuelve a ejecutarla.
create unique index if not exists perfiles_nombre_unico
  on public.perfiles (public.nombre_normalizado(nombre))
  where public.nombre_normalizado(nombre) is not null;

-- Equipos del usuario conectado según Opciones › Entrenadores
create or replace function public.mis_equipos()
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_nombre text;
  v_conf   jsonb;
begin
  select public.nombre_normalizado(nombre) into v_nombre
    from public.perfiles where id = auth.uid() and activo;
  if v_nombre is null then return '{}'; end if;
  begin
    select contenido::jsonb into v_conf from public.archivos where ruta = 'configuracion.json';
  exception when others then
    return '{}';
  end;
  return coalesce(array(
    select distinct t
      from jsonb_array_elements(coalesce(v_conf->'coaches', '[]'::jsonb)) c,
           jsonb_array_elements_text(coalesce(c->'teams', '[]'::jsonb)) t
     where public.nombre_normalizado(c->>'name') = v_nombre
  ), '{}');
end
$$;

create or replace function public.puede_escribir(p_ruta text, p_equipo text default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.acceso_menu(public.menu_de_ruta(p_ruta)) = 'escritura'
     and (
       p_equipo is null
       or not exists (select 1 from public.perfiles p join public.roles r on r.id = p.rol
                       where p.id = auth.uid() and r.restringir_equipos)
       or p_equipo = any (public.mis_equipos())
     )
$$;
