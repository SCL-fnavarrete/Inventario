"use client";

import { NavTabs } from "@/components/ui/Tabs";

// Pestañas del módulo Mantenciones. "Tipos" y "Motivos de baja" administran
// sus catálogos editables (MaintenanceType y MotivoBaja en schema.prisma).
const TABS = [
  { href: "/mantenciones", label: "Listado" },
  { href: "/mantenciones/calendario", label: "Calendario" },
  { href: "/mantenciones/tipos", label: "Tipos" },
  { href: "/mantenciones/motivos-baja", label: "Motivos de baja" },
] as const;

export function MantencionesTabs() {
  return <NavTabs tabs={TABS} />;
}
