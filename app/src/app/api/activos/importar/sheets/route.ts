import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { validarArchivoExcel } from "@/lib/importacion/validarArchivo";

export async function POST(request: NextRequest) {
  try {
    await requirePermission('activos', 'write');

    const formData = await request.formData();
    const buffer = await validarArchivoExcel(formData.get("file"));
    // bookSheets: solo los nombres de las hojas, sin leer sus celdas.
    const workbook = XLSX.read(buffer, { type: "array", bookSheets: true });

    return NextResponse.json({
      sheets: workbook.SheetNames,
    });
  } catch (error) {
    return handleApiError(error, 'Error al leer el archivo Excel');
  }
}
