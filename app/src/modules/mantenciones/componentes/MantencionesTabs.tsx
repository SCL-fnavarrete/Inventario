"use client";

import { NavTabs } from "@/shared/ui/Tabs";

// Pestañas del módulo Mantenciones. "Tipos" administra su catálogo editable
// (MaintenanceType en schema.prisma). Los motivos de baja se administran en
// Activos > Catálogos (SPEC 2.116.5).
const TABS = [
  { href: "/mantenciones", label: "Listado" },
  { href: "/mantenciones/calendario", label: "Calendario" },
  { href: "/mantenciones/tipos", label: "Tipos" },
] as const;

export function MantencionesTabs() {
  return <NavTabs tabs={TABS} />;
}
