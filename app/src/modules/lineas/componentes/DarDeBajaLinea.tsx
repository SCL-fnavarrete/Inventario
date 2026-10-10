"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { formatearNumero } from "@/modules/lineas";
import { nombrePersona, personaDe, type FichaLinea } from "@/modules/lineas/componentes/tipos";
import { CamposMotivoBaja, erroresMotivoBaja, useMotivosBaja } from "@/modules/mantenciones/componentes";
import { hoyISO } from "@/shared/utilidades/fechas";
import { parseApiError } from "@/shared/utilidades/apiErrors";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { CampoFormulario, CampoTexto, ResumenErrores, claseInput } from "@/shared/ui/CampoFormulario";
import { PageHeader } from "@/shared/ui/PageHeader";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { useToast } from "@/shared/ui/Toast";

const ETIQUETAS = {
  motivoBajaId: "Motivo de la baja",
  motivoDetalle: "Detalle del motivo",
  fechaBaja: "Fecha de la baja",
};

/** Lista de motivos de baja de las lineas (aparte de la de los equipos). */
const ENDPOINT_MOTIVOS = "/api/lineas/catalogos/motivos-baja";

/**
 * Dar de baja una linea (SPEC 2.140): la misma pantalla que la de un equipo, con
 * los motivos propios de las lineas. Se elige el motivo de la lista (con detalle
 * si es "Otro"), la fecha y, si se quiere, una observacion.
 */
export function DarDeBajaLinea() {
  const router = useRouter();
  const toast = useToast();
  const id = String(useParams().id ?? "");

  const [linea, setLinea] = useState<FichaLinea["linea"] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.95).
  const { errores, resumen, reportar, limpiar } = useErroresFormulario(ETIQUETAS);

  const motivos = useMotivosBaja(ENDPOINT_MOTIVOS);
  const [motivoBajaId, setMotivoBajaId] = useState("");
  const [motivoDetalle, setMotivoDetalle] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [fechaBaja, setFechaBaja] = useState(hoyISO);

  useEffect(() => {
    fetch(`/api/lineas/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((ficha: FichaLinea | null) => setLinea(ficha?.linea ?? null))
      .catch(() => setError("No se pudo cargar la línea"))
      .finally(() => setCargando(false));
  }, [id]);

  if (cargando) return <div className="p-6 text-fg-subtle">Cargando...</div>;
  if (!linea) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader backHref="/activos/lineas" title="Dar de baja línea" />
        <p className="text-red-600">Línea no encontrada.</p>
      </div>
    );
  }

  const persona = personaDe(linea);
  const bloqueo = linea.estado.deBaja ? "Ya está dada de baja." : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const faltan: Record<string, string> = { ...erroresMotivoBaja(motivos, motivoBajaId, motivoDetalle) };
    if (!fechaBaja) faltan.fechaBaja = "Elige la fecha";
    if (reportar(faltan)) return;

    setEnviando(true);
    try {
      const res = await fetch(`/api/lineas/${linea.id}/baja`, {
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
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al dar de baja la línea");
        if (Object.keys(fe).length > 0) reportar(fe);
        else setError(message);
        return;
      }
      toast.success("Línea dada de baja", `${formatearNumero(linea.numero)} quedó en Baja.`);
      router.push(`/activos/lineas/${linea.id}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        backHref={`/activos/lineas/${linea.id}`}
        title="Dar de baja línea"
        description="La línea pasa a Baja con su motivo. Puedes volver a activarla editándola."
      />

      {/* Linea */}
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-fg-subtle">Número:</span> <span className="font-medium">{formatearNumero(linea.numero)}</span>
          </div>
          <div>
            <span className="text-fg-subtle">Estado:</span> <span className="font-medium">{linea.estado.nombre}</span>
          </div>
          <div>
            <span className="text-fg-subtle">Operador:</span> <span className="font-medium">{linea.operador?.nombre ?? "-"}</span>
          </div>
          <div>
            <span className="text-fg-subtle">Tipo de chip:</span> <span className="font-medium">{linea.tipoChip?.nombre ?? "-"}</span>
          </div>
          <div>
            <span className="text-fg-subtle">Celular:</span>{" "}
            <span className="font-medium">{linea.activo ? `${linea.activo.marca} ${linea.activo.modelo}` : "-"}</span>
          </div>
          <div>
            <span className="text-fg-subtle">Persona:</span> <span className="font-medium">{persona ? nombrePersona(persona) : "-"}</span>
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
            endpoint={ENDPOINT_MOTIVOS}
            de="la línea"
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

          <CampoFormulario label="Observaciones" ayuda="Opcional: detalle de lo que pasó con la línea.">
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} className={claseInput()} />
          </CampoFormulario>

          <div className="flex justify-between pt-2">
            <Link href={`/activos/lineas/${linea.id}`} className={buttonClasses({ variant: "outline" })}>
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
