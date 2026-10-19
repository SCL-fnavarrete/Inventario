"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Check, Loader2, Package, MapPin, User, CheckCircle } from "lucide-react";
import { SelectorActivos, SelectorKit } from "@/modules/despachos/componentes";
import { parseApiError, type FieldErrors, mensajeDeError } from "@/shared/utilidades/apiErrors";
import { ApiErrorSummary } from "@/shared/ui/ApiErrorSummary";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import { useCampoSede } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import {
  AvisoSeccion,
  CampoFormulario,
  CampoTexto,
  ResumenErrores,
  claseCampo,
} from "@/shared/ui/CampoFormulario";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { ETIQUETAS_GUIA, validarNuevaGuia } from "@/modules/despachos";
import { ahoraParaInputFechaHora, inputFechaHoraAISO } from "@/shared/utilidades/fechas";
import { logger } from "@/shared/logger";

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
};

type Asset = {
  id: string;
  numeroSerie: string | null;
  imei: string | null;
  marca: { nombre: string };
  modelo: string;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: { nombre: string } | null;
  lineas?: { numero: string }[];
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
  const emisor = session?.user?.name || session?.user?.usuario || "";
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

  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);
  // Kit/EPP: cantidad por articulo (texto de cada campo); 0 o vacio no se envia.
  const [kitCantidades, setKitCantidades] = useState<Record<string, string>>({});
  const kitElegido = Object.entries(kitCantidades)
    .map(([itemId, texto]) => ({ itemId, cantidad: Number(texto) }))
    .filter((k) => k.cantidad !== 0);

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
      logger.error("Error fetching sedes", error);
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
        kit: kitElegido,
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
        kit: kitElegido,
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
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al crear el despacho");
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
      setError(mensajeDeError(err, "Error desconocido"));
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.success) {
    return (
      <div className="space-y-6">
        <PageHeader backHref="/despachos" title="Nuevo despacho" />

        <div className="card p-6">
          <div className="p-6 bg-green-50 rounded-lg text-center">
            <CheckCircle className="mx-auto text-green-600 mb-4" size={48} />
            <h2 className="text-xl font-semibold text-green-800 mb-2">
              Despacho creado
            </h2>
            <p className="text-green-700 mb-2">
              Número de despacho: <strong>{result.numero}</strong>
            </p>
            <p className="text-sm text-green-700 mb-2">
              Lo despachado quedó En tránsito: pasa a la sede destino cuando se confirme que
              llegó.
            </p>
            <div className="mt-6 flex justify-center gap-4">
              <Link
                href="/despachos"
                className={buttonClasses({ variant: "outline" })}
              >
                Ver Listado
              </Link>
              <Link
                href={`/despachos/${result.guideId}`}
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
        backHref="/despachos"
        title="Nuevo despacho"
        description="Registra los equipos y el Kit/EPP que se envían a otra sede"
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
          ayuda="Obligatorio: desde cuál sede sale este despacho. Los equipos y el Kit/EPP deben ser de esa sede; un despacho no mezcla sedes."
        >
          <select
            value={sedeOrigenId}
            onChange={(e) => {
              setSedeOrigenId(e.target.value);
              limpiar("sedeId");
              // Los equipos ya elegidos pueden ser de una sede distinta a
              // la nueva -- se limpian para no arrastrar una seleccion
              // que ya no corresponde. Y el destino no puede ser el origen.
              setSelectedAssets([]);
              setKitCantidades({});
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

      {/* Sección: Kit / EPP (SPEC 2.145) */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Package className="text-primary-700" size={20} />
          Kit / EPP a despachar
        </h2>
        <p className="text-sm text-fg-subtle">
          Opcional. Sale del stock de la sede origen y suma al de la sede destino cuando se confirma que llegó.
        </p>
        <AvisoSeccion mensaje={errores.kit} />
        {sedeOrigenId ? (
          <SelectorKit
            sedeId={sedeOrigenId}
            cantidades={kitCantidades}
            onChange={(c) => {
              setKitCantidades(c);
              limpiar("kit");
              limpiar("assetIds");
            }}
          />
        ) : (
          <p className="text-sm text-fg-subtle">Selecciona primero la sede origen.</p>
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
          Lo despachado quedará <strong>En tránsito</strong>: los equipos siguen en la sede origen (y el Kit/EPP sale de
          su stock) hasta que se confirme su llegada a <strong>{sedeDestinoNombre || "la sede destino"}</strong>. Mientras viajan, puedes anular
          el despacho.
        </div>

        <div className="flex justify-end gap-3">
          <Link
            href="/despachos"
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
                Crear despacho
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
