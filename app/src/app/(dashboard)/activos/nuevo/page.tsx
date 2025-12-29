"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";

type Category = {
  id: string;
  nombre: string;
};

type Supplier = {
  id: string;
  nombre: string;
};

export default function NuevoActivoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [formData, setFormData] = useState({
    categoriaId: "",
    marca: "",
    modelo: "",
    numeroSerie: "",
    codigoInterno: "",
    estado: "disponible",
    condicion: "nuevo",
    fechaCompra: "",
    valorCompra: "",
    proveedorId: "",
    procesador: "",
    ram: "",
    almacenamiento: "",
    sistemaOperativo: "",
    imei: "",
    numeroTelefono: "",
    pulgadas: "",
    resolucion: "",
    observaciones: "",
  });

  useEffect(() => {
    fetchCategories();
    fetchSuppliers();
  }, []);

  async function fetchCategories() {
    try {
      const res = await fetch("/api/categorias");
      const data = await res.json();
      setCategories(data);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }

  async function fetchSuppliers() {
    try {
      const res = await fetch("/api/proveedores");
      const result = await res.json();
      setSuppliers(result.data || []);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      setSuppliers([]);
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

    try {
      const res = await fetch("/api/activos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          valorCompra: formData.valorCompra ? parseFloat(formData.valorCompra) : null,
          fechaCompra: formData.fechaCompra || null,
          proveedorId: formData.proveedorId || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Error al crear activo");
      }

      router.push("/activos");
    } catch (error) {
      console.error("Error creating asset:", error);
      alert(error instanceof Error ? error.message : "Error al crear activo");
    } finally {
      setLoading(false);
    }
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
          href="/activos"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo Activo</h1>
          <p className="text-gray-600">Registrar un nuevo equipo o dispositivo</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Información General */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Información General
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría *
              </label>
              <select
                name="categoriaId"
                value={formData.categoriaId}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccionar categoría</option>
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
                Número de Serie *
              </label>
              <input
                type="text"
                name="numeroSerie"
                value={formData.numeroSerie}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código Interno
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
                <option value="en_mantencion">En Mantención</option>
                <option value="reutilizable">Reutilizable</option>
                <option value="baja">Baja</option>
                <option value="vendido">Vendido</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Condición
              </label>
              <select
                name="condicion"
                value={formData.condicion}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="nuevo">Nuevo</option>
                <option value="usado">Usado</option>
                <option value="danado">Dañado</option>
              </select>
            </div>
          </div>
        </div>

        {/* Información de Compra */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Información de Compra
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                Valor de Compra (CLP)
              </label>
              <input
                type="number"
                name="valorCompra"
                value={formData.valorCompra}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Proveedor
              </label>
              <select
                name="proveedorId"
                value={formData.proveedorId}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccionar proveedor</option>
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Especificaciones Técnicas - Notebook */}
        {isNotebook && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Especificaciones Técnicas - Notebook
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Procesador
                </label>
                <input
                  type="text"
                  name="procesador"
                  value={formData.procesador}
                  onChange={handleChange}
                  placeholder="ej: Intel Core i7-1165G7"
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
                  placeholder="ej: 16GB"
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
                  placeholder="ej: 512GB SSD"
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
                  placeholder="ej: Windows 11 Pro"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Especificaciones Técnicas - Celular */}
        {isCelular && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Especificaciones Técnicas - Celular
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
                  Número de Teléfono
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
            </div>
          </div>
        )}

        {/* Especificaciones Técnicas - Monitor */}
        {isMonitor && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Especificaciones Técnicas - Monitor
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
                  placeholder="ej: 24"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Resolución
                </label>
                <input
                  type="text"
                  name="resolucion"
                  value={formData.resolucion}
                  onChange={handleChange}
                  placeholder="ej: 1920x1080"
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
            placeholder="Notas adicionales sobre el activo..."
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Link
            href="/activos"
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
            <span>{loading ? "Guardando..." : "Guardar Activo"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
