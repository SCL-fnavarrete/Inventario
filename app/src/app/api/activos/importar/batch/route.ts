import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDDMMYYYYToDate } from "@/lib/excel-utils";
import {
  interpretarEstado,
  interpretarRut,
  resolverCondicion,
  resolverEstado,
  tieneMicrosoft365,
} from "@/lib/importacion/activos";
import { limpiarRut } from "@/lib/validations/rut";
import { Prisma } from "@prisma/client";
import type { CorrectedRow, ImportRowStatus, ImportBatchResult } from "@/types/import";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// El vocabulario del Excel vive en @/lib/importacion/activos, compartido con
// la ruta de importacion normal. Antes esta ruta tenia su propia copia y las
// dos ya habian empezado a divergir.

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('activos', 'write');

    const body = await request.json();
    const { categoria, rows } = body as { categoria: string; rows: CorrectedRow[] };

    if (!categoria || !rows || rows.length === 0) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos" },
        { status: 400 }
      );
    }

    // Obtener o crear categoría
    let categoryRecord = await prisma.assetCategory.findFirst({
      where: {
        nombre: { equals: categoria, mode: "insensitive" },
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

    // Obtener series existentes para evitar duplicados
    const existingSeries = await prisma.asset.findMany({
      where: { numeroSerie: { not: null } },
      select: { numeroSerie: true },
    });
    const existingSeriesSet = new Set(
      existingSeries.filter((a) => a.numeroSerie).map((a) => a.numeroSerie!.toUpperCase())
    );

    // Cache de empleados
    const employeeCache = new Map<string, string>();

    const results: ImportRowStatus[] = [];

    for (const row of rows) {
      const rowResult: ImportRowStatus = {
        rowIndex: row.rowIndex,
        excelRow: row.rowIndex + 2,
        status: "valid",
        data: row.data,
        errors: [],
        warnings: [],
      };

      try {
        const { marca, modelo, numeroSerie } = row.data;

        // Re-validar campos requeridos
        if (!marca || !modelo || !numeroSerie) {
          const missing = [];
          if (!marca) missing.push("Marca");
          if (!modelo) missing.push("Modelo");
          if (!numeroSerie) missing.push("N° de Serie");

          rowResult.errors.push({
            type: "missing_required_field",
            message: `Campos faltantes: ${missing.join(", ")}`,
          });
          rowResult.status = "error";
          results.push(rowResult);
          continue;
        }

        // Re-validar duplicado
        if (existingSeriesSet.has(numeroSerie.toUpperCase())) {
          const existingAsset = await prisma.asset.findFirst({
            where: { numeroSerie: { equals: numeroSerie, mode: "insensitive" } },
            include: { empleadoActual: true },
          });

          const asignadoA = existingAsset?.empleadoActual
            ? `${existingAsset.empleadoActual.nombres} ${existingAsset.empleadoActual.apellidoPaterno} (RUT: ${existingAsset.empleadoActual.rut})`
            : "Sin asignar";

          rowResult.errors.push({
            type: "duplicate_in_database",
            field: "numeroSerie",
            message: `N° de serie "${numeroSerie}" ya existe - Asignado a: ${asignadoA}`,
            value: numeroSerie,
          });
          rowResult.status = "error";
          results.push(rowResult);
          continue;
        }

        // --- Interpretacion de la fila corregida ------------------------
        const lecturaEstado = interpretarEstado(row.data.estado);
        if (lecturaEstado.tipo === "desconocido") {
          rowResult.errors.push({
            type: "invalid_format",
            field: "estado",
            message: `Estado no reconocido: "${lecturaEstado.valor}". Se espera un estado (Disponible, Asignado, En mantencion, Reutilizable, Baja, Vendido) o una condicion (Nuevo, Usado, Seminuevo, Danado)`,
            value: lecturaEstado.valor,
          });
          rowResult.status = "error";
          results.push(rowResult);
          continue;
        }

        const lecturaRut = interpretarRut(row.data.rut);
        if (lecturaRut.tipo === "invalido") {
          rowResult.errors.push({
            type: "invalid_format",
            field: "rut",
            message: `RUT invalido: "${lecturaRut.valor}" (digito verificador incorrecto)`,
            value: lecturaRut.valor,
          });
          rowResult.status = "error";
          results.push(rowResult);
          continue;
        }

        const rutEmpleado = lecturaRut.tipo === "valido" ? lecturaRut.rut : null;
        const estado = resolverEstado(lecturaEstado, rutEmpleado !== null);
        const condicion = resolverCondicion(lecturaEstado, row.data.condicion);
        const debeAsignar = rutEmpleado !== null && estado === "asignado";

        // Solo lecturas: si el empleado no existe se preparan sus datos, pero no
        // se graba nada hasta que la fila entera este validada.
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
            const nombres = row.data.nombre || row.data.nombres || "";
            const apellidoPaterno = row.data.apellidoP || row.data.apellidoPaterno || "";

            if (!nombres || !apellidoPaterno) {
              rowResult.errors.push({
                type: "missing_employee_data",
                message: `Empleado con RUT ${rutEmpleado}: faltan campos obligatorios (Nombre o Apellido P.)`,
              });
              rowResult.status = "error";
              results.push(rowResult);
              continue;
            }

            const base = `${nombres.toLowerCase().replace(/\s+/g, ".")}.${apellidoPaterno.toLowerCase()}`;
            let correo = row.data.correo || `${base}@empresa.cl`;
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
              apellidoMaterno: row.data.apellidoM || row.data.apellidoMaterno || null,
              correo,
              cargo: row.data.cargo || null,
              jefatura: row.data.jefatura || null,
              supervisor: row.data.supervisor || null,
              ubicacion: row.data.comuna || null,
              tipoContrato: "planta",
              estado: "activo",
            };
          }
        }

        // La fecha de entrega se valida antes de escribir. Antes, si no se podia
        // leer, esta ruta usaba new Date(): la asignacion quedaba fechada hoy.
        let fechaEntrega: Date | null = null;
        if (debeAsignar) {
          const fechaAsignacionStr = row.data.fechaAsignacion || row.data.fechaEntrega || "";
          fechaEntrega = fechaAsignacionStr ? parseDDMMYYYYToDate(fechaAsignacionStr) : null;

          if (!fechaEntrega) {
            rowResult.errors.push({
              type: "invalid_assignment_date",
              field: "fechaAsignacion",
              message: fechaAsignacionStr
                ? `Fecha de asignación no reconocida: "${fechaAsignacionStr}" (se espera dd-mm-aaaa)`
                : "El activo figura asignado pero no trae fecha de asignación",
              value: fechaAsignacionStr,
            });
            rowResult.status = "error";
            results.push(rowResult);
            continue;
          }
        }

        const procesador = row.data.procesador || null;
        const ram = row.data.ram || null;
        const discoDuro = row.data.discoDuro || row.data.almacenamiento || null;
        const imei = row.data.imei || null;
        const numeroTelefono = row.data.numeroTelefono || null;
        const pulgadasStr = row.data.pulgadas || "";
        const pulgadas = pulgadasStr ? parseFloat(pulgadasStr) : null;
        const sistemaOperativo = row.data.sistemaOperativo || null;
        const ubicacionFisica = row.data.comuna || null;
        const microsoft365 = tieneMicrosoft365(row.data.microsoft365);
        const fechaCompraStr = row.data.fechaCompra || row.data.fechaEntrega || "";
        const fechaCompra = fechaCompraStr ? parseDDMMYYYYToDate(fechaCompraStr) : null;

        // Activo, historial y asignacion son una sola operacion.
        const escrito = await prisma.$transaction(async (tx) => {
          let empleadoId: string | null = empleadoExistenteId;
          if (debeAsignar && !empleadoId && datosEmpleadoNuevo) {
            const creado = await tx.employee.create({
              data: datosEmpleadoNuevo,
              select: { id: true },
            });
            empleadoId = creado.id;
          }

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
              observaciones: row.data.observaciones || null,
              empleadoActualId: empleadoId,
            },
          });

          await tx.assetHistory.create({
            data: {
              assetId: asset.id,
              tipoEvento: "creacion",
              descripcion: "Activo importado desde Excel (corregido)",
              usuarioSistema: session.user?.email || "sistema",
            },
          });

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
                descripcion: "Asignación importada desde Excel (corregido)",
                usuarioSistema: session.user?.email || "sistema",
              },
            });
          }

          return { assetId: asset.id, empleadoId };
        });

        if (rutEmpleado && escrito.empleadoId) {
          employeeCache.set(rutEmpleado, escrito.empleadoId);
        }

        rowResult.assetId = escrito.assetId;
        rowResult.status = "imported";
        existingSeriesSet.add(numeroSerie.toUpperCase());
      } catch (error) {
        rowResult.errors.push({
          type: "unknown_error",
          message: error instanceof Error ? error.message : "Error desconocido",
        });
        rowResult.status = "error";
      }

      results.push(rowResult);
    }

    const response: ImportBatchResult = {
      success: results.every((r) => r.status === "imported"),
      imported: results.filter((r) => r.status === "imported").length,
      skipped: 0,
      failed: results.filter((r) => r.status === "error").length,
      results,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error, 'Error al importar activos corregidos');
  }
}
