-- =====================================================================
-- Se quita el menú «Carteles»
--
-- Los carteles de Partidos y Resultados (Partidos.html y Resultados.html)
-- ya no forman parte de la app. Al borrar el menú se borran también sus
-- permisos por rol y por usuario (on delete cascade). No tenía rutas de
-- datos propias.
-- =====================================================================

delete from public.menus where id = 'carteles';
