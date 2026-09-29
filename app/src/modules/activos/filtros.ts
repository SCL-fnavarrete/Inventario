/**
 * Filtros de Activos por datos de catalogo (SPEC 2.116.6). Se combinan entre
 * si y con estado, categoria, busqueda y sede. SIN_DATO busca los equipos que
 * no tienen ese dato; la marca es obligatoria, asi que no lo ofrece.
 * Lo comparten la pantalla y el servidor (modules/activos/consultas.ts).
 */
export const SIN_DATO = "sin_dato";

export const FILTROS_DATO = [
  { param: "marca", etiqueta: "Marca", endpoint: "/api/marcas", sinDato: null },
  { param: "so", etiqueta: "Sistema operativo", endpoint: "/api/sistemas-operativos", sinDato: "Sin sistema operativo" },
  { param: "antivirus", etiqueta: "Antivirus", endpoint: "/api/antivirus", sinDato: "Sin antivirus" },
  { param: "licencia", etiqueta: "Licencia M365", endpoint: "/api/licencias-m365", sinDato: "Sin licencia" },
  { param: "motivoBaja", etiqueta: "Motivo de baja", endpoint: "/api/motivos-baja", sinDato: "Baja sin motivo" },
] as const;

export type ParamFiltroDato = (typeof FILTROS_DATO)[number]["param"];
export type FiltrosDato = Partial<Record<ParamFiltroDato, string>>;
