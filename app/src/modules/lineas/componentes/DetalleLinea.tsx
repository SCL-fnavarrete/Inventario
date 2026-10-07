"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Repeat, Trash2 } from "lucide-react";
import { ActivosTabs } from "@/modules/activos/componentes";
import { DESCRIPCION_ESTADO, formatearNumero, tonoEstadoLinea } from "@/modules/lineas";
import { FormularioLinea } from "@/modules/lineas/componentes/FormularioLinea";
import { ReasignarLinea } from "@/modules/lineas/componentes/ReasignarLinea";
import { ORIGEN_TENENCIA, nombrePersona, personaDe, type FichaLinea } from "@/modules/lineas/componentes/tipos";
import { parseApiError } from "@/shared/utilidades/apiErrors";
import { formatearFecha, formatearFechaHoraCorta } from "@/shared/utilidades/fechas";
import { formatearClp } from "@/shared/utilidades/moneda";
import { useEnvio } from "@/shared/hooks/useEnvio";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { PageHeader } from "@/shared/ui/PageHeader";
import { TablaAdaptable } from "@/shared/ui/TablaAdaptable";
import { useToast } from "@/shared/ui/Toast";

/**
 * Ficha de una linea (SPEC 2.131): sus datos, donde esta y con quien, quien la
 * ha tenido (con cuantas veces se reasigno y el propietario anterior) y el
 * historial de sus cambios. Desde aqui se edita, se reasigna y se elimina.
 */

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase text-fg-subtle">{titulo}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

