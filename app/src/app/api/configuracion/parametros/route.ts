import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from "@/lib/auth/guard";
import { auditLogService } from "@/lib/services/auditLogService";
import { ETIQUETAS_PARAMETROS, validarParametros } from "@/lib/validations/parametros";

// Configuracion general del sistema, guardada como fila unica ("singleton").
// GET siempre la devuelve (con defaults si aun no se guardo nada) y PUT
// hace upsert sobre ese mismo id.
const SINGLETON_ID = "singleton";

// GET /api/configuracion/parametros
export async function GET() {
  try {
    await requirePermission('configuracion', 'read');

    const config =
      (await prisma.systemConfig.findUnique({ where: { id: SINGLETON_ID } })) ??
      // Sin fila guardada aun: devolver los defaults sin crearla (se crea
      // recien al primer PUT).
      {
        id: SINGLETON_ID,
        empresaNombre: null,
        empresaRut: null,
        empresaDireccion: null,
        empresaTelefono: null,
        empresaEmail: null,
        empresaSitioWeb: null,
        duracionSesionHoras: 24,
        maxIntentosLogin: 5,
        minutosBloqueoLogin: 15,
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

    const {
      empresaNombre,
      empresaRut,
      empresaDireccion,
      empresaTelefono,
      empresaEmail,
      empresaSitioWeb,
      duracionSesionHoras,
      maxIntentosLogin,
      minutosBloqueoLogin,
    } = body;

    // Mismas reglas que la pantalla (SPEC 2.102): RUT y email de la empresa
    // bien escritos y parametros de seguridad dentro de sus limites. Cada
    // error va con su campo y un mensaje legible.
    const errores = validarParametros(body);
    if (Object.keys(errores).length > 0) {
      const [primero] = Object.keys(errores);
      return NextResponse.json(
        {
          error: `${ETIQUETAS_PARAMETROS[primero]}: ${errores[primero]}`,
          details: Object.entries(errores).map(([field, message]) => ({ field, message })),
        },
        { status: 400 }
      );
    }

    const anterior = await prisma.systemConfig.findUnique({ where: { id: SINGLETON_ID } });

    const datos = {
      empresaNombre: empresaNombre?.trim() || null,
      empresaRut: empresaRut?.trim() || null,
      empresaDireccion: empresaDireccion?.trim() || null,
      empresaTelefono: empresaTelefono?.trim() || null,
      empresaEmail: empresaEmail?.trim() || null,
      empresaSitioWeb: empresaSitioWeb?.trim() || null,
      duracionSesionHoras: duracionSesionHoras ?? anterior?.duracionSesionHoras ?? 24,
      maxIntentosLogin: maxIntentosLogin ?? anterior?.maxIntentosLogin ?? 5,
      minutosBloqueoLogin: minutosBloqueoLogin ?? anterior?.minutosBloqueoLogin ?? 15,
      updatedPor: session.user?.email,
    };

    const config = await prisma.systemConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...datos },
      update: datos,
    });

    // Auditoria de configuracion sensible; siempre "actualizar", incluso la
    // primera vez que se guarda algo.
    await auditLogService.registrarActualizacion(
      "configuracion",
      SINGLETON_ID,
      "Parámetros generales del sistema actualizados",
      anterior
        ? {
            duracionSesionHoras: anterior.duracionSesionHoras,
            maxIntentosLogin: anterior.maxIntentosLogin,
            minutosBloqueoLogin: anterior.minutosBloqueoLogin,
          }
        : { duracionSesionHoras: 24, maxIntentosLogin: 5, minutosBloqueoLogin: 15 },
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
