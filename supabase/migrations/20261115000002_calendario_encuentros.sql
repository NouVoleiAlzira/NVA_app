-- =====================================================================
-- «Calendario de encuentros» (ahora «Calendario de encuentros para Outlook») pasa del Tablón de Consultas a la sección
-- Calendario de partidos, como subsección desplegable debajo de
-- «Actualización programada».
--
-- Nuevo id 'calendario.encuentros' (padre 'calendario'). Cada rol conserva
-- el nivel que tenía en 'tablon.calendario'; si no tenía fila, toma el de
-- «Calendario de partidos». Después se borra la entrada antigua del Tablón.
-- =====================================================================
insert into public.menus (id, nombre, orden, padre) values
  ('calendario.encuentros', 'Calendario de encuentros para Outlook', 57, 'calendario')
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden, padre = excluded.padre;

insert into public.permisos_rol (rol, menu, acceso)
select r.id, 'calendario.encuentros',
       coalesce(
         (select pr.acceso from public.permisos_rol pr where pr.rol = r.id and pr.menu = 'tablon.calendario'),
         (select pr.acceso from public.permisos_rol pr where pr.rol = r.id and pr.menu = 'calendario'),
         'ninguno')
from public.roles r
on conflict (rol, menu) do nothing;

-- Quita la subsección antigua (sus permisos se borran en cascada)
delete from public.menus where id = 'tablon.calendario';
