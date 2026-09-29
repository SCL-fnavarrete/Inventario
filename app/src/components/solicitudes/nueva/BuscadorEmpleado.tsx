"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MensajeCampo } from "@/components/ui/CampoFormulario";
import type { Employee } from "./datos";

/**
 * Busqueda de empleado de Nueva Solicitud (auditoria 28-sep-2026, 3.6).
 * Antes estaba copiada dos veces en la pagina (reincorporacion y cambio de
 * equipo/desvinculacion), con sus 4 estados, 2 refs y la logica de busqueda.
 */

/** Estado de la busqueda: texto, resultados y la lista abierta o no. */
export function useBuscarEmpleado(sedeId: string | null | undefined) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Employee[]>([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Un clic fuera de la busqueda cierra la lista.
  useEffect(() => {
    const cerrarSiEsAfuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarSiEsAfuera);
    return () => document.removeEventListener("mousedown", cerrarSiEsAfuera);
  }, []);

  const buscar = useCallback(
    async (consulta: string) => {
      if (consulta.length < 2) {
        setResultados([]);
        setAbierto(false);
        return;
      }
      setCargando(true);
      try {
        const params = new URLSearchParams({ search: consulta, limit: "15", sortBy: "nombres", sortOrder: "asc" });
        // Acota a la sede del navbar si hay una elegida.
        if (sedeId) params.set("sedeId", sedeId);
        const res = await fetch(`/api/empleados?${params}`);
        if (res.ok) {
          setResultados((await res.json()).data || []);
          setAbierto(true);
        }
      } catch {
        // Sin conexion: la lista queda como estaba; se puede volver a escribir.
      } finally {
        setCargando(false);
      }
    },
    [sedeId]
  );

  /** Guarda el texto y busca 300 ms despues de la ultima tecla. */
  const escribir = (valor: string) => {
    setTexto(valor);
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => buscar(valor), 300);
  };

  /** Deja la busqueda vacia y cerrada (al elegir a alguien). */
  const reiniciar = () => {
    setTexto("");
    setAbierto(false);
  };

  return { texto, escribir, resultados, cargando, abierto, setAbierto, reiniciar, contenedorRef };
}

export type BuscadorEmpleadoEstado = ReturnType<typeof useBuscarEmpleado>;

const nombreCompleto = (e: Employee) =>
  `${e.nombres} ${e.apellidoPaterno}${e.apellidoMaterno ? ` ${e.apellidoMaterno}` : ""}`;

/** Etiqueta chica de estado (solo en la reincorporacion). */
function EtiquetaEstado({ texto, tono }: { texto: string; tono: "ambar" | "gris" }) {
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 text-[10px] font-medium rounded",
        tono === "ambar" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-fg-subtle"
      )}
    >
      {texto}
    </span>
  );
}

/**
 * El empleado elegido (con boton para quitarlo) o, si no hay, la caja de
 * busqueda con sus resultados.
 */
export function BuscadorEmpleado({
  buscador,
  seleccionado,
  onElegir,
  onQuitar,
  error,
  mostrarEstado = false,
  sinResultados,
  ayuda,
}: {
  buscador: BuscadorEmpleadoEstado;
  seleccionado: Employee | null;
  onElegir: (e: Employee) => void;
  onQuitar: () => void;
  error?: string;
  /** Reincorporacion: marca a los desvinculados y a los que ya estan activos. */
  mostrarEstado?: boolean;
  /** Texto cuando la busqueda no encuentra a nadie. */
  sinResultados: string;
  /** Texto de ayuda bajo la caja vacia. */
  ayuda: string;
}) {
  if (seleccionado) {
    return (
      <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg p-3">
        <div>
          <p className="font-medium text-fg flex items-center gap-2">
            {nombreCompleto(seleccionado)}
            {mostrarEstado && seleccionado.estado === "desvinculado" && (
              <EtiquetaEstado texto="Desvinculado — se reactivará" tono="ambar" />
            )}
            {mostrarEstado && seleccionado.estado === "activo" && <EtiquetaEstado texto="Ya está activo" tono="gris" />}
          </p>
          <p className="text-sm text-fg-subtle">
            {seleccionado.rut || "—"} · {seleccionado.correoPersonal ?? seleccionado.correoEmpresa ?? ""}
            {seleccionado.cargo ? ` · ${seleccionado.cargo}` : ""}
          </p>
        </div>
        <button aria-label="Quitar empleado elegido" onClick={onQuitar} className="text-fg-subtle hover:text-fg-muted p-1">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const { texto, escribir, resultados, cargando, abierto, setAbierto, contenedorRef } = buscador;
  return (
    <div ref={contenedorRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
        <input
          type="text"
          aria-label="Buscar empleado"
          placeholder="Buscar por nombre, RUT o correo (mín. 2 caracteres)..."
          value={texto}
          onChange={(e) => escribir(e.target.value)}
          onFocus={() => resultados.length > 0 && setAbierto(true)}
          aria-invalid={!!error}
          className={cn("field-input pl-10 pr-10", error && "border-red-500 bg-red-50")}
        />
        {cargando && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle animate-spin" />
        )}
      </div>

      {abierto && (
        <div className="absolute z-10 mt-1 w-full bg-surface border border-line rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {resultados.length > 0 ? (
            resultados.map((emp) => (
              <button
                key={emp.id}
                onClick={() => onElegir(emp)}
                className="w-full text-left px-4 py-3 hover:bg-primary-50 border-b last:border-b-0 transition-colors"
              >
                <span className="text-sm font-medium text-fg flex items-center gap-2">
                  {nombreCompleto(emp)}
                  {mostrarEstado && emp.estado === "desvinculado" && <EtiquetaEstado texto="Desvinculado" tono="ambar" />}
                </span>
                <span className="flex items-center gap-2 text-xs text-fg-subtle mt-0.5">
                  <span>{emp.rut || "Sin RUT"}</span>
                  <span>·</span>
                  <span>{emp.correoPersonal ?? emp.correoEmpresa ?? ""}</span>
                  {emp.cargo && (
                    <>
                      <span>·</span>
                      <span>{emp.cargo}</span>
                    </>
                  )}
                </span>
              </button>
            ))
          ) : (
            <p className="px-4 py-6 text-center text-sm text-fg-subtle">
              No se encontraron empleados para &quot;{texto}&quot;. {sinResultados}
            </p>
          )}
        </div>
      )}

      <MensajeCampo mensaje={error} />
      {!error && !abierto && texto.length === 0 && <p className="text-xs text-fg-subtle mt-1">{ayuda}</p>}
    </div>
  );
}
