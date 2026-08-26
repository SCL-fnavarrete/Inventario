import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// POST /api/empleados/importar/sheets - Obtener hojas del Excel
export async function POST(request: NextRequest) {
  try {
    await requirePermission('empleados', 'write');
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó archivo" },
        { status: 400 }
      );
    }

    // Leer archivo Excel
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

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