export function DetalleLinea({ ficha, abrirReasignar = false }: { ficha: FichaLinea; abrirReasignar?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const permisos = usePermissions();
  const { ejecutar } = useEnvio();
  const { linea, tenencias, historial, reasignaciones } = ficha;
  const deBaja = linea.estado.deBaja;
  const persona = personaDe(linea);
  // Solo se asigna una linea disponible: vigente y sin persona (SPEC 2.131).
  const asignable = !deBaja && !persona;
  const [modo, setModo] = useState<"editar" | "reasignar" | null>(abrirReasignar && asignable ? "reasignar" : null);
  const [aEliminar, setAEliminar] = useState(false);

  const tramoActual = tenencias[0];
  // El ultimo que la tuvo antes de quien la tiene ahora.
  const anterior = tenencias.slice(1).find((t) => t.empleado && t.empleadoId !== persona?.id);

  const cerrar = (guardada: boolean) => {
    setModo(null);
    if (guardada) router.refresh();
  };

  const eliminar = async () => {
    setAEliminar(false);
    const res = await fetch(`/api/lineas/${linea.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast.error(res ? (await parseApiError(res, "Error al eliminar la línea")).message : "Error al eliminar la línea");
      return;
    }
    toast.success("Línea eliminada");
    router.push("/activos/lineas");
  };

  return (
    <div className="space-y-6">
      <ActivosTabs />
      <PageHeader
        backHref="/activos/lineas"
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{formatearNumero(linea.numero)}</span>
            <Badge variant={tonoEstadoLinea(linea.estado)}>{linea.estado.nombre}</Badge>
          </span>
        }
        description={[linea.plan?.nombre, linea.precioMensual != null && `${formatearClp(linea.precioMensual)} al mes`, linea.tipoChip?.nombre].filter(Boolean).join(" · ") || "Línea telefónica"}
        actions={
          !modo && (
            <>
              {asignable && (
                <Button leftIcon={<Repeat size={18} />} onClick={() => setModo("reasignar")}>
                  Asignar
                </Button>
              )}
              <Button variant="outline" leftIcon={<Edit size={18} />} onClick={() => setModo("editar")}>
                Editar
              </Button>
              {permisos.can("lineas", "delete") && (
                <Button variant="danger" leftIcon={<Trash2 size={18} />} onClick={() => setAEliminar(true)}>
                  Eliminar
                </Button>
              )}
            </>
          )
        }
      />

      {modo === "editar" && <FormularioLinea linea={linea} onCerrar={cerrar} />}
      {modo === "reasignar" && <ReasignarLinea linea={linea} onCerrar={cerrar} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-fg">Plan y costo</h3>
          <dl className="space-y-2">
            <Dato titulo="Plan">{linea.plan?.nombre ?? "—"}</Dato>
            <Dato titulo="Precio mensual">{formatearClp(linea.precioMensual)}</Dato>
            <Dato titulo="Tipo de chip">{linea.tipoChip?.nombre ?? "Sin indicar"}</Dato>
            <Dato titulo="Operador">{linea.operador?.nombre ?? "Sin indicar"}</Dato>
          </dl>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-fg">Estado</h3>
          <dl className="space-y-2">
            <Dato titulo="Estado">{linea.estado.nombre}</Dato>
            <p className="text-xs text-fg-subtle">{DESCRIPCION_ESTADO[linea.estado.clave ?? ""]}</p>
            {linea.fechaBaja && <Dato titulo="Fecha de baja">{formatearFecha(linea.fechaBaja)}</Dato>}
          </dl>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-fg">Dónde está y quién la tiene</h3>
          <dl className="space-y-2">
            <Dato titulo="Teléfono de la empresa">
              {linea.activo ? (
                <Link href={`/activos/${linea.activo.id}`} className="text-brand hover:underline">
                  {linea.activo.marca} {linea.activo.modelo}
                </Link>
              ) : (
                <span className="text-fg-subtle">{persona ? "Ninguno (eSIM o teléfono personal)" : "Ninguno"}</span>
              )}
            </Dato>
            <Dato titulo="Persona">
              {persona ? (
                <>
                  <Link href={`/empleados/${persona.id}`} className="text-brand hover:underline">
                    {nombrePersona(persona)}
                  </Link>
                  {persona.estado === "desvinculado" && <span className="block text-xs text-red-700 dark:text-red-400">Persona desvinculada: revisar</span>}
                </>
              ) : (
                <span className="text-fg-subtle">Sin persona{linea.responsable ? ` · ${linea.responsable}` : ""}</span>
              )}
            </Dato>
            <Dato titulo="Sede">{linea.sede?.nombre ?? <span className="text-fg-subtle">Sin sede</span>}</Dato>
            {tramoActual && !tramoActual.hasta && <Dato titulo="Desde">{formatearFecha(tramoActual.desde)}</Dato>}
          </dl>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-fg">Cambios</h3>
          <p className="text-3xl font-bold text-fg">{reasignaciones}</p>
          <p className="mb-3 text-xs text-fg-subtle">{reasignaciones === 1 ? "vez cambió de lugar o de persona" : "veces cambió de lugar o de persona"}</p>
          <dl>
            <Dato titulo="Propietario anterior">
              {anterior?.empleado ? (
                <>
                  <Link href={`/empleados/${anterior.empleado.id}`} className="text-brand hover:underline">
                    {nombrePersona(anterior.empleado)}
                  </Link>
                  {anterior.hasta && <span className="block text-xs text-fg-subtle">hasta el {formatearFecha(anterior.hasta)}</span>}
                </>
              ) : (
                <span className="text-fg-subtle">—</span>
              )}
            </Dato>
          </dl>
        </div>
      </div>

      {linea.observaciones && (
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-fg">Observaciones</h3>
          <p className="whitespace-pre-wrap text-sm text-fg-muted">{linea.observaciones}</p>
        </div>
      )}

      <section aria-labelledby="quien-la-tuvo" className="space-y-3">
        <h2 id="quien-la-tuvo" className="text-lg font-semibold text-fg">
          Quién la ha tenido
        </h2>
        <TablaAdaptable
          items={tenencias}
          clave={(t) => t.id}
          vacio="Todavía no hay registro de quién la ha tenido"
          resaltada={(t) => !t.hasta}
          columnas={[
            {
              titulo: "Desde",
              celda: (t) => (
                <>
                  {formatearFecha(t.desde)}
                  {!t.hasta && (
                    <span className="ml-2">
                      <Badge variant="success">Actual</Badge>
                    </span>
                  )}
                </>
              ),
            },
            { titulo: "Hasta", celda: (t) => (t.hasta ? formatearFecha(t.hasta) : "—") },
            {
              titulo: "Persona",
              celda: (t) =>
                t.empleado ? (
                  <Link href={`/empleados/${t.empleado.id}`} className="text-brand hover:underline">
                    {nombrePersona(t.empleado)}
                  </Link>
                ) : (
                  <span className="text-fg-subtle">Sin persona{t.responsable ? ` · ${t.responsable}` : ""}</span>
                ),
            },
            {
              titulo: "Teléfono",
              celda: (t) =>
                t.activo ? (
                  <Link href={`/activos/${t.activo.id}`} className="text-brand hover:underline">
                    {t.activo.marca} {t.activo.modelo}
                  </Link>
                ) : (
                  <span className="text-fg-subtle">{t.empleado ? "Personal o eSIM" : "—"}</span>
                ),
            },
            { titulo: "Sede", celda: (t) => t.sede?.nombre ?? <span className="text-fg-subtle">—</span> },
            {
              titulo: "Cómo empezó",
              celda: (t) => (
                <>
                  {ORIGEN_TENENCIA[t.origen] ?? t.origen}
                  {(t.motivo || t.detalle) && (
                    <span className="block text-xs text-fg-subtle">{[t.motivo?.nombre, t.detalle].filter(Boolean).join(" · ")}</span>
                  )}
                </>
              ),
            },
            { titulo: "Registrado por", celda: (t) => <span className="text-fg-subtle">{t.usuario ?? "Automático"}</span> },
          ]}
          tarjeta={(t) => (
            <>
              <p className="font-medium text-fg">
                {t.empleado ? nombrePersona(t.empleado) : `Sin persona${t.responsable ? ` · ${t.responsable}` : ""}`}
              </p>
              <p className="text-xs text-fg-muted">
                {formatearFecha(t.desde)} → {t.hasta ? formatearFecha(t.hasta) : "actual"} · {ORIGEN_TENENCIA[t.origen] ?? t.origen}
              </p>
            </>
          )}
        />
      </section>

      <section aria-labelledby="historial-cambios" className="space-y-3">
        <h2 id="historial-cambios" className="text-lg font-semibold text-fg">
          Historial de cambios
        </h2>
        {historial.length === 0 ? (
          <p className="card px-6 py-6 text-center text-fg-subtle">Sin eventos.</p>
        ) : (
          <ol className="card space-y-3 p-4">
            {historial.map((e) => (
              <li key={e.id} className="border-l-2 border-line pl-3">
                <p className="text-sm text-fg">{e.descripcion}</p>
                <p className="text-xs text-fg-subtle">
                  Rige desde {formatearFecha(e.vigenteDesde)} · registrado {formatearFechaHoraCorta(e.createdAt)}
                  {e.usuario && ` por ${e.usuario}`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmDialog
        isOpen={aEliminar}
        onClose={() => setAEliminar(false)}
        onConfirm={() => ejecutar(eliminar)}
        variant="danger"
        title="Eliminar línea"
        message={`La línea ${formatearNumero(linea.numero)} se eliminará. Úsalo solo si se ingresó por error; si ya no se usa, pásala a Dada de baja. El costo de los meses en que existió se conserva y deja de contar desde hoy. En la auditoría quedará quién la eliminó.`}
        confirmLabel="Eliminar"
      />
    </div>
  );
}
