import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import * as XLSX from "xlsx";
import { convertExcelDateValue, parseDDMMYYYYToDate } from "@/lib/excel-utils";

// Filas de inicio conocidas por categoría
// Todas las categorías usan fila 0 (primera fila) como encabezado por defecto
const HEADER_ROWS: Record<string, number> = {
  notebook: 0,
  celular: 0,
  monitor: 0,
  epp: 0,
  otro: 0,
  desvinculaciones: 0,
  default: 0,
};

// Mapeo de estados del Excel a estados del sistema
const ESTADO_MAP: Record<string, string> = {
  disponible: "disponible",
  asignado: "asignado",
  "en mantención": "en_mantencion",
  "en mantencion": "en_mantencion",
  reutilizable: "reutilizable",
  baja: "baja",
  vendido: "vendido",
  activo: "asignado",
  inactivo: "disponible",
};

function normalizeRut(rut: string): string {
  if (!rut) return "";
  // Remover puntos y guiones, convertir a mayúsculas
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase().trim();
}

function parseEstado(value: string): string {
  if (!value) return "disponible";
  const normalized = value.toLowerCase().trim();
  return ESTADO_MAP[normalized] || "disponible";
}

// Constantes de seguridad para archivos
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream", // Algunos navegadores envían este tipo
];

