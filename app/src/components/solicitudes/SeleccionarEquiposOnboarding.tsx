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
} from "lucide-react";
import {
  especificacionesActivo as especificacionesEtiquetadasActivo,
  especificacionesActivoTexto,
} from "@/lib/utils/assetSpecs";

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
  tieneCargador: boolean;
  tipoLicenciaMicrosoft365: string | null;
};

type CondicionCargador = 'ok' | 'danado' | 'no_aplica';

type Categoria = { id: string; nombre: string };

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

// La lista de campos que se muestran por categoría (con y sin etiqueta)
// vive en @/lib/utils/assetSpecs -- antes estaba duplicada aquí (con
// etiquetas, pero sin Conectividad) y en SeleccionarCambioEquipo (sin
// etiquetas), desincronizadas entre sí. Unificado 14-sep-2026, SPEC 2.19.
const especificacionesEtiquetadas = especificacionesEtiquetadasActivo;
const especificaciones = especificacionesActivoTexto;

/**
 * Selector de equipos disponibles para la etapa "Gestion TI" de una
 * solicitud de onboarding. Por cada categoria de `categoriasRequeridas`
 * (cualquier categoria real de inventario: Notebook, Celular, Monitor,
 * Impresora, Mouse, Teclado, Docking Station, Webcam, Audifonos, etc.)
 * muestra un desplegable con los activos en estado disponible o
 * reutilizable, con sus especificaciones, para elegir cual se entrega.
 * Si una categoria no tiene stock disponible se muestra un mensaje breve
 * en vez del desplegable, en lugar de dejar seleccionar algo inexistente.
 */
