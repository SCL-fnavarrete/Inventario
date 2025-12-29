# Diagrama de Flujo: Importación con Mantenciones Automáticas

## Flujo Principal de Importación

```
┌─────────────────────────────────────────────────────────────┐
│                    INICIO DE IMPORTACIÓN                    │
│                Usuario sube archivo Excel                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Seleccionar Hoja y Categoría                   │
│              (ej: "Notebooks" / "notebook")                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Mapear Columnas                          │
│  ┌───────────────────────────────────────────────────┐     │
│  │ Campos Requeridos:                                │     │
│  │  ✓ Marca → "Marca"                                │     │
│  │  ✓ Modelo → "Modelo"                              │     │
│  │  ✓ N° Serie → "N° Serie"                          │     │
│  │                                                    │     │
│  │ Campos Opcionales:                                │     │
│  │  ✓ Mantencion → "Mantencion"           ⭐ NUEVO  │     │
│  │  ✓ Proxima Mantencion → "Proxima..."  ⭐ NUEVO  │     │
│  └───────────────────────────────────────────────────┘     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 PROCESAR CADA FILA                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌──────────────┐            ┌──────────────┐
│ ¿Tiene RUT?  │            │ Validar      │
│              │            │ Campos       │
└──────┬───────┘            │ Requeridos   │
       │                    └──────┬───────┘
       │ Sí                        │
       ▼                           │
┌──────────────────┐               │
│ Buscar Empleado  │               │
│ por RUT          │               │
└──────┬───────────┘               │
       │                           │
       ▼                           │
┌──────────────────┐               │
│ ¿Existe?         │               │
└──┬───────────┬───┘               │
   │ No        │ Sí                │
   ▼           │                   │
┌──────────────┐  │                │
│ Crear        │  │                │
│ Empleado     │  │                │
└──────┬───────┘  │                │
       │          │                │
       └──────────┴────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │   CREAR ACTIVO      │
        │   (tabla: assets)   │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  Registrar Historial│
        │  (tipo: creacion)   │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ ¿Tiene Empleado?    │
        └─────┬───────────────┘
              │ Sí
              ▼
        ┌─────────────────────┐
        │ Crear Asignación    │
        │ (tabla: assignments)│
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  Registrar Historial│
        │  (tipo: asignacion) │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────────────┐
        │ ¿Tiene fecha Mantención?    │  ⭐ NUEVO
        └─────┬───────────────────────┘
              │ Sí
              ▼
        ┌─────────────────────────────┐
        │   CREAR MANTENCIÓN          │
        │   (Ver Flujo Detallado →)   │
        └─────────┬───────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  Siguiente Fila     │
        └─────────────────────┘
```

## Flujo Detallado: Creación de Mantención

