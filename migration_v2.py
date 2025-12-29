"""
Script de Migracion de Datos v2 - Corregido
Sistema de Inventario de Equipos
"""

import pandas as pd
import psycopg2
from datetime import datetime
import os
import json
import uuid
from dotenv import load_dotenv

load_dotenv()

EXCEL_DIR = r"C:\Users\nanon\OneDrive\Documentos\GitHub\Inventario_Equipo\excel"
DATABASE_URL = os.getenv("DATABASE_URL")

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
    def __init__(self, connection_string):
        self.connection_string = connection_string
        self.conn = None

    def connect(self):
        try:
            self.conn = psycopg2.connect(self.connection_string)
            self.conn.autocommit = True  # Autocommit para evitar transacciones bloqueadas
            print("[OK] Conexion establecida")
            return True
        except Exception as e:
            print(f"[ERROR] No se pudo conectar: {e}")
            return False

    def execute(self, query, params=None):
        """Ejecutar query con manejo de errores"""
        cursor = self.conn.cursor()
        try:
            cursor.execute(query, params)
            return cursor
        except Exception as e:
            raise e
        finally:
            pass  # No cerrar cursor para fetchone

    def close(self):
        if self.conn:
            self.conn.close()


def clean_rut(rut):
    if pd.isna(rut):
        return None
    rut_str = str(rut).strip()
    rut_clean = rut_str.replace(".", "").replace("-", "").replace(" ", "")
    if len(rut_clean) < 2:
        return None
    dv = rut_clean[-1].upper()
    num = rut_clean[:-1]
    # Formatear con puntos
    formatted = ""
    for i, digit in enumerate(reversed(num)):
        if i > 0 and i % 3 == 0:
            formatted = "." + formatted
        formatted = digit + formatted
    return f"{formatted}-{dv}"


def parse_date(date_value):
    if pd.isna(date_value):
        return None
    if isinstance(date_value, datetime):
        return date_value
    try:
        return pd.to_datetime(str(date_value))
    except:
        return None


def safe_str(value):
    """Convertir valor a string de forma segura"""
    if pd.isna(value):
        return None
    if isinstance(value, float):
        # Si es entero, quitarle el .0
        if value == int(value):
            return str(int(value))
        return str(value)
    return str(value).strip()


def create_categories(db):
    print("\n=== CREANDO CATEGORIAS ===")
    categories = [
        ("Notebook", "Computador portatil", True, False),
        ("Celular", "Telefono celular corporativo", True, True),
        ("Monitor", "Monitor/Pantalla", True, False),
        ("Mouse", "Mouse inalambrico", True, False),
        ("Audifonos", "Audifonos/Headset", False, False),
        ("Impresora", "Impresora multifuncional", True, False),
    ]

    category_ids = {}
    for nombre, descripcion, req_serie, req_imei in categories:
        try:
            cat_id = str(uuid.uuid4())
            cursor = db.execute("""
                INSERT INTO asset_categories (id, nombre, descripcion, requiere_serie, requiere_imei, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion
                RETURNING id
            """, (cat_id, nombre, descripcion, req_serie, req_imei, datetime.now()))
            result = cursor.fetchone()
            category_ids[nombre] = result[0]
            stats["asset_categories"] += 1
            print(f"  [OK] {nombre}")
        except Exception as e:
            print(f"  [ERROR] {nombre}: {e}")
            stats["errors"].append(f"Category {nombre}: {e}")

    return category_ids


