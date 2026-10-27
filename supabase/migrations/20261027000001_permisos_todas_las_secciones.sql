-- =====================================================================
-- Permisos por rol: todas las secciones y subsecciones con su nombre real
--
-- · Las secciones y subsecciones se llaman como en la pantalla.
-- · «Entrenamientos y Partidos» gana la subsección «Entrenadores/Equipos»
--   (los botones de cada entrenador), visible para quien ya ve la sección.
-- · «PDFs Resultados en Drive» pasa de «Dirección NVA» a «Entrenamientos y
--   Partidos», debajo de «Informes PDF». Cada rol la sigue viendo o no como
--   hasta ahora, y sus datos (DrivePDFs/) pasan a depender de la nueva
--   sección: «Actualizar vínculos» y «Programar» los cambia quien pueda
--   editar «Entrenamientos y Partidos».
-- · «Control de registros» ya no se abre tocando el logo: solo se ve si el
--   rol la tiene marcada (subsección direccion.registros, que ya existía).
-- =====================================================================

-- Nombres reales de las secciones
update public.menus set nombre = 'Calendario semanal'                  where id = 'inicio';
update public.menus set nombre = 'Entrenamientos y Partidos'           where id = 'informes';
update public.menus set nombre = 'Tablón de Consultas'                 where id = 'tablon';
update public.menus set nombre = 'Otros · Información e Instrucciones' where id = 'otros';
update public.menus set nombre = 'Calendario de partidos'              where id = 'calendario';
update public.menus set nombre = 'Dirección NVA'                       where id = 'direccion';
update public.menus set nombre = 'Redes Sociales'                      where id = 'instagram';
update public.menus set nombre = 'Configuración del Club (⚙️)'          where id = 'opciones';

-- Entrenamientos y Partidos: subsecciones en el orden de la pantalla
insert into public.menus (id, nombre, orden, padre) values
  ('informes.entrenadores', 'Entrenadores/Equipos',     21, 'informes'),
  ('informes.drive',        'PDFs Resultados en Drive', 23, 'informes')
on conflict (id) do nothing;
update public.menus set nombre = 'Informes PDF',              orden = 22 where id = 'informes.pdf';
update public.menus set nombre = 'Informes de Entrenadores',  orden = 24 where id = 'informes.kilometraje';

insert into public.permisos_rol (rol, menu, acceso)
select pr.rol, 'informes.entrenadores',
  case when pr.acceso = 'ninguno' then 'ninguno' else 'lectura' end::public.nivel_acceso
from public.permisos_rol pr
where pr.menu = 'informes'
on conflict (rol, menu) do nothing;

-- PDFs Resultados en Drive: misma visibilidad que tenía en Dirección NVA
insert into public.permisos_rol (rol, menu, acceso)
select pr.rol, 'informes.drive', pr.acceso
from public.permisos_rol pr
where pr.menu = 'direccion.drive'
on conflict (rol, menu) do nothing;

update public.rutas_menu set menu = 'informes' where prefijo = 'DrivePDFs/';

delete from public.menus where id = 'direccion.drive';   -- borra también sus permisos

-- Resto de subsecciones con el nombre que se ve en la app
update public.menus set nombre = 'Equipos · PDF Competición'    where id = 'calendario.equipos';
update public.menus set nombre = 'Gestión y Avisos Individuales' where id = 'direccion.avisos';
update public.menus set nombre = 'Pestaña Entrenadores y equipos' where id = 'opciones.entrenadores';
update public.menus set nombre = 'Pestaña Jugadores/as y Equipos' where id = 'opciones.equipos';
update public.menus set nombre = 'Pestaña Ligas'                 where id = 'opciones.ligas';
