-- =====================================================================
-- Migración 004: Conversión solicitud → crédito borrador
-- Incluye: solicitudes.credito_id, estatus 'borrador', RPC atómico,
--          RPC de anulación (super_admin)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. solicitudes.credito_id — liga bidireccional con creditos
-- ---------------------------------------------------------------------
ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS credito_id uuid REFERENCES creditos(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 2. Agregar 'borrador' al CHECK de creditos.estatus
-- ---------------------------------------------------------------------
ALTER TABLE creditos DROP CONSTRAINT IF EXISTS creditos_estatus_check;
ALTER TABLE creditos ADD CONSTRAINT creditos_estatus_check
  CHECK (estatus IN ('borrador','vigente','en_mora','vencido','liquidado','cancelado','reestructurado'));

-- ---------------------------------------------------------------------
-- 3. RPC: convertir_solicitud_a_credito
--    Transacción atómica — SECURITY DEFINER para poder insertar
--    Operador derivado de auth.jwt(), no del cliente
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION convertir_solicitud_a_credito(
  p_solicitud_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol          record;
  v_cliente_id   uuid;
  v_credito_id   uuid;
  v_folio        text;
  v_operador     text;
  v_tipo_persona text;
  v_attempts     int := 0;
BEGIN
  -- Derivar operador de auth (no spoofeable)
  v_operador := coalesce(
    auth.jwt() ->> 'email',
    current_setting('request.jwt.claims', true)::jsonb ->> 'email',
    'sistema'
  );

  -- 1. Lock + validar solicitud
  SELECT * INTO v_sol FROM solicitudes WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada: %', p_solicitud_id;
  END IF;
  IF v_sol.credito_id IS NOT NULL THEN
    RAISE EXCEPTION 'Solicitud ya convertida (crédito %)', v_sol.credito_id;
  END IF;
  IF v_sol.estatus NOT IN ('aprobada') THEN
    RAISE EXCEPTION 'Solo solicitudes aprobadas se pueden convertir (actual: %)', v_sol.estatus;
  END IF;

  -- 2. Buscar cliente por RFC; crear stub si no existe
  IF v_sol.rfc IS NOT NULL AND v_sol.rfc <> '' THEN
    SELECT id INTO v_cliente_id FROM clientes WHERE rfc = v_sol.rfc LIMIT 1;
  END IF;
  IF v_cliente_id IS NULL THEN
    -- Derivar tipo_persona del RFC: 12 chars = moral, 13 = física
    v_tipo_persona := CASE
      WHEN v_sol.rfc IS NOT NULL AND length(v_sol.rfc) = 13 THEN 'fisica'
      ELSE 'moral'
    END;
    INSERT INTO clientes (nombre, rfc, email, tipo_persona, fecha_alta)
    VALUES (v_sol.nombre, v_sol.rfc, v_sol.email, v_tipo_persona, CURRENT_DATE)
    RETURNING id INTO v_cliente_id;
  END IF;

  -- 3. Generar folio único (loop hasta sin colisión)
  LOOP
    v_folio := 'CP-' || LPAD(FLOOR(RANDOM() * 9999999)::text, 7, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM creditos WHERE folio = v_folio);
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'No se pudo generar folio único tras 10 intentos';
    END IF;
  END LOOP;

  -- 4. Insertar crédito borrador
  --    Campos de solicitudes: nombre, email, telefono, rfc,
  --                           monto_solicitado, plazo_meses, destino
  INSERT INTO creditos (
    solicitud_id, cliente_id, folio, acreditado, rfc, monto,
    tasa_anual, plazo_meses, frecuencia, metodo_amort,
    fecha_origen, estatus, tipo_producto, tipo_tasa,
    rate_type, spread, fixed_rate, day_count_base,
    tipo_garantia, tipo_disposicion, periodo_gracia_meses, tipo_gracia
  ) VALUES (
    p_solicitud_id,
    v_cliente_id,
    v_folio,
    v_sol.nombre,                -- solicitudes.nombre → creditos.acreditado
    v_sol.rfc,                   -- solicitudes.rfc
    v_sol.monto_solicitado,      -- solicitudes.monto_solicitado → creditos.monto
    0,                           -- tasa_anual: placeholder, se llena al activar
    v_sol.plazo_meses,           -- solicitudes.plazo_meses → creditos.plazo_meses
    'mensual',                   -- default
    'frances',                   -- default
    CURRENT_DATE,                -- fecha_origen = hoy
    'borrador',                  -- NO vigente
    'credito_simple',            -- default
    'variable',                  -- default
    'TIIE_28',                   -- default rate_type
    NULL,                        -- spread: por definir
    NULL,                        -- fixed_rate: NULL (es variable por default)
    360,                         -- day_count_base default
    'quirografaria',             -- default garantía
    'unica',                     -- default disposición
    0,                           -- sin gracia
    'ninguna'                    -- sin gracia
  ) RETURNING id INTO v_credito_id;

  -- 5. Marcar solicitud como convertida + ligar
  UPDATE solicitudes
  SET estatus = 'convertida', credito_id = v_credito_id
  WHERE id = p_solicitud_id;

  -- 6. Audit trail
  INSERT INTO bitacora (entidad, entidad_id, accion, detalle, usuario) VALUES
    ('solicitud', p_solicitud_id, 'convertida',
     jsonb_build_object('credito_id', v_credito_id, 'folio', v_folio),
     v_operador),
    ('credito', v_credito_id, 'creado',
     jsonb_build_object('origen', 'conversion_solicitud', 'solicitud_id', p_solicitud_id, 'estatus', 'borrador'),
     v_operador);

  RETURN jsonb_build_object(
    'credito_id', v_credito_id,
    'folio', v_folio,
    'cliente_id', v_cliente_id
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 4. RPC: anular_conversion (super_admin only)
--    Revierte: cancela el crédito borrador, solicitud → aprobada
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION anular_conversion_solicitud(
  p_solicitud_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol        record;
  v_credito    record;
  v_operador   text;
  v_rol        text;
BEGIN
  -- Derivar operador y rol de auth
  v_operador := coalesce(
    auth.jwt() ->> 'email',
    current_setting('request.jwt.claims', true)::jsonb ->> 'email',
    'sistema'
  );
  SELECT rol INTO v_rol FROM perfiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Solo super_admin puede anular conversiones';
  END IF;

  -- Lock + validar solicitud
  SELECT * INTO v_sol FROM solicitudes WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;
  IF v_sol.estatus <> 'convertida' OR v_sol.credito_id IS NULL THEN
    RAISE EXCEPTION 'La solicitud no está en estado convertida con crédito ligado';
  END IF;

  -- Validar que el crédito siga en borrador
  SELECT * INTO v_credito FROM creditos WHERE id = v_sol.credito_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Crédito ya borrado, solo revertir solicitud
    NULL;
  ELSIF v_credito.estatus <> 'borrador' THEN
    RAISE EXCEPTION 'El crédito ya no está en borrador (estatus: %), no se puede anular', v_credito.estatus;
  ELSE
    -- Cancelar crédito borrador
    UPDATE creditos SET estatus = 'cancelado' WHERE id = v_sol.credito_id;
    INSERT INTO bitacora (entidad, entidad_id, accion, detalle, usuario)
    VALUES ('credito', v_sol.credito_id, 'cancelado',
            jsonb_build_object('razon', 'anulacion_conversion', 'solicitud_id', p_solicitud_id),
            v_operador);
  END IF;

  -- Revertir solicitud a aprobada
  UPDATE solicitudes SET estatus = 'aprobada', credito_id = NULL
  WHERE id = p_solicitud_id;

  INSERT INTO bitacora (entidad, entidad_id, accion, detalle, usuario)
  VALUES ('solicitud', p_solicitud_id, 'conversion_anulada',
          jsonb_build_object('credito_cancelado', v_sol.credito_id),
          v_operador);

  RETURN jsonb_build_object('ok', true, 'credito_cancelado', v_sol.credito_id);
END;
$$;
