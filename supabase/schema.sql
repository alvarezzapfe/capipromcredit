-- =====================================================================
-- CapiProm — Schema de gestión de crédito
-- Supabase / PostgreSQL
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SOLICITUDES (entran por la landing pública, sin auth)
-- ---------------------------------------------------------------------
create table if not exists solicitudes (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  email           text not null,
  telefono        text,
  rfc             text,
  monto_solicitado numeric(14,2) not null,
  plazo_meses     integer not null,
  destino         text,
  estatus         text not null default 'nueva'
                  check (estatus in ('nueva','en_revision','aprobada','rechazada','convertida')),
  notas           text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. CREDITOS (la solicitud aprobada se convierte en crédito)
-- ---------------------------------------------------------------------
create table if not exists creditos (
  id              uuid primary key default gen_random_uuid(),
  solicitud_id    uuid references solicitudes(id) on delete set null,
  folio           text unique not null,
  acreditado      text not null,
  rfc             text,
  monto           numeric(14,2) not null,
  tasa_anual      numeric(6,4) not null,          -- ej. 0.2400 = 24%
  plazo_meses     integer not null,
  frecuencia      text not null default 'mensual'
                  check (frecuencia in ('mensual','quincenal','semanal')),
  metodo_amort    text not null default 'frances'
                  check (metodo_amort in ('frances','saldos_insolutos','interes_periodico')),
  fecha_origen    date not null,
  estatus         text not null default 'vigente'
                  check (estatus in ('vigente','en_mora','vencido','liquidado','cancelado')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. AMORTIZACION (cupones / flujos generados al originar el crédito)
-- ---------------------------------------------------------------------
create table if not exists amortizacion (
  id              uuid primary key default gen_random_uuid(),
  credito_id      uuid not null references creditos(id) on delete cascade,
  numero_cupon    integer not null,
  fecha_pago      date not null,
  saldo_inicial   numeric(14,2) not null,
  capital         numeric(14,2) not null,
  interes         numeric(14,2) not null,
  pago_total      numeric(14,2) not null,
  saldo_final     numeric(14,2) not null,
  pagado          boolean not null default false,
  fecha_pago_real date,
  created_at      timestamptz not null default now(),
  unique (credito_id, numero_cupon)
);

-- ---------------------------------------------------------------------
-- 4. BITACORA / TRAZABILIDAD (log inmutable de cambios)
-- ---------------------------------------------------------------------
create table if not exists bitacora (
  id              uuid primary key default gen_random_uuid(),
  entidad         text not null,                  -- 'credito','solicitud','amortizacion'
  entidad_id      uuid not null,
  accion          text not null,                  -- 'creado','cambio_estatus','pago_registrado', etc.
  detalle         jsonb,                          -- { de: 'vigente', a: 'en_mora' }
  usuario         text,                           -- email del operador
  created_at      timestamptz not null default now()
);

create index if not exists idx_bitacora_entidad on bitacora (entidad, entidad_id);
create index if not exists idx_amort_credito on amortizacion (credito_id);
create index if not exists idx_amort_fecha on amortizacion (fecha_pago) where pagado = false;

-- ---------------------------------------------------------------------
-- 5. Trigger: mantener updated_at en creditos
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_creditos_updated on creditos;
create trigger trg_creditos_updated
  before update on creditos
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 6. RLS (Row Level Security)
--    - solicitudes: insert público (landing), lectura solo autenticados
--    - resto: solo autenticados
-- ---------------------------------------------------------------------
alter table solicitudes  enable row level security;
alter table creditos     enable row level security;
alter table amortizacion enable row level security;
alter table bitacora     enable row level security;

-- Cualquiera puede crear una solicitud desde la landing
create policy "solicitud_insert_publico" on solicitudes
  for insert to anon, authenticated with check (true);

-- Solo usuarios autenticados leen/gestionan
create policy "solicitud_select_auth" on solicitudes
  for select to authenticated using (true);
create policy "solicitud_update_auth" on solicitudes
  for update to authenticated using (true);

create policy "creditos_all_auth" on creditos
  for all to authenticated using (true) with check (true);
create policy "amort_all_auth" on amortizacion
  for all to authenticated using (true) with check (true);
create policy "bitacora_all_auth" on bitacora
  for all to authenticated using (true) with check (true);

-- =====================================================================
-- Vista útil: próximos cupones por cobrar (alertas)
-- =====================================================================
create or replace view v_proximos_cupones as
select
  a.id,
  a.credito_id,
  c.folio,
  c.acreditado,
  c.estatus as estatus_credito,
  a.numero_cupon,
  a.fecha_pago,
  a.pago_total,
  a.saldo_final,
  (a.fecha_pago - current_date) as dias_al_cupon
from amortizacion a
join creditos c on c.id = a.credito_id
where a.pagado = false
  and c.estatus in ('vigente','en_mora')
order by a.fecha_pago asc;
