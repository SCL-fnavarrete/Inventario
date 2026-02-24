import type { MicrosoftSyncEmployeeInput } from '@/lib/validations/employee';

// Tipos para respuestas de Microsoft Graph
interface GraphUser {
  id: string;
  displayName: string | null;
  givenName: string | null;
  surname: string | null;
  mail: string | null;
  userPrincipalName: string;
  jobTitle: string | null;
  officeLocation: string | null;
  businessPhones: string[];
  mobilePhone: string | null;
  department: string | null;
  accountEnabled: boolean;
  manager?: { displayName: string | null } | null;
}

interface GraphUsersResponse {
  value: GraphUser[];
  '@odata.nextLink'?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface MicrosoftUserWithStatus extends MicrosoftSyncEmployeeInput {
  accountEnabled: boolean;
}

export interface ConfigurationStatus {
  configured: boolean;
  missing: string[];
}

/**
 * Verifica que las variables de entorno de Microsoft estan configuradas
 */
export function checkConfiguration(): ConfigurationStatus {
  const required = [
    'MICROSOFT_TENANT_ID',
    'MICROSOFT_CLIENT_ID',
    'MICROSOFT_CLIENT_SECRET',
  ] as const;

  const missing = required.filter((key) => !process.env[key]);

  return {
    configured: missing.length === 0,
    missing,
  };
}

/**
 * Obtiene un token OAuth2 usando client credentials flow
 */
async function getAccessToken(): Promise<string> {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Error al obtener token de Microsoft: ${response.status} - ${error}`);
  }

  const data: TokenResponse = await response.json();
  return data.access_token;
}

/**
 * Obtiene todos los usuarios de Microsoft Graph con paginacion
 */
async function fetchAllUsers(accessToken: string): Promise<GraphUser[]> {
  const allUsers: GraphUser[] = [];
  const select =
    'id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,officeLocation,businessPhones,mobilePhone,department,accountEnabled';
  const expand = 'manager($select=displayName)';

  let url: string | null =
    `https://graph.microsoft.com/v1.0/users?$select=${select}&$expand=${expand}&$top=100&$filter=userType eq 'Member'`;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Error al obtener usuarios de Microsoft Graph: ${response.status} - ${error}`);
    }

    const data: GraphUsersResponse = await response.json();

    // Filtrar cuentas de servicio y usuarios sin correo util
    const validUsers = data.value.filter((user) => {
      const email = user.mail || user.userPrincipalName;
      if (!email) return false;
      if (user.userPrincipalName.includes('#EXT#')) return false;
      return true;
    });

    allUsers.push(...validUsers);
    url = data['@odata.nextLink'] || null;
  }

  return allUsers;
}

/**
 * Parsea un nombre completo en nombres, apellido paterno y materno
 */
function parseName(givenName: string | null, surname: string | null, displayName: string | null) {
  if (givenName) {
    return {
      nombres: givenName,
      apellidoPaterno: surname || '(sin apellido)',
      apellidoMaterno: null,
    };
  }

  if (displayName) {
    const tokens = displayName.trim().split(/\s+/);
    if (tokens.length === 1) {
      return { nombres: tokens[0], apellidoPaterno: '(sin apellido)', apellidoMaterno: null };
    }
    if (tokens.length === 2) {
      return { nombres: tokens[0], apellidoPaterno: tokens[1], apellidoMaterno: null };
    }
    return {
      nombres: tokens[0],
      apellidoPaterno: tokens[1],
      apellidoMaterno: tokens.slice(2).join(' '),
    };
  }

  return { nombres: '(sin nombre)', apellidoPaterno: '(sin apellido)', apellidoMaterno: null };
}

/**
 * Transforma un usuario de Microsoft Graph al formato Employee del sistema
 */
function transformUser(graphUser: GraphUser): MicrosoftUserWithStatus {
  const { nombres, apellidoPaterno, apellidoMaterno } = parseName(
    graphUser.givenName,
    graphUser.surname,
    graphUser.displayName
  );

  const managerName =
    graphUser.manager && typeof graphUser.manager === 'object'
      ? graphUser.manager.displayName
      : null;

  return {
    microsoftId: graphUser.id,
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    correo: graphUser.mail || graphUser.userPrincipalName,
    cargo: graphUser.jobTitle || null,
    ubicacion: graphUser.officeLocation || null,
    telefonoContacto: graphUser.businessPhones?.[0] || graphUser.mobilePhone || null,
    jefatura: graphUser.department || null,
    supervisor: managerName || null,
    accountEnabled: graphUser.accountEnabled,
  };
}

/**
 * Ejecuta la sincronizacion completa: obtiene token, lista usuarios, transforma datos
 */
export async function fetchMicrosoftUsers(): Promise<MicrosoftUserWithStatus[]> {
  const token = await getAccessToken();
  const graphUsers = await fetchAllUsers(token);
  return graphUsers.map(transformUser);
}
