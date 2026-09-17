"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
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
  sedeId: string;
};

export default function EditarEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const esAdmin = session?.user?.role === "admin";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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
      </div>

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

          {/* 16-sep-2026: "Desvinculado" ya no es una opcion elegible a mano
              -- ese estado lo pone unicamente una Solicitud de
              desvinculacion, que es donde queda registrada la devolucion de
              los equipos y el motivo. Misma regla que saco el boton
              "Desvincular" de esta pantalla (SPEC 2.43). Si el empleado YA
              esta desvinculado, el campo se muestra de solo lectura: con la
              opcion fuera del select, guardar cualquier otro cambio lo
              habria devuelto a "activo" sin que nadie lo pidiera. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estado <span className="text-red-500">*</span>
            </label>
            {formData.estado === "desvinculado" ? (
              <>
                <input
                  type="text"
                  value="Desvinculado"
                  disabled
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Para reincorporarlo, crea una Solicitud de onboarding eligiéndolo como
                  empleado existente.
                </p>
              </>
            ) : (
              <select
                name="estado"
                value={formData.estado}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="activo">Activo</option>
                <option value="licencia">En Licencia</option>
              </select>
            )}
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
                /* Mover un empleado de sede es solo de admin (18-sep-2026,
                   SPEC 2.29.1): el PUT ya ignora el sedeId que mande un
                   tecnico, esto evita que parezca editable. */
                disabled={!esAdmin}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
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
