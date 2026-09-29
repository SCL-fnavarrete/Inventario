import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { ConflictError, errorDeCampo, exigirSinErroresCampos, NotFoundError, ValidationError } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { sedeIdParaCrear } from '@/shared/sedes/filtro';
import { ACTIVOS_VIGENTES, etiquetaEstadoActivo, identificadorActivo, validateTransition } from '@/modules/activos';
import { cambiarEstado } from '@/modules/activos/servidor';
import { darDeBajaEnTransaccion, motivoParaBaja, tipoCorrectivaPorDefecto } from '@/modules/mantenciones/servidor';
import { ETIQUETAS_GUIA, validarNuevaGuia, validarRecepcion } from '@/modules/despachos/validaciones';
import {
  INCLUDE_DETALLE_GUIA,
  actualizarEstadoGuia,
  buscarGuia,
  crearDespacho,
  crearGuiaConNumero,
  recibirEquipos,
  resolverKit,
  sedeDestinoValida,
  type AccionKit,
} from '@/modules/despachos/servicio';

/**
 * Acciones sobre un despacho (SPEC 2.108): crearlo, confirmar su recepcion,
 * anularlo y resolver lo que sigue en transito. Las rutas de
 * /api/guias-despacho solo validan la peticion y llaman a estas.
 */

/** Quien hace la accion: el correo queda en la auditoria; el nombre, en la guia. */
export type Quien = { email?: string | null; nombre?: string | null };

/**
 * Crear un despacho. Los equipos quedan "En tránsito" en la sede de origen y
 * pasan a la destino recien cuando esta confirma que llegaron.
 */
export async function registrarDespacho(body: Record<string, unknown>, quien: Quien) {
  // Mismas reglas que la pantalla (SPEC 2.104), con el campo de cada error.
  exigirSinErroresCampos(validarNuevaGuia(body), ETIQUETAS_GUIA);
  const { otChilexpress, fechaDespacho, fechaEstimadaLlegada, receptorNombre, receptorRut, observaciones, sedeDestinoId } =
    body as Record<string, string>;
  // Un equipo repetido en la lista se despacha una sola vez.
  const assetIds = [...new Set(body.assetIds as string[])];

  // Solo equipos disponibles: puede haber cambiado mientras se llenaba el formulario.
  const assets = await prisma.asset.findMany({
    where: { ...ACTIVOS_VIGENTES, id: { in: assetIds } },
    include: { sede: { select: { nombre: true } } },
  });
  if (assets.length !== assetIds.length) {
    throw errorDeCampo('assetIds', 'Uno o más equipos ya no existen en el inventario. Vuelve a elegirlos.');
  }
  const noDisponibles = assets.filter((a) => a.estado !== 'disponible');
  if (noDisponibles.length > 0) {
    const detalle = noDisponibles
      .map((a) => `${a.marca} ${a.modelo} (${identificadorActivo(a, 'sin serie')}): ${etiquetaEstadoActivo(a.estado)}`)
      .join('; ');
    throw errorDeCampo('assetIds', `Ya no están disponibles para despacho: ${detalle}`);
  }

  // Sede origen obligatoria, y todos los equipos de ella: una guia no mezcla sedes.
  const sedeId = sedeIdParaCrear(body.sedeId as string | undefined, { requerido: true });
  const deOtraSede = assets.filter((a) => a.sedeId !== sedeId);
  if (sedeId && deOtraSede.length > 0) {
    const detalle = deOtraSede.map((a) => `${a.marca} ${a.modelo} (${a.sede?.nombre ?? 'sin sede'})`).join('; ');
    throw errorDeCampo('assetIds', `No son de la sede origen: ${detalle}`);
  }
  // Existe, esta activa y no es la de origen.
  const sedeDestino = await sedeDestinoValida(sedeDestinoId, sedeId);

  // El numero se toma dentro de la transaccion y se reintenta si otra guia lo
  // uso (crearGuiaConNumero); la creacion es la misma del reparto de una compra.
  return crearGuiaConNumero((numero, tx) =>
    crearDespacho(tx, numero, {
      envio: { otChilexpress, fechaDespacho, fechaEstimadaLlegada, receptorNombre, receptorRut, observaciones },
      sedeId,
      sedeDestino,
      equipos: assets.map((a) => ({ id: a.id, estado: a.estado, sedeId: a.sedeId })),
      emisor: quien.nombre || quien.email || 'Técnico',
      usuario: quien.email || 'sistema',
    })
  );
}

