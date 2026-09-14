"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Trash2 } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";

const empleadoFieldLabels: Record<string, string> = {
  rut: "RUT",
  nombres: "Nombres",
  apellidoPaterno: "Apellido Paterno",
  apellidoMaterno: "Apellido Materno",
  correoPersonal: "Correo Personal",
  correoEmpresa: "Correo Empresa",
  cargo: "Cargo",
  jefatura: "Jefatura",
  supervisor: "Supervisor",
  ubicacion: "Ubicación",
  tipoContrato: "Tipo de Contrato",
  estado: "Estado",
  fechaIngreso: "Fecha de Ingreso",
  fechaTermino: "Fecha de Término",
  telefonoContacto: "Teléfono de Contacto",
  fechaEntregaKit: "Fecha Entrega Kit de Bienvenida",
  fechaEntregaEpp: "Fecha Entrega EPP",
  proximaMantencionEpp: "Próxima Mantención EPP",
  sedeId: "Sede",
};

type Sede = { id: string; nombre: string; codigo: string; activa: boolean };

type FormData = {
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  correoPersonal: string;
  correoEmpresa: string;
  cargo: string;
  jefatura: string;
  supervisor: string;
  ubicacion: string;
  tipoContrato: "contrato" | "boleta";
  estado: "activo" | "desvinculado" | "licencia";
  fechaIngreso: string;
  fechaTermino: string;
  telefonoContacto: string;
  fechaEntregaKit: string;
  fechaEntregaEpp: string;
  proximaMantencionEpp: string;
  sedeId: string;
};

