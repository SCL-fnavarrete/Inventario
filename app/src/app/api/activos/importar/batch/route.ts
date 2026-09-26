import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { construirMapaCatalogo, construirMapaSedes } from "@/lib/importacion/activos";
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
    // Catalogos administrables (Configuracion > Opciones de Activos): se
    // traen en vivo, una sola vez por importacion, para validar sistema
    // operativo/antivirus/licencia M365 fila por fila sin texto fijo.
    const mapaSistemasOperativos = construirMapaCatalogo(
      await prisma.sistemaOperativo.findMany({ select: { nombre: true } })
    );
    const mapaAntivirus = construirMapaCatalogo(
      await prisma.antivirus.findMany({ select: { nombre: true } })
    );
    const mapaLicenciasM365 = construirMapaCatalogo(
      await prisma.licenciaMicrosoft365.findMany({ select: { nombre: true } })
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
      exigeImei: categoryRecord.tipoFicha === "celular",
      tipoMantencionId: tipoMantencionImportada.id,
      sedeIdExplicita,
      mapaSedes,
      mapaSistemasOperativos,
      mapaAntivirus,
      mapaLicenciasM365,
      existingSeriesSet,
      existingImeiSet: new Set(
        (await prisma.asset.findMany({ where: { imei: { not: null } }, select: { imei: true } })).map((a) => a.imei!)
      ),
      employeeCache: new Map<string, string>(),
    };

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
