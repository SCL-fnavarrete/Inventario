"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-gray-200 overflow-x-auto overflow-y-hidden">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
            pathname === tab.href
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
