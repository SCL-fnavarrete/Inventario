import { NextRequest, NextResponse } from "next/server";
import { Prisma, type ResultadoAcceso } from "@prisma/client";
import { prisma } from "@/shared/prisma";
import { leerPaginacion } from "@/shared/utilidades/paginacion";
import { requirePermission, handleApiError } from "@/shared/auth/guard";
import { RESULTADOS_FALLIDOS } from "@/modules/configuracion/accesos";
import { hoyISO, inicioDiaChile, rangoDiasChile } from "@/shared/utilidades/fechas";

/**
 * Registro de accesos (SPEC 2.112, Configuracion > Registro de accesos, solo
 * admin). Cada tarjeta es un filtro: la misma condicion la cuenta y filtra la
 * lista al pulsarla.
 */
const VISTAS: Record<string, (hoy: Date) => Prisma.AccessLogWhereInput> = {
  ingresos_hoy: (hoy) => ({ resultado: "exito", createdAt: { gte: hoy } }),
  fallidos_hoy: (hoy) => ({ resultado: { in: RESULTADOS_FALLIDOS }, createdAt: { gte: hoy } }),
  bloqueos_hoy: (hoy) => ({ resultado: "bloqueado", createdAt: { gte: hoy } }),
  desactivados_hoy: (hoy) => ({ resultado: { in: ["usuario_inactivo", "sede_inactiva"] }, createdAt: { gte: hoy } }),
};

const RESULTADOS: ResultadoAcceso[] = [
  "exito",
  "clave_incorrecta",
  "usuario_inexistente",
  "usuario_inactivo",
  "bloqueado",
  "cierre_sesion",
  "sesion_revocada",
  "sede_inactiva",
];

// GET /api/accesos?usuario=&resultado=&fechaDesde=&fechaHasta=&vista=&page=&limit=
export async function GET(request: NextRequest) {
  try {
    await requirePermission("configuracion", "read");
    const p = request.nextUrl.searchParams;
    const { page, limit } = leerPaginacion(p, { limitPorDefecto: 25 });
    const usuario = p.get("usuario")?.trim() || "";
    const resultado = p.get("resultado") as ResultadoAcceso | null;
    const vista = p.get("vista") || "";
    const hoy = inicioDiaChile(hoyISO());

    const where: Prisma.AccessLogWhereInput = {};
    const y: Prisma.AccessLogWhereInput[] = [];
    if (usuario) {
      y.push({
        OR: [
          { email: { contains: usuario, mode: "insensitive" } },
          { usuario: { nombre: { contains: usuario, mode: "insensitive" } } },
        ],
      });
    }
    if (resultado && RESULTADOS.includes(resultado)) y.push({ resultado });
    const rango = rangoDiasChile(p.get("fechaDesde"), p.get("fechaHasta"));
    if (rango) y.push({ createdAt: rango });
    if (VISTAS[vista]) y.push(VISTAS[vista](hoy));
    if (y.length > 0) where.AND = y;

    const [registros, total, ...conteos] = await Promise.all([
      prisma.accessLog.findMany({
        where,
        include: { usuario: { select: { nombre: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.accessLog.count({ where }),
      ...Object.values(VISTAS).map((v) => prisma.accessLog.count({ where: v(hoy) })),
    ]);

    return NextResponse.json({
      data: registros,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      resumen: Object.fromEntries(Object.keys(VISTAS).map((k, i) => [k, conteos[i]])),
    });
  } catch (error) {
    return handleApiError(error, "Error al obtener el registro de accesos");
  }
}
