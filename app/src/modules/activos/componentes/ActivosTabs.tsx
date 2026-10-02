"use client";

import { NavTabs } from "@/shared/ui/Tabs";

// Pestanas del modulo Activos: Equipos, Asignaciones, Personal, Kit de
// Bienvenida, EPP y Lineas. Compartido entre las 6 paginas para no repetir el
// mismo bloque de tabs en cada una.
const TABS = [
  { href: "/activos", label: "Equipos" },
  { href: "/activos/asignaciones", label: "Asignaciones" },
  { href: "/activos/empleados", label: "Personal" },
  { href: "/activos/kit-bienvenida", label: "Kit de Bienvenida" },
  { href: "/activos/epp", label: "EPP" },
  { href: "/activos/lineas", label: "Líneas" },
] as const;

export function ActivosTabs() {
  return <NavTabs tabs={TABS} />;
}
