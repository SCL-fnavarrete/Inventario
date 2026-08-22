import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import * as XLSX from "xlsx";
import { formatearRut, validarDigitoVerificador, limpiarRut } from "@/lib/validations/rut";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { employeeHistoryService } from '@/lib/services/employeeHistoryService';

// Constantes de seguridad para archivos
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
];

// POST /api/empleados/importar - Importar empleados desde Excel
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('empleados', 'write');

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sheetName = formData.get("sheetName") as string;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó archivo" },
        { status: 400 }
      );
    }

    // Validar tamaño del archivo
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "El archivo excede el tamaño máximo de 5MB" },
        { status: 413 }
      );
    }

    // Validar tipo MIME
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
      return NextResponse.json(
        { error: "Solo se permiten archivos Excel (.xlsx, .xls)" },
        { status: 400 }
      );
    }

    // Leer archivo Excel
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // Mapeo de columnas (flexible para diferentes formatos)
    const columnMappings: Record<string, string[]> = {
      rut: ["RUT", "Rut", "rut", "R.U.T.", "R.U.T"],
      nombres: ["Nombre", "Nombres", "nombre", "nombres", "NOMBRE", "NOMBRES"],
      apellidoPaterno: ["Apellido P", "Apellido Paterno", "apellido_paterno", "APELLIDO P", "ApellidoP"],
      apellidoMaterno: ["Apellido M", "Apellido Materno", "apellido_materno", "APELLIDO M", "ApellidoM"],
      correo: ["Correo", "Email", "correo", "email", "CORREO", "E-mail", "E-Mail"],
      cargo: ["Cargo", "cargo", "CARGO", "Puesto"],
      jefatura: ["Jefatura", "jefatura", "JEFATURA", "Jefe"],
      supervisor: ["Supervisor", "supervisor", "SUPERVISOR"],
      ubicacion: ["Ubicación", "Ubicacion", "ubicacion", "UBICACION", "Lugar", "Ciudad"],
      tipoContrato: ["Tipo Contrato", "TipoContrato", "tipo_contrato", "TIPO CONTRATO", "Contrato"],
      fechaIngreso: ["Fecha Ingreso", "FechaIngreso", "fecha_ingreso", "FECHA INGRESO", "Ingreso"],
      telefonoContacto: ["Teléfono", "Telefono", "telefono", "TELEFONO", "Celular", "Fono"],
    };

    function findColumnValue(row: Record<string, unknown>, mappings: string[]): string {
      for (const mapping of mappings) {
        if (row[mapping] !== undefined && row[mapping] !== "") {
          return String(row[mapping]);
        }
      }
      return "";
    }

    function parseTipoContrato(value: string): "planta" | "proyecto" | "externo" {
      const lower = value.toLowerCase().trim();
      if (lower.includes("planta") || lower === "indefinido") return "planta";
      if (lower.includes("externo") || lower.includes("honorario")) return "externo";
      return "proyecto";
    }

    function parseDate(value: unknown): Date | null {
      if (!value) return null;

      // Si es un número (fecha serial de Excel)
      if (typeof value === "number") {
        const date = XLSX.SSF.parse_date_code(value);
        return new Date(date.y, date.m - 1, date.d);
      }

      // Si es string, intentar parsear
      const strValue = String(value);
      const date = new Date(strValue);
      return isNaN(date.getTime()) ? null : date;
    }

    // Procesar filas
    const results = {
      created: 0,
      updated: 0,
      errors: [] as Array<{ row: number; rut: string; error: string }>,
    };

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i] as Record<string, unknown>;
      const rowNum = i + 2; // +2 porque la fila 1 es header

      try {
        const rutRaw = findColumnValue(row, columnMappings.rut);

        if (!rutRaw) {
          results.errors.push({
            row: rowNum,
            rut: "",
            error: "RUT vacío o no encontrado",
          });
          continue;
        }

        // Validar RUT
        const rutLimpio = limpiarRut(rutRaw);
        if (!validarDigitoVerificador(rutLimpio)) {
          results.errors.push({
            row: rowNum,
            rut: rutRaw,
            error: "RUT inválido (dígito verificador incorrecto)",
          });
          continue;
        }

        const rut = formatearRut(rutRaw);
        const nombres = findColumnValue(row, columnMappings.nombres);
        const apellidoPaterno = findColumnValue(row, columnMappings.apellidoPaterno);
        const correo = findColumnValue(row, columnMappings.correo);

        // Validar campos requeridos
        if (!nombres) {
          results.errors.push({ row: rowNum, rut, error: "Nombre requerido" });
          continue;
        }
        if (!apellidoPaterno) {
          results.errors.push({ row: rowNum, rut, error: "Apellido paterno requerido" });
          continue;
        }
        if (!correo) {
          results.errors.push({ row: rowNum, rut, error: "Correo requerido" });
          continue;
        }

        // Preparar datos
        const employeeData = {
          rut,
          nombres,
          apellidoPaterno,
          apellidoMaterno: findColumnValue(row, columnMappings.apellidoMaterno) || null,
          correo: correo.toLowerCase(),
          cargo: findColumnValue(row, columnMappings.cargo) || null,
          jefatura: findColumnValue(row, columnMappings.jefatura) || null,
          supervisor: findColumnValue(row, columnMappings.supervisor) || null,
          ubicacion: findColumnValue(row, columnMappings.ubicacion) || null,
          tipoContrato: parseTipoContrato(findColumnValue(row, columnMappings.tipoContrato)),
          fechaIngreso: parseDate(row[Object.keys(row).find(k =>
            columnMappings.fechaIngreso.includes(k)
          ) || ""]),
          telefonoContacto: findColumnValue(row, columnMappings.telefonoContacto) || null,
        };

        // Verificar si ya existe
        const existing = await prisma.employee.findUnique({
          where: { rut },
        });

        if (existing) {
          await prisma.$transaction(async (tx) => {
            const updated = await tx.employee.update({
              where: { rut },
              data: employeeData,
            });
            await employeeHistoryService.registrarCambio(
              existing,
              updated,
              session.user.email || 'Sistema',
              tx
            );
          });
          results.updated++;
        } else {
          // Verificar correo único
          const existingByEmail = await prisma.employee.findUnique({
            where: { correo: employeeData.correo },
          });

          if (existingByEmail) {
            results.errors.push({
              row: rowNum,
              rut,
              error: `Correo ${employeeData.correo} ya existe para otro empleado`,
            });
            continue;
          }

          await prisma.$transaction(async (tx) => {
            const created = await tx.employee.create({
              data: employeeData,
            });
            await employeeHistoryService.registrarCreacion(
              created,
              session.user.email || 'Sistema',
              tx
            );
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push({
          row: rowNum,
          rut: findColumnValue(row as Record<string, unknown>, columnMappings.rut),
          error: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Importación completada: ${results.created} creados, ${results.updated} actualizados, ${results.errors.length} errores`,
      results,
    });
  } catch (error) {
    return handleApiError(error, 'Error al procesar el archivo');
  }
}
