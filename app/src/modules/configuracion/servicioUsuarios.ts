import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { ConflictError, errorDeCampo, errorRepetido, NotFoundError } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { registrarAcceso } from '@/shared/auth/accesos';
import { exigirSedeActiva } from '@/shared/sedes/consultas';
import { SELECT_USUARIO } from '@/modules/configuracion/consultasUsuarios';
import type { CrearUsuarioInput, EditarUsuarioInput } from '@/modules/configuracion/validacionesUsuario';

/**
 * Configuracion > Usuarios (SPEC 2.112). Un usuario no se elimina: se
 * desactiva; su nombre queda en la auditoria y en todo lo que hizo. El admin
 * no tiene sede; el tecnico pertenece a una, activa (SPEC 2.112.6), que no lo
 * limita: trabaja con todas (SPEC 2.117).
 */

export function listarUsuarios() {
  return prisma.systemUser.findMany({ orderBy: { nombre: 'asc' }, select: SELECT_USUARIO });
}

export async function obtenerUsuario(id: string) {
  const usuario = await prisma.systemUser.findUnique({ where: { id }, select: SELECT_USUARIO });
  if (!usuario) throw new NotFoundError('Usuario no encontrado');
  return usuario;
}

export async function crearUsuario(datos: CrearUsuarioInput, quien: string | null | undefined) {
  const { email, nombre, password, rol, sedeId, activo } = datos;
  if (await prisma.systemUser.findUnique({ where: { email } })) {
    throw errorRepetido('email', 'Ya existe un usuario con ese email');
  }
  if (rol !== 'admin') {
    if (!sedeId) throw errorDeCampo('sedeId', 'Este rol necesita una sede asignada');
    await exigirSedeActiva(sedeId);
  }
  const user = await prisma.systemUser.create({
    data: {
      email,
      nombre,
      rol,
      passwordHash: await bcrypt.hash(password, 12),
      activo: activo ?? true,
      sedeId: rol === 'admin' ? null : sedeId,
    },
    select: SELECT_USUARIO,
  });
  // Nunca la clave ni su hash en la auditoria.
  await auditLogService.registrarCreacion(
    'usuario',
    user.id,
    `Usuario creado: ${user.nombre} (${user.email})`,
    { email: user.email, nombre: user.nombre, rol: user.rol, activo: user.activo, sedeId: user.sedeId },
    quien
  );
  return user;
}

/**
 * Editar un usuario. Desactivarlo anula para siempre sus sesiones abiertas, y
 * cambiarle la clave a otro las corta (si se la robaron, el intruso queda
 * fuera); ambas cosas quedan en el registro de accesos. Nunca se queda el
 * sistema sin administradores ni uno se deja afuera a si mismo.
 */
export async function editarUsuario(
  id: string,
  datos: EditarUsuarioInput,
  sesion: { id: string; email?: string | null }
) {
  const { email, nombre, rol, password, activo, sedeId } = datos;
  const existente = await prisma.systemUser.findUnique({ where: { id } });
  if (!existente) throw new NotFoundError('Usuario no encontrado');
  if (email && email !== existente.email && (await prisma.systemUser.findUnique({ where: { email } }))) {
    throw errorRepetido('email', 'El email ya está en uso por otro usuario');
  }

  const esUnoMismo = existente.id === sesion.id;
  const cambios: Prisma.SystemUserUpdateInput = {};
  if (email) cambios.email = email;
  if (nombre) cambios.nombre = nombre;
  if (rol) cambios.rol = rol;
  if (activo !== undefined) {
    cambios.activo = activo;
    // SPEC 2.112.5: desactivar anula las sesiones abiertas, aunque se reactive despues.
    if (!activo && existente.activo) cambios.sesionesDesde = new Date();
  }
  // La propia sesion de quien cambia su clave no se corta (SPEC 2.112.6).
  const cortaPorClave = !!password && !esUnoMismo;
  if (password) {
    cambios.passwordHash = await bcrypt.hash(password, 12);
    if (cortaPorClave) cambios.sesionesDesde = new Date();
  }

  const rolFinal = rol || existente.rol;
  const activoFinal = activo ?? existente.activo;
  const dejaDeSerAdminActivo =
    existente.rol === 'admin' && existente.activo && (rolFinal !== 'admin' || !activoFinal);
  if (dejaDeSerAdminActivo && esUnoMismo) {
    throw new ConflictError(
      activoFinal ? 'No puedes quitarte a ti mismo el rol de administrador' : 'No puedes desactivar tu propia cuenta'
    );
  }

  if (rolFinal === 'admin') {
    cambios.sede = { disconnect: true };
  } else {
    const sedeFinal = sedeId !== undefined ? sedeId : existente.sedeId;
    if (!sedeFinal) throw errorDeCampo('sedeId', 'Este rol necesita una sede asignada');
    if (sedeFinal !== existente.sedeId) {
      await exigirSedeActiva(sedeFinal);
      cambios.sede = { connect: { id: sedeFinal } };
    }
  }

  // "Queda otro administrador" y el cambio van en la misma transaccion, con un
  // candado: dos administradores que se desactivan uno al otro a la vez ya no
  // dejan el sistema sin ninguno (auditoria 27-sep-2026, 2.9).
  const user = await prisma.$transaction(async (tx) => {
    if (dejaDeSerAdminActivo) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ultimo-admin'))`;
      const otrosAdmins = await tx.systemUser.count({ where: { rol: 'admin', activo: true, id: { not: id } } });
      if (otrosAdmins === 0) {
        throw new ConflictError(
          'Es el último administrador activo: activa o crea otro administrador antes de cambiarlo'
        );
      }
    }
    return tx.systemUser.update({ where: { id }, data: cambios, select: SELECT_USUARIO });
  });

  const resumen = (u: typeof user | typeof existente) => ({
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    sedeId: u.sedeId,
  });
  await auditLogService.registrarActualizacion(
    'usuario',
    user.id,
    `Usuario actualizado: ${user.nombre} (${user.email})${password ? ' — contraseña cambiada' : ''}`,
    resumen(existente),
    resumen(user),
    sesion.email
  );

  const quien = sesion.email ?? 'un administrador';
  if (existente.activo && !user.activo) {
    await registrarAcceso({
      email: user.email,
      usuarioId: user.id,
      resultado: 'sesion_revocada',
      detalle: `Cuenta desactivada por ${quien}`,
    });
  } else if (cortaPorClave) {
    await registrarAcceso({
      email: user.email,
      usuarioId: user.id,
      resultado: 'sesion_revocada',
      detalle: `Contraseña cambiada por ${quien}`,
    });
  }
  return user;
}
