import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import bcrypt from "bcryptjs";
import { requirePermission, handleApiError, errorRepetido, errorDeCampo } from '@/shared/auth/guard';
import { crearUsuarioSchema, SELECT_USUARIO } from '@/modules/configuracion';
import { exigirSedeActiva } from '@/shared/sedes/consultas';
import { auditLogService } from '@/shared/auditoria';

export async function GET() {
  try {
    await requirePermission('usuarios', 'read');

    const users = await prisma.systemUser.findMany({
      orderBy: { nombre: "asc" },
      select: SELECT_USUARIO,
    });

    return NextResponse.json(users);
  } catch (error) {
    return handleApiError(error, 'Error al obtener usuarios');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('usuarios', 'write');
    const { email, nombre, password, rol, sedeId, activo } = crearUsuarioSchema.parse(await request.json());

    const existing = await prisma.systemUser.findUnique({ where: { email } });
    if (existing) {
      throw errorRepetido("email", "Ya existe un usuario con ese email");
    }

    // Admin no tiene sede; el tecnico pertenece a una, activa (SPEC 2.112.6).
    // No lo limita: trabaja con todas (SPEC 2.117).
    if (rol !== "admin") {
      if (!sedeId) throw errorDeCampo("sedeId", "Este rol necesita una sede asignada");
      await exigirSedeActiva(sedeId);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.systemUser.create({
      data: {
        email,
        nombre,
        rol,
        passwordHash,
        activo: activo ?? true,
        sedeId: rol === "admin" ? null : sedeId,
      },
      select: SELECT_USUARIO,
    });

    // Nunca incluir passwordHash ni password en el snapshot de auditoria.
    await auditLogService.registrarCreacion(
      'usuario',
      user.id,
      `Usuario creado: ${user.nombre} (${user.email})`,
      { email: user.email, nombre: user.nombre, rol: user.rol, activo: user.activo, sedeId: user.sedeId },
      session.user?.email
    );

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear usuario');
  }
}
