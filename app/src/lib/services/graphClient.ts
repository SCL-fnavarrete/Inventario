/**
 * Cliente unico de Microsoft Graph.
 *
 * Estaba dentro del servicio de sincronizacion de empleados. SharePoint (Ola 2)
 * y el correo de RRHH (Ola 3) lo habrian duplicado: tres caches de token, tres
 * traducciones distintas de un 401 y tres oportunidades de dejar el secreto en
 * un log.
 *
 * Reglas que este modulo hace cumplir:
 *  - el token se pide una vez y se reutiliza hasta el margen de expiracion;
 *  - toda peticion tiene limite de tiempo, para que un Graph lento no cuelgue
 *    una ruta de la aplicacion;
 *  - un error jamas lleva el token, el secreto ni el cuerpo de la respuesta.
 *    Lleva el codigo HTTP y el `request-id`, que es lo que Microsoft pide para
 *    investigar y no revela nada.
 */

const VARIABLES_REQUERIDAS = [
  'MICROSOFT_TENANT_ID',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
] as const;

/** Se renueva el token con dos minutos de anticipacion: evita usarlo justo al vencer. */
const MARGEN_EXPIRACION_MS = 120_000;
const TIMEOUT_MS = 30_000;

export class GraphError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

export interface GraphConfigurationStatus {
  configured: boolean;
  missing: string[];
}

export function checkGraphConfiguration(): GraphConfigurationStatus {
  const missing = VARIABLES_REQUERIDAS.filter((clave) => !process.env[clave]);
  return { configured: missing.length === 0, missing: [...missing] };
}

let tokenCacheado: { valor: string; expiraEn: number } | null = null;

/** Unicamente para las pruebas: el cache es de proceso y sobrevive entre casos. */
export function resetGraphTokenCache(): void {
  tokenCacheado = null;
}

const MOTIVOS: Record<number, string> = {
  400: 'Microsoft Graph rechazo la peticion por invalida',
  401: 'Microsoft Graph rechazo las credenciales de la aplicacion',
  403: 'La aplicacion no tiene el permiso Graph necesario',
  404: 'El recurso solicitado no existe en Microsoft Graph',
  429: 'Microsoft Graph esta limitando las peticiones (throttling)',
};

/**
 * Construye el error sin tocar el cuerpo de la respuesta.
 *
 * Volcar el cuerpo es lo que filtraba secretos: AAD devuelve el client secret
 * dentro del mensaje `AADSTS7000215` cuando esta mal configurado.
 */
function errorDeGraph(operacion: string, status: number, requestId: string | null): GraphError {
  const motivo = MOTIVOS[status] || `Microsoft Graph respondio ${status}`;
  const correlacion = requestId ? ` (request-id ${requestId})` : '';
  return new GraphError(`${operacion}: ${motivo}${correlacion}`, status);
}

function requireConfiguration(): { tenantId: string; clientId: string; clientSecret: string } {
  const { configured, missing } = checkGraphConfiguration();
  if (!configured) {
    throw new GraphError(
      `Integracion con Microsoft sin configurar. Falta definir: ${missing.join(', ')}`
    );
  }
  return {
    tenantId: process.env.MICROSOFT_TENANT_ID as string,
    clientId: process.env.MICROSOFT_CLIENT_ID as string,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
  };
}

async function fetchAcotado(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

export async function getGraphAccessToken(): Promise<string> {
  if (tokenCacheado && tokenCacheado.expiraEn > Date.now()) return tokenCacheado.valor;

  const { tenantId, clientId, clientSecret } = requireConfiguration();
  const response = await fetchAcotado(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );

  if (!response.ok) {
    throw errorDeGraph(
      'No se pudo obtener el token de Microsoft',
      response.status,
      response.headers?.get('request-id') ?? null
    );
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  const vidaMs = Math.max(0, Number(data.expires_in) * 1000 - MARGEN_EXPIRACION_MS);
  tokenCacheado = { valor: data.access_token, expiraEn: Date.now() + vidaMs };
  return data.access_token;
}

type OpcionesGraph = {
  method?: string;
  body?: BodyInit;
  contentType?: string;
  operacion?: string;
};

async function graphFetch(url: string, opciones: OpcionesGraph): Promise<Response> {
  const token = await getGraphAccessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (opciones.contentType) headers['Content-Type'] = opciones.contentType;

  const response = await fetchAcotado(url, {
    method: opciones.method || 'GET',
    headers,
    ...(opciones.body !== undefined && { body: opciones.body }),
  });

  if (!response.ok) {
    throw errorDeGraph(
      opciones.operacion || 'Error en la peticion a Microsoft Graph',
      response.status,
      response.headers?.get('request-id') ?? null
    );
  }
  return response;
}

export async function graphRequestJson<T>(url: string, opciones: OpcionesGraph = {}): Promise<T> {
  const response = await graphFetch(url, opciones);
  return (await response.json()) as T;
}

/**
 * Peticion cuyo exito es el codigo, no el cuerpo.
 *
 * `sendMail` responde `202 Accepted` con el cuerpo vacio. Pedirle `.json()` a
 * una respuesta sin cuerpo lanza, y el aviso quedaba marcado como fallido justo
 * cuando Graph lo habia aceptado: el correo salia y el sistema decia que no.
 */
export async function graphRequestAceptado(
  url: string,
  opciones: OpcionesGraph = {}
): Promise<number> {
  const response = await graphFetch(url, opciones);
  return response.status;
}

export async function graphRequestBinary(
  url: string,
  opciones: OpcionesGraph = {}
): Promise<Buffer> {
  const response = await graphFetch(url, opciones);
  return Buffer.from(await response.arrayBuffer());
}
