import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError, respuestaErroresCampos } from "@/lib/auth/guard";
import { auditLogService } from "@/lib/services/auditLogService";
import { ETIQUETAS_PARAMETROS, validarParametros } from "@/lib/validations/parametros";

// Configuracion > Seguridad (SPEC 2.112), guardada como fila unica
// ("singleton"). GET siempre la devuelve (con los valores por defecto si aun
// no se guardo nada) y PUT hace upsert sobre ese mismo id.
const SINGLETON_ID = "singleton";

const POR_DEFECTO = { duracionSesionHoras: 24, maxIntentosLogin: 5, minutosBloqueoLogin: 15 };

// GET /api/configuracion/parametros
export async function GET() {
  try {
    await requirePermission('configuracion', 'read');

    const config = (await prisma.systemConfig.findUnique({ where: { id: SINGLETON_ID } })) ?? {
      id: SINGLETON_ID,
      ...POR_DEFECTO,
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
    const datos = {
      duracionSesionHoras: body.duracionSesionHoras ?? anterior?.duracionSesionHoras ?? POR_DEFECTO.duracionSesionHoras,
      maxIntentosLogin: body.maxIntentosLogin ?? anterior?.maxIntentosLogin ?? POR_DEFECTO.maxIntentosLogin,
      minutosBloqueoLogin: body.minutosBloqueoLogin ?? anterior?.minutosBloqueoLogin ?? POR_DEFECTO.minutosBloqueoLogin,
      updatedPor: session.user?.email,
    };

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
      anterior
        ? {
            duracionSesionHoras: anterior.duracionSesionHoras,
            maxIntentosLogin: anterior.maxIntentosLogin,
            minutosBloqueoLogin: anterior.minutosBloqueoLogin,
          }
        : POR_DEFECTO,
      {
        duracionSesionHoras: config.duracionSesionHoras,
        maxIntentosLogin: config.maxIntentosLogin,
        minutosBloqueoLogin: config.minutosBloqueoLogin,
      },
      session.user?.email
    );

    return NextResponse.json(config);
  } catch (error) {
    return handleApiError(error, "Error al guardar la configuración");
  }
}
