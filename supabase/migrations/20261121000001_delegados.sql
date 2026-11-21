-- =====================================================================
-- Página de delegados y rol «Delegado»
--
-- · Rol de partida «Delegado» (no se puede borrar desde Opciones).
-- · Sección nueva «Página de delegados» en Permisos por rol, con su primera
--   subsección «Calendario de entrenamientos» (solo para verlo).
-- · Para ver el calendario de entrenamientos hay que poder leer la
--   configuración del club (equipos y a qué equipos está asignado cada
--   delegado) y las anulaciones. Se pueden leer con «Ver» en esa
--   subsección, aunque el rol no tenga acceso a las secciones dueñas de
--   esos datos. Horarios.json ya lo puede leer cualquier usuario activo.
-- · Permisos de partida: Propietario y Administrador ven la página;
--   Delegado solo ve la página de delegados; el resto, nada.
-- Se puede ejecutar más de una vez.
-- =====================================================================

insert into public.roles (id, nombre, nivel, gestiona_usuarios, restringir_equipos) values
  ('delegado', 'Delegado', 40, false, true)
on conflict (id) do nothing;

insert into public.menus (id, nombre, orden, padre) values
  ('delegados',            'Página de delegados',            100, null),
  ('delegados.calendario', 'Calendario de entrenamientos',   101, 'delegados')
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden, padre = excluded.padre;

-- Delegado: nada en el resto de secciones
insert into public.permisos_rol (rol, menu, acceso)
select 'delegado', m.id, 'ninguno'::public.nivel_acceso
from public.menus m
where m.id not in ('delegados', 'delegados.calendario')
on conflict (rol, menu) do nothing;

-- Página de delegados para cada rol
insert into public.permisos_rol (rol, menu, acceso)
select r.id, m.id,
  case
    when r.id in ('propietario', 'administrador') then 'escritura'
    when r.id = 'delegado' then 'lectura'
    else 'ninguno'
  end::public.nivel_acceso
from public.roles r
cross join public.menus m
where m.id in ('delegados', 'delegados.calendario')
on conflict (rol, menu) do nothing;

-- Leer: además de lo de antes, quien ve el calendario de la página de
-- delegados puede leer la configuración del club y las anulaciones.
create or replace function public.puede_leer(p_ruta text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
           when p_ruta in ('Historial/avisos.json', 'Horarios.json') or p_ruta like 'Escudos/%'
             then exists (select 1 from public.perfiles where id = auth.uid() and activo)
           when p_ruta in ('configuracion.json', 'Historial/anulaciones.json')
                and public.acceso_menu('delegados.calendario') in ('lectura', 'escritura')
             then true
           else public.acceso_menu(split_part(public.menu_de_ruta(p_ruta), '.', 1)) in ('lectura', 'escritura')
         end
$$;
