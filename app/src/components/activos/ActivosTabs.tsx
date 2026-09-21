"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Pestanas del modulo Activos: Equipos, Asignaciones, Personal, Kit de
// Bienvenida y EPP. Compartido entre las 5 paginas para no repetir el
// mismo bloque de tabs en cada una.
const TABS = [
  { href: "/activos", label: "Equipos" },
  { href: "/activos/asignaciones", label: "Asignaciones" },
  { href: "/activos/empleados", label: "Personal" },
  { href: "/activos/kit-bienvenida", label: "Kit de Bienvenida" },
  { href: "/activos/epp", label: "EPP" },
] as const;

export function ActivosTabs() {
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
