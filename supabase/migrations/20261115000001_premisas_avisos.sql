-- =====================================================================
-- Calendario de partidos › Premisas de los avisos
--
-- Nueva subsección debajo de «Avisos»: las reglas con las que se generan
-- los avisos y se proponen horas a los partidos sin hora (franja del Palau,
-- pistas, días y franjas por categoría, entrenadores...). Se guardan en
-- CalendarioPremisas.json, comunes para todos.
-- Leer: quien vea el Calendario de partidos (los avisos se calculan con ellas).
-- Guardar: hace falta «Editar» en esta subsección.
-- Empieza con el mismo nivel que cada rol tiene en «Avisos»; se cambia
-- en Opciones › Permisos por rol.
-- =====================================================================
insert into public.menus (id, nombre, orden, padre) values
  ('calendario.premisas', 'Premisas de los avisos', 53, 'calendario')
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden, padre = excluded.padre;

-- Mismo orden que en pantalla
update public.menus set orden = 54 where id = 'calendario.lista';
update public.menus set orden = 55 where id = 'calendario.equipos';
update public.menus set orden = 56 where id = 'calendario.programada';

insert into public.permisos_rol (rol, menu, acceso)
select pr.rol, 'calendario.premisas', pr.acceso
from public.permisos_rol pr
where pr.menu = 'calendario.avisos'
on conflict (rol, menu) do nothing;

insert into public.rutas_menu (prefijo, menu) values
  ('CalendarioPremisas.json', 'calendario.premisas')
on conflict (prefijo) do update set menu = excluded.menu;
