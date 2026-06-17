-- =====================================================================
-- Migración 005: Columnas para wizard de activación institucional
-- Esquema, convención de días, revisión de tasa, comisión, CAT, TIR
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas en creditos
-- ---------------------------------------------------------------------
ALTER TABLE creditos
  ADD COLUMN IF NOT EXISTS esquema               text NOT NULL DEFAULT 'frances',
  ADD COLUMN IF NOT EXISTS convencion_dias        text NOT NULL DEFAULT 'ACT/360',
  ADD COLUMN IF NOT EXISTS frecuencia_revision    integer,
  ADD COLUMN IF NOT EXISTS fecha_primer_pago      date,
  ADD COLUMN IF NOT EXISTS comision_apertura      numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comision_apertura_pct  numeric(6,4),
  ADD COLUMN IF NOT EXISTS comision_iva           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS iva_intereses          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cat                    numeric(8,4),
  ADD COLUMN IF NOT EXISTS tir                    numeric(8,4);

-- ---------------------------------------------------------------------
-- 2. Backfill: esquema = metodo_amort para créditos existentes
-- ---------------------------------------------------------------------
UPDATE creditos SET esquema = metodo_amort
WHERE esquema = 'frances' AND metodo_amort != 'frances';

-- ---------------------------------------------------------------------
-- 3. Constraints
-- ---------------------------------------------------------------------
ALTER TABLE creditos ADD CONSTRAINT creditos_convencion_dias_check
  CHECK (convencion_dias IN ('ACT/360','ACT/365','30E/360'));

-- Ampliar frecuencia para las nuevas (conserva quincenal/semanal para datos viejos)
ALTER TABLE creditos DROP CONSTRAINT IF EXISTS creditos_frecuencia_check;
ALTER TABLE creditos ADD CONSTRAINT creditos_frecuencia_check
  CHECK (frecuencia IN ('mensual','bimestral','trimestral','cuatrimestral',
                         'semestral','anual','quincenal','semanal'));
