"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Pestañas del módulo Mantenciones. "Tipos" se agregó (9-sep-2026) cuando
// los tipos de mantención (antes un enum fijo) pasaron a ser un catálogo
// editable por admin y técnico -- ver MaintenanceType en schema.prisma y
// el recurso de permisos "tiposMantencion". No se agrega a "Programar" ni
// a la ficha de detalle, mismo criterio que ActivosTabs (que tampoco vive
// en activos/nuevo).
const TABS = [
  { href: "/mantenciones", label: "Listado" },
  { href: "/mantenciones/calendario", label: "Calendario" },
  { href: "/mantenciones/tipos", label: "Tipos" },
] as const;

export function MantencionesTabs() {
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
