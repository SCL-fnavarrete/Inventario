import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ImportPreviewResult, ImportRowStatus } from "@/types/import";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeIdParaCrear } from '@/lib/auth/sedeScope';
import { construirMapaSedes } from "@/lib/importacion/activos";
import { leerFilasExcel } from "@/lib/importacion/leerExcel";
import { procesarFila, type ContextoFila } from "@/lib/importacion/procesarFila";

// Constantes de seguridad para archivos
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream", // Algunos navegadores envían este tipo
];

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('activos', 'write');

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sheetName = formData.get("sheetName") as string;
    const categoria = formData.get("categoria") as string;
    const mappingStr = formData.get("mapping") as string;

    if (!file || !sheetName) {
      return NextResponse.json({ error: "Faltan parámetros requeridos" }, { status: 400 });
    }

    // Parsear mapping si existe
    const mapping = mappingStr ? (JSON.parse(mappingStr) as Record<string, string>) : null;

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El archivo excede el tamaño máximo de 5MB" }, { status: 413 });
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
      return NextResponse.json({ error: "Solo se permiten archivos Excel (.xlsx, .xls)" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();

    // Sin mapping todavia (recien se subio el archivo): solo se devuelven
    // los encabezados y una vista cruda de las primeras filas, para que el
    // usuario arme el mapeo de columnas. Ninguna validacion de negocio
    // ocurre en este punto -- no hace falta, todavia no hay mapeo.
    if (!mapping) {
      const { headers, filas } = leerFilasExcel(buffer, sheetName, categoria, {});
      // Sin mapping, leerFilasExcel no puede armar `data`; se re-lee crudo
      // usando cada columna como su propio campo, solo para la vista previa
      // de estructura (encabezados + primeras filas), igual que antes.
      const mappingIdentidad: Record<string, string> = {};
      headers.forEach((h) => { if (h) mappingIdentidad[h] = h; });
      const { filas: filasCrudas } = leerFilasExcel(buffer, sheetName, categoria, mappingIdentidad);
      const rows = filasCrudas.slice(0, 100).map((f) => headers.map((h) => f.data[h] ?? ""));

      return NextResponse.json({
        headers,
        rows,
        totalRows: filas.length || filasCrudas.length,
      });
    }

    // --- VALIDACION COMPLETA, SIN ESCRIBIR NADA -----------------------------
    // Aqui es donde antes "Importar" escribia de inmediato en la base. Ahora
    // esta ruta solo corre procesarFila() en modo dryRun -- exactamente las
    // mismas reglas que la confirmacion real (ver procesarFila.ts), pero sin
    // tocar la base. Nada queda guardado hasta que el usuario revise los
    // errores y confirme desde /importar/batch.
    if (!mapping.marca || !mapping.modelo || !mapping.numeroSerie) {
      return NextResponse.json({ error: "Faltan campos requeridos en el mapeo" }, { status: 400 });
    }

    const sedeIdExplicita = sedeIdParaCrear(session, formData.get("sedeId") as string | null, {
      requerido: false,
    });
    const mapaSedes = construirMapaSedes(
      await prisma.sede.findMany({ select: { id: true, nombre: true, codigo: true } })
    );

    // La categoria y el tipo de mantencion son datos que la confirmacion
    // real necesita para escribir, pero la vista previa no los usa (nunca
    // llega a la parte de procesarFila que escribe) -- no se crean aqui
    // (una vista previa no debe tener efectos secundarios en la base). Si la
    // categoria no existe todavia, se creara recien al confirmar.
    const categoryRecord = await prisma.assetCategory.findFirst({
      where: { nombre: { equals: categoria, mode: "insensitive" } },
      select: { id: true },
    });

    const { headers, filas } = leerFilasExcel(buffer, sheetName, categoria, mapping);

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
      existingSeriesSet,
      employeeCache: new Map<string, string>(),
    };

    const rows: ImportRowStatus[] = [];
    for (const fila of filas) {
      const resultado = await procesarFila(fila.data, ctx, prisma, true);

      if (resultado.status === "error") {
        rows.push({
          rowIndex: rows.length,
          excelRow: fila.rowNum,
          status: "error",
          data: resultado.data,
          errors: [{ type: resultado.tipo, message: resultado.mensaje }],
          warnings: [],
        });
      } else {
        rows.push({
          rowIndex: rows.length,
          excelRow: fila.rowNum,
          status: "valid",
          data: resultado.data,
          errors: [],
          warnings: [],
        });
      }
    }

    const result: ImportPreviewResult = {
      headers,
      rows,
      totalRows: rows.length,
      validCount: rows.filter((r) => r.status === "valid").length,
      errorCount: rows.filter((r) => r.status === "error").length,
      warningCount: 0,
      duplicatesInFile: rows
        .filter((r) => r.errors.some((e) => e.type === "duplicate_in_file"))
        .map((r) => r.data.numeroSerie || ""),
      duplicatesInDb: rows
        .filter((r) => r.errors.some((e) => e.type === "duplicate_in_database"))
        .map((r) => r.data.numeroSerie || ""),
    };

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al procesar el archivo Excel');
  }
}
