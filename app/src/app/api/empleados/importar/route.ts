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
     * dd/mm/aaaa) reutilizando el utilitario compartido, el mismo que usa la
     * importacion de activos.
     *
     * Antes esta ruta tenia su propio parseador con new Date(), que lee al
     * estilo estadounidense: 01/12/2024 se guardaba como 12 de enero y
     * 31/12/2024 se perdia entero. Y estaba probado en ningun sitio, mientras
     * el compartido si tiene tests.
     */
    function parseDate(value: unknown): Date | null {
      if (value === undefined || value === null || value === "") return null;
      return parseDDMMYYYYToDate(convertExcelDateValue(value));
    }

    /**
     * Cada fila se procesa y se guarda por separado, SIN envolver la importacion
     * en una transaccion. Es una decision deliberada, no un olvido.
     *
     * Con transaccion, un solo RUT malo en la fila 340 abortaria las 339 filas
     * correctas anteriores y habria que corregir el Excel y empezar de cero.
     * Sin ella, esas 339 quedan cargadas y el reporte dice exactamente que fila
     * fallo y por que, de modo que se corrige solo lo que fallo y se reimporta.
     *
     * Lo que hace viable ese enfoque es que la importacion es idempotente:
     * empareja por RUT, actualiza si ya existe y crea si no, y desde el arreglo
     * de las columnas ausentes nunca borra un dato que el archivo no trae. Por
     * eso reimportar el mismo archivo dos veces no duplica ni destruye nada.
     *
     * La contrapartida asumida: si el proceso se corta a la mitad -por un
     * reinicio o un fallo de red-, queda cargado lo procesado hasta ahi. La
     * forma de recuperarse es volver a importar el mismo archivo.
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
        const correoPersonal = valorColumna(row, COLUMNAS_EMPLEADO.correoPersonal);

        // Validar campos requeridos
        if (!nombres) {
          results.errors.push({ row: rowNum, rut, error: "Nombre requerido" });
          continue;
        }
        if (!apellidoPaterno) {
          results.errors.push({ row: rowNum, rut, error: "Apellido paterno requerido" });
          continue;
        }
        if (!correoPersonal) {
          results.errors.push({ row: rowNum, rut, error: "Correo requerido" });
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

        // Una fecha que no se puede interpretar detiene la fila y lo dice: antes
        // se guardaba como null y nadie se enteraba de que se habia perdido.
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
          correoPersonal: correoPersonal.toLowerCase(),
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
          // Verificar correo personal único
          const existingByEmail = await prisma.employee.findUnique({
            where: { correoPersonal: employeeData.correoPersonal },
          });

          if (existingByEmail) {
            results.errors.push({
              row: rowNum,
              rut,
              error: `Correo ${employeeData.correoPersonal} ya existe para otro empleado`,
            });
            continue;
          }

          // El tipo de contrato es obligatorio en la base y no tiene valor por
          // defecto: al crear tiene que venir. Al actualizar, en cambio, su
          // ausencia significa "no lo toques", y por eso solo se exige aqui.
          if (tipoContrato === undefined) {
            results.errors.push({
              row: rowNum,
              rut,
              error: "Falta el tipo de contrato (columna ausente o celda vacia)",
            });
            continue;
          }

          // Crear
          await prisma.employee.create({
            data: { ...employeeData, tipoContrato },
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
