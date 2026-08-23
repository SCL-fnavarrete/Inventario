import type { MicrosoftSyncEmployeeInput } from '@/lib/validations/employee';
import {
  checkGraphConfiguration,
  graphRequestJson,
  type GraphConfigurationStatus,
} from '@/lib/services/graphClient';

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

export interface MicrosoftUserWithStatus extends MicrosoftSyncEmployeeInput {
  accountEnabled: boolean;
}

/** Se conserva el nombre que ya consumen las rutas de sincronizacion. */
export type ConfigurationStatus = GraphConfigurationStatus;

/**
 * Verifica que las variables de entorno de Microsoft estan configuradas.
 *
 * La lista vive en `graphClient`: SharePoint y el correo de RRHH usan las
 * mismas credenciales, y tener dos listas era garantia de que una se quedara
 * atras.
 */
export function checkConfiguration(): ConfigurationStatus {
  return checkGraphConfiguration();
}

/**
 * Obtiene todos los usuarios de Microsoft Graph con paginacion
 */
async function fetchAllUsers(): Promise<GraphUser[]> {
  const allUsers: GraphUser[] = [];
  const select =
    'id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,officeLocation,businessPhones,mobilePhone,department,accountEnabled';
  const expand = 'manager($select=displayName)';

  let url: string | null =
    `https://graph.microsoft.com/v1.0/users?$select=${select}&$expand=${expand}&$top=100&$filter=userType eq 'Member'`;

  while (url) {
    const data: GraphUsersResponse = await graphRequestJson<GraphUsersResponse>(url, {
      operacion: 'Error al obtener usuarios de Microsoft Graph',
    });

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
  const graphUsers = await fetchAllUsers();
  return graphUsers.map(transformUser);
}