export default function EditarEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const esAdmin = session?.user?.role === "admin";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [formData, setFormData] = useState<FormData>({
    rut: "",
    nombres: "",
    apellidoPaterno: "",
    apellidoMaterno: "",
    correoPersonal: "",
    correoEmpresa: "",
    cargo: "",
    jefatura: "",
    supervisor: "",
    ubicacion: "",
    tipoContrato: "contrato",
    estado: "activo",
    fechaIngreso: "",
    fechaTermino: "",
    telefonoContacto: "",
    fechaEntregaKit: "",
    fechaEntregaEpp: "",
    proximaMantencionEpp: "",
    sedeId: "",
  });

  useEffect(() => {
    fetchEmployee();
  }, [id]);

  // La sede solo la puede reasignar admin (ver PUT /api/empleados/[id]);
  // el tecnico ni siquiera necesita ver el select.
  useEffect(() => {
    if (!esAdmin) return;
    fetch("/api/sedes?activas=true")
      .then((res) => res.json())
      .then((data) => setSedes(Array.isArray(data) ? data : []))
      .catch(() => setSedes([]));
  }, [esAdmin]);

  async function fetchEmployee() {
    try {
      const res = await fetch(`/api/empleados/${id}`);
      if (!res.ok) {
        throw new Error("Empleado no encontrado");
      }
      const employee = await res.json();
      setFormData({
        rut: employee.rut || "",
        nombres: employee.nombres || "",
        apellidoPaterno: employee.apellidoPaterno || "",
        apellidoMaterno: employee.apellidoMaterno || "",
        correoPersonal: employee.correoPersonal || "",
        correoEmpresa: employee.correoEmpresa || "",
        cargo: employee.cargo || "",
        jefatura: employee.jefatura || "",
        supervisor: employee.supervisor || "",
        ubicacion: employee.ubicacion || "",
        tipoContrato: employee.tipoContrato || "contrato",
        estado: employee.estado || "activo",
        fechaIngreso: employee.fechaIngreso
          ? new Date(employee.fechaIngreso).toISOString().split("T")[0]
          : "",
        fechaTermino: employee.fechaTermino
          ? new Date(employee.fechaTermino).toISOString().split("T")[0]
          : "",
        telefonoContacto: employee.telefonoContacto || "",
        fechaEntregaKit: employee.fechaEntregaKit
          ? new Date(employee.fechaEntregaKit).toISOString().split("T")[0]
          : "",
        fechaEntregaEpp: employee.fechaEntregaEpp
          ? new Date(employee.fechaEntregaEpp).toISOString().split("T")[0]
          : "",
        proximaMantencionEpp: employee.proximaMantencionEpp
          ? new Date(employee.proximaMantencionEpp).toISOString().split("T")[0]
          : "",
        sedeId: employee.sedeId || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch(`/api/empleados/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          apellidoMaterno: formData.apellidoMaterno || null,
          cargo: formData.cargo || null,
          jefatura: formData.jefatura || null,
          supervisor: formData.supervisor || null,
          ubicacion: formData.ubicacion || null,
          correoEmpresa: formData.correoEmpresa || null,
          fechaIngreso: formData.fechaIngreso || null,
          fechaTermino: formData.fechaTermino || null,
          telefonoContacto: formData.telefonoContacto || null,
          fechaEntregaKit: formData.fechaEntregaKit || null,
          fechaEntregaEpp: formData.fechaEntregaEpp || null,
          proximaMantencionEpp: formData.proximaMantencionEpp || null,
          // El backend ignora este campo si quien edita no es admin. Para
          // admin es obligatorio (select sin opcion "Sin sede") -- ya no se
          // manda null a proposito, para no dejar empleados sin sede; el
          // spread de formData ya incluye sedeId con el valor real elegido.
        }),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al actualizar empleado");
        setError(message);
        setFieldErrors(fe);
        return;
      }

      router.push(`/empleados/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch(`/api/empleados/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al eliminar empleado");
        setError(message);
        setFieldErrors(fe);
        setShowDeleteConfirm(false);
        return;
      }

      router.push("/activos/empleados");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/empleados/${id}`}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Editar Empleado</h1>
            <p className="text-gray-600">
              {formData.nombres} {formData.apellidoPaterno}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
        >
          <Trash2 size={20} />
          <span>Desvincular</span>
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Confirmar Desvinculación
            </h3>
            <p className="text-gray-600 mb-4">
              ¿Está seguro que desea marcar a este empleado como desvinculado?
              Esta acción cambiará su estado a &quot;desvinculado&quot;.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
        {error && (
          <div className="mb-6">
            <ApiErrorSummary error={error} fieldErrors={fieldErrors} fieldLabels={empleadoFieldLabels} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Datos Personales */}
          <div className="md:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              Datos Personales
            </h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              RUT
            </label>
            <input
              type="text"
              name="rut"
              value={formData.rut}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Correo Personal <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="correoPersonal"
              value={formData.correoPersonal}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Correo Empresa
            </label>
            <input
              type="email"
              name="correoEmpresa"
              value={formData.correoEmpresa}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombres <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nombres"
              value={formData.nombres}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Apellido Paterno <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="apellidoPaterno"
              value={formData.apellidoPaterno}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Apellido Materno
            </label>
            <input
              type="text"
              name="apellidoMaterno"
              value={formData.apellidoMaterno}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono de Contacto
            </label>
            <input
              type="tel"
              name="telefonoContacto"
              value={formData.telefonoContacto}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Datos Laborales */}
          <div className="md:col-span-2 mt-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              Datos Laborales
            </h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estado <span className="text-red-500">*</span>
            </label>
            <select
              name="estado"
              value={formData.estado}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="activo">Activo</option>
              <option value="desvinculado">Desvinculado</option>
              <option value="licencia">En Licencia</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Contrato <span className="text-red-500">*</span>
            </label>
            <select
              name="tipoContrato"
              value={formData.tipoContrato}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="contrato">Contrato</option>
              <option value="boleta">Boleta</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cargo
            </label>
            <input
              type="text"
              name="cargo"
              value={formData.cargo}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Jefatura
            </label>
            <input
              type="text"
              name="jefatura"
              value={formData.jefatura}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supervisor
            </label>
            <input
              type="text"
              name="supervisor"
              value={formData.supervisor}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ubicación
            </label>
            <input
              type="text"
              name="ubicacion"
              value={formData.ubicacion}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Ingreso
            </label>
            <input
              type="date"
              name="fechaIngreso"
              value={formData.fechaIngreso}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Término
            </label>
            <input
              type="date"
              name="fechaTermino"
              value={formData.fechaTermino}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {esAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sede <span className="text-red-500">*</span>
              </label>
              <select
                name="sedeId"
                value={formData.sedeId}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="" disabled>
                  Selecciona una sede...
                </option>
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Reasigna a qué sede pertenece este empleado (ej. si se traslada
                de Concepción a Santiago). Solo administradores pueden
                cambiarlo, y siempre debe quedar asignada a alguna.
              </p>
            </div>
          )}

          {/* Kit de Bienvenida y EPP */}
          <div className="md:col-span-2 mt-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              Kit de Bienvenida y EPP
            </h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha Entrega Kit de Bienvenida
            </label>
            <input
              type="date"
              name="fechaEntregaKit"
              value={formData.fechaEntregaKit || ""}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha Entrega EPP
            </label>
            <input
              type="date"
              name="fechaEntregaEpp"
              value={formData.fechaEntregaEpp || ""}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Próxima Mantención EPP
            </label>
            <input
              type="date"
              name="proximaMantencionEpp"
              value={formData.proximaMantencionEpp || ""}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex justify-end gap-4">
          <Link
            href={`/empleados/${id}`}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save size={20} />
                <span>Guardar Cambios</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
