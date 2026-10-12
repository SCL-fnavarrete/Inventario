"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, MapPin, Phone, PowerOff, Repeat, Smartphone, Tag, Trash2, User, Users } from "lucide-react";
import { ActivosTabs } from "@/modules/activos/componentes";
import { DESCRIPCION_ESTADO, formatearNumero, tonoEstadoLinea } from "@/modules/lineas";
import { FormularioLinea } from "@/modules/lineas/componentes/FormularioLinea";
import { ReasignarLinea } from "@/modules/lineas/componentes/ReasignarLinea";
import { nombrePersona, personaDe, sedeDe, type FichaLinea } from "@/modules/lineas/componentes/tipos";
import { parseApiError } from "@/shared/utilidades/apiErrors";
import { formatearFecha, formatearFechaHoraCorta } from "@/shared/utilidades/fechas";
import { useEnvio } from "@/shared/hooks/useEnvio";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { PageHeader } from "@/shared/ui/PageHeader";
import { TablaAsignaciones } from "@/shared/ui/TablaAsignaciones";
import { useToast } from "@/shared/ui/Toast";

/**
 * Ficha de una linea (SPEC 2.131): sus datos, donde esta y con quien, quien la
 * ha tenido (con cuantas veces se reasigno y el propietario anterior) y el
 * historial de sus cambios. Desde aqui se edita, se reasigna y se elimina.
 */

