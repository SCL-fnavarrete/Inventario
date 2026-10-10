import { z } from 'zod';
import { fechaTextoOpcional } from '@/shared/validaciones/comunes';

/**
 * Importacion de lineas (SPEC 2.131), por pasos como la de activos: los
 * campos que se pueden traer de un Excel, como se reconocen sus columnas y
 * lo que se manda a guardar en cada tanda. Lo comparten la pantalla y el
 * servidor.
 */

export const CAMPOS_IMPORTACION = [
  { campo: 'numero', etiqueta: 'Número', obligatorio: true, columnas: ['línea normalizada', 'línea', 'linea', 'n° telefono', 'n° teléfono', 'nº telefono', 'número', 'numero', 'teléfono', 'telefono', 'celular'] },
  { campo: 'estado', etiqueta: 'Estado', columnas: ['estado'] },
  { campo: 'tipoChip', etiqueta: 'Tipo de chip', columnas: ['tipo de chip', 'tipo chip', 'chip'] },
  { campo: 'operador', etiqueta: 'Operador', columnas: ['operador', 'compañía', 'compania'] },
  { campo: 'rut', etiqueta: 'RUT de la persona', columnas: ['documento(s)', 'documento', 'rut'] },
  { campo: 'nombre', etiqueta: 'Nombre de la persona', columnas: ['nombre', 'nombres'] },
  { campo: 'apellidoPaterno', etiqueta: 'Apellido paterno', columnas: ['apellido p.', 'apellido paterno'] },
  { campo: 'apellidoMaterno', etiqueta: 'Apellido materno', columnas: ['apellido m.', 'apellido materno'] },
  { campo: 'fechaEntrega', etiqueta: 'Fecha de entrega', columnas: ['fecha entrega', 'fecha de entrega'] },
  { campo: 'imei', etiqueta: 'IMEI del celular', columnas: ['imei'] },
  { campo: 'fechaBaja', etiqueta: 'Fecha de baja', columnas: ['fecha de baja', 'fecha baja'] },
  { campo: 'observaciones', etiqueta: 'Observaciones', columnas: ['observación', 'observacion', 'observaciones'] },
] as const;

export type CampoImportacion = (typeof CAMPOS_IMPORTACION)[number]['campo'];
/** Campo -> encabezado del Excel elegido (vacio = no se importa). */
export type MapeoLineas = Partial<Record<CampoImportacion, string>>;

/** Los campos que son catalogos: sus valores se asocian a una opcion o se agregan. */
export const CAMPOS_CATALOGO = { estado: 'estados', tipoChip: 'tipos-chip', operador: 'operadores' } as const;

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Mapeo propuesto: cada campo a la primera columna del Excel con un nombre conocido. */
export function mapeoSugerido(encabezados: string[]): MapeoLineas {
  const libres = encabezados.map((h) => ({ h, n: sinTildes(h) }));
  const mapeo: MapeoLineas = {};
  for (const { campo, columnas } of CAMPOS_IMPORTACION) {
    const hallado = columnas.map(sinTildes).map((c) => libres.find((l) => l.n === c)).find(Boolean);
    if (hallado) mapeo[campo] = hallado.h;
  }
  // Inventario de celulares (una fila por entrega, con "Fecha entrega"): ahi "Estado" es el del
  // equipo (Nuevo, Usado, SIM, eSim), no el de la linea; sirve para el tipo de chip. La
  // "Observación" es la ubicacion del equipo (no se importa) y la "Incidencia", las observaciones.
  if (libres.some((l) => l.n === 'fecha entrega')) {
    const col = (n: string) => libres.find((l) => l.n === n)?.h;
    if (mapeo.estado) {
      mapeo.tipoChip ??= mapeo.estado;
      delete mapeo.estado;
    }
    const ubicacion = col('observacion');
    const incidencia = col('incidencia');
    if (incidencia) mapeo.observaciones = incidencia;
    else if (ubicacion) delete mapeo.observaciones;
  }
  return mapeo;
}

