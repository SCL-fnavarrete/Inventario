"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Check, Loader2, Package, MapPin, User, CheckCircle } from "lucide-react";
import { SelectorActivos } from "@/components/guias-despacho/SelectorActivos";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCampoSede } from "@/components/providers/SedeSeleccionadaProvider";
import {
  AvisoSeccion,
  CampoFormulario,
  CampoTexto,
  ResumenErrores,
  claseCampo,
} from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { ETIQUETAS_GUIA, validarNuevaGuia } from "@/lib/validations/guia";
import { ahoraParaInputFechaHora, inputFechaHoraAISO } from "@/lib/utils/fechas";

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
  // Deben coincidir estructuralmente con el `Asset` local de
  // SelectorActivos.tsx (ambos se llaman igual, TS los trata como
  // incompatibles si no calzan campo a campo).
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sedes, setSedes] = useState<Sede[]>([]);
  // Validacion por campo, con las mismas reglas que el servidor (SPEC 2.104).
  const { errores, resumen, reportar, reportarServidor, limpiar } =
    useErroresFormulario(ETIQUETAS_GUIA);

  // Sede origen: se elige explicitamente desde que sede despacha (evita
  // mezclar en un mismo despacho equipos de sedes distintas). Viene
  // precargada con la sede del navbar o la propia (useCampoSede, SPEC 2.80).
  // La destino no se precarga: nunca puede ser la misma que el origen.
  const [sedeOrigenId, setSedeOrigenId] = useCampoSede();
  // Solo admin puede elegir la sede.
  const esAdminSede = session?.user?.role === "admin";

  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

  // Datos del despacho. El dato principal es la OT de Chilexpress -- todo
  // despacho pasa por ahi. El emisor no se pide: se autocompleta con el
  // tecnico de la sesion. La fecha de envio parte con la hora de Chile.
  const [dispatchData, setDispatchData] = useState({
    otChilexpress: "",
    fechaDespacho: ahoraParaInputFechaHora(),
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

  // Nadie puede despacharse a su propia sede origen (la valida tambien el
  // backend); se excluye la sede origen elegida.
  const sedesDestinoDisponibles = sedes.filter((s) => s.id !== sedeOrigenId);
  const sedeDestinoNombre = sedes.find((s) => s.id === dispatchData.sedeDestinoId)?.nombre;

  function cambiarDespacho(campo: keyof typeof dispatchData, valor: string) {
    setDispatchData((prev) => ({ ...prev, [campo]: valor }));
    limpiar(campo);
  }

  async function handleSubmit() {
    // La sede origen va primero: es el primer campo de la pantalla.
    const faltan = {
      ...(!sedeOrigenId && { sedeId: "Elige la sede origen" }),
      ...validarNuevaGuia({
        assetIds: selectedAssets,
        ...dispatchData,
        receptorNombre: receptor.nombre,
        receptorRut: receptor.rut,
      }),
    };
    if (reportar(faltan)) return;

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const body = {
        otChilexpress: dispatchData.otChilexpress,
        // Instante exacto: el servidor no debe leerla en su propia zona horaria.
        fechaDespacho: inputFechaHoraAISO(dispatchData.fechaDespacho),
        fechaEstimadaLlegada: dispatchData.fechaEstimadaLlegada || null,
        observaciones: dispatchData.observaciones || null,
        sedeDestinoId: dispatchData.sedeDestinoId,
        assetIds: selectedAssets.map((a) => a.id),
        receptorNombre: receptor.nombre,
        receptorRut: receptor.rut,
        // Siempre se manda explicita -- ver sedeIdParaCrear.
        sedeId: sedeOrigenId,
      };

      const res = await fetch("/api/guias-despacho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al crear guía de despacho");
        if (!reportarServidor(fe)) setError(message);
        return;
      }

      const data = await res.json();

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
        <PageHeader backHref="/guias-despacho" title="Nueva Guía de Despacho" />

        <div className="card p-6">
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
                className={buttonClasses({ variant: "outline" })}
              >
                Ver Listado
              </Link>
              <Link
                href={`/guias-despacho/${result.guideId}`}
                className={buttonClasses()}
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
      <PageHeader
        backHref="/guias-despacho"
        title="Nueva Guía de Despacho"
        description="Crear guía para despacho de equipos"
      />

      <ApiErrorSummary error={error} fieldErrors={fieldErrors} />
      <ResumenErrores mensaje={resumen} />

      {/* Sección: Sede origen */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="text-primary-700" size={20} />
          Sede origen
        </h2>
        <CampoFormulario
          label="Sede origen"
          obligatorio
          error={errores.sedeId}
          ayuda={
            esAdminSede
              ? "Obligatorio: desde cuál sede sale este despacho, para no mezclar equipos de sedes distintas en una misma guía."
              : "Es tu sede: el despacho sale desde ella."
          }
        >
          <select
            value={sedeOrigenId}
            disabled={!esAdminSede}
            onChange={(e) => {
              setSedeOrigenId(e.target.value);
              limpiar("sedeId");
              // Los equipos ya elegidos pueden ser de una sede distinta a
              // la nueva -- se limpian para no arrastrar una seleccion
              // que ya no corresponde. Y el destino no puede ser el origen.
              setSelectedAssets([]);
              if (dispatchData.sedeDestinoId === e.target.value) cambiarDespacho("sedeDestinoId", "");
            }}
            aria-invalid={!!errores.sedeId}
            className={claseCampo(errores.sedeId)}
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
        </CampoFormulario>
      </div>

      {/* Sección: Equipos */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Package className="text-primary-700" size={20} />
          Equipos a despachar
        </h2>
        <AvisoSeccion mensaje={errores.assetIds} />
        {!sedeOrigenId ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Selecciona primero la sede origen para ver el inventario disponible.
          </p>
        ) : (
          <SelectorActivos
            selectedAssets={selectedAssets}
            onSelectionChange={(activos) => {
              // Con equipos elegidos la sede origen queda fijada: un cambio
              // posterior del navbar no debe dejarlos en otra sede.
              setSedeOrigenId(sedeOrigenId);
              setSelectedAssets(activos);
              limpiar("assetIds");
            }}
            sedeId={sedeOrigenId}
          />
        )}
      </div>

      {/* Sección: Datos del Despacho */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="text-primary-700" size={20} />
          Datos del despacho
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CampoTexto
            label="OT Chilexpress"
            obligatorio
            placeholder="Ej: 123456789"
            value={dispatchData.otChilexpress}
            onChange={(v) => cambiarDespacho("otChilexpress", v)}
            error={errores.otChilexpress}
          />
          <CampoFormulario label="Sede destino" obligatorio error={errores.sedeDestinoId}>
            <select
              value={dispatchData.sedeDestinoId}
              onChange={(e) => cambiarDespacho("sedeDestinoId", e.target.value)}
              aria-invalid={!!errores.sedeDestinoId}
              className={claseCampo(errores.sedeDestinoId)}
            >
              <option value="">Seleccionar sede</option>
              {sedesDestinoDisponibles.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {sede.nombre}
                </option>
              ))}
            </select>
          </CampoFormulario>
          <CampoTexto
            label="Fecha de envío"
            obligatorio
            type="datetime-local"
            value={dispatchData.fechaDespacho}
            onChange={(v) => cambiarDespacho("fechaDespacho", v)}
            error={errores.fechaDespacho}
          />
          <CampoTexto
            label="Fecha estimada de llegada"
            type="date"
            value={dispatchData.fechaEstimadaLlegada}
            onChange={(v) => cambiarDespacho("fechaEstimadaLlegada", v)}
          />
          <CampoTexto
            label="Emisor"
            value={emisor}
            onChange={() => {}}
            disabled
            ayuda="Se registra automáticamente con tu usuario."
          />
          <CampoFormulario label="Observaciones" className="md:col-span-2">
            <textarea
              value={dispatchData.observaciones}
              onChange={(e) => cambiarDespacho("observaciones", e.target.value)}
              rows={3}
              placeholder="Notas adicionales sobre el despacho..."
              className="field-input"
            />
          </CampoFormulario>
        </div>
      </div>

      {/* Sección: Receptor */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <User className="text-primary-700" size={20} />
          Datos del receptor
        </h2>
        <p className="text-sm text-fg-subtle">
          Quien firma la recepción física del paquete. No necesita estar
          registrado como empleado en el sistema.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CampoTexto
            label="Nombre y apellido"
            obligatorio
            placeholder="Nombre completo"
            value={receptor.nombre}
            onChange={(v) => {
              setReceptor((prev) => ({ ...prev, nombre: v }));
              limpiar("receptorNombre");
            }}
            error={errores.receptorNombre}
          />
          <CampoTexto
            label="RUT"
            obligatorio
            placeholder="XX.XXX.XXX-X"
            value={receptor.rut}
            onChange={(v) => {
              setReceptor((prev) => ({ ...prev, rut: v }));
              limpiar("receptorRut");
            }}
            error={errores.receptorRut}
          />
        </div>
      </div>

      {/* Sección: Confirmación */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CheckCircle className="text-primary-700" size={20} />
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
            className={buttonClasses({ variant: "outline", className: "px-6" })}
          >
            Cancelar
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={buttonClasses({
              className: "px-6 bg-success hover:bg-success-hover disabled:hover:bg-success",
            })}
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