/**
 * Confirmar la recepcion. La sede destino marca los equipos que llegaron (y
 * cuanto Kit/EPP): esos pasan a su inventario. Los que no, siguen "En
 * tránsito" y la guia queda "con faltantes" hasta resolverlos uno a uno.
 */
export async function confirmarRecepcion(
  id: string,
  datos: { recibidoPor?: string; fechaRecepcion?: string; llegaron?: unknown; kitRecibido?: unknown },
  quien: Quien
) {
  const { recibidoPor, fechaRecepcion } = datos;
  const guia = await buscarGuia(id);
  if (guia.estado !== 'en_transito') {
    throw new ConflictError('Este despacho ya no está en tránsito: su recepción ya se confirmó o se anuló');
  }

  const errores = validarRecepcion({ recibidoPor, fechaRecepcion }, guia.fechaDespacho);
  const idsLlegaron = Array.isArray(datos.llegaron) ? (datos.llegaron as string[]) : [];
  // Kit/EPP (SPEC 2.111.4): cuantas unidades de cada linea llegaron.
  const kitLlego = (Array.isArray(datos.kitRecibido) ? (datos.kitRecibido as { lineaId: string; cantidad: number }[]) : [])
    .map((k) => ({ lineaId: String(k.lineaId), cantidad: Number(k.cantidad) }))
    .filter((k) => k.cantidad > 0);
  if (idsLlegaron.length === 0 && kitLlego.length === 0) {
    errores.llegaron =
      guia.kitItems.length > 0
        ? 'Marca al menos un equipo o una cantidad de Kit/EPP que llegó'
        : 'Marca al menos un equipo que llegó';
  }
  exigirSinErroresCampos(errores, ETIQUETAS_GUIA);

  const usuario = quien.email || recibidoPor || 'Sistema';
  return prisma.$transaction(async (tx) => {
    const recibidos = await recibirEquipos(tx, guia, idsLlegaron, usuario);
    if (idsLlegaron.length > 0 && recibidos === 0) {
      throw new NotFoundError('Los equipos marcados no son de este despacho');
    }
    for (const k of kitLlego) await resolverKit(tx, guia, k.lineaId, 'llego', k.cantidad, usuario);
    const unidadesKit = kitLlego.reduce((s, k) => s + k.cantidad, 0);

    await tx.dispatchGuide.update({
      where: { id },
      data: { recibidoPor, fechaRecepcion: fechaRecepcion ? new Date(fechaRecepcion) : new Date() },
    });
    const estado = await actualizarEstadoGuia(tx, id, true);
    await auditLogService.registrarActualizacion(
      'guia_despacho',
      id,
      `Despacho ${guia.numero}: recepción confirmada por ${recibidoPor} (${recibidos} de ${guia.items.length} equipos${
        guia.kitItems.length > 0 ? `, ${unidadesKit} unidad(es) de Kit/EPP` : ''
      })`,
      { estado: guia.estado },
      { estado, recibidoPor, recibidos, unidadesKit },
      quien.email,
      tx
    );
    return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
  });
}

/**
 * Anular un despacho en transito que todavia no se recibe: el paquete no
 * salio, se envio mal o se devolvio. Los equipos vuelven a "Disponible" en la
 * sede de origen; los de un reparto (SPEC 2.111.5) vuelven a "Por repartir" y
 * su Kit/EPP a lo pendiente de la compra, para repartirlo de nuevo: eso lo
 * hace Compras, que es su dueno, con `devolverKitDeReparto` (quien llama la
 * pasa, asi Despachos no depende de Compras).
 */
