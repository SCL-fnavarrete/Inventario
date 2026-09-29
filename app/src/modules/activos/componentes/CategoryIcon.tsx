import { createElement, type ComponentType } from "react";
import { Headphones, Laptop, Monitor, Mouse, Package, Printer, Smartphone } from "lucide-react";
import { cn } from "@/shared/cn";

type IconComponent = ComponentType<{ className?: string }>;

// Coincidencia parcial y sin mayusculas: "Notebook Lenovo" o "CELULAR" caen
// en su icono. Antes habia 12 copias; las de `switch` exacto mostraban el
// icono generico para esas mismas categorias.
const ICONOS: [string, IconComponent][] = [
  ["notebook", Laptop],
  ["laptop", Laptop],
  ["celular", Smartphone],
  ["telefono", Smartphone],
  ["smartphone", Smartphone],
  ["monitor", Monitor],
  ["mouse", Mouse],
  ["audifono", Headphones],
  ["impresora", Printer],
  ["printer", Printer],
];

export function iconoDeCategoria(categoria: string): IconComponent {
  const nombre = categoria.toLowerCase();
  return ICONOS.find(([clave]) => nombre.includes(clave))?.[1] ?? Package;
}

/**
 * Icono de la categoria de un activo. createElement en vez de
 * `const Icon = ...; <Icon />` para no declarar un componente durante el
 * render (regla del compilador de React): la referencia sale de un mapa de
 * modulo y es estable.
 */
export function CategoryIcon({
  categoria,
  className,
}: {
  categoria: string;
  className?: string;
}) {
  return createElement(iconoDeCategoria(categoria), { className: cn("h-5 w-5", className) });
}

export default CategoryIcon;
