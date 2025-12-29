"""
Script para analizar la estructura de archivos Excel del inventario
Autor: Sistema de Migración
Fecha: 2025-12-27
"""

import pandas as pd
import os
import json
from datetime import datetime
from pathlib import Path

# Directorio de archivos Excel
EXCEL_DIR = r"C:\Users\nanon\OneDrive\Documentos\GitHub\Inventario_Equipo\excel"

def analyze_excel_file(filepath):
    """Analiza un archivo Excel y retorna su estructura"""
    try:
        # Leer el Excel
        df = pd.read_excel(filepath, sheet_name=0)

        # Información básica
        info = {
            "filename": os.path.basename(filepath),
            "filepath": filepath,
            "rows": len(df),
            "columns": list(df.columns),
            "column_count": len(df.columns),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
            "sample_data": {},
            "null_counts": {},
            "unique_values_count": {}
        }

        # Análisis por columna
        for col in df.columns:
            # Contar nulos
            info["null_counts"][col] = int(df[col].isnull().sum())

            # Contar valores únicos
            info["unique_values_count"][col] = int(df[col].nunique())

            # Muestra de datos (primeros 3 valores no nulos)
            non_null_values = df[col].dropna().head(3).tolist()
            info["sample_data"][col] = [str(v) for v in non_null_values]

        return info

    except Exception as e:
        return {
            "filename": os.path.basename(filepath),
            "filepath": filepath,
            "error": str(e)
        }

def main():
    """Analiza todos los archivos Excel en el directorio"""

    print("=" * 80)
    print("ANÁLISIS DE ESTRUCTURA DE ARCHIVOS EXCEL")
    print("=" * 80)
    print()

    # Buscar archivos Excel
    excel_files = list(Path(EXCEL_DIR).glob("*.xlsx")) + list(Path(EXCEL_DIR).glob("*.xls"))

    print(f"Archivos encontrados: {len(excel_files)}")
    print()

    results = []

    for excel_file in excel_files:
        print(f"Analizando: {excel_file.name}")
        print("-" * 80)

        info = analyze_excel_file(str(excel_file))
        results.append(info)

        if "error" in info:
            print(f"  [X] ERROR: {info['error']}")
        else:
            print(f"  [OK] Filas: {info['rows']}")
            print(f"  [OK] Columnas: {info['column_count']}")
            print(f"  [OK] Nombres de columnas:")
            for col in info['columns']:
                null_pct = (info['null_counts'][col] / info['rows'] * 100) if info['rows'] > 0 else 0
                print(f"      - {col}")
                print(f"        * Tipo: {info['dtypes'][col]}")
                print(f"        * Nulos: {info['null_counts'][col]} ({null_pct:.1f}%)")
                print(f"        * Valores unicos: {info['unique_values_count'][col]}")
                if info['sample_data'][col]:
                    print(f"        * Muestra: {', '.join(info['sample_data'][col][:3])}")

        print()

    # Guardar resultados en JSON
    output_file = "excel_structure_analysis.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print("=" * 80)
    print(f"[OK] Analisis completo guardado en: {output_file}")
    print("=" * 80)

if __name__ == "__main__":
    main()
