"use client";

import { NavTabs } from "@/components/ui/Tabs";

// Pestañas del módulo Mantenciones. "Tipos" administra el catálogo editable
// de tipos de mantención (ver MaintenanceType en schema.prisma).
const TABS = [
  { href: "/mantenciones", label: "Listado" },
  { href: "/mantenciones/calendario", label: "Calendario" },
  { href: "/mantenciones/tipos", label: "Tipos" },
] as const;

export function MantencionesTabs() {
  return <NavTabs tabs={TABS} />;
}
