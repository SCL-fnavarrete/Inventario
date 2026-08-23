import { GraphError, graphRequestBinary, graphRequestJson } from '@/lib/services/graphClient';

/**
 * Archivo externo de los documentos emitidos, sobre SharePoint via Graph.
 *
 * Solo mueve bytes: no sabe que es un acta ni cuando emitirla. Esa decision es
 * de `documentEmissionService`, que ademas verifica el hash antes de subir y
 * despues de bajar. Aqui la unica garantia es "los mismos bytes, en una ruta
 * que es funcion del numero y la version".
 *
 * Permisos de aplicacion posibles en Entra ID: `Sites.ReadWrite.All` (acceso a
 * todos los sitios) o, preferible, `Sites.Selected` con el sitio de evidencia
 * autorizado explicitamente.
 */

const VARIABLES_REQUERIDAS = [
  'SHAREPOINT_SITE_ID',
  'SHAREPOINT_DRIVE_ID',
  'SHAREPOINT_FOLDER_PATH',
] as const;

/** Limite de la subida simple de Graph (`PUT .../content`). */
const LIMITE_SUBIDA_SIMPLE = 4 * 1024 * 1024;

const GRAPH = 'https://graph.microsoft.com/v1.0';

export interface SharepointConfigurationStatus {
  configured: boolean;
  missing: string[];
}

export function checkSharepointConfiguration(): SharepointConfigurationStatus {
  const missing = VARIABLES_REQUERIDAS.filter((clave) => !process.env[clave]);
  return { configured: missing.length === 0, missing: [...missing] };
}

function requireConfiguration() {
  const { configured, missing } = checkSharepointConfiguration();
  if (!configured) {
    throw new GraphError(
      `Archivo en SharePoint sin configurar. Falta definir: ${missing.join(', ')}`
    );
  }
  return {
    driveId: process.env.SHAREPOINT_DRIVE_ID as string,
    carpeta: process.env.SHAREPOINT_FOLDER_PATH as string,
  };
}

/**
 * Nombre del archivo dentro de la carpeta configurada.
 *
 * Es deterministico a proposito: un reintento de archivado sube a la misma
 * ruta con `conflictBehavior=replace` en vez de dejar `DOC-2026-0001 (1).pdf`
 * junto al original y volver ambiguo cual es la evidencia.
 */
export function rutaDeDocumento(numero: string, version: number): string {
  return `${numero}-v${version}.pdf`;
}

/**
 * Cada segmento se codifica por separado: `encodeURIComponent` sobre la ruta
 * completa escaparia tambien las barras y Graph interpretaria un unico nombre
 * de archivo con barras dentro.
 */
function codificarRuta(ruta: string): string {
  return ruta
    .split('/')
    .filter((segmento) => segmento.length > 0)
    .map(encodeURIComponent)
    .join('/');
}

function urlDeContenido(driveId: string, carpeta: string, ruta: string): string {
  const rutaCompleta = codificarRuta(`${carpeta}/${ruta}`);
  return `${GRAPH}/drives/${encodeURIComponent(driveId)}/root:/${rutaCompleta}:/content?@microsoft.graph.conflictBehavior=replace`;
}

export interface DocumentoArchivado {
  itemId: string;
  webUrl: string;
}

export async function subirDocumento(params: {
  ruta: string;
  contenido: Buffer;
}): Promise<DocumentoArchivado> {
  if (params.contenido.length > LIMITE_SUBIDA_SIMPLE) {
    throw new GraphError(
      `El documento pesa ${params.contenido.length} bytes y la subida simple de Graph admite hasta 4 MB. Requiere una sesion de carga por partes.`
    );
  }
  const { driveId, carpeta } = requireConfiguration();

  const respuesta = await graphRequestJson<{ id?: string; webUrl?: string }>(
    urlDeContenido(driveId, carpeta, params.ruta),
    {
      method: 'PUT',
      body: new Uint8Array(params.contenido),
      contentType: 'application/pdf',
      operacion: 'No se pudo archivar el documento en SharePoint',
    }
  );

  if (!respuesta.id) {
    throw new GraphError('SharePoint acepto el archivo pero no devolvio su identificador');
  }
  if (!respuesta.webUrl || !/^https:\/\//i.test(respuesta.webUrl)) {
    throw new GraphError('SharePoint no devolvio una URL utilizable para el documento archivado');
  }
  return { itemId: respuesta.id, webUrl: respuesta.webUrl };
}

export async function descargarDocumento(itemId: string): Promise<Buffer> {
  const { driveId } = requireConfiguration();
  return graphRequestBinary(
    `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
    { operacion: 'No se pudo descargar el documento archivado en SharePoint' }
  );
}
