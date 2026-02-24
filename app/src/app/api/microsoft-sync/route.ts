import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { microsoftSyncEmployeeSchema } from '@/lib/validations/employee';
import {
  checkConfiguration,
  fetchMicrosoftUsers,
} from '@/lib/services/microsoftGraphService';

// POST /api/microsoft-sync - Ejecutar sincronizacion de empleados
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo administradores pueden ejecutar la sincronización' },
        { status: 403 }
      );
    }

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
      errores: [] as { usuario: string; error: string }[],
      alertas: [] as { tipo: string; empleado: string; equipos: number }[],
    };

    for (const msUser of msUsers) {
      try {
        const { accountEnabled, ...datos } = msUser;
        const validated = microsoftSyncEmployeeSchema.parse(datos);

        // Buscar por microsoftId
        let employee = await prisma.employee.findUnique({
          where: { microsoftId: msUser.microsoftId },
          include: { activosActuales: true },
        });

        if (employee) {
          if (!accountEnabled && employee.estado === 'activo') {
            // Desactivar empleado
            await prisma.employee.update({
              where: { id: employee.id },
              data: { estado: 'desvinculado' },
            });
            resultado.desactivados++;
            if (employee.activosActuales.length > 0) {
              resultado.alertas.push({
                tipo: 'equipos_pendientes',
                empleado: `${employee.nombres} ${employee.apellidoPaterno}`,
                equipos: employee.activosActuales.length,
              });
            }
          } else if (accountEnabled) {
            // Actualizar datos
            await prisma.employee.update({
              where: { id: employee.id },
              data: {
                nombres: validated.nombres,
                apellidoPaterno: validated.apellidoPaterno,
                apellidoMaterno: validated.apellidoMaterno,
                correo: validated.correo,
                cargo: validated.cargo,
                ubicacion: validated.ubicacion,
                telefonoContacto: validated.telefonoContacto,
                jefatura: validated.jefatura,
                supervisor: validated.supervisor,
              },
            });
            resultado.actualizados++;
          }
        } else if (accountEnabled) {
          // Buscar por correo para vincular
          employee = await prisma.employee.findUnique({
            where: { correo: validated.correo },
            include: { activosActuales: true },
          });

          if (employee) {
            // Vincular empleado existente
            await prisma.employee.update({
              where: { id: employee.id },
              data: {
                microsoftId: msUser.microsoftId,
                origenMicrosoft: true,
                nombres: validated.nombres,
                apellidoPaterno: validated.apellidoPaterno,
                apellidoMaterno: validated.apellidoMaterno,
                cargo: validated.cargo,
                ubicacion: validated.ubicacion,
                telefonoContacto: validated.telefonoContacto,
                jefatura: validated.jefatura,
                supervisor: validated.supervisor,
              },
            });
            resultado.actualizados++;
          } else {
            // Crear nuevo empleado
            await prisma.employee.create({
              data: {
                microsoftId: msUser.microsoftId,
                origenMicrosoft: true,
                nombres: validated.nombres,
                apellidoPaterno: validated.apellidoPaterno,
                apellidoMaterno: validated.apellidoMaterno,
                correo: validated.correo,
                cargo: validated.cargo,
                ubicacion: validated.ubicacion,
                telefonoContacto: validated.telefonoContacto,
                jefatura: validated.jefatura,
                supervisor: validated.supervisor,
                tipoContrato: 'externo',
                estado: 'activo',
              },
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
    console.error('Error en sincronización Microsoft:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al sincronizar con Microsoft' },
      { status: 500 }
    );
  }
}
