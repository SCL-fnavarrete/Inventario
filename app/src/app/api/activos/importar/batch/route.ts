import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDDMMYYYYToDate } from "@/lib/excel-utils";
import type { CorrectedRow, ImportRowStatus, ImportBatchResult } from "@/types/import";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

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
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase().trim();
}

function parseEstado(value: string): string {
  if (!value) return "disponible";
  const normalized = value.toLowerCase().trim();
  return ESTADO_MAP[normalized] || "disponible";
}

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

        // Procesar empleado si existe
        const estadoValue = row.data.estado || "";
        const estadoParsed = parseEstado(estadoValue);
        let empleadoId: string | null = null;
        const rut = row.data.rut || "";

        if (rut && estadoParsed !== "disponible") {
          const normalizedRut = normalizeRut(rut);

          if (employeeCache.has(normalizedRut)) {
            empleadoId = employeeCache.get(normalizedRut)!;
          } else {
            let employee = await prisma.employee.findUnique({
              where: { rut: normalizedRut },
              select: { id: true },
            });

            if (!employee) {
              const nombres = row.data.nombre || row.data.nombres || "";
              const apellidoPaterno = row.data.apellidoP || row.data.apellidoPaterno || "";
              const apellidoMaterno = row.data.apellidoM || row.data.apellidoMaterno || null;
              const correo = row.data.correo || "";
              const cargo = row.data.cargo || null;
              const jefatura = row.data.jefatura || null;
              const supervisor = row.data.supervisor || null;
              const comuna = row.data.comuna || null;

              if (!nombres || !apellidoPaterno) {
                rowResult.errors.push({
                  type: "missing_employee_data",
                  message: `Empleado con RUT ${rut}: faltan campos obligatorios (Nombre o Apellido P.)`,
                });
                rowResult.status = "error";
                results.push(rowResult);
                continue;
              }

              const correoFinal =
                correo ||
                `${nombres.toLowerCase().replace(/\s+/g, ".")}.${apellidoPaterno.toLowerCase()}@empresa.cl`;

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
                    tipoContrato: "planta",
                    estado: "activo",
                  },
                  select: { id: true },
                });
              } catch (employeeError) {
                if (employeeError instanceof Error && employeeError.message.includes("correo")) {
                  const uniqueCorreo = `${nombres.toLowerCase().replace(/\s+/g, ".")}.${apellidoPaterno.toLowerCase()}.${Date.now()}@empresa.cl`;
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

        // Parsear campos adicionales
        const estado = (empleadoId ? "asignado" : estadoParsed) as
          | "disponible"
          | "asignado"
          | "en_mantencion"
          | "reutilizable"
          | "baja"
          | "vendido";

        const procesador = row.data.procesador || null;
        const ram = row.data.ram || null;
        const discoDuro = row.data.discoDuro || row.data.almacenamiento || null;
        const imei = row.data.imei || null;
        const numeroTelefono = row.data.numeroTelefono || null;
        const pulgadasStr = row.data.pulgadas || "";
        const pulgadas = pulgadasStr ? parseFloat(pulgadasStr) : null;
        const sistemaOperativo = row.data.sistemaOperativo || null;
        const ubicacionFisica = row.data.comuna || null;
        const microsoft365Str = (row.data.microsoft365 || "").toLowerCase();
        const microsoft365 = ["si", "sí", "yes", "true", "1"].includes(microsoft365Str);
        const fechaCompraStr = row.data.fechaEntrega || "";
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
            observaciones: row.data.observaciones || null,
            empleadoActualId: empleadoId,
          },
        });

        // Registrar en historial
        await prisma.assetHistory.create({
          data: {
            assetId: asset.id,
            tipoEvento: "creacion",
            descripcion: "Activo importado desde Excel (corregido)",
            usuarioSistema: session.user?.email || "sistema",
          },
        });

        // Si tiene empleado, crear asignación
        if (empleadoId) {
          const fechaAsignacionStr = row.data.fechaAsignacion || "";
          let fechaEntrega = new Date();

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
              descripcion: "Asignación importada desde Excel (corregido)",
              usuarioSistema: session.user?.email || "sistema",
            },
          });
        }

        rowResult.status = "imported";
        rowResult.assetId = asset.id;
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
