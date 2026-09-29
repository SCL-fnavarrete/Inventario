import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import type { ImportPreviewResult, ImportRowStatus } from "@/modules/importacion/tipos";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from "@/shared/utilidades/limiteUso";
import { leerFilasExcel, leerHoja, mapearFilas } from "@/modules/importacion/leerExcel";
import { procesarFila } from "@/modules/importacion/procesarFila";
import { armarContextoImportacion } from "@/modules/importacion/contexto";
import { validarArchivoExcel } from "@/modules/importacion/validarArchivo";

// Operacion pesada: hasta 60 s (Vercel corta antes por defecto).
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    exigirCupo(session.user.id, "importarArchivo");

    const formData = await request.formData();
    const sheetName = formData.get("sheetName") as string;
    const categoria = formData.get("categoria") as string;
    const mappingStr = formData.get("mapping") as string;
    // Correcciones ya hechas a mano en el panel de errores, por rowIndex
    // (mismo indice que arma el loop de mas abajo). Las manda "Revalidar
    // todo el Excel" para no perder lo corregido al releer el archivo
    // original desde cero -- sin esto, revalidar pisaba cualquier arreglo
    // manual (ej. la Marca de una fila) con el valor crudo del Excel de
    // nuevo.
    const correctionsStr = formData.get("corrections") as string | null;

    if (!sheetName) {
      return NextResponse.json({ error: "Faltan parámetros requeridos" }, { status: 400 });
    }

    // Parsear mapping si existe
    const mapping = mappingStr ? (JSON.parse(mappingStr) as Record<string, string>) : null;
    const corrections: Record<number, Record<string, string>> = correctionsStr
      ? JSON.parse(correctionsStr)
      : {};

    const buffer = await validarArchivoExcel(formData.get("file"));

    // Sin mapping todavia (recien se subio el archivo): solo se devuelven
    // los encabezados y una vista cruda de las primeras filas, para que el
    // usuario arme el mapeo de columnas. Ninguna validacion de negocio
    // ocurre en este punto -- no hace falta, todavia no hay mapeo.
    if (!mapping) {
      // La hoja se lee una sola vez (antes, dos). Sin mapping aun, cada
      // columna se usa como su propio campo, solo para mostrar la estructura
      // (encabezados + primeras 100 filas).
      const hoja = await leerHoja(buffer, sheetName);
      const mappingIdentidad: Record<string, string> = {};
      hoja.headers.forEach((h) => { if (h) mappingIdentidad[h] = h; });
      const primeras = mapearFilas({ ...hoja, filas: hoja.filas.slice(0, 100) }, mappingIdentidad);
      const rows = primeras.map((f) => hoja.headers.map((h) => f.data[h] ?? ""));

      return NextResponse.json({ headers: hoja.headers, rows, totalRows: hoja.filas.length });
    }

    // --- VALIDACION COMPLETA, SIN ESCRIBIR NADA -----------------------------
    // Aqui es donde antes "Importar" escribia de inmediato en la base. Ahora
    // esta ruta solo corre procesarFila() en modo dryRun -- exactamente las
    // mismas reglas que la confirmacion real (ver procesarFila.ts), pero sin
    // tocar la base. Nada queda guardado hasta que el usuario revise los
    // errores y confirme desde /importar/batch.
    if (!mapping.marca || !mapping.modelo) {
      return NextResponse.json({ error: "Faltan campos requeridos en el mapeo" }, { status: 400 });
    }

    // La categoria y el tipo de mantencion son datos que la confirmacion
    // real necesita para escribir, pero la vista previa no los usa (nunca
    // llega a la parte de procesarFila que escribe) -- no se crean aqui
    // (una vista previa no debe tener efectos secundarios en la base). Si la
    // categoria no existe todavia, se creara recien al confirmar.
    const categoryRecord = await prisma.assetCategory.findFirst({
      where: { nombre: { equals: categoria, mode: "insensitive" } },
      select: { id: true, tipoFicha: true },
    });

    // La columna que identifica al equipo: IMEI en celulares, N° de serie en
    // los demas (SPEC 2.112.7).
    if (categoryRecord?.tipoFicha === "celular" ? !mapping.imei : !mapping.numeroSerie) {
      return NextResponse.json({ error: "Faltan campos requeridos en el mapeo" }, { status: 400 });
    }

    const { headers, filas } = await leerFilasExcel(buffer, sheetName, mapping);

    // Si una fila ya se corrigio a mano (ej. la Marca), esa correccion pisa
    // el dato crudo del Excel antes de revalidar -- ver `corrections` arriba.
    const datosFilas = filas.map((fila, i) => (corrections[i] ? { ...fila.data, ...corrections[i] } : fila.data));

    const ctx = await armarContextoImportacion({
      session,
      sedeIdSolicitada: formData.get("sedeId") as string | null,
      filas: datosFilas,
      categoriaId: categoryRecord?.id ?? "",
      exigeImei: categoryRecord?.tipoFicha === "celular",
      tipoMantencionId: "",
    });

    const rows: ImportRowStatus[] = [];
    for (const fila of filas) {
      const datosFila = datosFilas[rows.length];
      const resultado = await procesarFila(datosFila, ctx, prisma, true);

      if (resultado.status === "error") {
        rows.push({
          rowIndex: rows.length,
          excelRow: fila.rowNum,
          status: "error",
          data: resultado.data,
          errors: [{ type: resultado.tipo, field: resultado.campo, message: resultado.mensaje }],
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
