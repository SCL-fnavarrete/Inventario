import type { Prisma, TipoEventoLinea } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { formatearNumero } from '@/modules/lineas/validaciones';
import { NOMBRE } from '@/modules/activos';

/**
 * Historial de una linea (SPEC 2.131), como el de los activos: cada cambio
 * de estado, celular o persona es un evento con lo que habia, lo que quedo,
 * quien lo hizo y desde cuando rige.
 */

/** Lo que el historial necesita de una linea, con los nombres para describir el cambio. */
export const CON_NOMBRES = {
  estado: { select: { nombre: true, deBaja: true } },
  tipoChip: { select: { nombre: true, sinCelular: true } },
  operador: { select: { nombre: true } },
  activo: { select: { marca: NOMBRE, modelo: true, imei: true } },
  empleado: { select: { nombres: true, apellidoPaterno: true } },
} satisfies Prisma.LineaTelefonicaInclude;
export type LineaConNombres = Prisma.LineaTelefonicaGetPayload<{ include: typeof CON_NOMBRES }>;

const nombreCelular = (l: LineaConNombres) => (l.activo ? `${l.activo.marca.nombre} ${l.activo.modelo}` : '—');
const nombrePersona = (l: LineaConNombres) => (l.empleado ? `${l.empleado.nombres} ${l.empleado.apellidoPaterno}` : '—');

/** Otros datos que se editan sin evento propio, con su nombre para la descripcion. */
const OTROS: [keyof LineaConNombres, string][] = [
  ['numero', 'número'],
  ['tipoChipId', 'tipo de chip'],
  ['operadorId', 'operador'],
  ['observaciones', 'observaciones'],
];

type Evento = {
  tipo: TipoEventoLinea;
  descripcion: string;
  datosAnteriores?: Prisma.InputJsonValue;
  datosNuevos?: Prisma.InputJsonValue;
  rige?: boolean;
};

/**
 * Registra el alta o los cambios de una linea. `antes` null es el alta
 * (creacion o importacion): guarda su estado inicial. El cambio de estado
 * rige desde `vigenteDesde`; los demas, desde ahora.
 */
export async function registrarHistorial(
  tx: Prisma.TransactionClient,
  antes: LineaConNombres | null,
  despues: LineaConNombres,
  {
    usuario,
    vigenteDesde = new Date(),
    alta = 'creacion',
    observaciones,
  }: { usuario?: string | null; vigenteDesde?: Date; alta?: 'creacion' | 'importacion'; observaciones?: string | null }
) {
  const eventos: Evento[] = [];
  const inicial = { estadoId: despues.estadoId, deBaja: despues.estado.deBaja };
  if (!antes) {
    eventos.push({
      tipo: alta,
      descripcion: `Línea ${formatearNumero(despues.numero)} ${alta === 'importacion' ? 'importada' : 'creada'}: ${despues.estado.nombre}`,
      datosNuevos: inicial,
      rige: true,
    });
  } else {
    if (antes.estadoId !== despues.estadoId) {
      eventos.push({
        tipo: 'estado',
        descripcion: `Estado: ${antes.estado.nombre} → ${despues.estado.nombre}${despues.estado.deBaja && despues.motivoBaja ? `. Motivo: ${despues.motivoBaja}` : ''}${observaciones?.trim() ? ` (${observaciones.trim()})` : ''}`,
        datosAnteriores: { estadoId: antes.estadoId, deBaja: antes.estado.deBaja },
        datosNuevos: { estadoId: despues.estadoId, deBaja: despues.estado.deBaja },
        rige: true,
      });
    }
    if (antes.activoId !== despues.activoId) {
      eventos.push({
        tipo: 'celular',
        descripcion: `Celular: ${nombreCelular(antes)} → ${nombreCelular(despues)}`,
        datosAnteriores: { activoId: antes.activoId },
        datosNuevos: { activoId: despues.activoId },
      });
    }
    if (antes.empleadoId !== despues.empleadoId) {
      eventos.push({
        tipo: 'persona',
        descripcion: `Persona (teléfono personal): ${nombrePersona(antes)} → ${nombrePersona(despues)}`,
        datosAnteriores: { empleadoId: antes.empleadoId },
        datosNuevos: { empleadoId: despues.empleadoId },
      });
    }
    const otros = OTROS.filter(([k]) => antes[k] !== despues[k]);
    if (otros.length) {
      eventos.push({
        tipo: 'datos',
        descripcion: `Datos editados: ${otros.map(([, n]) => n).join(', ')}`,
        datosAnteriores: Object.fromEntries(otros.map(([k]) => [k, antes[k] as string | null])),
        datosNuevos: Object.fromEntries(otros.map(([k]) => [k, despues[k] as string | null])),
      });
    }
  }
  if (eventos.length === 0) return;
  const ahora = new Date();
  await tx.lineaHistorial.createMany({
    data: eventos.map(({ rige, ...e }) => ({ ...e, lineaId: despues.id, usuario, vigenteDesde: rige ? vigenteDesde : ahora })),
  });
}

