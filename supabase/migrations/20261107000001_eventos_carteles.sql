-- =====================================================================
-- Redes Sociales › Eventos: carteles de eventos con IA
--
-- Nueva subsección «Eventos» dentro de Redes Sociales. Empieza con el
-- mismo nivel que cada rol tiene en Redes Sociales; se cambia en
-- Opciones › Permisos por rol. Para generar imágenes hace falta «Editar»
-- (lo comprueba la función generar-cartel).
-- =====================================================================
insert into public.menus (id, nombre, orden, padre) values
  ('instagram.eventos', 'Eventos', 83, 'instagram')
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden, padre = excluded.padre;

insert into public.permisos_rol (rol, menu, acceso)
select pr.rol, 'instagram.eventos', pr.acceso
from public.permisos_rol pr
where pr.menu = 'instagram'
on conflict (rol, menu) do nothing;
