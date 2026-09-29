"use client";

import { ActivosTabs, AsignacionesTable } from "@/modules/activos/componentes";

// This tab shows the assignments table on its own page, matching the
// pattern used by the other Activos sub-tabs. No page-level header here:
// AsignacionesTable renders its own title/subtitle as its card header.
export default function AsignacionesPage() {
  return (
    <div className="space-y-6">
      {/* Module tabs: Equipos / Asignaciones (this page) / Personal /
          Kit de Bienvenida / EPP (shared across the 5 sub-pages) */}
      <ActivosTabs />

      <AsignacionesTable />
    </div>
  );
}
