import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatearFecha } from '@/lib/utils/fechas';
import { etiquetaCondicionCargador } from '@/lib/constants/condicionCargador';

/** Asignacion de un ticket tal como la entrega GET /api/solicitudes/[id]. */
export type AsignacionFila = {
  id: string;
  activo?: boolean;
  fechaEntrega?: string | null;
  entregadoPor?: string | null;
  fechaDevolucion?: string | null;
  recibidoPor?: string | null;
  estadoDevolucion?: string | null;
  observacionesDevolucion?: string | null;
  condicionCargadorEntrega?: string | null;
  // No se devolvio en este ticket sino en uno posterior (SPEC 2.87).
  recuperadoEn?: { id: string; numero: string } | null;
  asset: {
    id: string;
    marca: string;
    modelo: string;
    numeroSerie: string | null;
    categoria: { nombre: string };
  };
};

const DEVOLUCION: Record<string, { texto: string; clase: string }> = {
  ok: { texto: 'Buen estado', clase: 'bg-green-100 text-green-700' },
  danado: { texto: 'Dañado', clase: 'bg-red-100 text-red-700' },
  no_devuelto: { texto: 'No devolvió', clase: 'bg-amber-100 text-amber-800' },
};

/**
 * Un equipo de la solicitud: categoria, marca y modelo (enlace a su ficha) y
 * una linea de detalle. Comun a Equipos Entregados, Devueltos y Cambiados.
 *   - entrega:    cuando y quien lo entrego, su cargador y, si ya volvio, cuando.
 *   - devolucion: estado en que volvio (etiqueta), cuando y quien lo recibio.
 */
export function FilaEquipoTicket({
  asignacion: a,
  modo,
  prefijo,
  destacado = false,
}: {
  asignacion: AsignacionFila;
  modo: 'entrega' | 'devolucion';
  /** "Anterior" / "Nuevo" en un cambio de equipo. */
  prefijo?: string;
  destacado?: boolean;
}) {
  // Recuperado despues: en ESTE ticket no se devolvio.
  const recuperado = modo === 'devolucion' ? a.recuperadoEn : null;
  const estado = recuperado ? 'no_devuelto' : a.estadoDevolucion;
  const devolucion = modo === 'devolucion' && estado ? DEVOLUCION[estado] : null;
  const cargador = etiquetaCondicionCargador(a.condicionCargadorEntrega, 'entrega');

  const detalle: ReactNode[] =
    modo === 'entrega'
      ? [
          a.fechaEntrega && `Entregado el ${formatearFecha(a.fechaEntrega)}`,
          a.entregadoPor && `Por ${a.entregadoPor}`,
          cargador && `Cargador: ${cargador}`,
          a.activo === false && a.fechaDevolucion && `Devuelto el ${formatearFecha(a.fechaDevolucion)}`,
        ]
      : recuperado
        ? [
            <>
              Lo entregó después en{' '}
              <Link href={`/solicitudes/${recuperado.id}`} className="text-primary-700 hover:underline">
                {recuperado.numero}
              </Link>
            </>,
          ]
        : [
            a.estadoDevolucion === 'no_devuelto'
              ? 'Sigue asignado, a la espera de recuperarlo'
              : a.fechaDevolucion && `Devuelto el ${formatearFecha(a.fechaDevolucion)}`,
            a.recibidoPor && `Registrado por ${a.recibidoPor}`,
          ];
  const partes = [a.asset.numeroSerie && `S/N: ${a.asset.numeroSerie}`, ...detalle].filter(Boolean);

  return (
    <div className={cn('text-sm p-3 rounded-lg', destacado ? 'bg-green-50' : 'bg-surface-muted')}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-fg">
          {prefijo && `${prefijo}: `}
          {a.asset.categoria.nombre}
          {' — '}
          <Link href={`/activos/${a.asset.id}`} className="hover:text-primary-700 hover:underline">
            {a.asset.marca} {a.asset.modelo}
          </Link>
        </span>
        {devolucion && (
          <span className={cn('text-xs px-1.5 py-0.5 rounded flex-shrink-0', devolucion.clase)}>
            {devolucion.texto}
          </span>
        )}
      </div>
      <span className="block text-xs text-fg-subtle mt-0.5">
        {partes.map((parte, i) => (
          <Fragment key={i}>
            {i > 0 && ' · '}
            {parte}
          </Fragment>
        ))}
      </span>
      {modo === 'devolucion' && !recuperado && a.observacionesDevolucion && (
        <p className="text-xs text-fg-muted mt-1">Observaciones: {a.observacionesDevolucion}</p>
      )}
    </div>
  );
}
