"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { etiquetaEstadoActivo, motivoSinBaja, identificadorActivo } from "@/modules/activos";
import { CamposMotivoBaja, erroresMotivoBaja, useMotivosBaja } from "@/modules/mantenciones/componentes";
import { hoyISO } from "@/shared/utilidades/fechas";
import { parseApiError, mensajeDeError } from "@/shared/utilidades/apiErrors";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { CampoFormulario, CampoTexto, ResumenErrores, claseInput } from "@/shared/ui/CampoFormulario";
import { PageHeader } from "@/shared/ui/PageHeader";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { useToast } from "@/shared/ui/Toast";

type Activo = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  estado: string;
  empleadoActualId: string | null;
  categoria: { nombre: string };
};

const ETIQUETAS = {
  motivoBajaId: "Motivo de la baja",
  motivoDetalle: "Detalle del motivo",
  fechaBaja: "Fecha de la baja",
};

/**
 * Dar de baja un equipo (SPEC 2.140). Sin mantencion de por medio: se elige el
 * motivo de la lista (con detalle si es "Otro"), la fecha y, si se quiere, una
 * observacion. Solo un equipo sin empleado asignado (SPEC 2.106).
 */
export default function DarDeBajaPage() {
  const router = useRouter();
  const toast = useToast();
  const id = String(useParams().id ?? "");

  const [activo, setActivo] = useState<Activo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.95).
  const { errores, resumen, reportar, limpiar } = useErroresFormulario(ETIQUETAS);

  const motivos = useMotivosBaja();
  const [motivoBajaId, setMotivoBajaId] = useState("");
  const [motivoDetalle, setMotivoDetalle] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [fechaBaja, setFechaBaja] = useState(hoyISO);

  useEffect(() => {
    fetch(`/api/activos/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((a: Activo | null) => setActivo(a))
      .catch(() => setError("No se pudo cargar el equipo"))
      .finally(() => setCargando(false));
  }, [id]);

  if (cargando) return <div className="p-6 text-fg-subtle">Cargando...</div>;
  if (!activo) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader backHref="/activos" title="Dar de baja equipo" />
        <p className="text-red-600">Equipo no encontrado.</p>
      </div>
    );
  }

  const bloqueo = motivoSinBaja(activo);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const faltan: Record<string, string> = { ...erroresMotivoBaja(motivos, motivoBajaId, motivoDetalle) };
    if (!fechaBaja) faltan.fechaBaja = "Elige la fecha";
    if (reportar(faltan)) return;

    setEnviando(true);
    try {
      const res = await fetch(`/api/activos/${activo.id}/baja`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motivoBajaId,
          motivoDetalle: motivoDetalle.trim() || undefined,
          observaciones: observaciones.trim() || undefined,
          fechaBaja,
        }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al dar de baja el equipo");
        if (Object.keys(fe).length > 0) reportar(fe);
        else setError(message);
        return;
      }
      toast.success("Equipo dado de baja", `${activo.marca} ${activo.modelo} quedó en Baja.`);
      router.push(`/activos/${activo.id}`);
      router.refresh();
    } catch (err: unknown) {
      setError(mensajeDeError(err, "Error desconocido"));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        backHref={`/activos/${activo.id}`}
        title="Dar de baja equipo"
        description="El equipo pasa a Baja con su motivo. Sus mantenciones abiertas se cancelan."
      />

      {/* Equipo */}
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-fg-subtle">Equipo:</span> <span className="font-medium">{activo.categoria.nombre}</span>
          </div>
          <div>
            <span className="text-fg-subtle">Estado:</span> <span className="font-medium">{etiquetaEstadoActivo(activo.estado)}</span>
          </div>
          <div>
            <span className="text-fg-subtle">Marca/Modelo:</span>{" "}
            <span className="font-medium">
              {activo.marca} {activo.modelo}
            </span>
          </div>
          <div>
            <span className="text-fg-subtle">Serie:</span> <span className="font-medium">{identificadorActivo(activo, "-")}</span>
          </div>
        </div>
      </div>

      {bloqueo ? (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <XCircle className="shrink-0 text-red-500" size={20} />
          <p className="text-red-700">No se puede dar de baja. {bloqueo}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-4 p-6" noValidate>
          <ResumenErrores mensaje={resumen || error} />

          <CamposMotivoBaja
            motivos={motivos}
            motivoBajaId={motivoBajaId}
            detalle={motivoDetalle}
            onMotivo={(v) => {
              setMotivoBajaId(v);
              limpiar("motivoBajaId");
              limpiar("motivoDetalle");
            }}
            onDetalle={(v) => {
              setMotivoDetalle(v);
              limpiar("motivoDetalle");
            }}
            errores={errores}
          />

          <CampoTexto
            label="Fecha de la baja"
            obligatorio
            type="date"
            max={hoyISO()}
            value={fechaBaja}
            onChange={(v) => {
              setFechaBaja(v);
              limpiar("fechaBaja");
            }}
            error={errores.fechaBaja}
          />

          <CampoFormulario label="Observaciones" ayuda="Opcional: diagnóstico o detalle de lo que pasó.">
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} className={claseInput()} />
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