export function SeleccionarEquiposOnboarding({
  categoriasRequeridas,
  submitting,
  onSubmit,
}: {
  categoriasRequeridas: string[];
  submitting: boolean;
  onSubmit: (
    assetIds: string[],
    condicionCargador: Record<string, { condicion: CondicionCargador; observaciones?: string }>
  ) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disponiblesPorCategoria, setDisponiblesPorCategoria] = useState<
    Record<string, ActivoDisponible[]>
  >({});
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});
  // Condicion del cargador, guardada por categoria (que en la practica es
  // "Notebook") -- se traduce a assetId recien al enviar, ya que mientras
  // se elige el equipo la clave natural es la categoria.
  const [condicionCargador, setCondicionCargador] = useState<
    Record<string, { condicion: CondicionCargador; observaciones: string }>
  >({});

  const categoriasKey = categoriasRequeridas.join("|");

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setLoading(true);
      setError("");
      try {
        const catRes = await fetch("/api/categorias");
        const catData = await catRes.json();
        const categorias: Categoria[] = catData.data || catData;

        const resultado: Record<string, ActivoDisponible[]> = {};
        for (const nombreCategoria of categoriasRequeridas) {
          const categoria = categorias.find((x) => x.nombre === nombreCategoria);
          if (!categoria) {
            resultado[nombreCategoria] = [];
            continue;
          }
          const [disponiblesRes, reutilizablesRes] = await Promise.all([
            fetch(`/api/activos?categoriaId=${categoria.id}&estado=disponible&limit=100`),
            fetch(`/api/activos?categoriaId=${categoria.id}&estado=reutilizable&limit=100`),
          ]);
          const [disponiblesData, reutilizablesData] = await Promise.all([
            disponiblesRes.json(),
            reutilizablesRes.json(),
          ]);
          resultado[nombreCategoria] = [...(disponiblesData.data || []), ...(reutilizablesData.data || [])];
        }
        if (!cancelado) setDisponiblesPorCategoria(resultado);
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
  }, [categoriasKey]);

  if (categoriasRequeridas.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
        Esta solicitud no marcó ningún equipo como requerido.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm py-6">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando inventario disponible...
      </div>
    );
  }

  // Se permite entrega parcial: alcanza con tener al menos una seleccion para
  // habilitar el boton. Las categorias sin stock o sin elegir todavia quedan
  // pendientes para una proxima entrega, en vez de bloquear todo el paso.
  const cantidadSeleccionada = categoriasRequeridas.filter((c) => seleccion[c]).length;
  const ningunaSeleccion = cantidadSeleccionada === 0;

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {categoriasRequeridas.map((nombreCategoria) => {
        const disponibles = disponiblesPorCategoria[nombreCategoria] || [];
        const seleccionado = disponibles.find((a) => a.id === seleccion[nombreCategoria]);
        return (
          <div key={nombreCategoria} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2 text-gray-700 font-medium">
              {iconoDe(nombreCategoria)}
              {nombreCategoria}
            </div>
            {disponibles.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                No hay equipo disponible de {nombreCategoria.toLowerCase()} en el inventario ahora mismo.
              </p>
            ) : (
              <>
                <select
                  value={seleccion[nombreCategoria] || ""}
                  onChange={(e) =>
                    setSeleccion((prev) => ({ ...prev, [nombreCategoria]: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Seleccionar {nombreCategoria.toLowerCase()}...</option>
                  {disponibles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.marca} {a.modelo} · {a.numeroSerie || "s/serie"}
                      {especificaciones(a) ? ` · ${especificaciones(a)}` : ""}
                    </option>
                  ))}
                </select>
                {seleccionado && (
                  <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                    {especificacionesEtiquetadas(seleccionado).length > 0 ? (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {especificacionesEtiquetadas(seleccionado).map(({ etiqueta, valor }) => (
                          <div key={etiqueta} className="flex gap-1">
                            <dt className="font-medium text-gray-600">{etiqueta}:</dt>
                            <dd>{valor}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      "Sin especificaciones registradas"
                    )}
                  </div>
                )}

                {seleccionado?.tieneCargador && (
                  <div className="mt-2 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-600 mb-2">
                      Estado del cargador
                    </p>
                    <select
                      value={condicionCargador[nombreCategoria]?.condicion || "ok"}
                      onChange={(e) =>
                        setCondicionCargador((prev) => ({
                          ...prev,
                          [nombreCategoria]: {
                            condicion: e.target.value as CondicionCargador,
                            observaciones: prev[nombreCategoria]?.observaciones || "",
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2"
                    >
                      <option value="ok">Ok</option>
                      <option value="danado">Dañado</option>
                      <option value="no_aplica">No aplica / no venía</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Observación (opcional)"
                      value={condicionCargador[nombreCategoria]?.observaciones || ""}
                      onChange={(e) =>
                        setCondicionCargador((prev) => ({
                          ...prev,
                          [nombreCategoria]: {
                            condicion: prev[nombreCategoria]?.condicion || "ok",
                            observaciones: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      <button
        type="button"
        disabled={submitting || ningunaSeleccion}
        onClick={() => {
          const categoriasElegidas = categoriasRequeridas.filter((c) => seleccion[c]);
          const assetIds = categoriasElegidas.map((c) => seleccion[c]);
          // Se traduce de categoria -> assetId recien aca, que es el momento
          // en que ambos datos (cual activo, que condicion de cargador) ya
          // estan resueltos.
          const condicionCargadorPorAsset: Record<
            string,
            { condicion: CondicionCargador; observaciones?: string }
          > = {};
          for (const categoria of categoriasElegidas) {
            const cond = condicionCargador[categoria];
            if (cond) {
              condicionCargadorPorAsset[seleccion[categoria]] = {
                condicion: cond.condicion,
                observaciones: cond.observaciones || undefined,
              };
            }
          }
          onSubmit(assetIds, condicionCargadorPorAsset);
        }}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Entregando...
          </>
        ) : cantidadSeleccionada > 0 && cantidadSeleccionada < categoriasRequeridas.length ? (
          `Entregar ${cantidadSeleccionada} de ${categoriasRequeridas.length} equipos`
        ) : (
          "Entregar equipos"
        )}
      </button>
    </div>
  );
}
