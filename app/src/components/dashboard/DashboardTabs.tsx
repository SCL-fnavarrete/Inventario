"use client";

import { NavTabs } from "@/components/ui/Tabs";

// Pestanas del Dashboard: Resumen y Reportes (subpestana, mismo patron que
// ActivosTabs). Las paginas de detalle de cada reporte no muestran esta
// barra: ya tienen su propio link "Volver" hacia /reportes.
// La pestana "Reportes" esta oculta temporalmente: el modulo sigue
// existiendo y accesible por URL directa. Descomentar para reactivarla.
const TABS = [
  { href: "/", label: "Resumen" },
  // { href: "/reportes", label: "Reportes" },
] as const;

export function DashboardTabs() {
  return <NavTabs tabs={TABS} />;
}
