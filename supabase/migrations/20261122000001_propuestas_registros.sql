-- =====================================================================
-- Propuestas de registro entre entrenadores
--
-- Un entrenador solo guarda en la nube los entrenamientos y partidos de
-- sus equipos. Si registra o modifica uno de otro equipo, la app lo deja
-- en «Propuestas/» y el entrenador de ese equipo recibe un aviso para
-- aceptarlo (entonces se guarda en registros/ o Partidos/) o rechazarlo.
--
-- «Propuestas/» usa el mismo permiso que los registros (menú Inicio) y,
-- como no lleva «equipo», cualquier entrenador puede escribir en ella.
-- Se puede ejecutar varias veces.
-- =====================================================================

insert into public.rutas_menu (prefijo, menu) values
  ('Propuestas/', 'inicio')
on conflict (prefijo) do update set menu = excluded.menu;
