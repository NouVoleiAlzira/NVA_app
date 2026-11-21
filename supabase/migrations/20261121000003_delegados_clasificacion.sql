-- =====================================================================
-- Página de delegados › «Clasificación»
--
-- · Subsección nueva en Permisos por rol › Página de delegados.
-- · Muestra la clasificación de la liga de cada equipo del delegado. Sale
--   del PDF de la federación de cada equipo (Calendarios/<equipo>.pdf, en
--   Storage). Con «Ver» en esta subsección se pueden leer esos PDF y la
--   configuración del club aunque el rol no tenga acceso a Calendario de
--   partidos.
-- · Permisos de partida: Propietario y Administrador «Editar», Delegado
--   «Ver», el resto nada.
-- Se puede ejecutar más de una vez.
-- =====================================================================

insert into public.menus (id, nombre, orden, padre) values
  ('delegados.clasificacion', 'Clasificación', 103, 'delegados')
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden, padre = excluded.padre;

insert into public.permisos_rol (rol, menu, acceso)
select r.id, 'delegados.clasificacion',
  case
    when r.id in ('propietario', 'administrador') then 'escritura'
    when r.id = 'delegado' then 'lectura'
    else 'ninguno'
  end::public.nivel_acceso
from public.roles r
on conflict (rol, menu) do nothing;

create or replace function public.puede_leer(p_ruta text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
           when p_ruta in ('Historial/avisos.json', 'Horarios.json') or p_ruta like 'Escudos/%'
             then exists (select 1 from public.perfiles where id = auth.uid() and activo)
           when p_ruta in ('configuracion.json', 'Historial/anulaciones.json')
                and (public.acceso_menu('delegados.calendario') in ('lectura', 'escritura')
                     or public.acceso_menu('delegados.partidos') in ('lectura', 'escritura')
                     or public.acceso_menu('delegados.clasificacion') in ('lectura', 'escritura'))
             then true
           when p_ruta = 'CalendarioPartidos.json'
                and (public.acceso_menu('delegados.partidos') in ('lectura', 'escritura')
                     or public.acceso_menu('delegados.clasificacion') in ('lectura', 'escritura'))
             then true
           when left(p_ruta, 12) = 'Calendarios/'
                and public.acceso_menu('delegados.clasificacion') in ('lectura', 'escritura')
             then true
           else public.acceso_menu(split_part(public.menu_de_ruta(p_ruta), '.', 1)) in ('lectura', 'escritura')
         end
$$;
