import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assetReassignmentSchema } from '@/lib/validations/assetTransition';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// SPEC 2.7.6: Reasignación de Equipo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('activos', 'write');

    const { id } = await params;
    const body = await request.json();

    const validationResult = assetReassignmentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;
    const usuario = session.user?.email || 'sistema';

    // Verificar activo existe y está asignado
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: { categoria: true },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 });
    }

    if (asset.estado !== 'asignado') {
      return NextResponse.json(
        { error: 'El activo debe estar asignado para reasignar' },
        { status: 400 }
      );
    }

    // Verificar asignación actual existe y está activa
    const currentAssignment = await prisma.assignment.findUnique({
      where: { id: data.assignmentId },
      include: { employee: true },
    });

    if (!currentAssignment || !currentAssignment.activo || currentAssignment.assetId !== id) {
      return NextResponse.json(
        { error: 'Asignación no encontrada o no está activa para este activo' },
        { status: 400 }
      );
    }

    // Verificar nuevo empleado existe y está activo
    const newEmployee = await prisma.employee.findUnique({
      where: { id: data.newEmployeeId },
    });

    if (!newEmployee || newEmployee.estado !== 'activo') {
      return NextResponse.json(
        { error: 'Empleado destino no encontrado o no está activo' },
        { status: 400 }
      );
    }

    // Ejecutar reasignación en UNA transacción (SPEC: atómica)
    const result = await prisma.$transaction(async (tx) => {
      const firmaEn = new Date();
      // 1. Cerrar asignación actual (devolución)
      await tx.assignment.update({
        where: { id: data.assignmentId },
        data: {
          activo: false,
          fechaDevolucion: data.fechaReasignacion,
          recibidoPor: data.entregadoPor || usuario,
          estadoDevolucion: data.estadoDevolucion,
          observacionesDevolucion: `Reasignación: ${data.motivoReasignacion}`,
          firmaEmpleadoDevolucion: data.firmaEmpleadoDevolucion,
          firmaEmpleadoDevolucionEn: firmaEn,
        },
      });

      // 2. Crear nueva asignación
      const newAssignment = await tx.assignment.create({
        data: {
          assetId: id,
          employeeId: data.newEmployeeId,
          fechaEntrega: data.fechaReasignacion,
          lugarEntrega: data.lugarEntrega || null,
          entregadoPor: data.entregadoPor || usuario,
          tipoMovimiento: 'cambio',
          motivo: data.motivoReasignacion,
          firmaEmpleadoEntrega: data.firmaEmpleadoEntrega,
          firmaEmpleadoEntregaEn: firmaEn,
          activo: true,
        },
        include: {
          employee: true,
          asset: { include: { categoria: true } },
        },
      });

      // 3. Actualizar empleadoActualId
      await tx.asset.update({
        where: { id },
        data: { empleadoActualId: data.newEmployeeId },
      });

      // 4. Registrar historial: devolución
      await assetHistoryService.registrar(
        {
          assetId: id,
          tipoEvento: 'devolucion',
          descripcion: `Devuelto por ${currentAssignment.employee.nombres} ${currentAssignment.employee.apellidoPaterno} (${currentAssignment.employee.rut || ''}) - Estado: ${data.estadoDevolucion}`,
          datosNuevos: {
            estadoDevolucion: data.estadoDevolucion,
            observaciones: `Reasignación: ${data.motivoReasignacion}`,
          },
          usuarioSistema: usuario,
        },
        tx
      );

      // 5. Registrar historial: nueva asignación
      await assetHistoryService.registrar(
        {
          assetId: id,
          tipoEvento: 'asignacion',
          descripcion: `Asignado a ${newEmployee.nombres} ${newEmployee.apellidoPaterno} (${newEmployee.rut || ''}) en ${data.lugarEntrega}`,
          datosNuevos: {
            empleadoNombre: `${newEmployee.nombres} ${newEmployee.apellidoPaterno}`,
            empleadoRut: newEmployee.rut || '',
            lugarEntrega: data.lugarEntrega,
            entregadoPor: data.entregadoPor || usuario,
          },
          usuarioSistema: usuario,
        },
        tx
      );

      return {
        ...newAssignment,
        evidenciaParaDocumento: {
          entrega: {
            firmaEmpleado: data.firmaEmpleadoEntrega,
            firmaEmpleadoEn: firmaEn,
            aceptaPoliticaUso: true as const,
          },
          devolucion: {
            firmaEmpleado: data.firmaEmpleadoDevolucion,
            firmaEmpleadoEn: firmaEn,
            aceptaPoliticaUso: true as const,
          },
        },
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al reasignar el equipo');
  }
}
