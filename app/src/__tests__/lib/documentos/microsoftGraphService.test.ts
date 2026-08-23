/** @jest-environment node */

/**
 * Red de seguridad del refactor: la sincronizacion de empleados pasa a usar
 * `graphClient` y su comportamiento observable no cambia.
 *
 * Los casos de paginacion, filtrado y transformacion son de caracterizacion:
 * pasaban antes del refactor y deben seguir pasando. El caso del error
 * saneado no pasaba: el servicio metia el cuerpo crudo de la respuesta de
 * Graph en el mensaje, y ese cuerpo puede traer identificadores del tenant.
 */

import { fetchMicrosoftUsers, checkConfiguration } from '@/lib/services/microsoftGraphService';
import { resetGraphTokenCache } from '@/lib/services/graphClient';

const fetchMock = global.fetch as jest.Mock;

function usuarioGraph(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ms-1',
    displayName: 'Ada Lovelace King',
    givenName: null,
    surname: null,
    mail: 'ada@sclconsultores.com',
    userPrincipalName: 'ada@sclconsultores.com',
    jobTitle: 'Ingeniera',
    officeLocation: 'Santiago',
    businessPhones: ['+56911111111'],
    mobilePhone: null,
    department: 'TI',
    accountEnabled: true,
    manager: { displayName: 'Charles Babbage' },
    ...overrides,
  };
}

function respuesta(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => '', headers: new Headers() };
}

const TOKEN = {
  ok: true,
  status: 200,
  json: async () => ({ access_token: 'token-abc', expires_in: 3600, token_type: 'Bearer' }),
  text: async () => '',
  headers: new Headers(),
};

beforeEach(() => {
  process.env.MICROSOFT_TENANT_ID = 'tenant';
  process.env.MICROSOFT_CLIENT_ID = 'client';
  process.env.MICROSOFT_CLIENT_SECRET = 'secreto-del-tenant';
  resetGraphTokenCache();
  fetchMock.mockReset();
});

afterEach(() => {
  delete process.env.MICROSOFT_TENANT_ID;
  delete process.env.MICROSOFT_CLIENT_ID;
  delete process.env.MICROSOFT_CLIENT_SECRET;
});

describe('fetchMicrosoftUsers', () => {
  test('recorre todas las paginas con un solo token', async () => {
    fetchMock
      .mockResolvedValueOnce(TOKEN)
      .mockResolvedValueOnce(
        respuesta({
          value: [usuarioGraph()],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skiptoken=2',
        })
      )
      .mockResolvedValueOnce(
        respuesta({ value: [usuarioGraph({ id: 'ms-2', mail: 'grace@sclconsultores.com' })] })
      );

    const usuarios = await fetchMicrosoftUsers();

    expect(usuarios.map((u) => u.microsoftId)).toEqual(['ms-1', 'ms-2']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('descarta invitados externos y cuentas sin correo utilizable', async () => {
    fetchMock.mockResolvedValueOnce(TOKEN).mockResolvedValueOnce(
      respuesta({
        value: [
          usuarioGraph(),
          usuarioGraph({ id: 'ms-ext', userPrincipalName: 'x_gmail.com#EXT#@scl.onmicrosoft.com' }),
          usuarioGraph({ id: 'ms-sin', mail: null, userPrincipalName: '' }),
        ],
      })
    );

    const usuarios = await fetchMicrosoftUsers();

    expect(usuarios.map((u) => u.microsoftId)).toEqual(['ms-1']);
  });

  test('parte el displayName cuando Microsoft no entrega nombre y apellido', async () => {
    fetchMock.mockResolvedValueOnce(TOKEN).mockResolvedValueOnce(respuesta({ value: [usuarioGraph()] }));

    const [usuario] = await fetchMicrosoftUsers();

    expect(usuario).toMatchObject({
      nombres: 'Ada',
      apellidoPaterno: 'Lovelace',
      apellidoMaterno: 'King',
      correo: 'ada@sclconsultores.com',
      cargo: 'Ingeniera',
      jefatura: 'TI',
      supervisor: 'Charles Babbage',
      accountEnabled: true,
    });
  });

  test('un fallo de Graph no vuelca el cuerpo de la respuesta en el mensaje', async () => {
    fetchMock.mockResolvedValueOnce(TOKEN).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => '{"error":{"message":"Insufficient privileges","innerError":{"tenant":"tenant"}}}',
      json: async () => ({}),
      headers: new Headers({ 'request-id': 'req-9' }),
    });

    const error = await fetchMicrosoftUsers().catch((e: Error) => e);

    expect((error as Error).message).not.toContain('Insufficient privileges');
    expect((error as Error).message).toContain('req-9');
  });
});

describe('checkConfiguration', () => {
  test('sigue siendo el contrato que consume la ruta de sincronizacion', () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    expect(checkConfiguration()).toEqual({ configured: false, missing: ['MICROSOFT_CLIENT_ID'] });
  });
});
