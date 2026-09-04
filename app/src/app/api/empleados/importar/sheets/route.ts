import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { validarArchivoExcel, leerLibro } from "@/lib/importacion/empleados";

// POST /api/empleados/importar/sheets - Obtener hojas del Excel
export async function POST(request: NextRequest) {
  try {
    await requirePermission('empleados', 'write');
    const formData = await request.formData();
    const file = formData.get("file") as File;

    const problema = validarArchivoExcel(file);
    if (problema) {
      return NextResponse.json({ error: problema }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = leerLibro(buffer);

    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      const rowCount = range.e.r - range.s.r;
      return {
        name,
        rowCount,
      };
    });

    return NextResponse.json({ sheets });
  } catch (error) {
    return handleApiError(error, 'Error al leer el archivo');
  }
}
