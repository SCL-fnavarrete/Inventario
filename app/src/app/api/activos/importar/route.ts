import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import * as XLSX from "xlsx";
import { convertExcelDateValue, parseDDMMYYYYToDate } from "@/lib/excel-utils";
import {
  interpretarEstado,
  interpretarRut,
  resolverCondicion,
  resolverEstado,
  tieneMicrosoft365,
} from "@/lib/importacion/activos";
import { limpiarRut } from "@/lib/validations/rut";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

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

// El vocabulario del Excel (estados, condiciones, RUT, licencias) vive en
// @/lib/importacion/activos para que las tres rutas de importacion lo lean
// igual. Antes cada una tenia su propia copia y ya habian empezado a divergir.

// Constantes de seguridad para archivos
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream", // Algunos navegadores envían este tipo
];

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('activos', 'write');

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
    // raw: true impide que SheetJS interprete por su cuenta las celdas que
    // "parecen" fecha. El parseo lo hace convertExcelDateValue, que conoce el
    // formato chileno dd-mm-aaaa y el serial numerico de Excel.
    const workbook = XLSX.read(buffer, { type: "array", raw: true });
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

        // --- Interpretacion de la fila ---------------------------------
        // Todo lo que puede fallar se decide ANTES de escribir en la base. Una
        // fila que se rechaza no debe dejar nada a medias.

        const lecturaEstado = interpretarEstado(getValue("estado"));
        if (lecturaEstado.tipo === "desconocido") {
          results.skipped++;
          results.errors.push({
            row: rowNum,
            message: `Estado no reconocido: "${lecturaEstado.valor}". Se espera un estado (Disponible, Asignado, En mantencion, Reutilizable, Baja, Vendido) o una condicion (Nuevo, Usado, Seminuevo, Danado)`,
            type: "invalid_format",
            data: { marca, modelo, numeroSerie },
          });
          continue;
        }

        const lecturaRut = interpretarRut(getValue("rut"));
        if (lecturaRut.tipo === "invalido") {
          results.skipped++;
          results.errors.push({
            row: rowNum,
            message: `RUT invalido: "${lecturaRut.valor}" (digito verificador incorrecto)`,
            type: "invalid_format",
            data: { marca, modelo, numeroSerie, rut: lecturaRut.valor },
          });
          continue;
        }

        // La columna "Estado" de estos Excel casi siempre trae la condicion
        // fisica (Usado/Nuevo). Cuando es asi, el estado real se deduce de si el
        // equipo esta en manos de alguien; cuando el Excel dice un estado de
        // verdad, ese manda.
        const rutEmpleado = lecturaRut.tipo === "valido" ? lecturaRut.rut : null;
        const estado = resolverEstado(lecturaEstado, rutEmpleado !== null);
        const condicion = resolverCondicion(lecturaEstado, getValue("condicion"));
        const debeAsignar = rutEmpleado !== null && estado === "asignado";

        // Si hay que asignar, aqui solo se LEE: se averigua si el empleado ya
        // existe y, si no, se validan y preparan sus datos. La escritura ocurre
        // mas abajo, dentro de la transaccion.
        let empleadoExistenteId: string | null =
          rutEmpleado ? employeeCache.get(rutEmpleado) ?? null : null;
        let datosEmpleadoNuevo: Prisma.EmployeeCreateInput | null = null;

        if (debeAsignar && rutEmpleado && !empleadoExistenteId) {
          const encontrado = await prisma.employee.findUnique({
            where: { rut: rutEmpleado },
            select: { id: true },
          });

          if (encontrado) {
            empleadoExistenteId = encontrado.id;
          } else {
            const nombres = getValue("nombre");
            const apellidoPaterno = getValue("apellidoP");

            if (!nombres || !apellidoPaterno) {
              results.skipped++;
              results.errors.push({
                row: rowNum,
                message: `Empleado con RUT ${rutEmpleado}: faltan campos obligatorios (Nombre o Apellido P.)`,
                type: "missing_employee_data",
                data: {
                  marca,
                  modelo,
                  numeroSerie,
                  rut: rutEmpleado,
                  nombre: nombres || "",
                  apellidoP: apellidoPaterno || "",
                },
              });
              continue;
            }

            // El correo es unico en la base. Si el Excel no lo trae se genera
            // uno derivado del RUT: siempre el mismo para la misma persona, de
            // modo que reimportar el archivo no cree un empleado distinto cada
            // vez (antes se usaba Date.now(), que si lo hacia).
            const base = `${nombres.toLowerCase().replace(/\s+/g, ".")}.${apellidoPaterno.toLowerCase()}`;
            let correo = getValue("correo") || `${base}@empresa.cl`;
            const correoTomado = await prisma.employee.findUnique({
              where: { correo },
              select: { id: true },
            });
            if (correoTomado) {
              correo = `${base}.${limpiarRut(rutEmpleado).toLowerCase()}@empresa.cl`;
            }

            datosEmpleadoNuevo = {
              rut: rutEmpleado,
              nombres,
              apellidoPaterno,
              apellidoMaterno: getValue("apellidoM") || null,
              correo,
              cargo: getValue("cargo") || null,
              jefatura: getValue("jefatura") || null,
              supervisor: getValue("supervisor") || null,
              ubicacion: getValue("comuna") || null,
              tipoContrato: "planta",
              estado: "activo",
            };
          }
        }

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

        // La columna "Microsoft 365" de estos Excel no trae SI/NO sino el
        // nombre del plan ("Premium" en 388 filas). Leerla como booleano
        // estricto convertia todas esas licencias en false.
        const microsoft365 = tieneMicrosoft365(getValue("microsoft365"));

        // Fecha de compra (puede venir como "Fecha de entrega" en el Excel)
        const fechaCompraStr = getValue("fechaCompra") || getValue("fechaEntrega");
        const fechaCompra = fechaCompraStr ? parseDDMMYYYYToDate(fechaCompraStr) : null;

        // La fecha de entrega se resuelve antes de escribir nada: si el activo
        // va asignado a alguien pero la fecha no se puede leer, se rechaza la
        // fila entera. Antes se usaba la fecha de hoy en silencio, de modo que
        // una asignacion de 2023 quedaba registrada como entregada hoy: un dato
        // incorrecto pero verosimil, que nadie iba a detectar.
        let fechaEntrega: Date | null = null;
        if (debeAsignar) {
          // Estos Excel no tienen una columna "Fecha de asignacion": la fecha
          // en que el equipo se entrego a la persona es "Fecha de Entrega".
          const fechaAsignacionStr =
            getValue("fechaAsignacion") || getValue("fechaEntrega");
          fechaEntrega = fechaAsignacionStr ? parseDDMMYYYYToDate(fechaAsignacionStr) : null;

          if (!fechaEntrega) {
            results.skipped++;
            results.errors.push({
              row: rowNum,
              message: fechaAsignacionStr
                ? `Fecha de asignación no reconocida: "${fechaAsignacionStr}" (se espera dd-mm-aaaa)`
                : "El activo figura asignado pero no trae fecha de asignación",
              type: "invalid_assignment_date",
              data: { marca, modelo, numeroSerie },
            });
            continue;
          }
        }

        // Las escrituras de una fila -activo, historial, asignacion y
        // mantencion- son una sola operacion: hasta siete escrituras que deben
        // cuadrar entre si. Sin transaccion, un fallo a mitad dejaba un activo
        // sin su asignacion o sin historial, y nada lo delataba.
        const empleadoIdFinal = await prisma.$transaction(async (tx) => {
        // El empleado se crea aqui dentro. Antes se creaba antes de validar la
        // fila: una fila rechazada mas abajo dejaba igual el empleado grabado,
        // huerfano de cualquier activo.
        let empleadoId: string | null = empleadoExistenteId;
        if (debeAsignar && !empleadoId && datosEmpleadoNuevo) {
          const creado = await tx.employee.create({
            data: datosEmpleadoNuevo,
            select: { id: true },
          });
          empleadoId = creado.id;
          logger.log(`[ROW ${rowNum}] Empleado creado: ${datosEmpleadoNuevo.nombres} ${datosEmpleadoNuevo.apellidoPaterno}`);
        }

        // Crear activo
        const asset = await tx.asset.create({
          data: {
            categoriaId: categoryRecord.id,
            marca,
            modelo,
            numeroSerie,
            estado,
            condicion,
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
        await tx.assetHistory.create({
          data: {
            assetId: asset.id,
            tipoEvento: "creacion",
            descripcion: "Activo importado desde Excel",
            usuarioSistema: session.user?.email || "sistema",
          },
        });

        // Si tiene empleado asignado, crear asignación. La fecha ya quedo
        // validada arriba -sin ella la fila se rechaza-, pero se comprueba de
        // nuevo para que la garantia sea visible tambien para el compilador.
        if (empleadoId && fechaEntrega) {
          await tx.assignment.create({
            data: {
              assetId: asset.id,
              employeeId: empleadoId,
              fechaEntrega,
              tipoMovimiento: "ingreso",
              activo: true,
            },
          });

          await tx.assetHistory.create({
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
              const empleado = await tx.employee.findUnique({
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

            await tx.maintenance.create({
              data: maintenanceData,
            });

            await tx.assetHistory.create({
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

        return empleadoId;
        });

        // La cache se actualiza solo despues del commit: si la transaccion se
        // hubiera deshecho, guardar el id habria hecho que las filas siguientes
        // apuntaran a un empleado inexistente.
        if (rutEmpleado && empleadoIdFinal) {
          employeeCache.set(rutEmpleado, empleadoIdFinal);
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
    return handleApiError(error, 'Error al importar activos');
  }
}
