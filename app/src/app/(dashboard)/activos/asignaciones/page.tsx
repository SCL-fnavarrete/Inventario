"use client";

import { ActivosTabs, AsignacionesTable } from "@/components/activos";

// Antes esta tabla vivia embebida al fondo de /activos (Equipos), como una
// segunda tabla debajo del listado principal. Javier pidio sacarla de ahi y
// darle su propia pestana (11-sep-2026), igual que Personal/Kit de
// Bienvenida/EPP -- "seria mucho mas ordenado". El componente
// (AsignacionesTable) no cambio, solo donde vive.
//
// Sin header propio de pagina (a diferencia de /activos/empleados): el
// title "Asignaciones" + subtitulo ya vive dentro de AsignacionesTable como
// encabezado de su tarjeta -- agregar otro h1 arriba lo hubiera duplicado.
// Mismo patron que /activos/epp y /activos/kit-bienvenida con
// KitEppCategoriaView.
export default function AsignacionesPage() {
  return (
    <div className="space-y-6">
      {/* Tabs del modulo: Equipos / Asignaciones (esta pagina) / Personal /
          Kit de Bienvenida / EPP (ver ActivosTabs -- compartido entre las 5) */}
      <ActivosTabs />

      <AsignacionesTable />
    </div>
  );
}
