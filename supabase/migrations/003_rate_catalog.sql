-- =====================================================================
-- Migración 003: Catálogo de tasas de referencia + columnas de tasa revisable
-- PR1 — Homologación Nodum: Tasa revisable + formato de etiqueta
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CATÁLOGO DE TASAS DE REFERENCIA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type   text NOT NULL,                -- 'TIIE_28', 'TIIE_FONDEO', etc.
  rate_date   date NOT NULL,                -- Fecha de publicación (último día hábil del mes)
  rate_value  numeric(8,6) NOT NULL,        -- Valor decimal (0.067559 = 6.7559%)
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rate_type, rate_date)
);

CREATE INDEX idx_rate_catalog_lookup
  ON rate_catalog (rate_type, rate_date DESC);

-- RLS: lectura para autenticados, escritura para admins
ALTER TABLE rate_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_catalog_select_auth" ON rate_catalog
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rate_catalog_write_admin" ON rate_catalog
  FOR ALL TO authenticated
  USING (puede_escribir())
  WITH CHECK (puede_escribir());

-- ---------------------------------------------------------------------
-- 2. SEED — Valores reales (último día hábil del mes)
-- ---------------------------------------------------------------------
INSERT INTO rate_catalog (rate_type, rate_date, rate_value) VALUES
  -- TIIE 28 días
  ('TIIE_28', '2026-05-29', 0.067559),
  ('TIIE_28', '2026-04-30', 0.069000),
  ('TIIE_28', '2026-03-31', 0.070272),
  ('TIIE_28', '2026-02-27', 0.071000),
  ('TIIE_28', '2026-01-30', 0.072000),
  ('TIIE_28', '2025-12-31', 0.073489),
  ('TIIE_28', '2025-11-28', 0.076103),
  ('TIIE_28', '2025-10-31', 0.077812),
  ('TIIE_28', '2025-09-30', 0.078818),
  ('TIIE_28', '2025-08-29', 0.080327),
  ('TIIE_28', '2025-07-31', 0.082339),
  ('TIIE_28', '2024-11-29', 0.104763),
  ('TIIE_28', '2021-12-31', 0.055700),
  ('TIIE_28', '2021-09-30', 0.047500),
  ('TIIE_28', '2021-06-30', 0.042850),
  -- TIIE Fondeo
  ('TIIE_FONDEO', '2026-05-29', 0.065000),
  ('TIIE_FONDEO', '2026-04-30', 0.065000),
  ('TIIE_FONDEO', '2026-03-31', 0.067500),
  ('TIIE_FONDEO', '2026-02-27', 0.067500),
  ('TIIE_FONDEO', '2026-01-30', 0.070000),
  ('TIIE_FONDEO', '2025-12-31', 0.070000),
  ('TIIE_FONDEO', '2025-11-28', 0.072500),
  ('TIIE_FONDEO', '2025-10-31', 0.075000),
  ('TIIE_FONDEO', '2025-09-30', 0.075000),
  ('TIIE_FONDEO', '2025-08-29', 0.077500),
  ('TIIE_FONDEO', '2025-07-31', 0.080000),
  ('TIIE_FONDEO', '2024-11-29', 0.102500),
  ('TIIE_FONDEO', '2021-12-31', 0.055000),
  ('TIIE_FONDEO', '2021-09-30', 0.047500),
  ('TIIE_FONDEO', '2021-06-30', 0.042500)
ON CONFLICT (rate_type, rate_date) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. COLUMNAS NUEVAS EN CREDITOS
-- ---------------------------------------------------------------------
ALTER TABLE creditos
  ADD COLUMN IF NOT EXISTS rate_type       text,            -- FK lógico a rate_catalog.rate_type (NULL = fija)
  ADD COLUMN IF NOT EXISTS spread          numeric(6,4),    -- Decimal: 0.06 = 6%
  ADD COLUMN IF NOT EXISTS fixed_rate      numeric(6,4),    -- Decimal: 0.15 = 15% (solo cuando es fija)
  ADD COLUMN IF NOT EXISTS day_count_base  integer NOT NULL DEFAULT 360;  -- 360 o 365

COMMENT ON COLUMN creditos.rate_type IS 'Tipo de tasa de referencia del catálogo (TIIE_28, TIIE_FONDEO). NULL = tasa fija.';
COMMENT ON COLUMN creditos.spread IS 'Spread sobre la tasa de referencia como decimal (0.06 = 6%).';
COMMENT ON COLUMN creditos.fixed_rate IS 'Tasa fija anual como decimal (0.15 = 15%). Solo aplica cuando rate_type IS NULL.';
COMMENT ON COLUMN creditos.day_count_base IS 'Base de días para cálculo de intereses: 360 (default) o 365.';

-- ---------------------------------------------------------------------
-- 4. BACKFILL — Migrar datos existentes a las nuevas columnas
--    Separado por tipo_tasa para no cruzar datos.
--    spread_pp en DB: podría estar como puntos (4.5) o decimal (0.045)
--    Regla: si > 1 es puntos, dividir entre 100; si <= 1 ya es decimal
-- ---------------------------------------------------------------------

-- Variables: rate_type + spread; fixed_rate queda NULL
UPDATE creditos
SET
  rate_type = UPPER(REPLACE(tasa_referencia, ' ', '_')),
  spread    = CASE WHEN spread_pp > 1 THEN spread_pp / 100 ELSE spread_pp END
WHERE tipo_tasa = 'variable'
  AND rate_type IS NULL;

-- Fijas: fixed_rate; rate_type queda NULL (= fija)
UPDATE creditos
SET
  fixed_rate = tasa_anual
WHERE tipo_tasa = 'fija'
  AND fixed_rate IS NULL;

-- Créditos sin tipo_tasa explícito: asumir fija
UPDATE creditos
SET
  fixed_rate = tasa_anual
WHERE tipo_tasa IS NULL
  AND fixed_rate IS NULL;

-- ---------------------------------------------------------------------
-- 5. CHECK CONSTRAINT para day_count_base
-- ---------------------------------------------------------------------
ALTER TABLE creditos
  ADD CONSTRAINT creditos_day_count_base_check
  CHECK (day_count_base IN (360, 365));
