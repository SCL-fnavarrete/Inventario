import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ImportRowStatus } from "@/types/import";
import { requirePermission, handleApiError } from "@/lib/auth/guard";
import { sedeIdParaCrear } from "@/lib/auth/sedeScope";
import { construirMapaCatalogo, construirMapaSedes } from "@/lib/importacion/activos";
import { procesarFila, type ContextoFila } from "@/lib/importacion/procesarFila";

interface FilaARevalidar {
  rowIndex: number;
  excelRow: number;
  data: Record<string, string>;
}

/**
 * Vuelve a correr procesarFila() (dryRun, sin escribir nada) sobre un grupo
 * de filas que ya estaban en la pantalla de revision -- pensado para el
 * boton "Reintentar filas pendientes": si el usuario recien creo una
 * opcion nueva de catalogo (Sistema Operativo, Antivirus, Licencia M365)
 * corrigiendo UNA fila con el boton "+" de CatalogSelect, esto revalida el
 * resto de las filas que quedaron con el mismo valor sin reconocer, sin
 * que el usuario tenga que repetir la misma correccion fila por fila.
 *
 * No requiere volver a subir el Excel: el frontend ya tiene el `data` de
 * cada fila desde la vista previa original, asi que solo se necesitan las
 * filas mismas -- el catalogo y las sedes se traen de nuevo, en vivo, para
 * reflejar lo que se acaba de crear.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("activos", "write");

    const body = await request.json();
    const categoria = body.categoria as string;
    const filas = body.filas as FilaARevalidar[];

    if (!categoria || !Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: "Faltan parámetros requeridos" }, { status: 400 });
    }

    const sedeIdExplicita = sedeIdParaCrear(session, (body.sedeId as string | null) ?? null, {
      requerido: false,
    });

    const mapaSedes = construirMapaSedes(
      await prisma.sede.findMany({ select: { id: true, nombre: true, codigo: true } })
    );
    const mapaSistemasOperativos = construirMapaCatalogo(
      await prisma.sistemaOperativo.findMany({ select: { nombre: true } })
    );
    const mapaAntivirus = construirMapaCatalogo(
      await prisma.antivirus.findMany({ select: { nombre: true } })
    );
    const mapaLicenciasM365 = construirMapaCatalogo(
      await prisma.licenciaMicrosoft365.findMany({ select: { nombre: true } })
    );

    const categoryRecord = await prisma.assetCategory.findFirst({
      where: { nombre: { equals: categoria, mode: "insensitive" } },
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
      categoriaId: categoryRecord?.id ?? "",
      tipoMantencionId: "",
      sedeIdExplicita,
      mapaSedes,
      mapaSistemasOperativos,
      mapaAntivirus,
      mapaLicenciasM365,
      existingSeriesSet,
      employeeCache: new Map<string, string>(),
    };

    const rows: ImportRowStatus[] = [];
    for (const fila of filas) {
      const resultado = await procesarFila(fila.data, ctx, prisma, true);

      if (resultado.status === "error") {
        rows.push({
          rowIndex: fila.rowIndex,
          excelRow: fila.excelRow,
          status: "error",
          data: resultado.data,
          errors: [{ type: resultado.tipo, field: resultado.campo, message: resultado.mensaje }],
          warnings: [],
        });
      } else {
        rows.push({
          rowIndex: fila.rowIndex,
          excelRow: fila.excelRow,
          status: "valid",
          data: resultado.data,
          errors: [],
          warnings: [],
        });
      }
    }

    return NextResponse.json({ rows });
  } catch (error) {
    return handleApiError(error, "Error al revalidar las filas");
  }
}
