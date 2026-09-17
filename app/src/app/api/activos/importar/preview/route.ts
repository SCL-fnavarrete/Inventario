import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { convertExcelDateValue } from "@/lib/excel-utils";
import type { ImportRowStatus, ValidationError, ImportPreviewResult } from "@/types/import";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { mensajeSerieDuplicada } from "@/lib/importacion/activos";

// Filas de inicio conocidas por categoría
const HEADER_ROWS: Record<string, number> = {
  notebook: 0,
  celular: 0,
  monitor: 0,
  epp: 0,
  otro: 0,
  desvinculaciones: 0,
  default: 0,
};

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('activos', 'write');

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sheetName = formData.get("sheetName") as string;
    const categoria = formData.get("categoria") as string;
    const mappingStr = formData.get("mapping") as string;

    if (!file || !sheetName) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos" },
        { status: 400 }
      );
    }

    // Parsear mapping si existe
    const mapping = mappingStr ? JSON.parse(mappingStr) as Record<string, string> : null;

    const buffer = await file.arrayBuffer();
    // raw: true para que la vista previa lea las celdas igual que la
    // importacion real; si no, lo que se ve aqui y lo que se guarda pueden
    // diferir en las fechas.
    const workbook = XLSX.read(buffer, { type: "array", raw: true });
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return NextResponse.json(
        { error: "Hoja no encontrada" },
        { status: 400 }
      );
    }

    const headerRow = HEADER_ROWS[categoria?.toLowerCase()] ?? HEADER_ROWS.default;

    const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    if (jsonData.length <= headerRow) {
      return NextResponse.json(
        { error: "El archivo no contiene datos suficientes" },
        { status: 400 }
      );
    }

    const headers = (jsonData[headerRow] as string[])
      .map((h) => (h ? String(h).trim() : ""))
      .filter((h) => h.length > 0);

    const dataRows = jsonData.slice(headerRow + 1).filter((row) => {
      return row.some((cell) => cell !== "" && cell !== null && cell !== undefined);
    });

    // Identificar columnas de fecha
    const dateColumns = new Set<number>();
    headers.forEach((header, index) => {
      const headerLower = header.toLowerCase().trim();
      const dateKeywords = ["fecha", "date", "asignacion", "compra", "garantia", "baja", "ingreso", "termino", "mantencion", "proxima"];
      if (dateKeywords.some((keyword) => headerLower.includes(keyword))) {
        dateColumns.add(index);
      }
    });

    // Si no hay mapping, retornar preview simple (comportamiento anterior)
    if (!mapping) {
      const rows = dataRows.map((row) => {
        const rowArray = row as string[];
        return headers.map((_, i) => {
          const value = rowArray[i];
          if (value === null || value === undefined) return "";
          if (dateColumns.has(i)) {
            return convertExcelDateValue(value);
          }
          if (typeof value === "number") return String(value);
          return String(value).trim();
        });
      });

      return NextResponse.json({
        headers,
        rows: rows.slice(0, 100),
        totalRows: rows.length,
      });
    }

    // --- VALIDACION COMPLETA CON MAPPING ---

    // Crear índice de columnas basado en mapeo
    const columnIndex: Record<string, number> = {};
    Object.entries(mapping).forEach(([field, header]) => {
      if (header) {
        const idx = headers.findIndex((h) => h && String(h).trim() === header);
        if (idx !== -1) {
          columnIndex[field] = idx;
        }
      }
    });

    // Consultar series existentes en BD
    const existingSeries = await prisma.asset.findMany({
      where: { numeroSerie: { not: null } },
      select: {
        numeroSerie: true,
        marca: true,
        modelo: true,
        sedeId: true,
        empleadoActual: {
          select: { nombres: true, apellidoPaterno: true, rut: true }
        }
      },
    });

    const existingSeriesMap = new Map(
      existingSeries
        .filter((a) => a.numeroSerie)
        .map((a) => [a.numeroSerie!.toUpperCase(), a])
    );

    // Detectar duplicados en el archivo
    const seriesInFile = new Map<string, number[]>();

    // Función para obtener valor de una fila
    const getValue = (row: string[], field: string): string => {
      const idx = columnIndex[field];
      if (idx === undefined) return "";
      const value = row[idx];
      if (value === null || value === undefined) return "";
      if (dateColumns.has(idx)) {
        return convertExcelDateValue(value);
      }
      if (typeof value === "number") return String(value);
      return String(value).trim();
    };

    // Procesar filas con validación
    const validatedRows: ImportRowStatus[] = dataRows.slice(0, 100).map((row, index) => {
      const rowArray = row as string[];
      const excelRow = headerRow + index + 2;

      // Extraer datos según mapping
      const data: Record<string, string> = {};
      headers.forEach((header, i) => {
        const value = rowArray[i];
        if (value === null || value === undefined) {
          data[header] = "";
        } else if (dateColumns.has(i)) {
          data[header] = convertExcelDateValue(value);
        } else if (typeof value === "number") {
          data[header] = String(value);
        } else {
          data[header] = String(value).trim();
        }
      });

      // También guardar con las keys del mapping
      Object.entries(mapping).forEach(([field, header]) => {
        if (header && data[header] !== undefined) {
          data[field] = data[header];
        }
      });

      const errors: ValidationError[] = [];
      const warnings: ValidationError[] = [];

      const marca = getValue(rowArray, "marca");
      const modelo = getValue(rowArray, "modelo");
      const numeroSerie = getValue(rowArray, "numeroSerie");

      // Validar campos requeridos
      if (!marca) {
        errors.push({
          type: "missing_required_field",
          field: "marca",
          message: "Marca es requerida",
        });
      }
      if (!modelo) {
        errors.push({
          type: "missing_required_field",
          field: "modelo",
          message: "Modelo es requerido",
        });
      }
      if (!numeroSerie) {
        errors.push({
          type: "missing_required_field",
          field: "numeroSerie",
          message: "N° de Serie es requerido",
        });
      }

      // Verificar duplicado en BD
      if (numeroSerie) {
        const upperSerie = numeroSerie.toUpperCase();
        const existingAsset = existingSeriesMap.get(upperSerie);

        if (existingAsset) {
          errors.push({
            type: "duplicate_in_database",
            field: "numeroSerie",
            message: mensajeSerieDuplicada(session, numeroSerie, existingAsset),
            value: numeroSerie,
          });
        }

        // Registrar para detectar duplicados en archivo
        if (!seriesInFile.has(upperSerie)) {
          seriesInFile.set(upperSerie, []);
        }
        seriesInFile.get(upperSerie)!.push(index);
      }

      return {
        rowIndex: index,
        excelRow,
        status: errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "valid",
        data,
        errors,
        warnings,
      };
    });

    // Marcar duplicados dentro del archivo
    const duplicatesInFile: string[] = [];
    seriesInFile.forEach((indices, serie) => {
      if (indices.length > 1) {
        duplicatesInFile.push(serie);
        indices.forEach((idx) => {
          const row = validatedRows[idx];
          if (row && !row.errors.some((e) => e.type === "duplicate_in_file")) {
            row.errors.push({
              type: "duplicate_in_file",
              field: "numeroSerie",
              message: `N° de serie "${serie}" aparece ${indices.length} veces en el archivo (filas: ${indices.map((i) => validatedRows[i]?.excelRow).join(", ")})`,
              value: serie,
            });
            if (row.status !== "error") {
              row.status = "error";
            }
          }
        });
      }
    });

    const result: ImportPreviewResult = {
      headers,
      rows: validatedRows,
      totalRows: dataRows.length,
      validCount: validatedRows.filter((r) => r.status === "valid").length,
      errorCount: validatedRows.filter((r) => r.status === "error").length,
      warningCount: validatedRows.filter((r) => r.status === "warning").length,
      duplicatesInFile,
      duplicatesInDb: validatedRows
        .filter((r) => r.errors.some((e) => e.type === "duplicate_in_database"))
        .map((r) => r.data.numeroSerie || r.data["N° Serie"] || ""),
    };

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al procesar el archivo Excel');
  }
}
