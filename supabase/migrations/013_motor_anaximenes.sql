-- =====================================================================
-- Migración 013: Parametrización extendida del motor de schedule
-- base_calendario, num_pagos_capital, supuesto_forward, interes_base
-- Defaults preservan comportamiento actual para créditos existentes.
-- =====================================================================

ALTER TABLE creditos
  ADD COLUMN IF NOT EXISTS base_calendario     text NOT NULL DEFAULT 'aniversario',
  ADD COLUMN IF NOT EXISTS num_pagos_capital    integer,
  ADD COLUMN IF NOT EXISTS supuesto_forward     text NOT NULL DEFAULT 'ultima_conocida',
  ADD COLUMN IF NOT EXISTS interes_base         text NOT NULL DEFAULT 'apertura';