```
┌─────────────────────────────────────────────────────────────┐
│          INICIO: Crear Mantención Automática                │
│          Campo "Mantencion" tiene valor                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Obtener Valores del Excel                      │
│  ┌───────────────────────────────────────────────────┐     │
│  │ fechaMantencionStr = getValue("mantencion")       │     │
│  │ proximaMantencionStr = getValue("proximaMantencion")│   │
│  └───────────────────────────────────────────────────┘     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Parsear Fechas                           │
│  ┌───────────────────────────────────────────────────┐     │
│  │ fechaMantencion = parseDDMMYYYYToDate(            │     │
│  │   fechaMantencionStr                              │     │
│  │ )                                                  │     │
│  │                                                    │     │
│  │ proximaMantencion = proximaMantencionStr ?        │     │
│  │   parseDDMMYYYYToDate(proximaMantencionStr) : null│     │
│  └───────────────────────────────────────────────────┘     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              ¿Fecha parseada correctamente?                 │
└─────┬───────────────────────────────────────────────────┬───┘
      │ No                                                │ Sí
      ▼                                                   ▼
┌─────────────┐                              ┌──────────────────┐
│   OMITIR    │                              │ Determinar Estado│
│ (sin error) │                              │ de Mantención    │
└─────────────┘                              └────────┬─────────┘
                                                      │
                                                      ▼
                                        ┌─────────────────────────┐
                                        │   ahora = new Date()    │
                                        │   yaRealizada =         │
                                        │   fechaMantencion <= ahora│
                                        └────────┬────────────────┘
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        │                                                 │
                        ▼                                                 ▼
            ┌───────────────────────┐                      ┌──────────────────────┐
            │   FECHA PASADA        │                      │   FECHA FUTURA       │
            │   (yaRealizada = true)│                      │   (yaRealizada = false)│
            └───────────┬───────────┘                      └──────────┬───────────┘
                        │                                             │
                        ▼                                             ▼
        ┌───────────────────────────────────┐        ┌─────────────────────────────┐
        │ Preparar Datos para BD:           │        │ Preparar Datos para BD:     │
        │ ┌───────────────────────────────┐ │        │ ┌─────────────────────────┐ │
        │ │ estado: "completada"          │ │        │ │ estado: "pendiente"     │ │
        │ │ fechaRealizada: fechaMantencion│ │        │ │ fechaProgramada:        │ │
        │ │ fechaProgramada: null         │ │        │ │   fechaMantencion       │ │
        │ │ realizadoPor: "Registro       │ │        │ │ fechaRealizada: null    │ │
        │ │               histórico"      │ │        │ │ realizadoPor: null      │ │
        │ └───────────────────────────────┘ │        │ └─────────────────────────┘ │
        └───────────────┬───────────────────┘        └──────────┬──────────────────┘
                        │                                       │
                        └───────────────┬───────────────────────┘
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │   Crear Registro en BD        │
                        │   (tabla: maintenances)       │
                        │ ┌───────────────────────────┐ │
                        │ │ assetId: [id del activo]  │ │
                        │ │ tipo: "preventiva"        │ │
                        │ │ descripcion: "Mantención  │ │
                        │ │   importada desde Excel"  │ │
                        │ │ proximaMantencion: [fecha]│ │
                        │ │ + datos según estado →    │ │
                        │ └───────────────────────────┘ │
                        └───────────────┬───────────────┘
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │  Registrar en Historial       │
                        │  (tabla: asset_history)       │
                        │ ┌───────────────────────────┐ │
                        │ │ assetId: [id del activo]  │ │
                        │ │ tipoEvento: "mantencion"  │ │
                        │ │ descripcion: "Mantención  │ │
                        │ │   [completada/programada] │ │
                        │ │   importada desde Excel"  │ │
                        │ │ usuarioSistema: [email]   │ │
                        │ └───────────────────────────┘ │
                        └───────────────┬───────────────┘
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │         FIN EXITOSO           │
                        │   Mantención creada y         │
                        │   registrada en historial     │
                        └───────────────────────────────┘
```

## Diagrama de Relaciones en Base de Datos

```
┌─────────────────────┐
│     employees       │
│─────────────────────│
│ id (PK)             │◄────────────┐
│ rut                 │             │
│ nombres             │             │
│ apellidoPaterno     │             │
│ correo              │             │
│ ...                 │             │
└─────────────────────┘             │
                                    │
                                    │ empleadoActualId
                                    │
┌─────────────────────┐             │
│   asset_categories  │             │
│─────────────────────│             │
│ id (PK)             │             │
│ nombre              │             │
└──────────┬──────────┘             │
           │                        │
           │ categoriaId            │
           │                        │
           ▼                        │
┌─────────────────────┐             │
│       assets        │◄────────────┘
│─────────────────────│
│ id (PK)             │◄────────────────────────────┐
│ categoriaId (FK)    │                             │
│ empleadoActualId(FK)│                             │
│ marca               │                             │
│ modelo              │                             │
│ numeroSerie         │                             │
│ estado              │                             │
│ ...                 │                             │
└──────────┬──────────┘                             │
           │                                        │
           │ assetId                                │ assetId
           │                                        │
           ├────────────────┬───────────────────────┼──────────────┐
           │                │                       │              │
           ▼                ▼                       ▼              ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   assignments    │ │  asset_history   │ │  maintenances    │ │ purchase_assets  │
│──────────────────│ │──────────────────│ │──────────────────│ │──────────────────│
│ id (PK)          │ │ id (PK)          │ │ id (PK)          │ │ id (PK)          │
│ assetId (FK)     │ │ assetId (FK)     │ │ assetId (FK)     │ │ assetId (FK)     │
│ employeeId (FK)  │ │ tipoEvento       │ │ tipo             │ │ purchaseId (FK)  │
│ fechaEntrega     │ │ descripcion      │ │ descripcion      │ │ ...              │
│ activo           │ │ usuarioSistema   │ │ fechaProgramada  │ └──────────────────┘
│ ...              │ │ createdAt        │ │ fechaRealizada   │
└──────────────────┘ │ ...              │ │ proximaMantencion│
                     └──────────────────┘ │ estado           │
                                          │ realizadoPor     │  ⭐ NUEVA RELACIÓN
                                          │ ...              │
                                          └──────────────────┘
```

