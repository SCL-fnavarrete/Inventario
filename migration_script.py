"""
Script de Migración de Datos desde Excel a PostgreSQL
Sistema de Inventario de Equipos

Autor: Sistema de Migración
Fecha: 2025-12-27
"""

import pandas as pd
import psycopg2
from psycopg2.extras import execute_batch
from datetime import datetime, timedelta
import os
from pathlib import Path
import json
import uuid
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Configuración
EXCEL_DIR = r"C:\Users\nanon\OneDrive\Documentos\GitHub\Inventario_Equipo\excel"
DATABASE_URL = os.getenv("DATABASE_URL")

# Estadísticas globales
stats = {
    "employees": 0,
    "asset_categories": 0,
    "assets": 0,
    "assignments": 0,
    "welcome_kit_items": 0,
    "kit_assignments": 0,
    "terminations": 0,
    "maintenances": 0,
    "errors": []
}

class DatabaseConnection:
    """Manejador de conexión a PostgreSQL"""

    def __init__(self, connection_string):
        self.connection_string = connection_string
        self.conn = None
        self.cursor = None

    def connect(self):
        """Establecer conexión"""
        try:
            self.conn = psycopg2.connect(self.connection_string)
            self.cursor = self.conn.cursor()
            print("[OK] Conexion establecida con la base de datos")
            return True
        except Exception as e:
            print(f"[ERROR] No se pudo conectar a la base de datos: {e}")
            stats["errors"].append(f"Database connection: {e}")
            return False

    def close(self):
        """Cerrar conexión"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        print("[OK] Conexion cerrada")

    def commit(self):
        """Hacer commit"""
        if self.conn:
            self.conn.commit()

    def rollback(self):
        """Hacer rollback"""
        if self.conn:
            self.conn.rollback()


def clean_rut(rut):
    """Limpiar y formatear RUT"""
    if pd.isna(rut):
        return None
    rut_str = str(rut).strip()
    # Eliminar puntos y guiones, luego reformatear
    rut_clean = rut_str.replace(".", "").replace("-", "")
    if len(rut_clean) < 2:
        return None
    # Formato: XX.XXX.XXX-X
    dv = rut_clean[-1]
    num = rut_clean[:-1]
    # Formatear con puntos
    formatted = ""
    for i, digit in enumerate(reversed(num)):
        if i > 0 and i % 3 == 0:
            formatted = "." + formatted
        formatted = digit + formatted
    return f"{formatted}-{dv}"


def parse_date(date_value):
    """Parsear fecha de Excel (puede venir como texto o datetime)"""
    if pd.isna(date_value):
        return None

    if isinstance(date_value, datetime):
        return date_value

    # Intentar parsear como string
    try:
        # Formato común: "2023-03-30 00:00:00"
        return pd.to_datetime(str(date_value))
    except:
        return None


def create_asset_categories(db):
    """Crear categorías de activos"""
    print("\n" + "=" * 80)
    print("PASO 1: Creando categorias de activos")
    print("=" * 80)

    categories = [
        ("Notebook", "Computador portátil", True, False),
        ("Celular", "Teléfono celular corporativo", True, True),
        ("Monitor", "Monitor/Pantalla", True, False),
        ("Mouse", "Mouse inalámbrico", True, False),
        ("Audífonos", "Audífonos/Headset", False, False),
        ("Impresora", "Impresora multifuncional", True, False),
    ]

    category_ids = {}

    for nombre, descripcion, requiere_serie, requiere_imei in categories:
        try:
            cat_id = str(uuid.uuid4())
            db.cursor.execute("""
                INSERT INTO asset_categories (id, nombre, descripcion, requiere_serie, requiere_imei, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING id
            """, (cat_id, nombre, descripcion, requiere_serie, requiere_imei, datetime.now()))

            result = db.cursor.fetchone()
            if result:
                category_ids[nombre] = result[0]
                print(f"  [OK] Categoria creada: {nombre}")
                stats["asset_categories"] += 1
            else:
                # Ya existe, obtener el ID
                db.cursor.execute("SELECT id FROM asset_categories WHERE nombre = %s", (nombre,))
                category_ids[nombre] = db.cursor.fetchone()[0]
                print(f"  [INFO] Categoria ya existe: {nombre}")

        except Exception as e:
            print(f"  [ERROR] Error al crear categoria {nombre}: {e}")
            stats["errors"].append(f"Category {nombre}: {e}")

    db.commit()
    return category_ids


def migrate_employees_from_excel(db, excel_file, columns_mapping):
    """
    Migrar empleados desde un archivo Excel

    columns_mapping: dict con mapeo de columnas Excel a campos BD
    Ejemplo: {"RUT": "rut", "Nombre": "nombre", ...}
    """
    employees_cache = {}

    try:
        df = pd.read_excel(excel_file)

        for _, row in df.iterrows():
            # Verificar si tiene RUT
            if "RUT" not in row or pd.isna(row["RUT"]):
                continue

            rut = clean_rut(row["RUT"])
            if not rut or rut in employees_cache:
                continue

            # Extraer datos según mapeo
            nombre = row.get("Nombre", "").strip() if "Nombre" in row else ""
            apellido_p = row.get("Apellido P.", "").strip() if "Apellido P." in row else ""
            apellido_m = row.get("Apellido M.", "").strip() if "Apellido M." in row else ""

            # Manejar columna mal nombrada en notebooks
            if "onoso" in row:
                apellido_p = row["onoso"].strip() if not pd.isna(row["onoso"]) else apellido_p

            correo = row.get("Correo", "").strip().lower() if "Correo" in row else ""
            if not correo:
                correo = f"{rut.replace('.', '').replace('-', '')}@temp.com"

            cargo = row.get("Cargo", None) if "Cargo" in row else None
            jefatura = row.get("Jefatura", None) if "Jefatura" in row else None
            supervisor = row.get("Supervisor", None) if "Supervisor" in row else None
            ubicacion = row.get("Comuna", None) if "Comuna" in row else None
            telefono = row.get("Contacto", None) if "Contacto" in row else None

            try:
                emp_id = str(uuid.uuid4())
                db.cursor.execute("""
                    INSERT INTO employees (
                        id, rut, nombre, apellido_paterno, apellido_materno, correo,
                        cargo, jefatura, supervisor, ubicacion, tipo_contrato,
                        estado, telefono_contacto, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (rut) DO NOTHING
                    RETURNING id
                """, (
                    emp_id, rut, nombre, apellido_p or "", apellido_m,
                    correo, cargo, jefatura, supervisor, ubicacion,
                    "planta", "activo", telefono,
                    datetime.now(), datetime.now()
                ))

                result = db.cursor.fetchone()
                if result:
                    employees_cache[rut] = result[0]
                    stats["employees"] += 1
                else:
                    # Ya existe
                    db.cursor.execute("SELECT id FROM employees WHERE rut = %s", (rut,))
                    emp_result = db.cursor.fetchone()
                    if emp_result:
                        employees_cache[rut] = emp_result[0]

            except Exception as e:
                print(f"    [ERROR] Error al crear empleado {rut}: {e}")
                stats["errors"].append(f"Employee {rut}: {e}")

    except Exception as e:
        print(f"  [ERROR] Error al leer archivo {excel_file}: {e}")
        stats["errors"].append(f"Reading {excel_file}: {e}")

    return employees_cache


def migrate_all_employees(db):
    """Migrar todos los empleados de todos los archivos Excel"""
    print("\n" + "=" * 80)
    print("PASO 2: Migrando empleados")
    print("=" * 80)

    all_employees = {}

    # Archivos con información de empleados
    employee_files = [
        "Consolidado inventario Notebook (1).xlsx",
        "Consolidado inventario Celulares.xlsx",
        "Consolidado inventario Monitor.xlsx",
        "Consolidado inventario Mouse.xlsx",
        "Consolidado inventario Audifonos.xlsx",
        "Inventario Kit +EPP + Mochila.xlsx",
        "Registro desvinculaciones.xlsx"
    ]

    for filename in employee_files:
        filepath = os.path.join(EXCEL_DIR, filename)
        if os.path.exists(filepath):
            print(f"\n  Procesando: {filename}")
            emp_cache = migrate_employees_from_excel(db, filepath, {})
            all_employees.update(emp_cache)
            print(f"    Total empleados en cache: {len(all_employees)}")

    db.commit()
    print(f"\n  [OK] Total empleados migrados: {stats['employees']}")
    return all_employees


def migrate_notebooks_assigned(db, category_ids, employees_cache):
    """Migrar notebooks asignados"""
    print("\n" + "=" * 80)
    print("PASO 3: Migrando Notebooks Asignados")
    print("=" * 80)

    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Notebook (1).xlsx")
    df = pd.read_excel(filepath)

    # Primero, detectar seriales duplicados y determinar cuál es el más reciente
    serial_dates = {}
    for idx, row in df.iterrows():
        serial = str(row["N° Serie"]).strip() if not pd.isna(row["N° Serie"]) else None
        if serial:
            fecha_entrega = parse_date(row["Fecha de entrega"])
            if serial not in serial_dates:
                serial_dates[serial] = []
            serial_dates[serial].append({
                "index": idx,
                "fecha": fecha_entrega,
                "row": row
            })

    # Determinar cuál es el registro activo para cada serial
    active_indices = set()
    for serial, records in serial_dates.items():
        if len(records) > 1:
            # Hay duplicados - encontrar el más reciente
            sorted_records = sorted(records, key=lambda x: x["fecha"] if x["fecha"] else datetime.min, reverse=True)
            active_indices.add(sorted_records[0]["index"])
            print(f"  [INFO] Serial duplicado {serial}: {len(records)} registros, el mas reciente es index {sorted_records[0]['index']}")
        else:
            active_indices.add(records[0]["index"])

    # Ahora procesar todos los registros
    for idx, row in df.iterrows():
        try:
            rut = clean_rut(row["RUT"])
            if not rut or rut not in employees_cache:
                print(f"    [WARN] Empleado no encontrado para RUT: {rut}")
                continue

            employee_id = employees_cache[rut]
            serial = str(row["N° Serie"]).strip() if not pd.isna(row["N° Serie"]) else None

            # Crear asset
            asset_id = str(uuid.uuid4())
            nombre_equipo = str(row["Nombre Equipo"]).strip() if not pd.isna(row.get("Nombre Equipo")) else None

            # Mapear Microsoft 365
            ms365 = "Premium" in str(row.get("Microsoft 365 Empresa", ""))

            # Mapear condición
            condicion = "usado" if "Usado" in str(row.get("Estado", "")) else "nuevo"

            db.cursor.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, nombre_equipo, marca, modelo,
                    procesador, disco_duro, ram, sistema_operativo,
                    microsoft_365, estado, condicion, observaciones,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                asset_id, category_ids["Notebook"], serial, nombre_equipo,
                row["Marca"], row["Modelo"], row.get("Procesador "), row.get("Disco Duro"),
                row.get("RAM"), row.get("O.S."), ms365, "asignado", condicion,
                f"Antivirus: {row.get('Antivirus', 'N/A')}",
                datetime.now(), datetime.now()
            ))
            stats["assets"] += 1

            # Crear assignment
            fecha_entrega = parse_date(row["Fecha de entrega"])
            is_active = idx in active_indices

            assignment_id = str(uuid.uuid4())
            db.cursor.execute("""
                INSERT INTO assignments (
                    id, asset_id, employee_id, fecha_entrega, tipo_movimiento,
                    activo, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                assignment_id, asset_id, employee_id, fecha_entrega or datetime.now(),
                "ingreso", is_active, datetime.now(), datetime.now()
            ))
            stats["assignments"] += 1

            # Crear mantenimiento si hay fechas
            if not pd.isna(row.get("Mantencion")):
                maint_id = str(uuid.uuid4())
                fecha_mant = parse_date(row["Mantencion"])
                proxima_mant = parse_date(row.get("Proxima Mantencion"))

                db.cursor.execute("""
                    INSERT INTO maintenances (
                        id, asset_id, tipo, descripcion, fecha_realizada,
                        proxima_mantencion, estado, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    maint_id, asset_id, "preventiva", "Mantenimiento preventivo programado",
                    fecha_mant, proxima_mant, "completada", datetime.now(), datetime.now()
                ))
                stats["maintenances"] += 1

        except Exception as e:
            print(f"    [ERROR] Error en fila {idx}: {e}")
            stats["errors"].append(f"Notebook row {idx}: {e}")

    db.commit()
    print(f"  [OK] Notebooks migrados: {stats['assets']} assets, {stats['assignments']} asignaciones")


def migrate_notebooks_available(db, category_ids):
    """Migrar notebooks disponibles (sin asignar)"""
    print("\n" + "=" * 80)
    print("PASO 4: Migrando Notebooks Disponibles")
    print("=" * 80)

    filepath = os.path.join(EXCEL_DIR, "Notebook disponibles.xlsx")
    df = pd.read_excel(filepath)

    count = 0
    for idx, row in df.iterrows():
        try:
            asset_id = str(uuid.uuid4())
            serial = str(row["Serie"]).strip() if not pd.isna(row["Serie"]) else None

            # Mapear estado
            estado_map = {
                "Disponible": "disponible",
                "Asignado": "asignado",
                "Reutilizable": "reutilizable",
                "En mantencion": "en_mantencion"
            }
            estado = estado_map.get(row.get("Estado", "Disponible"), "disponible")

            # Mapear condición
            condicion = "usado" if "Usado" in str(row.get("Equipo", "")) else "nuevo"

            db.cursor.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, marca, modelo, procesador,
                    disco_duro, ram, pulgadas, sistema_operativo, ubicacion_fisica,
                    estado, condicion, fecha_compra, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                asset_id, category_ids["Notebook"], serial, row["Marca"], row["Modelo"],
                row.get("Procesador"), row.get("Disco Duro"), row.get("RAM"),
                row.get("Pulgadas"), row.get("O.S"), row.get("Ubicación"),
                estado, condicion, parse_date(row.get("Fecha")),
                datetime.now(), datetime.now()
            ))
            count += 1

        except Exception as e:
            print(f"    [ERROR] Error en fila {idx}: {e}")
            stats["errors"].append(f"Available notebook row {idx}: {e}")

    db.commit()
    print(f"  [OK] Notebooks disponibles migrados: {count}")


def migrate_cellphones(db, category_ids, employees_cache):
    """Migrar celulares"""
    print("\n" + "=" * 80)
    print("PASO 5: Migrando Celulares")
    print("=" * 80)

    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Celulares.xlsx")
    df = pd.read_excel(filepath)

    count_assets = 0
    count_assignments = 0

    for idx, row in df.iterrows():
        try:
            # Algunos celulares no tienen RUT asignado
            rut = clean_rut(row["RUT"]) if not pd.isna(row.get("RUT")) else None
            employee_id = employees_cache.get(rut) if rut else None

            asset_id = str(uuid.uuid4())
            serial = str(row["N° serie"]).strip() if not pd.isna(row.get("N° serie")) else None
            imei = str(row["IMEI "]).strip() if not pd.isna(row.get("IMEI ")) else None
            telefono = str(row["N° Telefono"]).strip() if not pd.isna(row.get("N° Telefono")) else None

            # Mapear condición
            condicion = "usado" if "Usado" in str(row.get("Estado", "")) else "nuevo"

            # Verificar incidencia
            incidencia = row.get("Incidencia")
            estado_activo = "asignado" if employee_id else "disponible"
            observaciones = None

            if not pd.isna(incidencia):
                if "Robo" in str(incidencia) or "Hurto" in str(incidencia):
                    estado_activo = "baja"
                    observaciones = f"Incidencia: {incidencia}"
                elif "Falla" in str(incidencia):
                    estado_activo = "en_mantencion"
                    observaciones = f"Incidencia: {incidencia}"

            db.cursor.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, imei, marca, modelo,
                    numero_telefono, tipo_plan, estado, condicion,
                    observaciones, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                asset_id, category_ids["Celular"], serial, imei, row["Marca"], row["Modelo"],
                telefono, row.get("Operador"), estado_activo, condicion,
                observaciones, datetime.now(), datetime.now()
            ))
            count_assets += 1

            # Crear assignment si tiene empleado
            if employee_id:
                assignment_id = str(uuid.uuid4())
                fecha_entrega = parse_date(row.get("Fecha entrega"))

                db.cursor.execute("""
                    INSERT INTO assignments (
                        id, asset_id, employee_id, fecha_entrega, tipo_movimiento,
                        activo, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    assignment_id, asset_id, employee_id, fecha_entrega or datetime.now(),
                    "ingreso", True, datetime.now(), datetime.now()
                ))
                count_assignments += 1

        except Exception as e:
            print(f"    [ERROR] Error en fila {idx}: {e}")
            stats["errors"].append(f"Cellphone row {idx}: {e}")

    db.commit()
    print(f"  [OK] Celulares migrados: {count_assets} assets, {count_assignments} asignaciones")


def migrate_monitors(db, category_ids, employees_cache):
    """Migrar monitores"""
    print("\n" + "=" * 80)
    print("PASO 6: Migrando Monitores")
    print("=" * 80)

    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Monitor.xlsx")
    df = pd.read_excel(filepath)

    count_assets = 0
    count_assignments = 0

    for idx, row in df.iterrows():
        try:
            rut = clean_rut(row["RUT"]) if not pd.isna(row.get("RUT")) else None
            employee_id = employees_cache.get(rut) if rut else None

            asset_id = str(uuid.uuid4())
            serial = str(row["N° Serie"]).strip() if not pd.isna(row.get("N° Serie")) else None

            condicion = "usado" if "Usado" in str(row.get("Estado", "")) else "nuevo"
            estado_activo = "asignado" if employee_id else "disponible"

            db.cursor.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, marca, modelo, pulgadas,
                    ubicacion_fisica, estado, condicion, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                asset_id, category_ids["Monitor"], serial, row["Marca"], row["Modelo"],
                row.get("Pulgadas"), row.get("Lugar"), estado_activo, condicion,
                datetime.now(), datetime.now()
            ))
            count_assets += 1

            if employee_id:
                assignment_id = str(uuid.uuid4())
                fecha_entrega = parse_date(row.get("Fecha asignado"))

                db.cursor.execute("""
                    INSERT INTO assignments (
                        id, asset_id, employee_id, fecha_entrega, tipo_movimiento,
                        activo, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    assignment_id, asset_id, employee_id, fecha_entrega or datetime.now(),
                    "ingreso", True, datetime.now(), datetime.now()
                ))
                count_assignments += 1

        except Exception as e:
            print(f"    [ERROR] Error en fila {idx}: {e}")
            stats["errors"].append(f"Monitor row {idx}: {e}")

    db.commit()
    print(f"  [OK] Monitores migrados: {count_assets} assets, {count_assignments} asignaciones")


def migrate_mice(db, category_ids, employees_cache):
    """Migrar mouse"""
    print("\n" + "=" * 80)
    print("PASO 7: Migrando Mouse")
    print("=" * 80)

    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Mouse.xlsx")
    df = pd.read_excel(filepath)

    count_assets = 0
    count_assignments = 0

    for idx, row in df.iterrows():
        try:
            rut = clean_rut(row["RUT"]) if not pd.isna(row.get("RUT")) else None
            employee_id = employees_cache.get(rut) if rut else None

            asset_id = str(uuid.uuid4())
            serial = str(row["N° Serie"]).strip() if not pd.isna(row.get("N° Serie")) else None

            condicion = "usado" if "Usado" in str(row.get("Estado", "")) else "nuevo"
            estado_activo = "asignado" if employee_id else "disponible"

            db.cursor.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, marca, modelo,
                    ubicacion_fisica, estado, condicion, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                asset_id, category_ids["Mouse"], serial, row["Marca"], row["Modelo"],
                row.get("Lugar"), estado_activo, condicion,
                datetime.now(), datetime.now()
            ))
            count_assets += 1

            if employee_id:
                assignment_id = str(uuid.uuid4())
                fecha_entrega = parse_date(row.get("Fecha asignado"))

                db.cursor.execute("""
                    INSERT INTO assignments (
                        id, asset_id, employee_id, fecha_entrega, tipo_movimiento,
                        activo, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    assignment_id, asset_id, employee_id, fecha_entrega or datetime.now(),
                    "ingreso", True, datetime.now(), datetime.now()
                ))
                count_assignments += 1

        except Exception as e:
            print(f"    [ERROR] Error en fila {idx}: {e}")
            stats["errors"].append(f"Mouse row {idx}: {e}")

    db.commit()
    print(f"  [OK] Mouse migrados: {count_assets} assets, {count_assignments} asignaciones")


