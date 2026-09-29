import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { createMaintenanceSchema, maintenanceFiltersSchema } from "@/modules/mantenciones/validaciones";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError, respuestaDatosInvalidos, ConflictError } from '@/shared/auth/guard';
import { motivoSinMantencion } from '@/modules/activos/estados';
import { auditLogService } from '@/shared/auditoria';
import { assetHistoryService } from '@/modules/activos/historial';
import { formatearFechaConHora, inicioDeHoy } from '@/shared/utilidades/fechas';
import { busquedaActivo, palabrasDeBusqueda } from "@/modules/activos/consultas";
import {
  INCLUDE_LISTADO_MANTENCION,
  VISTAS_MANTENCION,
  filtroPeriodo,
  gruposAgenda,
  paginarPorGrupos,
  ventanaPeriodo,
  whereSedeMantencion,
} from "@/modules/mantenciones/consultas";

// GET /api/mantenciones - Listar mantenciones con filtros
export async function GET(request: NextRequest) {
  try {
    await requirePermission('mantenciones', 'read');
    const searchParams = request.nextUrl.searchParams;

    const filtersResult = maintenanceFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      assetId: searchParams.get("assetId") || undefined,
      tipoId: searchParams.get("tipoId") || undefined,
      estado: searchParams.get("estado") || undefined,
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      pendientes: searchParams.get("pendientes") || undefined,
      vencidas: searchParams.get("vencidas") || undefined,
      vista: searchParams.get("vista") || undefined,
      dias: searchParams.get("dias") || undefined,
      diasCompletadas: searchParams.get("diasCompletadas") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
      sortBy: searchParams.get("sortBy") || undefined,
      sortOrder: searchParams.get("sortOrder") || "asc",
    });

    if (!filtersResult.success) {
      return respuestaDatosInvalidos(filtersResult.error);
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;

    // La sede elegida en el nav, por la del activo.
    const where: Prisma.MaintenanceWhereInput = whereSedeMantencion(searchParams.get("sedeId"));

    if (filters.assetId) {
      where.assetId = filters.assetId;
    }

    if (filters.tipoId) {
      where.tipoId = filters.tipoId;
    }

    if (filters.estado) {
      where.estado = filters.estado;
    }

    if (filters.search) {
      // Buscar por palabras, no por el texto completo: cada palabra debe
      // aparecer en alguno de los campos (no necesariamente el mismo).
      //
      // Alcance acotado al activo y al empleado asignado -- los datos
      // involucrados en una mantencion -- en vez de a campos de texto libre
      // propios de la mantencion (descripcion, realizadoPor, etc.).
      const condicionesBusqueda: Prisma.MaintenanceWhereInput[] = palabrasDeBusqueda(
        filters.search
      ).map((palabra) => ({ asset: busquedaActivo(palabra) }));

      const condicionesAndPrevias = Array.isArray(where.AND)
        ? where.AND
        : where.AND
        ? [where.AND]
        : [];
      where.AND = [...condicionesAndPrevias, ...condicionesBusqueda];
    }

    // Filtro de pendientes (estado pendiente o en_proceso)
    if (filters.pendientes) {
      where.estado = { in: ["pendiente", "en_proceso"] };
    }

    // Filtro por rango de fechas
    if (filters.fechaDesde || filters.fechaHasta) {
      where.fechaProgramada = {};
      if (filters.fechaDesde) {
        where.fechaProgramada.gte = new Date(filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        where.fechaProgramada.lte = new Date(filters.fechaHasta);
      }
    }

    // Periodo (Dia/Semana/Mes...) y tarjeta pulsada, con las mismas reglas
    // que cuentan las tarjetas de resumen (SPEC 2.107): el numero de la
    // tarjeta y la lista siempre coinciden.
    const ventana = ventanaPeriodo(
      inicioDeHoy(),
      filters.dias ?? filters.diasCompletadas ?? 0,
      filters.diasCompletadas ?? filters.dias ?? 0
    );
    const vista = filters.vista ?? (filters.vencidas ? "vencidas" : undefined);
    const condiciones = [
      filtroPeriodo(ventana),
      vista ? VISTAS_MANTENCION[vista](ventana) : null,
    ].filter((c): c is Prisma.MaintenanceWhereInput => c !== null);
    if (condiciones.length > 0) {
      const previas = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
      where.AND = [...previas, ...condiciones];
    }

    // Sin orden pedido: orden de agenda (en proceso, proximas, vencidas,
    // cerradas). Con sortBy, ese campo; por fecha, la hora desempata.
    const { sortBy } = filters;
    const { data: maintenances, total } = !sortBy
      ? await paginarPorGrupos(where, gruposAgenda(inicioDeHoy()), skip, filters.limit)
      : await Promise.all([
          prisma.maintenance.findMany({
            where,
            include: INCLUDE_LISTADO_MANTENCION,
            orderBy:
              sortBy === "fechaProgramada"
                ? [{ fechaProgramada: filters.sortOrder }, { horaProgramada: filters.sortOrder }]
                : { [sortBy]: filters.sortOrder },
            skip,
            take: filters.limit,
          }),
          prisma.maintenance.count({ where }),
        ]).then(([data, total]) => ({ data, total }));

    return NextResponse.json({
      data: maintenances,
      pagination: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener mantenciones');
  }
}

// POST /api/mantenciones - Crear nueva mantención
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('mantenciones', 'write');
    const body = await request.json();

    const validationResult = createMaintenanceSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    // Verificar que el activo existe
    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
      include: { categoria: true },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Activo no encontrado" },
        { status: 404 }
      );
    }

    // Verificar que el tipo de mantencion existe (catalogo dinamico, ver
    // MaintenanceType / /api/mantenciones/tipos).
    const tipoMantencion = await prisma.maintenanceType.findUnique({
      where: { id: data.tipoId },
    });

    if (!tipoMantencion) {
      return NextResponse.json(
        { error: "Tipo de mantención no encontrado" },
        { status: 404 }
      );
    }

    // Programar no cambia el estado del equipo (SPEC 2.96): pasa a "En
    // Mantención" recien al pulsar Iniciar. Aca solo se rechaza el equipo
    // que no admite mantenciones, con el motivo en palabras.
    if (asset.deletedAt) {
      throw new ConflictError("Este activo está descartado y no admite movimientos");
    }
    const bloqueo = motivoSinMantencion(asset.estado);
    if (bloqueo) {
      return NextResponse.json({ error: bloqueo, details: [{ field: "assetId", message: bloqueo }] }, { status: 409 });
    }

    // Crear la mantención en transacción
    const result = await prisma.$transaction(async (tx) => {
      // Crear mantención
      const maintenance = await tx.maintenance.create({
        data: {
          assetId: data.assetId,
          tipoId: data.tipoId,
          descripcion: data.descripcion,
          fechaProgramada: data.fechaProgramada,
          horaProgramada: data.horaProgramada,
          proximaMantencion: data.proximaMantencion,
          realizadoPor: data.realizadoPor,
          costo: data.costo,
          proveedorExterno: data.proveedorExterno,
          estado: "pendiente",
        },
        include: {
          tipo: true,
          asset: {
            include: { categoria: true },
          },
        },
      });

      // Auditoria generica: quien creo el ticket de mantencion, dentro de
      // la misma transaccion.
      await auditLogService.registrarCreacion(
        'mantencion',
        maintenance.id,
        `Mantención creada: ${maintenance.tipo.nombre} para ${asset.marca} ${asset.modelo}`,
        { assetId: data.assetId, tipoId: data.tipoId, descripcion: data.descripcion, estado: maintenance.estado },
        session.user?.email,
        tx
      );

      // Historial del equipo, sin cambio de estado.
      await assetHistoryService.registrar(
        {
          assetId: data.assetId,
          tipoEvento: "mantencion",
          descripcion: `Mantención ${maintenance.tipo.nombre} programada para el ${formatearFechaConHora(data.fechaProgramada, data.horaProgramada)}: ${data.descripcion}`,
          datosNuevos: { maintenanceId: maintenance.id },
          usuarioSistema: session.user?.email || data.realizadoPor || "Sistema",
        },
        tx
      );

      return maintenance;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear mantención');
  }
}
