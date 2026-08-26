import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

export async function POST(request: NextRequest) {
  try {
    await requirePermission('activos', 'write');

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó archivo" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    return NextResponse.json({
      sheets: workbook.SheetNames,
    });
  } catch (error) {
    return handleApiError(error, 'Error al leer el archivo Excel');
  }
}
