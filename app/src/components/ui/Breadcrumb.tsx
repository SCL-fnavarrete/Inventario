"use client";

import { type HTMLAttributes, Fragment } from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  showHome?: boolean;
  homeHref?: string;
  separator?: "chevron" | "slash";
}

export function Breadcrumb({
  items,
  showHome = true,
  homeHref = "/",
  separator = "chevron",
  className = "",
  ...props
}: BreadcrumbProps) {
  const allItems: BreadcrumbItem[] = showHome
    ? [{ label: "Inicio", href: homeHref }, ...items]
    : items;

  const SeparatorComponent = () => {
    if (separator === "slash") {
      return (
        <span className="text-gray-300 mx-2" aria-hidden="true">
          /
        </span>
      );
    }
    return (
      <ChevronRight
        className="w-4 h-4 text-gray-400 mx-2 flex-shrink-0"
        aria-hidden="true"
      />
    );
  };

  return (
    <nav
      className={`flex items-center ${className}`}
      aria-label="Breadcrumb"
      {...props}
    >
      <ol className="flex items-center flex-wrap gap-y-1">
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;
          const isFirst = index === 0;
          const isHome = showHome && isFirst;

          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="flex items-center">
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className={`
                      inline-flex items-center gap-1.5
                      text-sm
                      text-gray-500
                      hover:text-gray-900
                      focus:outline-none
                      focus-visible:ring-2
                      focus-visible:ring-blue-500
                      focus-visible:ring-offset-2
                      rounded
                      transition-colors duration-150
                      motion-reduce:transition-none
                    `}
                  >
                    {isHome && (
                      <Home className="w-4 h-4" aria-hidden="true" />
                    )}
                    <span className={isHome ? "sr-only sm:not-sr-only" : ""}>
                      {item.label}
                    </span>
                  </Link>
                ) : (
                  <span
                    className={`
                      inline-flex items-center gap-1.5
                      text-sm
                      font-medium
                      ${isLast ? "text-gray-900" : "text-gray-500"}
                    `}
                    aria-current={isLast ? "page" : undefined}
                  >
                    {isHome && (
                      <Home className="w-4 h-4" aria-hidden="true" />
                    )}
                    <span className={isHome ? "sr-only sm:not-sr-only" : ""}>
                      {item.label}
                    </span>
                  </span>
                )}
              </li>

              {!isLast && <SeparatorComponent />}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

// Versión simplificada para páginas de detalle
interface PageBreadcrumbProps {
  parentLabel: string;
  parentHref: string;
  currentLabel: string;
}

export function PageBreadcrumb({
  parentLabel,
  parentHref,
  currentLabel,
}: PageBreadcrumbProps) {
  return (
    <Breadcrumb
      items={[
        { label: parentLabel, href: parentHref },
        { label: currentLabel },
      ]}
    />
  );
}

// Breadcrumb para sección de activos
export function AssetBreadcrumb({
  assetName,
  section,
}: {
  assetName?: string;
  section?: "nuevo" | "editar" | "detalle";
}) {
  const items: BreadcrumbItem[] = [
    { label: "Activos", href: "/activos" },
  ];

  if (section === "nuevo") {
    items.push({ label: "Nuevo activo" });
  } else if (assetName) {
    if (section === "editar") {
      items.push({ label: assetName, href: "#" });
      items.push({ label: "Editar" });
    } else {
      items.push({ label: assetName });
    }
  }

  return <Breadcrumb items={items} />;
}

// Breadcrumb para sección de empleados
export function EmployeeBreadcrumb({
  employeeName,
  section,
}: {
  employeeName?: string;
  section?: "nuevo" | "editar" | "detalle";
}) {
  const items: BreadcrumbItem[] = [
    { label: "Empleados", href: "/empleados" },
  ];

  if (section === "nuevo") {
    items.push({ label: "Nuevo empleado" });
  } else if (employeeName) {
    if (section === "editar") {
      items.push({ label: employeeName, href: "#" });
      items.push({ label: "Editar" });
    } else {
      items.push({ label: employeeName });
    }
  }

  return <Breadcrumb items={items} />;
}

export default Breadcrumb;
