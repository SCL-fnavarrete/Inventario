import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as XLSX from "xlsx";
import { formatearRut, validarDigitoVerificador, limpiarRut } from "@/lib/validations/rut";

// POST /api/empleados/importar/preview - Preview de importación
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sheetName = formData.get("sheetName") as string;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó archivo" },
        { status: 400 }
      );
    }

    // Leer archivo Excel
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // Mapeo de columnas
    const columnMappings: Record<string, string[]> = {
      rut: ["RUT", "Rut", "rut", "R.U.T.", "R.U.T"],
      nombres: ["Nombre", "Nombres", "nombre", "nombres", "NOMBRE", "NOMBRES"],
      apellidoPaterno: ["Apellido P", "Apellido Paterno", "apellido_paterno", "APELLIDO P", "ApellidoP"],
      apellidoMaterno: ["Apellido M", "Apellido Materno", "apellido_materno", "APELLIDO M", "ApellidoM"],
      correo: ["Correo", "Email", "correo", "email", "CORREO", "E-mail", "E-Mail"],
      cargo: ["Cargo", "cargo", "CARGO", "Puesto"],
      jefatura: ["Jefatura", "jefatura", "JEFATURA", "Jefe"],
      ubicacion: ["Ubicación", "Ubicacion", "ubicacion", "UBICACION", "Lugar", "Ciudad"],
      tipoContrato: ["Tipo Contrato", "TipoContrato", "tipo_contrato", "TIPO CONTRATO", "Contrato"],
    };

    function findColumnValue(row: Record<string, unknown>, mappings: string[]): string {
      for (const mapping of mappings) {
        if (row[mapping] !== undefined && row[mapping] !== "") {
          return String(row[mapping]);
        }
      }
      return "";
    }

    // Generar preview (primeras 10 filas)
    const preview = rawData.slice(0, 10).map((row, index) => {
      const r = row as Record<string, unknown>;
      const rutRaw = findColumnValue(r, columnMappings.rut);
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
        nombres: findColumnValue(r, columnMappings.nombres),
        apellidoPaterno: findColumnValue(r, columnMappings.apellidoPaterno),
        apellidoMaterno: findColumnValue(r, columnMappings.apellidoMaterno),
        correo: findColumnValue(r, columnMappings.correo),
        cargo: findColumnValue(r, columnMappings.cargo),
        jefatura: findColumnValue(r, columnMappings.jefatura),
        ubicacion: findColumnValue(r, columnMappings.ubicacion),
        tipoContrato: findColumnValue(r, columnMappings.tipoContrato),
      };
    });

    // Detectar columnas encontradas
    const firstRow = rawData[0] as Record<string, unknown> | undefined;
    const detectedColumns: Record<string, string | null> = {};

    if (firstRow) {
      for (const [field, mappings] of Object.entries(columnMappings)) {
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
    console.error("Error previewing import:", error);
    return NextResponse.json(
      { error: "Error al procesar el archivo" },
      { status: 500 }
    );
  }
}
