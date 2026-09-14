import { prisma } from '@/lib/prisma'
import { AuditEntidad, AuditAccion, Prisma } from '@prisma/client'

/**
 * Cliente dentro de una `prisma.$transaction`. Mismo alias que usa
 * assetHistoryService/workflowExecutionService.
 */
export type PrismaTx = Prisma.TransactionClient

/**
 * Auditoria generica de escritura (SPEC 2.29, 14-sep-2026). Cubre
 * Empleado/Compra/Usuario -- Proveedores queda excluido a proposito (ver
 * schema.prisma, modelo AuditLog).
 *
 * IMPORTANTE -- nunca pasar `passwordHash` (ni ningun otro secreto) dentro
 * de `datosAnteriores`/`datosNuevos`. Quien arma el snapshot (el caller, en
 * las rutas de /api/usuarios) es responsable de omitirlo antes de llamar a
 * este servicio; el servicio no sanitiza porque no conoce la forma de cada
 * entidad.
 */
export type AuditLogData = {
  entidad: AuditEntidad
  entidadId: string
  accion: AuditAccion
  descripcion: string
  datosAnteriores?: Prisma.InputJsonValue
  datosNuevos?: Prisma.InputJsonValue
  usuarioSistema?: string | null
}

export const auditLogService = {
  /**
   * Registra un evento de auditoria. Acepta un `tx` opcional -- igual que
   * assetHistoryService -- para que el registro se confirme o se descarte
   * junto con el cambio que documenta.
   */
  async registrar(data: AuditLogData, tx?: PrismaTx) {
    return (tx ?? prisma).auditLog.create({
      data: {
        entidad: data.entidad,
        entidadId: data.entidadId,
        accion: data.accion,
        descripcion: data.descripcion,
        datosAnteriores: data.datosAnteriores,
        datosNuevos: data.datosNuevos,
        usuarioSistema: data.usuarioSistema || null,
      },
    })
  },

  async registrarCreacion(
    entidad: AuditEntidad,
    entidadId: string,
    descripcion: string,
    datosNuevos: Prisma.InputJsonValue,
    usuario?: string | null,
    tx?: PrismaTx
  ) {
    return this.registrar(
      { entidad, entidadId, accion: 'crear', descripcion, datosNuevos, usuarioSistema: usuario },
      tx
    )
  },

  async registrarActualizacion(
    entidad: AuditEntidad,
    entidadId: string,
    descripcion: string,
    datosAnteriores: Prisma.InputJsonValue,
    datosNuevos: Prisma.InputJsonValue,
    usuario?: string | null,
    tx?: PrismaTx
  ) {
    return this.registrar(
      {
        entidad,
        entidadId,
        accion: 'actualizar',
        descripcion,
        datosAnteriores,
        datosNuevos,
        usuarioSistema: usuario,
      },
      tx
    )
  },

  async registrarEliminacion(
    entidad: AuditEntidad,
    entidadId: string,
    descripcion: string,
    datosAnteriores: Prisma.InputJsonValue,
    usuario?: string | null,
    tx?: PrismaTx
  ) {
    return this.registrar(
      { entidad, entidadId, accion: 'eliminar', descripcion, datosAnteriores, usuarioSistema: usuario },
      tx
    )
  },
}
