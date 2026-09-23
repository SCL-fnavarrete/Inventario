"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Pestañas subrayadas. Activos, Dashboard y Mantenciones tenian cada uno un
// componente identico salvo la lista de rutas, y varias paginas de
// Configuracion repetian las mismas clases en sus tabs por estado.
const tabClasses = (activa: boolean) =>
  cn(
    "-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors",
    activa
      ? "border-accent text-primary-800"
      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
  );

const barra = "flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-200";

/** Pestañas que navegan entre rutas; la activa sale del pathname. */
export function NavTabs({ tabs }: { tabs: readonly { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className={barra}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={tabClasses(pathname === tab.href)}
          aria-current={pathname === tab.href ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/** Pestañas controladas por estado, dentro de una misma pagina. */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className={barra} role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={value === item.key}
          onClick={() => onChange(item.key)}
          className={tabClasses(value === item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
