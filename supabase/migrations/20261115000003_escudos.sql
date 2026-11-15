-- =====================================================================
-- ⚙️ Configuración del Club › pestaña «Escudos»
--
-- Escudos y colores de los equipos del club y escudos de los demás clubes
-- con sus equipos. Se guardan en la carpeta Escudos/:
--   Escudos/escudos.json           (tabla archivos)
--   Escudos/imagenes/<nombre>.png  (Storage, bucket privado)
-- Leer: cualquier usuario activo (más adelante los usarán las Stories,
--       los Reels y los carteles de Eventos).
-- Guardar: hace falta «Editar» en esta pestaña.
-- Empieza con el mismo nivel que cada rol tiene en «Pestaña Jugadores/as
-- y Equipos»; se cambia en Opciones › Permisos por rol.
-- =====================================================================
insert into public.menus (id, nombre, orden, padre) values
  ('opciones.escudos', 'Pestaña Escudos', 94, 'opciones')
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden, padre = excluded.padre;

insert into public.permisos_rol (rol, menu, acceso)
select pr.rol, 'opciones.escudos', pr.acceso
from public.permisos_rol pr
where pr.menu = 'opciones.equipos'
on conflict (rol, menu) do nothing;

insert into public.rutas_menu (prefijo, menu) values
  ('Escudos/', 'opciones.escudos')
on conflict (prefijo) do update set menu = excluded.menu;

create or replace function public.puede_leer(p_ruta text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
           when p_ruta in ('Historial/avisos.json', 'Horarios.json') or p_ruta like 'Escudos/%'
             then exists (select 1 from public.perfiles where id = auth.uid() and activo)
           else public.acceso_menu(split_part(public.menu_de_ruta(p_ruta), '.', 1)) in ('lectura', 'escritura')
         end
$$;
