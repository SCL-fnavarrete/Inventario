'use client';

import { AlertCircle, CheckCircle, Clock, Mail, Paperclip, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Evidencia de los avisos a RRHH de una desvinculación.
 *
 * Reemplaza al badge "RRHH Notificado", que era un booleano sin respaldo: no
 * decía a quién se le avisó, ni cuándo, ni si el correo llegó a salir. Un
 * fallo de envío era invisible y nadie podía reintentarlo.
 */

export type NotificacionEvidencia = {
  id: string;
  tipo: string;
  destinatarios: string[];
  asunto: string;
  estado: 'pendiente' | 'enviada' | 'fallida';
  mensajeError: string | null;
  enviadaPor: string;
  aceptadaEn: string | null;
  createdAt: string;
  documentos: Array<{ id: string; numero: string; version: number }>;
};

const ETIQUETA_TIPO: Record<string, string> = {
  cierre_onboarding: 'Cierre de onboarding',
  cierre_desvinculacion: 'Cierre de desvinculación',
  alerta_equipos_pendientes: 'Alerta de equipos pendientes',
};

const ESTILO_ESTADO = {
  enviada: { icono: CheckCircle, clase: 'text-green-700 bg-green-50 border-green-200' },
  fallida: { icono: AlertCircle, clase: 'text-red-700 bg-red-50 border-red-200' },
  pendiente: { icono: Clock, clase: 'text-orange-700 bg-orange-50 border-orange-200' },
} as const;

function formatearFechaHora(iso: string): string {
  const fecha = new Date(iso);
  return fecha.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

export default function NotificationTimeline({
  notificaciones,
  puedeReintentar,
  onReintentar,
  reintentando,
}: {
  notificaciones: NotificacionEvidencia[];
  puedeReintentar: boolean;
  onReintentar: (notificacionId: string) => void;
  reintentando?: string | null;
}) {
  if (notificaciones.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No se ha enviado ningún aviso a RRHH para esta desvinculación.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {notificaciones.map((notificacion) => {
        const { icono: Icono, clase } = ESTILO_ESTADO[notificacion.estado];
        return (
          <li key={notificacion.id} className={cn('rounded-lg border p-4', clase)}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <p className="flex items-center gap-2 font-semibold">
                  <Icono size={16} />
                  {ETIQUETA_TIPO[notificacion.tipo] || notificacion.tipo}
                </p>
                <p className="text-sm break-words">{notificacion.asunto}</p>
                <p className="flex items-center gap-1 text-xs">
                  <Mail size={12} />
                  {notificacion.destinatarios.join(', ')}
                </p>
              </div>

              {notificacion.estado !== 'enviada' && puedeReintentar && (
                <button
                  type="button"
                  onClick={() => onReintentar(notificacion.id)}
                  disabled={reintentando === notificacion.id}
                  className="flex shrink-0 items-center gap-1 rounded border border-current px-2 py-1 text-xs font-medium disabled:opacity-50"
                >
                  <RefreshCw size={12} />
                  Reintentar
                </button>
              )}
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <div className="flex gap-1">
                <dt className="text-gray-600">Registrado por:</dt>
                <dd>{notificacion.enviadaPor}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-gray-600">Preparado:</dt>
                <dd>{formatearFechaHora(notificacion.createdAt)}</dd>
              </div>
              {notificacion.aceptadaEn && (
                <div className="flex gap-1 sm:col-span-2">
                  <dt className="text-gray-600">Aceptada por Microsoft Graph:</dt>
                  <dd>{formatearFechaHora(notificacion.aceptadaEn)}</dd>
                </div>
              )}
            </dl>

            {notificacion.documentos.length > 0 && (
              <p className="mt-2 flex items-center gap-1 text-xs">
                <Paperclip size={12} />
                {notificacion.documentos
                  .map((documento) => `${documento.numero} v${documento.version}`)
                  .join(' · ')}
              </p>
            )}

            {notificacion.mensajeError && (
              <p className="mt-2 break-words rounded bg-white/60 p-2 font-mono text-xs">
                {notificacion.mensajeError}
              </p>
            )}

            {notificacion.estado === 'enviada' && (
              /* "Enviada" es una afirmación acotada y conviene que se lea como tal. */
              <p className="mt-2 text-xs text-gray-600">
                Graph aceptó la solicitud de envío. No confirma que una persona la haya recibido.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
