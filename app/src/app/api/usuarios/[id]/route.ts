import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// Roles válidos del sistema
const VALID_ROLES = ["admin", "tecnico", "supervisor", "rrhh", "auditor"] as const;
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
    const { email, nombre, rol, password, activo } = body;

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
    if (password && password.length >= 6) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
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
