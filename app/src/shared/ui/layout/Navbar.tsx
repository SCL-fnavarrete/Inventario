"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Laptop,
  Wrench,
  ShoppingCart,
  Settings,
  LogOut,
  BookOpen,
  Menu,
  X,
  Truck,
  ClipboardList,
  MapPin,
  ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/shared/cn";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useSedeSeleccionada } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import { Logo } from "@/shared/ui/Logo";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import type { Recurso } from "@/shared/auth/permisos";
import type { LucideIcon } from "lucide-react";

// Manual de usuario: pagina estatica en public/manual (SPEC 2.129).
const MANUAL = "/manual/index.html";

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
};

// Cada entrada declara el recurso de la matriz de permisos que representa, en
// vez de una lista de roles propia. Asi el menu y la API salen de la misma
// fuente: si aqui aparece "Compras", GET /api/compras no va a responder 403.
// Personal/Kit de Bienvenida/EPP no tienen entrada propia: son pestanas de
// Activos (ActivosTabs).
const menuItems: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  recurso: Recurso;
}> = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, recurso: "reportes" },
  { href: "/activos", label: "Activos", icon: Laptop, recurso: "activos" },
  { href: "/solicitudes", label: "Solicitudes", icon: ClipboardList, recurso: "solicitudes" },
  { href: "/despachos", label: "Despachos", icon: Truck, recurso: "guias" },
  { href: "/mantenciones", label: "Mantenciones", icon: Wrench, recurso: "mantenciones" },
  { href: "/compras", label: "Compras de activos", icon: ShoppingCart, recurso: "compras" },
  { href: "/configuracion", label: "Configuración", icon: Settings, recurso: "configuracion" },
];

function estaActivo(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Scroll leido como store externo: el navbar pasa de transparente a
// "vidrio" (blur + borde) apenas la pagina se desplaza.
function suscribirScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const leerScroll = () => window.scrollY > 8;
const scrollServidor = () => false;

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/**
 * Barra de navegacion superior (patron de velt.dev): sticky, transparente
 * arriba y con fondo translucido + blur al hacer scroll. Bajo xl los items
 * pasan a un panel desplegable.
 */
export function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { puedeVer } = usePermissions();
  const { sedeSeleccionada, setSedeSeleccionada } = useSedeSeleccionada();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const menuUsuarioRef = useRef<HTMLDivElement>(null);
  const conScroll = useSyncExternalStore(suscribirScroll, leerScroll, scrollServidor);

  const userRole = session?.user?.role || "user";
  const userName = session?.user?.name || "Usuario";
  const items = menuItems.filter((item) => puedeVer(item.recurso));

  // Selector de sede global: filtra los listados de cualquier pantalla y
  // permite acotar la vista a una sede a la vez.
  useEffect(() => {
    fetch("/api/sedes?activas=true")
      .then((res) => res.json())
      .then((data) => setSedes(Array.isArray(data) ? data : []))
      .catch(() => setSedes([]));
  }, []);

  // Menu de usuario: se cierra con click afuera o Escape.
  useEffect(() => {
    if (!menuUsuarioAbierto) return;
    const alClickear = (e: MouseEvent) => {
      if (!menuUsuarioRef.current?.contains(e.target as Node)) setMenuUsuarioAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuUsuarioAbierto(false);
    };
    document.addEventListener("mousedown", alClickear);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alClickear);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [menuUsuarioAbierto]);

  // Todos eligen sede o "Todas" (SPEC 2.117): es solo un filtro.
  const selectorSede = (id: string, className?: string) => (
    <div className={cn("relative", className)}>
      <MapPin
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-600"
        aria-hidden="true"
      />
      <select
        id={id}
        aria-label="Sede"
        value={sedeSeleccionada ?? ""}
        onChange={(e) => setSedeSeleccionada(e.target.value || null)}
        className="w-full appearance-none rounded-full border border-line bg-surface py-1.5 pl-9 pr-8 text-sm font-medium text-fg transition-colors hover:border-line-strong focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25"
      >
        <option value="">Todas las sedes</option>
        {sedes.map((sede) => (
          <option key={sede.id} value={sede.id}>
            {sede.nombre}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        aria-hidden="true"
      />
    </div>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300",
        conScroll || menuMovilAbierto
          ? "border-line bg-surface/75 shadow-[0_8px_24px_-12px_rgb(0_43_77/0.18)] backdrop-blur-md"
          : "border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-4 px-4 lg:px-8">
        <Link href="/" aria-label="Ir al Dashboard" className="shrink-0 rounded-control">
          <Logo className="h-8" priority />
        </Link>

        <nav aria-label="Principal" className="hidden flex-1 justify-center xl:flex">
          <ul className="flex items-center gap-1">
            {items.map((item) => {
              const activo = estaActivo(item.href, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={activo ? "page" : undefined}
                    className={cn(
                      "relative flex items-center rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                      activo
                        ? "bg-primary-50 text-primary-700 after:absolute after:-bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-accent"
                        : "text-fg-muted hover:bg-surface-muted hover:text-fg"
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:ml-0">
          {selectorSede("selector-sede", "hidden w-48 md:block")}
          <ThemeToggle />

          <div ref={menuUsuarioRef} className="relative hidden xl:block">
            <button
              type="button"
              onClick={() => setMenuUsuarioAbierto((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuUsuarioAbierto}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              {/* Texto para lectores en vez de aria-label: el nombre accesible
                  debe incluir lo visible (las iniciales). */}
              {iniciales(userName) || "U"}
              <span className="sr-only">, menú de {userName}</span>
            </button>
            {menuUsuarioAbierto && (
              <div
                role="menu"
                className="card absolute right-0 mt-2 w-60 animate-fade-in overflow-hidden p-1 shadow-card-hover"
              >
                <div className="px-3 py-2">
                  <p className="truncate font-medium text-fg">{userName}</p>
                  <p className="text-sm capitalize text-fg-subtle">{userRole}</p>
                </div>
                <div className="my-1 border-t border-line" />
                <a
                  href={MANUAL}
                  target="_blank"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
                >
                  <BookOpen className="h-4 w-4" />
                  Manual de usuario
                </a>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenuMovilAbierto((v) => !v)}
            aria-expanded={menuMovilAbierto}
            aria-controls="menu-movil"
            aria-label={menuMovilAbierto ? "Cerrar menú" : "Abrir menú"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-muted xl:hidden"
          >
            {menuMovilAbierto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuMovilAbierto && (
        <div
          id="menu-movil"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line px-4 pb-4 xl:hidden"
        >
          {selectorSede("selector-sede-movil", "mt-3 md:hidden")}
          <nav aria-label="Principal" className="mt-3">
            <ul className="space-y-1">
              {items.map((item) => {
                const activo = estaActivo(item.href, pathname);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMenuMovilAbierto(false)}
                      aria-current={activo ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-control px-3 py-2.5 font-medium transition-colors",
                        activo
                          ? "bg-primary-50 text-primary-700"
                          : "text-fg-muted hover:bg-surface-muted hover:text-fg"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{userName}</p>
              <p className="text-sm capitalize text-fg-subtle">{userRole}</p>
              <a href={MANUAL} target="_blank" className="text-sm text-brand hover:underline">
                Manual de usuario
              </a>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2 rounded-control px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
