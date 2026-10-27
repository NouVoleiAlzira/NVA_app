-- =====================================================================
-- Mensaje de aviso: los entrenadores pueden leer lo que necesitan
--
-- · El aviso de registros pendientes se guarda en Historial/avisos.json
--   (sección Dirección NVA). Cada entrenador lo lee al abrir la app, pero
--   con la sección Dirección en «—» no podía leerlo y no le salía nada.
-- · El «Aviso automático» calcula al abrir la app lo que le falta por
--   registrar, y para eso lee los entrenamientos de Horarios.json.
-- · Estos dos ficheros los puede LEER cualquier usuario activo. Para
--   GUARDARLOS sigue haciendo falta «Editar» en su subsección.
-- =====================================================================

create or replace function public.puede_leer(p_ruta text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
           when p_ruta in ('Historial/avisos.json', 'Horarios.json')
             then exists (select 1 from public.perfiles where id = auth.uid() and activo)
           else public.acceso_menu(split_part(public.menu_de_ruta(p_ruta), '.', 1)) in ('lectura', 'escritura')
         end
$$;
