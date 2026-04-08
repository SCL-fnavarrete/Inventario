# Plan: Migración de datos Excel Febrero 2026 a Producción

## Contexto

El Excel `Consolidado inventario Notebook_23022026.xlsx` tiene 230 notebooks actualizado a Febrero 2026. Se necesita **borrar todos los datos existentes** (NO tablas ni usuarios del sistema) y cargar los datos del Excel. La plataforma está en Vercel + PostgreSQL en Neon.

---

## Resumen del Excel

- **230 filas**, todas "Notebook", **0 duplicados** en N° Serie
- **161 equipos asignados** a personas (158 empleados únicos, 3 con 2 notebooks)
- **69 equipos sin persona**: 14 disponibles, 14 en mantención, 27 de baja, 4 usuario local, 7 con hostname, 1 con nombre, 2 de baja con estado "Usado"
- Fechas en formato serial de Excel (necesitan conversión)

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Equipos "Usuario Local" y con hostname sin persona | Estado `asignado` sin empleado vinculado |
| "Seminuevo" (4 registros) | Mapear a `usado` |
| Equipos "Baja" con Estado vacío (26 registros) | Condición `usado` |
| Alcance del borrado | **Todo**: empleados, activos, asignaciones, mantenciones, historial, compras, guías. NO se borran: `system_users`, `welcome_kit_items` |

## Mapeo columnas Excel → BD

### Excel → `employees` (158 registros únicos por RUT)
| Excel | → Campo BD |
|---|---|
| RUT | rut |
| Nombre | nombres |
| Apellido P. | apellidoPaterno |
| Apellido M. | apellidoMaterno |
| Correo | correo |
| Cargo | cargo |
| Jefatura | jefatura |
| Supervisor | supervisor |
| Comuna | ubicacion |
| _(default)_ | tipoContrato = `planta`, estado = `activo` |

### Excel → `assets` (230 registros)
| Excel | → Campo BD |
|---|---|
| N° Serie | numeroSerie |
| Marca | marca |
| Modelo | modelo |
| Nombre Equipo | nombreEquipo |
| Procesador | procesador |
| Disco Duro | discoDuro |
| RAM | ram |
| O.S. | sistemaOperativo |
| Microsoft 365 Empresa | microsoft365 (`"Premium"` → true, `""` → false) |
| Antivirus | antivirus |
| Comentario | observaciones |
| Estado (Excel) | condicion (`Nuevo`→nuevo, `Usado`→usado, `Seminuevo`→usado, `""`→usado) |
| ID-Interno (derivado) | estado (`Activo`→asignado, `Disponible`→disponible, `Mantención`→en_mantencion, `Baja`→baja, `Usuario Local/hostname`→asignado) |
| _(FK)_ | categoriaId → categoría "Notebook" |
| _(FK)_ | empleadoActualId → empleado por RUT (si tiene) |

### Excel → `assignments` (161 registros: solo equipos con persona asignada)
| Excel | → Campo BD |
|---|---|
| Fecha de entrega | fechaEntrega (convertir serial Excel → Date) |
| _(default)_ | tipoMovimiento = `ingreso`, activo = `true` |

### Excel → `maintenances` (165 registros con fecha de mantención)
| Excel | → Campo BD |
|---|---|
| Mantencion | fechaRealizada |
| Proxima Mantencion | proximaMantencion |
| _(default)_ | tipo = `preventiva`, estado = `completada`, descripcion = "Mantención preventiva" |

### Columnas ignoradas
- `Historial de asignaciónes` → informativo, no se importa
- `Com` → vacío, se ignora

---

## Tareas (3 total)

### Tarea 1: Crear script de limpieza de datos (DELETE) — PARALELO
**Archivo a crear:** `app/scripts/migrate_step1_cleanup.js`
- Conectarse a la BD usando Prisma
- Borrar datos en orden correcto por FK constraints:
  ```
  dispatch_guide_items → dispatch_guides → kit_assignments →
  terminations → asset_history → maintenances → assignments →
  purchase_assets → purchases → assets → asset_categories → employees
  ```
- NO borrar: `system_users`, `welcome_kit_items`, `suppliers`
- Imprimir log de registros borrados por tabla
- Ejecutable con: `cd app && node scripts/migrate_step1_cleanup.js`

### Tarea 2: Crear script de importación desde Excel — PARALELO
**Archivo a crear:** `app/scripts/migrate_step2_import.js`
- Leer Excel con librería `xlsx` (ya instalada)
- Insertar en orden: categoría → empleados → activos → assignments → maintenances
- Aplicar todos los mapeos documentados arriba
- Convertir fechas serial Excel a Date: `new Date((serial - 25569) * 86400000)`
- Deduplicar empleados por RUT (158 únicos de 161 con RUT)
- Imprimir resumen con conteos
- Ejecutable con: `cd app && node scripts/migrate_step2_import.js`

### Tarea 3: Ejecutar migración y verificar — SECUENCIAL (depende de 1 y 2)
- Ejecutar step1 (cleanup) y luego step2 (import)
- Verificar conteos: employees=158, assets=230, assignments≈161, maintenances≈165
- Verificar en la plataforma web que todo se muestra correctamente

---

## Asignación de agentes

| Tarea | Agentes necesarios | Puede ser paralelo? |
|---|---|---|
| Tarea 1 (cleanup script) | 1 agente | SI — en paralelo con Tarea 2 |
| Tarea 2 (import script) | 1 agente | SI — en paralelo con Tarea 1 |
| Tarea 3 (ejecutar + verificar) | Sin agente (lo hago yo directo) | NO — esperar que 1 y 2 terminen |

**Total: 2 agentes en paralelo, luego 1 ejecución directa.**

No necesitas crear agentes o skills personalizados. Usa los agentes generales de Claude Code (tipo `general-purpose` o `Bash`) para Tareas 1 y 2.

---

## Archivos involucrados
- **Crear**: `app/scripts/migrate_step1_cleanup.js`
- **Crear**: `app/scripts/migrate_step2_import.js`
- **Leer**: `excel/Consolidado inventario Notebook_23022026.xlsx`
- **Leer**: `app/prisma/schema.prisma` (referencia)
- **Sin cambios** en schema, componentes ni API routes
