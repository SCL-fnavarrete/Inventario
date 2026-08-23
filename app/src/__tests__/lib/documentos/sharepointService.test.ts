/** @jest-environment node */

/**
 * El archivo externo es la copia conservable del documento emitido, asi que lo
 * que importa aqui es que suba y baje **los mismos bytes** y que la ruta sea
 * funcion del numero y la version: un reintento tiene que pisar el archivo
 * anterior, no dejar dos copias con nombres distintos.
 */

jest.mock('@/lib/services/graphClient', () => ({
  ...jest.requireActual('@/lib/services/graphClient'),
  graphRequestJson: jest.fn(),
  graphRequestBinary: jest.fn(),
}));

import {
  checkSharepointConfiguration,
  descargarDocumento,
  rutaDeDocumento,
  subirDocumento,
} from '@/lib/services/sharepointService';
import { graphRequestBinary, graphRequestJson } from '@/lib/services/graphClient';

const CONFIG = {
  SHAREPOINT_SITE_ID: 'contoso.sharepoint.com,site-guid,web-guid',
  SHAREPOINT_DRIVE_ID: 'b!drive-guid',
  SHAREPOINT_FOLDER_PATH: 'Evidencia TI/Documentos emitidos',
};

const pedirJson = graphRequestJson as jest.Mock;
const pedirBinario = graphRequestBinary as jest.Mock;

beforeEach(() => {
  Object.assign(process.env, CONFIG);
  pedirJson.mockReset();
  pedirBinario.mockReset();
});

afterEach(() => {
  for (const clave of Object.keys(CONFIG)) delete process.env[clave];
});

describe('checkSharepointConfiguration', () => {
  test('nombra las variables que faltan para poder archivar', () => {
    delete process.env.SHAREPOINT_DRIVE_ID;
    expect(checkSharepointConfiguration()).toEqual({
      configured: false,
      missing: ['SHAREPOINT_DRIVE_ID'],
    });
  });
});

describe('rutaDeDocumento', () => {
  test('la ruta es funcion del numero y la version, para que el reintento pise la misma', () => {
    expect(rutaDeDocumento('DOC-2026-0001', 1)).toBe('DOC-2026-0001-v1.pdf');
    expect(rutaDeDocumento('DOC-2026-0001', 2)).toBe('DOC-2026-0001-v2.pdf');
  });
});

describe('subirDocumento', () => {
  test('sube los bytes exactos como PDF y reemplaza el archivo previo', async () => {
    pedirJson.mockResolvedValue({ id: 'item-1', webUrl: 'https://contoso.sharepoint.com/x.pdf' });
    const contenido = Buffer.from('%PDF-1.3 contenido');

    const resultado = await subirDocumento({ ruta: 'DOC-2026-0001-v1.pdf', contenido });

    expect(resultado).toEqual({
      itemId: 'item-1',
      webUrl: 'https://contoso.sharepoint.com/x.pdf',
    });
    const [url, opciones] = pedirJson.mock.calls[0];
    expect(url).toContain('/drives/b!drive-guid/root:/');
    expect(url).toContain('conflictBehavior=replace');
    expect(opciones.method).toBe('PUT');
    expect(opciones.contentType).toBe('application/pdf');
    expect(Buffer.compare(opciones.body as Buffer, contenido)).toBe(0);
  });

  test('codifica los segmentos de la carpeta en vez de pegarlos crudos en la URL', async () => {
    pedirJson.mockResolvedValue({ id: 'item-1', webUrl: 'https://contoso.sharepoint.com/x.pdf' });

    await subirDocumento({ ruta: 'DOC-2026-0001-v1.pdf', contenido: Buffer.from('x') });

    const [url] = pedirJson.mock.calls[0];
    expect(url).toContain('Evidencia%20TI/Documentos%20emitidos/DOC-2026-0001-v1.pdf');
    expect(url).not.toContain('Evidencia TI');
  });

  test('falla nombrando la configuracion faltante y sin llamar a Graph', async () => {
    delete process.env.SHAREPOINT_SITE_ID;

    await expect(
      subirDocumento({ ruta: 'DOC-2026-0001-v1.pdf', contenido: Buffer.from('x') })
    ).rejects.toThrow(/SHAREPOINT_SITE_ID/);
    expect(pedirJson).not.toHaveBeenCalled();
  });

  test('rechaza una respuesta de Graph sin item id o sin URL utilizable', async () => {
    pedirJson.mockResolvedValue({ id: '', webUrl: 'https://contoso.sharepoint.com/x.pdf' });
    await expect(
      subirDocumento({ ruta: 'DOC-2026-0001-v1.pdf', contenido: Buffer.from('x') })
    ).rejects.toThrow(/identificador/i);

    pedirJson.mockResolvedValue({ id: 'item-1', webUrl: 'no-es-una-url' });
    await expect(
      subirDocumento({ ruta: 'DOC-2026-0001-v1.pdf', contenido: Buffer.from('x') })
    ).rejects.toThrow(/URL/i);
  });

  test('rechaza un archivo mas grande que la subida simple de Graph', async () => {
    const enorme = Buffer.alloc(4 * 1024 * 1024 + 1);

    await expect(
      subirDocumento({ ruta: 'DOC-2026-0001-v1.pdf', contenido: enorme })
    ).rejects.toThrow(/4 MB/);
    expect(pedirJson).not.toHaveBeenCalled();
  });
});

describe('descargarDocumento', () => {
  test('devuelve los bytes exactos del item archivado', async () => {
    const bytes = Buffer.from('%PDF-1.3 archivado');
    pedirBinario.mockResolvedValue(bytes);

    const recibido = await descargarDocumento('item con espacio');

    expect(Buffer.compare(recibido, bytes)).toBe(0);
    const [url] = pedirBinario.mock.calls[0];
    expect(url).toBe(
      'https://graph.microsoft.com/v1.0/drives/b!drive-guid/items/item%20con%20espacio/content'
    );
  });
});
