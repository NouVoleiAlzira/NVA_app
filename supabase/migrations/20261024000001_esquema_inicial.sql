-- =====================================================================
-- NVA app · Esquema inicial de Supabase
--
-- Idea general
--   La app guardaba sus datos como archivos en un repositorio privado de
--   GitHub (registros/…json, Partidos/…json, Fichas/…pdf, Reels/…mp4…).
--   Para cambiar lo mínimo posible la app, mantenemos esas mismas rutas:
--     · archivos de texto (.json, .txt)  -> tabla public.archivos
--     · archivos binarios (pdf, jpg, mp4) -> bucket privado de Storage "privado"
--   Cada ruta pertenece a un MENÚ de la app (según su prefijo) y cada ROL
--   tiene, por menú, acceso 'ninguno' | 'lectura' | 'escritura'.
--
-- Roles de partida
--   propietario   todo, y además gestiona usuarios, roles y permisos
--   administrador todo menos usuarios/roles y las Opciones del club
--   entrenador    escribe solo en los equipos que tenga asignados
--   lectura       solo consulta
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------
create table public.roles (
  id                 text primary key,
  nombre             text not null,
  nivel              int  not null,            -- mayor = más poder
  gestiona_usuarios  boolean not null default false,
  restringir_equipos boolean not null default false  -- solo escribe en sus equipos
);

create table public.menus (
  id     text primary key,
  nombre text not null,
  orden  int  not null default 0
);

create type public.nivel_acceso as enum ('ninguno', 'lectura', 'escritura');

create table public.permisos_rol (
  rol    text not null references public.roles(id) on delete cascade,
  menu   text not null references public.menus(id) on delete cascade,
  acceso public.nivel_acceso not null default 'ninguno',
  primary key (rol, menu)
);

-- Qué menú protege cada carpeta/archivo. Gana el prefijo más largo.
create table public.rutas_menu (
  prefijo text primary key,
  menu    text not null references public.menus(id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------
create table public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  nombre      text,
  rol         text not null default 'lectura' references public.roles(id),
  equipos     text[] not null default '{}',   -- p. ej. {'Enova NVA (Cadete)'}
  activo      boolean not null default true,
  creado      timestamptz not null default now()
);

-- Email del propietario: la primera cuenta con este email nace como propietario.
create table public.ajustes (
  clave text primary key,
  valor text not null
);

-- ---------------------------------------------------------------------
-- Datos
-- ---------------------------------------------------------------------
create table public.archivos (
  ruta            text primary key,            -- 'registros/Entrenamientos_X_2026-09-16.json'
  contenido       text not null,               -- texto tal cual (JSON o txt)
  equipo          text,                        -- equipo al que pertenece, si aplica
  version         bigint not null default 1,   -- sustituye al "sha" de GitHub
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);
create index archivos_ruta_prefijo on public.archivos (ruta text_pattern_ops);

-- Historial de cambios (quién cambió qué y cuándo), solo lo ve el propietario.
create table public.auditoria (
  id       bigserial primary key,
  ruta     text not null,
  accion   text not null,              -- insert | update | delete
  usuario  uuid,
  fecha    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Funciones de ayuda (security definer: leen tablas protegidas)
-- ---------------------------------------------------------------------
create or replace function public.mi_perfil()
returns public.perfiles
language sql stable security definer set search_path = public as $$
  select * from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.menu_de_ruta(p_ruta text)
returns text
language sql stable security definer set search_path = public as $$
  select menu from public.rutas_menu
  where p_ruta like prefijo || '%'
  order by length(prefijo) desc
  limit 1
$$;

create or replace function public.acceso_menu(p_menu text)
returns public.nivel_acceso
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pr.acceso
       from public.perfiles p
       join public.permisos_rol pr on pr.rol = p.rol and pr.menu = p_menu
      where p.id = auth.uid() and p.activo),
    'ninguno'::public.nivel_acceso)
$$;

