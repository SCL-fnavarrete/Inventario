# Ejemplo de Importación con Mantención Automática

## Escenario: Importar Notebook con Mantención

### Datos del Excel

```
| RUT          | Nombre        | Apellido P | Marca | Modelo         | N° Serie | Mantencion  | Proxima Mantencion |
|--------------|---------------|------------|-------|----------------|----------|-------------|-------------------|
| 12.345.678-9 | Juan          | Pérez      | HP    | EliteBook 840  | SN123456 | 15/03/2024  | 15/06/2024        |
```

### Proceso de Importación

#### 1. Usuario carga el Excel
- Archivo: `inventario_notebooks.xlsx`
- Hoja: `Notebooks`
- Categoría: `notebook`

#### 2. Sistema mapea las columnas
```
Campos Requeridos:
  ✓ RUT          → "RUT"
  ✓ Nombre       → "Nombre"
  ✓ Apellido P   → "Apellido P"
  ✓ Marca        → "Marca"
  ✓ Modelo       → "Modelo"
  ✓ N° Serie     → "N° Serie"

Campos Opcionales:
  ✓ Mantencion           → "Mantencion"
  ✓ Proxima Mantencion   → "Proxima Mantencion"
```

#### 3. Sistema procesa la fila

**Paso 3.1: Buscar/Crear Empleado**
```sql
-- Busca empleado con RUT "12.345.678-9"
SELECT * FROM employees WHERE rut = '123456789';

-- Si no existe, lo crea:
INSERT INTO employees (
  rut, nombres, apellidoPaterno, correo, tipoContrato, estado
) VALUES (
  '123456789', 'Juan', 'Pérez', 'juan.perez@empresa.cl', 'planta', 'activo'
);
```

**Paso 3.2: Crear Activo**
```sql
INSERT INTO assets (
  categoriaId,
  marca,
  modelo,
  numeroSerie,
  estado,
  condicion,
  empleadoActualId
) VALUES (
  '[id-categoria-notebook]',
  'HP',
  'EliteBook 840',
  'SN123456',
  'asignado',
  'usado',
  '[id-empleado-juan]'
);
```

**Paso 3.3: Crear Asignación**
```sql
INSERT INTO assignments (
  assetId,
  employeeId,
  fechaEntrega,
  tipoMovimiento,
  activo
) VALUES (
  '[id-asset-creado]',
  '[id-empleado-juan]',
  NOW(),
  'ingreso',
  true
);
```

**Paso 3.4: Crear Mantención** ⭐ NUEVO
```sql
-- Como la fecha 15/03/2024 es PASADA (hoy es 26/11/2025):
INSERT INTO maintenances (
  assetId,
  tipo,
  descripcion,
  fechaProgramada,
  fechaRealizada,
  proximaMantencion,
  estado,
  realizadoPor
) VALUES (
  '[id-asset-creado]',
  'preventiva',
  'Mantención importada desde Excel',
  NULL,                      -- Es pasada, no tiene fecha programada
  '2024-03-15T00:00:00Z',   -- Fecha en que fue realizada
  '2024-06-15T00:00:00Z',   -- Próxima mantención
  'completada',             -- Ya fue completada
  'Registro histórico'      -- Quien la realizó
);
```

**Paso 3.5: Registrar en Historial**
```sql
-- Historial de creación del activo
INSERT INTO asset_history (
  assetId, tipoEvento, descripcion, usuarioSistema
) VALUES (
  '[id-asset]', 'creacion', 'Activo importado desde Excel', 'admin@empresa.cl'
);

-- Historial de asignación
INSERT INTO asset_history (
  assetId, tipoEvento, descripcion, usuarioSistema
) VALUES (
  '[id-asset]', 'asignacion', 'Asignación importada desde Excel', 'admin@empresa.cl'
);

-- Historial de mantención ⭐ NUEVO
INSERT INTO asset_history (
  assetId, tipoEvento, descripcion, usuarioSistema
) VALUES (
  '[id-asset]', 'mantencion', 'Mantención completada importada desde Excel', 'admin@empresa.cl'
);
```

### Resultado Final

#### Datos Creados en el Sistema

**1. Empleado**
```
ID: 550e8400-e29b-41d4-a716-446655440001
RUT: 12.345.678-9
Nombre: Juan Pérez
Correo: juan.perez@empresa.cl
Estado: Activo
```

**2. Activo (Notebook)**
```
ID: 550e8400-e29b-41d4-a716-446655440002
Categoría: Notebook
Marca: HP
Modelo: EliteBook 840
Serie: SN123456
Estado: Asignado
Empleado: Juan Pérez (12.345.678-9)
```

**3. Asignación**
```
ID: 550e8400-e29b-41d4-a716-446655440003
Activo: HP EliteBook 840 (SN123456)
Empleado: Juan Pérez
Fecha Entrega: 26/11/2025
Tipo: Ingreso
Estado: Activo
```

**4. Mantención** ⭐ NUEVO
```
ID: 550e8400-e29b-41d4-a716-446655440004
Activo: HP EliteBook 840 (SN123456)
Tipo: Preventiva
Descripción: Mantención importada desde Excel
Estado: Completada
Fecha Realizada: 15/03/2024
Próxima Mantención: 15/06/2024
Realizado Por: Registro histórico
```

