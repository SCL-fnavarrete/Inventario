import type { TipoFicha } from "@prisma/client";

/**
 * "Que campos pide" cada categoria de activos (SPEC 2.112.7). Decide los
 * campos especiales del formulario y de las fichas, en vez de reconocer la
 * categoria por su nombre: asi renombrar "Notebook" a "Laptop" no rompe nada.
 *
 * Las listas de campos son las del formulario de activos (ActivoForm): si
 * se agrega un campo alla, se agrega aqui para que Catalogos lo muestre.
 */

/** Los que tiene todo activo, sea cual sea su categoria. */
export const CAMPOS_COMUNES = [
  "Marca",
  "Modelo",
  "N° de serie",
  "Estado",
  "Condición",
  "Fecha de compra",
  "Fin de garantía",
  "Sede",
  "Observaciones",
  "Incidencia",
];

export const TIPOS_FICHA: { valor: TipoFicha; label: string; campos: string[] }[] = [
  {
    valor: "computador",
    label: "Computador",
    campos: [
      "Procesador",
      "RAM",
      "Almacenamiento",
      "Sistema operativo",
      "Antivirus",
      "Licencia Microsoft 365",
      "Nombre del equipo",
    ],
  },
  { valor: "celular", label: "Celular", campos: ["IMEI (obligatorio; el N° de serie pasa a ser opcional)", "Número de teléfono", "Almacenamiento"] },
  { valor: "monitor", label: "Monitor", campos: ["Pulgadas"] },
  { valor: "periferico", label: "Periférico", campos: ["Conectividad (USB, Bluetooth o cable)"] },
  { valor: "generico", label: "Genérico", campos: [] },
];

export const TIPO_FICHA_LABEL = Object.fromEntries(TIPOS_FICHA.map((t) => [t.valor, t.label])) as Record<
  TipoFicha,
  string
>;