create or replace function public.puede_leer(p_ruta text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.acceso_menu(public.menu_de_ruta(p_ruta)) in ('lectura', 'escritura')
$$;

create or replace function public.puede_escribir(p_ruta text, p_equipo text default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.acceso_menu(public.menu_de_ruta(p_ruta)) = 'escritura'
     and (
       p_equipo is null
       or not exists (select 1 from public.perfiles p join public.roles r on r.id = p.rol
                       where p.id = auth.uid() and r.restringir_equipos)
       or p_equipo = any ((public.mi_perfil()).equipos)
     )
$$;

create or replace function public.es_gestor()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles p join public.roles r on r.id = p.rol
                  where p.id = auth.uid() and p.activo and r.gestiona_usuarios)
$$;

-- Permisos efectivos del usuario conectado: la app los usa para pintar menús.
create or replace function public.mis_permisos()
returns table (menu text, acceso public.nivel_acceso)
language sql stable security definer set search_path = public as $$
  select m.id, public.acceso_menu(m.id) from public.menus m order by m.orden
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
-- Alta de perfil al crear la cuenta. El email del propietario recibe ese rol;
-- el resto nace "lectura" (o el rol que se pase al invitar en raw_user_meta_data).
create or replace function public.crear_perfil()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rol text;
begin
  if lower(new.email) = lower((select valor from public.ajustes where clave = 'email_propietario')) then
    v_rol := 'propietario';
  else
    v_rol := coalesce(new.raw_user_meta_data->>'rol', 'lectura');
    if v_rol = 'propietario' or not exists (select 1 from public.roles where id = v_rol) then
      v_rol := 'lectura';
    end if;
  end if;
  insert into public.perfiles (id, email, nombre, rol, equipos)
  values (
    new.id, new.email,
    new.raw_user_meta_data->>'nombre',
    v_rol,
    coalesce(array(select jsonb_array_elements_text(new.raw_user_meta_data->'equipos')), '{}')
  );
  return new;
end $$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Versión, fecha y autor en cada escritura + auditoría.
create or replace function public.archivos_al_guardar()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.creado := old.creado;
  else
    new.version := 1;
    new.creado := now();
  end if;
  new.actualizado := now();
  new.actualizado_por := auth.uid();
  insert into public.auditoria (ruta, accion, usuario) values (new.ruta, lower(tg_op), auth.uid());
  return new;
end $$;

create trigger archivos_guardar
  before insert or update on public.archivos
  for each row execute function public.archivos_al_guardar();

create or replace function public.archivos_al_borrar()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria (ruta, accion, usuario) values (old.ruta, 'delete', auth.uid());
  return old;
end $$;

create trigger archivos_borrar
  after delete on public.archivos
  for each row execute function public.archivos_al_borrar();

-- Nadie puede quitarse a sí mismo el rol de propietario ni dejar el club sin propietario.
create or replace function public.proteger_propietario()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.rol = 'propietario' and (new.rol <> 'propietario' or not new.activo)
     and (select count(*) from public.perfiles where rol = 'propietario' and activo) <= 1 then
    raise exception 'Debe quedar al menos un propietario activo';
  end if;
  if new.rol = 'propietario' and old.rol <> 'propietario'
     and not exists (select 1 from public.perfiles where id = auth.uid() and rol = 'propietario') then
    raise exception 'Solo un propietario puede nombrar a otro propietario';
  end if;
  return new;
end $$;

create trigger perfiles_proteger
  before update on public.perfiles
  for each row execute function public.proteger_propietario();

-- ---------------------------------------------------------------------
-- Seguridad a nivel de fila (RLS)
-- ---------------------------------------------------------------------
alter table public.roles        enable row level security;
alter table public.menus        enable row level security;
alter table public.permisos_rol enable row level security;
alter table public.rutas_menu   enable row level security;
alter table public.perfiles     enable row level security;
alter table public.ajustes      enable row level security;
alter table public.archivos     enable row level security;
alter table public.auditoria    enable row level security;

-- Catálogos: los lee cualquier usuario conectado; solo el gestor los cambia.
create policy roles_leer        on public.roles        for select to authenticated using (true);
create policy menus_leer        on public.menus        for select to authenticated using (true);
create policy permisos_leer     on public.permisos_rol for select to authenticated using (true);
create policy rutas_leer        on public.rutas_menu   for select to authenticated using (true);
create policy roles_gestionar    on public.roles        for all to authenticated using (public.es_gestor()) with check (public.es_gestor());
create policy permisos_gestionar on public.permisos_rol for all to authenticated using (public.es_gestor()) with check (public.es_gestor());
create policy rutas_gestionar    on public.rutas_menu   for all to authenticated using (public.es_gestor()) with check (public.es_gestor());

-- Perfiles: cada uno ve el suyo; el gestor ve y cambia todos.
create policy perfiles_leer on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_gestor());
create policy perfiles_gestionar on public.perfiles for update to authenticated
  using (public.es_gestor()) with check (public.es_gestor());