const ETIQUETA_ORIGEN: Record<string, string> = {
  entrega_telefono: 'Se entregó el teléfono',
  devolucion_telefono: 'Se devolvió el teléfono',
  termino: 'Devolución por término',
};

type Lugar = { activoId: string | null; empleadoId: string | null };

/**
 * Anota en el historial que la linea cambio de lugar (SPEC 2.131): a quien se
 * asigno y en que celular, o que quedo disponible. Lo llama la tenencia en cada
 * cambio, asi el historial recoge tambien las asignaciones hechas por Reasignar
 * o por las solicitudes.
 */
export async function registrarMovimiento(
  tx: Prisma.TransactionClient,
  lineaId: string,
  antes: Lugar,
  despues: Lugar,
  c: { desde: Date; origen: string; usuario?: string | null; motivoId?: string | null; detalle?: string | null }
) {
  const [persona, celular, motivo] = await Promise.all([
    despues.empleadoId ? tx.employee.findUnique({ where: { id: despues.empleadoId }, select: { nombres: true, apellidoPaterno: true } }) : null,
    despues.activoId ? tx.asset.findUnique({ where: { id: despues.activoId }, select: { marca: NOMBRE, modelo: true } }) : null,
    c.motivoId ? tx.motivoReasignacion.findUnique({ where: { id: c.motivoId }, select: { nombre: true } }) : null,
  ]);
  const nombre = persona ? `${persona.nombres} ${persona.apellidoPaterno}` : '';
  const equipo = celular ? `${celular.marca.nombre} ${celular.modelo}` : '';
  const que = persona
    ? `Asignada a ${nombre}${equipo ? ` en el celular ${equipo}` : ' (eSIM o teléfono personal)'}`
    : equipo
      ? `Queda en el celular ${equipo}, sin persona`
      : 'Queda disponible';
  const porque = [motivo?.nombre, c.detalle].filter(Boolean).join(' · ') || ETIQUETA_ORIGEN[c.origen];
  await tx.lineaHistorial.create({
    data: {
      lineaId,
      tipo: antes.activoId !== despues.activoId ? 'celular' : 'persona',
      descripcion: porque ? `${que}. ${porque}` : que,
      datosAnteriores: { activoId: antes.activoId, empleadoId: antes.empleadoId },
      datosNuevos: { activoId: despues.activoId, empleadoId: despues.empleadoId },
      vigenteDesde: c.desde,
      usuario: c.usuario ?? null,
    },
  });
}

/**
 * Al eliminar una linea (se llama antes de borrarla), su historial queda con un
 * evento de cierre.
 */
export async function registrarEliminacion(tx: Prisma.TransactionClient, linea: LineaConNombres, usuario?: string | null) {
  await tx.lineaHistorial.create({
    data: {
      lineaId: linea.id,
      tipo: 'eliminacion',
      descripcion: `Línea ${formatearNumero(linea.numero)} eliminada`,
      datosAnteriores: { estadoId: linea.estadoId },
      datosNuevos: { deBaja: true },
      vigenteDesde: new Date(),
      usuario,
    },
  });
}

/** Historial de una linea, del mas nuevo al mas antiguo. */
export function historialLinea(lineaId: string) {
  return prisma.lineaHistorial.findMany({
    where: { lineaId },
    orderBy: [{ vigenteDesde: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, tipo: true, descripcion: true, vigenteDesde: true, usuario: true, createdAt: true },
  });
}
