import { CAMPOS_ACTIVO, camposDeFicha, esObligatorio } from '@/modules/importacion/camposActivos';
import { AYUDA_FALLOS } from '@/modules/importacion/fallos';

/**
 * "Como debe ir el Excel" (SPEC 2.133): para cada tipo de importacion, que hojas
 * y columnas lleva, que tiene que estar listo antes, como se interpreta y que
 * errores son los mas comunes. Lo muestra la pantalla de importacion y alimenta
 * la plantilla descargable. Es puro. Las columnas de los equipos salen de
 * `CAMPOS_ACTIVO`, la misma lista que usa el detector de columnas, asi la guia
 * no se desactualiza.
 */

export interface ColumnaGuia {
  /** Encabezado recomendado (el importador lo reconoce solo). */
  columna: string;
  obligatoria: boolean;
  descripcion: string;
  ejemplo: string;
}

export interface HojaGuia {
  nombre: string;
  /** Para que sirve esta hoja. */
  para: string;
  columnas: ColumnaGuia[];
}

export interface GuiaImportacion {
  titulo: string;
  resumen: string;
  hojas: HojaGuia[];
  /** Lo que tiene que estar listo antes de importar. */
  antes: string[];
  /** Como se interpreta el archivo. */
  reglas: string[];
  /** Los errores mas comunes y como arreglarlos. */
  fallos: { motivo: string; solucion: string }[];
  archivoPlantilla: string;
}

/** Los motivos de fallo (con su solucion) que se muestran en una guia, por su titulo. */
export function fallosDeGuia(titulos: string[]): GuiaImportacion['fallos'] {
  return titulos.flatMap((t) => AYUDA_FALLOS.filter((a) => a.titulo === t).map((a) => ({ motivo: a.titulo, solucion: a.solucion })));
}

const FICHAS: Record<string, string> = {
  computador: 'notebooks y computadores',
  celular: 'celulares',
  monitor: 'monitores',
  periferico: 'periféricos (mouse, teclado, audífonos…)',
  generico: 'otros equipos (impresoras, etc.)',
};

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Guia de la importacion de equipos de una categoria (por su ficha: lo que pide esa categoria). */
export function guiaDeActivos(ficha: string | null | undefined, categoria?: string | null): GuiaImportacion {
  const celular = ficha === 'celular';
  const campos = camposDeFicha(ficha);
  const ordenados = [
    ...campos.filter((c) => esObligatorio(c, ficha)),
    ...campos.filter((c) => !esObligatorio(c, ficha) && c.grupo === 'equipo'),
    ...campos.filter((c) => !esObligatorio(c, ficha) && c.grupo === 'persona'),
    ...campos.filter((c) => !esObligatorio(c, ficha) && c.grupo === 'extra'),
  ];
  const nombre = categoria?.trim() || (ficha ? FICHAS[ficha] : 'equipos');
  return {
    titulo: `Equipos: ${nombre}`,
    resumen: `Una fila por equipo. Cada equipo se identifica por su ${celular ? 'IMEI' : 'N° de serie'}. Si la fila trae a la persona que lo tiene, se busca (o se crea) y el equipo queda a su nombre.`,
    hojas: [
      {
        nombre: categoria?.trim() || 'Equipos',
        para: 'Una fila por equipo. La primera fila son los encabezados; el orden de las columnas no importa.',
        columnas: ordenados.map((c) => ({ columna: c.columna, obligatoria: esObligatorio(c, ficha), descripcion: c.descripcion, ejemplo: c.ejemplo })),
      },
    ],
    antes: [
      'Las marcas del archivo tienen que estar en Activos › Catálogos › Marcas. Una marca que no esté se rechaza (o la creas en la revisión).',
      'La categoría tiene que existir en Configuración › Categorías de Activos, con la ficha que corresponde.',
      'Las sedes que nombre la columna Sede tienen que existir (Configuración › Sedes), o elige una sede fija en el primer paso. Una fila con la Sede vacía se importa sin sede (se ve con "Todas las sedes", se encuentra con el filtro "Sin sede" de Activos y se asigna en Editar).',
      ...(ficha === 'computador' ? ['El sistema operativo, el antivirus y la licencia Microsoft 365 que sean nuevos se agregan solos a sus catálogos.'] : []),
      'Si algún equipo tuvo dueños anteriores, impórtalos después en "Historial de equipos".',
    ],
    reglas: [
      celular
        ? 'El IMEI son 15 dígitos válidos (con su dígito verificador) y no se puede repetir. Se ve marcando *#06# en el teléfono.'
        : 'El N° de serie no se puede repetir (ni en el archivo ni en el sistema; no distingue mayúsculas). Si un equipo no tiene serie, usa un código interno propio (ej: SIN-SERIE-MOUSE-01) y corrígelo después desde su ficha.',
      'Cada equipo va en una sola fila. Si cambió de persona, deja la fila de quien lo tiene hoy y pon las anteriores en "Historial de equipos".',
      'Si la fila trae a una persona (RUT, o Nombre y Apellido P.), el equipo es suyo: se le entrega y queda Asignado, aunque la columna Estado diga Disponible (No devuelto y En mantención también quedan a su nombre). Sin persona, nadie lo tiene: queda Disponible aunque diga Activo o Asignado.',
      'Baja o Vendido con persona se detiene para revisarlo (¿se dio de baja o lo tiene alguien?). Cargo o correo sin RUT ni nombre también se detiene, salvo en un equipo de baja o vendido. No devuelto sin persona se detiene: hay que saber quién no lo devolvió.',
      'La persona se busca por RUT (con o sin puntos y guion) o, sin RUT, por nombre y apellidos. Si no existe se crea: Activa si el equipo queda con ella (Asignado o En mantención) y Desvinculada si ya no lo tiene (lo devolvió o se fue sin devolverlo). Una persona que ya existe no cambia de estado; solo se le completan datos que tenía vacíos.',
      'Un equipo Asignado o En mantención con una persona que ya está desvinculada se rechaza: usa "No devuelto" o "Disponible".',
      'Para crear a una persona hacen falta su Nombre y su Apellido P. Si no trae correo, queda vacío y se completa después en Personal.',
      'Las fechas van como dd-mm-aaaa o como fecha de Excel. El valor, en pesos sin decimales.',
      ...(ficha === 'computador'
        ? ['Si la fila trae fecha de Mantención o Próxima Mantención, se crea el registro en Mantenciones (completada si la fecha ya pasó, pendiente si es futura). Un equipo en estado En mantención queda con su mantención en proceso.']
        : []),
      'Nada se guarda hasta que revisas el resultado y presionas "Importar". Las filas con error no se importan: las puedes corregir en la revisión.',
    ],
    fallos: fallosDeGuia([
      'Marca que no está en el catálogo',
      celular ? 'IMEI inválido' : 'Faltan datos obligatorios',
      'Equipo que ya existe en el sistema',
      'Repetido dentro del archivo',
      'Faltan datos obligatorios',
      'Equipo asignado a una persona desvinculada',
      'Nombre que coincide con varias personas',
      'Persona sin nombre',
      'Sede que no existe',
      'Estado no reconocido',
      'Fecha ilegible',
    ]).filter((f, i, a) => a.findIndex((x) => x.motivo === f.motivo) === i),
    archivoPlantilla: `plantilla-importacion-${sinTildes(categoria?.trim() || ficha || 'equipos')}.xlsx`,
  };
}