## Flujo de Datos: Excel → Base de Datos

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ARCHIVO EXCEL                               │
│─────────────────────────────────────────────────────────────────────│
│ RUT          │ Marca │ Modelo  │ Serie   │ Mantencion │ Próxima    │
│──────────────┼───────┼─────────┼─────────┼────────────┼────────────│
│ 12.345.678-9 │ HP    │ Elite840│ SN12345 │ 15/03/2024 │ 15/06/2024 │
└─────────────────────────────────────────────────────────────────────┘
              │         │         │         │            │
              │         │         │         │            │
              ▼         ▼         ▼         ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PROCESAMIENTO EN API                           │
│─────────────────────────────────────────────────────────────────────│
│  normalizeRut()     │         │         │ parseDDMMYYYYToDate()    │
│  buscarEmpleado()   │         │         │ determinarEstado()       │
│                     │         │         │                          │
└─────────────────────────────────────────────────────────────────────┘
              │         │         │         │            │
              │         │         │         │            │
              ▼         ▼         ▼         ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BASE DE DATOS                                │
└─────────────────────────────────────────────────────────────────────┘
              │
              ├─► employees
              │   ├─ rut: "123456789"
              │   ├─ nombres: "Juan"
              │   └─ ...
              │
              ├─► assets
              │   ├─ marca: "HP"
              │   ├─ modelo: "EliteBook 840"
              │   ├─ numeroSerie: "SN12345"
              │   ├─ empleadoActualId: [id-empleado]
              │   └─ ...
              │
              ├─► assignments
              │   ├─ assetId: [id-activo]
              │   ├─ employeeId: [id-empleado]
              │   └─ ...
              │
              ├─► maintenances  ⭐ NUEVO
              │   ├─ assetId: [id-activo]
              │   ├─ tipo: "preventiva"
              │   ├─ estado: "completada"
              │   ├─ fechaRealizada: 2024-03-15
              │   ├─ proximaMantencion: 2024-06-15
              │   └─ ...
              │
              └─► asset_history
                  ├─ Evento 1: "creacion"
                  ├─ Evento 2: "asignacion"
                  └─ Evento 3: "mantencion"  ⭐ NUEVO
```

## Estados y Transiciones de Mantención

```
┌─────────────────────────────────────────────────────────────┐
│                   IMPORTACIÓN INICIAL                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
┌──────────────────┐        ┌──────────────────┐
│ Fecha PASADA     │        │ Fecha FUTURA     │
│                  │        │                  │
│ Estado:          │        │ Estado:          │
│ "completada"     │        │ "pendiente"      │
└────────┬─────────┘        └────────┬─────────┘
         │                           │
         │                           ▼
         │                  ┌──────────────────┐
         │                  │ Usuario puede:   │
         │                  │ - Ver detalles   │
         │                  │ - Completar      │
         │                  │ - Cancelar       │
         │                  │ - Reagendar      │
         │                  └────────┬─────────┘
         │                           │
         │                           ▼
         │                  ┌──────────────────┐
         │                  │ Al completar:    │
         │                  │ estado →         │
         │                  │ "completada"     │
         │                  └────────┬─────────┘
         │                           │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌──────────────────────────┐
         │   MANTENCIÓN HISTÓRICA   │
         │   Registro permanente    │
         │   en el sistema          │
         └──────────────────────────┘
```

## Visualización en la UI

```
┌─────────────────────────────────────────────────────────────┐
│                    VISTA DE IMPORTACIÓN                     │
│                 /activos/importar                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Paso 2: Mapeo de Columnas                                  │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ Mantencion           [Mantencion           ▼]       │    │
│ │ Proxima Mantencion   [Proxima Mantencion   ▼]       │    │
│ └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Ayuda                                                       │
│ ├─ Si incluyes fecha de Mantencion, el sistema creará      │
│ │  automáticamente un registro en el módulo de Mantenciones│
│ └─ Si la fecha es pasada → completada, futura → pendiente  │
└─────────────────────────────────────────────────────────────┘
                            │
                     [Importar]
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 MÓDULO DE MANTENCIONES                      │
│                    /mantenciones                            │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ HP EliteBook 840 (SN12345)                          │    │
│ │ ✓ Preventiva - 15/03/2024                           │    │
│ │ Próxima: 15/06/2024                                 │    │
│ │ Empleado: Juan Pérez (juan.perez@empresa.cl)       │    │
│ └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

**Leyenda:**
- ⭐ = Funcionalidad nueva
- (PK) = Primary Key
- (FK) = Foreign Key
- → = Transición/Flujo
- ◄─ = Relación de base de datos
