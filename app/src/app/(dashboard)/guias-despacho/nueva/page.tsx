"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Loader2,
  Package,
  MapPin,
  User,
  CheckCircle,
} from "lucide-react";
import { SelectorActivos } from "@/components/guias-despacho/SelectorActivos";

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
};

type Asset = {
  id: string;
  numeroSerie: string | null;
  imei: string | null;
  marca: string;
  modelo: string;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  numeroTelefono: string | null;
  tipoPlan: string | null;
  // 14-sep-2026 (SPEC 2.26): agregados para que este tipo coincida
  // estructuralmente con el `Asset` local de SelectorActivos.tsx (ambos
  // se llaman igual, TS los trata como incompatibles si no calzan campo
  // a campo).
  pulgadas: string | number | null;
  conectividad: string | null;
  estado: string;
  condicion: string;
  categoria: {
    id: string;
    nombre: string;
  };
};

export default function NuevaGuiaDespachoPage() {
  const { data: session } = useSession();
  const emisor = session?.user?.name || session?.user?.email || "";
  const isAdmin = session?.user?.role === "admin";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);

  // Sede origen: solo la elige admin (un tecnico despacha siempre desde la
  // suya, forzado en el backend). Sin esto una guia de admin quedaba con
  // sedeId null -- mezclando en un mismo despacho equipos de sedes
  // distintas y sin quedar visible para ningun tecnico "emisor". Ver SPEC 2.9.
  const [sedeOrigenId, setSedeOrigenId] = useState("");

  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

  // Datos del despacho. El dato principal es la OT de Chilexpress -- todo
  // despacho pasa por ahi. El emisor no se pide: se autocompleta con el
  // tecnico de la sesion.
  const [dispatchData, setDispatchData] = useState({
    otChilexpress: "",
    fechaDespacho: new Date().toISOString().slice(0, 16),
    fechaEstimadaLlegada: "",
    observaciones: "",
    sedeDestinoId: "",
  });

  // Receptor. Texto libre a proposito -- no siempre es un empleado del
  // sistema (puede ser alguien no onboardeado todavia).
  const [receptor, setReceptor] = useState({ nombre: "", rut: "" });

  const [result, setResult] = useState<{ success: boolean; guideId?: string; numero?: string } | null>(null);

  useEffect(() => {
    fetchSedes();
  }, []);

  async function fetchSedes() {
    try {
      const res = await fetch("/api/sedes?activas=true");
      const data = await res.json();
      setSedes(data);
    } catch (error) {
      console.error("Error fetching sedes:", error);
    }
  }

  // Un tecnico no puede despacharse a su propia sede (la valida tambien el
  // backend); si es admin, se excluye la sede origen que eligio.
  const sedesDestinoDisponibles = sedes.filter(
    (s) => s.id !== (isAdmin ? sedeOrigenId : session?.user?.sedeId)
  );
  const sedeDestinoNombre = sedes.find((s) => s.id === dispatchData.sedeDestinoId)?.nombre;

  const formularioCompleto =
    selectedAssets.length > 0 &&
    !!dispatchData.otChilexpress &&
    !!dispatchData.fechaDespacho &&
    !!dispatchData.sedeDestinoId &&
    !!receptor.nombre &&
    !!receptor.rut &&
    (!isAdmin || !!sedeOrigenId);

  async function handleSubmit() {
    if (isAdmin && !sedeOrigenId) {
      setError("Selecciona la sede origen del despacho.");
      return;
    }
    if (!formularioCompleto) {
      setError("Completa los equipos, los datos del despacho y del receptor antes de confirmar.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const body = {
        otChilexpress: dispatchData.otChilexpress,
        fechaDespacho: dispatchData.fechaDespacho,
        fechaEstimadaLlegada: dispatchData.fechaEstimadaLlegada || null,
        observaciones: dispatchData.observaciones || null,
        sedeDestinoId: dispatchData.sedeDestinoId,
        assetIds: selectedAssets.map((a) => a.id),
        receptorNombre: receptor.nombre,
        receptorRut: receptor.rut,
        // Solo tiene efecto si quien crea es admin -- el backend usa
        // siempre la sede propia del tecnico. Ver SPEC 2.9.
        ...(isAdmin ? { sedeId: sedeOrigenId } : {}),
      };

      const res = await fetch("/api/guias-despacho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al crear guía de despacho");
      }

      setResult({
        success: true,
        guideId: data.id,
        numero: data.numero,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.success) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/guias-despacho"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Nueva Guía de Despacho</h1>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="p-6 bg-green-50 rounded-lg text-center">
            <CheckCircle className="mx-auto text-green-600 mb-4" size={48} />
            <h2 className="text-xl font-semibold text-green-800 mb-2">
              Guía Creada Exitosamente
            </h2>
            <p className="text-green-700 mb-2">
              Número de guía: <strong>{result.numero}</strong>
            </p>
            <p className="text-sm text-green-700 mb-2">
              Los equipos ya quedaron disponibles en la sede destino.
            </p>
            <div className="mt-6 flex justify-center gap-4">
              <Link
                href="/guias-despacho"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Ver Listado
              </Link>
              <Link
                href={`/guias-despacho/${result.guideId}`}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Ver Detalle
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/guias-despacho"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva Guía de Despacho</h1>
          <p className="text-gray-600">Crear guía para despacho de equipos</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Sección: Sede origen (solo admin) */}
      {isAdmin && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="text-blue-600" size={20} />
            Sede origen
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sede origen <span className="text-red-500">*</span>
            </label>
            <select
              value={sedeOrigenId}
              onChange={(e) => {
                setSedeOrigenId(e.target.value);
                // Los equipos ya elegidos pueden ser de una sede distinta a
                // la nueva -- se limpian para no arrastrar una seleccion
                // que ya no corresponde.
                setSelectedAssets([]);
              }}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
            <p className="text-xs text-gray-500 mt-1">
              Un técnico despacha siempre desde su propia sede; como admin debes elegir desde cuál sede sale este despacho, para no mezclar equipos de sedes distintas en una misma guía.
            </p>
          </div>
        </div>
      )}

      {/* Sección: Equipos */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Package className="text-blue-600" size={20} />
          Equipos a despachar
        </h2>
        {isAdmin && !sedeOrigenId ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Selecciona primero la sede origen para ver el inventario disponible.
          </p>
        ) : (
          <SelectorActivos
            selectedAssets={selectedAssets}
            onSelectionChange={setSelectedAssets}
            sedeId={isAdmin ? sedeOrigenId : undefined}
          />
        )}
      </div>

      {/* Sección: Datos del Despacho */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="text-blue-600" size={20} />
          Datos del despacho
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              OT Chilexpress <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej: 123456789"
              value={dispatchData.otChilexpress}
              onChange={(e) =>
                setDispatchData((prev) => ({ ...prev, otChilexpress: e.target.value }))
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sede destino <span className="text-red-500">*</span>
            </label>
            <select
              value={dispatchData.sedeDestinoId}
              onChange={(e) =>
                setDispatchData((prev) => ({ ...prev, sedeDestinoId: e.target.value }))
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar sede</option>
              {sedesDestinoDisponibles.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {sede.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de envío <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={dispatchData.fechaDespacho}
              onChange={(e) =>
                setDispatchData((prev) => ({ ...prev, fechaDespacho: e.target.value }))
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha estimada de llegada
            </label>
            <input
              type="date"
              value={dispatchData.fechaEstimadaLlegada}
              onChange={(e) =>
                setDispatchData((prev) => ({ ...prev, fechaEstimadaLlegada: e.target.value }))
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Emisor
            </label>
            <input
              type="text"
              value={emisor}
              disabled
              className="w-full px-4 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">
              Se registra automáticamente con tu usuario.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observaciones
            </label>
            <textarea
              value={dispatchData.observaciones}
              onChange={(e) =>
                setDispatchData((prev) => ({ ...prev, observaciones: e.target.value }))
              }
              rows={3}
              placeholder="Notas adicionales sobre el despacho..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Sección: Receptor */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <User className="text-blue-600" size={20} />
          Datos del receptor
        </h2>
        <p className="text-sm text-gray-500">
          Quien firma la recepción física del paquete. No necesita estar
          registrado como empleado en el sistema.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre y apellido <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Nombre completo"
              value={receptor.nombre}
              onChange={(e) =>
                setReceptor((prev) => ({ ...prev, nombre: e.target.value }))
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              RUT <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="XX.XXX.XXX-X"
              value={receptor.rut}
              onChange={(e) =>
                setReceptor((prev) => ({ ...prev, rut: e.target.value }))
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Sección: Confirmación */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CheckCircle className="text-blue-600" size={20} />
          Confirmar
        </h2>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Al confirmar, los equipos seleccionados quedarán de inmediato
          disponibles en <strong>{sedeDestinoNombre || "la sede destino"}</strong>.
          Esta guía no se podrá anular después.
        </div>

        <div className="flex justify-end gap-3">
          <Link
            href="/guias-despacho"
            className="flex items-center gap-2 px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting || !formularioCompleto}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Creando...
              </>
            ) : (
              <>
                <Check size={20} />
                Crear Guía de Despacho
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
