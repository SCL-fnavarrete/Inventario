"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";

type Category = {
  id: string;
  nombre: string;
};

export default function EditarActivoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({
    categoriaId: "",
    marca: "",
    modelo: "",
    numeroSerie: "",
    codigoInterno: "",
    estado: "disponible",
    condicion: "nuevo",
    fechaCompra: "",
    fechaGarantiaFin: "",
    procesador: "",
    ram: "",
    almacenamiento: "",
    sistemaOperativo: "",
    imei: "",
    numeroTelefono: "",
    pulgadas: "",
    observaciones: "",
    operador: "",
    antivirus: "",
    incidencia: "",
    nombreEquipo: "",
  });

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      const [catRes, assetRes] = await Promise.all([
        fetch("/api/categorias"),
        fetch(`/api/activos/${id}`),
      ]);

      const [cats, asset] = await Promise.all([
        catRes.json(),
        assetRes.json(),
      ]);

      setCategories(cats);

      if (asset) {
        setFormData({
          categoriaId: asset.categoriaId,
          marca: asset.marca,
          modelo: asset.modelo,
          numeroSerie: asset.numeroSerie || "",
          codigoInterno: asset.numeroActivoInterno || "",
          estado: asset.estado,
          condicion: asset.condicion,
          fechaCompra: asset.fechaCompra
            ? new Date(asset.fechaCompra).toISOString().split("T")[0]
            : "",
          fechaGarantiaFin: asset.fechaGarantiaFin
            ? new Date(asset.fechaGarantiaFin).toISOString().split("T")[0]
            : "",
          procesador: asset.procesador || "",
          ram: asset.ram || "",
          almacenamiento: asset.discoDuro || "",
          sistemaOperativo: asset.sistemaOperativo || "",
          imei: asset.imei || "",
          numeroTelefono: asset.numeroTelefono || "",
          pulgadas: asset.pulgadas?.toString() || "",
          observaciones: asset.observaciones || "",
          operador: asset.operador || "",
          antivirus: asset.antivirus || "",
          incidencia: asset.incidencia || "",
          nombreEquipo: asset.nombreEquipo || "",
        });
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setCategories([]);
    } finally {
      setLoadingData(false);
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        categoriaId: formData.categoriaId,
        marca: formData.marca,
        modelo: formData.modelo,
        numeroSerie: formData.numeroSerie || null,
        numeroActivoInterno: formData.codigoInterno || null,
        estado: formData.estado,
        condicion: formData.condicion,
        fechaCompra: formData.fechaCompra || null,
        fechaGarantiaFin: formData.fechaGarantiaFin || null,
        procesador: formData.procesador || null,
        ram: formData.ram || null,
        discoDuro: formData.almacenamiento || null,
        sistemaOperativo: formData.sistemaOperativo || null,
        imei: formData.imei || null,
        numeroTelefono: formData.numeroTelefono || null,
        pulgadas: formData.pulgadas || null,
        observaciones: formData.observaciones || null,
        operador: formData.operador || null,
        antivirus: formData.antivirus || null,
        incidencia: formData.incidencia || null,
        nombreEquipo: formData.nombreEquipo || null,
      };

      const res = await fetch(`/api/activos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.details || err.message || "Error al actualizar activo");
      }

      router.push(`/activos/${id}`);
    } catch (err) {
      console.error("Error updating asset:", err);
      setError(err instanceof Error ? err.message : "Error al actualizar activo");
    } finally {
      setLoading(false);
    }
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  const selectedCategory = categories.find((c) => c.id === formData.categoriaId);
  const isNotebook = selectedCategory?.nombre.toLowerCase() === "notebook";
  const isCelular = selectedCategory?.nombre.toLowerCase() === "celular";
  const isMonitor = selectedCategory?.nombre.toLowerCase() === "monitor";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/activos/${id}`}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editar Activo</h1>
          <p className="text-gray-600">
            {formData.marca} {formData.modelo} - {formData.numeroSerie}
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informacion General */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Informacion General
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoria *
              </label>
              <select
                name="categoriaId"
                value={formData.categoriaId}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccionar categoria</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Marca *
              </label>
              <input
                type="text"
                name="marca"
                value={formData.marca}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Modelo *
              </label>
              <input
                type="text"
                name="modelo"
                value={formData.modelo}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Numero de Serie
              </label>
              <input
                type="text"
                name="numeroSerie"
                value={formData.numeroSerie}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Codigo Interno
              </label>
              <input
                type="text"
                name="codigoInterno"
                value={formData.codigoInterno}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <select
                name="estado"
                value={formData.estado}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="disponible">Disponible</option>
                <option value="asignado">Asignado</option>
                <option value="en_mantencion">En Mantencion</option>
                <option value="reutilizable">Reutilizable</option>
                <option value="baja">Baja</option>
                <option value="vendido">Vendido</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Condicion
              </label>
              <select
                name="condicion"
                value={formData.condicion}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="nuevo">Nuevo</option>
                <option value="usado">Usado</option>
                <option value="danado">Danado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Compra
              </label>
              <input
                type="date"
                name="fechaCompra"
                value={formData.fechaCompra}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fin de Garantia
              </label>
              <input
                type="date"
                name="fechaGarantiaFin"
                value={formData.fechaGarantiaFin}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Opcional. El dashboard avisa cuando faltan 30 dias para vencer.
              </p>
            </div>
          </div>
        </div>

        {/* Especificaciones Tecnicas - Notebook */}
        {isNotebook && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Especificaciones Tecnicas - Notebook
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Procesador
                </label>
                <input
                  type="text"
                  name="procesador"
                  value={formData.procesador}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  RAM
                </label>
                <input
                  type="text"
                  name="ram"
                  value={formData.ram}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Almacenamiento
                </label>
                <input
                  type="text"
                  name="almacenamiento"
                  value={formData.almacenamiento}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sistema Operativo
                </label>
                <input
                  type="text"
                  name="sistemaOperativo"
                  value={formData.sistemaOperativo}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Antivirus
                </label>
                <input
                  type="text"
                  name="antivirus"
                  value={formData.antivirus}
                  onChange={handleChange}
                  placeholder="ej: Windows Defender"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Equipo
                </label>
                <input
                  type="text"
                  name="nombreEquipo"
                  value={formData.nombreEquipo}
                  onChange={handleChange}
                  placeholder="ej: NB-SCL-001"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Especificaciones Tecnicas - Celular */}
        {isCelular && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Especificaciones Tecnicas - Celular
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IMEI
                </label>
                <input
                  type="text"
                  name="imei"
                  value={formData.imei}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numero de Telefono
                </label>
                <input
                  type="text"
                  name="numeroTelefono"
                  value={formData.numeroTelefono}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Almacenamiento
                </label>
                <input
                  type="text"
                  name="almacenamiento"
                  value={formData.almacenamiento}
                  onChange={handleChange}
                  placeholder="ej: 128GB"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Operador
                </label>
                <select
                  name="operador"
                  value={formData.operador}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar operador</option>
                  <option value="Entel">Entel</option>
                  <option value="Movistar">Movistar</option>
                  <option value="WOM">WOM</option>
                  <option value="Claro">Claro</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Especificaciones Tecnicas - Monitor */}
        {isMonitor && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Especificaciones Tecnicas - Monitor
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pulgadas
                </label>
                <input
                  type="text"
                  name="pulgadas"
                  value={formData.pulgadas}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Observaciones */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Observaciones</h2>
          <textarea
            name="observaciones"
            value={formData.observaciones}
            onChange={handleChange}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Incidencia
            </label>
            <textarea
              name="incidencia"
              value={formData.incidencia}
              onChange={handleChange}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Incidencias reportadas (robo, falla, etc.)..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Link
            href={`/activos/${id}`}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save size={20} />
            <span>{loading ? "Guardando..." : "Guardar Cambios"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
