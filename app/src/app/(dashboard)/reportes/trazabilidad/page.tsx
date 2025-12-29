"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, History, Laptop, Users, Wrench, FileText } from "lucide-react";

interface HistoryEvent {
  id: string;
  tipoEvento: string;
  descripcion: string;
  createdAt: string;
  usuarioSistema: string | null;
}

interface AssetData {
  id: string;
  numeroSerie: string | null;
  imei: string | null;
  marca: string;
  modelo: string;
  estado: string;
  condicion: string;
  categoria: { nombre: string } | null;
  history: HistoryEvent[];
  assignments: {
    id: string;
    fechaEntrega: string;
    fechaDevolucion: string | null;
    tipoMovimiento: string;
    activo: boolean;
    employee: {
      rut: string;
      nombres: string;
      apellidoPaterno: string;
    };
  }[];
  maintenances: {
    id: string;
    tipo: string;
    descripcion: string;
    fechaProgramada: string | null;
    fechaRealizada: string | null;
    estado: string;
  }[];
}

export default function ReporteTrazabilidadPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError("");
    setAsset(null);

    try {
      const res = await fetch(
        `/api/reportes/trazabilidad?search=${encodeURIComponent(searchTerm)}`
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al buscar");
        return;
      }

      setAsset(data);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const EVENTO_ICONS: Record<string, typeof History> = {
    creacion: FileText,
    asignacion: Users,
    devolucion: Users,
    mantencion: Wrench,
    cambio_estado: History,
    actualizacion_specs: Laptop,
    baja: History,
  };

  const EVENTO_COLORS: Record<string, string> = {
    creacion: "bg-blue-100 text-blue-600",
    asignacion: "bg-green-100 text-green-600",
    devolucion: "bg-orange-100 text-orange-600",
    mantencion: "bg-purple-100 text-purple-600",
    cambio_estado: "bg-yellow-100 text-yellow-600",
    actualizacion_specs: "bg-gray-100 text-gray-600",
    baja: "bg-red-100 text-red-600",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/reportes"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Trazabilidad de Activos
          </h1>
          <p className="text-gray-600">
            Historial completo de movimientos por activo
          </p>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar por Número de Serie o IMEI
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Ej: PF3BXB9T o 354964992749902"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Search className="h-4 w-4" />
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
        )}
      </div>

      {/* Resultados */}
      {asset && (
        <div className="space-y-6">
          {/* Información del Activo */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Información del Activo
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600 font-medium">Categoría</p>
                <p className="font-medium text-gray-900">{asset.categoria?.nombre || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Nº Serie / IMEI</p>
                <p className="font-mono font-medium text-gray-900">
                  {asset.numeroSerie || asset.imei || "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Marca / Modelo</p>
                <p className="font-medium text-gray-900">
                  {asset.marca} {asset.modelo}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Estado Actual</p>
                <p className="font-medium text-gray-900 capitalize">{asset.estado}</p>
              </div>
            </div>
          </div>

          {/* Historial de Asignaciones */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Historial de Asignaciones ({asset.assignments.length})
            </h2>
            {asset.assignments.length === 0 ? (
              <p className="text-gray-600">No hay asignaciones registradas</p>
            ) : (
              <div className="space-y-3">
                {asset.assignments.map((asig, idx) => (
                  <div
                    key={asig.id}
                    className={`flex items-start gap-4 p-4 rounded-lg ${
                      asig.activo ? "bg-green-50 border border-green-200" : "bg-gray-50"
                    }`}
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">
                      {asset.assignments.length - idx}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {asig.employee.nombres} {asig.employee.apellidoPaterno}
                        </span>
                        <span className="text-sm text-gray-700">
                          ({asig.employee.rut})
                        </span>
                        {asig.activo && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                            Actual
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-700 mt-1">
                        <span>
                          Entrega:{" "}
                          {new Date(asig.fechaEntrega).toLocaleDateString("es-CL")}
                        </span>
                        {asig.fechaDevolucion && (
                          <span className="ml-4">
                            Devolución:{" "}
                            {new Date(asig.fechaDevolucion).toLocaleDateString("es-CL")}
                          </span>
                        )}
                        <span className="ml-4 capitalize">({asig.tipoMovimiento})</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historial de Mantenciones */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Historial de Mantenciones ({asset.maintenances.length})
            </h2>
            {asset.maintenances.length === 0 ? (
              <p className="text-gray-600">No hay mantenciones registradas</p>
            ) : (
              <div className="space-y-3">
                {asset.maintenances.map((mant) => (
                  <div
                    key={mant.id}
                    className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="p-2 bg-purple-100 rounded-full">
                      <Wrench className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{mant.tipo}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            mant.estado === "completada"
                              ? "bg-green-100 text-green-800"
                              : mant.estado === "pendiente"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {mant.estado}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{mant.descripcion}</p>
                      <div className="text-sm text-gray-600 mt-1">
                        {mant.fechaProgramada && (
                          <span>
                            Programada:{" "}
                            {new Date(mant.fechaProgramada).toLocaleDateString("es-CL")}
                          </span>
                        )}
                        {mant.fechaRealizada && (
                          <span className="ml-4">
                            Realizada:{" "}
                            {new Date(mant.fechaRealizada).toLocaleDateString("es-CL")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Timeline de Eventos */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Timeline de Eventos ({asset.history.length})
            </h2>
            {asset.history.length === 0 ? (
              <p className="text-gray-600">No hay eventos registrados</p>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                <div className="space-y-4">
                  {asset.history.map((evento) => {
                    const IconComponent = EVENTO_ICONS[evento.tipoEvento] || History;
                    const colorClass =
                      EVENTO_COLORS[evento.tipoEvento] || "bg-gray-100 text-gray-600";

                    return (
                      <div key={evento.id} className="relative flex gap-4 pl-8">
                        <div
                          className={`absolute left-0 p-2 rounded-full ${colorClass}`}
                        >
                          <IconComponent className="h-4 w-4" />
                        </div>
                        <div className="flex-1 bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <span className="font-medium capitalize">
                              {evento.tipoEvento.replace("_", " ")}
                            </span>
                            <span className="text-xs text-gray-600">
                              {new Date(evento.createdAt).toLocaleString("es-CL")}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mt-1">
                            {evento.descripcion}
                          </p>
                          {evento.usuarioSistema && (
                            <p className="text-xs text-gray-600 mt-1">
                              Por: {evento.usuarioSistema}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
