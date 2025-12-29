# Creación Automática de Registros de Mantención al Importar Activos

## Descripción General

El sistema ahora crea automáticamente registros de mantención cuando se importan activos desde Excel que incluyen fechas de mantención.

## Flujo de Trabajo

```
Importar Excel con Notebooks
        ↓
Campo "Mantencion" tiene fecha (ej: 15/03/2024)
        ↓
Crear activo (como siempre)
        ↓
Crear registro de mantención automáticamente:
  - activoId: [id del notebook creado]
  - tipo: "preventiva"
  - fechaProgramada o fechaRealizada: según si es futura o pasada
  - proximaMantencion: [fecha del Excel si existe]
  - estado: "completada" o "pendiente"
        ↓
Crear registro en historial del activo
```

## Campos del Excel

### Campos Requeridos (para crear el activo)
- **Marca**: Marca del equipo
- **Modelo**: Modelo del equipo
- **N° Serie**: Número de serie único

### Campos Opcionales (para mantención)
- **Mantencion**: Fecha de la mantención (formato: DD/MM/YYYY o serial de Excel)
- **Proxima Mantencion**: Fecha de la próxima mantención programada

## Lógica de Creación de Mantención

### Cuando se importa un activo con fecha de mantención:

1. **El sistema verifica si existe el campo "Mantencion"**
   - Si está vacío, no se crea registro de mantención
   - Si tiene una fecha, continúa el proceso

2. **Determina si la mantención es pasada o futura**
   - **Fecha pasada** (antes de hoy):
     - `estado`: "completada"
     - `fechaRealizada`: [fecha del Excel]
     - `fechaProgramada`: null
     - `realizadoPor`: "Registro histórico"

   - **Fecha futura** (hoy o después):
     - `estado`: "pendiente"
     - `fechaProgramada`: [fecha del Excel]
     - `fechaRealizada`: null
     - `realizadoPor`: null

3. **Incluye la próxima mantención si existe**
   - `proximaMantencion`: [fecha del campo "Proxima Mantencion"]

4. **Datos fijos del registro**
   - `tipo`: "preventiva"
   - `descripcion`: "Mantención importada desde Excel"

## Ejemplo de Excel

| RUT | Nombre | Marca | Modelo | N° Serie | Mantencion | Proxima Mantencion |
|-----|--------|-------|--------|----------|------------|-------------------|
| 12.345.678-9 | Juan Pérez | HP | EliteBook 840 | ABC123 | 15/03/2024 | 15/06/2024 |
| 98.765.432-1 | María González | Dell | Latitude 5420 | DEF456 | 20/12/2025 | 20/03/2026 |

**Resultado:**
- Activo 1: Mantención completada (fecha pasada) + próxima mantención programada
- Activo 2: Mantención pendiente (fecha futura) + próxima mantención programada

## Datos Incluidos en el Registro de Mantención

El registro de mantención incluye:

### Del Activo
- `assetId`: ID del activo creado
- Relación con el modelo Asset (incluye marca, modelo, serie, etc.)

### De las Fechas
- `fechaProgramada`: Si la mantención está pendiente
- `fechaRealizada`: Si la mantención ya fue completada
- `proximaMantencion`: Fecha de la próxima mantención

### Información Adicional
- `tipo`: Tipo de mantención ("preventiva" por defecto)
- `descripcion`: "Mantención importada desde Excel"
- `estado`: "completada" o "pendiente"
- `realizadoPor`: "Registro histórico" (si ya fue completada)

### Del Empleado (Relación Indirecta)
- El activo tiene `empleadoActualId`
- Desde el módulo de mantenciones se puede acceder a:
  - Nombre del empleado
  - RUT
  - Correo
  - Cargo, ubicación, etc.

## Registro en Historial

Cada mantención creada genera un registro en el historial del activo:

```typescript
{
  tipoEvento: "mantencion",
  descripcion: "Mantención [completada/programada] importada desde Excel",
  usuarioSistema: [email del usuario que importó]
}
```

## Visualización

Los registros de mantención creados aparecerán en:

1. **Módulo de Mantenciones** (`/mantenciones`)
   - En la lista de mantenciones pendientes (si es futura)
   - En la lista de mantenciones completadas (si es pasada)

2. **Detalle del Activo**
   - En la sección de historial de mantenciones

3. **Calendario de Mantenciones** (`/mantenciones/calendario`)
   - Las mantenciones programadas aparecen en el calendario

## Consideraciones Técnicas

### Formato de Fechas
- El sistema acepta fechas en formato:
  - Serial de Excel (número como 45015)
  - Formato ISO (YYYY-MM-DD)
  - Formato DD-MM-YYYY

### Validación
- Si la fecha de mantención no puede parsearse, se omite la creación
- No se crea error en la importación, solo se omite el registro de mantención

### Transacciones
- La creación de mantención está dentro del mismo bloque try-catch que el activo
- Si falla, se reporta el error pero no se bloquea la importación del activo

## Archivos Modificados

1. **API de Importación**
   - `app/src/app/api/activos/importar/route.ts`
   - Líneas 346-384: Lógica de creación de mantención

2. **Página de Importación**
   - `app/src/app/(dashboard)/activos/importar/page.tsx`
   - Líneas 75-76: Campos de mantención en el mapeo
   - Líneas 613-642: Documentación de ayuda actualizada

## Campos ya Configurados en la UI

Los campos de mantención ya están incluidos en los campos opcionales de la página de importación:

```typescript
{ key: "mantencion", label: "Mantencion", categories: ["notebook"] }
{ key: "proximaMantencion", label: "Proxima Mantencion", categories: ["notebook"] }
```

## Pruebas Recomendadas

1. **Importar activo con mantención pasada**
   - Verificar que se crea como "completada"
   - Verificar fechaRealizada
   - Verificar que aparece en historial

2. **Importar activo con mantención futura**
   - Verificar que se crea como "pendiente"
   - Verificar fechaProgramada
   - Verificar que aparece en calendario

3. **Importar activo sin mantención**
   - Verificar que no se crea registro de mantención
   - Verificar que el activo se crea normalmente

4. **Importar activo con mantención y próxima mantención**
   - Verificar que ambas fechas se guardan
   - Verificar en el detalle de la mantención

## Beneficios

1. **Automatización**: No es necesario crear manualmente los registros de mantención
2. **Consistencia**: Todos los datos históricos se importan de una vez
3. **Trazabilidad**: Se registra en el historial del activo
4. **Flexibilidad**: Funciona con fechas pasadas y futuras
5. **Escalabilidad**: Permite importar cientos de mantenciones en una sola operación