/**
 * La opcion de un catalogo que corresponde a un valor del Excel: la del mismo
 * nombre o, en el tipo de chip, su alias ("SIM" es Físico; "eSim" o "MFF", eSIM / MFF).
 */
export function opcionDelValor(campo: keyof typeof CAMPOS_CATALOGO, valor: string, opciones: { id: string; nombre: string }[]): string | null {
  const igual = opciones.find((o) => mismoNombre(o.nombre, valor));
  if (igual) return igual.id;
  if (campo !== 'tipoChip') return null;
  const v = sinTildes(valor);
  const buscar = (re: RegExp) => opciones.find((o) => re.test(sinTildes(o.nombre)))?.id ?? null;
  if (/^e-?\s?sim\b|^mff/.test(v)) return buscar(/esim|mff/);
  if (/^sim\b|^fisic/.test(v)) return buscar(/fisic/);
  return null;
}

/** Compara un valor del Excel con las opciones de un catalogo, sin tildes ni mayusculas. */
export function mismoNombre(a: string, b: string) {
  return sinTildes(a) === sinTildes(b);
}

/** Una entrega anterior de la misma linea (otra fila del archivo con el mismo numero). */
export const entregaImportacionSchema = z.object({
  fila: z.number().int().min(1),
  rut: z.string().max(200).nullable(),
  nombre: z.string().trim().max(300).nullable(),
  // Nombre separado, para crear a la persona si no esta en el sistema (SPEC 2.133).
  nombres: z.string().trim().max(150).nullable().optional(),
  apellidoPaterno: z.string().trim().max(150).nullable().optional(),
  apellidoMaterno: z.string().trim().max(150).nullable().optional(),
  imei: z.string().max(40).nullable(),
  desde: fechaTextoOpcional,
});
export type EntregaImportacion = z.infer<typeof entregaImportacionSchema>;

/** Una fila lista para guardar: los textos del Excel y los catalogos ya resueltos a su id. Cada fila es una linea (un numero). */
export const filaImportacionSchema = z.object({
  fila: z.number().int().min(1),
  numero: z.string().max(40),
  estadoId: z.string().uuid().nullable(),
  tipoChipId: z.string().uuid().nullable(),
  operadorId: z.string().uuid().nullable(),
  rut: z.string().max(200).nullable(),
  nombre: z.string().trim().max(300).nullable(),
  // Nombre separado, para crear a la persona si no esta en el sistema (SPEC 2.133).
  nombres: z.string().trim().max(150).nullable().optional(),
  apellidoPaterno: z.string().trim().max(150).nullable().optional(),
  apellidoMaterno: z.string().trim().max(150).nullable().optional(),
  imei: z.string().max(40).nullable(),
  // Cuando se entrego (la ultima entrega de la linea): desde ahi es de esa persona.
  fechaEntrega: fechaTextoOpcional,
  fechaBaja: fechaTextoOpcional,
  observaciones: z.string().trim().max(2000).nullable(),
  // Las entregas anteriores del mismo numero en el archivo, de la mas antigua a la mas nueva.
  entregas: z.array(entregaImportacionSchema).max(50),
});
export type FilaImportacion = z.infer<typeof filaImportacionSchema>;

/** Lo maximo por tanda: cada peticion es corta y la pantalla muestra el avance. */
export const LINEAS_POR_TANDA = 25;

export const tandaImportacionSchema = z.object({
  // Fecha de los datos del archivo: desde ahi rige el estado importado.
  fechaDatos: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida'),
  filas: z.array(filaImportacionSchema).min(1).max(LINEAS_POR_TANDA),
});

/** Mapeo que llega como texto JSON: solo campos conocidos; un JSON roto es un 400, no un 500. */
export const mapeoLineasSchema = z
  .string()
  .max(5000)
  .transform((t, ctx) => {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Mapeo de columnas inválido' });
      return z.NEVER;
    }
  })
  .pipe(z.object(Object.fromEntries(CAMPOS_IMPORTACION.map((c) => [c.campo, z.string().max(200).optional()]))).strict())
  .transform((m) => m as MapeoLineas);
