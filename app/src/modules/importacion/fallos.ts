/**
 * Fallos de una importacion (SPEC 2.133): en vez de una lista larga de filas con
 * su mensaje, se agrupan por motivo (cuantas filas, cuales) y cada motivo dice
 * como arreglarlo. Lo comparten las tres importaciones (equipos, lineas e
 * historial) y se usa tanto en la revision como en el resultado. Es puro.
 */

export interface Fallo {
  /** Fila del Excel. */
  fila: number;
  mensaje: string;
  /** Algo que identifique a la fila (serie, IMEI, numero, persona), para encontrarla. */
  referencia?: string;
}

export interface GrupoFallo {
  titulo: string;
  /** Como arreglarlo; sin esto, solo se muestra el mensaje. */
  solucion?: string;
  cantidad: number;
  filas: number[];
  /** Un mensaje de ejemplo (el de la primera fila). */
  ejemplo: string;
  detalle: Fallo[];
}

/** Motivos conocidos: su titulo y como arreglarlos. El primero que calza, gana. */
export const AYUDA_FALLOS: { patron: RegExp; titulo: string; solucion: string }[] = [
  { patron: /marca no reconocida/i, titulo: 'Marca que no está en el catálogo', solucion: 'Agrégala en Activos › Catálogos › Marcas (o créala desde la revisión) y vuelve a revisar. Revisa también que no esté mal escrita.' },
  { patron: /(sistema operativo|antivirus|licencia microsoft 365) no reconocid/i, titulo: 'Opción de catálogo no reconocida', solucion: 'Elige una opción existente o créala desde la revisión.' },
  { patron: /imei.*(no es válido|inválido|invalido)|no es válido.*imei/i, titulo: 'IMEI inválido', solucion: 'Revisa el IMEI en el aparato (marca *#06# en el teléfono). Debe tener 15 dígitos y pasar el dígito verificador.' },
  { patron: /ya existe un activo con el imei|n° de serie .* ya existe|serie .* ya existe/i, titulo: 'Equipo que ya existe en el sistema', solucion: 'Ese IMEI o N° de serie ya está importado: quítalo del archivo, o corrígelo si estaba mal escrito.' },
  { patron: /aparece repetido en este mismo archivo/i, titulo: 'Repetido dentro del archivo', solucion: 'Cada equipo va en una sola fila. Si cambió de persona, deja la fila de hoy y pon las anteriores en Historial de equipos.' },
  { patron: /con persona: ¿se dio de baja/i, titulo: 'De baja o vendido, pero con persona', solucion: 'Decide cuál dato está mal: si ya no se usa, quita la persona; si alguien lo tiene, cambia el estado.' },
  { patron: /datos de persona incompletos/i, titulo: 'Persona sin RUT ni nombre', solucion: 'Agrega el RUT, o el Nombre y Apellido P., de quien tiene el equipo; si nadie lo tiene, borra el cargo y el correo de esa fila.' },
  { patron: /"no devuelto" sin persona/i, titulo: 'No devuelto, sin persona', solucion: 'Agrega el RUT (o Nombre y Apellido P.) de quien no lo devolvió; si nadie lo tiene, cambia el estado.' },
  { patron: /campos faltantes/i, titulo: 'Faltan datos obligatorios', solucion: 'Completa la columna que indica el mensaje (Marca, Modelo, N° de serie o IMEI) en esa fila.' },
  { patron: /rut inválido|rut no es válido/i, titulo: 'RUT con dígito verificador incorrecto', solucion: 'Corrige el RUT en el Excel (revisa el dígito después del guion).' },
  { patron: /está desvinculad|esta desvinculad/i, titulo: 'Equipo asignado a una persona desvinculada', solucion: 'Usa el estado "No devuelto" si se fue sin devolverlo, o "Disponible" si ya lo devolvió.' },
  { patron: /sede no reconocida/i, titulo: 'Sede que no existe', solucion: 'Escribe el nombre exacto de una sede (Configuración › Sedes) o elige una sede fija en el primer paso.' },
  { patron: /calza con \d+ personas/i, titulo: 'Nombre que coincide con varias personas', solucion: 'Agrega el RUT de la persona para distinguirla.' },
  { patron: /rut .* es nuevo, pero|posible duplicad/i, titulo: 'Posible persona duplicada', solucion: '¿Está mal escrito el RUT? Ya existe una persona con ese nombre y otro RUT.' },
  { patron: /faltan campos obligatorios \(nombre o apellido/i, titulo: 'Persona sin nombre', solucion: 'Para crear a la persona hacen falta su Nombre y su Apellido P.' },
  { patron: /fecha de entrega no reconocida|fecha inválida/i, titulo: 'Fecha ilegible', solucion: 'Escribe la fecha como dd-mm-aaaa o usa una fecha de Excel.' },
  { patron: /valor no reconocido/i, titulo: 'Valor en pesos inválido', solucion: 'Escribe solo el monto en pesos, sin decimales (850000 o 850.000).' },
  { patron: /estado no reconocido/i, titulo: 'Estado no reconocido', solucion: 'Usa Disponible, Asignado, En mantención, Baja, Vendido o No devuelto.' },
  { patron: /no hay un (equipo|celular) con/i, titulo: 'Equipo que todavía no está importado', solucion: 'Importa primero los equipos (paso Equipos) y luego el historial.' },
  { patron: /no está en el sistema ni en la hoja personas/i, titulo: 'Persona sin datos para crearla', solucion: 'Agrégala en la hoja PERSONAS del archivo, con sus nombres y apellidos.' },
  { patron: /no es un celular de 9 dígitos|falta el número|número no válido/i, titulo: 'Número de línea inválido', solucion: 'Debe ser un celular chileno de 9 dígitos (ej: 9 1234 5678).' },
  { patron: /no se pudo guardar/i, titulo: 'No se pudo guardar la fila', solucion: 'Reintenta; si se repite, avisa a soporte con el número de fila.' },
];

/** El mensaje sin lo que cambia de fila a fila (numeros, valores entre comillas), para poder agruparlo. */
function plantilla(mensaje: string): string {
  return mensaje.replace(/"[^"]*"/g, '"…"').replace(/\d[\d.\-kK]*/g, '#').replace(/\s+/g, ' ').trim();
}

/** Agrupa los fallos por motivo, del que afecta a mas filas al que afecta a menos. */
export function agruparFallos(fallos: Fallo[]): GrupoFallo[] {
  const grupos = new Map<string, GrupoFallo>();
  for (const f of fallos) {
    const ayuda = AYUDA_FALLOS.find((a) => a.patron.test(f.mensaje));
    const clave = ayuda ? ayuda.titulo : plantilla(f.mensaje);
    const g = grupos.get(clave) ?? { titulo: ayuda ? ayuda.titulo : f.mensaje, solucion: ayuda?.solucion, cantidad: 0, filas: [], ejemplo: f.mensaje, detalle: [] };
    g.cantidad++;
    g.filas.push(f.fila);
    g.detalle.push(f);
    grupos.set(clave, g);
  }
  return [...grupos.values()].sort((a, b) => b.cantidad - a.cantidad || a.filas[0] - b.filas[0]);
}

/** "Filas 12, 15 y 20" / "Fila 7" / "Filas 3, 4, 5, 6, 7 y 12 más". */
export function textoDeFilas(filas: number[], max = 6): string {
  const ordenadas = [...filas].sort((a, b) => a - b);
  if (ordenadas.length === 1) return `Fila ${ordenadas[0]}`;
  const vistas = ordenadas.slice(0, max);
  const resto = ordenadas.length - vistas.length;
  return resto > 0 ? `Filas ${vistas.join(', ')} y ${resto} más` : `Filas ${vistas.slice(0, -1).join(', ')} y ${vistas.at(-1)}`;
}

/** Los fallos como filas de un CSV (fila, motivo, como arreglarlo, mensaje, referencia), para llevarlos a Excel. */
export function fallosParaCsv(fallos: Fallo[]): string[][] {
  const cabecera = ['Fila del Excel', 'Motivo', 'Cómo arreglarlo', 'Mensaje', 'Referencia'];
  const cuerpo = [...fallos]
    .sort((a, b) => a.fila - b.fila)
    .map((f) => {
      const ayuda = AYUDA_FALLOS.find((a) => a.patron.test(f.mensaje));
      return [String(f.fila), ayuda?.titulo ?? '', ayuda?.solucion ?? '', f.mensaje, f.referencia ?? ''];
    });
  return [cabecera, ...cuerpo];
}

/**
 * CSV que Excel abre bien en espanol: separador ";", comillas dobles y BOM para las
 * tildes. Un valor del Excel que empieza con = + - @ (o tabulacion) va con un
 * apostrofo delante: asi Excel lo muestra como texto y no lo ejecuta como formula.
 */
export function aCsv(filas: string[][]): string {
  const texto = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  const celda = (v: string) => {
    const t = texto(v);
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
}
