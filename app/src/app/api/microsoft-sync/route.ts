import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { microsoftSyncEmployeeSchema } from '@/lib/validations/employee';
import {
  checkConfiguration,
  fetchMicrosoftUsers,
} from '@/lib/services/microsoftGraphService';
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { employeeHistoryService } from '@/lib/services/employeeHistoryService';

type DatosSincronizados = {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correo: string;
  cargo: string | null;
  ubicacion: string | null;
  telefonoContacto: string | null;
  jefatura: string | null;
  supervisor: string | null;
};

function hayCambiosSincronizados(
  employee: DatosSincronizados,
  datos: DatosSincronizados
): boolean {
  return (
    employee.nombres !== datos.nombres ||
    employee.apellidoPaterno !== datos.apellidoPaterno ||
    employee.apellidoMaterno !== datos.apellidoMaterno ||
    employee.correo !== datos.correo ||
    employee.cargo !== datos.cargo ||
    employee.ubicacion !== datos.ubicacion ||
    employee.telefonoContacto !== datos.telefonoContacto ||
    employee.jefatura !== datos.jefatura ||
    employee.supervisor !== datos.supervisor
  );
}

// POST /api/microsoft-sync - Ejecutar sincronizacion de empleados
export async function POST() {
  try {
    const session = await requirePermission('configuracion', 'write');
    const actor = session.user.email || 'Sistema';

    const config = checkConfiguration();
    if (!config.configured) {
      return NextResponse.json(
        { error: 'Microsoft Entra ID no configurado', missing: config.missing },
        { status: 400 }
      );
    }

    const msUsers = await fetchMicrosoftUsers();

    const resultado = {
      creados: 0,
      actualizados: 0,
      desactivados: 0,
      reactivados: 0,
      errores: [] as { usuario: string; error: string }[],
      alertas: [] as { tipo: string; empleado: string; equipos: number }[],
    };

    for (const msUser of msUsers) {
      try {
        const { accountEnabled, ...datos } = msUser;
        const validated = microsoftSyncEmployeeSchema.parse(datos);
        const datosSincronizados: DatosSincronizados = {
          nombres: validated.nombres,
          apellidoPaterno: validated.apellidoPaterno,
          apellidoMaterno: validated.apellidoMaterno ?? null,
          correo: validated.correo,
          cargo: validated.cargo ?? null,
          ubicacion: validated.ubicacion ?? null,
          telefonoContacto: validated.telefonoContacto ?? null,
          jefatura: validated.jefatura ?? null,
          supervisor: validated.supervisor ?? null,
        };

        // Buscar por microsoftId
        let employee = await prisma.employee.findUnique({
          where: { microsoftId: msUser.microsoftId },
          include: { activosActuales: true },
        });

        if (employee) {
          if (!accountEnabled && employee.estado !== 'desvinculado') {
            await prisma.$transaction(async (tx) => {
              const updated = await tx.employee.update({
                where: { id: employee!.id },
                data: { estado: 'desvinculado' },
              });
              await employeeHistoryService.registrarCambio(employee!, updated, actor, tx, 'microsoft');
            });
            resultado.desactivados++;
            if (employee.activosActuales.length > 0) {
              resultado.alertas.push({
                tipo: 'equipos_pendientes',
                empleado: `${employee.nombres} ${employee.apellidoPaterno}`,
                equipos: employee.activosActuales.length,
              });
            }
          } else if (accountEnabled && (hayCambiosSincronizados(employee, datosSincronizados) || employee.estado === 'desvinculado')) {
            const reactivado = employee.estado === 'desvinculado';
            await prisma.$transaction(async (tx) => {
              const updated = await tx.employee.update({
                where: { id: employee!.id },
                data: {
                  ...datosSincronizados,
                  ...(reactivado && { estado: 'activo' }),
                },
              });
              await employeeHistoryService.registrarCambio(employee!, updated, actor, tx, 'microsoft');
            });
            if (reactivado) {
              resultado.reactivados++;
            } else {
              resultado.actualizados++;
            }
          }
        } else if (accountEnabled) {
          // Buscar por correo para vincular
          employee = await prisma.employee.findUnique({
            where: { correo: validated.correo },
            include: { activosActuales: true },
          });

          if (employee) {
            const reactivado = employee.estado === 'desvinculado';
            const requiereActualizacion =
              hayCambiosSincronizados(employee, datosSincronizados) ||
              employee.microsoftId !== msUser.microsoftId ||
              !employee.origenMicrosoft ||
              reactivado;

            if (!requiereActualizacion) continue;

            await prisma.$transaction(async (tx) => {
              const updated = await tx.employee.update({
                where: { id: employee!.id },
                data: {
                  ...datosSincronizados,
                  microsoftId: msUser.microsoftId,
                  origenMicrosoft: true,
                  ...(reactivado && { estado: 'activo' }),
                },
              });
              await employeeHistoryService.registrarCambio(employee!, updated, actor, tx, 'microsoft');
            });
            if (reactivado) {
              resultado.reactivados++;
            } else {
              resultado.actualizados++;
            }
          } else {
            await prisma.$transaction(async (tx) => {
              const created = await tx.employee.create({
                data: {
                  microsoftId: msUser.microsoftId,
                  origenMicrosoft: true,
                  ...datosSincronizados,
                  tipoContrato: 'externo',
                  estado: 'activo',
                },
              });
              await employeeHistoryService.registrarCreacion(created, actor, tx);
            });
            resultado.creados++;
          }
        }
      } catch (error) {
        resultado.errores.push({
          usuario: msUser.nombres || msUser.microsoftId,
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error, 'Error al sincronizar con Microsoft');
  }
}
