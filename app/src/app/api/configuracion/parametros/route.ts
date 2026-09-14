import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from "@/lib/auth/guard";
import { auditLogService } from "@/lib/services/auditLogService";

// Configuracion general del sistema (14-sep-2026): reemplaza la pantalla
// decorativa de Configuracion > Parametros Generales -- ver SystemConfig en
// schema.prisma. Fila unica ("singleton"): GET siempre la devuelve (con los
// valores por defecto si todavia no se guardo nada) y PUT hace upsert sobre
// ese mismo id.
const SINGLETON_ID = "singleton";

// GET /api/configuracion/parametros
export async function GET() {
  try {
    await requirePermission('configuracion', 'read');

    const config =
      (await prisma.systemConfig.findUnique({ where: { id: SINGLETON_ID } })) ??
      // Todavia no se guardo nada: se devuelven los defaults del schema sin
      // crear la fila (se crea recien al primer PUT), para no dejar un
      // registro vacio en la base solo por haber abierto la pantalla.
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

    // Validacion minima: los 3 campos de seguridad son los que de verdad
    // alteran el comportamiento del sistema (duracion de sesion / bloqueo de
    // login) -- si llegan mal, mejor rechazar que dejar el sistema con un
    // valor sin sentido (ej. sesiones de 0 horas, todos bloqueados siempre).
    const camposNumericos: Array<[string, unknown]> = [
      ["duracionSesionHoras", duracionSesionHoras],
      ["maxIntentosLogin", maxIntentosLogin],
      ["minutosBloqueoLogin", minutosBloqueoLogin],
    ];
    for (const [campo, valor] of camposNumericos) {
      if (valor !== undefined && (!Number.isInteger(valor) || (valor as number) < 1)) {
        return NextResponse.json(
          { error: `${campo} debe ser un número entero mayor a 0` },
          { status: 400 }
        );
      }
    }
    // Tope razonable para no dejar, por error de tipeo, una sesion de "24"
    // interpretada como 24 dias o un bloqueo de horas en vez de minutos.
    if (duracionSesionHoras !== undefined && duracionSesionHoras > 720) {
      return NextResponse.json(
        { error: "duracionSesionHoras no puede superar 720 (30 días)" },
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

    // Auditoria generica (SPEC 2.31/2.32): es configuracion sensible
    // (duracion de sesion, intentos de login), tiene sentido saber quien la
    // cambio. Se usa "actualizar" siempre, incluso la primera vez que se
    // guarda algo (conceptualmente es "configurar", no "crear un recurso").
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
