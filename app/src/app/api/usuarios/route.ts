import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// Roles válidos del sistema
const VALID_ROLES = ["admin", "tecnico", "supervisor", "rrhh", "auditor"] as const;
type SystemRole = typeof VALID_ROLES[number];

export async function GET() {
  try {
    await requirePermission('usuarios', 'read');

    const users = await prisma.systemUser.findMany({
      orderBy: { nombre: "asc" },
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

    return NextResponse.json(users);
  } catch (error) {
    return handleApiError(error, 'Error al obtener usuarios');
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission('usuarios', 'write');

    const body = await request.json();
    const { email, nombre, rol, password, activo } = body;

    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: "El email es requerido" },
        { status: 400 }
      );
    }

    if (!nombre || !nombre.trim()) {
      return NextResponse.json(
        { error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    if (!password || password.length < 12) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 12 caracteres" },
        { status: 400 }
      );
    }

    // Validar complejidad de contraseña
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSymbol) {
      return NextResponse.json(
        { error: "La contraseña debe contener mayúscula, minúscula, número y símbolo" },
        { status: 400 }
      );
    }

    // Validar rol si se proporciona
    if (rol && !VALID_ROLES.includes(rol as SystemRole)) {
      return NextResponse.json(
        { error: `Rol inválido. Roles permitidos: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    // Verificar si ya existe
    const existing = await prisma.systemUser.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese email" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.systemUser.create({
      data: {
        email: email.toLowerCase().trim(),
        nombre: nombre.trim(),
        rol: (rol as SystemRole) || "tecnico",
        passwordHash,
        activo: activo ?? true,
      },
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        activo: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear usuario');
  }
}
