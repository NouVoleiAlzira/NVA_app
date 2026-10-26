-- =====================================================================
-- Calendario de partidos › Actualización programada de los PDF
--
-- Nueva subsección debajo de «Equipos · PDF Competición»: una casilla para
-- activarla y la hora (de España) a la que se hace. Lo elegido, y el resumen
-- de la última actualización, se guardan en CalendarioProgramada.json: lo
-- puede cambiar quien pueda editar el Calendario de partidos.
--
-- pg_cron llama cada hora en punto a la función actualizar-calendarios.
-- La función mira si está activada y si es la hora elegida; si no, no hace
-- nada. Para que nadie más pueda lanzarla, la llamada lleva una clave que
-- se genera aquí y solo pueden leer la base de datos y las funciones
-- (public.tareas_clave, sin acceso para la app).
-- =====================================================================

-- Subsección del menú (visible para los roles que ya ven «Equipos · PDF de competición»)
insert into public.menus (id, nombre, orden, padre) values
  ('calendario.programada', 'Actualización programada', 55, 'calendario')
on conflict (id) do nothing;

insert into public.permisos_rol (rol, menu, acceso)
select pr.rol, 'calendario.programada', pr.acceso
from public.permisos_rol pr
where pr.menu = 'calendario.equipos'
on conflict (rol, menu) do nothing;

insert into public.rutas_menu (prefijo, menu) values
  ('CalendarioProgramada.json', 'calendario')
on conflict (prefijo) do nothing;

-- Clave de la tarea
create table if not exists public.tareas_clave (
  nombre text primary key,
  clave  text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.tareas_clave enable row level security;   -- sin políticas: la app no la ve
revoke all on public.tareas_clave from anon, authenticated;
grant select on public.tareas_clave to service_role;

insert into public.tareas_clave (nombre) values ('actualizar-calendarios')
on conflict (nombre) do nothing;

-- Llamada de cada hora
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'actualizar-calendarios';

select cron.schedule(
  'actualizar-calendarios',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://avsovxrohruariydaned.supabase.co/functions/v1/actualizar-calendarios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- anon key (pública, la misma de supabase-config.js): solo abre la puerta de las funciones
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2c292eHJvaHJ1YXJpeWRhbmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NjQ0NDUsImV4cCI6MjEwODQ0MDQ0NX0.bEsWHRN7-13bz8OaXOcMu_itOaKIguB5sKT6hQTwuiU',
      'x-clave-tarea', (select clave from public.tareas_clave where nombre = 'actualizar-calendarios')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
