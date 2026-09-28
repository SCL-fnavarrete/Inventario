"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Wrench, XCircle } from "lucide-react";
import { etiquetaEstadoActivo, motivoSinBaja } from "@/lib/constants/estadosActivo";
import { CamposMotivoBaja, erroresMotivoBaja, useMotivosBaja } from "@/components/mantenciones/CamposMotivoBaja";
import { hoyISO } from "@/lib/utils/fechas";
import { parseApiError } from "@/lib/utils/apiErrors";
import { mantencionACerrar } from "@/lib/utils/mantenciones";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import {
  CampoFormulario,
  CampoTexto,
  ResumenErrores,
  claseInput,
} from "@/components/ui/CampoFormulario";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { useToast } from "@/components/ui/Toast";
import { identificadorActivo } from "@/lib/utils/identificador";

type Activo = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  estado: string;
  empleadoActualId: string | null;
  categoria: { nombre: string };
  maintenances: { id: string; estado: string; descripcion: string; tipo: { nombre: string } }[];
};

type TipoMantencion = { id: string; nombre: string };

const ETIQUETAS = {
  tipoId: "Tipo de mantención",
  motivoBajaId: "Motivo de la baja",
  motivoDetalle: "Detalle del motivo",
  fechaRealizada: "Fecha",
  realizadoPor: "Realizado por",
};

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
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.95).
  const { errores, resumen, reportar, limpiar } = useErroresFormulario(ETIQUETAS);

  const [tipoId, setTipoId] = useState("");
  const motivos = useMotivosBaja();
  const [motivoBajaId, setMotivoBajaId] = useState("");
  const [motivoDetalle, setMotivoDetalle] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [fechaRealizada, setFechaRealizada] = useState(hoyISO);
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

  const bloqueo = motivoSinBaja(activo);
  // La misma que cierra el servidor; las demas abiertas se cancelan.
  const abierta = mantencionACerrar(activo.maintenances) ?? null;
  const otrasAbiertas = activo.maintenances.length - (abierta ? 1 : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const faltan: Record<string, string> = {};
    if (!abierta && !tipoId) faltan.tipoId = "Elige el tipo de mantención";
    Object.assign(faltan, erroresMotivoBaja(motivos, motivoBajaId, motivoDetalle));
    if (!fechaRealizada) faltan.fechaRealizada = "Elige la fecha";
    if (!realizadoPor.trim()) faltan.realizadoPor = "Indica quién la realiza";
    if (reportar(faltan)) return;

    setEnviando(true);
    try {
      const res = await fetch("/api/mantenciones/baja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: activo.id,
          tipoId: tipoId || undefined,
          motivoBajaId,
          motivoDetalle: motivoDetalle.trim() || undefined,
          observaciones: observaciones || undefined,
          fechaRealizada,
          realizadoPor,
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
        description="Queda registrado como una mantención cerrada como Sin reparación."
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
            <span className="font-medium">{identificadorActivo(activo, "-")}</span>
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
          <ResumenErrores mensaje={resumen || error} />

          {abierta ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
              <Wrench className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                Se cerrará la mantención {abierta.estado === "en_proceso" ? "en proceso" : "programada"}{" "}
                ({abierta.tipo.nombre}: {abierta.descripcion}) como <strong>Sin reparación</strong>.
                {otrasAbiertas === 1 && " La otra mantención programada se cancela."}
                {otrasAbiertas > 1 && ` Las otras ${otrasAbiertas} mantenciones programadas se cancelan.`}
              </p>
            </div>
          ) : (
            <CampoFormulario label="Tipo de mantención" obligatorio error={errores.tipoId}>
              <select
                value={tipoId}
                onChange={(e) => {
                  setTipoId(e.target.value);
                  limpiar("tipoId");
                }}
                aria-invalid={!!errores.tipoId}
                className={claseInput(errores.tipoId)}
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

          <CamposMotivoBaja
            motivos={motivos}
            motivoBajaId={motivoBajaId}
            detalle={motivoDetalle}
            onMotivo={(id) => {
              setMotivoBajaId(id);
              limpiar("motivoBajaId");
              limpiar("motivoDetalle");
            }}
            onDetalle={(v) => {
              setMotivoDetalle(v);
              limpiar("motivoDetalle");
            }}
            errores={errores}
          />

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
              error={errores.fechaRealizada}
            />
            <CampoTexto
              label="Realizado por"
              obligatorio
              value={realizadoPor}
              onChange={(v) => {
                setRealizadoPor(v);
                limpiar("realizadoPor");
              }}
              error={errores.realizadoPor}
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
