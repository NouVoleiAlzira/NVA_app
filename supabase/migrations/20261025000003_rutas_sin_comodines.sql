-- =====================================================================
-- Prefijos de rutas_menu sin comodines
--
-- menu_de_ruta() comparaba con LIKE, donde «_» y «%» son comodines: el
-- prefijo 'Historial/historial_' también encajaba con rutas como
-- 'Historial/historialX…'. Ahora se compara el principio de la ruta
-- letra a letra. Con los prefijos actuales no cambia ningún permiso.
-- =====================================================================

create or replace function public.menu_de_ruta(p_ruta text)
returns text
language sql stable security definer set search_path = public as $$
  select menu from public.rutas_menu
  where left(p_ruta, length(prefijo)) = prefijo
  order by length(prefijo) desc
  limit 1
$$;
