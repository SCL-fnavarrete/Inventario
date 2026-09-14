import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from "@/lib/auth/guard";
import { AuditEntidad } from "@prisma/client";

// Auditoria unificada (SPEC 2.34, 14-sep-2026): pedido explicito de Javier
// de tener "todo el historial del sistema en un solo lugar" sin sacar nada
// de las pantallas de detalle que ya existen en Activos y Solicitudes.
//
// El sistema hoy guarda historial en TRES tablas con columnas distintas,
// porque se fueron agregando en momentos distintos:
//   - AssetHistory: dedicada a Activos, con relacion propia y TipoEvento.
//   - WorkflowTransition: dedicada a Solicitudes, con FK real a SystemUser
//     (ejecutadoPorId) en vez de texto libre.
//   - AuditLog (SPEC 2.31/2.32): generica, cubre los otros 10 modulos
//     (Empleado, Compra, Usuario, Mantencion, Guia de Despacho,
//     Desvinculacion, Kit/EPP, Sede, Categoria, Tipo de Mantencion,
//     Configuracion).
//
// Prisma no permite un UNION entre modelos con columnas distintas, asi que
// esta ruta consulta las tres por separado (cada una acotada por los
// filtros que aplican, con un tope de filas), las mapea a una forma comun
// y las combina/ordena/pagina en memoria -- mismo criterio ya usado en
// Empleados/Asignaciones/Solicitudes para la busqueda de texto (empresa
// chica, sin necesidad de un motor de busqueda aparte).
//
// Solo admin (recurso "configuracion", ver permissions.ts) -- por eso no
// hace falta aislar por sede aca: quien puede entrar ya ve todas las sedes.

const TOPE_POR_FUENTE = 300;

type EventoAuditoria = {
  id: string;
  fuente: "auditlog" | "asset_history" | "workflow_transition";
  moduloLabel: string;
  moduloValor: string;
  entidadId: string;
  accion: string;
  descripcion: string;
  usuario: string | null;
  datosAnteriores: unknown;
  datosNuevos: unknown;
  createdAt: Date;
  contexto: string | null;
};

const MODULO_LABELS: Record<string, string> = {
  empleado: "Empleado",
  compra: "Compra",
  usuario: "Usuario",
  mantencion: "Mantención",
  guia_despacho: "Guía de Despacho",
  desvinculacion: "Desvinculación",
  kit_item: "Kit/EPP",
  sede: "Sede",
  categoria: "Categoría",
  tipo_mantencion: "Tipo de Mantención",
  configuracion: "Configuración",
  activo: "Activo",
  solicitud: "Solicitud",
};

