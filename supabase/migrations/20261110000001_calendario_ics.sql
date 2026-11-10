-- =====================================================================
-- Tablón de Consultas › Calendario de encuentros (.ics)
--
-- Nueva subsección del Tablón: se eligen equipos y se descarga un
-- archivo de calendario con sus partidos (Google Calendar, Outlook...).
-- Solo lee datos del Calendario de partidos, no guarda nada.
-- Empieza con el mismo nivel que cada rol tiene en el Tablón; se cambia
-- en Opciones › Permisos por rol.
-- =====================================================================
insert into public.menus (id, nombre, orden, padre) values
  ('tablon.calendario', 'Calendario de encuentros', 31, 'tablon')
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden, padre = excluded.padre;

insert into public.permisos_rol (rol, menu, acceso)
select pr.rol, 'tablon.calendario', pr.acceso
from public.permisos_rol pr
where pr.menu = 'tablon'
on conflict (rol, menu) do nothing;
