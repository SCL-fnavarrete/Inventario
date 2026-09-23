"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Wrench, XCircle } from "lucide-react";
import {
  MOTIVO_BAJA_LABEL,
  etiquetaEstadoActivo,
  motivoSinBaja,
} from "@/lib/constants/estadosActivo";
import { inicioDeHoy } from "@/lib/utils/fechas";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import {
  CampoFormulario,
  CampoTexto,
  claseInput,
  enfocarPrimerError,
} from "@/components/ui/CampoFormulario";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { useToast } from "@/components/ui/Toast";

type Activo = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  estado: string;
  categoria: { nombre: string };
  maintenances: { id: string; estado: string; descripcion: string; tipo: { nombre: string } }[];
};

type TipoMantencion = { id: string; nombre: string };

/**
 * Dar de baja un equipo (SPEC 2.88). Toda baja pasa por Mantenciones: se
 * llega con el equipo ya elegido (?activoId=) desde su detalle, la lista de
 * Mantenciones o el tablero de Activos, y queda registrada como una
 * mantencion "No reparable". Si el equipo ya tiene una mantencion abierta,
 * se cierra esa en vez de crear otra.
 */
function DarDeBajaContenido() {
  const router = useRouter();
  const toast = useToast();
  const { data: session } = useSession();
  const activoId = useSearchParams().get("activoId") ?? "";

  const [activo, setActivo] = useState<Activo | null>(null);
  const [tipos, setTipos] = useState<TipoMantencion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [tipoId, setTipoId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [motivoDetalle, setMotivoDetalle] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [fechaRealizada, setFechaRealizada] = useState(() =>
    inicioDeHoy().toISOString().slice(0, 10)
  );
  const [realizadoPor, setRealizadoPor] = useState("");

  useEffect(() => {
    if (!activoId) {
      setCargando(false);
      return;
    }
    Promise.all([
      fetch(`/api/activos/${activoId}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/mantenciones/tipos?activo=true").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([a, t]: [Activo | null, TipoMantencion[]]) => {
        setActivo(a);
        setTipos(t);
        // Correctiva por defecto: es la que corresponde a un equipo que falla.
        setTipoId((t.find((x) => x.nombre === "Correctiva") ?? t[0])?.id ?? "");
      })
      .catch(() => setError("No se pudo cargar el equipo"))
      .finally(() => setCargando(false));
  }, [activoId]);

  // "Realizado por" parte con el usuario de la sesion (se puede cambiar).
  useEffect(() => {
    if (session?.user?.name) setRealizadoPor((prev) => prev || (session.user.name as string));
  }, [session]);

  if (cargando) return <div className="p-6 text-fg-subtle">Cargando...</div>;
  if (!activo) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <PageHeader backHref="/mantenciones" title="Dar de baja equipo" />
        <p className="text-red-600">Equipo no encontrado.</p>
      </div>
    );
  }

  const bloqueo = motivoSinBaja(activo.estado);
  const abierta = activo.maintenances[0] ?? null;

  const limpiar = (campo: string) =>
    setFieldErrors((prev) => {
      const { [campo]: _omitido, ...resto } = prev;
      return resto;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const errores: FieldErrors = {};
    if (!abierta && !tipoId) errores.tipoId = "Elige el tipo de mantención";
    if (!motivo) errores.motivo = "Elige el motivo de la baja";
    if (motivo === "otro" && !motivoDetalle.trim()) errores.motivoDetalle = "Describe el motivo";
    if (!fechaRealizada) errores.fechaRealizada = "Fecha requerida";
    if (!realizadoPor.trim()) errores.realizadoPor = "Indica quién la realiza";
    setFieldErrors(errores);
    if (Object.keys(errores).length > 0) {
      enfocarPrimerError();
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/mantenciones/baja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: activo.id,
          tipoId: tipoId || undefined,
          motivo,
          motivoDetalle: motivo === "otro" ? motivoDetalle : undefined,
          observaciones: observaciones || undefined,
          fechaRealizada,
          realizadoPor,
        }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al dar de baja el equipo");
        setError(message);
        setFieldErrors(fe);
        return;
      }
      toast.success("Equipo dado de baja", `${activo.marca} ${activo.modelo} quedó en Baja.`);
      router.push(`/activos/${activo.id}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        backHref={`/activos/${activo.id}`}
        title="Dar de baja equipo"
        description="Queda registrado como una mantención cerrada como No reparable."
      />

      {/* Equipo */}
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-fg-subtle">Equipo:</span>{" "}
            <span className="font-medium">{activo.categoria.nombre}</span>
          </div>
          <div>
            <span className="text-fg-subtle">Estado:</span>{" "}
            <span className="font-medium">{etiquetaEstadoActivo(activo.estado)}</span>
          </div>
          <div>
            <span className="text-fg-subtle">Marca/Modelo:</span>{" "}
            <span className="font-medium">
              {activo.marca} {activo.modelo}
            </span>
          </div>
          <div>
            <span className="text-fg-subtle">Serie:</span>{" "}
            <span className="font-medium">{activo.numeroSerie || "-"}</span>
          </div>
        </div>
      </div>

      {bloqueo ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="text-red-500 shrink-0" size={20} />
          <p className="text-red-700">No se puede dar de baja. {bloqueo}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card p-6 space-y-4" noValidate>
          <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

          {abierta ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
              <Wrench className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                El equipo tiene una mantención abierta ({abierta.tipo.nombre}: {abierta.descripcion}).
                Se cerrará esa misma como <strong>No reparable</strong>.
              </p>
            </div>
          ) : (
            <CampoFormulario label="Tipo de mantención" obligatorio error={fieldErrors.tipoId}>
              <select
                value={tipoId}
                onChange={(e) => {
                  setTipoId(e.target.value);
                  limpiar("tipoId");
                }}
                aria-invalid={!!fieldErrors.tipoId}
                className={claseInput(fieldErrors.tipoId)}
              >
                <option value="">Selecciona un tipo</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </CampoFormulario>
          )}

          <CampoFormulario label="Motivo de la baja" obligatorio error={fieldErrors.motivo}>
            <select
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                limpiar("motivo");
              }}
              aria-invalid={!!fieldErrors.motivo}
              className={claseInput(fieldErrors.motivo)}
            >
              <option value="">Selecciona un motivo</option>
              {Object.entries(MOTIVO_BAJA_LABEL).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </CampoFormulario>

          {motivo === "otro" && (
            <CampoTexto
              label="Detalle del motivo"
              obligatorio
              value={motivoDetalle}
              onChange={(v) => {
                setMotivoDetalle(v);
                limpiar("motivoDetalle");
              }}
              error={fieldErrors.motivoDetalle}
              placeholder="Describe por qué se da de baja"
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoTexto
              label="Fecha"
              obligatorio
              type="date"
              value={fechaRealizada}
              onChange={(v) => {
                setFechaRealizada(v);
                limpiar("fechaRealizada");
              }}
              error={fieldErrors.fechaRealizada}
            />
            <CampoTexto
              label="Realizado por"
              obligatorio
              value={realizadoPor}
              onChange={(v) => {
                setRealizadoPor(v);
                limpiar("realizadoPor");
              }}
              error={fieldErrors.realizadoPor}
            />
          </div>

          <CampoFormulario label="Observaciones" ayuda="Opcional: diagnóstico o detalle de la falla.">
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className={claseInput()}
            />
          </CampoFormulario>

          <div className="flex justify-between pt-2">
            <Link href={`/activos/${activo.id}`} className={buttonClasses({ variant: "outline" })}>
              Cancelar
            </Link>
            <button type="submit" disabled={enviando} className={buttonClasses({ variant: "danger" })}>
              {enviando ? "Dando de baja..." : "Dar de baja"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function DarDeBajaPage() {
  return (
    <Suspense fallback={<div className="p-6 text-fg-subtle">Cargando...</div>}>
      <DarDeBajaContenido />
    </Suspense>
  );
}
