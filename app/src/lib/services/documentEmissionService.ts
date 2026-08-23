import { createHash } from 'crypto';
import { Prisma, type EstadoArchivoDocumento, type TipoDocumento } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ServiceConflictError, ServiceNotFoundError } from '@/lib/errors/serviceOperationError';
import { generarPdfDesdeSnapshot } from '@/lib/services/documentGeneratorService';
import {
  descargarDocumento,
  rutaDeDocumento,
  subirDocumento,
} from '@/lib/services/sharepointService';
import {
  SNAPSHOT_VERSION,
  documentoSnapshotSchema,
  parseDocumentoSnapshot,
  type DocumentoSnapshot,
} from '@/lib/documents/snapshot';

type PrismaTx = Prisma.TransactionClient;

/**
 * Emision de documentos inmutables en dos etapas.
 *
 * PostgreSQL y Microsoft Graph no comparten transaccion. Si la subida a
 * SharePoint viviera dentro del `$transaction` del hecho de negocio, un Graph
 * caido revertiria una entrega que ya ocurrio fisicamente; y si viviera fuera
 * sin dejar rastro, nadie sabria que falto archivar. De ahi las dos etapas
 * (SPEC 2.1 sexies):
 *
 *  1. `prepararEmision` corre **dentro** de la transaccion: numera, arma el
 *     snapshot, renderiza el PDF, calcula su SHA-256 y crea la fila como
 *     `pendiente`. Si el negocio se revierte, la evidencia se revierte con el.
 *  2. `archivarDocumento` corre **despues del commit**: re-renderiza desde el
 *     snapshot guardado, verifica que el hash siga siendo el mismo y sube los
 *     bytes. El resultado se anota como `archivado` o `fallido` con su error
 *     saneado y su contador de intentos; reintentar es idempotente.
 *
 * Nada de esto reconstruye un documento desde datos vivos. `obtenerDocumento`
 * descarga los bytes archivados y verifica el hash: si el archivo cambio, el
 * sistema lo dice en vez de entregar algo que no es lo que se firmo.
 */

/** El PDF se renderiza dentro de la transaccion; el default de 5 s no alcanza. */
export const TIMEOUT_TRANSACCION_EMISION_MS = 25_000;

/** Quita del snapshot los campos que solo el servidor puede fijar. */
type SinIdentidad<T> = T extends unknown
  ? Omit<T, 'snapshotVersion' | 'numero' | 'version' | 'emitidoEn' | 'emitidoPor'>
  : never;

export type DatosSnapshot = SinIdentidad<DocumentoSnapshot>;

export type ContextoEmision = {
  employeeId: string;
  requestId?: string | null;
  assignmentId?: string | null;
  terminationId?: string | null;
};

export type EmisionPreparada = {
  documentoId: string;
  numero: string;
  version: number;
  tipo: TipoDocumento;
  hashSha256: string;
};

export type ResultadoArchivo = {
  documentoId: string;
  archivoEstado: EstadoArchivoDocumento;
  sharepointUrl: string | null;
  error: string | null;
};

function hashDe(contenido: Buffer): string {
  return createHash('sha256').update(contenido).digest('hex');
}

/**
 * Reserva el siguiente correlativo del anio.
 *
 * `count() + 1` es una condicion de carrera: dos transiciones simultaneas leen
 * el mismo total y la segunda choca con el unique `(numero, version)` —o peor,
 * lo esquiva y numera dos documentos igual. El lock de aviso de PostgreSQL se
 * toma dentro de la transaccion y se libera al confirmarla, asi que la lectura
 * del maximo y el insert quedan serializados sin bloquear la tabla entera.
 */
async function asignarNumero(tx: PrismaTx, emitidoEn: Date): Promise<string> {
  const anio = emitidoEn.getUTCFullYear();
  const clave = `documentos_emitidos_${anio}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`;

  const filas = await tx.$queryRaw<Array<{ max: number | bigint | null }>>`
    SELECT MAX(CAST(SPLIT_PART("numero", '-', 3) AS INTEGER)) AS max
    FROM "documentos_emitidos"
    WHERE "numero" LIKE ${`DOC-${anio}-%`}
  `;

  const maximo = Number(filas[0]?.max ?? 0);
  return `DOC-${anio}-${String(maximo + 1).padStart(4, '0')}`;
}

