-- =====================================================================
-- Migración 007: Bucket privado 'respaldos' para backups en la nube
-- Solo admin/super_admin pueden leer, subir y borrar.
-- =====================================================================

-- 1. Crear bucket privado
INSERT INTO storage.buckets (id, name, public)
VALUES ('respaldos', 'respaldos', false)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS: SELECT solo admin/super_admin
CREATE POLICY "respaldos_select_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'respaldos' AND rol_actual() IN ('admin', 'super_admin'));

-- 3. RLS: INSERT solo admin/super_admin
CREATE POLICY "respaldos_insert_admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'respaldos' AND rol_actual() IN ('admin', 'super_admin'));

-- 4. RLS: DELETE solo admin/super_admin
CREATE POLICY "respaldos_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'respaldos' AND rol_actual() IN ('admin', 'super_admin'));
