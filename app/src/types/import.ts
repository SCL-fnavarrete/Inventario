// Tipos para el sistema de importacion mejorado de activos

export type ValidationErrorType =
  | "missing_required_field"
  | "duplicate_in_database"
  | "duplicate_in_file"
  | "missing_employee_data"
  | "invalid_format"
  | "invalid_assignment_date"
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
