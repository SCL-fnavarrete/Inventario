import type { TipoFicha } from "@prisma/client";

/**
 * "Que campos pide" cada categoria de activos (SPEC 2.112.7). Decide los
 * campos especiales del formulario y de las fichas, en vez de reconocer la
 * categoria por su nombre: asi renombrar "Notebook" a "Laptop" no rompe nada.
 *
 * Las listas de campos son las del formulario de activos (ActivoForm): si
 * se agrega un campo alla, se agrega aqui para que Catalogos lo muestre.
 */

export type CampoFicha = { nombre: string; obligatorio?: boolean };

/**
 * Los que tiene todo activo, sea cual sea su categoria. El N° de serie es
 * obligatorio salvo en los celulares, que se identifican por su IMEI.
 */
export function camposComunes(tipo: TipoFicha): CampoFicha[] {
  return [
    { nombre: "Marca", obligatorio: true },
    { nombre: "Modelo", obligatorio: true },
    { nombre: "N° de serie", obligatorio: tipo !== "celular" },
    { nombre: "Sede", obligatorio: true },
    { nombre: "Estado" },
    { nombre: "Condición" },
    { nombre: "Fecha de compra" },
    { nombre: "Fin de garantía" },
    { nombre: "Observaciones" },
    { nombre: "Incidencia" },
  ];
}

export const TIPOS_FICHA: { valor: TipoFicha; label: string; campos: CampoFicha[] }[] = [
  {
    valor: "computador",
    label: "Computador",
    campos: [
      { nombre: "Procesador" },
      { nombre: "RAM" },
      { nombre: "Almacenamiento" },
      { nombre: "Sistema operativo" },
      { nombre: "Antivirus" },
      { nombre: "Licencia Microsoft 365" },
      { nombre: "Nombre del equipo" },
    ],
  },
  {
    valor: "celular",
    label: "Celular",
    campos: [{ nombre: "IMEI", obligatorio: true }, { nombre: "Número de teléfono" }, { nombre: "Almacenamiento" }],
  },
  { valor: "monitor", label: "Monitor", campos: [{ nombre: "Pulgadas" }] },
  { valor: "periferico", label: "Periférico", campos: [{ nombre: "Conectividad (USB, Bluetooth o cable)" }] },
  { valor: "generico", label: "Genérico", campos: [] },
];

export const TIPO_FICHA_LABEL = Object.fromEntries(TIPOS_FICHA.map((t) => [t.valor, t.label])) as Record<
  TipoFicha,
  string
>;