// Roles que pueden importar activos
const IMPORT_ALLOWED_ROLES = ["admin", "supervisor"];

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verificar que el usuario tenga rol permitido para importar
    const userRole = session.user.role;
    if (!IMPORT_ALLOWED_ROLES.includes(userRole)) {
      return NextResponse.json(
        { error: "No tiene permisos para importar activos" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sheetName = formData.get("sheetName") as string;
    const categoria = formData.get("categoria") as string;
    const mappingStr = formData.get("mapping") as string;

    if (!file || !sheetName || !categoria || !mappingStr) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos" },
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

    // Parsear mapping con try-catch
    let mapping: Record<string, string>;
    try {
      mapping = JSON.parse(mappingStr) as Record<string, string>;
    } catch {
      return NextResponse.json(
        { error: "Formato de mapeo inválido" },
        { status: 400 }
      );
    }

    // Verificar campos requeridos
    if (!mapping.marca || !mapping.modelo || !mapping.numeroSerie) {
      return NextResponse.json(
        { error: "Faltan campos requeridos en el mapeo" },
        { status: 400 }
      );
    }

    // Obtener o crear categoría
    let categoryRecord = await prisma.assetCategory.findFirst({
      where: {
        nombre: {
          equals: categoria,
          mode: "insensitive",
        },
      },
    });

    if (!categoryRecord) {
      categoryRecord = await prisma.assetCategory.create({
        data: {
          nombre: categoria.charAt(0).toUpperCase() + categoria.slice(1),
          descripcion: `Categoría ${categoria}`,
        },
      });
    }

    // Leer archivo Excel
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const worksheet = workbook.Sheets[sheetName];

    const headerRow = HEADER_ROWS[categoria.toLowerCase()] ?? HEADER_ROWS.default;

    const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    const headers = jsonData[headerRow] as string[];
    const dataRows = jsonData.slice(headerRow + 1).filter((row) => {
      return row.some((cell) => cell !== "" && cell !== null && cell !== undefined);
    });

    // Crear índice de columnas basado en mapeo
    const columnIndex: Record<string, number> = {};
    Object.entries(mapping).forEach(([field, header]) => {
      if (header) {
        const idx = headers.findIndex(
          (h) => h && String(h).trim() === header
        );
        if (idx !== -1) {
          columnIndex[field] = idx;
        }
      }
    });

    // Obtener series existentes para evitar duplicados
    const existingSeries = await prisma.asset.findMany({
      where: { numeroSerie: { not: null } },
      select: { numeroSerie: true },
    });
    const existingSeriesSet = new Set(
      existingSeries.filter((a) => a.numeroSerie).map((a) => a.numeroSerie!.toUpperCase())
    );

    // Map para cachear empleados creados/encontrados durante la importacion
    const employeeCache = new Map<string, string>(); // normalizedRut -> employeeId

    // Procesar filas
    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as Array<{
        row: number;
        message: string;
        type?: string;
        data?: Record<string, string>;
      }>,
    };

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] as string[];
      const rowNum = headerRow + i + 2; // Número de fila en Excel (1-indexed)

      try {
        // Obtener valores según mapeo
        const getValue = (field: string): string => {
          const idx = columnIndex[field];
          if (idx === undefined) return "";
          const value = row[idx];
          if (value === null || value === undefined) return "";

          // Convertir fechas si es un campo de fecha O mantención
          if (
            field === "fechaAsignacion" ||
            field.toLowerCase().includes("fecha") ||
            field === "mantencion" ||
            field === "proximaMantencion"
          ) {
            return convertExcelDateValue(value);
          }

          return String(value).trim();
        };

        const marca = getValue("marca");
        const modelo = getValue("modelo");
        const numeroSerie = getValue("numeroSerie");

        // Validar campos requeridos
        if (!marca || !modelo || !numeroSerie) {
          const missingFields = [];
          if (!marca) missingFields.push("Marca");
          if (!modelo) missingFields.push("Modelo");
          if (!numeroSerie) missingFields.push("N° de Serie");

          results.skipped++;
          results.errors.push({
            row: rowNum,
            message: `Campos faltantes: ${missingFields.join(", ")}`,
            type: "missing_required_field",
            data: { marca: marca || "", modelo: modelo || "", numeroSerie: numeroSerie || "" },
          });
          continue;
        }

        // Verificar duplicado - buscar info del activo existente para mostrar al usuario
        if (existingSeriesSet.has(numeroSerie.toUpperCase())) {
          const existingAsset = await prisma.asset.findFirst({
            where: { numeroSerie: { equals: numeroSerie, mode: "insensitive" } },
            include: { empleadoActual: true },
          });

          const asignadoA = existingAsset?.empleadoActual
            ? `${existingAsset.empleadoActual.nombres} ${existingAsset.empleadoActual.apellidoPaterno} (RUT: ${existingAsset.empleadoActual.rut})`
            : "Sin asignar";

          results.skipped++;
          results.errors.push({
            row: rowNum,
            message: `N° de serie "${numeroSerie}" ya existe - Marca: ${existingAsset?.marca || "N/A"}, Modelo: ${existingAsset?.modelo || "N/A"}, Asignado a: ${asignadoA}`,
            type: "duplicate_in_database",
            data: { marca, modelo, numeroSerie },
          });
          continue;
        }

        // Primero, obtener el estado para determinar si necesitamos empleado
        const estadoValue = getValue("estado");
        const estadoParsed = parseEstado(estadoValue);

        // Buscar o crear empleado por RUT solo si el estado NO es "disponible"
        let empleadoId: string | null = null;
        const rut = getValue("rut");

        // Solo procesar empleado si tiene RUT Y el estado no es "disponible"
        if (rut && estadoParsed !== "disponible") {
          const normalizedRut = normalizeRut(rut);

          // Verificar si ya lo procesamos en esta importacion
          if (employeeCache.has(normalizedRut)) {
            empleadoId = employeeCache.get(normalizedRut)!;
          } else {
            // Buscar empleado existente en BD
            let employee = await prisma.employee.findUnique({
              where: { rut: normalizedRut },
              select: { id: true },
            });

            // Si no existe, crear el empleado
            if (!employee) {
              const nombres = getValue("nombre");
              const apellidoPaterno = getValue("apellidoP");
              const apellidoMaterno = getValue("apellidoM") || null;
              const correo = getValue("correo");
              const cargo = getValue("cargo") || null;
              const jefatura = getValue("jefatura") || null;
              const supervisor = getValue("supervisor") || null;
              const comuna = getValue("comuna") || null;

              // Validar campos requeridos para crear empleado
              if (!nombres || !apellidoPaterno) {
                results.skipped++;
                results.errors.push({
                  row: rowNum,
                  message: `Empleado con RUT ${rut}: faltan campos obligatorios (Nombre o Apellido P.)`,
                  type: "missing_employee_data",
                  data: { marca, modelo, numeroSerie, rut, nombre: nombres || "", apellidoP: apellidoPaterno || "" },
                });
                continue;
              }

              // Generar correo si no existe (requerido en schema)
              const correoFinal = correo ||
                `${nombres.toLowerCase().replace(/\s+/g, '.')}.${apellidoPaterno.toLowerCase()}@empresa.cl`;

              try {
                employee = await prisma.employee.create({
                  data: {
                    rut: normalizedRut,
                    nombres,
                    apellidoPaterno,
                    apellidoMaterno,
                    correo: correoFinal,
                    cargo,
                    jefatura,
                    supervisor,
                    ubicacion: comuna,
                    tipoContrato: "planta", // Default, puede ajustarse
                    estado: "activo",
                  },
                  select: { id: true },
                });

                logger.log(`Empleado creado: ${nombres} ${apellidoPaterno}`);
              } catch (employeeError) {
                // Si falla por correo duplicado, intentar con un correo único
                if (employeeError instanceof Error && employeeError.message.includes("correo")) {
                  const uniqueCorreo = `${nombres.toLowerCase().replace(/\s+/g, '.')}.${apellidoPaterno.toLowerCase()}.${Date.now()}@empresa.cl`;
                  employee = await prisma.employee.create({
                    data: {
                      rut: normalizedRut,
                      nombres,
                      apellidoPaterno,
                      apellidoMaterno,
                      correo: uniqueCorreo,
                      cargo,
                      jefatura,
                      supervisor,
                      ubicacion: comuna,
                      tipoContrato: "planta",
                      estado: "activo",
                    },
                    select: { id: true },
                  });
                } else {
                  throw employeeError;
                }
              }
            }

            empleadoId = employee.id;
            employeeCache.set(normalizedRut, empleadoId);
          }
        }

        // Parsear estado (cast al enum EstadoActivo)
        // Si tiene empleadoId, el estado es "asignado", sino usar el estado parseado
        const estado = (empleadoId ? "asignado" : estadoParsed) as "disponible" | "asignado" | "en_mantencion" | "reutilizable" | "baja" | "vendido";

        // Obtener campos específicos
        const procesador = getValue("procesador") || null;
        const ram = getValue("ram") || null;
        const discoDuro = getValue("discoDuro") || getValue("almacenamiento") || null;
        const imei = getValue("imei") || null;
        const numeroTelefono = getValue("numeroTelefono") || null;
        const pulgadasStr = getValue("pulgadas");
        const pulgadas = pulgadasStr ? parseFloat(pulgadasStr) : null;

        // Campos adicionales que estaban siendo ignorados
        const sistemaOperativo = getValue("sistemaOperativo") || null;
        const ubicacionFisica = getValue("comuna") || null;

        // Microsoft 365: parsear booleano desde Excel (SI/NO, true/false, 1/0)
        const microsoft365Str = getValue("microsoft365").toLowerCase();
        const microsoft365 = ["si", "sí", "yes", "true", "1"].includes(microsoft365Str);

        // Fecha de compra (puede venir como "Fecha de entrega" en el Excel)
        const fechaCompraStr = getValue("fechaEntrega");
        const fechaCompra = fechaCompraStr ? parseDDMMYYYYToDate(fechaCompraStr) : null;

        // Crear activo
        const asset = await prisma.asset.create({
          data: {
            categoriaId: categoryRecord.id,
            marca,
            modelo,
            numeroSerie,
            estado,
            condicion: "usado",
            procesador,
            ram,
            discoDuro,
            imei,
            numeroTelefono,
            pulgadas,
            sistemaOperativo,
            ubicacionFisica,
            microsoft365,
            fechaCompra,
            observaciones: getValue("observaciones") || null,
            empleadoActualId: empleadoId,
          },
        });

        // Registrar en historial
        await prisma.assetHistory.create({
          data: {
            assetId: asset.id,
            tipoEvento: "creacion",
            descripcion: "Activo importado desde Excel",
            usuarioSistema: session.user?.email || "sistema",
          },
        });

        // Si tiene empleado asignado, crear asignación
        if (empleadoId) {
          const fechaAsignacionStr = getValue("fechaAsignacion");
          let fechaEntrega = new Date();

          // Intentar parsear la fecha si existe
          if (fechaAsignacionStr) {
            const parsedDate = parseDDMMYYYYToDate(fechaAsignacionStr);
            if (parsedDate) {
              fechaEntrega = parsedDate;
            }
          }

          await prisma.assignment.create({
            data: {
              assetId: asset.id,
              employeeId: empleadoId,
              fechaEntrega,
              tipoMovimiento: "ingreso",
              activo: true,
            },
          });

          await prisma.assetHistory.create({
            data: {
              assetId: asset.id,
              tipoEvento: "asignacion",
              descripcion: "Asignación importada desde Excel",
              usuarioSistema: session.user?.email || "sistema",
            },
          });
        }

        // Crear registro de mantención si existe fecha de mantención
        const fechaMantencionStr = getValue("mantencion");
        const proximaMantencionStr = getValue("proximaMantencion");

        logger.log(`[ROW ${rowNum}] Mantención detectada`, { numeroSerie });

        // Crear mantención si existe al menos una fecha relacionada con mantención
        if (fechaMantencionStr || proximaMantencionStr) {
          const fechaMantencion = fechaMantencionStr ? parseDDMMYYYYToDate(fechaMantencionStr) : null;
          const proximaMantencion = proximaMantencionStr ? parseDDMMYYYYToDate(proximaMantencionStr) : null;

          // Determinar qué fecha usar como principal
          const fechaPrincipal = fechaMantencion || proximaMantencion;

          if (fechaPrincipal) {
            const ahora = new Date();
            const esFutura = fechaPrincipal > ahora;

            // Obtener datos del empleado para la descripción
            let descripcionDetallada = "Mantención importada desde Excel";
            if (empleadoId) {
              const empleado = await prisma.employee.findUnique({
                where: { id: empleadoId },
                select: { nombres: true, apellidoPaterno: true, rut: true }
              });
              if (empleado) {
                descripcionDetallada = `Mantención ${esFutura ? 'programada' : 'realizada'} para ${empleado.nombres} ${empleado.apellidoPaterno} (RUT: ${empleado.rut})`;
              }
            }

            // Determinar fechas según la lógica:
            // - Si existe "Mantencion" (fechaMantencion), se usa como fecha realizada/programada según si es pasada o futura
            // - Si existe "Proxima Mantencion" (proximaMantencion), se guarda en el campo proximaMantencion
            const maintenanceData: {
              assetId: string;
              tipo: "preventiva";
              descripcion: string;
              fechaProgramada: Date | null;
              fechaRealizada: Date | null;
              proximaMantencion: Date | null;
              estado: "pendiente" | "completada";
              realizadoPor: string | null;
            } = {
              assetId: asset.id,
              tipo: "preventiva",
              descripcion: descripcionDetallada,
              fechaProgramada: null,
              fechaRealizada: null,
              proximaMantencion: null,
              estado: esFutura ? "pendiente" : "completada",
              realizadoPor: esFutura ? null : "Registro histórico",
            };

            // Si existe fecha de mantención, usarla como principal
            if (fechaMantencion) {
              if (esFutura) {
                maintenanceData.fechaProgramada = fechaMantencion;
              } else {
                maintenanceData.fechaRealizada = fechaMantencion;
              }
              // Si además existe próxima mantención, guardarla
              if (proximaMantencion && proximaMantencion > fechaMantencion) {
                maintenanceData.proximaMantencion = proximaMantencion;
              }
            } else if (proximaMantencion) {
              // Solo existe próxima mantención, usarla como principal
              if (esFutura) {
                maintenanceData.fechaProgramada = proximaMantencion;
              } else {
                maintenanceData.fechaRealizada = proximaMantencion;
              }
            }

            await prisma.maintenance.create({
              data: maintenanceData,
            });

            await prisma.assetHistory.create({
              data: {
                assetId: asset.id,
                tipoEvento: "mantencion",
                descripcion: `Mantención ${esFutura ? 'programada' : 'completada'} importada desde Excel`,
                usuarioSistema: session.user?.email || "sistema",
              },
            });

            logger.log(`[ROW ${rowNum}] Mantención creada: ${esFutura ? 'pendiente' : 'completada'}`);
          } else {
            logger.log(`[ROW ${rowNum}] No se pudo parsear fecha de mantención`);
          }
        }

        existingSeriesSet.add(numeroSerie.toUpperCase());
        results.imported++;
      } catch (error) {
        results.errors.push({
          row: rowNum,
          message: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }

    return NextResponse.json({
      success: results.errors.length === 0,
      imported: results.imported,
      skipped: results.skipped,
      errors: results.errors,
    });
  } catch (error) {
    logger.error("Error importing assets:", error);
    return NextResponse.json(
      { error: "Error al importar activos" },
      { status: 500 }
    );
  }
}
