import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EstadoActivo, Prisma } from '@prisma/client';
import { updateAssetSchema } from '@/lib/validations/asset';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { validateTransition } from '@/lib/services/assetStateMachine';
import {
  requirePermission,
  handleApiError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/auth/guard';
import { logger } from '@/lib/logger';
import {
  ASSET_CATEGORY_SPECIAL_FIELDS,
  getCategorySpecialFields,
} from '@/lib/assetImportCategoryFields';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('activos', 'read');

    const { id } = await params;

    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        categoria: true,
        empleadoActual: {
          select: { nombres: true, apellidoPaterno: true, rut: true },
        },
      },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 });
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

    const categoriaIdEfectiva = validatedData.categoriaId ?? existingAsset.categoriaId;
    const category = await prisma.assetCategory.findUnique({
      where: { id: categoriaIdEfectiva },
    });

    if (!category) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
    }

    const categoryChanged = categoriaIdEfectiva !== existingAsset.categoriaId;

    // Verificar si el número de serie ya existe (si se cambió y se proporciona)
    if (validatedData.numeroSerie && validatedData.numeroSerie !== existingAsset.numeroSerie) {
      const duplicateSerie = await prisma.asset.findUnique({
        where: { numeroSerie: validatedData.numeroSerie },
      });

      if (duplicateSerie) {
        return NextResponse.json(
          { error: 'Ya existe un activo con este numero de serie' },
          { status: 400 }
        );
      }
    }

    const usuario = session.user?.email || 'sistema';

    // Validar transición de estado con la máquina de estados (SPEC 2.7).
    // La validación consulta datos pero no escribe: puede quedar fuera de la
    // transacción y así el 400 sale sin abrir una.
    let cambioEstado: { desde: EstadoActivo; hasta: EstadoActivo } | null = null;

    if (validatedData.estado && validatedData.estado !== existingAsset.estado) {
      const activeAssignment = await prisma.assignment.findFirst({
        where: { assetId: id, activo: true },
      });
      const activeMaintenance = await prisma.maintenance.findFirst({
        where: { assetId: id, estado: { in: ['pendiente', 'en_proceso'] } },
      });

      const transitionResult = validateTransition(existingAsset.estado, validatedData.estado, {
        hasActiveAssignment: !!activeAssignment,
        hasActiveMaintenance: !!activeMaintenance,
      });

      if (!transitionResult.valid) {
        return NextResponse.json(
          { error: 'Transición de estado no permitida', details: transitionResult.errors },
          { status: 400 }
        );
      }

      cambioEstado = { desde: existingAsset.estado, hasta: validatedData.estado };
    }

    // Helper para convertir pulgadas a número o null
    const parsePulgadas = (value: unknown): number | null => {
      if (value === undefined || value === null || value === '') return null;
      const num = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const specialFields = getCategorySpecialFields(category.tipoDevolucion, {
      procesador:
        validatedData.procesador !== undefined
          ? validatedData.procesador || null
          : existingAsset.procesador,
      ram: validatedData.ram !== undefined ? validatedData.ram || null : existingAsset.ram,
      discoDuro:
        validatedData.discoDuro !== undefined
          ? validatedData.discoDuro || null
          : existingAsset.discoDuro,
      sistemaOperativo:
        validatedData.sistemaOperativo !== undefined
          ? validatedData.sistemaOperativo || null
          : existingAsset.sistemaOperativo,
      antivirus:
        validatedData.antivirus !== undefined ? validatedData.antivirus || null : existingAsset.antivirus,
      nombreEquipo:
        validatedData.nombreEquipo !== undefined
          ? validatedData.nombreEquipo || null
          : existingAsset.nombreEquipo,
      imei: validatedData.imei !== undefined ? validatedData.imei || null : existingAsset.imei,
      numeroTelefono:
        validatedData.numeroTelefono !== undefined
          ? validatedData.numeroTelefono || null
          : existingAsset.numeroTelefono,
      numeroActivacion:
        validatedData.numeroActivacion !== undefined
          ? validatedData.numeroActivacion || null
          : existingAsset.numeroActivacion,
      tipoPlan:
        validatedData.tipoPlan !== undefined ? validatedData.tipoPlan || null : existingAsset.tipoPlan,
      operador:
        validatedData.operador !== undefined ? validatedData.operador || null : existingAsset.operador,
      tieneCargador:
        validatedData.tieneCargador !== undefined
          ? validatedData.tieneCargador
          : categoryChanged && category.tipoDevolucion === 'celular'
            ? true
            : existingAsset.tieneCargador,
      pulgadas:
        validatedData.pulgadas !== undefined
          ? parsePulgadas(validatedData.pulgadas)
          : parsePulgadas(existingAsset.pulgadas),
      microsoft365:
        validatedData.microsoft365 !== undefined
          ? validatedData.microsoft365
          : existingAsset.microsoft365,
    });

    // Registrar cambios en especificaciones técnicas, incluidos los campos
    // limpiados automáticamente al cambiar la categoría efectiva.
    const specsAnteriores: Record<string, unknown> = {};
    const specsNuevos: Record<string, unknown> = {};
    let hasSpecChanges = false;

    for (const field of ASSET_CATEGORY_SPECIAL_FIELDS) {
      const previousValue =
        field === 'pulgadas' ? parsePulgadas(existingAsset.pulgadas) : existingAsset[field];
      if (specialFields[field] !== previousValue) {
        specsAnteriores[field] = previousValue;
        specsNuevos[field] = specialFields[field];
        hasSpecChanges = true;
      }
    }

    if (categoryChanged) {
      specsAnteriores.categoriaId = existingAsset.categoriaId;
      specsAnteriores.tipoDevolucion = existingAsset.categoria.tipoDevolucion;
      specsNuevos.categoriaId = categoriaIdEfectiva;
      specsNuevos.tipoDevolucion = category.tipoDevolucion;
      hasSpecChanges = true;
    }

    // Las tres escrituras -- historial de estado, historial de specs y el
    // update -- corren en una sola transacción. Antes eran secuenciales: si el
    // update fallaba, el historial ya había registrado un cambio que nunca
    // ocurrió, y el registro de auditoría quedaba mintiendo.
    const asset = await prisma.$transaction(async (tx) => {
      if (cambioEstado) {
        await assetHistoryService.registrarCambioEstado(
          id,
          cambioEstado.desde,
          cambioEstado.hasta,
          undefined,
          usuario,
          tx
        );
      }

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
          categoriaId: categoriaIdEfectiva,
          ...(validatedData.marca && { marca: validatedData.marca }),
          ...(validatedData.modelo && { modelo: validatedData.modelo }),
          ...(validatedData.numeroSerie !== undefined && {
            numeroSerie: validatedData.numeroSerie || null,
          }),
          ...(validatedData.numeroActivoInterno !== undefined && {
            numeroActivoInterno: validatedData.numeroActivoInterno || null,
          }),
          ...(validatedData.estado && { estado: validatedData.estado }),
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
          ...specialFields,
          ...(validatedData.ubicacionFisica !== undefined && {
            ubicacionFisica: validatedData.ubicacionFisica || null,
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
          ...(validatedData.incidencia !== undefined && {
            incidencia: validatedData.incidencia || null,
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
        _count: { select: { history: true, assignments: true } },
      },
    });

    if (!existingAsset) {
      throw new NotFoundError('Activo no encontrado');
    }

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

    // Descarte explícito: para duplicados de importación (SPEC 2.7.7). No
    // borra nada, marca el registro y deja constancia de quién y por qué.
    if (descartar) {
      if (!motivo) {
        throw new ValidationError(
          'Descartar un activo requiere indicar el motivo (parámetro `motivo`)'
        );
      }

      const asset = await prisma.$transaction(async (tx) => {
        await assetHistoryService.registrar(
          {
            assetId: id,
            tipoEvento: 'baja',
            descripcion: `Registro descartado: ${motivo}`,
            datosAnteriores: { deletedAt: null },
            datosNuevos: { deletedAt: new Date().toISOString(), motivo },
            usuarioSistema: usuario,
          },
          tx
        );

        return tx.asset.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
      });

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
            baja: `POST /api/activos/${id}/baja`,
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