/** Guia del historial de equipos: las entregas anteriores de cada equipo. */
export function guiaDeHistorial(): GuiaImportacion {
  const persona = CAMPOS_ACTIVO.filter((c) => ['rut', 'nombre', 'apellidoP', 'apellidoM', 'correoEmpresa', 'cargo', 'jefatura', 'supervisor', 'comuna'].includes(c.key));
  return {
    titulo: 'Historial de equipos',
    resumen: 'Las entregas anteriores de cada equipo: quién lo tuvo antes y entre qué fechas. Quedan en la ficha del equipo (y en el historial de la persona), sin actas ni solicitudes.',
    hojas: [
      {
        nombre: 'ENTREGAS',
        para: 'Una fila por entrega. Las filas con ¿Actual? = No son las que se importan; las "Sí" (quien lo tiene hoy) las trae la importación de equipos.',
        columnas: [
          { columna: 'IMEI', obligatoria: false, descripcion: 'IMEI del celular. Pon el IMEI o, si no es celular, el N° de serie.', ejemplo: '356938035643809' },
          { columna: 'N° serie', obligatoria: false, descripcion: 'N° de serie del equipo (monitor, mouse, audífonos…); no distingue mayúsculas. Se usa si la fila no trae IMEI.', ejemplo: '5NJJH4CWA00763' },
          { columna: 'RUT', obligatoria: false, descripcion: 'RUT de la persona. Sin RUT se busca por el nombre de la columna Persona.', ejemplo: '12.345.678-9' },
          { columna: 'Persona', obligatoria: true, descripcion: 'Nombre de la persona. Una fila sin persona (el equipo estaba en bodega) no es una entrega y se ignora.', ejemplo: 'Ana María Pérez Soto' },
          { columna: 'Desde', obligatoria: false, descripcion: 'Fecha de entrega (dd-mm-aaaa). Sin fecha queda "fecha desconocida".', ejemplo: '15-02-2024' },
          { columna: 'Hasta', obligatoria: false, descripcion: 'Fecha en que lo devolvió o pasó a otra persona.', ejemplo: '10-01-2025' },
          { columna: '¿Actual?', obligatoria: true, descripcion: 'No = entrega anterior (se importa). Sí = quien lo tiene hoy (se ignora aquí).', ejemplo: 'No' },
        ],
      },
      {
        nombre: 'PERSONAS',
        para: 'Los datos de las personas de ENTREGAS que todavía no están en el sistema, para crearlas. Una persona que ya existe se usa tal cual.',
        columnas: [
          ...persona.map((c) => ({ columna: c.columna, obligatoria: ['rut', 'nombre', 'apellidoP'].includes(c.key), descripcion: c.descripcion, ejemplo: c.ejemplo })),
          { columna: 'Estado', obligatoria: false, descripcion: 'Activo o Desvinculado: con qué estado se crea si no existe. Sin dato, se crea Desvinculada (ya no tiene nada asignado).', ejemplo: 'Desvinculado' },
        ].map((c) => (c.columna === 'Nombre' ? { ...c, columna: 'Nombres' } : c)),
      },
    ],
    antes: ['Importa primero los equipos (paso Equipos): aquí se buscan por IMEI o por N° de serie, y tienen que existir.'],
    reglas: [
      'Cada entrega anterior queda como una asignación cerrada del equipo, con su persona y sus fechas. Importar el mismo archivo dos veces no repite nada.',
      'La persona se busca por RUT (o por nombre); si no existe se crea con los datos de la hoja PERSONAS y el estado que dice la columna Estado.',
      'Primero se revisa (no se guarda nada) y después se importa. Máximo 1.000 entregas por archivo.',
    ],
    fallos: fallosDeGuia(['Equipo que todavía no está importado', 'Persona sin datos para crearla', 'Nombre que coincide con varias personas', 'Posible persona duplicada']),
    archivoPlantilla: 'plantilla-importacion-historial.xlsx',
  };
}
