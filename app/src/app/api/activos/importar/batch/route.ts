import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { logger } from "@/shared/logger";
import { procesarFila, armarContextoImportacion } from "@/modules/importacion/servidor";
import { validarCantidadFilas } from "@/modules/importacion";
import type { CorrectedRow, ImportRowStatus, ImportBatchResult } from "@/modules/importacion";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from "@/shared/utilidades/limiteUso";

// Operacion pesada: hasta 60 s (Vercel corta antes por defecto).
export const maxDuration = 60;

// Unico punto donde la importacion de Activos escribe en la base. Recibe
// TODAS las filas a importar -las que ya estaban validas en la vista previa
// mas las que el usuario corrigio en el panel de errores- y las procesa con
// procesarFila(dryRun=false): exactamente las mismas reglas que la vista
// previa (misma funcion), asi que lo que /preview aprobo es lo que se
// termina de escribir. No hay un endpoint separado para "importar todo de
// una" y otro para "reimportar corregidas": ambos casos son este mismo
// commit, disparado por un unico boton "Realizar importación".
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    exigirCupo(session.user.id, "importarTanda");

    const body = await request.json();
    const { categoria, rows, sedeId: sedeIdSolicitada } = body as {
      categoria: string;
      rows: CorrectedRow[];
      sedeId?: string;
    };

    if (!categoria || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos" },
        { status: 400 }
      );
    }
    // La pantalla manda tandas de FILAS_POR_TANDA; este tope protege la
    // ruta de un POST armado a mano con un arreglo enorme.
    validarCantidadFilas(rows.length);

    let categoryRecord = await prisma.assetCategory.findFirst({
      where: { nombre: { equals: categoria, mode: "insensitive" } },
    });
    if (!categoryRecord) {
      categoryRecord = await prisma.assetCategory.create({
        data: {
          nombre: categoria.charAt(0).toUpperCase() + categoria.slice(1),
          descripcion: `Categoría ${categoria}`,
        },
      });
    }

    // El Excel no trae tipo de mantencion; las importadas quedan como
    // "Preventiva" (catalogo creado una sola vez si no existe).
    const tipoMantencionImportada = await prisma.maintenanceType.upsert({
      where: { nombre: "Preventiva" },
      update: {},
      create: { nombre: "Preventiva" },
      select: { id: true },
    });

    const ctx = await armarContextoImportacion({
      session,
      sedeIdSolicitada,
      filas: rows.map((row) => row.data ?? {}),
      categoriaId: categoryRecord.id,
      exigeImei: categoryRecord.tipoFicha === "celular",
      tipoMantencionId: tipoMantencionImportada.id,
    });

    const results: ImportRowStatus[] = [];

    for (const row of rows) {
      const resultado = await procesarFila(row.data, ctx, prisma, false).catch((error) => ({
        status: "error" as const,
        tipo: "unknown_error" as const,
        mensaje: error instanceof Error ? error.message : "Error desconocido",
        data: row.data,
        campo: undefined as string | undefined,
      }));

      if (resultado.status === "error") {
        results.push({
          rowIndex: row.rowIndex,
          excelRow: row.rowIndex + 2,
          status: "error",
          data: resultado.data,
          errors: [{ type: resultado.tipo, field: resultado.campo, message: resultado.mensaje }],
          warnings: [],
        });
        continue;
      }

      results.push({
        rowIndex: row.rowIndex,
        excelRow: row.rowIndex + 2,
        status: "imported",
        data: resultado.data,
        errors: [],
        warnings: [],
        assetId: resultado.status === "imported" ? resultado.assetId : undefined,
      });
    }

    // Sistema Operativo, Antivirus y Licencia M365 son texto plano en el
    // Activo, pero tambien alimentan un catalogo administrable en
    // Configuracion (ver /api/sistemas-operativos y hermanos). El import no
    // pasa por ese catalogo -- por eso, despues de escribir los activos, se
    // agregan ahi los valores nuevos que trajo esta tanda (misma logica que
    // el boton "+ Agregar opcion" de cada formulario: si ya existe un
    // nombre igual sin importar mayusculas, no se duplica). El texto usado
    // es EXACTAMENTE el que quedo guardado en los activos -- de ahi sale el
    // conteo "en uso" de cada opcion, que compara por igualdad exacta.
    const nombresSO = new Set<string>();
    const nombresAntivirus = new Set<string>();
    const nombresLicencia = new Set<string>();
    for (const r of results) {
      if (r.status !== "imported") continue;
      const so = (r.data.sistemaOperativo || "").trim();
      const av = (r.data.antivirus || "").trim();
      const lic = (r.data.microsoft365 || "").trim();
      if (so) nombresSO.add(so);
      if (av) nombresAntivirus.add(av);
      if (lic) nombresLicencia.add(lic);
    }

    // Best-effort: si esto falla, los activos ya importados se quedan
    // importados igual -- el catalogo se puede completar despues a mano.
    try {
      for (const nombre of nombresSO) {
        const existente = await prisma.sistemaOperativo.findFirst({
          where: { nombre: { equals: nombre, mode: "insensitive" } },
        });
        if (!existente) {
          await prisma.sistemaOperativo.create({ data: { nombre } });
        } else if (!existente.activo) {
          await prisma.sistemaOperativo.update({ where: { id: existente.id }, data: { activo: true } });
        }
      }
      for (const nombre of nombresAntivirus) {
        const existente = await prisma.antivirus.findFirst({
          where: { nombre: { equals: nombre, mode: "insensitive" } },
        });
        if (!existente) {
          await prisma.antivirus.create({ data: { nombre } });
        } else if (!existente.activo) {
          await prisma.antivirus.update({ where: { id: existente.id }, data: { activo: true } });
        }
      }
      for (const nombre of nombresLicencia) {
        const existente = await prisma.licenciaMicrosoft365.findFirst({
          where: { nombre: { equals: nombre, mode: "insensitive" } },
        });
        if (!existente) {
          await prisma.licenciaMicrosoft365.create({ data: { nombre } });
        } else if (!existente.activo) {
          await prisma.licenciaMicrosoft365.update({ where: { id: existente.id }, data: { activo: true } });
        }
      }
    } catch (error) {
      logger.error("No se pudieron completar las opciones de catalogo tras la importacion", error);
    }

    const response: ImportBatchResult = {
      success: results.every((r) => r.status === "imported"),
      imported: results.filter((r) => r.status === "imported").length,
      skipped: 0,
      failed: results.filter((r) => r.status === "error").length,
      results,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error, 'Error al importar activos');
  }
}
