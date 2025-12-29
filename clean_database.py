"""
Script para limpiar datos de la base de datos antes de la migración
ADVERTENCIA: Este script ELIMINA TODOS LOS DATOS de las tablas
"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def clean_database():
    """Limpiar todas las tablas de datos"""
    print("=" * 80)
    print("LIMPIEZA DE BASE DE DATOS")
    print("=" * 80)
    print()
    print("[ADVERTENCIA] Este script eliminara TODOS los datos de las tablas")
    print("             Conservara la estructura de las tablas")
    print()

    response = input("Desea continuar? (escriba 'SI' para confirmar): ")

    if response != "SI":
        print("[CANCELADO] Operacion cancelada por el usuario")
        return

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        # Orden de eliminación (respetando foreign keys)
        tables_to_clean = [
            "asset_history",
            "dispatch_guide_items",
            "dispatch_guides",
            "kit_assignments",
            "terminations",
            "maintenances",
            "assignments",
            "purchase_assets",
            "purchases",
            "suppliers",
            "assets",
            "asset_categories",
            "employees",
            "welcome_kit_items"
        ]

        print("\n[INFO] Eliminando datos de las tablas...")
        for table in tables_to_clean:
            try:
                cursor.execute(f"DELETE FROM {table};")
                deleted = cursor.rowcount
                print(f"  - {table}: {deleted} registros eliminados")
            except Exception as e:
                print(f"  [ERROR] Error al limpiar {table}: {e}")

        conn.commit()

        print("\n[OK] Base de datos limpiada exitosamente")
        print("[INFO] Ahora puede ejecutar: python migration_script.py")

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"\n[ERROR] Error al limpiar la base de datos: {e}")


if __name__ == "__main__":
    clean_database()
