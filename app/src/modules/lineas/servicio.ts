import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { NotFoundError, errorDeCampo, errorRepetido } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import type { DatosLinea } from '@/modules/lineas/validaciones';

/**
 * Lineas telefonicas (SPEC 2.131). Cada linea es un registro propio que se
 * asocia, si corresponde, a un celular y a una persona.
 */

const CON_ASOCIADOS = {
  activo: { select: { id: true, marca: true, modelo: true, imei: true } },
  empleado: { select: { id: true, nombres: true, apellidoPaterno: true, rut: true } },
} satisfies Prisma.LineaTelefonicaInclude;

/** Todas las lineas, de la mas nueva a la mas antigua; filtra por estado y por texto. */
export async function listarLineas({ estado, busqueda }: { estado?: string | null; busqueda?: string | null } = {}) {
  const c = { contains: busqueda?.trim() ?? '', mode: 'insensitive' as const };
  // "+56 9 1234 5678" busca por numero; un texto, por lo demas.
  const digitos = /^[\d\s+()-]+$/.test(c.contains) ? c.contains.replace(/\D/g, '') : '';
  return prisma.lineaTelefonica.findMany({
    where: {
      ...(estado === 'activa' || estado === 'baja' ? { estado } : {}),
      ...(c.contains && {
        OR: [
          ...(digitos ? [{ numero: { contains: digitos } }] : []),
          { plan: c },
          { responsable: c },
          { empleado: { OR: [{ nombres: c }, { apellidoPaterno: c }, { rut: c }] } },
          { activo: { OR: [{ imei: c }, { modelo: c }] } },
        ],
      }),
    },
    include: CON_ASOCIADOS,
    orderBy: { numero: 'asc' },
  });
}

/** El celular tiene que existir y ser de una categoria de celulares; la persona, existir. */
async function validarAsociados(datos: DatosLinea) {
  if (datos.activoId) {
    const activo = await prisma.asset.findFirst({
      where: { id: datos.activoId, deletedAt: null },
      select: { categoria: { select: { tipoFicha: true } } },
    });
    if (activo?.categoria.tipoFicha !== 'celular') throw errorDeCampo('activoId', 'Elige un celular del inventario');
  }
  if (datos.empleadoId && !(await prisma.employee.findUnique({ where: { id: datos.empleadoId }, select: { id: true } }))) {
    throw errorDeCampo('empleadoId', 'La persona no existe');
  }
}

async function exigirNumeroLibre(numero: string, id?: string) {
  const otra = await prisma.lineaTelefonica.findFirst({ where: { numero, NOT: id ? { id } : undefined } });
  if (otra) throw errorRepetido('numero', 'Ya existe una línea con ese número');
}

/** Lo que se guarda: la fecha de baja se pone al darla de baja y se quita al reactivarla. */
function aGuardar(datos: DatosLinea, fechaBajaActual: Date | null = null) {
  return {
    numero: datos.numero,
    plan: datos.plan || null,
    precioMensual: datos.precioMensual ?? null,
    estado: datos.estado,
    fechaBaja: datos.estado === 'baja' ? (fechaBajaActual ?? new Date()) : null,
    activoId: datos.activoId || null,
    empleadoId: datos.empleadoId || null,
    responsable: datos.responsable || null,
    observaciones: datos.observaciones || null,
  };
}

/** Datos de una linea para la auditoria (sin fechas de sistema). */
const foto = ({ id: _id, createdAt: _c, updatedAt: _u, ...l }: Prisma.LineaTelefonicaGetPayload<object>) =>
  JSON.parse(JSON.stringify(l)) as Prisma.InputJsonValue;

export async function crearLinea(datos: DatosLinea, usuario?: string | null) {
  await exigirNumeroLibre(datos.numero);
  await validarAsociados(datos);
  return prisma.$transaction(async (tx) => {
    const linea = await tx.lineaTelefonica.create({ data: aGuardar(datos) });
    await auditLogService.registrarCreacion('linea', linea.id, `Línea ${linea.numero} creada`, foto(linea), usuario, tx);
    return linea;
  });
}

/** Edita una linea; darla de baja o reactivarla es cambiar su estado aqui. */
export async function editarLinea(id: string, datos: DatosLinea, usuario?: string | null) {
  const actual = await prisma.lineaTelefonica.findUnique({ where: { id } });
  if (!actual) throw new NotFoundError('Línea no encontrada');
  await exigirNumeroLibre(datos.numero, id);
  await validarAsociados(datos);
  return prisma.$transaction(async (tx) => {
    const linea = await tx.lineaTelefonica.update({ where: { id }, data: aGuardar(datos, actual.fechaBaja) });
    const accion = actual.estado === linea.estado ? 'editada' : linea.estado === 'baja' ? 'dada de baja' : 'reactivada';
    await auditLogService.registrarActualizacion('linea', id, `Línea ${linea.numero} ${accion}`, foto(actual), foto(linea), usuario, tx);
    return linea;
  });
}

/** Borra una linea (solo admin); sus datos quedan en la auditoria. */
export async function eliminarLinea(id: string, usuario?: string | null) {
  const actual = await prisma.lineaTelefonica.findUnique({ where: { id } });
  if (!actual) throw new NotFoundError('Línea no encontrada');
  await prisma.$transaction(async (tx) => {
    await tx.lineaTelefonica.delete({ where: { id } });
    await auditLogService.registrarEliminacion('linea', id, `Línea ${actual.numero} eliminada`, foto(actual), usuario, tx);
  });
}

/** Celulares y personas que se pueden asociar a una linea (para el formulario). */
export async function opcionesLinea() {
  const [celulares, personas] = await Promise.all([
    prisma.asset.findMany({
      where: { deletedAt: null, estado: { notIn: ['baja', 'vendido'] }, categoria: { tipoFicha: 'celular' } },
      select: { id: true, marca: true, modelo: true, imei: true },
      orderBy: [{ marca: 'asc' }, { modelo: 'asc' }],
    }),
    prisma.employee.findMany({
      where: { estado: { not: 'desvinculado' } },
      select: { id: true, nombres: true, apellidoPaterno: true, rut: true },
      orderBy: [{ apellidoPaterno: 'asc' }, { nombres: 'asc' }],
    }),
  ]);
  return { celulares, personas };
}
