import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requirePermission, handleApiError, ConflictError, errorRepetido } from '@/lib/auth/guard';
import { registrarAcceso } from '@/lib/services/accesoService';
import { validarPasswordFuerte } from '@/lib/validations/password';
import { auditLogService } from '@/lib/services/auditLogService';

// Un usuario no se elimina: se desactiva (SPEC 2.112). Su nombre queda en
// la auditoria y en todo lo que hizo.

// Roles válidos del sistema (solo dos: admin ve todo, tecnico es soporte
// restringido a su sede -- ver sedeScope()).
const VALID_ROLES = ["admin", "tecnico"] as const;
type SystemRole = typeof VALID_ROLES[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('usuarios', 'read');

    const { id } = await params;

    const user = await prisma.systemUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        activo: true,
        ultimoLogin: true,
        createdAt: true,
        sedeId: true,
        sede: { select: { id: true, codigo: true, nombre: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

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

    const existingUser = await prisma.systemUser.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { email, nombre, rol, password, activo, sedeId } = body;

    // Verificar si el email ya está en uso por otro usuario
    if (email && email.toLowerCase().trim() !== existingUser.email) {
      const emailInUse = await prisma.systemUser.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (emailInUse) throw errorRepetido("email", "El email ya está en uso por otro usuario");
    }

    const updateData: Record<string, unknown> = {};

    if (email) {
      updateData.email = email.toLowerCase().trim();
    }
    if (nombre) {
      updateData.nombre = nombre.trim();
    }
    if (rol) {
      if (!VALID_ROLES.includes(rol as SystemRole)) {
        return NextResponse.json(
          { error: `Rol inválido. Roles permitidos: ${VALID_ROLES.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.rol = rol;
    }
    if (typeof activo === "boolean") {
      updateData.activo = activo;
      // SPEC 2.112.5: desactivar anula para siempre las sesiones abiertas,
      // aunque la cuenta se reactive despues.
      if (!activo && existingUser.activo) updateData.sesionesDesde = new Date();
    }
    // Misma validacion de complejidad que al crear un usuario.
    if (password) {
      const errorPassword = validarPasswordFuerte(password);
      if (errorPassword) {
        return NextResponse.json({ error: errorPassword }, { status: 400 });
      }
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    // Admin no tiene sede (ve todo); cualquier otro rol necesita una. El rol
    // "final" es el nuevo si viene en el body, o el que ya tenia.
    const rolFinal = (rol as SystemRole) || existingUser.rol;
    const activoFinal = typeof activo === "boolean" ? activo : existingUser.activo;

    // SPEC 2.112: nunca quedarse sin administradores ni dejarse afuera a uno
    // mismo.
    const dejaDeSerAdminActivo =
      existingUser.rol === "admin" && existingUser.activo && (rolFinal !== "admin" || !activoFinal);
    if (dejaDeSerAdminActivo) {
      if (existingUser.id === session.user.id) {
        throw new ConflictError(
          activoFinal
            ? "No puedes quitarte a ti mismo el rol de administrador"
            : "No puedes desactivar tu propia cuenta"
        );
      }
      const otrosAdmins = await prisma.systemUser.count({
        where: { rol: "admin", activo: true, id: { not: id } },
      });
      if (otrosAdmins === 0) {
        throw new ConflictError(
          "Es el último administrador activo: activa o crea otro administrador antes de cambiarlo"
        );
      }
    }
    if (rolFinal === 'admin') {
      updateData.sedeId = null;
    } else if (sedeId !== undefined) {
      updateData.sedeId = sedeId || null;
    } else if (!existingUser.sedeId) {
      return NextResponse.json(
        { error: "Este rol necesita una sede asignada" },
        { status: 400 }
      );
    }

    const user = await prisma.systemUser.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        activo: true,
        ultimoLogin: true,
        createdAt: true,
        sedeId: true,
        sede: { select: { id: true, codigo: true, nombre: true } },
      },
    });

    // `existingUser` trae passwordHash (findUnique sin `select`), por lo
    // que el snapshot de auditoria se arma a mano para excluirlo.
    await auditLogService.registrarActualizacion(
      'usuario',
      user.id,
      `Usuario actualizado: ${user.nombre} (${user.email})`,
      { email: existingUser.email, nombre: existingUser.nombre, rol: existingUser.rol, activo: existingUser.activo, sedeId: existingUser.sedeId },
      { email: user.email, nombre: user.nombre, rol: user.rol, activo: user.activo, sedeId: user.sedeId },
      session.user?.email
    );

    // Desactivar corta su sesion en su siguiente accion (lib/auth.ts); queda
    // en el registro de accesos, con quien lo hizo.
    if (existingUser.activo && !user.activo) {
      await registrarAcceso({
        email: user.email,
        usuarioId: user.id,
        resultado: "sesion_revocada",
        detalle: `Cuenta desactivada por ${session.user?.email ?? "un administrador"}`,
      });
    }

    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar usuario');
  }
}
