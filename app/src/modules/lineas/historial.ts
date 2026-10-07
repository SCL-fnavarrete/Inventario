import type { Prisma, TipoEventoLinea } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { formatearClp } from '@/shared/utilidades/moneda';
import { formatearNumero } from '@/modules/lineas/validaciones';

/**
 * Historial de una linea (SPEC 2.131), como el de los activos: cada cambio
 * de precio, plan, estado, celular o persona es un evento con lo que habia,
 * lo que quedo, quien lo hizo y desde cuando rige. Con los eventos de precio
 * y estado se calcula lo que costo cada mes.
 */

/** Lo que el historial necesita de una linea, con los nombres para describir el cambio. */
export const CON_NOMBRES = {
  plan: { select: { nombre: true } },
  estado: { select: { nombre: true, deBaja: true } },
  tipoChip: { select: { nombre: true, sinCelular: true } },
  operador: { select: { nombre: true } },
  activo: { select: { marca: true, modelo: true, imei: true } },
  empleado: { select: { nombres: true, apellidoPaterno: true } },
} satisfies Prisma.LineaTelefonicaInclude;
export type LineaConNombres = Prisma.LineaTelefonicaGetPayload<{ include: typeof CON_NOMBRES }>;

const nombreCelular = (l: LineaConNombres) => (l.activo ? `${l.activo.marca} ${l.activo.modelo}` : '—');
const nombrePersona = (l: LineaConNombres) => (l.empleado ? `${l.empleado.nombres} ${l.empleado.apellidoPaterno}` : '—');
const precio = (n: number | null) => (n == null ? 'sin precio' : formatearClp(n));

/** Otros datos que se editan sin evento propio, con su nombre para la descripcion. */
const OTROS: [keyof LineaConNombres, string][] = [
  ['numero', 'número'],
  ['tipoChipId', 'tipo de chip'],
  ['operadorId', 'operador'],
  ['sedeId', 'sede'],
  ['responsable', 'nota'],
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
 * (creacion o importacion): guarda su precio y estado iniciales. Los cambios
 * de precio y de estado rigen desde `vigenteDesde`; los demas, desde ahora.
 */
export async function registrarHistorial(
  tx: Prisma.TransactionClient,
  antes: LineaConNombres | null,
  despues: LineaConNombres,
  { usuario, vigenteDesde = new Date(), alta = 'creacion' }: { usuario?: string | null; vigenteDesde?: Date; alta?: 'creacion' | 'importacion' }
) {
  const eventos: Evento[] = [];
  const inicial = { precioMensual: despues.precioMensual, estadoId: despues.estadoId, deBaja: despues.estado.deBaja, planId: despues.planId };
  if (!antes) {
    eventos.push({
      tipo: alta,
      descripcion: `Línea ${formatearNumero(despues.numero)} ${alta === 'importacion' ? 'importada' : 'creada'}: ${despues.estado.nombre}, ${precio(despues.precioMensual)}`,
      datosNuevos: inicial,
      rige: true,
    });
  } else {
    if (antes.precioMensual !== despues.precioMensual) {
      eventos.push({
        tipo: 'precio',
        descripcion: `Precio: ${precio(antes.precioMensual)} → ${precio(despues.precioMensual)}`,
        datosAnteriores: { precioMensual: antes.precioMensual },
        datosNuevos: { precioMensual: despues.precioMensual },
        rige: true,
      });
    }
    if (antes.estadoId !== despues.estadoId) {
      eventos.push({
        tipo: 'estado',
        descripcion: `Estado: ${antes.estado.nombre} → ${despues.estado.nombre}`,
        datosAnteriores: { estadoId: antes.estadoId, deBaja: antes.estado.deBaja },
        datosNuevos: { estadoId: despues.estadoId, deBaja: despues.estado.deBaja },
        rige: true,
      });
    }
    if (antes.planId !== despues.planId) {
      eventos.push({
        tipo: 'plan',
        descripcion: `Plan: ${antes.plan?.nombre ?? '—'} → ${despues.plan?.nombre ?? '—'}`,
        datosAnteriores: { planId: antes.planId },
        datosNuevos: { planId: despues.planId },
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

/**
 * Al eliminar una linea (se llama antes de borrarla), su historial queda con un
 * evento de cierre: cuenta como baja desde hoy, asi el costo de los meses en
 * que existio no cambia.
 */
export async function registrarEliminacion(tx: Prisma.TransactionClient, linea: LineaConNombres, usuario?: string | null) {
  await tx.lineaHistorial.create({
    data: {
      lineaId: linea.id,
      tipo: 'eliminacion',
      descripcion: `Línea ${formatearNumero(linea.numero)} eliminada`,
      datosAnteriores: { precioMensual: linea.precioMensual, estadoId: linea.estadoId, planId: linea.planId },
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

/** Primer dia de un mes, en hora de Chile no importa: se trabaja con fechas UTC de dia completo. */
const inicioMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 1));

/**
 * Lo que costaron las lineas cada uno de los ultimos `meses` meses (el actual
 * incluido): por linea, el precio y el estado que regian el ultimo dia del
 * mes; las de un estado de baja no cuestan, ni las eliminadas desde su
 * eliminacion (antes de ella siguen contando).
 */
export async function costoPorMes(meses = 12) {
  const eventos = await prisma.lineaHistorial.findMany({
    where: { tipo: { in: ['creacion', 'importacion', 'precio', 'estado', 'eliminacion'] } },
    orderBy: [{ vigenteDesde: 'asc' }, { createdAt: 'asc' }],
    select: { lineaId: true, vigenteDesde: true, datosNuevos: true },
  });
  const hoy = new Date();
  const lista = Array.from({ length: meses }, (_, i) => {
    const desde = inicioMes(hoy.getUTCFullYear(), hoy.getUTCMonth() - (meses - 1 - i));
    return { mes: desde.toISOString().slice(0, 7), hasta: inicioMes(desde.getUTCFullYear(), desde.getUTCMonth() + 1) };
  });
  return lista.map(({ mes, hasta }) => {
    // Estado de cada linea al cierre del mes: se aplican los eventos que rigen antes del mes siguiente.
    const lineas = new Map<string, { precio: number | null; deBaja: boolean }>();
    for (const e of eventos) {
      if (e.vigenteDesde >= hasta) break;
      const d = (e.datosNuevos ?? {}) as { precioMensual?: number | null; deBaja?: boolean };
      const actual = lineas.get(e.lineaId) ?? { precio: null, deBaja: false };
      lineas.set(e.lineaId, {
        precio: 'precioMensual' in d ? d.precioMensual ?? null : actual.precio,
        deBaja: 'deBaja' in d ? !!d.deBaja : actual.deBaja,
      });
    }
    const vigentes = [...lineas.values()].filter((l) => !l.deBaja);
    return { mes, lineas: vigentes.length, costo: vigentes.reduce((s, l) => s + (l.precio ?? 0), 0) };
  });
}
