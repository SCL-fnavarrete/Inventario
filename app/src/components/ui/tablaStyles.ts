/**
 * Columna de acciones fija al borde derecho de una tabla mas ancha que la
 * pantalla: los botones quedan a la vista aunque la tabla se deslice hacia el
 * lado. La fila (<tr>) debe llevar `group` para que la celda siga el hover.
 * La usan Activos y Personal.
 */
export const COLUMNA_FIJA_ENCABEZADO =
  "sticky right-0 z-10 bg-surface-muted shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]";

export const COLUMNA_FIJA_CELDA =
  "sticky right-0 z-10 bg-surface group-hover:bg-surface-muted shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)] transition-colors";