async function crearEvidencia(
  tx: PrismaTx,
  params: {
    snapshot: DocumentoSnapshot;
    contexto: ContextoEmision;
    emitidoEn: Date;
    motivoReemision?: string | null;
  }
): Promise<EmisionPreparada> {
  const snapshot = documentoSnapshotSchema.parse(params.snapshot);
  const pdf = await generarPdfDesdeSnapshot(snapshot);
  const hashSha256 = hashDe(pdf);

  const documento = await tx.documentoEmitido.create({
    data: {
      numero: snapshot.numero,
      tipo: snapshot.tipo,
      version: snapshot.version,
      contenidoSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      hashSha256,
      archivoEstado: 'pendiente',
      emitidoPor: snapshot.emitidoPor,
      emitidoEn: params.emitidoEn,
      firmaEmpleado: snapshot.firma.imagenPng,
      firmaEmpleadoEn: snapshot.firma.firmadaEn ? new Date(snapshot.firma.firmadaEn) : null,
      motivoReemision: params.motivoReemision ?? null,
      employeeId: params.contexto.employeeId,
      requestId: params.contexto.requestId ?? null,
      assignmentId: params.contexto.assignmentId ?? null,
      terminationId: params.contexto.terminationId ?? null,
    },
  });

  return {
    documentoId: documento.id,
    numero: snapshot.numero,
    version: snapshot.version,
    tipo: snapshot.tipo,
    hashSha256,
  };
}

/**
 * Crea la evidencia dentro de la transaccion del hecho de negocio.
 *
 * `emitidoEn` y `emitidoPor` los pone quien llama con datos del servidor: lo
 * que traiga `datos` sobre esos campos se descarta.
 */
export async function prepararEmision(
  tx: PrismaTx,
  params: {
    contexto: ContextoEmision;
    emitidoPor: string;
    emitidoEn: Date;
    datos: DatosSnapshot;
  }
): Promise<EmisionPreparada> {
  const numero = await asignarNumero(tx, params.emitidoEn);
  const snapshot = {
    ...(params.datos as Record<string, unknown>),
    snapshotVersion: SNAPSHOT_VERSION,
    numero,
    version: 1,
    emitidoEn: params.emitidoEn.toISOString(),
    emitidoPor: params.emitidoPor,
  } as DocumentoSnapshot;

  return crearEvidencia(tx, {
    snapshot,
    contexto: params.contexto,
    emitidoEn: params.emitidoEn,
  });
}

/**
 * Reemite un documento como version nueva.
 *
 * Reproduce el contenido de la version anterior: una reemision existe porque
 * se extravio la copia o porque hay que volver a entregarla, no para cambiar
 * lo que el documento dijo. Lo unico que cambia es la identidad (version,
 * fecha, emisor) y el motivo, que es obligatorio.
 */
export async function reemitir(params: {
  documentoId: string;
  motivo: string;
  emitidoPor: string;
  emitidoEn?: Date;
}): Promise<EmisionPreparada> {
  const motivo = params.motivo.trim();
  if (!motivo) {
    throw new ServiceConflictError('La reemision requiere un motivo: sin razon no es evidencia');
  }

  const original = await prisma.documentoEmitido.findUnique({ where: { id: params.documentoId } });
  if (!original) throw new ServiceNotFoundError('Documento emitido no encontrado');

  const emitidoEn = params.emitidoEn ?? new Date();
  const snapshotOriginal = parseDocumentoSnapshot(original.contenidoSnapshot);
  const snapshot = {
    ...snapshotOriginal,
    version: original.version + 1,
    emitidoEn: emitidoEn.toISOString(),
    emitidoPor: params.emitidoPor,
  } as DocumentoSnapshot;

  return crearEvidencia(prisma as unknown as PrismaTx, {
    snapshot,
    contexto: {
      employeeId: original.employeeId,
      requestId: original.requestId,
      assignmentId: original.assignmentId,
      terminationId: original.terminationId,
    },
    emitidoEn,
    motivoReemision: motivo,
  });
}

