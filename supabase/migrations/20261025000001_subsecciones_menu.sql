-- =====================================================================
-- Subsecciones de los menús
--
-- Cada menú puede tener subsecciones (menus.padre). El nivel de acceso
-- (— / Ver / Editar) se sigue eligiendo por menú; en cada subsección el
-- propietario solo decide si se muestra ('lectura') o se oculta
-- ('ninguno'). Las subsecciones no cambian qué datos se pueden leer o
-- guardar: eso lo sigue decidiendo el menú padre (rutas_menu).
-- =====================================================================

alter table public.menus add column if not exists padre text references public.menus(id) on delete cascade;

insert into public.menus (id, nombre, orden, padre) values
  ('informes.pdf',          'Informes PDF',                        21, 'informes'),
  ('informes.kilometraje',  'Reporte de kilometraje',              22, 'informes'),
  ('calendario.linea',      'Línea temporal',                      51, 'calendario'),
  ('calendario.avisos',     'Avisos',                              52, 'calendario'),
  ('calendario.lista',      'Lista de partidos',                   53, 'calendario'),
  ('calendario.equipos',    'Equipos · PDF de competición',        54, 'calendario'),
  ('direccion.avisos',      'Gestión y avisos individuales',       61, 'direccion'),
  ('direccion.consultas',   'Consultas',                           62, 'direccion'),
  ('direccion.horarios',    'Horarios de entrenamiento',           63, 'direccion'),
  ('direccion.registros',   'Control de registros',                64, 'direccion'),
  ('instagram.reels',       'Reels',                               81, 'instagram'),
  ('instagram.stories',     'Stories',                             82, 'instagram'),
  ('opciones.entrenadores', 'Pestaña Entrenadores',                91, 'opciones'),
  ('opciones.equipos',      'Pestaña Jugadores/as y Equipos',      92, 'opciones'),
  ('opciones.ligas',        'Pestaña Ligas',                       93, 'opciones')
on conflict (id) do nothing;

-- Cada subsección empieza visible para los roles que ya ven su menú.
insert into public.permisos_rol (rol, menu, acceso)
select pr.rol, m.id,
  case when pr.acceso = 'ninguno' then 'ninguno' else 'lectura' end::public.nivel_acceso
from public.menus m
join public.permisos_rol pr on pr.menu = m.padre
where m.padre is not null
on conflict (rol, menu) do nothing;
