-- =====================================================================
-- Dirección NVA › PDFs Resultados en Drive
--
-- Nueva subsección después de «Horarios de entrenamiento». Los enlaces de
-- Drive de cada equipo se guardan en DrivePDFs/enlaces.json, que depende
-- del menú «direccion» (quien puede editarlo puede pulsar «Actualizar
-- vínculos»; la función subir-drive lo comprueba con puede_escribir).
-- =====================================================================

update public.menus set orden = 65 where id = 'direccion.registros';

insert into public.menus (id, nombre, orden, padre) values
  ('direccion.drive', 'PDFs Resultados en Drive', 64, 'direccion')
on conflict (id) do nothing;

insert into public.rutas_menu (prefijo, menu) values
  ('DrivePDFs/', 'direccion')
on conflict (prefijo) do nothing;

-- Visible para los roles que ya ven «Dirección NVA».
insert into public.permisos_rol (rol, menu, acceso)
select pr.rol, 'direccion.drive',
  case when pr.acceso = 'ninguno' then 'ninguno' else 'lectura' end::public.nivel_acceso
from public.permisos_rol pr
where pr.menu = 'direccion'
on conflict (rol, menu) do nothing;
