"""
Script de Preparación de Base de Datos
Verifica y prepara la BD para la migración
"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def test_connection():
    """Probar conexión a la base de datos"""
    print("=" * 80)
    print("VERIFICACION DE BASE DE DATOS")
    print("=" * 80)

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        # Verificar versión de PostgreSQL
        cursor.execute("SELECT version();")
        version = cursor.fetchone()
        print(f"\n[OK] Conexion exitosa a PostgreSQL")
        print(f"Version: {version[0][:50]}...")

        # Verificar tablas existentes
        cursor.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)

        tables = cursor.fetchall()
        print(f"\n[INFO] Tablas existentes en la base de datos: {len(tables)}")
        for table in tables:
            print(f"  - {table[0]}")

        # Verificar si existe la tabla assets
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'assets'
            );
        """)
        assets_exists = cursor.fetchone()[0]

        if assets_exists:
            # Verificar si existe la columna nombre_equipo
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns
                    WHERE table_name = 'assets'
                    AND column_name = 'nombre_equipo'
                );
            """)
            column_exists = cursor.fetchone()[0]

            if column_exists:
                print("\n[OK] La columna 'nombre_equipo' ya existe en la tabla assets")
            else:
                print("\n[WARN] La columna 'nombre_equipo' NO existe en la tabla assets")
                print("[INFO] Se debe aplicar el schema de Prisma actualizado")
        else:
            print("\n[WARN] La tabla 'assets' no existe")
            print("[INFO] Se debe aplicar el schema de Prisma")

        cursor.close()
        conn.close()

        return True

    except psycopg2.OperationalError as e:
        print(f"\n[ERROR] No se pudo conectar a la base de datos")
        print(f"Error: {e}")
        print("\nPosibles soluciones:")
        print("  1. Verificar que Docker con PostgreSQL este corriendo")
        print("  2. Verificar puerto 5433 en DATABASE_URL")
        print("  3. Verificar credenciales (usuario: inventario, password: inventario123)")
        return False

    except Exception as e:
        print(f"\n[ERROR] Error inesperado: {e}")
        return False


def check_prisma_schema():
    """Verificar si existe el schema de Prisma"""
    print("\n" + "=" * 80)
    print("VERIFICACION DE SCHEMA PRISMA")
    print("=" * 80)

    prisma_file = "prisma_schema.prisma"
    if os.path.exists(prisma_file):
        print(f"\n[OK] Archivo {prisma_file} encontrado")
        print("\nPara aplicar el schema actualizado, ejecutar:")
        print("  cd app")
        print("  npx prisma db push --schema=../prisma_schema.prisma")
        print("\nO si tienes Prisma instalado globalmente:")
        print("  prisma db push --schema=prisma_schema.prisma")
        return True
    else:
        print(f"\n[ERROR] Archivo {prisma_file} no encontrado")
        return False


def main():
    if not DATABASE_URL:
        print("[ERROR] DATABASE_URL no configurada en .env")
        return

    db_ok = test_connection()
    schema_ok = check_prisma_schema()

    print("\n" + "=" * 80)
    print("RESUMEN")
    print("=" * 80)

    if db_ok and schema_ok:
        print("\n[OK] Sistema listo para la migracion")
        print("\nProximos pasos:")
        print("  1. Aplicar schema de Prisma si es necesario")
        print("  2. Ejecutar: python migration_script.py")
    else:
        print("\n[WARN] Revisar los problemas reportados arriba")

    print("=" * 80)


if __name__ == "__main__":
    main()
