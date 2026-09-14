import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { validarPasswordFuerte } from '@/lib/validations/password';

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
    await requirePermission('usuarios', 'write');

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

      if (emailInUse) {
        return NextResponse.json(
          { error: "El email ya está en uso por otro usuario" },
          { status: 400 }
        );
      }
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
    }
    // Misma regla que al crear un usuario (14-sep-2026, SPEC 2.26): antes
    // solo exigia 6 caracteres sin complejidad, dejando cambiar una
    // contraseña fuerte por una debil al editar.
    if (password) {
      const errorPassword = validarPasswordFuerte(password);
      if (errorPassword) {
        return NextResponse.json({ error: errorPassword }, { status: 400 });
      }
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    // Sede (SPEC 2.9): admin no tiene sede (ve todo); cualquier otro rol
    // necesita una para que el aislamiento de datos funcione. El rol
    // "final" es el nuevo si viene en el body, o el que ya tenia.
    const rolFinal = (rol as SystemRole) || existingUser.rol;
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

    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar usuario');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('usuarios', 'delete');

    const { id } = await params;

    // No permitir eliminarse a sí mismo
    if (session.user.id === id) {
      return NextResponse.json(
        { error: "No puedes eliminar tu propio usuario" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.systemUser.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    await prisma.systemUser.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar usuario');
  }
}
