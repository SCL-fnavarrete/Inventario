-- DropIndex
DROP INDEX "assignments_employee_id_idx";

-- CreateIndex
CREATE INDEX "access_logs_usuario_id_idx" ON "access_logs"("usuario_id");

-- CreateIndex
CREATE INDEX "assignments_employee_id_activo_idx" ON "assignments"("employee_id", "activo");

-- CreateIndex
CREATE INDEX "kit_assignments_employee_id_estado_idx" ON "kit_assignments"("employee_id", "estado");

-- CreateIndex
CREATE INDEX "kit_assignments_item_id_idx" ON "kit_assignments"("item_id");

-- CreateIndex
CREATE INDEX "purchase_assets_asset_id_idx" ON "purchase_assets"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_assets_purchase_id_asset_id_key" ON "purchase_assets"("purchase_id", "asset_id");

-- CreateIndex
CREATE INDEX "workflow_transitions_ejecutado_por_id_idx" ON "workflow_transitions"("ejecutado_por_id");

