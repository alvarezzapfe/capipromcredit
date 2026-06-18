-- =====================================================================
-- Migración 012: saldo_override para créditos en curso
-- fecha_origen ya existe. Solo agregamos saldo_override.
-- =====================================================================

ALTER TABLE creditos
  ADD COLUMN IF NOT EXISTS saldo_override numeric(14,2);

COMMENT ON COLUMN creditos.saldo_override IS 'Saldo insoluto override manual. Si NULL, se calcula de la tabla de amortización.';
