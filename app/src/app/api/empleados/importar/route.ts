import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import * as XLSX from "xlsx";
import { formatearRut, validarDigitoVerificador, limpiarRut } from "@/lib/validations/rut";
import { convertExcelDateValue, parseDDMMYYYYToDate } from "@/lib/excel-utils";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

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
    await requirePermission('empleados', 'write');

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
    // raw: true evita que SheetJS interprete las fechas por su cuenta. Sin esta
    // opcion lee 01/12/2024 como 12 de enero (convencion estadounidense) y el
    // valor llega ya corrompido a nuestro parseador, que si sabe leer el
    // formato chileno. La libreria no sabe de donde vienen los datos; nosotros si.
    const workbook = XLSX.read(buffer, { type: "array", raw: true });

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

    /**
     * Valor de la primera columna que exista y tenga contenido.
     *
     * `undefined` significa "esta columna no viene en el archivo, o su celda
     * esta vacia". La importacion nunca borra un dato que el archivo no trae:
     * antes devolvia "" y el llamador lo convertia en null, de modo que
     * reimportar un archivo con menos columnas vaciaba lo ya cargado.
     */
    function valorColumna(row: Record<string, unknown>, mappings: string[]): string | undefined {
      for (const mapping of mappings) {
        const bruto = row[mapping];
        if (bruto === undefined || bruto === null) continue;
        const valor = String(bruto).trim();
        if (valor !== "") return valor;
      }
      return undefined;
    }

        /**
     * Traduce el texto del Excel a un tipo de contrato del sistema.
     *   undefined -> la columna no viene en el archivo
     *   null      -> viene, pero con un valor que no reconocemos
     *
     * Antes devolvia "proyecto" para todo lo desconocido, asi que un Excel con
     * "Contrata" o "Plazo Fijo" clasificaba mal a todo el mundo en silencio.
     */
    function parseTipoContrato(
      value: string | undefined
    ): "planta" | "proyecto" | "externo" | null | undefined {
      if (value === undefined) return undefined;
      const lower = value.toLowerCase().trim();
      if (lower.includes("planta") || lower === "indefinido") return "planta";
      if (lower.includes("proyecto") || lower.includes("plazo")) return "proyecto";
      if (lower.includes("externo") || lower.includes("honorario")) return "externo";
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
        const rutRaw = valorColumna(row, columnMappings.rut);

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
        const nombres = valorColumna(row, columnMappings.nombres);
        const apellidoPaterno = valorColumna(row, columnMappings.apellidoPaterno);
        const correo = valorColumna(row, columnMappings.correo);

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
        const tipoContrato = parseTipoContrato(valorColumna(row, columnMappings.tipoContrato));

        if (tipoContrato === null) {
          results.errors.push({
            row: rowNum,
            rut,
            error: `Tipo de contrato no reconocido: "${valorColumna(row, columnMappings.tipoContrato)}"`,
          });
          continue;
        }

        // Solo se escriben los campos que el archivo trae. Un campo ausente se
        // omite del objeto, y Prisma no lo toca.
        const apellidoMaterno = valorColumna(row, columnMappings.apellidoMaterno);
        const cargo = valorColumna(row, columnMappings.cargo);
        const jefatura = valorColumna(row, columnMappings.jefatura);
        const supervisor = valorColumna(row, columnMappings.supervisor);
        const ubicacion = valorColumna(row, columnMappings.ubicacion);
        const telefonoContacto = valorColumna(row, columnMappings.telefonoContacto);

        // El valor crudo, sin pasar por texto: si el Excel guarda la fecha como
        // numero de serie, parseDate necesita ese numero.
        const claveFecha = Object.keys(row).find((k) =>
          columnMappings.fechaIngreso.includes(k)
        );
        const fechaIngresoBruta = claveFecha === undefined ? undefined : row[claveFecha];

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
          correo: correo.toLowerCase(),
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
          rut: valorColumna(row as Record<string, unknown>, columnMappings.rut) ?? "",
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
