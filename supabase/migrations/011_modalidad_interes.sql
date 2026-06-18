-- =====================================================================
-- Migración 011: Modalidad de pago de interés (vencido / anticipado)
-- =====================================================================

ALTER TABLE creditos
  ADD COLUMN IF NOT EXISTS modalidad_interes text NOT NULL DEFAULT 'vencido';

ALTER TABLE creditos ADD CONSTRAINT creditos_modalidad_interes_check
  CHECK (modalidad_interes IN ('vencido', 'anticipado'));
