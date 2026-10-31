-- =====================================================================
-- «Autorizaciones de Federación»: nueva subsección de «Entrenamientos y
-- Partidos», justo debajo de «Fichas de Federación». Funciona igual que
-- las fichas: un PDF por equipo en una carpeta PRIVADA del Drive del club
-- («NVA · Autorizaciones de Federación», función fichas-drive con
-- tipo "autorizaciones") y su índice en Autorizaciones/drive.json.
-- Lo cambia quien puede editar la subsección (un entrenador, solo las de
-- sus equipos). Cada rol empieza con el mismo nivel que tiene en
-- «Fichas de Federación».
-- =====================================================================

insert into public.menus (id, nombre, orden, padre) values
  ('informes.autorizaciones', 'Autorizaciones de Federación', 25, 'informes')
on conflict (id) do nothing;
update public.menus set orden = 26 where id = 'informes.drive';

insert into public.permisos_rol (rol, menu, acceso)
select pr.rol, 'informes.autorizaciones', pr.acceso
from public.permisos_rol pr
where pr.menu = 'informes.fichas'
on conflict (rol, menu) do nothing;

insert into public.rutas_menu (prefijo, menu) values
  ('Autorizaciones/', 'informes.autorizaciones')
on conflict (prefijo) do update set menu = excluded.menu;
