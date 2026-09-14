"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Laptop,
  Wrench,
  ShoppingCart,
  Settings,
  LogOut,
  Menu,
  X,
  FileText,
  ClipboardList,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";
import type { Recurso } from "@/lib/auth/permissions";
import type { LucideIcon } from "lucide-react";

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
};

// Cada entrada declara el recurso de la matriz de permisos que representa, en
// vez de una lista de roles propia. Asi el menu y la API salen de la misma
// fuente: si aqui aparece "Compras", GET /api/compras no va a responder 403.
//
// "Reportes" ya no tiene entrada propia (11-sep-2026, SPEC 2.15): paso a ser
// una subpestana del Dashboard (ver DashboardTabs), mismo patron que Personal/
// Kit de Bienvenida/EPP dentro de Activos, que tampoco tienen entrada aca. El
// recurso "reportes" de la matriz de permisos sigue siendo el mismo -- solo
// cambio el punto de entrada en la UI.
const menuItems: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  recurso: Recurso;
}> = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, recurso: "reportes" },
  { href: "/activos", label: "Activos", icon: Laptop, recurso: "activos" },
  { href: "/solicitudes", label: "Solicitudes", icon: ClipboardList, recurso: "solicitudes" },
  { href: "/guias-despacho", label: "Guias de Despacho", icon: FileText, recurso: "guias" },
  { href: "/mantenciones", label: "Mantenciones", icon: Wrench, recurso: "mantenciones" },
  { href: "/compras", label: "Compras", icon: ShoppingCart, recurso: "compras" },
  { href: "/configuracion", label: "Configuracion", icon: Settings, recurso: "configuracion" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { puedeVer } = usePermissions();
  const [isOpen, setIsOpen] = useState(false);
  const { sedeSeleccionada, setSedeSeleccionada } = useSedeSeleccionada();
  const [sedes, setSedes] = useState<Sede[]>([]);

  const userRole = session?.user?.role || "user";
  const userName = session?.user?.name || "Usuario";

  // Selector de sede global (SPEC 2.29): filtra los listados de cualquier
  // pantalla, sin importar el rol -- desde este cambio tecnico tambien ve
  // todas las sedes por defecto (sedeScope.ts), este selector es lo que le
  // permite acotar la vista a una sede a la vez si quiere.
  useEffect(() => {
    fetch("/api/sedes?activas=true")
      .then((res) => res.json())
      .then((data) => setSedes(Array.isArray(data) ? data : []))
      .catch(() => setSedes([]));
  }, []);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-200 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-slate-700">
            <Image
              src="/logo-scl.png"
              alt="SCL Consultores"
              width={220}
              height={110}
              className="w-full h-auto rounded-lg"
              priority
            />
          </div>

          {/* Selector de sede (SPEC 2.29): filtra los listados de todos los
              módulos a una sede a la vez, o "Todas las sedes" (sin filtro). */}
          <div className="px-4 pt-4">
            <label htmlFor="selector-sede" className="block text-xs font-medium text-slate-400 mb-1">
              Sede
            </label>
            <select
              id="selector-sede"
              value={sedeSeleccionada ?? ""}
              onChange={(e) => setSedeSeleccionada(e.target.value || null)}
              className="w-full px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todas las sedes</option>
              {sedes.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {sede.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {menuItems
              .filter((item) => puedeVer(item.recurso))
              .map((item) => {
              // El item "Dashboard" (href "/") tambien queda activo en
              // /reportes: Reportes es una subpestana suya (ver
              // DashboardTabs), no una seccion propia del menu.
              const isActive = pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href)) ||
                (item.href === "/" && pathname.startsWith("/reportes"));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-slate-700">
            <div className="px-4 py-2">
              <p className="font-medium truncate">{userName}</p>
              <p className="text-sm text-slate-400 capitalize">{userRole}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-3 w-full px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
            >
              <LogOut size={20} />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
