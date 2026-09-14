import { prisma } from '@/lib/prisma'
import { TipoEvento, Asset, Prisma } from '@prisma/client'

/**
 * Cliente dentro de una `prisma.$transaction`. Mismo alias que usa
 * `workflowExecutionService`.
 */
export type PrismaTx = Prisma.TransactionClient

/**
 * Los metodos aceptan un `tx` opcional como ultimo parametro. Sin el, escriben
 * con el cliente global, que es como los llama la mayoria del codigo. Con el,
 * la entrada de historial se confirma o se descarta junto con el cambio que
 * documenta: un historial que sobrevive a una escritura fallida es peor que no
 * tenerlo, porque miente.
 *
 * Va al final y no al principio -- a diferencia de workflowExecutionService,
 * donde el `tx` es obligatorio -- porque un parametro opcional no puede ir
 * primero sin romper las llamadas existentes.
 */

export type AssetHistoryData = {
  assetId: string
  tipoEvento: TipoEvento
  descripcion: string
  datosAnteriores?: Prisma.InputJsonValue
  datosNuevos?: Prisma.InputJsonValue
  usuarioSistema?: string | null
}

/**
 * Servicio para registrar el historial de activos
 * Proporciona trazabilidad completa de todos los cambios en activos
 */
export const assetHistoryService = {
  /**
   * Registra un evento en el historial del activo
   */
  async registrar(data: AssetHistoryData, tx?: PrismaTx) {
    return (tx ?? prisma).assetHistory.create({
      data: {
        assetId: data.assetId,
        tipoEvento: data.tipoEvento,
        descripcion: data.descripcion,
        datosAnteriores: data.datosAnteriores,
        datosNuevos: data.datosNuevos,
        usuarioSistema: data.usuarioSistema || null,
      },
    })
  },

  /**
   * Registra la creación de un activo
   */
  async registrarCreacion(asset: Asset, usuario?: string) {
    return this.registrar({
      assetId: asset.id,
      tipoEvento: 'creacion',
      descripcion: `Activo creado: ${asset.marca} ${asset.modelo}${asset.numeroSerie ? ` (S/N: ${asset.numeroSerie})` : ''}`,
      datosNuevos: {
        marca: asset.marca,
        modelo: asset.modelo,
        numeroSerie: asset.numeroSerie,
        estado: asset.estado,
        condicion: asset.condicion,
      },
      usuarioSistema: usuario,
    })
  },

  /**
   * Registra una asignación de activo a empleado
   */
  async registrarAsignacion(
    assetId: string,
    empleadoNombre: string,
    empleadoRut: string,
    lugarEntrega?: string,
    entregadoPor?: string,
    usuario?: string,
    tx?: PrismaTx
  ) {
    return this.registrar({
      assetId,
      tipoEvento: 'asignacion',
      descripcion: `Asignado a ${empleadoNombre} (${empleadoRut})${lugarEntrega ? ` en ${lugarEntrega}` : ''}`,
      datosNuevos: {
        empleadoNombre,
        empleadoRut,
        lugarEntrega,
        entregadoPor,
        fechaAsignacion: new Date().toISOString(),
      },
      usuarioSistema: usuario,
    }, tx)
  },

  /**
   * Registra la devolución de un activo
   */
  async registrarDevolucion(
    assetId: string,
    empleadoNombre: string,
    empleadoRut: string,
    estadoDevolucion: string,
    observaciones?: string,
    usuario?: string,
    tx?: PrismaTx
  ) {
    return this.registrar({
      assetId,
      tipoEvento: 'devolucion',
      descripcion: `Devuelto por ${empleadoNombre} (${empleadoRut}) - Estado: ${estadoDevolucion}`,
      datosNuevos: {
        empleadoNombre,
        empleadoRut,
        estadoDevolucion,
        observaciones,
        fechaDevolucion: new Date().toISOString(),
      },
      usuarioSistema: usuario,
    }, tx)
  },

  /**
   * Registra un cambio de estado en el activo
   */
  async registrarCambioEstado(
    assetId: string,
    estadoAnterior: string,
    estadoNuevo: string,
    motivo?: string,
    usuario?: string,
    tx?: PrismaTx
  ) {
    return this.registrar({
      assetId,
      tipoEvento: 'cambio_estado',
      descripcion: `Estado cambiado de "${estadoAnterior}" a "${estadoNuevo}"${motivo ? `: ${motivo}` : ''}`,
      datosAnteriores: { estado: estadoAnterior },
      datosNuevos: { estado: estadoNuevo, motivo },
      usuarioSistema: usuario,
    }, tx)
  },

  /**
   * Registra una mantención realizada
   */
  async registrarMantencion(
    assetId: string,
    tipoMantencion: string,
    descripcion: string,
    realizadoPor?: string,
    costo?: number,
    usuario?: string
  ) {
    return this.registrar({
      assetId,
      tipoEvento: 'mantencion',
      descripcion: `Mantención ${tipoMantencion}: ${descripcion}`,
      datosNuevos: {
        tipoMantencion,
        descripcion,
        realizadoPor,
        costo,
        fechaMantencion: new Date().toISOString(),
      },
      usuarioSistema: usuario,
    })
  },

  /**
   * Registra una actualización de especificaciones
   */
  async registrarActualizacionSpecs(
    assetId: string,
    datosAnteriores: Prisma.InputJsonValue,
    datosNuevos: Prisma.InputJsonValue,
    usuario?: string,
    tx?: PrismaTx
  ) {
    const anteriores = datosAnteriores as Record<string, unknown>;
    const nuevos = datosNuevos as Record<string, unknown>;
    const cambios = Object.keys(nuevos)
      .filter(key => anteriores[key] !== nuevos[key])
      .map(key => key)
      .join(', ')

    return this.registrar({
      assetId,
      tipoEvento: 'actualizacion_specs',
      descripcion: `Especificaciones actualizadas: ${cambios}`,
      datosAnteriores,
      datosNuevos,
      usuarioSistema: usuario,
    }, tx)
  },

  /**
   * Registra la baja de un activo
   */
  async registrarBaja(
    assetId: string,
    motivo: string,
    condicionFinal: string,
    usuario?: string,
    tx?: PrismaTx
  ) {
    return this.registrar({
      assetId,
      tipoEvento: 'baja',
      descripcion: `Activo dado de baja: ${motivo}`,
      datosNuevos: {
        motivo,
        condicionFinal,
        fechaBaja: new Date().toISOString(),
      },
      usuarioSistema: usuario,
    }, tx)
  },

  /**
   * Registra la venta de un activo
   *
   * `fechaVenta` (14-sep-2026, SPEC 2.25) es la fecha que la persona
   * ingresa en el formulario -- antes este metodo no la recibia y siempre
   * guardaba `new Date()` (la fecha de HOY), ignorando lo que se hubiera
   * escrito. `moneda` tampoco se guardaba antes.
   */
  async registrarVenta(
    assetId: string,
    comprador: string | undefined,
    monto: number | undefined,
    usuario: string | undefined,
    fechaVenta: Date,
    moneda?: string,
    tx?: PrismaTx
  ) {
    return this.registrar({
      assetId,
      tipoEvento: 'venta',
      descripcion: `Activo vendido${comprador ? ` a ${comprador}` : ''}${monto ? ` por ${moneda || 'CLP'} ${monto.toLocaleString('es-CL')}` : ''}`,
      datosNuevos: {
        comprador,
        monto,
        moneda,
        fechaVenta: fechaVenta.toISOString(),
      },
      usuarioSistema: usuario,
    }, tx)
  },

  /**
   * Registra la vinculación de un activo YA EXISTENTE a una compra/factura
   * (14-sep-2026, SPEC 2.25). La creación de un activo nuevo desde el alta
   * rápida de Nueva Compra ya registraba su propio evento `creacion`; esto
   * cubre el caso que faltaba, que no dejaba ningún rastro.
   */
  async registrarVinculacionCompra(
    assetId: string,
    numeroFactura: string | null | undefined,
    usuario?: string,
    tx?: PrismaTx
  ) {
    return this.registrar({
      assetId,
      tipoEvento: 'compra',
      descripcion: `Vinculado a compra${numeroFactura ? ` (factura ${numeroFactura})` : ''}`,
      datosNuevos: {
        numeroFactura,
        fecha: new Date().toISOString(),
      },
      usuarioSistema: usuario,
    }, tx)
  },

  /**
   * Obtiene el historial completo de un activo
   */
  async obtenerHistorial(assetId: string) {
    return prisma.assetHistory.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
    })
  },

  /**
   * Obtiene el historial de un activo con paginación
   */
  async obtenerHistorialPaginado(
    assetId: string,
    page: number = 1,
    limit: number = 10
  ) {
    const [items, total] = await Promise.all([
      prisma.assetHistory.findMany({
        where: { assetId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetHistory.count({ where: { assetId } }),
    ])

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  },

  /**
   * Obtiene el último evento de un activo
   */
  async obtenerUltimoEvento(assetId: string) {
    return prisma.assetHistory.findFirst({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
    })
  },

  /**
   * Obtiene eventos por tipo
   */
  async obtenerEventosPorTipo(assetId: string, tipoEvento: TipoEvento) {
    return prisma.assetHistory.findMany({
      where: { assetId, tipoEvento },
      orderBy: { createdAt: 'desc' },
    })
  },
}
