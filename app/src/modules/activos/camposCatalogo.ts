import type { Prisma } from '@prisma/client';

/**
 * Datos del equipo que vienen de un catalogo (SPEC 2.168): marca, sistema
 * operativo, antivirus y licencia Microsoft 365. El equipo guarda la llave
 * (`marcaId`...) y lee el nombre por la relacion (`marca.nombre`). La API
 * recibe el nombre, como lo eligen los formularios y la importacion, y
 * `idsDeCatalogos` (catalogos.ts) lo traduce a la llave.
 *
 * Es la unica lista de estos campos: consultas, filtros, Excel, historial y
 * catalogos la recorren en vez de repetirlos.
 */
export const CAMPOS_CATALOGO = {
  marca: { relacion: 'marca', llave: 'marcaId', catalogo: 'marcas', etiqueta: 'Marca' },
  sistemaOperativo: {
    relacion: 'sistemaOperativo',
    llave: 'sistemaOperativoId',
    catalogo: 'sistemas-operativos',
    etiqueta: 'Sistema operativo',
  },
  antivirus: {
    relacion: 'antivirus',
    llave: 'antivirusId',
    catalogo: 'antivirus',
    etiqueta: 'Antivirus',
  },
  tipoLicenciaMicrosoft365: {
    relacion: 'licenciaMicrosoft365',
    llave: 'licenciaMicrosoft365Id',
    catalogo: 'licencias-m365',
    etiqueta: 'Licencia Microsoft 365',
  },
} as const;

/** Nombre del dato en la API y los formularios (`marca`, `tipoLicenciaMicrosoft365`...). */
export type CampoCatalogo = keyof typeof CAMPOS_CATALOGO;
export type LlaveCatalogo = (typeof CAMPOS_CATALOGO)[CampoCatalogo]['llave'];
export type RelacionCatalogo = (typeof CAMPOS_CATALOGO)[CampoCatalogo]['relacion'];

export const NOMBRES_CAMPOS_CATALOGO = Object.keys(CAMPOS_CATALOGO) as CampoCatalogo[];

/** Solo el nombre de la opcion: lo que muestran las pantallas. */
export const NOMBRE = { select: { nombre: true } } as const;

/** Los cuatro datos de catalogo con su nombre, para el `include` o el `select` de un equipo. */
export const CON_CATALOGOS = {
  marca: NOMBRE,
  sistemaOperativo: NOMBRE,
  antivirus: NOMBRE,
  licenciaMicrosoft365: NOMBRE,
} as const satisfies Prisma.AssetInclude;

/** Lo minimo para nombrar un equipo ("Dell Latitude 5420"). */
export const MARCA_MODELO = { marca: NOMBRE, modelo: true } as const satisfies Prisma.AssetSelect;

type ConNombre = { nombre: string } | null | undefined;

/** "Dell Latitude 5420": marca y modelo de un equipo leido con su marca. */
export const marcaModelo = (a: { marca: ConNombre; modelo: string }) =>
  `${a.marca?.nombre ?? ''} ${a.modelo}`.trim();

/** El nombre de una opcion leida por su relacion, o null. */
export const nombreDe = (o: ConNombre) => o?.nombre ?? null;
