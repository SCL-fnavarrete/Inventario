import { prisma } from '@/shared/prisma';
import { whereFiltrosLineas } from '@/modules/lineas/consultas';
import { SIN_DATO_LINEA, type FiltrosLineas } from '@/modules/lineas/filtros';

/**
 * Panel de Activos > Lineas (SPEC 2.131). Las tarjetas de cantidad cuentan cada
 * grupo (activas, disponibles, de baja) con los demas filtros
 * puestos; las tablas, las lineas que deja ver el filtro completo. Una linea
 * esta asignada solo si tiene una persona (la que tiene su celular, o la del
 * telefono personal); disponible = activa sin persona.
 */
export async function indicadoresLineas(filtros: FiltrosLineas = {}) {
  const base = { ...filtros, estado: undefined, asignacion: undefined };
  const contar = (f: FiltrosLineas) => prisma.lineaTelefonica.count({ where: whereFiltrosLineas({ ...base, ...f }) });
  const estados = await prisma.estadoLinea.findMany({ where: { clave: { in: ['activa', 'baja'] } }, select: { id: true, clave: true } });
  const idDe = (clave: string) => estados.find((e) => e.clave === clave)?.id ?? null;
  const contarEstado = async (clave: string) => {
    const id = idDe(clave);
    return { lineas: id ? await contar({ estado: id }) : 0, estadoId: id };
  };

  const [total, activas, disponibles, deBaja, lineas, personasActivas, personasConLinea] = await Promise.all([
    contar({}),
    contarEstado('activa'),
    contar({ estado: 'vigentes', asignacion: 'sin' }),
    contarEstado('baja'),
    prisma.lineaTelefonica.findMany({
      where: whereFiltrosLineas(filtros),
      select: {
        estado: { select: { id: true, nombre: true } },
        tipoChip: { select: { id: true, nombre: true } },
        operador: { select: { id: true, nombre: true } },
      },
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
  ]);

  type Linea = (typeof lineas)[number];
  /** Agrupadas por un dato, de mayor a menor; `valor` es lo que filtra al elegir la fila. */
  const agrupar = (dato: (l: Linea) => { id: string; nombre: string } | null, sinDato: string) => {
    const grupos = new Map<string, { valor: string; nombre: string; lineas: number }>();
    for (const l of lineas) {
      const d = dato(l);
      const valor = d?.id ?? SIN_DATO_LINEA;
      const g = grupos.get(valor) ?? { valor, nombre: d?.nombre ?? sinDato, lineas: 0 };
      g.lineas++;
      grupos.set(valor, g);
    }
    return [...grupos.values()].sort((a, b) => b.lineas - a.lineas);
  };

  return {
    tarjetas: { total, activas, disponibles, deBaja },
    porEstado: agrupar((l) => l.estado, 'Sin estado'),
    porTipoChip: agrupar((l) => l.tipoChip, 'Sin indicar'),
    porOperador: agrupar((l) => l.operador, 'Sin operador'),
    personas: { activas: personasActivas, conLinea: personasConLinea, sinLinea: personasActivas - personasConLinea },
  };
}

/**
 * Resumen de lineas para el Dashboard (SPEC 2.131): cuantas hay vigentes, cuantas
 * estan disponibles para asignar y cuantas son eSIM.
 * Con la sede del navbar, cuenta las de su celular o su persona.
 */
export async function resumenLineasDashboard(sedeId?: string | null) {
  const sede = sedeId ?? undefined;
  const contar = (f: FiltrosLineas, extra: object = {}) =>
    prisma.lineaTelefonica.count({ where: { AND: [whereFiltrosLineas({ sedeId: sede, ...f }), extra] } });
  const [vigentes, disponibles, esim] = await Promise.all([
    contar({ estado: 'vigentes' }),
    contar({ estado: 'vigentes', asignacion: 'sin' }),
    contar({ estado: 'vigentes' }, { tipoChip: { sinCelular: true } }),
  ]);
  return { vigentes, disponibles, asignadas: vigentes - disponibles, esim, fisicas: vigentes - esim };
}
