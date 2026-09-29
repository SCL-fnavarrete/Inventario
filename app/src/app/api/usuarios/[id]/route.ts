import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import {
  requirePermission,
  handleApiError,
  ConflictError,
  NotFoundError,
  errorRepetido,
  errorDeCampo,
} from '@/lib/auth/guard';
import { registrarAcceso } from '@/lib/services/accesoService';
import { editarUsuarioSchema } from '@/lib/validations/usuario';
import { exigirSedeActiva } from '@/lib/queries/sedes';
import { SELECT_USUARIO } from '@/lib/queries/usuarios';
import { auditLogService } from '@/lib/services/auditLogService';

// Un usuario no se elimina: se desactiva (SPEC 2.112). Su nombre queda en
// la auditoria y en todo lo que hizo.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('usuarios', 'read');

    const { id } = await params;

    const user = await prisma.systemUser.findUnique({
      where: { id },
      select: SELECT_USUARIO,
    });
    if (!user) throw new NotFoundError("Usuario no encontrado");

    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, 'Error al obtener usuario');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('usuarios', 'write');
    const { id } = await params;
    const { email, nombre, rol, password, activo, sedeId } = editarUsuarioSchema.parse(await request.json());

    const existingUser = await prisma.systemUser.findUnique({ where: { id } });
    if (!existingUser) throw new NotFoundError("Usuario no encontrado");

    // Verificar si el email ya está en uso por otro usuario
    if (email && email !== existingUser.email) {
      const emailInUse = await prisma.systemUser.findUnique({ where: { email } });
      if (emailInUse) throw errorRepetido("email", "El email ya está en uso por otro usuario");
    }

    const esUnoMismo = existingUser.id === session.user.id;
    const updateData: Prisma.SystemUserUpdateInput = {};
    if (email) updateData.email = email;
    if (nombre) updateData.nombre = nombre;
    if (rol) updateData.rol = rol;
    if (activo !== undefined) {
      updateData.activo = activo;
      // SPEC 2.112.5: desactivar anula para siempre las sesiones abiertas,
      // aunque la cuenta se reactive despues.
      if (!activo && existingUser.activo) updateData.sesionesDesde = new Date();
    }
    // Misma validacion de complejidad que al crear un usuario (en el schema).
    // Cambiar la contrasena de otro usuario cierra sus sesiones abiertas
    // (SPEC 2.112.6): si se la robaron, el intruso queda fuera. La propia
    // sesion de quien la cambia no se corta.
    const cortaPorClave = !!password && !esUnoMismo;
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
      if (cortaPorClave) updateData.sesionesDesde = new Date();
    }

    const rolFinal = rol || existingUser.rol;
    const activoFinal = activo ?? existingUser.activo;

    // SPEC 2.112: nunca quedarse sin administradores ni dejarse afuera a uno
    // mismo.
    const dejaDeSerAdminActivo =
      existingUser.rol === "admin" && existingUser.activo && (rolFinal !== "admin" || !activoFinal);
    if (dejaDeSerAdminActivo && esUnoMismo) {
      throw new ConflictError(
        activoFinal
          ? "No puedes quitarte a ti mismo el rol de administrador"
          : "No puedes desactivar tu propia cuenta"
      );
    }

    // Admin no tiene sede; el tecnico pertenece a una, y al
    // asignarla o cambiarla debe estar activa (SPEC 2.112.6).
    if (rolFinal === "admin") {
      updateData.sede = { disconnect: true };
    } else {
      const sedeFinal = sedeId !== undefined ? sedeId : existingUser.sedeId;
      if (!sedeFinal) throw errorDeCampo("sedeId", "Este rol necesita una sede asignada");
      if (sedeFinal !== existingUser.sedeId) {
        await exigirSedeActiva(sedeFinal);
        updateData.sede = { connect: { id: sedeFinal } };
      }
    }

    // "Queda otro administrador" y el cambio van en la misma transaccion, con
    // un candado (auditoria 27-sep-2026, 2.9). Sin el, dos administradores
    // que se desactivan uno al otro al mismo tiempo veian ambos "queda otro"
    // y el sistema quedaba sin ninguno. El candado se suelta al terminar la
    // transaccion: la segunda operacion espera y cuenta con el dato real.
    const user = await prisma.$transaction(async (tx) => {
      if (dejaDeSerAdminActivo) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ultimo-admin'))`;
        const otrosAdmins = await tx.systemUser.count({
          where: { rol: "admin", activo: true, id: { not: id } },
        });
        if (otrosAdmins === 0) {
          throw new ConflictError(
            "Es el último administrador activo: activa o crea otro administrador antes de cambiarlo"
          );
        }
      }
      return tx.systemUser.update({
        where: { id },
        data: updateData,
        select: SELECT_USUARIO,
      });
    });

    // `existingUser` trae passwordHash (findUnique sin `select`), por lo
    // que el snapshot de auditoria se arma a mano para excluirlo.
    await auditLogService.registrarActualizacion(
      'usuario',
      user.id,
      `Usuario actualizado: ${user.nombre} (${user.email})${password ? " — contraseña cambiada" : ""}`,
      { email: existingUser.email, nombre: existingUser.nombre, rol: existingUser.rol, activo: existingUser.activo, sedeId: existingUser.sedeId },
      { email: user.email, nombre: user.nombre, rol: user.rol, activo: user.activo, sedeId: user.sedeId },
      session.user?.email
    );

    // Desactivar o cambiar la contrasena corta su sesion en su siguiente
    // accion (lib/auth.ts); queda en el registro de accesos, con quien lo hizo.
    const quien = session.user?.email ?? "un administrador";
    if (existingUser.activo && !user.activo) {
      await registrarAcceso({
        email: user.email,
        usuarioId: user.id,
        resultado: "sesion_revocada",
        detalle: `Cuenta desactivada por ${quien}`,
      });
    } else if (cortaPorClave) {
      await registrarAcceso({
        email: user.email,
        usuarioId: user.id,
        resultado: "sesion_revocada",
        detalle: `Contraseña cambiada por ${quien}`,
      });
    }

    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar usuario');
  }
}