/** El error que se guarda es el mensaje, nunca el objeto ni el cuerpo de Graph. */
function errorSaneado(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : 'Error desconocido al archivar';
  return mensaje.slice(0, 500);
}

async function anotarFallo(documentoId: string, intentos: number, error: unknown) {
  await prisma.documentoEmitido.update({
    where: { id: documentoId },
    data: {
      archivoEstado: 'fallido',
      archivoError: errorSaneado(error),
      intentosArchivo: intentos,
    },
  });
}

/**
 * Sube el documento a SharePoint. Se llama **despues** del commit del hecho de
 * negocio y nunca lanza: un fallo de archivo no puede tumbar la respuesta de
 * una entrega que ya ocurrio. Deja el estado para que alguien reintente.
 */
export async function archivarDocumento(documentoId: string): Promise<ResultadoArchivo> {
  const documento = await prisma.documentoEmitido.findUnique({ where: { id: documentoId } });
  if (!documento) throw new ServiceNotFoundError('Documento emitido no encontrado');

  if (documento.archivoEstado === 'archivado' && documento.sharepointItemId) {
    return {
      documentoId,
      archivoEstado: 'archivado',
      sharepointUrl: documento.sharepointUrl,
      error: null,
    };
  }

  const intentos = documento.intentosArchivo + 1;

  try {
    const snapshot = parseDocumentoSnapshot(documento.contenidoSnapshot);
    const pdf = await generarPdfDesdeSnapshot(snapshot);

    // El reintento re-renderiza, asi que hay que probar que produjo lo mismo
    // que se hasheo al emitir. Subir bytes distintos del hash almacenado
    // dejaria un archivo que despues ninguna verificacion aceptaria.
    const hash = hashDe(pdf);
    if (hash !== documento.hashSha256) {
      throw new Error(
        `Integridad rota: el PDF regenerado no coincide con el hash emitido (${documento.hashSha256.slice(0, 12)}…)`
      );
    }

    const archivado = await subirDocumento({
      ruta: rutaDeDocumento(documento.numero, documento.version),
      contenido: pdf,
    });

    await prisma.documentoEmitido.update({
      where: { id: documentoId },
      data: {
        archivoEstado: 'archivado',
        sharepointItemId: archivado.itemId,
        sharepointUrl: archivado.webUrl,
        archivoError: null,
        intentosArchivo: intentos,
      },
    });

    return {
      documentoId,
      archivoEstado: 'archivado',
      sharepointUrl: archivado.webUrl,
      error: null,
    };
  } catch (error) {
    await anotarFallo(documentoId, intentos, error);
    return {
      documentoId,
      archivoEstado: 'fallido',
      sharepointUrl: null,
      error: errorSaneado(error),
    };
  }
}

/** Archiva varias emisiones sin que el fallo de una detenga a las demas. */
export async function archivarEmisiones(
  emisiones: Array<{ documentoId: string }>
): Promise<ResultadoArchivo[]> {
  const resultados: ResultadoArchivo[] = [];
  for (const emision of emisiones) {
    resultados.push(await archivarDocumento(emision.documentoId));
  }
  return resultados;
}

export type DocumentoRecuperado = {
  contenido: Buffer;
  numero: string;
  version: number;
  tipo: TipoDocumento;
  emitidoEn: Date;
};

/**
 * Descarga el documento archivado y verifica su hash.
 *
 * No hay ruta de regeneracion aqui a proposito. Si el archivo no esta o no
 * coincide, la respuesta correcta es decirlo: entregar un PDF reconstruido
 * seria presentar como evidencia algo que nadie firmo.
 */
