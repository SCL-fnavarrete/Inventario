import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { errorDeCampo, errorRepetido, NotFoundError, ValidationError } from '@/shared/errores';
import {
  MENSAJE_TERMINO_ANTES_DE_INGRESO,
  terminaAntesDeEmpezar,
} from '@/shared/validaciones/ordenFechas';
import { auditLogService } from '@/shared/auditoria';
import type { UpdateEmployeeInput } from '@/modules/personas/validaciones';

/**
 * Edita los datos de una persona (PUT /api/empleados/[id]). Desvincular y
 * reincorporar no son ediciones: pasan por su Solicitud, que registra los
 * equipos y el motivo. La sede se puede cambiar (SPEC 2.117), pero no a una
 * desactivada ni con equipos en la mano.
 */
export async function editarEmpleado(
  id: string,
  data: UpdateEmployeeInput,
  usuario: string | null | undefined
) {
  const existente = await prisma.employee.findUnique({ where: { id } });
  if (!existente) throw new NotFoundError('Empleado no encontrado');

  // Si solo llega una de las dos fechas, se compara con la ya guardada.
  if (
    terminaAntesDeEmpezar(
      data.fechaIngreso !== undefined ? data.fechaIngreso : existente.fechaIngreso,
      data.fechaTermino !== undefined ? data.fechaTermino : existente.fechaTermino
    )
  ) {
    throw new ValidationError(MENSAJE_TERMINO_ANTES_DE_INGRESO, [
      { field: 'fechaTermino', message: MENSAJE_TERMINO_ANTES_DE_INGRESO },
    ]);
  }

  // RUT y correos son unicos: se revisa solo si el valor viene y cambio.
  const repetidos = [
    ['rut', data.rut, existente.rut, 'Ya existe otro empleado con este RUT'],
    [
      'correoEmpresa',
      data.correoEmpresa,
      existente.correoEmpresa,
      'Ya existe otro empleado con este correo de empresa',
    ],
    [
      'correoPersonal',
      data.correoPersonal,
      existente.correoPersonal,
      'Ya existe otro empleado con este correo personal',
    ],
  ] as const;
  for (const [campo, nuevo, actual, mensaje] of repetidos) {
    if (nuevo && nuevo !== actual) {
      const otro = await prisma.employee.findUnique({
        where: { [campo]: nuevo } as { rut: string },
      });
      if (otro) throw errorRepetido(campo, mensaje);
    }
  }

  // Desvincular no es una edicion de datos: implica devolver los equipos y
  // dejar constancia del motivo, dentro de una Solicitud de desvinculacion.
  // Un empleado que ya lo esta sigue pudiendo editarse.
  if (data.estado === 'desvinculado' && existente.estado !== 'desvinculado') {
    throw new ValidationError(
      'Para desvincular a un empleado hay que crear una Solicitud de desvinculación: ahí se registran la devolución de sus equipos y el motivo.'
    );
  }
  // Lo inverso tampoco (auditoria 27-sep-2026, 2.9): quien vuelve entra por
  // una Solicitud de Onboarding de reincorporacion.
  if (existente.estado === 'desvinculado' && data.estado && data.estado !== 'desvinculado') {
    throw new ValidationError(
      'Para reincorporar a un empleado desvinculado hay que crear una Solicitud de Onboarding (reincorporación).'
    );
  }

  // Trasladar de sede (SPEC 2.117): no con equipos en la mano (quedarian en
  // una sede y la persona en otra).
  if (data.sedeId && data.sedeId !== existente.sedeId) {
    const sedeDestino = await prisma.sede.findUnique({ where: { id: data.sedeId } });
    if (!sedeDestino) throw new NotFoundError('Sede no encontrada');
    const equipos = await prisma.assignment.count({ where: { employeeId: id, activo: true } });
    if (equipos > 0) {
      const s = equipos === 1 ? '' : 's';
      throw errorDeCampo(
        'sedeId',
        `Tiene ${equipos} equipo${s} asignado${s}: devuélvelos o cámbialos antes de trasladarlo de sede`
      );
    }
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      ...(data.rut && { rut: data.rut }),
      ...(data.nombres && { nombres: data.nombres }),
      ...(data.apellidoPaterno && { apellidoPaterno: data.apellidoPaterno }),
      ...(data.apellidoMaterno !== undefined && { apellidoMaterno: data.apellidoMaterno }),
      ...(data.correoPersonal && { correoPersonal: data.correoPersonal }),
      ...(data.correoEmpresa !== undefined && { correoEmpresa: data.correoEmpresa }),
      ...(data.cargo !== undefined && { cargo: data.cargo }),
      ...(data.jefatura !== undefined && { jefatura: data.jefatura }),
      ...(data.supervisor !== undefined && { supervisor: data.supervisor }),
      ...(data.ubicacion !== undefined && { ubicacion: data.ubicacion }),
      ...(data.division !== undefined && { division: data.division }),
      ...(data.area !== undefined && { area: data.area }),
      ...(data.subArea !== undefined && { subArea: data.subArea }),
      ...(data.direccionParticular !== undefined && {
        direccionParticular: data.direccionParticular,
      }),
      ...(data.listasDistribucion !== undefined && {
        listasDistribucion: data.listasDistribucion,
      }),
      ...(data.tipoContrato && { tipoContrato: data.tipoContrato }),
      ...(data.fechaIngreso !== undefined && { fechaIngreso: data.fechaIngreso }),
      ...(data.fechaTermino !== undefined && { fechaTermino: data.fechaTermino }),
      ...(data.estado && { estado: data.estado }),
      ...(data.telefonoContacto !== undefined && { telefonoContacto: data.telefonoContacto }),
      ...(data.sedeId !== undefined && { sedeId: data.sedeId }),
    },
  });

  // Auditoria: que cambio y quien lo hizo, solo los campos de negocio.
  const resumen = (e: typeof existente) => ({
    nombres: e.nombres,
    apellidoPaterno: e.apellidoPaterno,
    apellidoMaterno: e.apellidoMaterno,
    rut: e.rut,
    correoPersonal: e.correoPersonal,
    correoEmpresa: e.correoEmpresa,
    cargo: e.cargo,
    jefatura: e.jefatura,
    estado: e.estado,
    tipoContrato: e.tipoContrato,
    sedeId: e.sedeId,
  });
  await auditLogService.registrarActualizacion(
    'empleado',
    employee.id,
    `Empleado actualizado: ${employee.nombres} ${employee.apellidoPaterno}`,
    resumen(existente),
    resumen(employee),
    usuario
  );
  return employee;
}

/* ------------------------------------------------------------------------
 * Escrituras de Personas que usan otros modulos dentro de su transaccion
 * (SPEC 2.118: solo Personas escribe la tabla de personas).
 * --------------------------------------------------------------------- */

/** Alta de una persona: por Onboarding (Solicitudes) o desde un Excel (Importacion). */
export function crearPersonaEnTx(tx: Prisma.TransactionClient, datos: Prisma.EmployeeUncheckedCreateInput) {
  return tx.employee.create({ data: datos });
}

/** Cambios que trae una solicitud: reincorporacion, tipo de contrato. */
export function actualizarPersonaEnTx(tx: Prisma.TransactionClient, id: string, datos: Prisma.EmployeeUpdateInput) {
  return tx.employee.update({ where: { id }, data: datos });
}

/** Al cerrar una desvinculacion la persona queda desvinculada. */
export function desvincularPersona(tx: Prisma.TransactionClient, id: string) {
  return tx.employee.update({ where: { id }, data: { estado: 'desvinculado' } });
}
