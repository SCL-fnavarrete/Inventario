import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { updateMaintenanceSchema } from "@/modules/mantenciones/validaciones";
import {
  requirePermission,
  handleApiError,
  respuestaDatosInvalidos,
  ConflictError,
  NotFoundError,
} from '@/shared/auth/guard';
import { auditLogService } from '@/shared/auditoria';
import { validateTransition } from '@/modules/activos/maquinaEstados';
import { cambiarEstado } from '@/modules/activos/servicio';
import { assetHistoryService } from '@/modules/activos/historial';
import { registrarSalidaDeMantencion } from '@/modules/mantenciones/servicio';
import { siSigueIgual } from '@/shared/utilidades/concurrencia';
import { motivoSinMantencion } from '@/modules/activos/estados';
import { formatearFechaConHora } from '@/shared/utilidades/fechas';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/mantenciones/[id] - Obtener detalle de mantención
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('mantenciones', 'read');
    const { id } = await params;

    const maintenance = await prisma.maintenance.findUnique({
      where: { id },
      include: {
        tipo: true,
        asset: {
          include: {
            categoria: true,
            empleadoActual: {
              select: {
                id: true,
                rut: true,
                nombres: true,
                apellidoPaterno: true,
                apellidoMaterno: true,
                // El correo de empresa es el identificador visible del empleado.
                correoEmpresa: true,
                correoPersonal: true,
                cargo: true,
              },
            },
          },
        },
      },
    });

    if (!maintenance) {
      return NextResponse.json(
        { error: "Mantención no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(maintenance);
  } catch (error) {
    return handleApiError(error, 'Error al obtener mantención');
  }
}

// PUT /api/mantenciones/[id] - Iniciar, cancelar o editar una mantención
// (SPEC 2.96). Completar tiene su propia ruta: /completar.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('mantenciones', 'write');
    const { id } = await params;
    const body = await request.json();

    const validationResult = updateMaintenanceSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    const existente = await prisma.maintenance.findUnique({
      where: { id },
      include: { asset: true, tipo: true },
    });

    if (!existente) throw new NotFoundError("Mantención no encontrada");

    if (existente.estado === "completada" || existente.estado === "cancelada") {
      throw new ConflictError("No se puede modificar una mantención completada o cancelada");
    }

    const usuario = session.user?.email || "Sistema";
    const { asset } = existente;

    // Iniciar: el equipo pasa a "En Mantención" recien ahora, y solo puede
    // haber una mantencion en proceso por equipo.
    if (data.estado === "en_proceso") {
      if (existente.estado !== "pendiente") {
        throw new ConflictError("La mantención ya está en proceso");
      }
      if (asset.deletedAt) {
        throw new ConflictError("Este activo está descartado y no admite movimientos");
      }
      const bloqueo = motivoSinMantencion(asset.estado);
      if (bloqueo) throw new ConflictError(bloqueo);

      const otraEnProceso = await prisma.maintenance.findFirst({
        where: { assetId: asset.id, estado: "en_proceso", id: { not: id } },
        select: { tipo: { select: { nombre: true } } },
      });
      if (otraEnProceso) {
        throw new ConflictError(
          `Este equipo ya tiene una mantención ${otraEnProceso.tipo.nombre} en proceso. Complétala o cancélala antes de iniciar otra.`
        );
      }

      const cambiaEstado = asset.estado !== "en_mantencion";
      if (cambiaEstado) {
        const transicion = validateTransition(asset.estado, "en_mantencion", {
          hasActiveAssignment: !!asset.empleadoActualId,
          hasActiveMaintenance: true,
        });
        if (!transicion.valid) {
          return NextResponse.json(
            { error: "Transición de estado no permitida", details: transicion.errors },
            { status: 400 }
          );
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        // Mantencion y equipo solo si siguen como se leyeron: iniciar dos
        // veces, o a la vez que una entrega, responde 409 (7.A-1).
        const actualizada = await siSigueIgual(
          tx.maintenance.update({
            where: { id, estado: "pendiente" },
            data: { estado: "en_proceso" },
            include: { tipo: true, asset: { include: { categoria: true } } },
          })
        );

        if (cambiaEstado) {
          await cambiarEstado(tx, {
            activo: asset,
            a: "en_mantencion",
            contexto: { hasActiveAssignment: !!asset.empleadoActualId, hasActiveMaintenance: true },
          });
        }
        await assetHistoryService.registrar(
          {
            assetId: asset.id,
            tipoEvento: "mantencion",
            descripcion: `Mantención ${existente.tipo.nombre} iniciada: ${existente.descripcion}`,
            datosAnteriores: cambiaEstado ? { estado: asset.estado } : undefined,
            datosNuevos: { ...(cambiaEstado ? { estado: "en_mantencion" } : {}), maintenanceId: id },
            usuarioSistema: usuario,
          },
          tx
        );

        await auditLogService.registrarActualizacion(
          'mantencion',
          id,
          `Mantención iniciada: ${existente.tipo.nombre} para ${asset.marca} ${asset.modelo}`,
          { estado: existente.estado },
          { estado: "en_proceso" },
          usuario,
          tx
        );
        return actualizada;
      });
      return NextResponse.json(result);
    }

    // Cancelar: si era la que estaba en proceso, el equipo vuelve a su
    // estado de uso; una pendiente nunca lo habia movido.
    if (data.estado === "cancelada") {
      const motivo = data.resultado?.trim();
      const result = await prisma.$transaction(async (tx) => {
        const actualizada = await siSigueIgual(
          tx.maintenance.update({
            where: { id, estado: existente.estado },
            data: { estado: "cancelada", ...(motivo ? { resultado: motivo } : {}) },
            include: { tipo: true, asset: { include: { categoria: true } } },
          })
        );

        await registrarSalidaDeMantencion(tx, {
          asset,
          maintenanceId: id,
          descripcion: `Mantención ${existente.tipo.nombre} cancelada${motivo ? `: ${motivo}` : ""}`,
          usuario,
          devolverEquipo: existente.estado === "en_proceso",
        });

        await auditLogService.registrarActualizacion(
          'mantencion',
          id,
          `Mantención cancelada: ${existente.tipo.nombre} para ${asset.marca} ${asset.modelo}`,
          { estado: existente.estado },
          { estado: "cancelada", resultado: motivo ?? null },
          usuario,
          tx
        );
        return actualizada;
      });
      return NextResponse.json(result);
    }

    // Editar: solo una mantencion pendiente (tipo, fecha, descripcion,
    // tecnico, costo estimado, proveedor).
    if (existente.estado !== "pendiente") {
      throw new ConflictError("Solo se puede editar una mantención pendiente");
    }

    let tipoNombre = existente.tipo.nombre;
    if (data.tipoId && data.tipoId !== existente.tipoId) {
      const tipo = await prisma.maintenanceType.findUnique({ where: { id: data.tipoId } });
      if (!tipo) throw new NotFoundError("Tipo de mantención no encontrado");
      tipoNombre = tipo.nombre;
    }

    const cambios = {
      tipoId: data.tipoId,
      descripcion: data.descripcion,
      fechaProgramada: data.fechaProgramada,
      horaProgramada: data.horaProgramada,
      realizadoPor: data.realizadoPor,
      costo: data.costo,
      proveedorExterno: data.proveedorExterno,
    };

    const result = await prisma.$transaction(async (tx) => {
      // Solo se edita si sigue pendiente (otra persona pudo iniciarla).
      const actualizada = await siSigueIgual(
        tx.maintenance.update({
          where: { id, estado: "pendiente" },
          data: cambios,
          include: { tipo: true, asset: { include: { categoria: true } } },
        })
      );

      // Cambiar la fecha queda en el historial del equipo: es lo que se
      // mira para saber cuando le toca.
      const cambiaFecha =
        (data.fechaProgramada !== undefined &&
          data.fechaProgramada.getTime() !== existente.fechaProgramada?.getTime()) ||
        (data.horaProgramada !== undefined && data.horaProgramada !== existente.horaProgramada);
      if (cambiaFecha) {
        await assetHistoryService.registrar(
          {
            assetId: asset.id,
            tipoEvento: "mantencion",
            descripcion: `Mantención ${tipoNombre} reprogramada del ${formatearFechaConHora(existente.fechaProgramada, existente.horaProgramada)} al ${formatearFechaConHora(actualizada.fechaProgramada, actualizada.horaProgramada)}`,
            datosNuevos: { maintenanceId: id },
            usuarioSistema: usuario,
          },
          tx
        );
      }

      await auditLogService.registrarActualizacion(
        'mantencion',
        id,
        `Mantención editada: ${tipoNombre} para ${asset.marca} ${asset.modelo}`,
        {
          tipoId: existente.tipoId,
          descripcion: existente.descripcion,
          fechaProgramada: existente.fechaProgramada,
          horaProgramada: existente.horaProgramada,
          realizadoPor: existente.realizadoPor,
        },
        {
          tipoId: actualizada.tipoId,
          descripcion: actualizada.descripcion,
          fechaProgramada: actualizada.fechaProgramada,
          horaProgramada: actualizada.horaProgramada,
          realizadoPor: actualizada.realizadoPor,
        },
        usuario,
        tx
      );
      return actualizada;
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar mantención');
  }
}

// DELETE /api/mantenciones/[id] - Eliminar una mantención pendiente. Una
// pendiente no cambio el estado del equipo, asi que borrarla no lo toca.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('mantenciones', 'delete');
    const { id } = await params;

    const maintenance = await prisma.maintenance.findUnique({
      where: { id },
      include: { asset: true, tipo: true },
    });

    if (!maintenance) throw new NotFoundError("Mantención no encontrada");

    if (maintenance.estado !== "pendiente") {
      throw new ConflictError("Solo se pueden eliminar mantenciones pendientes");
    }

    const usuario = session.user?.email || "Sistema";

    await prisma.$transaction(async (tx) => {
      // Registro de auditoria antes del delete fisico.
      await auditLogService.registrarEliminacion(
        'mantencion',
        maintenance.id,
        `Mantención eliminada: ${maintenance.tipo.nombre} para ${maintenance.asset.marca} ${maintenance.asset.modelo}`,
        { assetId: maintenance.assetId, estado: maintenance.estado },
        usuario,
        tx
      );

      await tx.maintenance.delete({ where: { id } });

      await assetHistoryService.registrar(
        {
          assetId: maintenance.assetId,
          tipoEvento: "mantencion",
          descripcion: `Mantención ${maintenance.tipo.nombre} programada para el ${formatearFechaConHora(maintenance.fechaProgramada, maintenance.horaProgramada)} eliminada`,
          usuarioSistema: usuario,
        },
        tx
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar mantención');
  }
}
