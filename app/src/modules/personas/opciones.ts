import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { NotFoundError, errorRepetido } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { TIPOS_OPCION_PERSONA, nombresDeLista, type TipoOpcionPersona } from '@/modules/personas/validaciones';

/**
 * Opciones de supervisor, division, area, sub-area y listas de distribucion
 * (SPEC 2.142). La persona guarda el nombre como texto, no una relacion:
 * renombrar una opcion corrige a las personas que la tenian y eliminar una en
 * uso solo la desactiva (deja de ofrecerse, nadie pierde el dato).
 */

/** Cuantas personas tiene cada nombre del campo (una lista cuenta por cada nombre que lleva). */
async function contarUso(tipo: TipoOpcionPersona) {
  const campo = TIPOS_OPCION_PERSONA[tipo].campo;
  const filas = (await prisma.employee.findMany({
    where: { [campo]: { not: null } } as Prisma.EmployeeWhereInput,
    select: { [campo]: true } as Prisma.EmployeeSelect,
  })) as unknown as Record<string, string | null>[];
  const cuenta = new Map<string, number>();
  for (const fila of filas) {
    const nombres = tipo === 'lista_distribucion' ? nombresDeLista(fila[campo]) : [fila[campo]?.trim()];
    for (const n of nombres) if (n) cuenta.set(n.toLowerCase(), (cuenta.get(n.toLowerCase()) ?? 0) + 1);
  }
  return cuenta;
}

/**
 * Opciones de la lista. Con `conUso`, cuantas personas tiene cada una:
 * `enUso` y `enSede` son lo mismo (no son de una sede), forma de OpcionesCatalogo.
 */
export async function listarOpcionesPersona(tipo: TipoOpcionPersona, { soloActivas = false, conUso = false } = {}) {
  const opciones = await prisma.opcionPersona.findMany({
    where: { tipo, ...(soloActivas && { activo: true }) },
    orderBy: { nombre: 'asc' },
  });
  if (!conUso) return opciones;
  const cuenta = await contarUso(tipo);
  return opciones.map((o) => {
    const n = cuenta.get(o.nombre.toLowerCase()) ?? 0;
    return { ...o, enUso: n, enSede: n };
  });
}

/** Crea una opcion; si ya existe (sin importar mayusculas) la reactiva. */
export async function crearOpcionPersona(tipo: TipoOpcionPersona, nombre: string, usuario?: string | null) {
  const { etiqueta } = TIPOS_OPCION_PERSONA[tipo];
  const existente = await prisma.opcionPersona.findFirst({ where: { tipo, nombre: { equals: nombre, mode: 'insensitive' } } });
  if (existente?.activo) return { opcion: existente, creada: false };
  const opcion = existente
    ? await prisma.opcionPersona.update({ where: { id: existente.id }, data: { activo: true } })
    : await prisma.opcionPersona.create({ data: { tipo, nombre } });
  await auditLogService.registrarCreacion(
    'catalogo',
    opcion.id,
    `${etiqueta}: opción ${existente ? 'reactivada' : 'creada'} "${opcion.nombre}"`,
    { catalogo: etiqueta, nombre: opcion.nombre },
    usuario
  );
  return { opcion, creada: !existente };
}

/** Renombra una opcion y corrige a las personas que tenian el nombre anterior. */
export async function renombrarOpcionPersona(tipo: TipoOpcionPersona, id: string, nombre: string, usuario?: string | null) {
  const { campo, etiqueta } = TIPOS_OPCION_PERSONA[tipo];
  const actual = await prisma.opcionPersona.findFirst({ where: { id, tipo } });
  if (!actual) throw new NotFoundError('Opción no encontrada');
  const repetida = await prisma.opcionPersona.findFirst({ where: { tipo, nombre: { equals: nombre, mode: 'insensitive' }, NOT: { id } } });
  if (repetida) throw errorRepetido('nombre', `Ya existe la opción "${repetida.nombre}"`);

  const { personas } = await prisma.$transaction(async (tx) => {
    await tx.opcionPersona.update({ where: { id }, data: { nombre } });
    if (tipo !== 'lista_distribucion') {
      const { count } = await tx.employee.updateMany({
        where: { [campo]: { equals: actual.nombre, mode: 'insensitive' } } as Prisma.EmployeeWhereInput,
        data: { [campo]: nombre } as Prisma.EmployeeUpdateManyMutationInput,
      });
      return { personas: count };
    }
    // Una lista de distribucion va junto a otras: se cambia solo ese nombre.
    const conLista = await tx.employee.findMany({
      where: { listasDistribucion: { contains: actual.nombre, mode: 'insensitive' } },
      select: { id: true, listasDistribucion: true },
    });
    let cambiadas = 0;
    for (const p of conLista) {
      const nombres = nombresDeLista(p.listasDistribucion);
      if (!nombres.some((n) => n.toLowerCase() === actual.nombre.toLowerCase())) continue;
      const nuevos = nombres.map((n) => (n.toLowerCase() === actual.nombre.toLowerCase() ? nombre : n));
      await tx.employee.update({ where: { id: p.id }, data: { listasDistribucion: nuevos.join(', ') } });
      cambiadas++;
    }
    return { personas: cambiadas };
  });

  await auditLogService.registrarActualizacion(
    'catalogo',
    id,
    `${etiqueta}: opción renombrada "${actual.nombre}" → "${nombre}"${personas ? ` (${personas} persona(s) corregidas)` : ''}`,
    { catalogo: etiqueta, nombre: actual.nombre },
    { catalogo: etiqueta, nombre, personasCorregidas: personas },
    usuario
  );
  return { ...actual, nombre };
}

/** Elimina una opcion sin personas; una ya usada solo se desactiva. */
export async function eliminarOpcionPersona(tipo: TipoOpcionPersona, id: string, usuario?: string | null) {
  const { etiqueta } = TIPOS_OPCION_PERSONA[tipo];
  const actual = await prisma.opcionPersona.findFirst({ where: { id, tipo } });
  if (!actual) throw new NotFoundError('Opción no encontrada');
  const enUso = (await contarUso(tipo)).get(actual.nombre.toLowerCase()) ?? 0;
  if (enUso > 0) {
    await prisma.opcionPersona.update({ where: { id }, data: { activo: false } });
    await auditLogService.registrarActualizacion(
      'catalogo',
      id,
      `${etiqueta}: opción desactivada "${actual.nombre}" (la tienen ${enUso} persona(s))`,
      { catalogo: etiqueta, nombre: actual.nombre, activo: actual.activo },
      { catalogo: etiqueta, nombre: actual.nombre, activo: false },
      usuario
    );
    return { desactivado: true };
  }
  await prisma.opcionPersona.delete({ where: { id } });
  await auditLogService.registrarEliminacion(
    'catalogo',
    id,
    `${etiqueta}: opción eliminada "${actual.nombre}"`,
    { catalogo: etiqueta, nombre: actual.nombre },
    usuario
  );
  return { desactivado: false };
}
