# Mapeo de Archivos Excel a Base de Datos

## Resumen Ejecutivo

**Fecha de Análisis:** 2025-12-27
**Total de Archivos Excel:** 9
**Total de Registros a Migrar:** ~511 registros

---

## 1. CONSOLIDADO INVENTARIO NOTEBOOK

### Archivo: `Consolidado inventario Notebook (1).xlsx`
- **Registros:** 211
- **Tabla Destino:** `assets` + `assignments` + `employees`

### Mapeo de Campos:

| Campo Excel | Campo BD | Tabla | Notas |
|------------|----------|-------|-------|
| RUT | rut | employees | Identificador único |
| Nombre | nombre | employees | |
| onoso (Apellido P.) | apellidoPaterno | employees | Columna mal nombrada en Excel |
| Apellido M. | apellidoMaterno | employees | |
| Correo | correo | employees | |
| Cargo | cargo | employees | |
| Comuna | ubicacion | employees | |
| Jefatura | jefatura | employees | |
| Supervisor | supervisor | employees | |
| Marca | marca | assets | |
| Modelo | modelo | assets | |
| N° Serie | numeroSerie | assets | **CAMPO CRÍTICO - Manejar duplicados** |
| Nombre Equipo | - | - | No hay campo en BD, agregar? |
| Procesador | procesador | assets | |
| Disco Duro | discoDuro | assets | |
| RAM | ram | assets | |
| O.S. | sistemaOperativo | assets | |
| Microsoft 365 Empresa | microsoft365 | assets | Mapear "Premium" a true |
| Estado | condicion | assets | "Nuevo"/"Usado" |
| Fecha de entrega | fechaEntrega | assignments | **Formato mixto (texto/fecha)** |
| Mantencion | fechaRealizada | maintenances | |
| Proxima Mantencion | proximaMantencion | maintenances | |
| Antivirus | observaciones | assets | Agregar en observaciones |

### Lógica Especial:
- **Seriales Repetidos:** Buscar N° Serie duplicados y marcar el registro con fecha más reciente como ACTIVO
- **Categoría:** Crear/buscar categoría "Notebook" en `asset_categories`
- **Estado:** Mapear a `asignado` en `estado` de assets

---

## 2. NOTEBOOK DISPONIBLES

### Archivo: `Notebook disponibles.xlsx`
- **Registros:** 37
- **Tabla Destino:** `assets`

### Mapeo de Campos:

| Campo Excel | Campo BD | Tabla | Notas |
|------------|----------|-------|-------|
| Estado | estado | assets | "Disponible"/"Asignado"/"Reutilizable" |
| Ubicación | ubicacionFisica | assets | |
| Pulgadas | pulgadas | assets | |
| Marca | marca | assets | |
| Modelo | modelo | assets | |
| Serie | numeroSerie | assets | |
| Procesador | procesador | assets | |
| Disco Duro | discoDuro | assets | |
| RAM | ram | assets | |
| Equipo | condicion | assets | "Nuevo"/"Usado" |
| Fecha | fechaCompra | assets | O createdAt? |
| O.S | sistemaOperativo | assets | |

### Lógica Especial:
- Estos son notebooks SIN asignar
- No crear registros en `assignments`
- Estado debe ser "disponible" o según columna Estado

---

## 3. CONSOLIDADO INVENTARIO CELULARES

### Archivo: `Consolidado inventario Celulares.xlsx`
- **Registros:** 138
- **Tabla Destino:** `assets` + `assignments` + `employees`

### Mapeo de Campos:

| Campo Excel | Campo BD | Tabla | Notas |
|------------|----------|-------|-------|
| RUT | rut | employees | |
| Nombre | nombre | employees | |
| Apellido P. | apellidoPaterno | employees | |
| Apellido M. | apellidoMaterno | employees | |
| Marca | marca | assets | |
| Modelo | modelo | assets | |
| N° serie | numeroSerie | assets | |
| IMEI | imei | assets | **Campo específico celulares** |
| Estado | condicion | assets | |
| N° Telefono | numeroTelefono | assets | **Campo específico celulares** |
| Operador | tipoPlan | assets | Mapear a tipoPlan |
| Fecha entrega | fechaEntrega | assignments | |
| Incidencia | observaciones | assets | Falla/Robo/Hurto |

### Lógica Especial:
- **Categoría:** Crear/buscar categoría "Celular" en `asset_categories` con `requiereImei = true`
- **Incidencias:** Manejar casos de Robo/Hurto (¿cambiar estado a "baja"?)
- **Cargador:** Por defecto `tieneCargador = true` (revisar en desvinculaciones)

---

## 4. CONSOLIDADO INVENTARIO MONITOR

### Archivo: `Consolidado inventario Monitor.xlsx`
- **Registros:** 21
- **Tabla Destino:** `assets` + `assignments` + `employees`

