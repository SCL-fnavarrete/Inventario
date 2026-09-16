"use client";

import { useEffect, useState } from "react";
import {
  Laptop,
  Smartphone,
  Monitor,
  Headphones,
  Printer,
  Mouse,
  Keyboard,
  Webcam,
  HardDrive,
  Package,
  Loader2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { especificacionesActivoTexto } from "@/lib/utils/assetSpecs";

type AsignacionActiva = {
  id: string;
  activo: boolean;
  asset: {
    id: string;
    marca: string;
    modelo: string;
    numeroSerie: string | null;
    categoria: { nombre: string };
    tieneCargador: boolean;
  };
};

type ActivoDisponible = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  imei: string | null;
  numeroTelefono: string | null;
  tipoPlan: string | null;
  pulgadas: string | number | null;
  conectividad: string | null;
  tipoLicenciaMicrosoft365: string | null;
  tieneCargador: boolean;
};

type Categoria = { id: string; nombre: string };

// Seleccion completa (equipo viejo + estado en que vuelve + equipo nuevo).
// La usa el padre en modo embebido (ver prop onChange abajo) para mandarla
// como parte de un submit mas grande -- p.ej. al crear el ticket completo
// desde /solicitudes/nueva.
export type SeleccionCambioEquipo = {
  oldAssignmentId: string;
  newAssetId: string;
  estadoDevolucion: "ok" | "danado" | "no_devuelto";
  observaciones: string;
  // Condicion del cargador (16-sep-2026, SPEC 2.48) -- solo tiene sentido
  // si el equipo correspondiente es un notebook con tieneCargador; para el
  // resto queda "" (el padre lo manda como null/undefined). "Anterior" es
  // el cargador del equipo que se devuelve, "Nuevo" el del reemplazo.
  condicionCargadorAnterior: "ok" | "danado" | "no_aplica" | "";
  observacionesCargadorAnterior: string;
  condicionCargadorNuevo: "ok" | "danado" | "no_aplica" | "";
  observacionesCargadorNuevo: string;
};

const ICONOS: Record<string, React.ReactNode> = {
  Notebook: <Laptop className="h-4 w-4" />,
  Celular: <Smartphone className="h-4 w-4" />,
  Monitor: <Monitor className="h-4 w-4" />,
  "Audífonos": <Headphones className="h-4 w-4" />,
  Impresora: <Printer className="h-4 w-4" />,
  Mouse: <Mouse className="h-4 w-4" />,
  Teclado: <Keyboard className="h-4 w-4" />,
  Webcam: <Webcam className="h-4 w-4" />,
  "Docking Station": <HardDrive className="h-4 w-4" />,
};

function iconoDe(nombre: string): React.ReactNode {
  return ICONOS[nombre] || <Package className="h-4 w-4" />;
}

// La lista de campos que se muestran por categoría vive en
// especificacionesActivoTexto (@/lib/utils/assetSpecs) -- antes estaba
// duplicada aquí (sin Conectividad, y sin etiquetas) y en
// SeleccionarEquiposOnboarding (con etiquetas), desincronizadas entre sí.
// Unificado 14-sep-2026, SPEC 2.19.
const especificaciones = especificacionesActivoTexto;

/**
 * Selector de "Cambio de Equipo". Funciona en dos pasos: primero el tecnico
 * elige cual de los equipos actualmente asignados al empleado se va a
 * cambiar, y una vez elegido, el componente busca en el inventario que hay
 * disponible de esa misma categoria para elegir el reemplazo.
 *
 * Tiene dos modos de uso:
 * - Standalone (default, showSubmitButton=true): trae su propio boton
 *   "Ejecutar cambio" que llama a onSubmit. Lo usa el detalle del ticket en
 *   la etapa "Incidencia Detectada".
 * - Embebido (showSubmitButton=false): no muestra boton propio -- reporta la
 *   seleccion completa (o null si esta incompleta) via onChange cada vez que
 *   cambia, para que el padre la junte con el resto de un formulario mas
 *   grande. Lo usa /solicitudes/nueva al crear el ticket.
 */