export async function anularDespacho(
  id: string,
  motivo: unknown,
  quien: Quien,
  devolverKitDeReparto: (tx: Prisma.TransactionClient, guideId: string) => Promise<void>
) {
  const guia = await buscarGuia(id);
  const kitTocado = guia.kitItems.some((k) => k.cantidadRecibida > 0 || k.cantidadPerdida > 0);
  if (guia.estado !== 'en_transito' || guia.items.some((i) => i.estado !== 'en_transito') || kitTocado) {
    throw new ConflictError('Solo se anula un despacho en tránsito que todavía no se recibe');
  }
  const detalle = typeof motivo === 'string' ? motivo.trim() : '';
  if (!detalle) {
    const mensaje = 'Escribe por qué se anula';
    throw new ValidationError(mensaje, [{ field: 'motivo', message: mensaje }]);
  }

  const usuario = quien.email || 'Sistema';
  const estadoVuelta = guia.purchaseId ? 'por_repartir' : 'disponible';
  const textoVuelta = guia.purchaseId ? 'vuelve a Por repartir' : 'vuelve a Disponible';
  return prisma.$transaction(async (tx) => {
    for (const item of guia.items) {
      await cambiarEstado(tx, {
        activo: { id: item.assetId, estado: 'en_transito' },
        a: estadoVuelta,
        historial: {
          tipoEvento: 'traslado',
          descripcion: `Despacho ${guia.numero} anulado: ${textoVuelta} en ${guia.sede?.nombre ?? 'su sede'}. Motivo: ${detalle}`,
          datosAnteriores: { estado: 'en_transito' },
          datosNuevos: { estado: estadoVuelta, guideId: guia.id },
          usuarioSistema: usuario,
        },
      });
    }
    // Kit/EPP del reparto: Compras lo devuelve a lo pendiente de la compra.
    if (guia.purchaseId) await devolverKitDeReparto(tx, guia.id);
    await tx.dispatchGuide.update({
      where: { id },
      data: { estado: 'anulada', fechaAnulacion: new Date(), anuladaPor: quien.nombre || usuario, motivoAnulacion: detalle },
    });
    await auditLogService.registrarActualizacion(
      'guia_despacho',
      id,
      `Despacho ${guia.numero} anulado: ${detalle}`,
      { estado: guia.estado },
      { estado: 'anulada', motivoAnulacion: detalle },
      usuario,
      tx
    );
    return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
  });
}

/**
 * Resolver un equipo del despacho:
 *   "llego"    -> pasa a la sede destino, Disponible (despues de la recepcion)
 *   "perdido"  -> se da de baja por Extravío, como toda baja (SPEC 2.88)
 *   "aparecio" -> uno dado por perdido aparecio: Disponible en la sede destino
 *                 (SPEC 2.111.4; fuera de un despacho la baja es definitiva)
 */
