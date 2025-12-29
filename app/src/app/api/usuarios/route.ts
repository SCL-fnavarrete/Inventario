import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Roles válidos del sistema
const VALID_ROLES = ["admin", "tecnico", "supervisor", "rrhh", "auditor"] as const;
type SystemRole = typeof VALID_ROLES[number];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Solo admin puede ver usuarios
    const userRole = session.user.role;
    if (userRole !== "admin") {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

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
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Error al obtener usuarios" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Solo admin puede crear usuarios
    const userRole = session.user.role;
    if (userRole !== "admin") {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

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
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Error al crear usuario" },
      { status: 500 }
    );
  }
}