def migrate_employees(db):
    print("\n=== MIGRANDO EMPLEADOS ===")
    employees_cache = {}

    files = [
        "Consolidado inventario Notebook (1).xlsx",
        "Consolidado inventario Celulares.xlsx",
        "Consolidado inventario Monitor.xlsx",
        "Consolidado inventario Mouse.xlsx",
        "Consolidado inventario Audifonos.xlsx",
        "Inventario Kit +EPP + Mochila.xlsx",
        "Registro desvinculaciones.xlsx"
    ]

    for filename in files:
        filepath = os.path.join(EXCEL_DIR, filename)
        if not os.path.exists(filepath):
            continue

        print(f"  Procesando: {filename}")
        try:
            df = pd.read_excel(filepath)

            for _, row in df.iterrows():
                rut_col = None
                for col in ["RUT", "Rut"]:
                    if col in row:
                        rut_col = col
                        break

                if not rut_col or pd.isna(row[rut_col]):
                    continue

                rut = clean_rut(row[rut_col])
                if not rut or rut in employees_cache:
                    continue

                nombre = safe_str(row.get("Nombre", "")) or ""
                apellido_p = safe_str(row.get("Apellido P.", "")) or ""
                apellido_m = safe_str(row.get("Apellido M.", ""))

                correo = safe_str(row.get("Correo", ""))
                if not correo:
                    correo = f"{rut.replace('.', '').replace('-', '')}@temp.com"
                correo = correo.lower()

                try:
                    emp_id = str(uuid.uuid4())
                    cursor = db.execute("""
                        INSERT INTO employees (
                            id, rut, nombre, apellido_paterno, apellido_materno, correo,
                            cargo, jefatura, supervisor, ubicacion, tipo_contrato,
                            estado, telefono_contacto, created_at, updated_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (rut) DO NOTHING
                        RETURNING id
                    """, (
                        emp_id, rut, nombre, apellido_p, apellido_m, correo,
                        safe_str(row.get("Cargo")), safe_str(row.get("Jefatura")),
                        safe_str(row.get("Supervisor")), safe_str(row.get("Comuna")),
                        "planta", "activo", safe_str(row.get("Contacto")),
                        datetime.now(), datetime.now()
                    ))

                    result = cursor.fetchone()
                    if result:
                        employees_cache[rut] = result[0]
                        stats["employees"] += 1
                    else:
                        # Ya existe, obtener ID
                        cursor = db.execute("SELECT id FROM employees WHERE rut = %s", (rut,))
                        emp_result = cursor.fetchone()
                        if emp_result:
                            employees_cache[rut] = emp_result[0]

                except Exception as e:
                    stats["errors"].append(f"Employee {rut}: {e}")

        except Exception as e:
            print(f"    [ERROR] {filename}: {e}")

    print(f"  Total empleados: {stats['employees']}")
    return employees_cache


def migrate_printers(db, category_ids):
    print("\n=== MIGRANDO IMPRESORAS ===")
    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Impresora.xlsx")
    df = pd.read_excel(filepath)

    count = 0
    for idx, row in df.iterrows():
        try:
            serial = safe_str(row.get("S/N"))
            if not serial:
                serial = f"IMP-{uuid.uuid4().hex[:8]}"

            asset_id = str(uuid.uuid4())
            db.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, marca, modelo,
                    ubicacion_fisica, estado, condicion, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (numero_serie) DO NOTHING
            """, (
                asset_id, category_ids["Impresora"], serial,
                safe_str(row.get("Marca")) or "Sin marca",
                safe_str(row.get("Modelo")) or "Sin modelo",
                safe_str(row.get("Ubicacion")), "disponible", "nuevo",
                datetime.now(), datetime.now()
            ))
            count += 1
            stats["assets"] += 1
        except Exception as e:
            stats["errors"].append(f"Printer {idx}: {e}")

    print(f"  Impresoras: {count}")


def migrate_notebooks_available(db, category_ids):
    print("\n=== MIGRANDO NOTEBOOKS DISPONIBLES ===")
    filepath = os.path.join(EXCEL_DIR, "Notebook disponibles.xlsx")
    df = pd.read_excel(filepath)

    count = 0
    for idx, row in df.iterrows():
        try:
            serial = safe_str(row.get("Serie"))
            if not serial:
                serial = f"NB-DISP-{uuid.uuid4().hex[:8]}"

            # Mapear estado
            estado_excel = safe_str(row.get("Estado")) or "Disponible"
            estado_map = {
                "Disponible": "disponible",
                "Asignado": "asignado",
                "Reutilizable": "reutilizable",
                "En mantencion": "en_mantencion"
            }
            estado = estado_map.get(estado_excel, "disponible")

            condicion = "usado" if "Usado" in str(row.get("Equipo", "")) else "nuevo"

            asset_id = str(uuid.uuid4())
            db.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, marca, modelo, procesador,
                    disco_duro, ram, pulgadas, sistema_operativo, ubicacion_fisica,
                    estado, condicion, fecha_compra, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (numero_serie) DO NOTHING
            """, (
                asset_id, category_ids["Notebook"], serial,
                safe_str(row.get("Marca")) or "Sin marca",
                safe_str(row.get("Modelo")) or "Sin modelo",
                safe_str(row.get("Procesador")), safe_str(row.get("Disco Duro")),
                safe_str(row.get("RAM")), row.get("Pulgadas"),
                safe_str(row.get("O.S")), safe_str(row.get("Ubicacion")),
                estado, condicion, parse_date(row.get("Fecha")),
                datetime.now(), datetime.now()
            ))
            count += 1
            stats["assets"] += 1
        except Exception as e:
            stats["errors"].append(f"NB disponible {idx}: {e}")

    print(f"  Notebooks disponibles: {count}")