export async function resolverEquipoDespacho(id: string, itemId: string, accion: unknown, motivo: unknown, quien: Quien) {
  const guia = await buscarGuia(id);
  const item = guia.items.find((i) => i.id === itemId);
  if (!item) throw new NotFoundError('Ese equipo no es de este despacho');
  const usuario = quien.email || 'Sistema';
  const nombreEquipo = `${item.asset.marca} ${item.asset.modelo}`;
  const auditar = (tx: Prisma.TransactionClient, texto: string, estado: string) =>
    auditLogService.registrarActualizacion('guia_despacho', id, `Despacho ${guia.numero}: ${texto}`, { estado: guia.estado }, { estado }, usuario, tx);

  if (accion === 'aparecio') {
    if (item.estado !== 'perdido') throw new ConflictError('Ese equipo no está marcado como perdido');
    if (guia.estado === 'anulada') throw new ConflictError('El despacho está anulado');
    const transicion = validateTransition(item.asset.estado, 'disponible', {
      hasActiveAssignment: false,
      hasActiveMaintenance: false,
      aparecioEnDespacho: true,
    });
    if (!transicion.valid) {
      throw new ConflictError(item.asset.estado === 'vendido' ? 'El equipo ya fue vendido' : transicion.errors[0]);
    }
    return prisma.$transaction(async (tx) => {
      await cambiarEstado(tx, {
        activo: { id: item.assetId, estado: 'baja' },
        a: 'disponible',
        contexto: { aparecioEnDespacho: true },
        datos: { sedeId: guia.sedeDestinoId, fechaBaja: null },
        mensajeConflicto: 'El equipo cambió de estado. Vuelve a cargar la página.',
        historial: {
          tipoEvento: 'cambio_estado',
          descripcion: `Apareció: se había dado por perdido en el despacho ${guia.numero}. Queda Disponible en ${guia.sedeDestino.nombre}`,
          datosAnteriores: { estado: 'baja' },
          datosNuevos: { estado: 'disponible', sedeId: guia.sedeDestinoId, guideId: guia.id },
          usuarioSistema: usuario,
        },
      });
      await tx.dispatchGuideItem.update({
        where: { id: itemId },
        data: { estado: 'recibido', fechaResolucion: new Date(), resueltoPor: usuario },
      });
      await auditar(tx, `apareció ${nombreEquipo}`, guia.estado);
      return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
    });
  }

  if (item.estado !== 'en_transito') {
    throw new ConflictError('Ese equipo ya se resolvió: llegó o se marcó como perdido');
  }

  if (accion === 'llego') {
    // Antes de la recepcion se confirma con ella, no uno a uno.
    if (guia.estado !== 'recibida_parcial') throw new ConflictError('Primero confirma la recepción del despacho');
    return prisma.$transaction(async (tx) => {
      await recibirEquipos(tx, guia, [itemId], usuario);
      const estado = await actualizarEstadoGuia(tx, id, true);
      await auditar(tx, `llegó ${nombreEquipo}`, estado);
      return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
    });
  }

  if (accion === 'perdido') {
    if (guia.estado !== 'en_transito' && guia.estado !== 'recibida_parcial') {
      throw new ConflictError('Este despacho ya no tiene equipos por resolver');
    }
    const detalle = typeof motivo === 'string' ? motivo.trim() : '';
    if (!detalle) {
      const mensaje = 'Escribe qué pasó con el equipo';
      throw new ValidationError(mensaje, [{ field: 'motivo', message: mensaje }]);
    }
    // Siempre el motivo "Extravío" de la lista (SPEC 2.116.5), con lo escrito como detalle.
    const { motivoBajaId, motivoTexto } = await motivoParaBaja(prisma, { clave: 'extravio' }, detalle);
    const transicion = validateTransition('en_transito', 'baja', {
      hasActiveAssignment: false,
      hasActiveMaintenance: false,
      motivo: motivoTexto,
    });
    if (!transicion.valid) throw new ConflictError(transicion.errors[0]);

    return prisma.$transaction(async (tx) => {
      const tipo = await tipoCorrectivaPorDefecto(tx);
      if (!tipo) {
        throw new ConflictError('No hay tipos de mantención activos para registrar la baja. Crea uno en Mantenciones > Tipos.');
      }
      const asset = await tx.asset.findUniqueOrThrow({
        where: { id: item.assetId },
        include: {
          maintenances: {
            where: { estado: { in: ['pendiente', 'en_proceso'] } },
            include: { tipo: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      await darDeBajaEnTransaccion(tx, {
        asset,
        tipo,
        motivoBajaId,
        motivoTexto,
        resultado: `Perdido en el despacho (despacho ${guia.numero}): ${detalle}`,
        fechaRealizada: new Date(),
        realizadoPor: quien.nombre || usuario,
        usuario,
        descripcion: `Perdido en el despacho ${guia.numero}`,
      });
      await tx.dispatchGuideItem.update({
        where: { id: itemId },
        data: { estado: 'perdido', fechaResolucion: new Date(), resueltoPor: usuario, observaciones: detalle },
      });
      const estado = await actualizarEstadoGuia(tx, id, guia.estado === 'recibida_parcial');
      await auditar(tx, `${nombreEquipo} se perdió (${detalle})`, estado);
      return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
    });
  }

  throw new ConflictError('Acción desconocida');
}

const ACCIONES_KIT: AccionKit[] = ['llego', 'perdido', 'aparecio'];

/**
 * Resolver unidades de Kit/EPP de un despacho (SPEC 2.111.4), igual que un
 * equipo faltante: "llego" suma stock en la sede destino, "perdido" quedan
 * registradas como perdidas, "aparecio" pasan de perdidas a recibidas.
 */
export async function resolverKitDespacho(
  id: string,
  lineaId: string,
  datos: { accion?: unknown; cantidad?: unknown; motivo?: unknown },
  quien: Quien
) {
  const accion = datos.accion as AccionKit;
  if (!ACCIONES_KIT.includes(accion)) throw new ValidationError('Acción desconocida');
  const guia = await buscarGuia(id);
  if (guia.estado === 'anulada') throw new ConflictError('El despacho está anulado');
  // Antes de la recepcion, lo que llega se confirma con ella, no por linea.
  if (accion === 'llego' && guia.estado !== 'recibida_parcial') {
    throw new ConflictError('Primero confirma la recepción del despacho');
  }
  const detalle = typeof datos.motivo === 'string' ? datos.motivo.trim() : '';
  if (accion === 'perdido' && !detalle) {
    throw new ValidationError('Escribe qué pasó', [{ field: 'motivo', message: 'Escribe qué pasó' }]);
  }

  const usuario = quien.email || 'Sistema';
  const n = Number(datos.cantidad);
  return prisma.$transaction(async (tx) => {
    const { nombre } = await resolverKit(tx, guia, lineaId, accion, n, usuario, detalle);
    const estado = await actualizarEstadoGuia(tx, id, guia.estado !== 'en_transito');
    const que =
      accion === 'llego' ? `llegaron ${n}` : accion === 'perdido' ? `se perdieron ${n} (${detalle})` : `aparecieron ${n}`;
    await auditLogService.registrarActualizacion(
      'guia_despacho',
      id,
      `Despacho ${guia.numero}: ${que} de ${nombre}`,
      { estado: guia.estado },
      { estado },
      usuario,
      tx
    );
    return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
  });
}
