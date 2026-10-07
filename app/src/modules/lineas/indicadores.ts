import { prisma } from '@/shared/prisma';
import { costoPorMes } from '@/modules/lineas/historial';
import { whereFiltrosLineas } from '@/modules/lineas/consultas';
import { SIN_DATO_LINEA, type FiltrosLineas } from '@/modules/lineas/filtros';

/**
 * Panel de Activos > Lineas (SPEC 2.131). Las tarjetas de cantidad cuentan cada
 * grupo (activas, por confirmar, sin asignar, para revisar, de baja) con los
 * demas filtros puestos; los costos y las tablas, las lineas que deja ver el
 * filtro completo. Una linea esta asignada solo si tiene una persona (la que
 * tiene su celular, o la del telefono personal); un responsable escrito no cuenta.
 */
export async function indicadoresLineas(filtros: FiltrosLineas = {}) {
  const base = { ...filtros, estado: undefined, asignacion: undefined, revisar: undefined };
  const contar = (f: FiltrosLineas) => prisma.lineaTelefonica.count({ where: whereFiltrosLineas({ ...base, ...f }) });
  const estados = await prisma.estadoLinea.findMany({ where: { clave: { in: ['activa', 'por_confirmar', 'baja'] } }, select: { id: true, clave: true } });
  const idDe = (clave: string) => estados.find((e) => e.clave === clave)?.id ?? null;
  const contarEstado = async (clave: string) => {
    const id = idDe(clave);
    return { lineas: id ? await contar({ estado: id }) : 0, estadoId: id };
  };

  const [total, activas, porConfirmar, sinAsignar, revisar, deBajaCant, lineas, todas, personasActivas, personasConLinea, meses] = await Promise.all([
    contar({}),
    contarEstado('activa'),
    contarEstado('por_confirmar'),
    contar({ estado: 'vigentes', asignacion: 'sin' }),
    contar({ revisar: true }),
    contarEstado('baja'),
    prisma.lineaTelefonica.findMany({
      where: whereFiltrosLineas(filtros),
      select: {
        precioMensual: true,
        empleadoId: true,
        empleado: { select: { estado: true } },
        activo: { select: { empleadoActualId: true } },
        estado: { select: { id: true, nombre: true, deBaja: true } },
        plan: { select: { id: true, nombre: true } },
        tipoChip: { select: { id: true, nombre: true } },
        operador: { select: { id: true, nombre: true } },
        sede: { select: { id: true, nombre: true } },
      },
    }),
    // De baja y suma de todas: con los demas filtros, sin el de estado.
    prisma.lineaTelefonica.findMany({
      where: whereFiltrosLineas({ ...base, estado: 'todas' }),
      select: { precioMensual: true, estado: { select: { deBaja: true } } },
    }),
    prisma.employee.count({ where: { estado: 'activo' } }),
    // Personas activas con al menos una linea vigente: en su telefono personal o en el celular que tienen.
    prisma.employee.count({
      where: {
        estado: 'activo',
        OR: [
          { lineas: { some: { estado: { deBaja: false } } } },
          { activosActuales: { some: { lineas: { some: { estado: { deBaja: false } } } } } },
        ],
      },
    }),
    costoPorMes(12),
  ]);

  type Linea = (typeof lineas)[number];
  const suma = (ls: { precioMensual: number | null }[]) => ({ lineas: ls.length, costo: ls.reduce((s, l) => s + (l.precioMensual ?? 0), 0) });
  const vigentes = lineas.filter((l) => !l.estado.deBaja);
  const asignada = (l: Linea) => (l.activo ? !!l.activo.empleadoActualId : !!l.empleadoId);
  /** Agrupadas por un dato, de mayor a menor costo; `valor` es lo que filtra al elegir la fila. */
  const agrupar = (dato: (l: Linea) => { id: string; nombre: string } | null, sinDato: string) => {
    const grupos = new Map<string, { valor: string; nombre: string; lineas: Linea[] }>();
    for (const l of lineas) {
      const d = dato(l);
      const valor = d?.id ?? SIN_DATO_LINEA;
      const g = grupos.get(valor) ?? { valor, nombre: d?.nombre ?? sinDato, lineas: [] };
      g.lineas.push(l);
      grupos.set(valor, g);
    }
    return [...grupos.values()].map(({ lineas: ls, ...g }) => ({ ...g, ...suma(ls) })).sort((a, b) => b.costo - a.costo || b.lineas - a.lineas);
  };

  return {
    tarjetas: { total, activas, porConfirmar, sinAsignar, revisar, deBaja: deBajaCant },
    total: suma(todas),
    vigentes: suma(vigentes),
    deBaja: suma(todas.filter((l) => l.estado.deBaja)),
    asignadas: suma(vigentes.filter(asignada)),
    sinAsignar: suma(vigentes.filter((l) => !asignada(l))),
    // En el telefono personal de alguien que ya se fue: se sigue pagando.
    desvinculadas: suma(vigentes.filter((l) => l.empleado?.estado === 'desvinculado')),
    porEstado: agrupar((l) => l.estado, 'Sin estado'),
    porPlan: agrupar((l) => l.plan, 'Sin plan'),
    porTipoChip: agrupar((l) => l.tipoChip, 'Sin indicar'),
    porOperador: agrupar((l) => l.operador, 'Sin operador'),
    porSede: agrupar((l) => l.sede, 'Sin sede'),
    personas: { activas: personasActivas, conLinea: personasConLinea, sinLinea: personasActivas - personasConLinea },
    meses,
  };
}

/** Lineas por confirmar (SPEC 2.131), para el aviso del Dashboard: cuantas y el estado para filtrar. */
export async function lineasPorConfirmar() {
  const estado = await prisma.estadoLinea.findFirst({ where: { clave: 'por_confirmar' }, select: { id: true } });
  if (!estado) return { lineas: 0, estadoId: null };
  return { lineas: await prisma.lineaTelefonica.count({ where: { estadoId: estado.id } }), estadoId: estado.id };
}