export function DetalleLinea({ ficha, abrirReasignar = false }: { ficha: FichaLinea; abrirReasignar?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const permisos = usePermissions();
  const { ejecutar } = useEnvio();
  const { linea, tenencias, historial, personas } = ficha;
  const deBaja = linea.estado.deBaja;
  const persona = personaDe(linea);
  // Solo se asigna una linea disponible: vigente y sin persona (SPEC 2.131).
  const asignable = !deBaja && !persona;
  const [modo, setModo] = useState<"editar" | "reasignar" | null>(abrirReasignar && asignable ? "reasignar" : null);
  const [aEliminar, setAEliminar] = useState(false);

  const tramoActual = tenencias[0];
  // Historial de Asignaciones: solo las veces que se asignó a una persona.
  const asignaciones = tenencias.filter((t) => t.empleado);
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
        leading={
          <div className="rounded-card bg-primary-50 p-3 text-primary-700">
            <Phone className="h-8 w-8" />
          </div>
        }
        title={<span className="font-mono">{formatearNumero(linea.numero)}</span>}
        description={[linea.operador?.nombre, linea.tipoChip?.nombre].filter(Boolean).join(" · ") || "Línea telefónica"}
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
              {!deBaja && (
                <Link href={`/activos/lineas/${linea.id}/baja`} className={buttonClasses({ variant: "outline" })}>
                  <PowerOff size={18} />
                  <span>Dar de baja</span>
                </Link>
              )}
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

      {/* Tarjetas de resumen, como en la ficha de un equipo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Tag className="h-5 w-5 text-fg-subtle" />
            <div>
              <p className="text-sm text-fg-subtle">Estado</p>
              <Badge variant={tonoEstadoLinea(linea.estado)}>{linea.estado.nombre}</Badge>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-fg-subtle" />
            <div>
              <p className="text-sm text-fg-subtle">Teléfono</p>
              <p className="font-medium text-fg">
                {linea.activo ? (
                  <Link href={`/activos/${linea.activo.id}`} className="text-brand hover:underline">
                    {linea.activo.marca} {linea.activo.modelo}
                  </Link>
                ) : (
                  <span className="text-fg-subtle">Ninguno</span>
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-fg-subtle" />
            <div>
              <p className="text-sm text-fg-subtle">Asignada a</p>
              <p className="font-medium text-fg">
                {persona ? (
                  <Link href={`/empleados/${persona.id}`} className="text-brand hover:underline">
                    {nombrePersona(persona)}
                  </Link>
                ) : (
                  <span className="text-fg-subtle">Disponible</span>
                )}
              </p>
              {persona?.estado === "desvinculado" && <p className="text-xs text-red-700 dark:text-red-400">Desvinculada: revisar</p>}
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-fg-subtle" />
            <div>
              <p className="text-sm text-fg-subtle">Sede</p>
              <p className="font-medium text-fg">{sedeDe(linea) ?? "Sin sede"}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-fg-subtle" />
            <div>
              <p className="text-sm text-fg-subtle">Personas</p>
              <p className="font-medium text-fg">
                {personas} {personas === 1 ? "la ha usado" : "la han usado"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-semibold text-fg">Información General</h2>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-fg-subtle">Número</dt>
                <dd className="font-mono font-medium text-fg">{formatearNumero(linea.numero)}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-subtle">Operador</dt>
                <dd className="font-medium text-fg">{linea.operador?.nombre ?? "Sin indicar"}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-subtle">Tipo de chip</dt>
                <dd className="font-medium text-fg">{linea.tipoChip?.nombre ?? "Sin indicar"}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-subtle">Estado</dt>
                <dd className="font-medium text-fg">
                  {linea.estado.nombre}
                  <span className="block text-xs font-normal text-fg-subtle">{DESCRIPCION_ESTADO[linea.estado.clave ?? ""]}</span>
                </dd>
              </div>
              {tramoActual && !tramoActual.hasta && (
                <div>
                  <dt className="text-sm text-fg-subtle">Con este destino desde</dt>
                  <dd className="font-medium text-fg">{formatearFecha(tramoActual.desde)}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-fg-subtle">Propietario anterior</dt>
                <dd className="font-medium text-fg">
                  {anterior?.empleado ? (
                    <>
                      <Link href={`/empleados/${anterior.empleado.id}`} className="text-brand hover:underline">
                        {nombrePersona(anterior.empleado)}
                      </Link>
                      {anterior.hasta && <span className="block text-xs font-normal text-fg-subtle">hasta el {formatearFecha(anterior.hasta)}</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {linea.fechaBaja && (
                <div>
                  <dt className="text-sm text-fg-subtle">Fecha de baja</dt>
                  <dd className="font-medium text-fg">{formatearFecha(linea.fechaBaja)}</dd>
                </div>
              )}
            </dl>
          </div>

          {linea.observaciones && (
            <div className="card p-6">
              <h2 className="mb-4 text-lg font-semibold text-fg">Observaciones</h2>
              <p className="whitespace-pre-wrap text-fg-muted">{linea.observaciones}</p>
            </div>
          )}

          <section aria-labelledby="quien-la-tuvo" className="card space-y-3 p-6">
            <h2 id="quien-la-tuvo" className="text-lg font-semibold text-fg">
              Historial de Asignaciones
            </h2>
            <TablaAsignaciones
              vacio="Todavía no se ha asignado a ninguna persona"
              tituloExtra="Teléfono"
              filas={asignaciones.map((t) => ({
                id: t.id,
                desde: t.desde,
                hasta: t.hasta,
                vigente: !t.hasta,
                persona: { nombre: nombrePersona(t.empleado!), enlace: `/empleados/${t.empleado!.id}` },
                extra: t.activo ? (
                  <Link href={`/activos/${t.activo.id}`} className="text-brand hover:underline">
                    {t.activo.marca} {t.activo.modelo}
                  </Link>
                ) : (
                  <span className="text-fg-subtle">Personal o eSIM</span>
                ),
              }))}
            />
          </section>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-semibold text-fg">Historial de Eventos</h2>
            {historial.length === 0 ? (
              <p className="py-4 text-center text-fg-subtle">No hay eventos registrados</p>
            ) : (
              <div className="space-y-4">
                {historial.map((e) => (
                  <div key={e.id} className="relative border-l-2 border-line pb-4 pl-6 last:pb-0">
                    <div className="absolute -left-2 top-0 h-4 w-4 rounded-full bg-primary-500" />
                    <p className="text-sm text-fg">{e.descripcion}</p>
                    <p className="mt-1 text-xs text-fg-subtle">
                      Rige desde {formatearFecha(e.vigenteDesde)} · registrado {formatearFechaHoraCorta(e.createdAt)}
                      {e.usuario && ` por ${e.usuario}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={aEliminar}
        onClose={() => setAEliminar(false)}
        onConfirm={() => ejecutar(eliminar)}
        variant="danger"
        title="Eliminar línea"
        message={`La línea ${formatearNumero(linea.numero)} se eliminará. Úsalo solo si se ingresó por error; si ya no se usa, pásala a Baja. En la auditoría quedará quién la eliminó.`}
        confirmLabel="Eliminar"
      />
    </div>
  );
}
