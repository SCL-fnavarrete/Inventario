"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Laptop,
  Users,
  Wrench,
  FileText,
  Package,
  CheckCircle2,
  XCircle,
  Loader2
} from "lucide-react";

type DataCounts = {
  activos: number;
  empleados: number;
  asignaciones: number;
  mantenciones: number;
  historial: number;
  compras: number;
  desvinculaciones: number;
};

type DeleteOption = {
  id: keyof DataCounts;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  warning: string;
};

const deleteOptions: DeleteOption[] = [
  {
    id: "activos",
    label: "Activos",
    description: "Eliminar todos los activos del sistema",
    icon: Laptop,
    color: "text-blue-600 bg-blue-100",
    warning: "Esto eliminará todos los equipos, incluyendo su historial y asignaciones relacionadas.",
  },
  {
    id: "empleados",
    label: "Empleados",
    description: "Eliminar todos los empleados del sistema",
    icon: Users,
    color: "text-green-600 bg-green-100",
    warning: "Esto eliminará todos los empleados y sus asignaciones relacionadas.",
  },
  {
    id: "asignaciones",
    label: "Asignaciones",
    description: "Eliminar todas las asignaciones",
    icon: FileText,
    color: "text-purple-600 bg-purple-100",
    warning: "Esto eliminará el historial de asignaciones. Los activos volverán a estado disponible.",
  },
  {
    id: "mantenciones",
    label: "Mantenciones",
    description: "Eliminar todas las mantenciones",
    icon: Wrench,
    color: "text-orange-600 bg-orange-100",
    warning: "Esto eliminará todo el historial de mantenciones programadas y realizadas.",
  },
  {
    id: "historial",
    label: "Historial de Activos",
    description: "Eliminar todo el historial de movimientos",
    icon: FileText,
    color: "text-gray-600 bg-gray-100",
    warning: "Esto eliminará la trazabilidad de todos los activos. No se podrá recuperar.",
  },
  {
    id: "compras",
    label: "Compras y Facturas",
    description: "Eliminar todas las compras registradas",
    icon: Package,
    color: "text-indigo-600 bg-indigo-100",
    warning: "Esto eliminará todas las facturas y su vinculación con activos.",
  },
  {
    id: "desvinculaciones",
    label: "Desvinculaciones",
    description: "Eliminar todos los registros de desvinculación",
    icon: Users,
    color: "text-red-600 bg-red-100",
    warning: "Esto eliminará el historial de desvinculaciones de empleados.",
  },
];

export default function MantenimientoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [counts, setCounts] = useState<DataCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<DeleteOption | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (status === "loading") return;

    // Verificar si es admin (puede ser session.user.role o session.user.rol)
    const userRole = (session?.user as { role?: string; rol?: string })?.role ||
                     (session?.user as { role?: string; rol?: string })?.rol;

    if (!session || userRole !== "admin") {
      router.push("/configuracion");
      return;
    }

    fetchCounts();
  }, [session, status, router]);

  const fetchCounts = async () => {
    try {
      const res = await fetch("/api/mantenimiento/counts");
      if (res.ok) {
        const data = await res.json();
        setCounts(data);
      }
    } catch (error) {
      console.error("Error fetching counts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedOption || confirmText !== "ELIMINAR") return;

    setDeleting(true);
    setResult(null);

    try {
      const res = await fetch("/api/mantenimiento/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: selectedOption.id }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, message: data.message });
        await fetchCounts();
        setSelectedOption(null);
        setConfirmText("");
      } else {
        setResult({ success: false, message: data.error || "Error al eliminar" });
      }
    } catch {
      setResult({ success: false, message: "Error de conexión" });
    } finally {
      setDeleting(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Verificar si es admin
  const userRole = (session?.user as { role?: string; rol?: string })?.role ||
                   (session?.user as { role?: string; rol?: string })?.rol;

  if (!session || userRole !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header con advertencia */}
      <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-100 rounded-full">
            <ShieldAlert className="h-8 w-8 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-red-900">
              Mantenimiento de Datos
            </h1>
            <p className="text-red-700 mt-1">
              Zona de administración exclusiva. Las acciones realizadas aquí son <strong>irreversibles</strong>.
            </p>
            <p className="text-red-600 text-sm mt-2">
              Usuario actual: <strong>{session.user.name}</strong> ({session.user.email})
            </p>
          </div>
        </div>
      </div>

      {/* Resultado de operación */}
      {result && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          result.success
            ? "bg-green-50 border border-green-200 text-green-800"
            : "bg-red-50 border border-red-200 text-red-800"
        }`}>
          {result.success ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600" />
          )}
          {result.message}
        </div>
      )}

      {/* Opciones de eliminación */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Seleccione qué datos desea eliminar
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {deleteOptions.map((option) => {
            const Icon = option.icon;
            const count = counts?.[option.id] ?? 0;
            const isSelected = selectedOption?.id === option.id;

            return (
              <button
                key={option.id}
                onClick={() => {
                  setSelectedOption(isSelected ? null : option);
                  setConfirmText("");
                  setResult(null);
                }}
                disabled={count === 0}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  isSelected
                    ? "border-red-500 bg-red-50"
                    : count === 0
                    ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${option.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{option.label}</span>
                      <span className={`text-sm font-bold ${count > 0 ? "text-red-600" : "text-gray-400"}`}>
                        {count}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel de confirmación */}
      {selectedOption && (
        <div className="bg-white rounded-lg shadow p-6 border-2 border-red-300">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-red-100 rounded-full">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-900">
                Confirmar eliminación de {selectedOption.label}
              </h3>
              <p className="text-red-700 mt-1">{selectedOption.warning}</p>
              <p className="text-red-800 font-medium mt-2">
                Se eliminarán <strong>{counts?.[selectedOption.id] ?? 0}</strong> registros.
              </p>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 text-sm">
              <strong>Para confirmar esta acción, escriba la palabra ELIMINAR en el campo de abajo:</strong>
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Escriba ELIMINAR para confirmar"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-center font-mono text-lg tracking-widest"
                disabled={deleting}
              />
              {confirmText && confirmText !== "ELIMINAR" && (
                <p className="text-red-600 text-sm mt-1 text-center">
                  Debe escribir exactamente: ELIMINAR
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedOption(null);
                  setConfirmText("");
                }}
                disabled={deleting}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== "ELIMINAR" || deleting}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-5 w-5" />
                    Eliminar {selectedOption.label}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Información adicional */}
      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-2">Notas importantes:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Las eliminaciones son permanentes y no se pueden deshacer.</li>
          <li>Se recomienda realizar un respaldo de la base de datos antes de eliminar datos.</li>
          <li>Si elimina activos, también se eliminarán sus asignaciones e historial.</li>
          <li>Si elimina empleados, también se eliminarán sus asignaciones y desvinculaciones.</li>
        </ul>
      </div>
    </div>
  );
}