### Mapeo de Campos:

| Campo Excel | Campo BD | Tabla | Notas |
|------------|----------|-------|-------|
| RUT | rut | employees | |
| Nombre | nombre | employees | Valores como "Oficina" |
| Apellido P. | apellidoPaterno | employees | Puede ser NULL |
| Apellido M. | apellidoMaterno | employees | Puede ser NULL |
| Correo | correo | employees | |
| Cargo | cargo | employees | |
| Comuna | ubicacion | employees | |
| Marca | marca | assets | |
| Modelo | modelo | assets | |
| Pulgadas | pulgadas | assets | |
| N° Serie | numeroSerie | assets | |
| Fecha asignado | fechaEntrega | assignments | |
| Estado | condicion | assets | |
| Lugar | ubicacionFisica | assets | |
| Usuario | - | - | Estado empleado? |

### Lógica Especial:
- **Categoría:** Crear/buscar categoría "Monitor"
- **Oficina:** Algunos están asignados a "Oficina" no a persona (¿crear empleado ficticio?)
- **Usuario Desvinculado:** Si Usuario = "Desvinculado", marcar assignment como inactivo

---

## 5. CONSOLIDADO INVENTARIO MOUSE

### Archivo: `Consolidado inventario Mouse.xlsx`
- **Registros:** 3
- **Tabla Destino:** `assets` + `assignments` + `employees`

### Mapeo de Campos:

| Campo Excel | Campo BD | Tabla | Notas |
|------------|----------|-------|-------|
| RUT | rut | employees | |
| Nombre | nombre | employees | |
| Apellido P. | apellidoPaterno | employees | |
| Apellido M. | apellidoMaterno | employees | |
| Marca | marca | assets | |
| Modelo | modelo | assets | |
| N° Serie | numeroSerie | assets | |
| Estado | condicion | assets | |
| Fecha asignado | fechaEntrega | assignments | |
| Lugar | ubicacionFisica | assets | |

### Lógica Especial:
- **Categoría:** Crear/buscar categoría "Mouse"

---

## 6. CONSOLIDADO INVENTARIO AUDÍFONOS

### Archivo: `Consolidado inventario Audifonos.xlsx`
- **Registros:** 4
- **Tabla Destino:** `assets` + `assignments` + `employees`

### Mapeo de Campos:

| Campo Excel | Campo BD | Tabla | Notas |
|------------|----------|-------|-------|
| RUT | rut | employees | |
| Nombre | nombre | employees | |
| Apellido P. | apellidoPaterno | employees | |
| Apellido M. | apellidoMaterno | employees | |
| Marca | marca | assets | |
| Modelo | modelo | assets | |
| N° Serie | numeroSerie | assets | Tipo float64 en Excel |
| Estado | condicion | assets | |
| Fecha asignado | fechaEntrega | assignments | |
| Lugar | ubicacionFisica | assets | |

### Lógica Especial:
- **Categoría:** Crear/buscar categoría "Audífonos"

---

## 7. CONSOLIDADO INVENTARIO IMPRESORA

### Archivo: `Consolidado inventario Impresora.xlsx`
- **Registros:** 3
- **Tabla Destino:** `assets`

### Mapeo de Campos:

| Campo Excel | Campo BD | Tabla | Notas |
|------------|----------|-------|-------|
| Marca | marca | assets | |
| Modelo | modelo | assets | |
| S/N | numeroSerie | assets | |
| Ubicación | ubicacionFisica | assets | |

### Lógica Especial:
- **Categoría:** Crear/buscar categoría "Impresora"
- **Sin asignación personal:** No crear `assignments`, son de oficina
- **Estado:** Marcar como "disponible"

---

## 8. INVENTARIO KIT + EPP + MOCHILA

### Archivo: `Inventario Kit +EPP + Mochila.xlsx`
- **Registros:** 63
- **Tabla Destino:** `welcome_kit_items` + `kit_assignments` + `employees`

### Mapeo de Campos:

| Campo Excel | Campo BD | Tabla | Notas |
|------------|----------|-------|-------|
| RUT | rut | employees | |
| Nombre | nombre | employees | |
| Apellido P. | apellidoPaterno | employees | |
| Apellido M. | apellidoMaterno | employees | |
| Fecha | fechaEntrega | kit_assignments | |
| Plástico Credencial | - | - | Crear WelcomeKitItem |
| Porta credencial | - | - | Crear WelcomeKitItem |
| Cinta Porta credencial | - | - | Crear WelcomeKitItem |
| EPP-Reposa muñequero | - | - | Crear WelcomeKitItem |
| EPP-mouse pad | - | - | Crear WelcomeKitItem |
| Agenda | - | - | Crear WelcomeKitItem |
| Tazas | - | - | Crear WelcomeKitItem |
| Mochila | - | - | Crear WelcomeKitItem |

