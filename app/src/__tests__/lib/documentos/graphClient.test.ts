/** @jest-environment node */

/**
 * El cliente Graph es el unico lugar donde el sistema pide un token y llama a
 * Microsoft. Estaba enterrado en el servicio de sincronizacion de empleados,
 * asi que SharePoint y el correo de RRHH lo habrian duplicado: tres caches de
 * token, tres formas de reportar un 401 y tres oportunidades de filtrar el
 * secreto en un log.
 */

import {
  GraphError,
  checkGraphConfiguration,
  getGraphAccessToken,
  graphRequestBinary,
  graphRequestJson,
  resetGraphTokenCache,
} from '@/lib/services/graphClient';

const CONFIG = {
  MICROSOFT_TENANT_ID: 'tenant-de-prueba',
  MICROSOFT_CLIENT_ID: 'client-de-prueba',
  MICROSOFT_CLIENT_SECRET: 'secreto-que-no-debe-salir-nunca',
};

const fetchMock = global.fetch as jest.Mock;

function respuestaToken(expiresIn = 3600, token = 'token-abc') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: token, expires_in: expiresIn, token_type: 'Bearer' }),
    text: async () => '',
    headers: new Headers(),
  };
}

function respuestaJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => '', headers: new Headers() };
}

beforeEach(() => {
  Object.assign(process.env, CONFIG);
  resetGraphTokenCache();
  fetchMock.mockReset();
});

afterEach(() => {
  for (const clave of Object.keys(CONFIG)) delete process.env[clave];
});

describe('checkGraphConfiguration', () => {
  test('nombra exactamente las variables que faltan', () => {
    delete process.env.MICROSOFT_CLIENT_SECRET;
    expect(checkGraphConfiguration()).toEqual({
      configured: false,
      missing: ['MICROSOFT_CLIENT_SECRET'],
    });
  });

  test('reconoce la configuracion completa', () => {
    expect(checkGraphConfiguration()).toEqual({ configured: true, missing: [] });
  });
});

describe('getGraphAccessToken', () => {
  test('reutiliza el token vigente en vez de pedir uno por llamada', async () => {
    fetchMock.mockResolvedValue(respuestaToken());

    await getGraphAccessToken();
    await getGraphAccessToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('renueva el token cuando esta dentro del margen de expiracion', async () => {
    fetchMock
      .mockResolvedValueOnce(respuestaToken(60, 'token-corto'))
      .mockResolvedValueOnce(respuestaToken(3600, 'token-nuevo'));

    const primero = await getGraphAccessToken();
    const segundo = await getGraphAccessToken();

    expect(primero).toBe('token-corto');
    expect(segundo).toBe('token-nuevo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('falla con las variables faltantes antes de llamar a Microsoft', async () => {
    delete process.env.MICROSOFT_TENANT_ID;

    await expect(getGraphAccessToken()).rejects.toThrow(/MICROSOFT_TENANT_ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('nunca deja el secreto ni el cuerpo del error en el mensaje', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => `AADSTS7000215: Invalid client secret ${CONFIG.MICROSOFT_CLIENT_SECRET}`,
      json: async () => ({}),
      headers: new Headers(),
    });

    const error = await getGraphAccessToken().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphError);
    const texto = `${(error as GraphError).message} ${JSON.stringify(error)}`;
    expect(texto).not.toContain(CONFIG.MICROSOFT_CLIENT_SECRET);
    expect(texto).not.toContain('AADSTS7000215');
    expect((error as GraphError).status).toBe(401);
  });
});

describe('graphRequestJson', () => {
  test('adjunta el bearer y aborta si Graph no responde a tiempo', async () => {
    fetchMock.mockResolvedValueOnce(respuestaToken()).mockResolvedValueOnce(respuestaJson({ value: [] }));

    await graphRequestJson('https://graph.microsoft.com/v1.0/users');

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://graph.microsoft.com/v1.0/users');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test('traduce un fallo de Graph sin volcar el cuerpo ni el token', async () => {
    fetchMock.mockResolvedValueOnce(respuestaToken()).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => '{"error":{"message":"Access denied for token token-abc"}}',
      json: async () => ({}),
      headers: new Headers({ 'request-id': 'req-77' }),
    });

    const error = await graphRequestJson('https://graph.microsoft.com/v1.0/users').catch((e) => e);

    expect(error).toBeInstanceOf(GraphError);
    expect((error as GraphError).status).toBe(403);
    expect((error as GraphError).message).not.toContain('token-abc');
    // El id de correlacion sirve para pedirle el detalle a Microsoft y no revela nada.
    expect((error as GraphError).message).toContain('req-77');
  });
});

describe('graphRequestBinary', () => {
  test('devuelve los bytes exactos que entrego Graph', async () => {
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
    fetchMock.mockResolvedValueOnce(respuestaToken()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      text: async () => '',
      headers: new Headers(),
    });

    const recibido = await graphRequestBinary('https://graph.microsoft.com/v1.0/drives/x/items/y/content');

    expect(Buffer.compare(recibido, bytes)).toBe(0);
  });
});