def migrate_notebooks_assigned(db, category_ids, employees_cache):
    print("\n=== MIGRANDO NOTEBOOKS ASIGNADOS ===")
    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Notebook (1).xlsx")
    df = pd.read_excel(filepath)

    # Rastrear seriales ya procesados para evitar duplicados
    processed_serials = set()

    count_assets = 0
    count_assignments = 0

    for idx, row in df.iterrows():
        try:
            rut = clean_rut(row.get("RUT"))
            if not rut:
                continue

            employee_id = employees_cache.get(rut)
            if not employee_id:
                continue

            serial = safe_str(row.get("N\u00b0 Serie"))
            if not serial:
                serial = f"NB-{uuid.uuid4().hex[:8]}"

            # Si ya procesamos este serial, solo crear assignment
            if serial in processed_serials:
                # Buscar el asset existente
                cursor = db.execute("SELECT id FROM assets WHERE numero_serie = %s", (serial,))
                result = cursor.fetchone()
                if result:
                    asset_id = result[0]
                    # Crear nuevo assignment (historico)
                    assignment_id = str(uuid.uuid4())
                    fecha_entrega = parse_date(row.get("Fecha de entrega"))
                    db.execute("""
                        INSERT INTO assignments (
                            id, asset_id, employee_id, fecha_entrega, tipo_movimiento,
                            activo, created_at, updated_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        assignment_id, asset_id, employee_id,
                        fecha_entrega or datetime.now(),
                        "cambio", False, datetime.now(), datetime.now()
                    ))
                    count_assignments += 1
                continue

            processed_serials.add(serial)

            # Crear asset
            asset_id = str(uuid.uuid4())
            nombre_equipo = safe_str(row.get("Nombre Equipo"))
            ms365 = "Premium" in str(row.get("Microsoft 365 Empresa", ""))
            condicion = "usado" if "Usado" in str(row.get("Estado", "")) else "nuevo"

            db.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, nombre_equipo, marca, modelo,
                    procesador, disco_duro, ram, sistema_operativo,
                    microsoft_365, estado, condicion, observaciones,
                    empleado_actual_id, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (numero_serie) DO UPDATE SET
                    empleado_actual_id = EXCLUDED.empleado_actual_id,
                    estado = EXCLUDED.estado
            """, (
                asset_id, category_ids["Notebook"], serial, nombre_equipo,
                safe_str(row.get("Marca")) or "Sin marca",
                safe_str(row.get("Modelo")) or "Sin modelo",
                safe_str(row.get("Procesador ")), safe_str(row.get("Disco Duro")),
                safe_str(row.get("RAM")), safe_str(row.get("O.S.")),
                ms365, "asignado", condicion,
                f"Antivirus: {row.get('Antivirus', 'N/A')}",
                employee_id, datetime.now(), datetime.now()
            ))
            count_assets += 1
            stats["assets"] += 1

            # Crear assignment activo
            assignment_id = str(uuid.uuid4())
            fecha_entrega = parse_date(row.get("Fecha de entrega"))

            db.execute("""
                INSERT INTO assignments (
                    id, asset_id, employee_id, fecha_entrega, tipo_movimiento,
                    activo, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                assignment_id, asset_id, employee_id,
                fecha_entrega or datetime.now(),
                "ingreso", True, datetime.now(), datetime.now()
            ))
            count_assignments += 1
            stats["assignments"] += 1

        except Exception as e:
            stats["errors"].append(f"Notebook {idx}: {e}")

    print(f"  Notebooks: {count_assets}, Asignaciones: {count_assignments}")


def migrate_cellphones(db, category_ids, employees_cache):
    print("\n=== MIGRANDO CELULARES ===")
    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Celulares.xlsx")
    df = pd.read_excel(filepath)

    count_assets = 0
    count_assignments = 0
    processed_serials = set()

    for idx, row in df.iterrows():
        try:
            serial = safe_str(row.get("N\u00b0 serie"))
            if not serial:
                serial = f"CEL-{uuid.uuid4().hex[:8]}"

            if serial in processed_serials:
                continue
            processed_serials.add(serial)

            rut = clean_rut(row.get("RUT")) if not pd.isna(row.get("RUT")) else None
            employee_id = employees_cache.get(rut) if rut else None

            imei = safe_str(row.get("IMEI "))
            telefono = safe_str(row.get("N\u00b0 Telefono"))
            condicion = "usado" if "Usado" in str(row.get("Estado", "")) else "nuevo"

            # Verificar incidencia
            incidencia = row.get("Incidencia")
            estado_activo = "asignado" if employee_id else "disponible"
            observaciones = None

            if not pd.isna(incidencia):
                inc_str = str(incidencia)
                if "Robo" in inc_str or "Hurto" in inc_str:
                    estado_activo = "baja"
                    observaciones = f"Incidencia: {incidencia}"
                elif "Falla" in inc_str:
                    estado_activo = "en_mantencion"
                    observaciones = f"Incidencia: {incidencia}"

            asset_id = str(uuid.uuid4())
            db.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, imei, marca, modelo,
                    numero_telefono, tipo_plan, estado, condicion,
                    observaciones, empleado_actual_id, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (numero_serie) DO NOTHING
            """, (
                asset_id, category_ids["Celular"], serial, imei,
                safe_str(row.get("Marca")) or "Sin marca",
                safe_str(row.get("Modelo")) or "Sin modelo",
                telefono, safe_str(row.get("Operador")),
                estado_activo, condicion, observaciones,
                employee_id, datetime.now(), datetime.now()
            ))
            count_assets += 1
            stats["assets"] += 1

            if employee_id:
                assignment_id = str(uuid.uuid4())
                fecha_entrega = parse_date(row.get("Fecha entrega"))

                db.execute("""
                    INSERT INTO assignments (
                        id, asset_id, employee_id, fecha_entrega, tipo_movimiento,
                        activo, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    assignment_id, asset_id, employee_id,
                    fecha_entrega or datetime.now(),
                    "ingreso", True, datetime.now(), datetime.now()
                ))
                count_assignments += 1
                stats["assignments"] += 1

        except Exception as e:
            stats["errors"].append(f"Celular {idx}: {e}")

    print(f"  Celulares: {count_assets}, Asignaciones: {count_assignments}")


def migrate_monitors(db, category_ids, employees_cache):
    print("\n=== MIGRANDO MONITORES ===")
    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Monitor.xlsx")
    df = pd.read_excel(filepath)

    count_assets = 0
    count_assignments = 0
    processed_serials = set()

    for idx, row in df.iterrows():
        try:
            serial = safe_str(row.get("N\u00b0 Serie"))
            if not serial:
                serial = f"MON-{uuid.uuid4().hex[:8]}"

            if serial in processed_serials:
                continue
            processed_serials.add(serial)

            rut = clean_rut(row.get("RUT")) if not pd.isna(row.get("RUT")) else None
            employee_id = employees_cache.get(rut) if rut else None

            condicion = "usado" if "Usado" in str(row.get("Estado", "")) else "nuevo"
            estado_activo = "asignado" if employee_id else "disponible"

            asset_id = str(uuid.uuid4())
            db.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, marca, modelo, pulgadas,
                    ubicacion_fisica, estado, condicion, empleado_actual_id,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (numero_serie) DO NOTHING
            """, (
                asset_id, category_ids["Monitor"], serial,
                safe_str(row.get("Marca")) or "Sin marca",
                safe_str(row.get("Modelo")) or "Sin modelo",
                row.get("Pulgadas"), safe_str(row.get("Lugar")),
                estado_activo, condicion, employee_id,
                datetime.now(), datetime.now()
            ))
            count_assets += 1
            stats["assets"] += 1

            if employee_id:
                assignment_id = str(uuid.uuid4())
                fecha_entrega = parse_date(row.get("Fecha asignado"))

                db.execute("""
                    INSERT INTO assignments (
                        id, asset_id, employee_id, fecha_entrega, tipo_movimiento,
                        activo, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    assignment_id, asset_id, employee_id,
                    fecha_entrega or datetime.now(),
                    "ingreso", True, datetime.now(), datetime.now()
                ))
                count_assignments += 1
                stats["assignments"] += 1

        except Exception as e:
            stats["errors"].append(f"Monitor {idx}: {e}")

    print(f"  Monitores: {count_assets}, Asignaciones: {count_assignments}")


def migrate_mice(db, category_ids, employees_cache):
    print("\n=== MIGRANDO MOUSE ===")
    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Mouse.xlsx")
    df = pd.read_excel(filepath)

    count_assets = 0
    count_assignments = 0

    for idx, row in df.iterrows():
        try:
            serial = safe_str(row.get("N\u00b0 Serie"))
            if not serial:
                serial = f"MOU-{uuid.uuid4().hex[:8]}"

            rut = clean_rut(row.get("RUT")) if not pd.isna(row.get("RUT")) else None
            employee_id = employees_cache.get(rut) if rut else None

            condicion = "usado" if "Usado" in str(row.get("Estado", "")) else "nuevo"
            estado_activo = "asignado" if employee_id else "disponible"

            asset_id = str(uuid.uuid4())
            db.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, marca, modelo,
                    ubicacion_fisica, estado, condicion, empleado_actual_id,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (numero_serie) DO NOTHING
            """, (
                asset_id, category_ids["Mouse"], serial,
                safe_str(row.get("Marca")) or "Sin marca",
                safe_str(row.get("Modelo")) or "Sin modelo",
                safe_str(row.get("Lugar")), estado_activo, condicion,
                employee_id, datetime.now(), datetime.now()
            ))
            count_assets += 1
            stats["assets"] += 1

            if employee_id:
                assignment_id = str(uuid.uuid4())
                fecha_entrega = parse_date(row.get("Fecha asignado"))

                db.execute("""
                    INSERT INTO assignments (
                        id, asset_id, employee_id, fecha_entrega, tipo_movimiento,
                        activo, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    assignment_id, asset_id, employee_id,
                    fecha_entrega or datetime.now(),
                    "ingreso", True, datetime.now(), datetime.now()
                ))
                count_assignments += 1
                stats["assignments"] += 1

        except Exception as e:
            stats["errors"].append(f"Mouse {idx}: {e}")

    print(f"  Mouse: {count_assets}, Asignaciones: {count_assignments}")


def migrate_headphones(db, category_ids, employees_cache):
    print("\n=== MIGRANDO AUDIFONOS ===")
    filepath = os.path.join(EXCEL_DIR, "Consolidado inventario Audifonos.xlsx")
    df = pd.read_excel(filepath)

    count_assets = 0
    count_assignments = 0

    for idx, row in df.iterrows():
        try:
            serial_val = row.get("N\u00b0 Serie")
            if pd.isna(serial_val) or serial_val == "":
                serial = f"AUD-{uuid.uuid4().hex[:8]}"
            else:
                serial = str(int(serial_val)) if isinstance(serial_val, float) else str(serial_val)

            rut = clean_rut(row.get("RUT")) if not pd.isna(row.get("RUT")) else None
            employee_id = employees_cache.get(rut) if rut else None

            condicion = "usado" if "Usado" in str(row.get("Estado", "")) else "nuevo"
            estado_activo = "asignado" if employee_id else "disponible"

            asset_id = str(uuid.uuid4())
            db.execute("""
                INSERT INTO assets (
                    id, categoria_id, numero_serie, marca, modelo,
                    ubicacion_fisica, estado, condicion, empleado_actual_id,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (numero_serie) DO NOTHING
            """, (
                asset_id, category_ids["Audifonos"], serial,
                safe_str(row.get("Marca")) or "Sin marca",
                safe_str(row.get("Modelo")) or "Sin modelo",
                safe_str(row.get("Lugar")), estado_activo, condicion,
                employee_id, datetime.now(), datetime.now()
            ))
            count_assets += 1
            stats["assets"] += 1

            if employee_id:
                assignment_id = str(uuid.uuid4())
                fecha_entrega = parse_date(row.get("Fecha asignado"))

                db.execute("""
                    INSERT INTO assignments (
                        id, asset_id, employee_id, fecha_entrega, tipo_movimiento,
                        activo, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    assignment_id, asset_id, employee_id,
                    fecha_entrega or datetime.now(),
                    "ingreso", True, datetime.now(), datetime.now()
                ))
                count_assignments += 1
                stats["assignments"] += 1

        except Exception as e:
            stats["errors"].append(f"Audifonos {idx}: {e}")

    print(f"  Audifonos: {count_assets}, Asignaciones: {count_assignments}")


def migrate_welcome_kits(db, employees_cache):
    print("\n=== MIGRANDO KITS DE BIENVENIDA ===")

    kit_items = [
        ("Plastico Credencial", "kit_bienvenida"),
        ("Porta credencial", "kit_bienvenida"),
        ("Cinta Porta credencial", "kit_bienvenida"),
        ("EPP - Reposa munequero", "epp"),
        ("EPP - Mouse pad", "epp"),
        ("Agenda", "kit_bienvenida"),
        ("Taza", "kit_bienvenida"),
        ("Mochila", "kit_bienvenida"),
    ]

    item_ids = {}
    for nombre, categoria in kit_items:
        try:
            item_id = str(uuid.uuid4())
            cursor = db.execute("""
                INSERT INTO welcome_kit_items (id, nombre, categoria, created_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING id
            """, (item_id, nombre, categoria, datetime.now()))
            result = cursor.fetchone()
            if result:
                item_ids[nombre] = result[0]
                stats["welcome_kit_items"] += 1
        except Exception as e:
            stats["errors"].append(f"Kit item {nombre}: {e}")

    # Migrar asignaciones
    filepath = os.path.join(EXCEL_DIR, "Inventario Kit +EPP + Mochila.xlsx")
    df = pd.read_excel(filepath)

    count = 0
    for idx, row in df.iterrows():
        try:
            rut = clean_rut(row.get("RUT"))
            if not rut or rut not in employees_cache:
                continue

            employee_id = employees_cache[rut]
            fecha_entrega = parse_date(row.get("Fecha"))

            item_mapping = {
                "Plastico \nCredencial": "Plastico Credencial",
                "Porta\ncredencial": "Porta credencial",
                "Cinta \nPorta\ncredencial": "Cinta Porta credencial",
                "EPP-\nReposa \nmunequero": "EPP - Reposa munequero",
                "EPP-\nmouse\npad": "EPP - Mouse pad",
                "Agenda": "Agenda",
                "Tazas": "Taza",
                "Mochila": "Mochila",
            }

            for excel_col, item_name in item_mapping.items():
                if excel_col in row and row[excel_col] == 1 and item_name in item_ids:
                    kit_assign_id = str(uuid.uuid4())
                    db.execute("""
                        INSERT INTO kit_assignments (
                            id, employee_id, item_id, fecha_entrega, estado, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                    """, (
                        kit_assign_id, employee_id, item_ids[item_name],
                        fecha_entrega or datetime.now(), "entregado", datetime.now()
                    ))
                    count += 1

        except Exception as e:
            stats["errors"].append(f"Kit assignment {idx}: {e}")

    stats["kit_assignments"] = count
    print(f"  Items de kit: {stats['welcome_kit_items']}, Asignaciones: {count}")


def migrate_terminations(db, employees_cache):
    print("\n=== MIGRANDO DESVINCULACIONES ===")
    filepath = os.path.join(EXCEL_DIR, "Registro desvinculaciones.xlsx")
    df = pd.read_excel(filepath)

    count = 0
    for idx, row in df.iterrows():
        try:
            rut = clean_rut(row.get("RUT"))
            if not rut or rut not in employees_cache:
                continue

            employee_id = employees_cache[rut]

            # Mapear estados usando valores validos del enum
            def map_estado(valor):
                if pd.isna(valor):
                    return "pendiente"
                val_str = str(valor).upper()
                if "OK" in val_str:
                    return "ok"
                if "SIN CARGADOR" in val_str or "INCOMPLETO" in val_str:
                    return "pendiente"  # No existe 'incompleto' en el enum
                if "DANADO" in val_str or "DAÑADO" in val_str:
                    return "danado"
                if "-" in str(valor) or "N/A" in val_str:
                    return "no_aplica"
                return "pendiente"

            term_id = str(uuid.uuid4())
            db.execute("""
                INSERT INTO terminations (
                    id, employee_id, fecha_desvinculacion, fecha_devolucion_equipos,
                    estado_notebook, estado_celular, estado_monitor, estado_kit,
                    recibido_por, lugar_devolucion, observaciones,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                term_id, employee_id,
                parse_date(row.get("Fecha des.")), parse_date(row.get("Fecha dev.")),
                map_estado(row.get("Estado Notebook")),
                map_estado(row.get("Estado Celular")),
                map_estado(row.get("Estado Monitor")),
                "no_aplica",
                safe_str(row.get("Recibe")), safe_str(row.get("Lugar Entrega")),
                safe_str(row.get("Observacion")),
                datetime.now(), datetime.now()
            ))
            count += 1

            # Actualizar estado del empleado
            db.execute("""
                UPDATE employees SET estado = 'desvinculado', updated_at = %s
                WHERE id = %s
            """, (datetime.now(), employee_id))

        except Exception as e:
            stats["errors"].append(f"Termination {idx}: {e}")

    stats["terminations"] = count
    print(f"  Desvinculaciones: {count}")


def generate_report():
    print("\n" + "=" * 60)
    print("REPORTE FINAL DE MIGRACION")
    print("=" * 60)

    print(f"\nRegistros migrados:")
    print(f"  - Categorias: {stats['asset_categories']}")
    print(f"  - Empleados: {stats['employees']}")
    print(f"  - Activos: {stats['assets']}")
    print(f"  - Asignaciones: {stats['assignments']}")
    print(f"  - Items de kit: {stats['welcome_kit_items']}")
    print(f"  - Asignaciones kit: {stats['kit_assignments']}")
    print(f"  - Desvinculaciones: {stats['terminations']}")

    total = sum([
        stats['asset_categories'], stats['employees'], stats['assets'],
        stats['assignments'], stats['welcome_kit_items'],
        stats['kit_assignments'], stats['terminations']
    ])

    print(f"\nTOTAL: {total} registros")

    if stats['errors']:
        print(f"\n[WARN] {len(stats['errors'])} errores:")
        for err in stats['errors'][:5]:
            print(f"  - {err}")
        if len(stats['errors']) > 5:
            print(f"  ... y {len(stats['errors']) - 5} mas")
    else:
        print("\n[OK] Migracion completada sin errores!")

    with open("migration_report_v2.json", 'w', encoding='utf-8') as f:
        json.dump({
            "fecha": datetime.now().isoformat(),
            "estadisticas": stats,
            "total_registros": total
        }, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 60)


def main():
    print("\n" + "=" * 60)
    print("MIGRACION DE DATOS v2 - SISTEMA DE INVENTARIO")
    print(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    if not DATABASE_URL:
        print("[ERROR] DATABASE_URL no configurada")
        return

    db = DatabaseConnection(DATABASE_URL)
    if not db.connect():
        return

    try:
        category_ids = create_categories(db)
        employees_cache = migrate_employees(db)

        migrate_printers(db, category_ids)
        migrate_notebooks_available(db, category_ids)
        migrate_notebooks_assigned(db, category_ids, employees_cache)
        migrate_cellphones(db, category_ids, employees_cache)
        migrate_monitors(db, category_ids, employees_cache)
        migrate_mice(db, category_ids, employees_cache)
        migrate_headphones(db, category_ids, employees_cache)

        migrate_welcome_kits(db, employees_cache)
        migrate_terminations(db, employees_cache)

        generate_report()

    except Exception as e:
        print(f"\n[ERROR] Error critico: {e}")
        stats["errors"].append(f"Critical: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
