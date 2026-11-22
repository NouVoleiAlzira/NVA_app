-- =====================================================================
-- Los entrenadores pueden registrar entrenamientos y partidos de
-- cualquier equipo (se sustituyen unos a otros).
--
-- Hasta ahora el rol Entrenador tenía «Solo puede editar los equipos que
-- tenga asignados» (roles.restringir_equipos). Supabase rechazaba el
-- registro de un equipo ajeno y la app lo dejaba en la cola del
-- dispositivo como si no hubiera conexión, sin subir nunca a la nube.
-- Al quitar la restricción, lo que quedó en cola en los dispositivos se
-- sube solo en la siguiente sincronización.
--
-- Solo afecta a registros/ y Partidos/ (los únicos archivos con «equipo»).
-- Se puede ejecutar varias veces.
-- =====================================================================

update public.roles set restringir_equipos = false where id = 'entrenador';
