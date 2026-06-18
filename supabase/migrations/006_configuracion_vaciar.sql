-- =====================================================================
-- Migración 006: RPC vaciar_datos para la sección Configuración
-- Borra datos operativos en orden FK-safe. NUNCA toca:
--   perfiles, user_totp, bitacora, auth.users
-- =====================================================================

CREATE OR REPLACE FUNCTION vaciar_datos(p_scope text DEFAULT 'operativo')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol       text;
  v_email     text;
  v_cnt       jsonb := '{}'::jsonb;
  v_n         bigint;
BEGIN
  -- 1. Validar rol server-side
  v_rol := rol_actual();
  IF v_rol IS NULL OR v_rol NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'No autorizado: rol "%" no puede vaciar datos', coalesce(v_rol, 'null');
  END IF;

  v_email := coalesce(
    auth.jwt() ->> 'email',
    current_setting('request.jwt.claims', true)::jsonb ->> 'email',
    'sistema'
  );

  -- 2. Borrar en orden FK-safe (hojas → padres)

  -- 2a. documentos_cliente (hoja de clientes)
  DELETE FROM documentos_cliente;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_cnt := v_cnt || jsonb_build_object('documentos_cliente', v_n);

  -- 2b. disposiciones (hoja de creditos)
  DELETE FROM disposiciones;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_cnt := v_cnt || jsonb_build_object('disposiciones', v_n);

  -- 2c. movimientos_linea (hoja de creditos)
  DELETE FROM movimientos_linea;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_cnt := v_cnt || jsonb_build_object('movimientos_linea', v_n);

  -- 2d. amortizacion (hoja de creditos, ON DELETE CASCADE pero borramos explícito)
  DELETE FROM amortizacion;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_cnt := v_cnt || jsonb_build_object('amortizacion', v_n);

  -- 2e. Romper FK circular solicitudes ↔ creditos
  UPDATE solicitudes SET credito_id = NULL WHERE credito_id IS NOT NULL;

  -- 2e-bis. Romper auto-referencia de reestructuras
  UPDATE creditos SET credito_origen_id = NULL WHERE credito_origen_id IS NOT NULL;

  -- 2f. creditos
  DELETE FROM creditos;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_cnt := v_cnt || jsonb_build_object('creditos', v_n);

  -- 2g. solicitudes
  DELETE FROM solicitudes;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_cnt := v_cnt || jsonb_build_object('solicitudes', v_n);

  -- 2h. clientes
  DELETE FROM clientes;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_cnt := v_cnt || jsonb_build_object('clientes', v_n);

  -- 3. Scope ampliado: tasas y parámetros
  IF p_scope = 'con_tasas' THEN
    DELETE FROM rate_catalog;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_cnt := v_cnt || jsonb_build_object('rate_catalog', v_n);
  END IF;

  -- 4. Audit trail (NUNCA se borra; registramos el evento)
  INSERT INTO bitacora (entidad, entidad_id, accion, detalle, usuario)
  VALUES (
    'sistema',
    gen_random_uuid(),
    'vaciar_datos',
    jsonb_build_object('scope', p_scope, 'conteos', v_cnt),
    v_email
  );

  RETURN v_cnt;
END;
$$;

-- Permisos: solo authenticated (el RPC valida rol internamente)
REVOKE EXECUTE ON FUNCTION vaciar_datos(text) FROM anon;
GRANT EXECUTE ON FUNCTION vaciar_datos(text) TO authenticated;
