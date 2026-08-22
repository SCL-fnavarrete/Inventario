import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assetReassignmentSchema } from '@/lib/validations/assetTransition';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { ConflictError, NotFoundError, requirePermission, handleApiError } from '@/lib/auth/guard';

// SPEC 2.7.6: Reasignación de Equipo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('activos', 'write');
    const { id } = await params;
    const validation = assetReassignmentSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: validation.error.issues }, { status: 400 });
    }
    const data = validation.data;
    const usuario = session.user?.email || 'sistema';

    const result = await prisma.$transaction(async (tx) => {
      const eventTimestamp = new Date();
      const asset = await tx.asset.findUnique({ where: { id }, include: { categoria: true } });
      if (!asset || asset.deletedAt) throw new NotFoundError('Activo no encontrado');
      if (asset.estado !== 'asignado') throw new ConflictError('El activo debe estar asignado para reasignar');

      const currentAssignment = await tx.assignment.findUnique({
        where: { id: data.assignmentId },
        include: { employee: true },
      });
      if (!currentAssignment || !currentAssignment.activo || currentAssignment.assetId !== id) {
        throw new ConflictError('Asignación no encontrada o no está activa para este activo');
      }
      if (asset.empleadoActualId !== currentAssignment.employeeId) {
        throw new ConflictError('El activo ya no está vinculado a la asignación que se intenta reasignar');
      }
      const newEmployee = await tx.employee.findUnique({ where: { id: data.newEmployeeId } });
      if (!newEmployee) throw new NotFoundError('Empleado destino no encontrado');
      if (newEmployee.estado !== 'activo') throw new ConflictError('El empleado destino no está activo');

      const closed = await tx.assignment.updateMany({
        where: {
          id: currentAssignment.id,
          assetId: id,
          employeeId: currentAssignment.employeeId,
          activo: true,
        },
        data: {
          activo: false,
          fechaDevolucion: data.fechaReasignacion,
          recibidoPor: data.entregadoPor || usuario,
          estadoDevolucion: data.estadoDevolucion,
          observacionesDevolucion: `Reasignación: ${data.motivoReasignacion}`,
          firmaEmpleadoDevolucion: data.firmaEmpleadoDevolucion,
          firmaEmpleadoDevolucionEn: eventTimestamp,
        },
      });
      if (closed.count !== 1) throw new ConflictError('La asignación cambió antes de reasignarla; actualice e intente nuevamente');

      const moved = await tx.asset.updateMany({
        where: {
          id,
          deletedAt: null,
          estado: 'asignado',
          empleadoActualId: currentAssignment.employeeId,
        },
        data: { empleadoActualId: data.newEmployeeId },
      });
      if (moved.count !== 1) throw new ConflictError('El activo cambió antes de reasignarlo; actualice e intente nuevamente');

      const newAssignment = await tx.assignment.create({
        data: {
          assetId: id,
          employeeId: data.newEmployeeId,
          fechaEntrega: data.fechaReasignacion,
          lugarEntrega: data.lugarEntrega,
          entregadoPor: data.entregadoPor || usuario,
          tipoMovimiento: 'cambio',
          motivo: data.motivoReasignacion,
          firmaEmpleadoEntrega: data.firmaEmpleadoEntrega,
          firmaEmpleadoEntregaEn: eventTimestamp,
          activo: true,
        },
        include: { employee: true, asset: { include: { categoria: true } } },
      });

      await assetHistoryService.registrar({
        assetId: id,
        tipoEvento: 'devolucion',
        descripcion: `Devuelto por ${currentAssignment.employee.nombres} ${currentAssignment.employee.apellidoPaterno} (${currentAssignment.employee.rut || ''}) - Estado: ${data.estadoDevolucion}`,
        datosNuevos: { estadoDevolucion: data.estadoDevolucion, observaciones: `Reasignación: ${data.motivoReasignacion}` },
        usuarioSistema: usuario,
      }, tx);
      await assetHistoryService.registrar({
        assetId: id,
        tipoEvento: 'asignacion',
        descripcion: `Asignado a ${newEmployee.nombres} ${newEmployee.apellidoPaterno} (${newEmployee.rut || ''}) en ${data.lugarEntrega}`,
        datosNuevos: {
          empleadoNombre: `${newEmployee.nombres} ${newEmployee.apellidoPaterno}`,
          empleadoRut: newEmployee.rut || '', lugarEntrega: data.lugarEntrega, entregadoPor: data.entregadoPor || usuario,
        },
        usuarioSistema: usuario,
      }, tx);

      return {
        assignment: newAssignment,
        evidenciasParaDocumento: [
          {
            tipo: 'devolucion' as const,
            assignmentId: currentAssignment.id,
            employeeId: currentAssignment.employeeId,
            firmaEmpleado: data.firmaEmpleadoDevolucion,
            firmaEmpleadoEn: eventTimestamp,
            aceptaPoliticaUso: true as const,
          },
          {
            tipo: 'entrega' as const,
            assignmentId: newAssignment.id,
            employeeId: data.newEmployeeId,
            firmaEmpleado: data.firmaEmpleadoEntrega,
            firmaEmpleadoEn: eventTimestamp,
            aceptaPoliticaUso: true as const,
          },
        ],
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al reasignar el equipo');
  }
}
