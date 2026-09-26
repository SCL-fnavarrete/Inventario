import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError, respuestaErroresCampos } from "@/lib/auth/guard";
import { auditLogService } from "@/lib/services/auditLogService";
import {
  CAMPOS_SEGURIDAD,
  ETIQUETAS_PARAMETROS,
  SEGURIDAD_POR_DEFECTO,
  validarParametros,
  type CampoSeguridad,
} from "@/lib/validations/parametros";

// Configuracion > Seguridad (SPEC 2.112), guardada como fila unica
// ("singleton"). GET siempre la devuelve (con los valores por defecto si aun
// no se guardo nada) y PUT hace upsert sobre ese mismo id.
const SINGLETON_ID = "singleton";

/** Solo los campos de seguridad de una fila (sin id ni fechas). */
const valoresDe = (fila: Record<CampoSeguridad, number>) =>
  Object.fromEntries(CAMPOS_SEGURIDAD.map((c) => [c, fila[c]])) as Record<CampoSeguridad, number>;

// GET /api/configuracion/parametros
export async function GET() {
  try {
    await requirePermission('configuracion', 'read');

    const config = (await prisma.systemConfig.findUnique({ where: { id: SINGLETON_ID } })) ?? {
      id: SINGLETON_ID,
      ...SEGURIDAD_POR_DEFECTO,
      updatedAt: null,
      updatedPor: null,
    };

    return NextResponse.json(config);
  } catch (error) {
    return handleApiError(error, "Error al obtener la configuración");
  }
}

// PUT /api/configuracion/parametros
export async function PUT(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    const body = await request.json();

    // Mismas reglas que la pantalla (SPEC 2.102): cada valor dentro de sus
    // limites, con el campo de cada error.
    const invalido = respuestaErroresCampos(validarParametros(body), ETIQUETAS_PARAMETROS);
    if (invalido) return invalido;

    const anterior = await prisma.systemConfig.findUnique({ where: { id: SINGLETON_ID } });
    const base = anterior ?? SEGURIDAD_POR_DEFECTO;
    const datos = {
      ...Object.fromEntries(CAMPOS_SEGURIDAD.map((c) => [c, body[c] ?? base[c]])),
      updatedPor: session.user?.email,
    } as Record<CampoSeguridad, number> & { updatedPor?: string | null };

    const config = await prisma.systemConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...datos },
      update: datos,
    });

    // Configuracion sensible: siempre queda en Auditoria.
    await auditLogService.registrarActualizacion(
      "configuracion",
      SINGLETON_ID,
      "Seguridad del sistema actualizada",
      valoresDe(base),
      valoresDe(config),
      session.user?.email
    );

    return NextResponse.json(config);
  } catch (error) {
    return handleApiError(error, "Error al guardar la configuración");
  }
}