### Lógica Especial:
- **Crear Items de Kit:** Primero crear los 8 tipos de items en `welcome_kit_items`
- **Asignaciones:** Por cada fila, crear 8 registros en `kit_assignments` (uno por cada item = 1)
- **Categorías:** Definir si es `kit_bienvenida` o `epp`

---

## 9. REGISTRO DESVINCULACIONES

### Archivo: `Registro desvinculaciones.xlsx`
- **Registros:** 31
- **Tabla Destino:** `terminations` + `employees` + actualizar `assignments`

### Mapeo de Campos:

| Campo Excel | Campo BD | Tabla | Notas |
|------------|----------|-------|-------|
| Jefatura | jefatura | employees | Actualizar si existe |
| Supervisor | supervisor | employees | Actualizar si existe |
| RUT | rut | employees | Buscar empleado |
| Nombre | nombre | employees | |
| Apellido P. | apellidoPaterno | employees | |
| Apellido M. | apellidoMaterno | employees | |
| Contacto | telefonoContacto | employees | |
| Fecha des. | fechaDesvinculacion | terminations | |
| Lugar Entrega | lugarDevolucion | terminations | |
| Recibe | recibidoPor | terminations | |
| Fecha dev. | fechaDevolucionEquipos | terminations | |
| Estado Notebook | estadoNotebook | terminations | Mapear "OK" a `ok` |
| Estado Celular | estadoCelular | terminations | Mapear "SIN CARGADOR" a `incompleto` |
| Estado Monitor | estadoMonitor | terminations | Mapear "-" a `no_aplica` |
| Nro | - | - | Info adicional del celular? |
| IMEI | - | - | Para buscar el celular |
| Observación | observaciones | terminations | |

### Lógica Especial:
- **Actualizar Estado Empleado:** Cambiar `estado` a "desvinculado" en `employees`
- **Cerrar Asignaciones:** Marcar `activo = false` y poner `fechaDevolucion` en `assignments`
- **Estado de Activos:** Cambiar estado de activos devueltos según condición
- **IMEI/Teléfono:** Usar para identificar qué celular se devolvió

---

## CAMPOS FALTANTES EN BASE DE DATOS

### Agregar a tabla `assets`:
```prisma
nombreEquipo     String?         @map("nombre_equipo")  // Para computadores en red
```

---

## CATEGORÍAS A CREAR

Ejecutar antes de la migración:

1. Notebook (requiereSerie: true)
2. Celular (requiereSerie: true, requiereImei: true)
3. Monitor (requiereSerie: true)
4. Mouse (requiereSerie: true)
5. Audífonos (requiereSerie: false) // Algunos no tienen
6. Impresora (requiereSerie: true)

---

## ORDEN DE MIGRACIÓN

1. **Crear Categorías** (`asset_categories`)
2. **Migrar Empleados Únicos** desde todos los Excel (`employees`)
3. **Migrar Assets:**
   - Impresoras (sin asignación)
   - Notebooks disponibles (sin asignación)
   - Notebooks con asignación
   - Celulares
   - Monitores
   - Mouse
   - Audífonos
4. **Crear Asignaciones** (`assignments`)
5. **Migrar Kit Items** (`welcome_kit_items`)
6. **Migrar Kit Assignments** (`kit_assignments`)
7. **Migrar Desvinculaciones** (`terminations`)
8. **Actualizar Estados** de empleados y asignaciones

---

## VALIDACIONES CRÍTICAS

### 1. Seriales Duplicados en Notebooks
```sql
SELECT "numeroSerie", COUNT(*)
FROM assignments a
JOIN assets ast ON a."assetId" = ast.id
WHERE ast."categoriaId" = 'notebook-category-id'
GROUP BY "numeroSerie"
HAVING COUNT(*) > 1;
```

### 2. Empleados Sin RUT
- Manejar casos donde RUT es NULL (7 en celulares)

### 3. Fechas en Formato Mixto
- "Fecha de entrega" en Notebooks viene como texto, necesita parseo

### 4. Valores NULL
- numeroSerie puede ser NULL en algunos casos
- No forzar restricciones estrictas

---

## ESTADÍSTICAS DE MIGRACIÓN

| Tabla | Registros Estimados |
|-------|---------------------|
| employees | ~220 únicos |
| assets | ~417 |
| assignments | ~380 |
| welcome_kit_items | 8 tipos |
| kit_assignments | 504 (63 x 8) |
| terminations | 31 |
| asset_categories | 6 |

**TOTAL REGISTROS:** ~1,546

---

## PRÓXIMOS PASOS

1. Modificar schema Prisma para agregar campo `nombreEquipo`
2. Crear script de migración principal
3. Crear script de validación post-migración
4. Ejecutar en ambiente de desarrollo
5. Validar datos
6. Aplicar a producción
