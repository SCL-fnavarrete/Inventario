import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { updateAssetSchema } from '@/lib/validations/asset';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { descartarActivo } from '@/lib/services/activoService';
import {
  requirePermission,
  handleApiError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/auth/guard';
import { logger } from '@/lib/logger';
import { assertSedeAccess } from '@/lib/auth/sedeScope';
import { vieneAMiSede } from '@/lib/queries/guias';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('activos', 'read');

    const { id } = await params;

    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        categoria: true,
        empleadoActual: {
          select: { nombres: true, apellidoPaterno: true, rut: true },
        },
        assignments: {
          where: { activo: true },
          select: {
            id: true,
            activo: true,
            employee: {
              select: { id: true, nombres: true, apellidoPaterno: true, rut: true },
            },
          },
        },
        // Mantenciones abiertas: la pagina de baja (SPEC 2.88) cierra una
        // de ellas (mantencionACerrar) en vez de crear otra.
        maintenances: {
          where: { estado: { in: ['pendiente', 'en_proceso'] } },
          select: { id: true, estado: true, descripcion: true, tipo: { select: { nombre: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 });
    }

    // La sede destino ve (solo lectura) un equipo que viene en camino a ella (SPEC 2.108).
    if (!(await vieneAMiSede(session, asset.id))) {
      assertSedeAccess(session, asset.sedeId, 'Activo no encontrado');
    }

    return NextResponse.json(asset);
  } catch (error) {
    return handleApiError(error, 'Error al obtener activo');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('activos', 'write');

    const { id } = await params;
    const body = await request.json();

    // Validar datos con Zod
    const validatedData = updateAssetSchema.parse(body);

    // Verificar que el activo existe
    const existingAsset = await prisma.asset.findUnique({
      where: { id },
      include: { categoria: true },
    });

    if (!existingAsset) {
      return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 });
    }

    assertSedeAccess(session, existingAsset.sedeId, 'Activo no encontrado');

    // Verificar si el número de serie ya existe (si se cambió y se proporciona)
    if (validatedData.numeroSerie && validatedData.numeroSerie !== existingAsset.numeroSerie) {
      const duplicateSerie = await prisma.asset.findUnique({
        where: { numeroSerie: validatedData.numeroSerie },
      });

      if (duplicateSerie) {
        return NextResponse.json(
          {
            error: 'Ya existe un activo con este número de serie',
            // Para marcar el campo en el formulario.
            details: [{ field: 'numeroSerie', message: 'Ya existe un activo con este número de serie' }],
          },
          { status: 409 }
        );
      }
    }

    const usuario = session.user?.email || 'sistema';

    // El estado no se edita (SPEC 2.86): cada cambio pasa por su proceso, que
    // deja los registros que lo respaldan (solicitud, mantencion, baja,
    // venta). Editarlo a mano dejaba incoherencias: "asignado" sin empleado,
    // o "disponible" con la asignacion todavia activa.
    if (validatedData.estado && validatedData.estado !== existingAsset.estado) {
      throw new ConflictError(
        'El estado no se edita: cambia con su proceso (solicitudes, mantenciones, baja o venta).'
      );
    }

    // Registrar cambios en especificaciones técnicas
    const specsFields = ['procesador', 'ram', 'discoDuro', 'sistemaOperativo', 'pulgadas'] as const;
    const specsAnteriores: Record<string, unknown> = {};
    const specsNuevos: Record<string, unknown> = {};
    let hasSpecChanges = false;

    for (const field of specsFields) {
      if (validatedData[field] !== undefined && validatedData[field] !== existingAsset[field]) {
        specsAnteriores[field] = existingAsset[field];
        specsNuevos[field] = validatedData[field];
        hasSpecChanges = true;
      }
    }

    // Helper para convertir pulgadas a número o null
    const parsePulgadas = (value: string | number | null | undefined): number | null => {
      if (value === undefined || value === null || value === '') return null;
      const num = typeof value === 'number' ? value : parseFloat(value);
      return isNaN(num) ? null : num;
    };

    // El historial de specs y el update corren en una sola transacción: si el
    // update falla, el historial no registra un cambio que nunca ocurrió.
    const asset = await prisma.$transaction(async (tx) => {
      if (hasSpecChanges) {
        await assetHistoryService.registrarActualizacionSpecs(
          id,
          specsAnteriores as Prisma.InputJsonValue,
          specsNuevos as Prisma.InputJsonValue,
          usuario,
          tx
        );
      }

      return tx.asset.update({
        where: { id },
        data: {
          ...(validatedData.categoriaId && { categoriaId: validatedData.categoriaId }),
          ...(validatedData.marca && { marca: validatedData.marca }),
          ...(validatedData.modelo && { modelo: validatedData.modelo }),
          ...(validatedData.numeroSerie !== undefined && {
            numeroSerie: validatedData.numeroSerie || null,
          }),
          ...(validatedData.condicion && { condicion: validatedData.condicion }),
          ...(validatedData.fechaCompra !== undefined && {
            fechaCompra: validatedData.fechaCompra ? new Date(validatedData.fechaCompra) : null,
          }),
          ...(validatedData.fechaGarantiaFin !== undefined && {
            fechaGarantiaFin: validatedData.fechaGarantiaFin
              ? new Date(validatedData.fechaGarantiaFin)
              : null,
          }),
          ...(validatedData.fechaBaja !== undefined && {
            fechaBaja: validatedData.fechaBaja ? new Date(validatedData.fechaBaja) : null,
          }),
          ...(validatedData.procesador !== undefined && {
            procesador: validatedData.procesador || null,
          }),
          ...(validatedData.ram !== undefined && { ram: validatedData.ram || null }),
          ...(validatedData.discoDuro !== undefined && {
            discoDuro: validatedData.discoDuro || null,
          }),
          ...(validatedData.sistemaOperativo !== undefined && {
            sistemaOperativo: validatedData.sistemaOperativo || null,
          }),
          ...(validatedData.imei !== undefined && { imei: validatedData.imei || null }),
          ...(validatedData.numeroTelefono !== undefined && {
            numeroTelefono: validatedData.numeroTelefono || null,
          }),
          ...(validatedData.numeroActivacion !== undefined && {
            numeroActivacion: validatedData.numeroActivacion || null,
          }),
          ...(validatedData.tipoPlan !== undefined && { tipoPlan: validatedData.tipoPlan || null }),
          ...(validatedData.tieneCargador !== undefined && {
            tieneCargador: validatedData.tieneCargador,
          }),
          ...(validatedData.pulgadas !== undefined && {
            pulgadas: parsePulgadas(validatedData.pulgadas),
          }),
          ...(validatedData.ubicacionFisica !== undefined && {
            ubicacionFisica: validatedData.ubicacionFisica || null,
          }),
          ...(validatedData.microsoft365 !== undefined && {
            microsoft365: validatedData.microsoft365,
          }),
          ...(validatedData.tipoLicenciaMicrosoft365 !== undefined && {
            tipoLicenciaMicrosoft365: validatedData.tipoLicenciaMicrosoft365 || null,
          }),
          ...(validatedData.intuneEnrolled !== undefined && {
            intuneEnrolled: validatedData.intuneEnrolled,
          }),
          ...(validatedData.listaDistribucion !== undefined && {
            listaDistribucion: validatedData.listaDistribucion || null,
          }),
          ...(validatedData.observaciones !== undefined && {
            observaciones: validatedData.observaciones || null,
          }),
          ...(validatedData.antivirus !== undefined && {
            antivirus: validatedData.antivirus || null,
          }),
          ...(validatedData.incidencia !== undefined && {
            incidencia: validatedData.incidencia || null,
          }),
          ...(validatedData.nombreEquipo !== undefined && {
            nombreEquipo: validatedData.nombreEquipo || null,
          }),
          ...(validatedData.conectividad !== undefined && {
            conectividad: validatedData.conectividad || null,
          }),
        },
      });
    });

    return NextResponse.json(asset);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar activo');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('activos', 'delete');

    const { id } = await params;
    const descartar = request.nextUrl.searchParams.get('descartar') === 'true';
    const motivo = request.nextUrl.searchParams.get('motivo')?.trim();
    const usuario = session.user?.email || 'sistema';

    const existingAsset = await prisma.asset.findUnique({
      where: { id },
      select: {
        id: true,
        marca: true,
        modelo: true,
        numeroSerie: true,
        estado: true,
        deletedAt: true,
        sedeId: true,
        _count: { select: { history: true, assignments: true } },
      },
    });

    if (!existingAsset) {
      throw new NotFoundError('Activo no encontrado');
    }

    assertSedeAccess(session, existingAsset.sedeId, 'Activo no encontrado');

    if (existingAsset.deletedAt) {
      throw new ConflictError('Este activo ya estaba descartado');
    }

    // Un equipo en manos de alguien no se borra ni se descarta: primero se
    // devuelve. Si no, la persona queda con un equipo que el sistema no ve.
    if (existingAsset.estado === 'asignado') {
      throw new ConflictError(
        'El activo está asignado. Registra la devolución antes de eliminarlo.'
      );
    }

    const tieneMovimientos =
      existingAsset._count.history > 0 || existingAsset._count.assignments > 0;

    // Explicit discard (e.g. import duplicates): does not delete the
    // record, only marks it and records who/why.
    if (descartar) {
      if (!motivo) {
        throw new ValidationError(
          'Descartar un activo requiere indicar el motivo (parámetro `motivo`)'
        );
      }

      const asset = await prisma.$transaction((tx) => descartarActivo(tx, id, motivo, usuario));

      return NextResponse.json({ success: true, descartado: true, asset });
    }

    // El historial de un activo es evidencia de auditoría (ISO 9001, 7.5.3).
    // Antes, este endpoint hacía deleteMany sobre assetHistory y assignment:
    // borraba la prueba junto con el hecho. Ya no.
    if (tieneMovimientos) {
      throw new ConflictError(
        'El activo tiene historial o asignaciones y no puede eliminarse: su registro es evidencia de auditoría. Dalo de baja en su lugar.',
        {
          eventosHistorial: existingAsset._count.history,
          asignaciones: existingAsset._count.assignments,
          alternativas: {
            baja: `POST /api/mantenciones/baja`,
            descartarDuplicado: `DELETE /api/activos/${id}?descartar=true&motivo=...`,
          },
        }
      );
    }

    // Sin historial ni asignaciones: nunca hubo nada que auditar.
    await prisma.asset.delete({ where: { id } });
    logger.info(
      `[activos] Borrado físico de ${existingAsset.marca} ${existingAsset.modelo} (${id}) por ${usuario}: sin historial ni asignaciones`
    );

    return NextResponse.json({ success: true, descartado: false });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar activo');
  }
}
