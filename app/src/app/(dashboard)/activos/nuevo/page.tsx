"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";

type Category = {
  id: string;
  nombre: string;
};

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
};

export default function NuevoActivoPage() {
  const router = useRouter();
  const { data: session } = useSession();
  // El campo de sede solo lo ve admin: un tecnico no elige sede, la hereda
  // automaticamente de la suya (ver sedeIdParaCrear en el backend). Ver
  // SPEC 2.9.
  const isAdmin = session?.user?.role === "admin";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [formData, setFormData] = useState({
    categoriaId: "",
    sedeId: "",
    marca: "",
    modelo: "",
    numeroSerie: "",
    codigoInterno: "",
    estado: "disponible",
    condicion: "nuevo",
    fechaCompra: "",
    fechaGarantiaFin:"",
    procesador: "",
    ram: "",
    almacenamiento: "",
    sistemaOperativo: "",
    imei: "",
    numeroTelefono: "",
    pulgadas: "",
    observaciones: "",
    antivirus: "",
    incidencia: "",
    nombreEquipo: "",
    conectividad: "",
    tipoLicenciaMicrosoft365: "",
  });

  useEffect(() => {
    fetchCategories();
    if (isAdmin) fetchSedes();
  }, [isAdmin]);

  async function fetchCategories() {
    try {
      const res = await fetch("/api/categorias");
      const data = await res.json();
      setCategories(data);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }

  async function fetchSedes() {
    try {
      const res = await fetch("/api/sedes?activas=true");
      const data = await res.json();
      setSedes(data);
    } catch (error) {
      console.error("Error fetching sedes:", error);
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
        // Solo tiene efecto si quien crea es admin -- el backend ignora este
        // campo para un tecnico y usa siempre su propia sede. Para admin es
        // obligatorio (select sin opcion en blanco); si de todos modos
        // llegara vacio el backend lo rechaza. Ver SPEC 2.9.
        sedeId: formData.sedeId || undefined,
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
        antivirus: formData.antivirus || null,
        incidencia: formData.incidencia || null,
        nombreEquipo: formData.nombreEquipo || null,
        conectividad: formData.conectividad || null,
        // No hay (todavia) un campo aparte de "tiene M365 si/no" en este
        // formulario -- se deriva de si se cargo el nombre del plan. Ver
        // SPEC 2.23.
        tipoLicenciaMicrosoft365: formData.tipoLicenciaMicrosoft365 || null,
        microsoft365: Boolean(formData.tipoLicenciaMicrosoft365),
      };

      const res = await fetch("/api/activos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || "Error al crear activo");
      }

      router.push("/activos");
    } catch (err) {
      console.error("Error creating asset:", err);
      setError(err instanceof Error ? err.message : "Error al crear activo");
    } finally {
      setLoading(false);
    }
  }

  const selectedCategory = categories.find((c) => c.id === formData.categoriaId);
  const isNotebook = selectedCategory?.nombre.toLowerCase() === "notebook";
  const isCelular = selectedCategory?.nombre.toLowerCase() === "celular";
  const isMonitor = selectedCategory?.nombre.toLowerCase() === "monitor";
  // Perifericos simples: alcanza con un solo campo de conectividad, no una
  // seccion propia por cada uno -- ver SPEC 2.11 (pedido explicito de
  // Javier: "basta con colocar su identificador unico" para estos).
  // Impresora tuvo una seccion propia el mismo dia pero Javier decidio que
  // no era necesaria; se revirtio.
  const PERIFERICOS_SIMPLES = ["mouse", "teclado", "webcam", "audífonos"];
  const isPerifericoSimple = selectedCategory
    ? PERIFERICOS_SIMPLES.includes(selectedCategory.nombre.toLowerCase())
    : false;

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
                Numero de Serie *
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
              <p className="px-4 py-2 text-gray-600 bg-gray-50 border border-gray-200 rounded-lg">
                Disponible
              </p>
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
            {isAdmin && (
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
                  Un técnico hereda automáticamente su propia sede; este campo solo lo ves tú, y es obligatorio para que el equipo quede visible para la sede correspondiente.
                </p>
              </div>
            )}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Licencia Microsoft 365
                </label>
                <input
                  type="text"
                  name="tipoLicenciaMicrosoft365"
                  value={formData.tipoLicenciaMicrosoft365}
                  onChange={handleChange}
                  placeholder="ej: Premium (vacío si no tiene)"
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
                  placeholder="ej: 24"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Especificaciones Tecnicas - Perifericos simples (Mouse, Teclado, Webcam, Audifonos) */}
        {isPerifericoSimple && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Especificaciones Tecnicas - {selectedCategory?.nombre}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Conectividad
                </label>
                <select
                  name="conectividad"
                  value={formData.conectividad}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar conectividad</option>
                  <option value="usb">USB</option>
                  <option value="bluetooth">Bluetooth</option>
                  <option value="cable">Cable</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Incidencia */}
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