export function SeleccionarCambioEquipo({
  asignacionesActivas,
  sedeId,
  submitting,
  onSubmit,
  showSubmitButton = true,
  onChange,
}: {
  asignacionesActivas: AsignacionActiva[];
  /**
   * Sede de la SOLICITUD: solo se ofrecen equipos de esa bodega. Ver
   * SPEC 2.40.
   */
  sedeId?: string | null;
  submitting: boolean;
  onSubmit?: (
    oldAssignmentId: string,
    newAssetId: string,
    estadoDevolucion: "ok" | "danado" | "no_devuelto",
    observaciones: string,
    condicionCargadorAnterior: "ok" | "danado" | "no_aplica" | "",
    observacionesCargadorAnterior: string,
    condicionCargadorNuevo: "ok" | "danado" | "no_aplica" | "",
    observacionesCargadorNuevo: string
  ) => void;
  showSubmitButton?: boolean;
  onChange?: (seleccion: SeleccionCambioEquipo | null) => void;
}) {
  const [oldAssignmentId, setOldAssignmentId] = useState("");
  const [newAssetId, setNewAssetId] = useState("");
  const [estadoDevolucion, setEstadoDevolucion] = useState<"ok" | "danado" | "no_devuelto" | "">("");
  const [observaciones, setObservaciones] = useState("");
  // Condicion del cargador (16-sep-2026, SPEC 2.48).
  const [condicionCargadorAnterior, setCondicionCargadorAnterior] = useState<"ok" | "danado" | "no_aplica" | "">("");
  const [observacionesCargadorAnterior, setObservacionesCargadorAnterior] = useState("");
  const [condicionCargadorNuevo, setCondicionCargadorNuevo] = useState<"ok" | "danado" | "no_aplica" | "">("");
  const [observacionesCargadorNuevo, setObservacionesCargadorNuevo] = useState("");
  const [disponibles, setDisponibles] = useState<ActivoDisponible[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activas = asignacionesActivas.filter((a) => a.activo);
  const seleccionada = activas.find((a) => a.id === oldAssignmentId);

  useEffect(() => {
    setNewAssetId("");
    setDisponibles([]);
    setEstadoDevolucion("");
    setObservaciones("");
    setCondicionCargadorAnterior("");
    setObservacionesCargadorAnterior("");
    setCondicionCargadorNuevo("");
    setObservacionesCargadorNuevo("");
    if (!seleccionada) return;

    let cancelado = false;
    async function cargar() {
      setLoading(true);
      setError("");
      try {
        const catRes = await fetch("/api/categorias");
        const catData = await catRes.json();
        const categorias: Categoria[] = catData.data || catData;
        const categoria = categorias.find(
          (c) => c.nombre === seleccionada!.asset.categoria.nombre
        );
        if (!categoria) {
          if (!cancelado) setDisponibles([]);
          return;
        }
        const params = new URLSearchParams({
          categoriaId: categoria.id,
          estado: "disponible",
          limit: "100",
        });
        // Solo el inventario de la sede de la solicitud (SPEC 2.40).
        if (sedeId) params.set("sedeId", sedeId);
        const disponiblesRes = await fetch(`/api/activos?${params}`);
        const disponiblesData = await disponiblesRes.json();
        if (!cancelado) {
          setDisponibles(disponiblesData.data || []);
        }
      } catch {
        if (!cancelado) setError("No se pudo cargar el inventario disponible");
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldAssignmentId, sedeId]);

  // Modo embebido: cada vez que cambia algo de la seleccion, se informa al
  // padre la seleccion completa, o null si todavia falta algo. onChange es
  // el setter de estado del padre (referencia estable), asi que no hace
  // falta incluirlo en las dependencias.
  useEffect(() => {
    if (!onChange) return;
    if (oldAssignmentId && newAssetId && estadoDevolucion) {
      onChange({
        oldAssignmentId,
        newAssetId,
        estadoDevolucion,
        observaciones,
        condicionCargadorAnterior,
        observacionesCargadorAnterior,
        condicionCargadorNuevo,
        observacionesCargadorNuevo,
      });
    } else {
      onChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    oldAssignmentId,
    newAssetId,
    estadoDevolucion,
    observaciones,
    condicionCargadorAnterior,
    observacionesCargadorAnterior,
    condicionCargadorNuevo,
    observacionesCargadorNuevo,
  ]);

  if (activas.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
        Este empleado no tiene equipos asignados actualmente para cambiar.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Paso 1: elegir que equipo se va a cambiar */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          1. ¿Qué equipo vas a cambiar?
        </label>
        <select
          value={oldAssignmentId}
          onChange={(e) => setOldAssignmentId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Seleccionar equipo actual...</option>
          {activas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.asset.categoria.nombre} · {a.asset.marca} {a.asset.modelo} ·{" "}
              {a.asset.numeroSerie || "s/serie"}
            </option>
          ))}
        </select>
      </div>

      {/* Estado en que se devuelve el equipo viejo: sin esto, todo cambio
          quedaba registrado como "buen estado" sin preguntar, sin importar
          que el motivo del cambio fuera justamente que el equipo esta
          danado o no aparece. */}
      {seleccionada && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ¿En qué estado devuelve el equipo actual?
          </label>
          <div className="flex gap-4 text-sm text-gray-700 mb-2">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="estadoDevolucionCambio"
                checked={estadoDevolucion === "ok"}
                onChange={() => setEstadoDevolucion("ok")}
              />
              Buen estado
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="estadoDevolucionCambio"
                checked={estadoDevolucion === "danado"}
                onChange={() => setEstadoDevolucion("danado")}
              />
              Dañado
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="estadoDevolucionCambio"
                checked={estadoDevolucion === "no_devuelto"}
                onChange={() => setEstadoDevolucion("no_devuelto")}
              />
              No devolvió
            </label>
          </div>
          <input
            type="text"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Observaciones (opcional)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      )}

      {/* Estado del cargador del equipo que se devuelve (16-sep-2026, SPEC
          2.48) -- solo si el equipo es un notebook con cargador. No afecta
          el estado del equipo ni gatilla baja, es puramente informativo
          para el acta (SPEC 2.5.3 regla 9). */}
      {seleccionada && seleccionada.asset.tieneCargador && (
        <div className="border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-600 mb-2">
            Estado del cargador que devuelve
          </p>
          <select
            value={condicionCargadorAnterior || "ok"}
            onChange={(e) =>
              setCondicionCargadorAnterior(e.target.value as "ok" | "danado" | "no_aplica")
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2"
          >
            <option value="ok">Ok</option>
            <option value="danado">Dañado</option>
            <option value="no_aplica">No aplica / no lo devolvió</option>
          </select>
          <input
            type="text"
            value={observacionesCargadorAnterior}
            onChange={(e) => setObservacionesCargadorAnterior(e.target.value)}
            placeholder="Observación del cargador (opcional)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      )}

      {/* Paso 2: elegir el reemplazo, solo aparece una vez elegido el paso 1 */}
      {seleccionada && (
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2 text-gray-700 font-medium">
            {iconoDe(seleccionada.asset.categoria.nombre)}
            2. Nuevo {seleccionada.asset.categoria.nombre}
            <ArrowRight className="h-4 w-4 text-gray-400" />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando inventario disponible...
            </div>
          ) : disponibles.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              No hay equipo disponible de {seleccionada.asset.categoria.nombre.toLowerCase()} en
              el inventario ahora mismo.
              {/* 16-sep-2026 (SPEC 2.45): en modo embebido (creacion del
                  ticket) elegir equipo ya no es opcional -- sin reemplazo
                  disponible, la solicitud simplemente no se puede crear
                  todavia, en vez de nacer sin el cambio hecho. */}
              {!showSubmitButton && ' No podrás crear la solicitud hasta que haya stock.'}
            </p>
          ) : (
            <>
              <select
                value={newAssetId}
                onChange={(e) => setNewAssetId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Seleccionar equipo nuevo...</option>
                {disponibles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.marca} {a.modelo} · {a.numeroSerie || "s/serie"}
                    {especificaciones(a) ? ` · ${especificaciones(a)}` : ""}
                  </option>
                ))}
              </select>
              {disponibles.find((a) => a.id === newAssetId) && (
                <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                  {especificaciones(disponibles.find((a) => a.id === newAssetId)!) ||
                    "Sin especificaciones registradas"}
                </div>
              )}
              {/* Estado del cargador del equipo nuevo (16-sep-2026, SPEC
                  2.48) -- mismo criterio que en la entrega de Onboarding. */}
              {disponibles.find((a) => a.id === newAssetId)?.tieneCargador && (
                <div className="mt-2 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    Estado del cargador del equipo nuevo
                  </p>
                  <select
                    value={condicionCargadorNuevo || "ok"}
                    onChange={(e) =>
                      setCondicionCargadorNuevo(e.target.value as "ok" | "danado" | "no_aplica")
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2"
                  >
                    <option value="ok">Ok</option>
                    <option value="danado">Dañado</option>
                    <option value="no_aplica">No aplica / no viene con cargador</option>
                  </select>
                  <input
                    type="text"
                    value={observacionesCargadorNuevo}
                    onChange={(e) => setObservacionesCargadorNuevo(e.target.value)}
                    placeholder="Observación del cargador (opcional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showSubmitButton && (
        <button
          type="button"
          disabled={submitting || !oldAssignmentId || !newAssetId || !estadoDevolucion}
          onClick={() =>
            estadoDevolucion &&
            onSubmit?.(
              oldAssignmentId,
              newAssetId,
              estadoDevolucion,
              observaciones,
              condicionCargadorAnterior,
              observacionesCargadorAnterior,
              condicionCargadorNuevo,
              observacionesCargadorNuevo
            )
          }
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Ejecutando cambio...
            </>
          ) : (
            "Ejecutar cambio"
          )}
        </button>
      )}
    </div>
  );
}