**5. Historial del Activo**
```
[26/11/2025] Creación: Activo importado desde Excel
[26/11/2025] Asignación: Asignación importada desde Excel
[26/11/2025] Mantención: Mantención completada importada desde Excel
```

### Visualización en el Sistema

#### 1. Vista de Activos (`/activos`)
```
┌─────────────────────────────────────────────────────────────┐
│ Lista de Activos                                            │
├─────────────────────────────────────────────────────────────┤
│ Serie       │ Marca │ Modelo         │ Empleado     │ Estado│
│ SN123456    │ HP    │ EliteBook 840  │ Juan Pérez   │ ✓     │
└─────────────────────────────────────────────────────────────┘
```

#### 2. Detalle del Activo (`/activos/SN123456`)
```
┌─────────────────────────────────────────────────────────────┐
│ HP EliteBook 840 - SN123456                                 │
├─────────────────────────────────────────────────────────────┤
│ INFORMACIÓN GENERAL                                         │
│ Marca: HP                                                   │
│ Modelo: EliteBook 840                                       │
│ Serie: SN123456                                             │
│ Estado: Asignado a Juan Pérez (12.345.678-9)               │
│                                                             │
│ MANTENCIONES                                                │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ ✓ Mantención Preventiva - 15/03/2024                │    │
│ │   Completada por: Registro histórico                │    │
│ │   Próxima mantención: 15/06/2024                    │    │
│ └─────────────────────────────────────────────────────┘    │
│                                                             │
│ HISTORIAL                                                   │
│ [26/11/2025] Mantención completada importada desde Excel   │
│ [26/11/2025] Asignación importada desde Excel              │
│ [26/11/2025] Activo importado desde Excel                  │
└─────────────────────────────────────────────────────────────┘
```

#### 3. Vista de Mantenciones (`/mantenciones`)
```
┌─────────────────────────────────────────────────────────────┐
│ Mantenciones                                                │
├─────────────────────────────────────────────────────────────┤
│ COMPLETADAS                                                 │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ HP EliteBook 840 (SN123456)                         │    │
│ │ Preventiva - 15/03/2024                             │    │
│ │ Próxima: 15/06/2024                                 │    │
│ │ Empleado: Juan Pérez (juan.perez@empresa.cl)       │    │
│ └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Caso 2: Mantención Futura

### Datos del Excel
```
| RUT          | Nombre | Apellido P | Marca | Modelo        | N° Serie | Mantencion  | Proxima Mantencion |
|--------------|--------|------------|-------|---------------|----------|-------------|-------------------|
| 98.765.432-1 | María  | González   | Dell  | Latitude 5420 | SN789012 | 15/12/2025  | 15/03/2026        |
```

### Mantención Creada
```sql
-- Como la fecha 15/12/2025 es FUTURA:
INSERT INTO maintenances (
  assetId,
  tipo,
  descripcion,
  fechaProgramada,      -- ⭐ Ahora tiene fecha programada
  fechaRealizada,       -- NULL porque no se ha realizado
  proximaMantencion,
  estado,
  realizadoPor          -- NULL porque no se ha realizado
) VALUES (
  '[id-asset-creado]',
  'preventiva',
  'Mantención importada desde Excel',
  '2025-12-15T00:00:00Z',   -- Fecha programada
  NULL,                      -- No se ha realizado aún
  '2026-03-15T00:00:00Z',   -- Próxima mantención
  'pendiente',              -- Estado: pendiente
  NULL                      -- No tiene quien la realizó
);
```

### Vista en Mantenciones Pendientes
```
┌─────────────────────────────────────────────────────────────┐
│ Mantenciones Pendientes                                     │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐    │
│ │ 🔔 Dell Latitude 5420 (SN789012)                    │    │
│ │    Preventiva - Programada: 15/12/2025              │    │
│ │    Empleado: María González                         │    │
│ │    Próxima: 15/03/2026                              │    │
│ │    [Completar Mantención]                           │    │
│ └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Ventajas del Sistema

1. **Creación Automática**: No necesitas crear las mantenciones manualmente
2. **Historial Completo**: Se registra todo en el historial del activo
3. **Fechas Inteligentes**: Detecta si son pasadas o futuras
4. **Trazabilidad**: Sabes cuándo y quién importó los datos
5. **Relaciones Completas**: Mantención → Activo → Empleado

## Campos Disponibles en la Vista de Mantención

Cuando accedas a la mantención creada, tendrás:

**Del Activo:**
- Marca: HP
- Modelo: EliteBook 840
- Serie: SN123456
- Estado: Asignado

**Del Empleado (a través del activo):**
- Nombre: Juan Pérez
- RUT: 12.345.678-9
- Correo: juan.perez@empresa.cl
- Cargo: [si existe]
- Ubicación: [si existe]

**De la Mantención:**
- Tipo: Preventiva
- Fecha Realizada/Programada: 15/03/2024
- Próxima Mantención: 15/06/2024
- Estado: Completada/Pendiente
- Realizado Por: Registro histórico
