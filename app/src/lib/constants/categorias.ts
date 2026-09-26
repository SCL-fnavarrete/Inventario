import type { TipoFicha } from "@prisma/client";

/**
 * "Que campos pide" cada categoria de activos (SPEC 2.112.7). Decide los
 * campos especiales del formulario y de las fichas, en vez de reconocer la
 * categoria por su nombre: asi renombrar "Notebook" a "Laptop" no rompe nada.
 */
export const TIPOS_FICHA: { valor: TipoFicha; label: string; detalle: string }[] = [
  { valor: "computador", label: "Computador", detalle: "Procesador, RAM, disco, sistema operativo, antivirus y licencia M365" },
  { valor: "celular", label: "Celular", detalle: "IMEI, número de teléfono, plan y cargador" },
  { valor: "monitor", label: "Monitor", detalle: "Pulgadas" },
  { valor: "periferico", label: "Periférico", detalle: "Solo lo básico: marca, modelo y serie" },
  { valor: "generico", label: "Genérico", detalle: "Lo básico más los campos generales" },
];

export const TIPO_FICHA_LABEL = Object.fromEntries(TIPOS_FICHA.map((t) => [t.valor, t.label])) as Record<
  TipoFicha,
  string
>;