-- Ajustes y auditoría: solo el gestor.
create policy ajustes_gestionar on public.ajustes for all to authenticated
  using (public.es_gestor()) with check (public.es_gestor());
create policy auditoria_leer on public.auditoria for select to authenticated
  using (public.es_gestor());

-- Archivos de texto
create policy archivos_leer on public.archivos for select to authenticated
  using (public.puede_leer(ruta));
create policy archivos_crear on public.archivos for insert to authenticated
  with check (public.puede_escribir(ruta, equipo));
create policy archivos_cambiar on public.archivos for update to authenticated
  using (public.puede_escribir(ruta, equipo)) with check (public.puede_escribir(ruta, equipo));
create policy archivos_borrar on public.archivos for delete to authenticated
  using (public.puede_escribir(ruta, equipo));

-- ---------------------------------------------------------------------
-- Storage: bucket privado para PDF, fotos, vídeos y música
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('privado', 'privado', false)
on conflict (id) do nothing;

create policy privado_leer on storage.objects for select to authenticated
  using (bucket_id = 'privado' and public.puede_leer(name));
create policy privado_crear on storage.objects for insert to authenticated
  with check (bucket_id = 'privado' and public.puede_escribir(name));
create policy privado_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'privado' and public.puede_escribir(name))
  with check (bucket_id = 'privado' and public.puede_escribir(name));
create policy privado_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'privado' and public.puede_escribir(name));

-- ---------------------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------------------
insert into public.roles (id, nombre, nivel, gestiona_usuarios, restringir_equipos) values
  ('propietario',   'Propietario',   100, true,  false),
  ('administrador', 'Administrador',  80, false, false),
  ('entrenador',    'Entrenador',     50, false, true),
  ('lectura',       'Solo lectura',   10, false, false);

-- Los menús siguen el orden del tutorial de la app.
insert into public.menus (id, nombre, orden) values
  ('inicio',      'Inicio · Calendario, pasar lista y hoja del partido', 10),
  ('informes',    'Informes y kilometraje',                               20),
  ('tablon',      'Tablón de consultas',                                  30),
  ('otros',       'Otros: información y fichas',                          40),
  ('calendario',  'Calendario de partidos y resultados',                  50),
  ('direccion',   'Dirección NVA: avisos, consultas y horarios',          60),
  ('carteles',    'Carteles',                                             70),
  ('instagram',   'Instagram: reels y stories',                           80),
  ('opciones',    'Opciones del club',                                    90);

insert into public.rutas_menu (prefijo, menu) values
  ('registros/',              'inicio'),
  ('Partidos/',               'inicio'),
  ('warnings/',               'inicio'),
  ('Historial/anulaciones',   'inicio'),
  ('Kilometraje/',            'informes'),
  ('Tablon.json',             'tablon'),
  ('Consultas.json',          'tablon'),
  ('OTROS.json',              'otros'),
  ('Fichas/',                 'otros'),
  ('CalendarioPartidos.json', 'calendario'),
  ('Calendarios/',            'calendario'),
  ('Ligas/',                  'calendario'),
  ('PartidosyResultados/',    'calendario'),
  ('Historial/avisos',        'direccion'),
  ('Historial/historial_',    'direccion'),
  ('Horarios.json',           'direccion'),
  ('Reels/',                  'instagram'),
  ('configuracion.json',      'opciones'),
  ('LOGO NVA.png',            'opciones');

-- Matriz de permisos de partida (se cambia desde el panel del propietario).
insert into public.permisos_rol (rol, menu, acceso)
select r.id, m.id,
  case
    when r.id = 'propietario' then 'escritura'
    when r.id = 'administrador' and m.id = 'opciones' then 'lectura'
    when r.id = 'administrador' then 'escritura'
    when r.id = 'entrenador' and m.id in ('inicio', 'informes') then 'escritura'
    when r.id = 'entrenador' and m.id in ('tablon', 'otros', 'calendario') then 'lectura'
    when r.id = 'entrenador' then 'ninguno'
    when r.id = 'lectura' and m.id in ('inicio', 'tablon', 'otros', 'calendario') then 'lectura'
    else 'ninguno'
  end::public.nivel_acceso
from public.roles r cross join public.menus m;

-- ⚠️ Cambia este email por el tuyo antes de crear tu cuenta (o después, con un UPDATE).
insert into public.ajustes (clave, valor) values ('email_propietario', 'CAMBIAR@ejemplo.com');
