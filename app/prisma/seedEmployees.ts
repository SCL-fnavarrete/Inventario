import { Employee, Prisma, PrismaClient } from '@prisma/client';

export const SEED_EMPLOYEE_HISTORY_ACTOR = 'seed@sclconsultores.com';

export type SeedEmployeeInput = Prisma.EmployeeCreateInput & { rut: string };

function fechaIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * El seed no puede usar aliases de la app. Mantiene su propio allowlist para
 * que los snapshots de creación sean planos y nunca incluyan microsoftId.
 */
function crearSnapshotEmpleadoSeed(employee: Employee): Prisma.InputJsonObject {
  return {
    id: employee.id,
    rut: employee.rut,
    nombres: employee.nombres,
    apellidoPaterno: employee.apellidoPaterno,
    apellidoMaterno: employee.apellidoMaterno,
    correo: employee.correo,
    cargo: employee.cargo,
    jefatura: employee.jefatura,
    supervisor: employee.supervisor,
    ubicacion: employee.ubicacion,
    tipoContrato: employee.tipoContrato,
    fechaIngreso: fechaIso(employee.fechaIngreso),
    fechaTermino: fechaIso(employee.fechaTermino),
    estado: employee.estado,
    telefonoContacto: employee.telefonoContacto,
    origenMicrosoft: employee.origenMicrosoft,
    fechaEntregaEpp: fechaIso(employee.fechaEntregaEpp),
    fechaEntregaKit: fechaIso(employee.fechaEntregaKit),
    proximaMantencionEpp: fechaIso(employee.proximaMantencionEpp),
  };
}

/**
 * Crea sólo empleados inexistentes. El empleado y su evidencia se confirman
 * juntos, por lo que un seed repetido permanece idempotente y no duplica
 * historia.
 */
export async function seedEmployees(
  prisma: Pick<PrismaClient, 'employee' | '$transaction'>,
  employees: readonly SeedEmployeeInput[]
): Promise<number> {
  let createdCount = 0;

  for (const employee of employees) {
    const existing = await prisma.employee.findUnique({ where: { rut: employee.rut } });
    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({ data: employee });
      await tx.employeeHistory.create({
        data: {
          employeeId: created.id,
          tipoEvento: 'creacion',
          descripcion: `Empleado creado por seed: ${created.nombres} ${created.apellidoPaterno}`,
          datosNuevos: crearSnapshotEmpleadoSeed(created),
          usuarioSistema: SEED_EMPLOYEE_HISTORY_ACTOR,
        },
      });
    });
    createdCount++;
  }

  return createdCount;
}
