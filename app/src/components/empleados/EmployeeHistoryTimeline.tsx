'use client';

type TipoEventoEmpleado =
  | 'creacion'
  | 'actualizacion'
  | 'sync_microsoft'
  | 'cambio_estado'
  | 'desvinculacion'
  | 'reactivacion';

export type EmployeeHistoryEvent = {
  id: string;
  tipoEvento: TipoEventoEmpleado;
  descripcion: string;
  usuarioSistema: string;
  createdAt: string;
  datosAnteriores: Record<string, unknown> | null;
  datosNuevos: Record<string, unknown> | null;
};

const EVENT_LABELS: Record<TipoEventoEmpleado, string> = {
  creacion: 'Creación',
  actualizacion: 'Actualización',
  sync_microsoft: 'Sincronización Microsoft',
  cambio_estado: 'Cambio de estado',
  desvinculacion: 'Desvinculación',
  reactivacion: 'Reactivación',
};

const SNAPSHOT_LABELS: Record<string, string> = {
  rut: 'RUT',
  nombres: 'Nombres',
  apellidoPaterno: 'Apellido paterno',
  apellidoMaterno: 'Apellido materno',
  correo: 'Correo',
  cargo: 'Cargo',
  jefatura: 'Jefatura',
  supervisor: 'Supervisor',
  ubicacion: 'Ubicación',
  tipoContrato: 'Tipo de contrato',
  fechaIngreso: 'Fecha de ingreso',
  fechaTermino: 'Fecha de término',
  estado: 'Estado',
  telefonoContacto: 'Teléfono de contacto',
  origenMicrosoft: 'Origen Microsoft',
  fechaEntregaEpp: 'Entrega EPP',
  fechaEntregaKit: 'Entrega kit',
  proximaMantencionEpp: 'Próxima mantención EPP',
};

function formatDate(date: string): string {
  return new Date(date).toLocaleString('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function Snapshot({ title, data }: { title: string; data: Record<string, unknown> | null }) {
  const entries = Object.entries(data || {}).filter(([key, value]) => {
    return key in SNAPSHOT_LABELS && value !== null && value !== undefined;
  });

  if (entries.length === 0) return null;

  return (
    <section className="rounded border border-gray-200 bg-gray-50 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h4>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-1">
            <dt className="text-gray-500">{SNAPSHOT_LABELS[key]}:</dt>
            <dd className="font-medium text-gray-800">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function EmployeeHistoryTimeline({
  historial,
}: {
  historial: EmployeeHistoryEvent[];
}) {
  if (historial.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-sm text-gray-500">
        Sin eventos registrados.
      </p>
    );
  }

  return (
    <ol className="space-y-4" aria-label="Historial del empleado">
      {historial.map((evento) => (
        <li key={evento.id} className="relative border-l-2 border-blue-200 pl-5">
          <span
            className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-blue-600"
            aria-hidden="true"
          />
          <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-semibold text-gray-900">{EVENT_LABELS[evento.tipoEvento]}</h3>
              <time className="text-sm text-gray-500" dateTime={evento.createdAt}>
                {formatDate(evento.createdAt)}
              </time>
            </div>
            <p className="mt-2 text-sm text-gray-700">{evento.descripcion}</p>
            <p className="mt-2 text-sm text-gray-500">
              Actor: <span className="font-medium text-gray-700">{evento.usuarioSistema}</span>
            </p>
            {(evento.datosAnteriores || evento.datosNuevos) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:text-blue-800">
                  Ver snapshots
                </summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <Snapshot title="Antes" data={evento.datosAnteriores} />
                  <Snapshot title="Después" data={evento.datosNuevos} />
                </div>
              </details>
            )}
          </article>
        </li>
      ))}
    </ol>
  );
}
