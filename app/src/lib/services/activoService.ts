import type { EstadoActivo, Prisma } from '@prisma/client';
import { errorRepetido } from '@/lib/errors';
import type { CreateAssetInput } from '@/lib/validations/asset';
import { assetHistoryService } from '@/lib/services/assetHistoryService';

type Tx = Prisma.TransactionClient;

/**
 * Crea un equipo con las reglas de Activos > Nuevo: N° de serie unico y el
 * evento de creacion en su historial. Lo usan el alta de Activos y las
 * compras, que crean sus equipos "Por repartir" (SPEC 2.111) dentro de su
 * propia transaccion.
 */
export async function crearActivo(
  tx: Tx,
  datos: Omit<CreateAssetInput, 'estado'>,
  opciones: { sedeId: string | null; usuario: string; estado?: EstadoActivo }
) {
  if (datos.numeroSerie) {
    const existente = await tx.asset.findUnique({ where: { numeroSerie: datos.numeroSerie } });
    if (existente) {
      throw errorRepetido(
        'numeroSerie',
        `Ya existe un activo con el número de serie ${datos.numeroSerie}`
      );
    }
  }

  const asset = await tx.asset.create({
    data: {
      categoriaId: datos.categoriaId,
      sedeId: opciones.sedeId,
      marca: datos.marca,
      modelo: datos.modelo,
      numeroSerie: datos.numeroSerie || null,
      estado: opciones.estado ?? 'disponible',
      condicion: datos.condicion || 'nuevo',
      fechaCompra: datos.fechaCompra ? new Date(datos.fechaCompra) : null,
      fechaGarantiaFin: datos.fechaGarantiaFin ? new Date(datos.fechaGarantiaFin) : null,
      fechaBaja: datos.fechaBaja ? new Date(datos.fechaBaja) : null,
      procesador: datos.procesador || null,
      ram: datos.ram || null,
      discoDuro: datos.discoDuro || null,
      sistemaOperativo: datos.sistemaOperativo || null,
      imei: datos.imei || null,
      numeroTelefono: datos.numeroTelefono || null,
      numeroActivacion: datos.numeroActivacion || null,
      tipoPlan: datos.tipoPlan || null,
      tieneCargador: datos.tieneCargador || false,
      pulgadas: datos.pulgadas || null,
      ubicacionFisica: datos.ubicacionFisica || null,
      microsoft365: datos.microsoft365 || false,
      tipoLicenciaMicrosoft365: datos.tipoLicenciaMicrosoft365 || null,
      intuneEnrolled: datos.intuneEnrolled || false,
      listaDistribucion: datos.listaDistribucion || null,
      observaciones: datos.observaciones || null,
      antivirus: datos.antivirus || null,
      incidencia: datos.incidencia || null,
      nombreEquipo: datos.nombreEquipo || null,
      conectividad: datos.conectividad || null,
    },
  });

  await assetHistoryService.registrarCreacion(asset, opciones.usuario, tx);
  return asset;
}

/**
 * Descarta un registro de equipo: no se borra (su historial es evidencia,
 * SPEC 2.7.7), se marca `deletedAt` y queda el motivo en su historial. Lo
 * usan el descarte de duplicados de importacion y quitar de una compra un
 * equipo que todavia no se reparte (SPEC 2.111.7).
 */
export async function descartarActivo(tx: Tx, assetId: string, motivo: string, usuario: string) {
  await assetHistoryService.registrar(
    {
      assetId,
      tipoEvento: 'baja',
      descripcion: `Registro descartado: ${motivo}`,
      datosAnteriores: { deletedAt: null },
      datosNuevos: { deletedAt: new Date().toISOString(), motivo },
      usuarioSistema: usuario,
    },
    tx
  );
  return tx.asset.update({ where: { id: assetId }, data: { deletedAt: new Date() } });
}
