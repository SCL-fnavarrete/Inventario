import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import * as XLSX from "xlsx";
import { formatearRut, validarDigitoVerificador, limpiarRut } from "@/lib/validations/rut";
import { convertExcelDateValue, parseDDMMYYYYToDate } from "@/lib/excel-utils";
import {
  COLUMNAS_EMPLEADO,
  validarArchivoExcel,
  valorColumna,
  valorCrudo,
  leerLibro,
  leerFilas,
} from "@/lib/importacion/empleados";
import { requirePermission, handleApiError } from '@/lib/auth/guard';


// POST /api/empleados/importar - Importar empleados desde Excel
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


    function parseTipoContrato(
      value: string | undefined
    ): "contrato" | "boleta" | null | undefined {
      if (value === undefined) return undefined;
      const lower = value.toLowerCase().trim();
      if (lower === "contrato" || lower === "boleta") return lower;
      if (lower.includes("externo") || lower.includes("honorario") || lower.includes("boleta")) return "boleta";
      if (
        lower.includes("planta") ||
        lower.includes("proyecto") ||
        lower === "indefinido" ||
        lower.includes("plazo")
      ) {
        return "contrato";
      }
      return null;
    }

    /**
     * Interpreta la fecha del Excel en formato chileno (dd-mm-aaaa o
     * dd/mm/aaaa) reutilizando el utilitario compartido con la importacion
     * de activos.
     */
    function parseDate(value: unknown): Date | null {
      if (value === undefined || value === null || value === "") return null;
      return parseDDMMYYYYToDate(convertExcelDateValue(value));
    }

    /**
     * Cada fila se procesa y se guarda por separado, sin transaccion global,
     * para que una fila invalida no aborte las demas. La importacion es
     * idempotente (empareja por RUT, crea o actualiza) por lo que reimportar
     * el mismo archivo, incluso tras un corte a medio camino, es seguro.
     */
    const results = {
      created: 0,
      updated: 0,
      errors: [] as Array<{ row: number; rut: string; error: string }>,
    };

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i] as Record<string, unknown>;
      const rowNum = i + 2; // +2 porque la fila 1 es header

      try {
        const rutRaw = valorColumna(row, COLUMNAS_EMPLEADO.rut);

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
        const nombres = valorColumna(row, COLUMNAS_EMPLEADO.nombres);
        const apellidoPaterno = valorColumna(row, COLUMNAS_EMPLEADO.apellidoPaterno);
        // La columna de correo de la planilla trae la cuenta corporativa,
        // que es la obligatoria en el modelo.
        const correoEmpresa = valorColumna(row, COLUMNAS_EMPLEADO.correoPersonal);

        // Validar campos requeridos
        if (!nombres) {
          results.errors.push({ row: rowNum, rut, error: "Nombre requerido" });
          continue;
        }
        if (!apellidoPaterno) {
          results.errors.push({ row: rowNum, rut, error: "Apellido paterno requerido" });
          continue;
        }
        if (!correoEmpresa) {
          results.errors.push({ row: rowNum, rut, error: "Correo de empresa requerido" });
          continue;
        }


        // Preparar datos
        const tipoContrato = parseTipoContrato(valorColumna(row, COLUMNAS_EMPLEADO.tipoContrato));

        if (tipoContrato === null) {
          results.errors.push({
            row: rowNum,
            rut,
            error: `Tipo de contrato no reconocido: "${valorColumna(row, COLUMNAS_EMPLEADO.tipoContrato)}"`,
          });
          continue;
        }

        // Solo se escriben los campos que el archivo trae. Un campo ausente se
        // omite del objeto, y Prisma no lo toca.
        const apellidoMaterno = valorColumna(row, COLUMNAS_EMPLEADO.apellidoMaterno);
        const cargo = valorColumna(row, COLUMNAS_EMPLEADO.cargo);
        const jefatura = valorColumna(row, COLUMNAS_EMPLEADO.jefatura);
        const supervisor = valorColumna(row, COLUMNAS_EMPLEADO.supervisor);
        const ubicacion = valorColumna(row, COLUMNAS_EMPLEADO.ubicacion);
        const telefonoContacto = valorColumna(row, COLUMNAS_EMPLEADO.telefonoContacto);

        // El valor crudo, sin pasar por texto: si el Excel guarda la fecha como
        // numero de serie, parseDate necesita ese numero.
        const fechaIngresoBruta = valorCrudo(row, COLUMNAS_EMPLEADO.fechaIngreso);

        // Una fecha que no se puede interpretar detiene la fila con un error,
        // en vez de guardarse como null silenciosamente.
        let fechaIngreso: Date | undefined;
        if (fechaIngresoBruta !== undefined && fechaIngresoBruta !== "") {
          const parseada = parseDate(fechaIngresoBruta);
          if (parseada === null) {
            results.errors.push({
              row: rowNum,
              rut,
              error: `Fecha de ingreso no reconocida: "${String(fechaIngresoBruta)}" (se espera dd-mm-aaaa)`,
            });
            continue;
          }
          fechaIngreso = parseada;
        }

        const employeeData = {
          rut,
          nombres,
          apellidoPaterno,
          correoEmpresa: correoEmpresa.toLowerCase(),
          ...(apellidoMaterno !== undefined && { apellidoMaterno }),
          ...(cargo !== undefined && { cargo }),
          ...(jefatura !== undefined && { jefatura }),
          ...(supervisor !== undefined && { supervisor }),
          ...(ubicacion !== undefined && { ubicacion }),
          ...(telefonoContacto !== undefined && { telefonoContacto }),
          ...(tipoContrato !== undefined && { tipoContrato }),
          ...(fechaIngreso !== undefined && { fechaIngreso }),
        };

        // Verificar si ya existe
        const existing = await prisma.employee.findUnique({
          where: { rut },
        });

        if (existing) {
          // Actualizar
          await prisma.employee.update({
            where: { rut },
            data: employeeData,
          });
          results.updated++;
        } else {
          // Verificar correo de empresa único
          const existingByEmail = await prisma.employee.findUnique({
            where: { correoEmpresa: employeeData.correoEmpresa },
          });

          if (existingByEmail) {
            results.errors.push({
              row: rowNum,
              rut,
              error: `Correo ${employeeData.correoEmpresa} ya existe para otro empleado`,
            });
            continue;
          }

          // El tipo de contrato no es obligatorio: si la planilla no lo trae,
          // el empleado se crea sin el y se completa despues.
          await prisma.employee.create({
            data: employeeData,
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push({
          row: rowNum,
          rut: valorColumna(row as Record<string, unknown>, COLUMNAS_EMPLEADO.rut) ?? "",
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
