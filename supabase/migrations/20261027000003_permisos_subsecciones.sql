-- =====================================================================
-- Permisos por subsección: cada subsección tiene su nivel (— / Ver / Editar)
--
-- · El nivel que vale en una subsección es el menor entre el suyo y el de
--   su sección: con la sección en «Ver», ninguna subsección se edita.
-- · Lo que guarda cada subsección depende ahora de ella (rutas_menu):
--   para GUARDAR hace falta «Editar» en la subsección. Para LEER basta con
--   ver la sección, porque otras partes de la app leen esos mismos datos
--   (p. ej. los PDF de la federación se usan en Informes PDF).
-- · Para no cambiar nada de lo que hay, cada subsección visible empieza con
--   el nivel de su sección.
-- =====================================================================

create or replace function public.acceso_menu(p_menu text)
returns public.nivel_acceso
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case
              when m.padre is null then pr.acceso
              else least(coalesce(pr.acceso, pp.acceso, 'ninguno'), coalesce(pp.acceso, 'ninguno'))
            end
       from public.perfiles p
       join public.menus m on m.id = p_menu
       left join public.permisos_rol pr on pr.rol = p.rol and pr.menu = m.id
       left join public.permisos_rol pp on pp.rol = p.rol and pp.menu = m.padre
      where p.id = auth.uid() and p.activo),
    'ninguno'::public.nivel_acceso)
$$;

-- Leer: basta con ver la sección (la parte antes del punto)
create or replace function public.puede_leer(p_ruta text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.acceso_menu(split_part(public.menu_de_ruta(p_ruta), '.', 1)) in ('lectura', 'escritura')
$$;

-- Cada subsección visible empieza con el nivel de su sección
update public.permisos_rol h
   set acceso = s.acceso
  from public.menus m, public.permisos_rol s
 where m.id = h.menu and m.padre is not null
   and s.rol = h.rol and s.menu = m.padre
   and h.acceso <> 'ninguno';

-- Datos que solo guarda una subsección
insert into public.rutas_menu (prefijo, menu) values
  ('Reels/borradores/',            'instagram.reels'),
  ('Reels/fotos/',                 'instagram.reels'),
  ('Reels/eventos/',               'instagram.reels'),
  ('Reels/historias/',             'instagram.stories'),
  ('Reels/solicitud_historia.json','instagram.stories')
on conflict (prefijo) do update set menu = excluded.menu;

update public.rutas_menu set menu = 'informes.fichas'       where prefijo = 'Fichas/';
update public.rutas_menu set menu = 'informes.drive'        where prefijo = 'DrivePDFs/';
update public.rutas_menu set menu = 'informes.kilometraje'  where prefijo = 'Kilometraje/';
update public.rutas_menu set menu = 'calendario.equipos'    where prefijo = 'Calendarios/';
update public.rutas_menu set menu = 'calendario.programada' where prefijo = 'CalendarioProgramada.json';
update public.rutas_menu set menu = 'direccion.horarios'    where prefijo = 'Horarios.json';
update public.rutas_menu set menu = 'direccion.registros'   where prefijo = 'Historial/avisos';
