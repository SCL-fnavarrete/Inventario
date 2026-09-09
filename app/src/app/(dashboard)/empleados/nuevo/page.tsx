"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";

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
  fechaIngreso: string;
  fechaTermino: string;
  telefonoContacto: string;
};

export default function NuevoEmpleadoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    fechaIngreso: "",
    fechaTermino: "",
    telefonoContacto: "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/empleados", {
        method: "POST",
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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al crear empleado");
      }

      const employee = await res.json();
      router.push(`/empleados/${employee.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/empleados"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo Empleado</h1>
          <p className="text-gray-600">Registrar un nuevo colaborador</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
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
              placeholder="21.523.308-1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Opcional. Formato: 21.523.308-1 o 215233081
            </p>
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
              placeholder="nombre.personal@gmail.com"
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
              placeholder="nombre@empresa.cl"
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
              placeholder="+56 9 1234 5678"
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
              placeholder="Nombre del jefe directo"
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
              placeholder="Santiago, Rancagua, Concepción..."
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
              Fecha de Término (si aplica)
            </label>
            <input
              type="date"
              name="fechaTermino"
              value={formData.fechaTermino}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Solo para boleta o contratos temporales
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex justify-end gap-4">
          <Link
            href="/empleados"
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save size={20} />
                <span>Guardar Empleado</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
