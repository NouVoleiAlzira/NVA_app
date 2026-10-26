-- =====================================================================
-- Dirección NVA › PDFs Resultados en Drive › «Programar Autom.»
--
-- Lo elegido en la app (activada, hora de España y días) y el resumen de la
-- última vez van en DrivePDFs/programada.json: ya depende del menú
-- «direccion» (ruta DrivePDFs/ de 20261026000002), así que lo puede cambiar
-- quien pueda pulsar «Actualizar vínculos».
--
-- pg_cron llama cada hora a y 10 a la función actualizar-drive. La función
-- mira si está activada, si hoy es uno de los días elegidos y si es la hora
-- elegida; si no, no hace nada. Los 10 minutos dejan terminar antes la
-- actualización programada de los PDF de la federación (a en punto).
-- Para que nadie más pueda lanzarla, la llamada lleva su propia clave en
-- public.tareas_clave (tabla creada en 20261026000003).
-- =====================================================================

insert into public.tareas_clave (nombre) values ('actualizar-drive')
on conflict (nombre) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'actualizar-drive';

select cron.schedule(
  'actualizar-drive',
  '10 * * * *',
  $$
  select net.http_post(
    url := 'https://avsovxrohruariydaned.supabase.co/functions/v1/actualizar-drive',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- anon key (pública, la misma de supabase-config.js): solo abre la puerta de las funciones
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2c292eHJvaHJ1YXJpeWRhbmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NjQ0NDUsImV4cCI6MjEwODQ0MDQ0NX0.bEsWHRN7-13bz8OaXOcMu_itOaKIguB5sKT6hQTwuiU',
      'x-clave-tarea', (select clave from public.tareas_clave where nombre = 'actualizar-drive')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
