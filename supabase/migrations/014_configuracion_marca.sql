-- =====================================================================
-- Migración 014: Tabla configuracion_marca (singleton) + bucket branding
-- Infraestructura para marca configurable desde BD.
-- Idempotente: usa IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- =====================================================================

-- 1. Tabla singleton --------------------------------------------------

CREATE TABLE IF NOT EXISTS configuracion_marca (
  id              int          PRIMARY KEY DEFAULT 1,
  nombre_empresa  text         NOT NULL DEFAULT 'CapiProm',
  nombre_corto    text         NOT NULL DEFAULT 'CapiProm',
  nombre_producto text         NOT NULL DEFAULT 'CapiProm Credit',
  logo_positivo_url text,
  logo_negativo_url text,
  isotipo_url       text,
  favicon_url       text,
  color_primario  text         DEFAULT '#0a1628',
  color_acento    text         DEFAULT '#c8a45c',
  email_from      text         DEFAULT 'CapiProm Credit <accesos@plinius.mx>',
  updated_at      timestamptz  DEFAULT now(),
  updated_by      text,
  CONSTRAINT singleton CHECK (id = 1)
);

-- Fila seed con defaults
INSERT INTO configuracion_marca (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS --------------------------------------------------------------

ALTER TABLE configuracion_marca ENABLE ROW LEVEL SECURITY;

-- Lectura: authenticated + anon (login necesita leer sin sesión)
CREATE POLICY "marca_select_public" ON configuracion_marca
  FOR SELECT TO authenticated, anon
  USING (true);

-- Escritura: solo super_admin
CREATE POLICY "marca_update_super" ON configuracion_marca
  FOR UPDATE TO authenticated
  USING  (rol_actual() = 'super_admin')
  WITH CHECK (rol_actual() = 'super_admin');

CREATE POLICY "marca_insert_super" ON configuracion_marca
  FOR INSERT TO authenticated
  WITH CHECK (rol_actual() = 'super_admin');

CREATE POLICY "marca_delete_super" ON configuracion_marca
  FOR DELETE TO authenticated
  USING (rol_actual() = 'super_admin');

-- 3. Bucket público 'branding' ----------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública (favicon + logo del login se necesitan sin sesión)
CREATE POLICY "branding_select_public" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'branding');

-- Escritura solo super_admin
CREATE POLICY "branding_insert_super" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND rol_actual() = 'super_admin');

-- Borrado solo super_admin
CREATE POLICY "branding_delete_super" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND rol_actual() = 'super_admin');

-- Update solo super_admin
CREATE POLICY "branding_update_super" ON storage.objects
  FOR UPDATE TO authenticated
  USING  (bucket_id = 'branding' AND rol_actual() = 'super_admin')
  WITH CHECK (bucket_id = 'branding' AND rol_actual() = 'super_admin');
