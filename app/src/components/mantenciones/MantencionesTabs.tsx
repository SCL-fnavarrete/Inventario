"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Pestañas del módulo Mantenciones. "Tipos" administra el catálogo editable
// de tipos de mantención (ver MaintenanceType en schema.prisma).
const TABS = [
  { href: "/mantenciones", label: "Listado" },
  { href: "/mantenciones/calendario", label: "Calendario" },
  { href: "/mantenciones/tipos", label: "Tipos" },
] as const;

export function MantencionesTabs() {
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
