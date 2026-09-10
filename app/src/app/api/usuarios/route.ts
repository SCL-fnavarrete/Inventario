import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// Roles válidos del sistema (solo dos: admin ve todo, tecnico es soporte
// restringido a su sede -- ver sedeScope()).
const VALID_ROLES = ["admin", "tecnico"] as const;
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
        sedeId: true,
        sede: { select: { id: true, codigo: true, nombre: true } },
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
    const { email, nombre, rol, password, activo, sedeId } = body;

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

    // Sede (SPEC 2.9): admin no tiene sede (ve todo); cualquier otro rol
    // necesita una para que el aislamiento de datos funcione -- sin ella el
    // usuario quedaria creado pero sin poder ver ni crear nada.
    const rolFinal = (rol as SystemRole) || "tecnico";
    if (rolFinal !== "admin" && !sedeId) {
      return NextResponse.json(
        { error: "Este rol necesita una sede asignada" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.systemUser.create({
      data: {
        email: email.toLowerCase().trim(),
        nombre: nombre.trim(),
        rol: rolFinal,
        passwordHash,
        activo: activo ?? true,
        sedeId: rolFinal === "admin" ? null : sedeId,
      },
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        activo: true,
        createdAt: true,
        sedeId: true,
        sede: { select: { id: true, codigo: true, nombre: true } },
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear usuario');
  }
}
