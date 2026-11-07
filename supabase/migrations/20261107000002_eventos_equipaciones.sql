-- =====================================================================
-- Eventos: equipaciones guardadas desde la app
--
-- La lista de equipaciones (Eventos/equipaciones.json) y las fotos que se
-- suben desde el asistente (Eventos/equipacion/…) dependen de la
-- subsección «Eventos». Para añadir o cambiar camisetas hace falta
-- «Editar» en Eventos.
-- =====================================================================
insert into public.rutas_menu (prefijo, menu) values
  ('Eventos/', 'instagram.eventos')
on conflict (prefijo) do update set menu = excluded.menu;
