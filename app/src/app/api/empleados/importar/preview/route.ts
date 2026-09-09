import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { formatearRut, validarDigitoVerificador, limpiarRut } from "@/lib/validations/rut";
import { convertExcelDateValue } from "@/lib/excel-utils";
import {
  COLUMNAS_EMPLEADO,
  validarArchivoExcel,
  valorColumna,
  valorCrudo,
  leerLibro,
  leerFilas,
} from "@/lib/importacion/empleados";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// POST /api/empleados/importar/preview - Preview de importación
export async function POST(request: NextRequest) {
  try {
    await requirePermission('empleados', 'write');

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sheetName = formData.get("sheetName") as string;

    const problema = validarArchivoExcel(file);
    if (problema) {
      return NextResponse.json({ error: problema }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = leerLibro(buffer);
    const rawData = leerFilas(workbook, sheetName);


    // Generar preview (primeras 10 filas)
    const preview = rawData.slice(0, 10).map((row, index) => {
      const r = row as Record<string, unknown>;
      const rutRaw = valorColumna(r, COLUMNAS_EMPLEADO.rut);
      let rutValido = false;
      let rutFormateado = rutRaw;

      if (rutRaw) {
        const rutLimpio = limpiarRut(rutRaw);
        rutValido = validarDigitoVerificador(rutLimpio);
        if (rutValido) {
          rutFormateado = formatearRut(rutRaw);
        }
      }

      return {
        fila: index + 2,
        rut: rutFormateado,
        rutValido,
        nombres: valorColumna(r, COLUMNAS_EMPLEADO.nombres) ?? "",
        apellidoPaterno: valorColumna(r, COLUMNAS_EMPLEADO.apellidoPaterno) ?? "",
        apellidoMaterno: valorColumna(r, COLUMNAS_EMPLEADO.apellidoMaterno) ?? "",
        correoPersonal: valorColumna(r, COLUMNAS_EMPLEADO.correoPersonal) ?? "",
        cargo: valorColumna(r, COLUMNAS_EMPLEADO.cargo) ?? "",
        jefatura: valorColumna(r, COLUMNAS_EMPLEADO.jefatura) ?? "",
        // Los tres que la previa omitia aunque la importacion si los guarda.
        supervisor: valorColumna(r, COLUMNAS_EMPLEADO.supervisor) ?? "",
        telefonoContacto: valorColumna(r, COLUMNAS_EMPLEADO.telefonoContacto) ?? "",
        // Se muestra la fecha ya interpretada, para que el usuario vea como va
        // a quedar guardada antes de importar y no despues.
        fechaIngreso: (() => {
          const bruto = valorCrudo(r, COLUMNAS_EMPLEADO.fechaIngreso);
          return bruto === undefined || bruto === "" ? "" : convertExcelDateValue(bruto);
        })(),
        ubicacion: valorColumna(r, COLUMNAS_EMPLEADO.ubicacion) ?? "",
        tipoContrato: valorColumna(r, COLUMNAS_EMPLEADO.tipoContrato) ?? "",
      };
    });

    // Detectar columnas encontradas
    const firstRow = rawData[0] as Record<string, unknown> | undefined;
    const detectedColumns: Record<string, string | null> = {};

    if (firstRow) {
      for (const [field, mappings] of Object.entries(COLUMNAS_EMPLEADO)) {
        const found = mappings.find((m) => firstRow[m] !== undefined);
        detectedColumns[field] = found || null;
      }
    }

    return NextResponse.json({
      totalRows: rawData.length,
      preview,
      detectedColumns,
      sheetName: sheetName || workbook.SheetNames[0],
    });
  } catch (error) {
    return handleApiError(error, 'Error al procesar el archivo');
  }
}
