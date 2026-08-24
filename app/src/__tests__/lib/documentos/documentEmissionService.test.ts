/** @jest-environment node */

/**
 * Emision staged de documentos inmutables.
 *
 * PostgreSQL y Microsoft Graph no son una transaccion: el hecho de negocio se
 * confirma en la base y el archivo se sube despues. Estas pruebas fijan las
 * dos mitades y, sobre todo, la promesa central de Task 6: **un documento ya
 * emitido no vuelve a construirse desde datos vivos**.
 *
 * El generador se sustituye por uno que serializa el snapshot. No es un atajo:
 * es lo que vuelve decisiva la prueba de inmutabilidad, porque si el servicio
 * consultara la base al recuperar el documento, los bytes cambiarian.
 */

jest.mock('@/lib/services/documentGeneratorService', () => ({
  generarPdfDesdeSnapshot: jest.fn(async (snapshot: unknown) =>
    Buffer.from(`%PDF-fake ${JSON.stringify(snapshot)}`)
  ),
}));
jest.mock('@/lib/services/sharepointService', () => ({
  ...jest.requireActual('@/lib/services/sharepointService'),
  subirDocumento: jest.fn(),
  descargarDocumento: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  archivarDocumento,
  documentoArchivadoDe,
  obtenerDocumento,
  prepararEmision,
  reemitir,
} from '@/lib/services/documentEmissionService';
import { generarPdfDesdeSnapshot } from '@/lib/services/documentGeneratorService';
import { descargarDocumento, subirDocumento } from '@/lib/services/sharepointService';
import { prisma } from '@/lib/prisma';
import { crearDriveFalso, crearStoreDocumentos, sha256 } from '@/test-utils/documentoEmitidoStore';
import { anexoEntregaSnapshot } from '@/test-utils/documentSnapshot';
import { FIRMA_VALIDA } from '@/test-utils/signature';

const EMITIDO_EN = new Date('2026-03-04T12:34:56.000Z');

let store: ReturnType<typeof crearStoreDocumentos>;
let drive: ReturnType<typeof crearDriveFalso>;

function datosAnexo(overrides: Record<string, unknown> = {}) {
  const completo = anexoEntregaSnapshot() as unknown as Record<string, unknown>;
  const datos = { ...completo };
  for (const clave of ['snapshotVersion', 'numero', 'version', 'emitidoEn', 'emitidoPor']) {
    delete datos[clave];
  }
  return { ...datos, ...overrides };
}

async function emitirAnexo(overrides: Record<string, unknown> = {}) {
  return prepararEmision(store as never, {
    contexto: { employeeId: 'employee-1', requestId: 'request-1' },
    emitidoPor: 'Tecnico TI',
    emitidoEn: EMITIDO_EN,
    datos: datosAnexo() as never,
    ...overrides,
  });
}

beforeEach(() => {
  store = crearStoreDocumentos();
  drive = crearDriveFalso();
  Object.assign(prisma as unknown as Record<string, unknown>, {
    documentoEmitido: store.documentoEmitido,
    $queryRaw: store.$queryRaw,
  });
  (subirDocumento as jest.Mock).mockImplementation(drive.subir);
  (descargarDocumento as jest.Mock).mockImplementation(drive.descargar);
  (generarPdfDesdeSnapshot as jest.Mock).mockClear();
});

describe('prepararEmision — dentro de la transaccion de negocio', () => {
  test('crea la evidencia como pendiente, con el hash de los bytes emitidos', async () => {
    const emision = await emitirAnexo();

    const fila = store.filas[0];
    expect(fila.archivoEstado).toBe('pendiente');
    expect(fila.numero).toBe('DOC-2026-0001');
    expect(fila.version).toBe(1);
    expect(fila.hashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fila.hashSha256).toBe(emision.hashSha256);
    expect(fila.sharepointItemId).toBeNull();
  });

  test('no sube nada a SharePoint mientras la transaccion sigue abierta', async () => {
    await emitirAnexo();
    expect(subirDocumento).not.toHaveBeenCalled();
  });

  test('el correlativo es anual y toma el lock antes de leer el maximo', async () => {
    await emitirAnexo();
    await emitirAnexo();
    const deOtroAnio = await emitirAnexo({ emitidoEn: new Date('2027-01-02T00:00:00.000Z') });

    expect(store.filas.map((fila) => fila.numero)).toEqual([
      'DOC-2026-0001',
      'DOC-2026-0002',
      'DOC-2027-0001',
    ]);
    expect(deOtroAnio.numero).toBe('DOC-2027-0001');
    expect(store.locksTomados).toHaveLength(3);
  });

  test('el snapshot guardado lleva la identidad del documento y la aceptacion de politica', async () => {
    await emitirAnexo();

    const snapshot = store.filas[0].contenidoSnapshot as Record<string, unknown>;
    expect(snapshot).toMatchObject({
      snapshotVersion: 1,
      numero: 'DOC-2026-0001',
      version: 1,
      emitidoEn: EMITIDO_EN.toISOString(),
      emitidoPor: 'Tecnico TI',
      aceptaPoliticaUso: true,
    });
    expect((snapshot.firma as { imagenPng: string }).imagenPng).toBe(FIRMA_VALIDA);
  });

  test('la marca de emision es la del servidor, no la que traiga el snapshot de entrada', async () => {
    await emitirAnexo({ datos: datosAnexo({ emitidoEn: '1999-01-01T00:00:00.000Z' }) as never });

    expect(store.filas[0].emitidoEn).toEqual(EMITIDO_EN);
    expect((store.filas[0].contenidoSnapshot as { emitidoEn: string }).emitidoEn).toBe(
      EMITIDO_EN.toISOString()
    );
  });

  test('rechaza un snapshot que no cumple el contrato antes de persistir nada', async () => {
    await expect(
      emitirAnexo({ datos: datosAnexo({ aceptaPoliticaUso: false }) as never })
    ).rejects.toThrow();
    expect(store.filas).toHaveLength(0);
  });
});

describe('archivarDocumento — despues del commit', () => {
  test('sube los bytes emitidos y deja el documento archivado', async () => {
    const emision = await emitirAnexo();

    const resultado = await archivarDocumento(emision.documentoId);

    expect(resultado.archivoEstado).toBe('archivado');
    const fila = store.filas[0];
    expect(fila.archivoEstado).toBe('archivado');
    expect(fila.sharepointItemId).toBe('item-1');
    expect(fila.sharepointUrl).toContain('DOC-2026-0001-v1.pdf');
    expect(fila.archivoError).toBeNull();
    expect(sha256(drive.archivos.get('DOC-2026-0001-v1.pdf') as Buffer)).toBe(fila.hashSha256);
  });

  test('sube los bytes guardados en la emision y no vuelve a renderizar', async () => {
    const emision = await emitirAnexo();
    const bytesEmitidos = store.filas[0].contenidoPdf;
    (generarPdfDesdeSnapshot as jest.Mock).mockClear();

    await archivarDocumento(emision.documentoId);

    expect(generarPdfDesdeSnapshot).not.toHaveBeenCalled();
    const [{ contenido }] = (subirDocumento as jest.Mock).mock.calls[0];
    expect(contenido.equals(bytesEmitidos)).toBe(true);
  });

  test('un cambio de plantilla entre la emision y el reintento no rompe el archivado', async () => {
    // Es el escenario que dejaba la evidencia irrecuperable: el archivo falla,
    // al dia siguiente se despliega un cambio de estilo o se corrige el RUT de
    // la empresa, y el reintento re-renderizado producia otros bytes, no
    // coincidia con su hash y volvia a `fallido` para siempre.
    const emision = await emitirAnexo();
    (subirDocumento as jest.Mock).mockRejectedValueOnce(new Error('SharePoint 503'));
    await archivarDocumento(emision.documentoId);
    expect(store.filas[0].archivoEstado).toBe('fallido');

    // La plantilla de hoy renderiza distinto que la del dia de la emision.
    (generarPdfDesdeSnapshot as jest.Mock).mockImplementation(async () =>
      Buffer.from('%PDF-fake plantilla nueva')
    );

    const resultado = await archivarDocumento(emision.documentoId);

    expect(resultado.archivoEstado).toBe('archivado');
    const [{ contenido }] = (subirDocumento as jest.Mock).mock.calls.at(-1)!;
    expect(sha256(contenido)).toBe(store.filas[0].hashSha256);
  });

  test('un fallo de subida deja el documento fallido, con intento y error saneado', async () => {
    const emision = await emitirAnexo();
    (subirDocumento as jest.Mock).mockRejectedValueOnce(
      new Error('No se pudo archivar el documento en SharePoint: 403 (request-id req-1)')
    );

    const resultado = await archivarDocumento(emision.documentoId);

    expect(resultado.archivoEstado).toBe('fallido');
    const fila = store.filas[0];
    expect(fila.archivoEstado).toBe('fallido');
    expect(fila.intentosArchivo).toBe(1);
    expect(fila.archivoError).toContain('403');
    expect(fila.sharepointItemId).toBeNull();
  });

  test('el reintento archiva el mismo documento sin crear otra evidencia', async () => {
    const emision = await emitirAnexo();
    (subirDocumento as jest.Mock).mockRejectedValueOnce(new Error('Graph caido'));
    await archivarDocumento(emision.documentoId);

    const resultado = await archivarDocumento(emision.documentoId);

    expect(resultado.archivoEstado).toBe('archivado');
    expect(store.filas).toHaveLength(1);
    expect(store.filas[0].intentosArchivo).toBe(2);
    expect(store.filas[0].archivoError).toBeNull();
  });

  test('archivar un documento ya archivado no vuelve a subirlo', async () => {
    const emision = await emitirAnexo();
    await archivarDocumento(emision.documentoId);
    (subirDocumento as jest.Mock).mockClear();

    const resultado = await archivarDocumento(emision.documentoId);

    expect(resultado.archivoEstado).toBe('archivado');
    expect(subirDocumento).not.toHaveBeenCalled();
  });

  test('si los bytes guardados no coinciden con su hash, no sube nada', async () => {
    // Ya no puede pasar por un re-render, pero sigue cubriendo lo que importa:
    // que nunca se archive un PDF que no es el que se hasheo al emitir.
    const emision = await emitirAnexo();
    store.filas[0].contenidoPdf = Buffer.from('otro contenido');

    const resultado = await archivarDocumento(emision.documentoId);

    expect(resultado.archivoEstado).toBe('fallido');
    expect(subirDocumento).not.toHaveBeenCalled();
    expect(store.filas[0].archivoError).toMatch(/hash|integridad/i);
  });
});

describe('obtenerDocumento — la descarga no reconstruye nada', () => {
  test('devuelve los mismos bytes aunque cambien el empleado, la asignacion y la categoria', async () => {
    const emision = await emitirAnexo();
    await archivarDocumento(emision.documentoId);
    const original = await obtenerDocumento(emision.documentoId);

    // El mundo cambia despues de emitir: renombran la categoria, corrigen el
    // nombre del empleado y el equipo se devuelve.
    (generarPdfDesdeSnapshot as jest.Mock).mockClear();
    (generarPdfDesdeSnapshot as jest.Mock).mockImplementation(async () =>
      Buffer.from('%PDF-fake datos-nuevos')
    );

    const recuperado = await obtenerDocumento(emision.documentoId);

    expect(Buffer.compare(recuperado.contenido, original.contenido)).toBe(0);
    expect(sha256(recuperado.contenido)).toBe(store.filas[0].hashSha256);
    expect(generarPdfDesdeSnapshot).not.toHaveBeenCalled();
  });

  test('rechaza el documento cuyo archivo ya no coincide con el hash emitido', async () => {
    const emision = await emitirAnexo();
    await archivarDocumento(emision.documentoId);
    drive.corromper('DOC-2026-0001-v1.pdf');

    await expect(obtenerDocumento(emision.documentoId)).rejects.toThrow(/integridad/i);
  });

  test('un documento que nunca llego a archivarse se declara pendiente, no se genera', async () => {
    const emision = await emitirAnexo();

    await expect(obtenerDocumento(emision.documentoId)).rejects.toThrow(/pendiente/i);
    expect(descargarDocumento).not.toHaveBeenCalled();
  });
});

describe('documentoArchivadoDe — el ultimo archivado de un contexto', () => {
  test('devuelve la version mas alta y ninguna pendiente', async () => {
    const primera = await emitirAnexo();
    await archivarDocumento(primera.documentoId);
    const segunda = await reemitir({
      documentoId: primera.documentoId,
      motivo: 'El nombre del empleado estaba mal escrito en el maestro',
      emitidoPor: 'Admin IT',
      emitidoEn: new Date('2026-03-05T09:00:00.000Z'),
    });

    expect(
      await documentoArchivadoDe({ requestId: 'request-1', tipo: 'anexo_entrega' })
    ).toMatchObject({ version: 1 });

    await archivarDocumento(segunda.documentoId);

    expect(
      await documentoArchivadoDe({ requestId: 'request-1', tipo: 'anexo_entrega' })
    ).toMatchObject({ version: 2 });
  });

  test('devuelve null cuando el contexto nunca emitio ese tipo de documento', async () => {
    expect(
      await documentoArchivadoDe({ requestId: 'request-9', tipo: 'acta_devolucion' })
    ).toBeNull();
  });
});

describe('reemitir — conserva la evidencia anterior', () => {
  test('crea una version nueva con el motivo y no toca la original', async () => {
    const primera = await emitirAnexo();
    await archivarDocumento(primera.documentoId);

    const segunda = await reemitir({
      documentoId: primera.documentoId,
      motivo: 'Reemision solicitada por RRHH',
      emitidoPor: 'Admin IT',
      emitidoEn: new Date('2026-03-05T09:00:00.000Z'),
    });
    await archivarDocumento(segunda.documentoId);

    expect(store.filas).toHaveLength(2);
    expect(store.filas[0]).toMatchObject({
      version: 1,
      archivoEstado: 'archivado',
      motivoReemision: null,
    });
    expect(store.filas[1]).toMatchObject({
      numero: 'DOC-2026-0001',
      version: 2,
      motivoReemision: 'Reemision solicitada por RRHH',
    });
    // El archivo original sigue en el drive, con su propio nombre.
    expect(drive.archivos.has('DOC-2026-0001-v1.pdf')).toBe(true);
    expect(drive.archivos.has('DOC-2026-0001-v2.pdf')).toBe(true);
  });

  test('exige un motivo: una reemision sin razon no es evidencia', async () => {
    const primera = await emitirAnexo();

    await expect(
      reemitir({ documentoId: primera.documentoId, motivo: '   ', emitidoPor: 'Admin IT' })
    ).rejects.toThrow(/motivo/i);
    expect(store.filas).toHaveLength(1);
  });

  test('reproduce el contenido de la version anterior, no los datos actuales', async () => {
    const primera = await emitirAnexo();
    const segunda = await reemitir({
      documentoId: primera.documentoId,
      motivo: 'Se extravio la copia firmada',
      emitidoPor: 'Admin IT',
      emitidoEn: new Date('2026-03-05T09:00:00.000Z'),
    });

    const original = store.filas[0].contenidoSnapshot as Record<string, unknown>;
    const nuevo = store.filas[1].contenidoSnapshot as Record<string, unknown>;
    expect(nuevo.activos).toEqual(original.activos);
    expect(nuevo.empleado).toEqual(original.empleado);
    expect(nuevo.version).toBe(2);
    expect(nuevo.emitidoEn).toBe('2026-03-05T09:00:00.000Z');
    expect(segunda.version).toBe(2);
  });

  test('reproduce los bytes de la version anterior aunque la plantilla haya cambiado', async () => {
    // Una reemision declara reproducir la version anterior. Re-renderizando el
    // snapshot viejo con las plantillas nuevas, la v2 de un anexo de 2026
    // llevaria los montos de reposicion y la razon social vigentes hoy mientras
    // afirma reproducir la v1: un documento legal que miente sobre lo que es.
    const primera = await emitirAnexo();
    const bytesOriginales = store.filas[0].contenidoPdf;

    (generarPdfDesdeSnapshot as jest.Mock).mockImplementation(async () =>
      Buffer.from('%PDF-fake plantilla nueva con otros montos')
    );

    await reemitir({
      documentoId: primera.documentoId,
      motivo: 'Se extravio la copia firmada',
      emitidoPor: 'Admin IT',
      emitidoEn: new Date('2026-03-05T09:00:00.000Z'),
    });

    const v2 = store.filas[1];
    expect(v2.contenidoPdf.equals(bytesOriginales)).toBe(true);
    expect(v2.hashSha256).toBe(store.filas[0].hashSha256);
  });
});
