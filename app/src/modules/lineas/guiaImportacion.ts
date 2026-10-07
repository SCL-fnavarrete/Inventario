import { fallosDeGuia, type ColumnaGuia, type GuiaImportacion } from '@/modules/importacion';
import { CAMPOS_IMPORTACION, type CampoImportacion } from '@/modules/lineas/camposImportacion';

/**
 * "Como debe ir el Excel" de las lineas telefonicas (SPEC 2.133): las columnas son
 * `CAMPOS_IMPORTACION`, las mismas que reconoce el importador, con el encabezado
 * recomendado y un ejemplo de cada una. Es pura.
 */

const GUIA: Record<CampoImportacion, { columna: string; descripcion: string; ejemplo: string }> = {
  numero: { columna: 'N° teléfono', descripcion: 'Número de la línea: celular chileno de 9 dígitos (con o sin 56). Un número que se repite es la misma línea.', ejemplo: '9 1234 5678' },
  estado: { columna: 'Estado', descripcion: 'Estado de la línea: Activa, Suspendida, En portabilidad, Por confirmar o Dada de baja. Sin dato queda Activa.', ejemplo: 'Activa' },
  plan: { columna: 'Plan', descripcion: 'Plan contratado. Si no existe, en la revisión eliges asociarlo a uno o agregarlo.', ejemplo: 'Plan 20 GB' },
  precio: { columna: 'Precio mensual', descripcion: 'Lo que cuesta al mes, en pesos.', ejemplo: '18479' },
  tipoChip: { columna: 'Tipo de chip', descripcion: 'Físico o eSIM. Un chip físico va en un celular de la empresa; una eSIM, con una persona.', ejemplo: 'Físico' },
  operador: { columna: 'Operador', descripcion: 'Compañía (Entel, Movistar, Claro, WOM…).', ejemplo: 'Entel' },
  rut: { columna: 'RUT', descripcion: 'RUT de la persona que tiene la línea. Si no existe se crea; sin RUT se busca por nombre y apellidos.', ejemplo: '12.345.678-9' },
  nombre: { columna: 'Nombre', descripcion: 'Nombre(s) de la persona. Obligatorio para crearla si no existe.', ejemplo: 'Ana María' },
  apellidoPaterno: { columna: 'Apellido P.', descripcion: 'Apellido paterno de la persona. Obligatorio para crearla si no existe.', ejemplo: 'Pérez' },
  apellidoMaterno: { columna: 'Apellido M.', descripcion: 'Apellido materno (opcional).', ejemplo: 'Soto' },
  fechaEntrega: { columna: 'Fecha de entrega', descripcion: 'Desde cuándo la tiene esa persona (dd-mm-aaaa).', ejemplo: '15-02-2024' },
  responsable: { columna: 'Ubicación', descripcion: 'Dónde está la línea: el nombre de una sede (ej: Bodega Santiago) o una nota si no es una sede.', ejemplo: 'Bodega Santiago' },
  imei: { columna: 'IMEI', descripcion: 'IMEI del celular donde está el chip. Si el celular ya está importado, la línea queda en él y la persona es la del celular.', ejemplo: '356938035643809' },
  fechaBaja: { columna: 'Fecha de baja', descripcion: 'Cuándo se dio de baja (dd-mm-aaaa).', ejemplo: '31-07-2026' },
  observaciones: { columna: 'Observaciones', descripcion: 'Notas de la línea.', ejemplo: 'Cambio de chip' },
};

export function guiaDeLineas(): GuiaImportacion {
  const columnas: ColumnaGuia[] = CAMPOS_IMPORTACION.map((c) => ({
    columna: GUIA[c.campo].columna,
    obligatoria: 'obligatorio' in c,
    descripcion: GUIA[c.campo].descripcion,
    ejemplo: GUIA[c.campo].ejemplo,
  }));
  return {
    titulo: 'Líneas telefónicas',
    resumen: 'Una fila por entrega de una línea. Un número que se repite es la misma línea entregada varias veces: la última fila es la persona de hoy y las anteriores quedan en su historial ("Quién la ha tenido").',
    hojas: [
      {
        nombre: 'Líneas',
        para: 'Ordena las filas de cada número de la más antigua a la más nueva. Si el archivo tiene varias hojas, eliges cuál en el primer paso.',
        columnas,
      },
    ],
    antes: [
      'Importa primero los equipos, para que cada línea quede asociada a su celular por el IMEI.',
      'Los planes, estados, tipos de chip y operadores que no existan se asocian o se agregan en la revisión: no hace falta crearlos antes.',
    ],
    reglas: [
      'Solo el número es obligatorio. Plan y precio son obligatorios solo al crear una línea a mano, no al importar.',
      'La persona se busca por RUT (o por nombre y apellidos si no hay RUT). Si no existe se crea: Activa si tiene hoy la línea y Desvinculada si solo la tuvo antes. Una persona que ya existe no cambia de estado.',
      'Con celular (IMEI), la persona de la línea es la que tiene ese celular. Una eSIM se asocia a una persona; un chip físico, a un celular de la empresa.',
      'Una línea que ya existe solo se completa con lo que le falta: no se pisan sus datos ni su estado.',
      'La "Fecha de los datos" del primer paso es desde cuándo rigen el precio y el estado importados (para el costo por mes).',
      'Nada se guarda hasta que revisas y presionas "Importar".',
    ],
    fallos: fallosDeGuia(['Número de línea inválido', 'Nombre que coincide con varias personas', 'Posible persona duplicada', 'Fecha ilegible']),
    archivoPlantilla: 'plantilla-importacion-lineas.xlsx',
  };
}

/** Que dato va en la columna de un campo (para el paso "Columnas"). */
export const descripcionDeCampoLinea = (campo: CampoImportacion) => GUIA[campo].descripcion;
