"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Pestanas del Dashboard: Resumen (KPIs, alertas, graficos) y Reportes
// (11-sep-2026, pedido explicito de Javier: el modulo de Reportes vivia
// como seccion aparte en el menu lateral, con un boton "Ver Reportes" en
// el dashboard para llegar a el; pasa a ser una subpestana del Dashboard,
// siguiendo el mismo patron ya usado en Activos -- ver ActivosTabs). Las
// paginas de detalle de cada reporte (/reportes/inventario, /reportes/
// stock, etc.) no muestran esta barra: ya tienen su propio link "Volver"
// hacia /reportes.
const TABS = [
  { href: "/", label: "Resumen" },
  { href: "/reportes", label: "Reportes" },
] as const;

export function DashboardTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
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