export async function GET(request: NextRequest) {
  try {
    await requirePermission("configuracion", "read");

    const searchParams = request.nextUrl.searchParams;
    const modulo = searchParams.get("modulo") || "";
    const usuario = searchParams.get("usuario")?.trim() || "";
    const search = searchParams.get("search")?.trim() || "";
    const fechaDesde = searchParams.get("fechaDesde") || "";
    const fechaHasta = searchParams.get("fechaHasta") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

    const rangoFecha: { gte?: Date; lte?: Date } | undefined =
      fechaDesde || fechaHasta
        ? {
            ...(fechaDesde ? { gte: new Date(fechaDesde) } : {}),
            ...(fechaHasta ? { lte: new Date(fechaHasta) } : {}),
          }
        : undefined;

    // Que fuentes consultar segun el modulo elegido -- si no hay filtro se
    // consultan las tres.
    const incluirAuditLog = !modulo || !["activo", "solicitud"].includes(modulo);
    const incluirActivo = !modulo || modulo === "activo";
    const incluirSolicitud = !modulo || modulo === "solicitud";
    const entidadFiltro =
      modulo && modulo !== "activo" && modulo !== "solicitud"
        ? (modulo as AuditEntidad)
        : undefined;

    const [auditLogRows, assetHistoryRows, workflowTransitionRows] = await Promise.all([
      incluirAuditLog
        ? prisma.auditLog.findMany({
            where: {
              ...(entidadFiltro ? { entidad: entidadFiltro } : {}),
              ...(rangoFecha ? { createdAt: rangoFecha } : {}),
              ...(usuario ? { usuarioSistema: { contains: usuario, mode: "insensitive" } } : {}),
              ...(search ? { descripcion: { contains: search, mode: "insensitive" } } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: TOPE_POR_FUENTE,
          })
        : Promise.resolve([]),
      incluirActivo
        ? prisma.assetHistory.findMany({
            where: {
              ...(rangoFecha ? { createdAt: rangoFecha } : {}),
              ...(usuario ? { usuarioSistema: { contains: usuario, mode: "insensitive" } } : {}),
              ...(search ? { descripcion: { contains: search, mode: "insensitive" } } : {}),
            },
            include: {
              asset: { select: { marca: true, modelo: true, numeroSerie: true } },
            },
            orderBy: { createdAt: "desc" },
            take: TOPE_POR_FUENTE,
          })
        : Promise.resolve([]),
      incluirSolicitud
        ? prisma.workflowTransition.findMany({
            where: {
              ...(rangoFecha ? { createdAt: rangoFecha } : {}),
              ...(usuario
                ? {
                    ejecutadoPor: {
                      OR: [
                        { email: { contains: usuario, mode: "insensitive" } },
                        { nombre: { contains: usuario, mode: "insensitive" } },
                      ],
                    },
                  }
                : {}),
              ...(search ? { comentario: { contains: search, mode: "insensitive" } } : {}),
            },
            include: {
              request: { select: { numero: true } },
              ejecutadoPor: { select: { nombre: true, email: true } },
            },
            orderBy: { createdAt: "desc" },
            take: TOPE_POR_FUENTE,
          })
        : Promise.resolve([]),
    ]);

    const eventos: EventoAuditoria[] = [
      ...auditLogRows.map((r): EventoAuditoria => ({
        id: `auditlog-${r.id}`,
        fuente: "auditlog",
        moduloLabel: MODULO_LABELS[r.entidad] ?? r.entidad,
        moduloValor: r.entidad,
        entidadId: r.entidadId,
        accion: r.accion,
        descripcion: r.descripcion,
        usuario: r.usuarioSistema,
        datosAnteriores: r.datosAnteriores,
        datosNuevos: r.datosNuevos,
        createdAt: r.createdAt,
        contexto: null,
      })),
      ...assetHistoryRows.map((r): EventoAuditoria => ({
        id: `assethistory-${r.id}`,
        fuente: "asset_history",
        moduloLabel: "Activo",
        moduloValor: "activo",
        entidadId: r.assetId,
        accion: r.tipoEvento,
        descripcion: r.descripcion,
        usuario: r.usuarioSistema,
        datosAnteriores: r.datosAnteriores,
        datosNuevos: r.datosNuevos,
        createdAt: r.createdAt,
        contexto: r.asset
          ? `${r.asset.marca} ${r.asset.modelo}${r.asset.numeroSerie ? ` (${r.asset.numeroSerie})` : ""}`
          : null,
      })),
      ...workflowTransitionRows.map((r): EventoAuditoria => ({
        id: `workflowtransition-${r.id}`,
        fuente: "workflow_transition",
        moduloLabel: "Solicitud",
        moduloValor: "solicitud",
        entidadId: r.requestId,
        accion: `${r.estadoAnterior} → ${r.estadoNuevo}`,
        descripcion: r.comentario || "Cambio de estado",
        usuario: r.ejecutadoPor?.nombre ?? r.ejecutadoPor?.email ?? null,
        datosAnteriores: null,
        datosNuevos: r.datosAccion,
        createdAt: r.createdAt,
        contexto: r.request?.numero ?? null,
      })),
    ];

    eventos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = eventos.length;
    const skip = (page - 1) * limit;
    const data = eventos.slice(skip, skip + limit);

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      // Le avisa al frontend si algun tope por fuente se alcanzo -- en ese
      // caso el total/orden puede no reflejar TODO el historico si el rango
      // de fechas es muy amplio (ver TOPE_POR_FUENTE).
      topeAlcanzado:
        auditLogRows.length === TOPE_POR_FUENTE ||
        assetHistoryRows.length === TOPE_POR_FUENTE ||
        workflowTransitionRows.length === TOPE_POR_FUENTE,
    });
  } catch (error) {
    return handleApiError(error, "Error al obtener la auditoría");
  }
}