def migrate_headphones(db, category_ids, employees_cache):
    """Migrar audífonos"""
    print("\n" + "=" * 80)
    print("PASO 8: Migrando Audifonos")
    print("=" * 80)

    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Audifonos.xlsx")
    df = pd.read_excel(filepath)

    count_assets = 0
    count_assignments = 0

    for idx, row in df.iterrows():
        try:
            rut = clean_rut(row["RUT"]) if not pd.isna(row.get("RUT")) else None
            employee_id = employees_cache.get(rut) if rut else None

            asset_id = str(uuid.uuid4())
            serial_value = row.get("N° Serie")
            serial = str(int(serial_value)).strip() if not pd.isna(serial_value) and serial_value != "" else None

            condicion = "usado" if "Usado" in str(row.get("Estado", "")) else "nuevo"
            estado_activo = "asignado" if employee_id else "disponible"

            db.cursor.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, marca, modelo,
                    ubicacion_fisica, estado, condicion, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                asset_id, category_ids["Audífonos"], serial, row["Marca"], row["Modelo"],
                row.get("Lugar"), estado_activo, condicion,
                datetime.now(), datetime.now()
            ))
            count_assets += 1

            if employee_id:
                assignment_id = str(uuid.uuid4())
                fecha_entrega = parse_date(row.get("Fecha asignado"))

                db.cursor.execute("""
                    INSERT INTO assignments (
                        id, asset_id, employee_id, fecha_entrega, tipo_movimiento,
                        activo, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    assignment_id, asset_id, employee_id, fecha_entrega or datetime.now(),
                    "ingreso", True, datetime.now(), datetime.now()
                ))
                count_assignments += 1

        except Exception as e:
            print(f"    [ERROR] Error en fila {idx}: {e}")
            stats["errors"].append(f"Headphones row {idx}: {e}")

    db.commit()
    print(f"  [OK] Audifonos migrados: {count_assets} assets, {count_assignments} asignaciones")


def migrate_printers(db, category_ids):
    """Migrar impresoras"""
    print("\n" + "=" * 80)
    print("PASO 9: Migrando Impresoras")
    print("=" * 80)

    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Impresora.xlsx")
    df = pd.read_excel(filepath)

    count = 0
    for idx, row in df.iterrows():
        try:
            asset_id = str(uuid.uuid4())
            serial = str(row["S/N"]).strip() if not pd.isna(row.get("S/N")) else None

            db.cursor.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, marca, modelo,
                    ubicacion_fisica, estado, condicion, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                asset_id, category_ids["Impresora"], serial, row["Marca"], row["Modelo"],
                row.get("Ubicación"), "disponible", "nuevo",
                datetime.now(), datetime.now()
            ))
            count += 1

        except Exception as e:
            print(f"    [ERROR] Error en fila {idx}: {e}")
            stats["errors"].append(f"Printer row {idx}: {e}")

    db.commit()
    print(f"  [OK] Impresoras migradas: {count}")


def migrate_welcome_kits(db, employees_cache):
    """Migrar kits de bienvenida y EPP"""
    print("\n" + "=" * 80)
    print("PASO 10: Migrando Kits de Bienvenida y EPP")
    print("=" * 80)

    # Primero crear los items de kit
    kit_items = [
        ("Plástico Credencial", "kit_bienvenida"),
        ("Porta credencial", "kit_bienvenida"),
        ("Cinta Porta credencial", "kit_bienvenida"),
        ("EPP - Reposa muñequero", "epp"),
        ("EPP - Mouse pad", "epp"),
        ("Agenda", "kit_bienvenida"),
        ("Taza", "kit_bienvenida"),
        ("Mochila", "kit_bienvenida"),
    ]

    item_ids = {}
    for nombre, categoria in kit_items:
        try:
            item_id = str(uuid.uuid4())
            db.cursor.execute("""
                INSERT INTO welcome_kit_items (id, nombre, categoria, created_at)
                VALUES (%s, %s, %s, %s)
                RETURNING id
            """, (item_id, nombre, categoria, datetime.now()))

            result = db.cursor.fetchone()
            item_ids[nombre] = result[0]
            stats["welcome_kit_items"] += 1
            print(f"  [OK] Item de kit creado: {nombre}")

        except Exception as e:
            print(f"  [ERROR] Error al crear item {nombre}: {e}")
            stats["errors"].append(f"Kit item {nombre}: {e}")

    db.commit()

    # Ahora migrar las asignaciones
    filepath = os.path.join(EXCEL_DIR, "Inventario Kit +EPP + Mochila.xlsx")
    df = pd.read_excel(filepath)

    count = 0
    for idx, row in df.iterrows():
        try:
            rut = clean_rut(row["RUT"])
            if not rut or rut not in employees_cache:
                continue

            employee_id = employees_cache[rut]
            fecha_entrega = parse_date(row["Fecha"])

            # Mapear columnas Excel a items
            item_mapping = {
                "Plastico \nCredencial": "Plástico Credencial",
                "Porta\ncredencial": "Porta credencial",
                "Cinta \nPorta\ncredencial": "Cinta Porta credencial",
                "EPP-\nReposa \nmuñequero": "EPP - Reposa muñequero",
                "EPP-\nmouse\npad": "EPP - Mouse pad",
                "Agenda": "Agenda",
                "Tazas": "Taza",
                "Mochila": "Mochila",
            }

            for excel_col, item_name in item_mapping.items():
                if excel_col in row and row[excel_col] == 1:
                    kit_assign_id = str(uuid.uuid4())
                    db.cursor.execute("""
                        INSERT INTO kit_assignments (
                            id, employee_id, item_id, fecha_entrega, estado, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                    """, (
                        kit_assign_id, employee_id, item_ids[item_name],
                        fecha_entrega or datetime.now(), "entregado", datetime.now()
                    ))
                    count += 1

        except Exception as e:
            print(f"    [ERROR] Error en fila {idx}: {e}")
            stats["errors"].append(f"Kit assignment row {idx}: {e}")

    stats["kit_assignments"] = count
    db.commit()
    print(f"  [OK] Asignaciones de kit migradas: {count}")


def migrate_terminations(db, employees_cache):
    """Migrar desvinculaciones"""
    print("\n" + "=" * 80)
    print("PASO 11: Migrando Desvinculaciones")
    print("=" * 80)

    filepath = os.path.join(EXCEL_DIR, "Registro desvinculaciones.xlsx")
    df = pd.read_excel(filepath)

    count = 0
    for idx, row in df.iterrows():
        try:
            rut = clean_rut(row["RUT"])
            if not rut or rut not in employees_cache:
                print(f"    [WARN] Empleado no encontrado: {rut}")
                continue

            employee_id = employees_cache[rut]

            # Mapear estados
            def map_estado(valor):
                if pd.isna(valor):
                    return "pendiente"
                if "OK" in str(valor).upper():
                    return "ok"
                if "SIN CARGADOR" in str(valor).upper() or "INCOMPLETO" in str(valor).upper():
                    return "incompleto"
                if "DAÑADO" in str(valor).upper() or "DANADO" in str(valor).upper():
                    return "dañado"
                if "-" in str(valor) or "N/A" in str(valor).upper():
                    return "no_aplica"
                return "pendiente"

            estado_notebook = map_estado(row.get("Estado Notebook"))
            estado_celular = map_estado(row.get("Estado Celular"))
            estado_monitor = map_estado(row.get("Estado Monitor"))

            term_id = str(uuid.uuid4())
            db.cursor.execute("""
                INSERT INTO terminations (
                    id, employee_id, fecha_desvinculacion, fecha_devolucion_equipos,
                    estado_notebook, estado_celular, estado_monitor, estado_kit,
                    recibido_por, lugar_devolucion, observaciones,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                term_id, employee_id,
                parse_date(row["Fecha des."]), parse_date(row.get("Fecha dev.")),
                estado_notebook, estado_celular, estado_monitor, "no_aplica",
                row.get("Recibe"), row.get("Lugar Entrega"), row.get("Observación"),
                datetime.now(), datetime.now()
            ))
            count += 1

            # Actualizar estado del empleado
            db.cursor.execute("""
                UPDATE employees SET estado = 'desvinculado', updated_at = %s
                WHERE id = %s
            """, (datetime.now(), employee_id))

            # Cerrar asignaciones activas
            db.cursor.execute("""
                UPDATE assignments
                SET activo = false, fecha_devolucion = %s, updated_at = %s
                WHERE employee_id = %s AND activo = true
            """, (parse_date(row.get("Fecha dev.")) or datetime.now(), datetime.now(), employee_id))

        except Exception as e:
            print(f"    [ERROR] Error en fila {idx}: {e}")
            stats["errors"].append(f"Termination row {idx}: {e}")

    stats["terminations"] = count
    db.commit()
    print(f"  [OK] Desvinculaciones migradas: {count}")


def generate_report():
    """Generar reporte final de migración"""
    print("\n" + "=" * 80)
    print("REPORTE FINAL DE MIGRACION")
    print("=" * 80)

    print(f"\nRegistros migrados:")
    print(f"  - Categorias de activos: {stats['asset_categories']}")
    print(f"  - Empleados: {stats['employees']}")
    print(f"  - Activos: {stats['assets']}")
    print(f"  - Asignaciones: {stats['assignments']}")
    print(f"  - Items de kit: {stats['welcome_kit_items']}")
    print(f"  - Asignaciones de kit: {stats['kit_assignments']}")
    print(f"  - Desvinculaciones: {stats['terminations']}")
    print(f"  - Mantenciones: {stats['maintenances']}")

    total = sum([
        stats['asset_categories'],
        stats['employees'],
        stats['assets'],
        stats['assignments'],
        stats['welcome_kit_items'],
        stats['kit_assignments'],
        stats['terminations'],
        stats['maintenances']
    ])

    print(f"\nTOTAL DE REGISTROS: {total}")

    if stats['errors']:
        print(f"\n[WARN] Se encontraron {len(stats['errors'])} errores durante la migracion:")
        for i, error in enumerate(stats['errors'][:10], 1):
            print(f"  {i}. {error}")
        if len(stats['errors']) > 10:
            print(f"  ... y {len(stats['errors']) - 10} errores mas")
    else:
        print("\n[OK] Migracion completada sin errores!")

    # Guardar reporte en archivo
    report_file = "migration_report.json"
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump({
            "fecha": datetime.now().isoformat(),
            "estadisticas": stats,
            "total_registros": total
        }, f, indent=2, ensure_ascii=False)

    print(f"\n[OK] Reporte guardado en: {report_file}")
    print("=" * 80)


def main():
    """Función principal"""
    print("\n" + "=" * 80)
    print("MIGRACION DE DATOS - SISTEMA DE INVENTARIO")
    print("=" * 80)
    print(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)

    # Verificar DATABASE_URL
    if not DATABASE_URL:
        print("[ERROR] DATABASE_URL no configurada en archivo .env")
        return

    # Conectar a la base de datos
    db = DatabaseConnection(DATABASE_URL)
    if not db.connect():
        return

    try:
        # Ejecutar migración
        category_ids = create_asset_categories(db)
        employees_cache = migrate_all_employees(db)

        migrate_printers(db, category_ids)
        migrate_notebooks_available(db, category_ids)
        migrate_notebooks_assigned(db, category_ids, employees_cache)
        migrate_cellphones(db, category_ids, employees_cache)
        migrate_monitors(db, category_ids, employees_cache)
        migrate_mice(db, category_ids, employees_cache)
        migrate_headphones(db, category_ids, employees_cache)

        migrate_welcome_kits(db, employees_cache)
        migrate_terminations(db, employees_cache)

        # Generar reporte
        generate_report()

    except Exception as e:
        print(f"\n[ERROR] Error crítico durante la migración: {e}")
        db.rollback()
        stats["errors"].append(f"Critical error: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
