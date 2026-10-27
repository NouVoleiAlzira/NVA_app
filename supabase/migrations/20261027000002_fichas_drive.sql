-- =====================================================================
-- Adiós a la página «Otros»
--
-- · Su información e instrucciones se abren ahora en una ventana con el
--   botón «Otras INFOs» del Tablón de Consultas. El menú 'otros' sigue
--   igual (mismos permisos y mismo OTROS.json); solo cambia de nombre.
-- · «Fichas de Federación» pasa a ser una subsección de «Entrenamientos y
--   Partidos», debajo de «Informes PDF». Las fichas se guardan en el Drive
--   del club (función fichas-drive) y su índice en Fichas/drive.json, que
--   pasa a depender de «Entrenamientos y Partidos»: las ve quien ve esa
--   sección y las cambia quien puede editarla (un entrenador, solo las de
--   sus equipos).
-- =====================================================================

update public.menus set nombre = 'Otras INFOs' where id = 'otros';

update public.menus set orden = 24 where id = 'informes.drive';
update public.menus set orden = 25 where id = 'informes.kilometraje';
insert into public.menus (id, nombre, orden, padre) values
  ('informes.fichas', 'Fichas de Federación', 23, 'informes')
on conflict (id) do nothing;

-- Visible para los roles que ya ven «Entrenamientos y Partidos»
insert into public.permisos_rol (rol, menu, acceso)
select pr.rol, 'informes.fichas',
  case when pr.acceso = 'ninguno' then 'ninguno' else 'lectura' end::public.nivel_acceso
from public.permisos_rol pr
where pr.menu = 'informes'
on conflict (rol, menu) do nothing;

update public.rutas_menu set menu = 'informes' where prefijo = 'Fichas/';
