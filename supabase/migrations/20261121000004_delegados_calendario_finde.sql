-- =====================================================================
-- Página de delegados › Calendario de entrenamientos con sábado y domingo
--
-- El calendario de la página de delegados también muestra los partidos del
-- fin de semana, que salen de CalendarioPartidos.json. Quien tenga «Ver» en
-- «Calendario de entrenamientos» ahora también puede leer ese archivo
-- (antes solo con «Partidos» o «Clasificación»).
-- Se puede ejecutar más de una vez.
-- =====================================================================

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
                and (public.acceso_menu('delegados.calendario') in ('lectura', 'escritura')
                     or public.acceso_menu('delegados.partidos') in ('lectura', 'escritura')
                     or public.acceso_menu('delegados.clasificacion') in ('lectura', 'escritura'))
             then true
           when left(p_ruta, 12) = 'Calendarios/'
                and public.acceso_menu('delegados.clasificacion') in ('lectura', 'escritura')
             then true
           else public.acceso_menu(split_part(public.menu_de_ruta(p_ruta), '.', 1)) in ('lectura', 'escritura')
         end
$$;
