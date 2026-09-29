import type { Prisma, ResultadoAcceso } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { RESULTADOS_FALLIDOS } from '@/shared/auth/accesos';
import { hoyISO, inicioDiaChile, rangoDiasChile } from '@/shared/utilidades/fechas';

/**
 * Configuracion > Registro de accesos (SPEC 2.112, solo admin). Cada tarjeta
 * es un filtro: la misma condicion la cuenta y filtra la lista al pulsarla.
 */
const VISTAS: Record<string, (hoy: Date) => Prisma.AccessLogWhereInput> = {
  ingresos_hoy: (hoy) => ({ resultado: 'exito', createdAt: { gte: hoy } }),
  fallidos_hoy: (hoy) => ({ resultado: { in: RESULTADOS_FALLIDOS }, createdAt: { gte: hoy } }),
  bloqueos_hoy: (hoy) => ({ resultado: 'bloqueado', createdAt: { gte: hoy } }),
  desactivados_hoy: (hoy) => ({ resultado: { in: ['usuario_inactivo', 'sede_inactiva'] }, createdAt: { gte: hoy } }),
};

const RESULTADOS: ResultadoAcceso[] = [
  'exito',
  'clave_incorrecta',
  'usuario_inexistente',
  'usuario_inactivo',
  'bloqueado',
  'cierre_sesion',
  'sesion_revocada',
  'sede_inactiva',
];

export async function listarAccesos(p: {
  usuario: string;
  resultado: string | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  vista: string;
  page: number;
  limit: number;
}) {
  const hoy = inicioDiaChile(hoyISO());
  const where: Prisma.AccessLogWhereInput = {};
  const y: Prisma.AccessLogWhereInput[] = [];
  if (p.usuario) {
    y.push({
      OR: [
        { email: { contains: p.usuario, mode: 'insensitive' } },
        { usuario: { nombre: { contains: p.usuario, mode: 'insensitive' } } },
      ],
    });
  }
  const resultado = p.resultado as ResultadoAcceso | null;
  if (resultado && RESULTADOS.includes(resultado)) y.push({ resultado });
  const rango = rangoDiasChile(p.fechaDesde, p.fechaHasta);
  if (rango) y.push({ createdAt: rango });
  if (VISTAS[p.vista]) y.push(VISTAS[p.vista](hoy));
  if (y.length > 0) where.AND = y;

  const [registros, total, ...conteos] = await Promise.all([
    prisma.accessLog.findMany({
      where,
      include: { usuario: { select: { nombre: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (p.page - 1) * p.limit,
      take: p.limit,
    }),
    prisma.accessLog.count({ where }),
    ...Object.values(VISTAS).map((v) => prisma.accessLog.count({ where: v(hoy) })),
  ]);
  return {
    data: registros,
    pagination: { page: p.page, limit: p.limit, total, totalPages: Math.max(1, Math.ceil(total / p.limit)) },
    resumen: Object.fromEntries(Object.keys(VISTAS).map((k, i) => [k, conteos[i]])),
  };
}
