/**
 * Doble de `notificaciones_enviadas` y de los flags de compatibilidad de
 * `terminations`.
 *
 * Se escribe a mano porque la regla que Task 7 debe cumplir es de
 * atomicidad: la notificación pasa a `enviada` y la desvinculación queda
 * marcada **en la misma transacción**, o no pasa ninguna de las dos. Un
 * `jest.fn()` por método no puede expresar eso; este store cuenta las
 * transacciones confirmadas y solo aplica sus escrituras al confirmar.
 */

export type FilaNotificacion = {
  id: string;
  tipo: string;
  destinatarios: string[];
  asunto: string;
  cuerpo: string;
  documentoIds: string[];
  estado: 'pendiente' | 'enviada' | 'fallida';
  mensajeError: string | null;
  enviadaPor: string;
  aceptadaEn: Date | null;
  createdAt: Date;
  requestId: string | null;
  terminationId: string | null;
};

export function crearStoreNotificaciones() {
  const filas: FilaNotificacion[] = [];
  const terminaciones: Record<string, { notificadoRrhh: boolean; fechaNotificacionRrhh: Date }> =
    {};
  const estado = { transaccionesConfirmadas: 0 };
  let secuencia = 0;

  const notificacionEnviada = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      secuencia += 1;
      const fila: FilaNotificacion = {
        id: `notificacion-${secuencia}`,
        tipo: data.tipo as string,
        destinatarios: (data.destinatarios as string[]) ?? [],
        asunto: data.asunto as string,
        cuerpo: data.cuerpo as string,
        documentoIds: (data.documentoIds as string[]) ?? [],
        estado: (data.estado as FilaNotificacion['estado']) ?? 'pendiente',
        mensajeError: null,
        enviadaPor: data.enviadaPor as string,
        aceptadaEn: null,
        createdAt: new Date('2026-03-04T12:34:56.000Z'),
        requestId: (data.requestId as string) ?? null,
        terminationId: (data.terminationId as string) ?? null,
      };
      filas.push(fila);
      return { ...fila };
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const fila = filas.find((candidata) => candidata.id === where.id);
      return fila ? { ...fila } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const fila = filas.find((candidata) => candidata.id === where.id);
      if (!fila) throw new Error('P2025');
      Object.assign(fila, data);
      return { ...fila };
    },
    /** El guard contra doble envío: solo avanza una fila que no esté enviada. */
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; estado?: unknown };
      data: Record<string, unknown>;
    }) => {
      const fila = filas.find((candidata) => candidata.id === where.id);
      if (!fila) return { count: 0 };
      const filtroEstado = where.estado as { not?: string } | string | undefined;
      if (typeof filtroEstado === 'string' && fila.estado !== filtroEstado) return { count: 0 };
      if (filtroEstado && typeof filtroEstado === 'object' && filtroEstado.not === fila.estado) {
        return { count: 0 };
      }
      Object.assign(fila, data);
      return { count: 1 };
    },
  };

  const termination = {
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      terminaciones[where.id] = {
        notificadoRrhh: data.notificadoRrhh as boolean,
        fechaNotificacionRrhh: data.fechaNotificacionRrhh as Date,
      };
      return { id: where.id, ...terminaciones[where.id] };
    },
  };

  /**
   * Las escrituras de la transacción se acumulan y solo se aplican al final:
   * si el callback lanza, el store queda como estaba.
   */
  async function $transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
    const instantanea = {
      filas: filas.map((fila) => ({ ...fila })),
      terminaciones: JSON.parse(JSON.stringify(terminaciones)) as typeof terminaciones,
    };
    try {
      const resultado = await callback({ notificacionEnviada, termination });
      estado.transaccionesConfirmadas += 1;
      return resultado;
    } catch (error) {
      filas.splice(0, filas.length, ...instantanea.filas);
      for (const clave of Object.keys(terminaciones)) delete terminaciones[clave];
      throw error;
    }
  }

  return {
    filas,
    terminaciones,
    notificacionEnviada,
    termination,
    $transaction,
    get transaccionesConfirmadas() {
      return estado.transaccionesConfirmadas;
    },
  };
}
