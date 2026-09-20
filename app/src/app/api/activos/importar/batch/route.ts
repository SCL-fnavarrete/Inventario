import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { construirMapaSedes } from "@/lib/importacion/activos";
import { procesarFila, type ContextoFila } from "@/lib/importacion/procesarFila";
import type { CorrectedRow, ImportRowStatus, ImportBatchResult } from "@/types/import";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeIdParaCrear } from '@/lib/auth/sedeScope';

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
    const session = await requirePermission('activos', 'write');

    const body = await request.json();
    const { categoria, rows, sedeId: sedeIdSolicitada } = body as {
      categoria: string;
      rows: CorrectedRow[];
      sedeId?: string;
    };

    if (!categoria || !rows || rows.length === 0) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos" },
        { status: 400 }
      );
    }

    const sedeIdExplicita = sedeIdParaCrear(session, sedeIdSolicitada, { requerido: false });

    const mapaSedes = construirMapaSedes(
      await prisma.sede.findMany({ select: { id: true, nombre: true, codigo: true } })
    );

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

    const existingSeries = await prisma.asset.findMany({
      where: { numeroSerie: { not: null } },
      select: { numeroSerie: true },
    });
    const existingSeriesSet = new Set(
      existingSeries.filter((a) => a.numeroSerie).map((a) => a.numeroSerie!.toUpperCase())
    );

    const ctx: ContextoFila = {
      session,
      categoriaId: categoryRecord.id,
      tipoMantencionId: tipoMantencionImportada.id,
      sedeIdExplicita,
      mapaSedes,
      existingSeriesSet,
      employeeCache: new Map<string, string>(),
    };

    const results: ImportRowStatus[] = [];

    for (const row of rows) {
      const resultado = await procesarFila(row.data, ctx, prisma, false).catch((error) => ({
        status: "error" as const,
        tipo: "unknown_error" as const,
        mensaje: error instanceof Error ? error.message : "Error desconocido",
        data: row.data,
      }));

      if (resultado.status === "error") {
        results.push({
          rowIndex: row.rowIndex,
          excelRow: row.rowIndex + 2,
          status: "error",
          data: resultado.data,
          errors: [{ type: resultado.tipo, message: resultado.mensaje }],
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
