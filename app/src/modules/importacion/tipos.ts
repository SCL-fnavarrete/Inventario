// Tipos para el sistema de importacion mejorado de activos

export type ValidationErrorType =
  | "missing_required_field"
  | "duplicate_in_database"
  | "duplicate_in_file"
  | "missing_employee_data"
  | "invalid_format"
  | "invalid_assignment_date"
  | "sede_no_reconocida"
  | "catalogo_no_reconocido"
  | "empleado_desvinculado"
  | "persona_ambigua"
  | "persona_duplicada"
  | "unknown_error";

export interface ValidationError {
  type: ValidationErrorType;
  field?: string;
  message: string;
  value?: string;
}

export interface ImportRowStatus {
  rowIndex: number;
  excelRow: number;
  status: "valid" | "error" | "warning" | "imported" | "corrected";
  data: Record<string, string>;
  errors: ValidationError[];
  warnings: ValidationError[];
  assetId?: string;
  /** Lo que la fila hace con su persona (SPEC 2.133): existente, o nueva y con que estado. */
  persona?: {
    accion: "existente" | "nueva";
    estado: "activo" | "desvinculado";
    porNombre: boolean;
    completados: string[];
  };
  /** Fila valida sin sede: el equipo queda sin sede (SPEC 2.117). */
  sinSede?: boolean;
  /** Decia "Activo"/"Asignado" sin persona: entra Disponible. */
  activoSinPersona?: boolean;
  /** Decia "Disponible" pero trae persona: entra Asignado. */
  disponibleConPersona?: boolean;
}

export interface ImportPreviewResult {
  headers: string[];
  rows: ImportRowStatus[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  warningCount: number;
  duplicatesInFile: string[];
  duplicatesInDb: string[];
  /** Personas de las filas validas: cuantas se crean (y con que estado) y cuantas ya existen. */
  personas: { nuevasActivas: number; nuevasDesvinculadas: number; existentes: number; porNombre: number };
  /** Filas validas que quedan sin sede (se completa despues en Editar). */
  sinSede: number;
  /** Filas que decian "Activo"/"Asignado" sin persona: entran Disponibles. */
  activosSinPersona: number;
  /** Filas que decian "Disponible" pero traen persona: entran Asignadas a ella. */
  disponiblesConPersona: number;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: Array<{
    row: number;
    message: string;
    type?: ValidationErrorType;
    data?: Record<string, string>;
  }>;
}

export interface CorrectedRow {
  rowIndex: number;
  data: Record<string, string>;
}

export interface ImportBatchResult {
  success: boolean;
  imported: number;
  skipped: number;
  failed: number;
  results: ImportRowStatus[];
}
