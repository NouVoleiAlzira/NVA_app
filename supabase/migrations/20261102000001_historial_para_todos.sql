-- =====================================================================
-- Historial de cambios: todos los usuarios pueden anotar sus acciones
--
-- · Las acciones se guardan en Historial/historial_<AAAA-MM>.json, que
--   pertenece a la sección Dirección NVA. Para añadirlas había que poder
--   leer y EDITAR esa sección, así que lo que hacían los entrenadores
--   (registros de entrenamientos y de partidos) nunca llegaba al
--   historial: se quedaba pendiente en su dispositivo.
-- · Esta función añade acciones al fichero del mes sin dar permiso para
--   leerlo ni para cambiar lo que ya hay: solo agrega las que faltan
--   (por id). Ver el historial sigue siendo cosa de Dirección.
-- =====================================================================

create or replace function public.anotar_historial(p_mes text, p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ruta  text;
  v_items jsonb;
  v_ids   text[];
  v_nuevos jsonb;
begin
  if not exists (select 1 from public.perfiles where id = auth.uid() and activo) then
    raise exception 'No tienes permiso para anotar en el historial' using errcode = '42501';
  end if;
  if p_mes is null or p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'Mes no válido: %', p_mes using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'Lista de acciones no válida' using errcode = '22023';
  end if;

  v_ruta := 'Historial/historial_' || p_mes || '.json';
  -- Una sola escritura a la vez por fichero (nadie pisa lo de otro)
  perform pg_advisory_xact_lock(hashtext(v_ruta));

  select coalesce(contenido::jsonb -> 'items', '[]'::jsonb) into v_items
    from public.archivos where ruta = v_ruta;
  v_items := coalesce(v_items, '[]'::jsonb);
  select coalesce(array_agg(e ->> 'id'), '{}') into v_ids from jsonb_array_elements(v_items) e;

  -- Solo acciones bien formadas, del mes indicado y que aún no estén
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_nuevos
    from (select distinct on (e ->> 'id') e
            from jsonb_array_elements(p_items) e
           where jsonb_typeof(e) = 'object'
             and coalesce(e ->> 'id', '') <> ''
             and left(coalesce(e ->> 't', ''), 7) = p_mes
             and not ((e ->> 'id') = any (v_ids))) x;

  if jsonb_array_length(v_nuevos) = 0 then return 0; end if;

  select jsonb_agg(e order by e ->> 't') into v_items
    from jsonb_array_elements(v_items || v_nuevos) e;

  update public.archivos set contenido = jsonb_build_object('items', v_items)::text
   where ruta = v_ruta;
  if not found then
    insert into public.archivos (ruta, contenido)
    values (v_ruta, jsonb_build_object('items', v_items)::text);
  end if;

  return jsonb_array_length(v_nuevos);
end $$;

revoke all on function public.anotar_historial(text, jsonb) from public, anon;
grant execute on function public.anotar_historial(text, jsonb) to authenticated;
