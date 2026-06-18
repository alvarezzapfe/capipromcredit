-- =====================================================================
-- Migración 008: Restringir INSERT/UPDATE/DELETE de rate_catalog a super_admin
-- Antes: puede_escribir() = super_admin OR admin
-- Ahora: solo super_admin puede modificar el catálogo de tasas
-- =====================================================================

-- Drop the old permissive write policy
DROP POLICY IF EXISTS "rate_catalog_write_admin" ON rate_catalog;

-- New: only super_admin can INSERT
CREATE POLICY "rate_catalog_insert_super" ON rate_catalog
  FOR INSERT TO authenticated
  WITH CHECK (rol_actual() = 'super_admin');

-- New: only super_admin can UPDATE
CREATE POLICY "rate_catalog_update_super" ON rate_catalog
  FOR UPDATE TO authenticated
  USING (rol_actual() = 'super_admin')
  WITH CHECK (rol_actual() = 'super_admin');

-- New: only super_admin can DELETE
CREATE POLICY "rate_catalog_delete_super" ON rate_catalog
  FOR DELETE TO authenticated
  USING (rol_actual() = 'super_admin');

-- SELECT stays open to all authenticated (unchanged from migration 003)