export async function obtenerDocumento(documentoId: string): Promise<DocumentoRecuperado> {
  const documento = await prisma.documentoEmitido.findUnique({ where: { id: documentoId } });
  if (!documento) throw new ServiceNotFoundError('Documento emitido no encontrado');

  if (documento.archivoEstado === 'pendiente' || !documento.sharepointItemId) {
    throw new ServiceConflictError(
      `El documento ${documento.numero} v${documento.version} está pendiente de archivo y todavía no puede descargarse`
    );
  }
  if (documento.archivoEstado === 'fallido') {
    throw new ServiceConflictError(
      `El archivo del documento ${documento.numero} v${documento.version} falló y debe reintentarse antes de descargarlo`
    );
  }

  const contenido = await descargarDocumento(documento.sharepointItemId);
  if (hashDe(contenido) !== documento.hashSha256) {
    throw new ServiceConflictError(
      `Integridad comprometida: el archivo de ${documento.numero} v${documento.version} no coincide con el hash emitido`
    );
  }

  return {
    contenido,
    numero: documento.numero,
    version: documento.version,
    tipo: documento.tipo,
    emitidoEn: documento.emitidoEn,
  };
}

export type ContextoBusqueda = {
  tipo: TipoDocumento;
  requestId?: string | null;
  assignmentId?: string | null;
  terminationId?: string | null;
  employeeId?: string | null;
};

function whereDeContexto(contexto: ContextoBusqueda) {
  const where: Record<string, unknown> = { tipo: contexto.tipo };
  if (contexto.requestId) where.requestId = contexto.requestId;
  if (contexto.assignmentId) where.assignmentId = contexto.assignmentId;
  if (contexto.terminationId) where.terminationId = contexto.terminationId;
  if (contexto.employeeId) where.employeeId = contexto.employeeId;
  return where;
}

/** Ultima version archivada de un tipo de documento para un contexto. */
export async function documentoArchivadoDe(contexto: ContextoBusqueda) {
  return prisma.documentoEmitido.findFirst({
    where: { ...whereDeContexto(contexto), archivoEstado: 'archivado' },
    orderBy: { version: 'desc' },
  });
}

/** Ultimo documento de un contexto, archivado o no: sirve para reintentar. */
export async function ultimoDocumentoDe(contexto: ContextoBusqueda) {
  return prisma.documentoEmitido.findFirst({
    where: whereDeContexto(contexto),
    orderBy: { version: 'desc' },
  });
}

/**
 * Documento archivado que respalda una asignacion concreta.
 *
 * Un acta puede cubrir varias asignaciones a la vez (una entrega de notebook y
 * celular es un solo anexo), asi que `DocumentoEmitido.assignmentId` solo se
 * llena cuando el acto tuvo una. La busqueda se hace por empleado y tipo y se
 * confirma leyendo el snapshot: es el snapshot el que dice, sin ambiguedad,
 * que asignaciones participaron del acto.
 */
export async function documentoArchivadoDeAsignacion(params: {
  assignmentId: string;
  employeeId: string;
  tipos: TipoDocumento[];
}) {
  const candidatos = await prisma.documentoEmitido.findMany({
    where: {
      employeeId: params.employeeId,
      tipo: { in: params.tipos },
      archivoEstado: 'archivado',
    },
    orderBy: [{ emitidoEn: 'desc' }, { version: 'desc' }],
  });

  return (
    candidatos.find((documento) =>
      mencionaAsignacion(documento.contenidoSnapshot, params.assignmentId)
    ) ?? null
  );
}

function mencionaAsignacion(contenidoSnapshot: unknown, assignmentId: string): boolean {
  const snapshot = documentoSnapshotSchema.safeParse(contenidoSnapshot);
  if (!snapshot.success) return false;
  const datos = snapshot.data;

  if (datos.tipo === 'comprobante_cambio') {
    return (
      datos.equipoAnterior?.assignmentId === assignmentId ||
      datos.equipoNuevo?.assignmentId === assignmentId
    );
  }
  return datos.activos.some((activo) => activo.assignmentId === assignmentId);
}
