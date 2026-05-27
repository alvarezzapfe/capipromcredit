-- =====================================================================
-- CapiProm — Migración 002: Roles y perfiles
-- Sistema de roles: super_admin / operador / consulta
-- Ejecutar DESPUÉS de schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla de perfiles (1:1 con auth.users)
-- ---------------------------------------------------------------------
create table if not exists perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nombre      text,
  rol         text not null default 'consulta'
              check (rol in ('super_admin','operador','consulta')),
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table perfiles enable row level security;

-- ---------------------------------------------------------------------
-- 2. Función helper: obtener el rol del usuario actual
--    SECURITY DEFINER para poder leer perfiles desde las políticas RLS
--    sin caer en recursión.
-- ---------------------------------------------------------------------
create or replace function rol_actual()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select rol from perfiles where id = auth.uid();
$$;

create or replace function es_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(rol_actual() = 'super_admin', false);
$$;

-- es_operador: super_admin u operador (pueden escribir)
create or replace function puede_escribir()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(rol_actual() in ('super_admin','operador'), false);
$$;

-- ---------------------------------------------------------------------
-- 3. Trigger: al crear un usuario en auth, crear su perfil
--    El primer usuario del sistema se vuelve super_admin automáticamente.
-- ---------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  select count(*) into total from perfiles;
  insert into perfiles (id, email, rol)
  values (
    new.id,
    new.email,
    case when total = 0 then 'super_admin' else 'consulta' end
  );
  return new;
end;
$$;

drop trigger if exists trg_new_user on auth.users;
create trigger trg_new_user
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- 4. RLS de perfiles
-- ---------------------------------------------------------------------
-- Cada quien lee su propio perfil; los admin leen todos
create policy "perfil_select_propio_o_admin" on perfiles
  for select to authenticated
  using (id = auth.uid() or es_admin());

-- Solo super_admin puede cambiar roles / activar / desactivar
create policy "perfil_update_admin" on perfiles
  for update to authenticated
  using (es_admin()) with check (es_admin());

-- Solo super_admin puede insertar perfiles manualmente
create policy "perfil_insert_admin" on perfiles
  for insert to authenticated
  with check (es_admin());

-- ---------------------------------------------------------------------
-- 5. Re-escribir políticas de las tablas de negocio según rol
--    - lectura: cualquier autenticado activo
--    - escritura: solo super_admin u operador
-- ---------------------------------------------------------------------

-- creditos
drop policy if exists "creditos_all_auth" on creditos;
create policy "creditos_select" on creditos
  for select to authenticated using (true);
create policy "creditos_write" on creditos
  for all to authenticated using (puede_escribir()) with check (puede_escribir());

-- amortizacion
drop policy if exists "amort_all_auth" on amortizacion;
create policy "amort_select" on amortizacion
  for select to authenticated using (true);
create policy "amort_write" on amortizacion
  for all to authenticated using (puede_escribir()) with check (puede_escribir());

-- bitacora (lectura todos; escritura cualquier autenticado, para registrar acciones)
drop policy if exists "bitacora_all_auth" on bitacora;
create policy "bitacora_select" on bitacora
  for select to authenticated using (true);
create policy "bitacora_insert" on bitacora
  for insert to authenticated with check (true);

-- solicitudes: lectura autenticados; update solo quien puede escribir
drop policy if exists "solicitud_update_auth" on solicitudes;
create policy "solicitud_update_write" on solicitudes
  for update to authenticated using (puede_escribir()) with check (puede_escribir());

-- =====================================================================
-- NOTA: Si ya creaste tu usuario ANTES de correr esta migración,
-- el trigger no le creó perfil. Córrelo manualmente (reemplaza el email):
--
--   insert into perfiles (id, email, rol)
--   select id, email, 'super_admin' from auth.users
--   where email = 'TU_EMAIL@ejemplo.com'
--   on conflict (id) do update set rol = 'super_admin';
-- =====================================================================
