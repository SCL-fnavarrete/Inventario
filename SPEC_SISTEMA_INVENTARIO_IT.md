# SISTEMA DE CONTROL DE INVENTARIO IT - ESPECIFICACIONES TÉCNICAS
## Documento de Arquitectura y Plan de Desarrollo para IA
### Metodología BMAD (Business Model Architecture Design)

---

# PARTE 1: VISIÓN DEL NEGOCIO (BUSINESS)

## 1.1 Problema de Negocio
Una empresa de servicios IT necesita gestionar el ciclo de vida completo de activos tecnológicos (notebooks, celulares, monitores, periféricos, EPP) con alta rotación de personal (empleados de planta y por proyecto de corta duración). Actualmente se gestiona en múltiples hojas Excel sin trazabilidad, sin correlación con compras/facturas, y sin dashboards de disponibilidad.

## 1.2 Objetivos del Sistema
1. **Trazabilidad completa**: Saber por cuántas manos ha pasado cada activo
2. **Disponibilidad en tiempo real**: Dashboard de equipos disponibles, asignados, en mantención, dados de baja
3. **Gestión de entregas/devoluciones**: Actas digitales con estados de condición
4. **Correlación financiera**: Vincular activos con facturas y proveedores
5. **Mantenciones**: Programar y trackear mantenciones físicas y lógicas
6. **Reportes para RRHH**: Generar fichas de entrega/devolución para gestión de descuentos

## 1.3 Usuarios del Sistema
| Rol | Permisos |
|-----|----------|
| Admin IT | CRUD completo, reportes, configuración |
| Técnico IT | Asignar/recibir equipos, registrar mantenciones |
| Supervisor | Ver reportes de su área, aprobar solicitudes |
| RRHH | Solo lectura de fichas de empleados y estados de devolución |
| Auditor | Solo lectura de todo el sistema |

### 1.3.1 Matriz de permisos (implementación)

La tabla anterior describe la intención; esta matriz es su forma ejecutable.
Vive en `app/src/lib/auth/permissions.ts` y es el **único** punto de verdad de
la autorización: la consumen tanto las rutas de API (`requirePermission`) como
la interfaz (`usePermissions` y el componente `<Can>`), de modo que ambas no
puedan discrepar.

Lectura (R) · Escritura (W) · Borrado (D).

| Recurso | Admin | Técnico | Supervisor | RRHH | Auditor |
|---|---|---|---|---|---|
| activos | RWD | RW | R | R | R |
| empleados | RWD | RW | R | R | R |
| asignaciones | RWD | RW | R | R | R |
| solicitudes | RWD | RW | RW | R | R |
| mantenciones | RWD | RW | R | — | R |
| tiposMantencion | RWD | RWD | R | — | R |
| desvinculaciones | RWD | RW | R | R | R |
| guias | RWD | RW | R | — | R |
| compras | RWD | — | R | — | R |
| proveedores | RWD | R | R | — | R |
| categorias | RWD | R | R | — | R |
| usuarios | RWD | — | — | — | — |
| reportes | R | R | R | R | R |
| configuracion | RWD | — | — | — | — |

**Reglas que la matriz hace cumplir:**

1. **`rrhh` y `auditor` no escriben ni borran en ningún recurso.** Es la
   traducción literal de "solo lectura" de la tabla de roles.
2. **El borrado es exclusivo de `admin`, con una excepción: `tiposMantencion`.**
   El técnico opera el parque, no lo destruye. Para activos con historial el
   borrado además está prohibido por completo (ver 2.7.7). La excepción es el
   catálogo `tiposMantencion` (`maintenance_types`): admin y técnico lo
   crean/editan/eliminan por igual, porque es una lista operativa del día a día
   (no configuración del sistema) y el técnico es quien registra las
   mantenciones. Un tipo en uso se retira con `activo = false`, no se borra.
3. **`compras`, `usuarios` y `configuracion` quedan fuera del alcance del
   técnico**: son información financiera, de identidad y de sistema.
4. **`reportes` no tiene escritura para nadie**: un reporte se deriva de los
   datos, no se edita.
5. **Las transiciones del workflow no se autorizan con esta matriz.** La regla
   de qué rol puede ejecutar cada transición vive en la máquina de estados de
   solicitudes (sección 2.5) y es la única fuente de esa decisión. Por eso
   `rrhh` no tiene `write` sobre `solicitudes` y aun así puede ejecutar las
   transiciones de confirmación que le corresponden: la ruta de transición
   sólo exige poder **leer** la solicitud y delega la autorización real en la
   máquina de estados.

**Consecuencia del punto 1 sobre la importación masiva.** Antes de la v1.3 el
código permitía importar activos a `supervisor` y empleados a `supervisor` y
`rrhh`, en contradicción directa con "solo lectura". La matriz corrige esa
divergencia a favor del SPEC: **importar activos y empleados requiere `admin`
o `tecnico`**. Si el negocio necesita que RRHH cargue el maestro de empleados,
el cambio se hace en esta matriz y en esta sección, no en la ruta.

---

# PARTE 2: MODELO DE DATOS (MODEL)

## 2.1 Entidades Principales

### EMPLEADOS (employees)
```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut VARCHAR(12) UNIQUE,                    -- Opcional. Ej: "21.523.308-1" (ver nota)
    nombre VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100),
    correo VARCHAR(150) UNIQUE NOT NULL,       -- Identificador primario. Ej: "bsanjuan@sclconsultores.com"
    cargo VARCHAR(100),
    jefatura VARCHAR(100),                      -- Nombre del jefe directo
    supervisor VARCHAR(100),
    ubicacion VARCHAR(100),                     -- Ej: "Santiago", "Rancagua", "Concepcion"
    tipo_contrato ENUM('planta', 'proyecto', 'externo') NOT NULL,
    fecha_ingreso DATE,
    fecha_termino DATE,                         -- NULL si es planta indefinido
    estado ENUM('activo', 'desvinculado', 'licencia') DEFAULT 'activo',
    telefono_contacto VARCHAR(20),
    microsoft_id VARCHAR(255) UNIQUE,          -- ID del usuario en Microsoft Entra ID
    origen_microsoft BOOLEAN DEFAULT false,    -- true si fue sincronizado desde Entra ID
    fecha_entrega_epp DATE,                    -- Fecha de entrega de EPP al empleado
    fecha_entrega_kit DATE,                    -- Fecha de entrega del kit de bienvenida
    proxima_mantencion_epp DATE,               -- Próxima revisión de EPP programada
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

> **NOTA:** `rut` es opcional porque empleados sincronizados desde Microsoft Entra ID pueden
> no tener el RUT registrado en el directorio corporativo. `correo` es el identificador primario
> para el negocio. En la primera sincronización el match se realiza por `correo`; en las
> sincronizaciones posteriores se usa `microsoft_id` (más robusto ante cambios de email).

### CATEGORÍAS DE ACTIVOS (asset_categories)
```sql
CREATE TABLE asset_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(50) NOT NULL,               -- Ej: "Notebook", "Celular", "Monitor", "Impresora", "Mouse", "Teclado", "EPP"
    descripcion TEXT,
    requiere_serie BOOLEAN DEFAULT true,
    requiere_imei BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### ACTIVOS (assets)
```sql
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id UUID REFERENCES asset_categories(id),
    
    -- Identificación
    numero_serie VARCHAR(50) UNIQUE,           -- Ej: "PF3BXB9T", "T7NXCV03D000278"
    imei VARCHAR(20),                          -- Solo celulares: "354964992749902"
    numero_activo_interno VARCHAR(50),         -- Código interno empresa
    
    -- Especificaciones técnicas
    marca VARCHAR(50) NOT NULL,                -- Ej: "LENOVO", "ASUS", "Samsung", "Honor"
    modelo VARCHAR(100) NOT NULL,              -- Ej: "V14 G2", "ExpertBook B1503CVA", "Honor X6b"
    
    -- Specs Notebook/PC
    procesador VARCHAR(100),                   -- Ej: "Intel Core i5-1135G7"
    disco_duro VARCHAR(50),                    -- Ej: "250 GB", "500 GB"
    ram VARCHAR(20),                           -- Ej: "12 GB", "16 GB"
    pulgadas DECIMAL(4,1),                     -- Positivo. Ej: 14.0, 15.6, 27
    sistema_operativo VARCHAR(50),             -- Ej: "Windows 10", "Windows 11 Pro"
    antivirus VARCHAR(100),                    -- Software antivirus instalado
    nombre_equipo VARCHAR(100),               -- Hostname del equipo en la red corporativa
    
    -- Specs Celular
    numero_telefono VARCHAR(20),               -- Ej: "56996191268"
    numero_activacion VARCHAR(20),             -- Número de línea activación
    tipo_plan VARCHAR(50),                     -- Ej: "Full"
    operador VARCHAR(50),                     -- Operador de telefonía (Entel, Movistar, WOM, etc.)
    tiene_cargador BOOLEAN DEFAULT true,
    
    -- Estado y ubicación
    estado ENUM('disponible', 'asignado', 'en_mantencion', 'reutilizable', 'baja', 'vendido') DEFAULT 'disponible',
    condicion ENUM('nuevo', 'usado', 'dañado') DEFAULT 'nuevo',
    ubicacion_fisica VARCHAR(100),             -- Ej: "Bodega", "Oficina Santiago"
    empleado_actual_id UUID REFERENCES employees(id),  -- Desnormalización: empleado con asignación activa
    
    -- Software/Licencias
    microsoft_365 BOOLEAN DEFAULT false,
    intune_enrolled BOOLEAN DEFAULT false,
    lista_distribucion VARCHAR(200),           -- Listas de correo asignadas
    
    -- Fechas importantes
    fecha_compra DATE,
    fecha_garantia_fin DATE,
    fecha_baja DATE,
    
    -- Observaciones e incidencias
    observaciones TEXT,                        -- Ej: "Pantalla rota, problema BIOS, Teclado malo"
    incidencia TEXT,                           -- Incidencias reportadas (robo, falla hardware, etc.)
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### PROVEEDORES (suppliers)
```sql
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut_empresa VARCHAR(15),
    razon_social VARCHAR(200) NOT NULL,
    nombre_contacto VARCHAR(100),
    email VARCHAR(150),
    telefono VARCHAR(20),
    direccion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### FACTURAS/COMPRAS (purchases)
```sql
CREATE TABLE purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    numero_factura VARCHAR(50),                -- Opcional: gastos menores pueden no tener factura
    fecha_factura DATE NOT NULL,
    monto_total DECIMAL(12,2),
    moneda ENUM('CLP', 'USD') DEFAULT 'CLP',
    tipo_compra ENUM('FACTURA', 'GASTO_MENOR') DEFAULT 'FACTURA',
    metodo_pago ENUM('EFECTIVO', 'TRANSFERENCIA', 'TARJETA_CREDITO', 'CAJA_CHICA', 'REEMBOLSO_PENDIENTE') DEFAULT 'TRANSFERENCIA',
    descripcion TEXT,                          -- Descripción libre de la compra
    comprado_por VARCHAR(100),                 -- Nombre de quien realizó la compra
    orden_compra VARCHAR(50),
    documento_url VARCHAR(500),                -- Link al PDF de la factura
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### DETALLE COMPRA-ACTIVO (purchase_assets)
```sql
CREATE TABLE purchase_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID REFERENCES purchases(id),
    asset_id UUID REFERENCES assets(id),
    precio_unitario DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### ASIGNACIONES (assignments)
```sql
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id),
    employee_id UUID REFERENCES employees(id),
    
    -- Datos de entrega
    fecha_entrega DATE NOT NULL,
    lugar_entrega VARCHAR(100),                -- Ej: "Santiago", "Rancagua"
    entregado_por VARCHAR(100),                -- Ej: "P. Ortega", "C. Fernandez"
    tipo_movimiento ENUM('ingreso', 'cambio', 'reemplazo', 'temporal') NOT NULL,
    motivo TEXT,
    
    -- Datos de devolución
    fecha_devolucion DATE,
    recibido_por VARCHAR(100),
    estado_devolucion ENUM('ok', 'dañado', 'incompleto'),
    observaciones_devolucion TEXT,             -- Ej: "Formateado", "Reasignado"
    
    -- Estado del registro
    activo BOOLEAN DEFAULT true,               -- false cuando se devuelve
    
    -- Acta digital
    acta_entrega_url VARCHAR(500),
    acta_devolucion_url VARCHAR(500),
    firma_empleado_entrega TEXT,               -- Base64 de firma digital
    firma_empleado_devolucion TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### KIT DE BIENVENIDA Y EPP (welcome_kit_items)
```sql
CREATE TABLE welcome_kit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,              -- Ej: "Mouse", "Teclado", "Audifonos", "Casco", "Chaleco"
    categoria ENUM('kit_bienvenida', 'epp') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### ENTREGA KIT/EPP (kit_assignments)
```sql
CREATE TABLE kit_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    item_id UUID REFERENCES welcome_kit_items(id),
    fecha_entrega DATE NOT NULL,
    estado ENUM('entregado', 'devuelto', 'perdido') DEFAULT 'entregado',
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### TIPOS DE MANTENCIÓN (maintenance_types)
```sql
-- Antes era un enum fijo de Postgres. Se volvió catálogo editable (9-sep-2026)
-- para que operaciones pueda mantener la lista sin tocar código ni hacer
-- deploy. Es global (sin sede_id, mismo criterio que asset_categories).
CREATE TABLE maintenance_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR NOT NULL UNIQUE,            -- Ej: "Preventiva", "Correctiva", "Limpieza"
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,               -- Retiro lógico: deja de ofrecerse en el selector
                                              -- pero las mantenciones que ya lo usan lo siguen mostrando
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### MANTENCIONES (maintenances)
```sql
CREATE TABLE maintenances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id),

    tipo_id UUID NOT NULL REFERENCES maintenance_types(id),   -- Antes: enum fijo `tipo`
    descripcion TEXT NOT NULL,                 -- Ej: "Actualización Windows 10 a 11"
    
    fecha_programada DATE,
    fecha_realizada DATE,
    proxima_mantencion DATE,
    
    realizado_por VARCHAR(100),
    costo DECIMAL(10,2),
    proveedor_externo VARCHAR(200),
    
    estado ENUM('pendiente', 'en_proceso', 'completada', 'cancelada') DEFAULT 'pendiente',
    resultado TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### HISTORIAL DE MOVIMIENTOS (asset_history)
```sql
CREATE TABLE asset_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id),
    
    tipo_evento ENUM(
        'creacion',
        'asignacion',
        'devolucion', 
        'mantencion',
        'cambio_estado',
        'actualizacion_specs',
        'baja',
        'venta',
        'solicitud_workflow',        -- Acción ejecutada por el sistema de solicitudes
        'traslado'                   -- Cambio de sede física del activo vía guía de despacho (ver 2.9)
    ) NOT NULL,
    
    descripcion TEXT NOT NULL,
    datos_anteriores JSONB,                    -- Snapshot del estado anterior
    datos_nuevos JSONB,                        -- Snapshot del estado nuevo
    
    usuario_sistema VARCHAR(100),              -- Quien hizo el cambio en el sistema
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### USUARIOS DEL SISTEMA (system_users)
```sql
CREATE TABLE system_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    rol ENUM('admin', 'tecnico', 'supervisor', 'rrhh', 'auditor') NOT NULL,
    activo BOOLEAN DEFAULT true,
    ultimo_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### DESVINCULACIONES (terminations)
```sql
CREATE TABLE terminations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    
    fecha_desvinculacion DATE NOT NULL,
    fecha_devolucion_equipos DATE,
    
    -- Estados de devolución por tipo
    estado_notebook ENUM('ok', 'dañado', 'no_aplica', 'pendiente') DEFAULT 'pendiente',
    estado_celular ENUM('ok', 'dañado', 'no_aplica', 'pendiente') DEFAULT 'pendiente',
    estado_monitor ENUM('ok', 'dañado', 'no_aplica', 'pendiente') DEFAULT 'pendiente',
    estado_kit ENUM('ok', 'incompleto', 'no_aplica', 'pendiente') DEFAULT 'pendiente',
    
    recibido_por VARCHAR(100),
    lugar_devolucion VARCHAR(100),
    
    requiere_descuento BOOLEAN DEFAULT false,
    monto_descuento DECIMAL(10,2),
    motivo_descuento TEXT,
    
    notificado_rrhh BOOLEAN DEFAULT false,
    fecha_notificacion_rrhh TIMESTAMP,
    
    observaciones TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 2.1 bis — Modelos del Sistema de Solicitudes y Despacho

### SOLICITUDES DE WORKFLOW (workflow_requests)
```sql
CREATE TABLE workflow_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero VARCHAR(50) UNIQUE NOT NULL,        -- Ej: "SOL-2026-0001" (auto-generado)
    tipo ENUM('onboarding', 'cambio_equipo', 'devolucion_termino') NOT NULL,
    estado ENUM(
        -- Onboarding
        'solicitud_recibida', 'gestion_ti', 'equipos_entregados', 'registro_rrhh',
        -- Cambio equipo
        'incidencia_detectada', 'cambio_ejecutado', 'confirmacion_rrhh',
        -- Devolución por término
        'solicitud_emitida', 'coordinacion_en_curso', 'equipo_recibido', 'consolidacion_cierre',
        -- Cancelación (los tres tipos, ver 2.5.2)
        'cancelada'
    ) NOT NULL,
    prioridad ENUM('baja', 'media', 'alta', 'urgente') DEFAULT 'media',
    employee_id UUID REFERENCES employees(id) NOT NULL,
    solicitante_id UUID REFERENCES system_users(id) NOT NULL,
    responsable_actual_id UUID REFERENCES system_users(id),

    -- Campos específicos de Onboarding
    fecha_ingreso DATE,
    cargo_solicitado VARCHAR(200),
    ubicacion_destino VARCHAR(200),
    requiere_notebook BOOLEAN DEFAULT false,
    requiere_celular BOOLEAN DEFAULT false,
    requiere_monitor BOOLEAN DEFAULT false,

    -- Campos específicos de Cambio de Equipo
    ticket_freshdesk VARCHAR(100),
    motivo_cambio TEXT,

    -- Campos específicos de Devolución por Término
    fecha_desvinculacion DATE,
    medio_devolucion VARCHAR(100),             -- Ej: "Presencial", "Chilexpress"
    ot_chilexpress VARCHAR(100),
    ciudad_devolucion VARCHAR(200),

    -- Referencias a registros creados como efecto secundario de transiciones
    assignment_ids TEXT[],                     -- IDs de assignments creados por este workflow
    termination_id UUID,                       -- ID del termination creado al cierre
    dispatch_guide_id UUID,                    -- ID de la guía de despacho asociada

    observaciones TEXT,
    fecha_cierre TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### COMENTARIOS DE SOLICITUD (workflow_comments)
```sql
CREATE TABLE workflow_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES workflow_requests(id) ON DELETE CASCADE NOT NULL,
    autor_id UUID REFERENCES system_users(id) NOT NULL,
    mensaje TEXT NOT NULL,
    es_interno BOOLEAN DEFAULT false,          -- true = nota interna, false = comunicación al solicitante
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### TRANSICIONES DE ESTADO (workflow_transitions)
```sql
CREATE TABLE workflow_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES workflow_requests(id) ON DELETE CASCADE NOT NULL,
    estado_anterior ENUM(...) NOT NULL,        -- Ver enum EstadoSolicitud
    estado_nuevo ENUM(...) NOT NULL,
    ejecutado_por_id UUID REFERENCES system_users(id) NOT NULL,
    comentario TEXT,
    datos_accion JSONB,                        -- Datos variables por transición (ver sección 2.5.4)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    -- INMUTABLE: las transiciones nunca se eliminan
);
```

### PENDIENTES DE SOLICITUD (workflow_pendientes)
```sql
CREATE TABLE workflow_pendientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES workflow_requests(id) ON DELETE CASCADE NOT NULL,
    tipo ENUM(
        'celular', 'audifonos', 'mochila', 'cargador',
        'epp_zapatos', 'epp_chaleco', 'epp_casco', 'epp_lentes',
        'kit_bienvenida', 'otro'
    ) NOT NULL,
    estado ENUM('pendiente', 'gestionando', 'entregado', 'no_aplica') DEFAULT 'pendiente',
    descripcion TEXT,
    actualizado_por VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### GUÍAS DE DESPACHO (dispatch_guides)
```sql
CREATE TABLE dispatch_guides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero VARCHAR(50) UNIQUE NOT NULL,        -- Número correlativo auto-generado
    ot_chilexpress VARCHAR(100) NOT NULL,      -- Nº de seguimiento Chilexpress (dato principal)
    fecha_despacho TIMESTAMP NOT NULL,
    fecha_estimada_llegada TIMESTAMP,          -- Opcional
    despachado_por VARCHAR(100) NOT NULL,      -- Emisor: técnico de la sesión
    receptor_nombre VARCHAR(200) NOT NULL,     -- Receptor físico: texto libre (no es un Employee)
    receptor_rut VARCHAR(15) NOT NULL,
    observaciones TEXT,
    -- Solo dos estados: nace 'despachado' (el efecto sobre los activos ya se
    -- aplicó al crear la guía) y pasa a 'realizado' cuando alguien confirma la
    -- llegada física (confirmación puramente informativa). No se puede anular.
    estado ENUM('despachado', 'realizado') DEFAULT 'despachado',
    fecha_recepcion TIMESTAMP,
    recibido_por VARCHAR(100),
    sede_destino_id UUID NOT NULL REFERENCES sedes(id) ON DELETE RESTRICT,  -- Obligatoria
    sede_id UUID REFERENCES sedes(id),         -- Sede del emisor: determina qué soporte ve el registro
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### DETALLE DE GUÍA DE DESPACHO (dispatch_guide_items)
```sql
CREATE TABLE dispatch_guide_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id UUID REFERENCES dispatch_guides(id) ON DELETE CASCADE NOT NULL,
    asset_id UUID REFERENCES assets(id) NOT NULL,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2.5 Sistema de Solicitudes (Workflow)

### 2.5.1 Propósito y casos de uso

El sistema de solicitudes es un **orquestador de procesos** que encapsula flujos de negocio completos, ocultando la complejidad de efectos secundarios (crear asignaciones, desvinculaciones, guías de despacho) detrás de una API de transición de estados. Permite auditar cada paso del proceso con trazabilidad completa.

**Tres tipos de solicitud:**

| Tipo | Descripción | Iniciador | Efecto final |
|------|-------------|-----------|--------------|
| `onboarding` | Nuevo empleado necesita equipos | RRHH/Admin | Crea `assignments` para cada activo entregado |
| `cambio_equipo` | Reemplazo por falla o pérdida | Técnico/Admin | Devuelve activo viejo + asigna activo nuevo |
| `devolucion_termino` | Empleado se desvincula | RRHH/Admin | Crea `termination` con estados por tipo de equipo |

### 2.5.2 Máquinas de estado por tipo

```
ONBOARDING:
  solicitud_recibida → [tecnico|admin] → gestion_ti
  gestion_ti         → [tecnico|admin] → equipos_entregados   ← SIDE EFFECT: crea assignments
  equipos_entregados → [rrhh|admin]    → registro_rrhh        ← ESTADO FINAL

CAMBIO_EQUIPO:
  incidencia_detectada → [tecnico|admin] → cambio_ejecutado   ← SIDE EFFECT: devuelve + asigna
  cambio_ejecutado     → [rrhh|admin]    → confirmacion_rrhh  ← ESTADO FINAL

DEVOLUCION_TERMINO:
  solicitud_emitida     → [tecnico|admin] → coordinacion_en_curso
  coordinacion_en_curso → [tecnico|admin] → equipo_recibido
  equipo_recibido       → [rrhh|admin]    → consolidacion_cierre  ← SIDE EFFECT: crea termination
                                                                   ← ESTADO FINAL

CANCELACIÓN (los tres tipos):
  <estado_inicial_del_tipo> → [tecnico|admin] → cancelada  ← ESTADO FINAL, sin SIDE EFFECT

  No es una transición del diagrama normal de cada tipo: es una acción aparte,
  fuera de `canTransition`/`getNextStates`, solo disponible mientras la
  solicitud no ejecutó ningún efecto secundario todavía (`assignment_ids` y
  `kit_return_ids` vacíos). Existe para el caso "este ticket no debería
  existir" (duplicado, error de carga, ya no aplica) -- ver regla 7 en 2.5.3.
```

### 2.5.3 Reglas de negocio

1. **Roles por estado:** Solo `tecnico` y `admin` pueden avanzar estados intermedios de TI. Solo `rrhh` y `admin` pueden avanzar estados de confirmación RRHH. No hay retroceso de estados.
2. **Activos asignables:** Un activo solo puede asignarse si su `estado` es `disponible` o `reutilizable`.
3. **Empleados asignables:** Un empleado solo puede recibir asignación si su `estado` es `activo`.
4. **Devolución con daño:** Si `estadoDevolucion = danado`, el activo devuelto queda en `baja`. Si es `ok` o `incompleto`, queda en `reutilizable`.
5. **Inmutabilidad:** `workflow_transitions` es un log inmutable. Las transiciones nunca se eliminan.
6. **Acumulación:** `assignment_ids` en `workflow_requests` es acumulativo; cada assignment creado se agrega al array, nunca se sobreescribe.
7. **Cancelación:** cualquier solicitud (de los tres tipos) puede cancelarse mientras `assignment_ids` y `kit_return_ids` sigan vacíos -- es decir, mientras no haya ejecutado ningún efecto secundario real sobre el inventario todavía. Exige un motivo (texto libre, obligatorio) que queda en `workflow_transitions.comentario`. Pasa a `estado = 'cancelada'` y `fecha_cierre = now()`; no modifica activos ni empleados. Si la solicitud ya ejecutó algo (tiene `assignment_ids` y/o `kit_return_ids`), no se puede cancelar por esta vía -- hay que revertir manualmente cada acción (devolver el activo, etc.) antes de poder cerrarla.
8. **Reincorporación (onboarding):** un `onboarding` puede apuntar a un `employee` ya existente que esté `desvinculado` (alguien que trabajó antes y vuelve) en vez de crear uno nuevo -- necesario porque `rut`/`correo_personal`/`correo_empresa` son únicos, así que "crear de nuevo" a esa persona choca con su registro anterior. Al crear el ticket, si el `employee_id` elegido está `desvinculado`, se reactiva (`estado -> activo`, `fecha_termino -> null`) dentro de la misma transacción que crea la solicitud. Para `cambio_equipo` y `offboarding` el empleado desvinculado sigue bloqueado (regla previa a esta, sin numerar aparte): no tiene sentido cambiarle el equipo o desvincular de nuevo a alguien que ya no está activo.

### 2.5.4 Estructura del campo `datos_accion` por transición con efecto

El campo `datos_accion JSONB` en `workflow_transitions` transporta los datos variables de cada transición con efecto secundario:

**`gestion_ti → equipos_entregados` (onboarding):**
```typescript
{
  assetIds: string[]       // requerido: IDs de activos a asignar
  lugarEntrega?: string    // opcional: lugar de entrega
}
```

**`incidencia_detectada → cambio_ejecutado` (cambio_equipo):**
```typescript
{
  oldAssignmentId?: string                              // opcional: asignación a devolver
  estadoDevolucion?: 'ok' | 'danado' | 'incompleto'   // estado del equipo devuelto
  newAssetId?: string                                   // opcional: activo nuevo a asignar
  lugarEntrega?: string
}
```

**`equipo_recibido → consolidacion_cierre` (devolucion_termino):**
```typescript
{
  estadoNotebook?: 'ok' | 'danado' | 'no_aplica' | 'pendiente'
  estadoCelular?:  'ok' | 'danado' | 'no_aplica' | 'pendiente'
  estadoMonitor?:  'ok' | 'danado' | 'no_aplica' | 'pendiente'
  estadoKit?:      'ok' | 'danado' | 'no_aplica' | 'pendiente'
  lugarDevolucion?: string
}
```

---

## 2.6 Integración Microsoft Entra ID (Azure AD)

### Propósito

Sincronización **read-only** de empleados desde el directorio corporativo Microsoft Entra ID. El sistema **nunca escribe** en Entra ID; solo consume datos.

### Flujo de sincronización

1. El admin accede a `/configuracion/microsoft-sync` y presiona el botón de sincronización.
2. El sistema llama a `microsoftGraphService.ts` que consulta la Graph API de Microsoft.
3. Los empleados del directorio se comparan con la BD local.
4. Se crean o actualizan registros; nunca se eliminan (baja se gestiona manualmente).

### Estrategia de match

| Sincronización | Clave de match | Razón |
|---------------|----------------|-------|
| Primera sync | `correo` | El `microsoft_id` aún no está en BD |
| Syncs posteriores | `microsoft_id` | Más robusto ante cambios de email corporativo |

### Campos sincronizados vs manuales

| Campo | Sincronizado | Manual |
|-------|-------------|--------|
| nombres, apellidos | ✅ | |
| correo | ✅ | |
| cargo | ✅ | |
| jefatura | ✅ | |
| ubicacion | ✅ | |
| microsoft_id | ✅ | |
| rut | | ✅ |
| tipoContrato | | ✅ |
| fechaIngreso | | ✅ |
| telefonoContacto | | ✅ |

> **NOTA:** `rut` no está en el directorio de Entra ID. Por eso `rut` es opcional en la tabla
> `employees`. Si un empleado se sincroniza sin RUT, el dato debe ingresarse manualmente después.

---

## 2.7 Máquina de Estados del Ciclo de Vida de Activos

### 2.7.1 Diagrama de transiciones válidas

```
                    ┌─────────────┐
                    │  disponible │
                    └──────┬──────┘
                     ↓          ↓
              ┌──────────┐  ┌──────────────┐
              │ asignado │  │en_mantencion │
              └────┬─────┘  └──────┬───────┘
               ↓   ↓   ↓      ↓   ↓   ↓
    ┌──────────────┐ ┌─────┐  (vuelve a disponible, asignado, o baja)
    │en_mantencion │ │baja │
    └──────────────┘ └──┬──┘
    ┌──────────────┐    ↓
    │ reutilizable │  ┌────────┐
    └──────┬───────┘  │vendido │ (TERMINAL)
     ↓   ↓   ↓       └────────┘
  (asignado, disponible, baja)
```

### 2.7.2 Tabla de transiciones, precondiciones y efectos

| Desde | Hasta | Precondiciones | Efecto |
|-------|-------|----------------|--------|
| `disponible` | `asignado` | Debe existir asignación creada | `empleadoActualId` se actualiza |
| `disponible` | `en_mantencion` | Debe existir mantención programada | — |
| `asignado` | `reutilizable` | Requiere devolución con estado `ok` o `incompleto` | `empleadoActualId` → null |
| `asignado` | `baja` | Requiere devolución con estado `danado` | `empleadoActualId` → null, `fechaBaja` = hoy |
| `asignado` | `en_mantencion` | Debe existir mantención programada | Asignación se pausa |
| `en_mantencion` | `disponible` | Mantención completada + activo NO tenía asignación previa | — |
| `en_mantencion` | `asignado` | Mantención completada + activo tenía asignación previa | — |
| `en_mantencion` | `baja` | Mantención completada con resultado `no_reparable` + motivo obligatorio | `fechaBaja` = hoy |
| `reutilizable` | `asignado` | Debe existir nueva asignación | `empleadoActualId` se actualiza |
| `reutilizable` | `disponible` | Sin restricción | — |
| `reutilizable` | `baja` | Requiere motivo obligatorio | `fechaBaja` = hoy |
| `baja` | `vendido` | Requiere datos de venta (comprador, monto, fecha) | — |
| `vendido` | — | **Estado terminal.** No se permite ninguna transición. | — |

### 2.7.3 Proceso de Baja

Dar de baja un activo es una operación irreversible (solo puede ir a `vendido` después). Requiere:

1. **Precondiciones:**
   - El activo NO tiene asignación activa (si tiene, debe devolverse primero)
   - El activo NO está en mantención activa (si está, debe cerrarse primero)
2. **Datos obligatorios:**
   - `motivo`: `obsolescencia` | `falla_irreparable` | `robo` | `extravio` | `otro`
   - `condicionFinal`: `danado` | `usado`
   - Si motivo = `otro`, se requiere `motivoDetalle` (texto libre)
3. **Efectos automáticos:**
   - `fechaBaja` = fecha actual
   - `estado` → `baja`
   - `condicion` → `condicionFinal` proporcionado
   - Registro en `asset_history` con tipo `baja`

### 2.7.4 Proceso de Venta

1. **Precondiciones:**
   - Estado = `baja` o `reutilizable`
   - Sin asignación activa
2. **Datos obligatorios:**
   - `comprador`: nombre/razón social
   - `monto`: número positivo
   - `moneda`: `CLP` o `USD`
   - `fechaVenta`: fecha
3. **Datos opcionales:**
   - `documentoVenta`: URL al documento de venta
4. **Efectos automáticos:**
   - `estado` → `vendido`
   - Registro en `asset_history` con tipo `venta`

### 2.7.5 Cierre de Mantención

El cierre de una mantención determina el destino del activo:

| Resultado | Estado destino del activo | Datos requeridos |
|-----------|--------------------------|------------------|
| `reparado` | Estado previo a la mantención (`disponible` si no tenía asignación, `asignado` si tenía) | `realizadoPor` |
| `no_reparable` | `baja` | `realizadoPor`, `motivoBaja` (obligatorio) |
| `pendiente_repuestos` | Sigue en `en_mantencion` | `realizadoPor` |

Datos opcionales para todos: `costo`, `proveedorExterno`, `proximaMantencion`.

### 2.7.6 Reasignación de Equipo

Operación atómica que ejecuta devolución + asignación en una transacción.

1. **Precondiciones:**
   - Activo en estado `asignado`
   - Estado de devolución ≠ `danado` (si dañado → bloquear, sugerir baja)
   - Empleado destino en estado `activo`
2. **Datos obligatorios:**
   - `assignmentId`: asignación actual a devolver
   - `newEmployeeId`: empleado destino
   - `estadoDevolucion`: `ok` | `incompleto`
   - `motivoReasignacion`: texto libre
3. **Efectos automáticos:**
   - Assignment actual → `activo = false`, `fechaDevolucion` = hoy
   - Nuevo assignment creado con `tipoMovimiento = cambio`
   - `empleadoActualId` → nuevo empleado
   - 2 registros en `asset_history`: `devolucion` + `asignacion`

### 2.7.7 Devolución Formalizada

Regla de destino automático del activo tras devolución:

| Estado devolución | Destino activo | Descripción daños |
|-------------------|---------------|-------------------|
| `ok` | `reutilizable` | No requerida |
| `danado` | `baja` | **Obligatoria** |
| `incompleto` | `reutilizable` | Opcional |

Efectos: `empleadoActualId` → null, assignment → `activo = false`.

---

## 2.8 Aislamiento por Sede (Multi-Sede)

El sistema opera sobre varias sedes físicas (ej. Santiago, Concepción, Rancagua). Un usuario `tecnico` solo debe ver y operar sobre los registros de **su propia sede**; `admin` ve y puede crear en cualquier sede sin restricción.

### 2.8.1 Modelo `Sede`
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `codigo` | String, único | Slug corto y estable (ej: `STGO`, `CCP`) |
| `nombre` | String | Nombre visible |
| `activa` | Boolean, default `true` | Permite desactivar sin perder el historial de activos/guías que la referencian |

### 2.8.2 Regla de aislamiento

La sede de un registro **no se elige libremente en su formulario**: se hereda de la sede del usuario que lo crea. Un `admin` sin sede propia puede elegirla explícitamente (o dejar el registro transversal, sin sede). Esto evita que un técnico cruce registros a otra sede por error.

Único punto de verdad: `src/lib/auth/sedeScope.ts`, con cuatro funciones que consumen todas las rutas de API afectadas:
- `tieneVisibilidadTotal(session)` — true solo para `admin`.
- `sedeWhere(session)` — fragmento de `where` para listados: `{}` para admin, `{ sedeId: session.user.sedeId }` para técnico.
- `assertSedeAccess(session, registroSedeId, mensaje)` — exige que un registro ya cargado pertenezca a la sede de la sesión; lanza 404 (no 403) para no revelar que el registro existe en otra sede.
- `sedeIdParaCrear(session, sedeIdSolicitada?)` — decide la sede de un registro nuevo: la del técnico (ignorando cualquier valor del body), o la que el admin haya elegido.

Aplica a: `activos`, `empleados`, `solicitudes`, `mantenciones`, `asignaciones`, `desvinculaciones`, `guias` (guías de despacho), `compras` y `kit EPP`. No aplica a datos maestros globales (categorías, proveedores) ni a `usuarios`/`configuración`.

### 2.8.3 Reasignación de sede

- **Empleado:** un `admin` puede reasignar la sede de un empleado ya creado (ej. se traslada de Concepción a Santiago), editando el registro directamente. Un técnico no puede — el campo se ignora en silencio si lo envía.
- **Activo:** no tiene edición directa de sede. El traslado de un activo entre sedes ocurre exclusivamente a través de una Guía de Despacho (ver 2.9).

---

## 2.9 Guías de Despacho (`dispatch_guides`)

Registro de que un lote de equipos fue despachado hacia otra sede, vía Chilexpress. **No es un flujo de aprobación**: crear la guía aplica de inmediato su efecto sobre los activos — la guía es el comprobante de una acción que el técnico ya ejecutó físicamente (llevó el paquete a Chilexpress), no una solicitud pendiente.

### 2.9.1 Campos
| Campo | Tipo | Descripción |
|---|---|---|
| `numero` | String, único | Auto-generado: `GD-{año}-{correlativo de 5 dígitos}` |
| `otChilexpress` | String, obligatorio | Número de seguimiento Chilexpress — todo despacho pasa por ahí, es el dato principal |
| `fechaDespacho` | DateTime, obligatorio | Fecha de envío |
| `fechaEstimadaLlegada` | DateTime, opcional | Estimación informativa |
| `despachadoPor` | String | Emisor — se autocompleta con el nombre del usuario de la sesión, no editable |
| `receptorNombre`, `receptorRut` | String, obligatorios | Quien firma la recepción física del paquete. **Texto libre a propósito**: no siempre es un `Employee` del sistema (puede ser alguien no onboardeado todavía) |
| `sedeDestinoId` | UUID, obligatorio (FK `Sede`) | Sede a la que se despachan los equipos. Debe ser distinta de la sede del emisor |
| `sedeId` | UUID, opcional (FK `Sede`) | Sede del emisor (heredada por `sedeIdParaCrear`, ver 2.8) |
| `observaciones` | String, opcional | |
| `estado` | Enum `EstadoGuia`: `despachado` \| `realizado` | Solo dos estados — ver 2.9.3 |
| `fechaRecepcion`, `recibidoPor` | DateTime / String, opcionales | Se completan al confirmar recepción |
| `items` | `DispatchGuideItem[]` | Activos incluidos en la guía |

No existe campo "Tipo de Despacho" (se eliminó el enum `TipoDespacho` — `asignacion`/`traslado`/`prestamo`): toda guía se comporta igual, sin distinción de tipo.

### 2.9.2 Efecto al crear (POST) — aplica de inmediato

Precondición: todos los activos seleccionados deben existir, pertenecer a la sede del emisor (salvo admin) y estar en estado `disponible`. Si alguno no cumple, la creación se rechaza completa (400).

Dentro de una transacción:
1. Se crea el registro `DispatchGuide` con `estado = despachado`.
2. Cada activo incluido cambia su `sedeId` a `sedeDestinoId` y su `estado` se mantiene/confirma en `disponible` — queda listo para ser asignado por el técnico de la sede destino a través del módulo de Asignaciones (no se crea ninguna `Assignment` automáticamente).
3. Se registra un evento `traslado` en `asset_history` por cada activo, referenciando el número de guía y la OT Chilexpress.

### 2.9.3 Estados y confirmación de recepción

| Estado | Significado |
|---|---|
| `despachado` | Estado inicial. El efecto sobre los activos ya se aplicó |
| `realizado` | Alguien confirmó que el paquete llegó físicamente (`PATCH` con `recibidoPor` y opcionalmente `fechaRecepcion`) |

La confirmación de recepción es **puramente informativa**: no modifica activos ni asignaciones, solo cierra el ciclo de la guía como comprobante.

**La guía no se puede anular ni eliminar una vez creada.** No existe `DELETE` en la API ni estado `anulado`/`pendiente`.

### 2.9.4 Visibilidad

A diferencia del resto de los módulos con aislamiento por sede (2.8), una guía interesa a **dos** sedes: la del emisor y la sede destino, porque el técnico que recibe el despacho necesita verla para confirmar la recepción. Un técnico ve una guía si su sede coincide con `sedeId` **o** con `sedeDestinoId`; `admin` ve todas.

### 2.9.5 Sin documento PDF

La guía es solo un registro dentro del sistema (listado + detalle) — no genera ningún documento PDF descargable.

---

# PARTE 3: ARQUITECTURA TÉCNICA (ARCHITECTURE)

## 3.1 Stack Tecnológico Recomendado

### Opción A: Stack Moderno Full JavaScript (RECOMENDADO para recursos limitados)
```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  Next.js 14+ (App Router) + TypeScript + Tailwind CSS           │
│  + shadcn/ui (componentes) + React Query (estado servidor)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API                                 │
│  Next.js API Routes (mismo proyecto) + Prisma ORM               │
│  Autenticación: NextAuth.js                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BASE DE DATOS                              │
│  PostgreSQL (Supabase FREE tier o Railway)                      │
│  + Supabase Storage para documentos/actas                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DEPLOYMENT                                 │
│  Vercel (FREE tier) o Railway                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Opción B: Stack Python (si prefieren Python)
```
Frontend: React + Vite + TypeScript
Backend: FastAPI + SQLAlchemy
DB: PostgreSQL
Deploy: Railway o Render
```

## 3.2 Estructura de Carpetas del Proyecto

```
inventario-it/
├── prisma/
│   ├── schema.prisma              # Modelo de datos completo
│   ├── migrations/                # Migraciones de BD
│   └── seed.ts                    # Datos iniciales
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx         # Layout con sidebar
│   │   │   ├── page.tsx           # Dashboard principal
│   │   │   │
│   │   │   ├── activos/
│   │   │   │   ├── page.tsx       # Lista de activos
│   │   │   │   ├── [id]/page.tsx  # Detalle activo
│   │   │   │   ├── nuevo/page.tsx # Crear activo
│   │   │   │   └── importar/page.tsx # Importar desde Excel
│   │   │   │
│   │   │   ├── empleados/
│   │   │   │   ├── page.tsx       # Lista empleados
│   │   │   │   ├── [rut]/page.tsx # Ficha empleado (la azul)
│   │   │   │   └── nuevo/page.tsx
│   │   │   │
│   │   │   ├── asignaciones/
│   │   │   │   ├── page.tsx       # Historial asignaciones
│   │   │   │   ├── nueva/page.tsx # Nueva asignación
│   │   │   │   └── devolucion/page.tsx
│   │   │   │
│   │   │   ├── desvinculaciones/
│   │   │   │   ├── page.tsx       # Lista desvinculaciones
│   │   │   │   └── [id]/page.tsx  # Proceso desvinculación
│   │   │   │
│   │   │   ├── mantenciones/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── programar/page.tsx
│   │   │   │   └── calendario/page.tsx
│   │   │   │
│   │   │   ├── compras/
│   │   │   │   ├── page.tsx       # Facturas y proveedores
│   │   │   │   └── nueva/page.tsx
│   │   │   │
│   │   │   ├── stock/
│   │   │   │   ├── page.tsx       # Vista stock general
│   │   │   │   ├── disponibles/page.tsx
│   │   │   │   ├── bodega/page.tsx
│   │   │   │   └── baja/page.tsx
│   │   │   │
│   │   │   ├── reportes/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── trazabilidad/page.tsx
│   │   │   │   └── rrhh/page.tsx  # Reportes para RRHH
│   │   │   │
│   │   │   └── configuracion/
│   │   │       ├── usuarios/page.tsx
│   │   │       ├── categorias/page.tsx
│   │   │       └── proveedores/page.tsx
│   │   │
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── activos/route.ts
│   │       ├── empleados/route.ts
│   │       ├── asignaciones/route.ts
│   │       ├── mantenciones/route.ts
│   │       ├── reportes/route.ts
│   │       ├── export/
│   │       │   ├── excel/route.ts
│   │       │   └── pdf/route.ts
│   │       └── import/
│   │           └── excel/route.ts
│   │
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components
│   │   ├── forms/
│   │   │   ├── AssetForm.tsx
│   │   │   ├── EmployeeForm.tsx
│   │   │   ├── AssignmentForm.tsx
│   │   │   └── MaintenanceForm.tsx
│   │   ├── tables/
│   │   │   ├── AssetsTable.tsx
│   │   │   ├── EmployeesTable.tsx
│   │   │   └── DataTable.tsx      # Componente genérico
│   │   ├── cards/
│   │   │   ├── AssetCard.tsx
│   │   │   ├── EmployeeCard.tsx   # La ficha azul
│   │   │   └── StatsCard.tsx
│   │   ├── charts/
│   │   │   ├── StockChart.tsx
│   │   │   └── AssignmentsChart.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx
│   │       ├── Header.tsx
│   │       └── Breadcrumb.tsx
│   │
│   ├── lib/
│   │   ├── prisma.ts              # Cliente Prisma
│   │   ├── auth.ts                # Config NextAuth
│   │   ├── utils.ts               # Utilidades generales
│   │   ├── validations/           # Schemas Zod
│   │   │   ├── asset.ts
│   │   │   ├── employee.ts
│   │   │   └── assignment.ts
│   │   └── services/
│   │       ├── assetService.ts
│   │       ├── employeeService.ts
│   │       ├── assignmentService.ts
│   │       ├── reportService.ts
│   │       └── excelService.ts    # Importar/Exportar Excel
│   │
│   ├── hooks/
│   │   ├── useAssets.ts
│   │   ├── useEmployees.ts
│   │   └── useAssignments.ts
│   │
│   └── types/
│       └── index.ts               # TypeScript types
│
├── public/
│   └── templates/
│       ├── acta_entrega.html      # Template para PDF
│       └── acta_devolucion.html
│
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

## 3.3 Diagrama de Flujos Principales

### Flujo 1: Ingreso de Nuevo Colaborador
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   RRHH       │     │  Sistema     │     │  Técnico IT  │     │  Empleado    │
│ (notifica)   │────▶│  (registro)  │────▶│  (asigna)    │────▶│  (firma)     │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                            │                    │                     │
                            ▼                    ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
                     │ Crear        │     │ Seleccionar  │     │ Acta digital │
                     │ empleado     │     │ equipo       │     │ generada     │
                     │ con RUT      │     │ disponible   │     │ + firma      │
                     └──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │ Notificar    │
                                         │ RRHH con     │
                                         │ ficha azul   │
                                         └──────────────┘
```

### Flujo 2: Desvinculación de Colaborador
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ RRHH notifica│     │ Sistema      │     │ Empleado     │     │ Técnico IT   │
│ desvinculac. │────▶│ lista equipos│────▶│ devuelve     │────▶│ revisa estado│
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                                      │
                     ┌────────────────────────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │ ¿Estado OK? │
              └─────────────┘
                /         \
              SI           NO
              /             \
             ▼               ▼
    ┌──────────────┐  ┌──────────────┐
    │ Equipo a     │  │ Marcar daño  │
    │ "disponible" │  │ Calcular     │
    │ o "reutiliz."│  │ descuento    │
    └──────────────┘  └──────────────┘
            │                │
            └────────┬───────┘
                     │
                     ▼
              ┌──────────────┐
              │ Generar      │
              │ reporte RRHH │
              │ con estados  │
              └──────────────┘
```

### Flujo 3: Ciclo de Vida del Activo
```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌─────────┐
│ COMPRA  │───▶│DISPONIBLE│───▶│ ASIGNADO │───▶│ DEVUELTO  │───▶│ REVISIÓN│
│(factura)│    │(stock)   │    │(empleado)│    │           │    │         │
└─────────┘    └──────────┘    └──────────┘    └───────────┘    └─────────┘
                    ▲                                                │
                    │                                                │
                    │         ┌──────────────────────────────────────┤
                    │         │                                      │
                    │         ▼                                      ▼
                    │   ┌───────────┐                          ┌──────────┐
                    └───│REUTILIZABLE│                          │   BAJA   │
                        │(limpieza) │                          │(chatarra)│
                        └───────────┘                          └──────────┘
                                                                     │
                                                                     ▼
                                                               ┌──────────┐
                                                               │  VENDIDO │
                                                               └──────────┘
```

---

# PARTE 4: PLAN DE DESARROLLO (DESIGN)

## 4.1 Fases de Desarrollo

### FASE 1: Setup Inicial y Autenticación (Sprint 1 - Semana 1-2)
```
Tareas:
□ Crear proyecto Next.js con TypeScript
□ Configurar Tailwind CSS + shadcn/ui
□ Configurar Prisma con PostgreSQL
□ Crear schema.prisma completo (copiar modelo de datos de este documento)
□ Ejecutar primera migración
□ Implementar NextAuth.js con credenciales
□ Crear tabla system_users y seed con usuario admin
□ Crear páginas de login/logout
□ Crear layout principal con sidebar
□ Proteger rutas con middleware de autenticación
```

### FASE 2: Módulo de Activos (Sprint 2 - Semana 3-4)
```
Tareas:
□ CRUD completo de categorías de activos
□ CRUD completo de activos con todos los campos
□ Tabla de activos con filtros por:
  - Categoría (notebook, celular, monitor, etc.)
  - Estado (disponible, asignado, baja, etc.)
  - Marca
  - Ubicación
□ Vista detalle de activo con historial
□ Formulario de creación/edición con validaciones Zod
□ Importador de Excel para migración inicial
□ Exportador a Excel
```

### FASE 3: Módulo de Empleados (Sprint 3 - Semana 5-6)
```
Tareas:
□ CRUD completo de empleados
□ Búsqueda por RUT (formato chileno con validación)
□ Tabla de empleados con filtros por:
  - Estado (activo, desvinculado)
  - Tipo contrato (planta, proyecto)
  - Ubicación
  - Jefatura
□ Ficha de empleado (LA FICHA AZUL) mostrando:
  - Datos personales
  - Equipos asignados (notebook, celular, monitor)
  - Kit de bienvenida
  - EPP entregado
  - Historial de asignaciones
□ Importador de empleados desde Excel
```

### FASE 4: Módulo de Asignaciones (Sprint 4 - Semana 7-8)
```
Tareas:
□ Flujo de nueva asignación:
  - Seleccionar empleado por RUT
  - Mostrar equipos disponibles
  - Registrar entrega (fecha, lugar, quien entrega)
  - Generar acta de entrega PDF
  - Actualizar estado activo a "asignado"
  - Crear registro en historial
□ Flujo de devolución:
  - Buscar asignaciones activas del empleado
  - Registrar estado de devolución (ok, dañado)
  - Agregar observaciones
  - Generar acta de devolución PDF
  - Actualizar estado activo (disponible/reutilizable/dañado)
□ Historial de asignaciones por activo (trazabilidad)
□ Historial de asignaciones por empleado
```

### FASE 5: Módulo de Desvinculaciones (Sprint 5 - Semana 9-10)
```
Tareas:
□ Registro de desvinculación vinculado a empleado
□ Checklist de equipos a devolver (auto-populated)
□ Registro de estados de devolución por tipo de equipo
□ Cálculo y registro de descuentos si aplica
□ Generación de reporte para RRHH (formato ficha azul)
□ Notificación/envío por email a RRHH (opcional)
□ Vista de desvinculaciones pendientes de devolución
```

### FASE 6: Módulo de Mantenciones (Sprint 6 - Semana 11-12)
```
Tareas:
□ CRUD de mantenciones
□ Tipos: preventiva, correctiva, actualización SO, limpieza
□ Programación de mantenciones con fecha
□ Calendario de mantenciones próximas
□ Alertas de mantenciones vencidas
□ Registro de mantención realizada
□ Historial de mantenciones por activo
□ Integración con datos de Intune (opcional - fase futura)
```

### FASE 7: Módulo de Compras y Proveedores (Sprint 7 - Semana 13-14)
```
Tareas:
□ CRUD de proveedores
□ CRUD de facturas/compras
□ Vinculación factura -> activos (números de serie)
□ Vista de activos por factura
□ Reporte de compras por proveedor
□ Reporte de compras por período
□ Subida de documentos de factura (PDF)
```

### FASE 8: Dashboard y Reportes (Sprint 8 - Semana 15-16)
```
Tareas:
□ Dashboard principal con KPIs:
  - Total activos por categoría
  - Activos disponibles vs asignados
  - Equipos en mantención
  - Equipos para dar de baja
  - Desvinculaciones pendientes de devolución
  - Próximas mantenciones
□ Gráficos:
  - Stock por categoría (barras)
  - Estado de equipos (pie chart)
  - Asignaciones por mes (línea temporal)
□ Reportes:
  - Inventario completo
  - Activos por empleado
  - Historial de activo (trazabilidad completa)
  - Reporte para RRHH de desvinculaciones
  - Equipos obsoletos (Windows 10, viejos)
□ Exportación a Excel y PDF
```

### FASE 9: Refinamiento y Producción (Sprint 9 - Semana 17-18)
```
Tareas:
□ Testing completo
□ Optimización de queries
□ Documentación de usuario
□ Migración de datos desde Excel actual
□ Configuración de ambiente de producción
□ Deploy a Vercel/Railway
□ Configuración de backups automáticos
□ Capacitación usuarios
```

---

# PARTE 5: ESPECIFICACIONES DETALLADAS PARA LA IA

## 5.1 Instrucciones Generales para la IA que Codificará

```markdown
# INSTRUCCIONES PARA LA IA DESARROLLADORA

## Contexto
Vas a desarrollar un sistema de control de inventario IT para una empresa chilena.
El sistema debe manejar: notebooks, celulares, monitores, impresoras, periféricos y EPP.
Existe alta rotación de personal (empleados de planta y por proyecto).
El objetivo principal es trazabilidad de activos y gestión de entregas/devoluciones.

## Stack Obligatorio
- Next.js 14+ con App Router
- TypeScript (strict mode)
- Prisma ORM
- PostgreSQL
- Tailwind CSS + shadcn/ui
- NextAuth.js para autenticación
- Zod para validaciones
- React Query (TanStack Query) para estado servidor

## Reglas de Código
1. Todo el código debe estar en TypeScript con tipos estrictos
2. Usar server components por defecto, client components solo cuando sea necesario
3. Validar todos los inputs con Zod schemas
4. Usar Prisma para todas las operaciones de BD
5. Implementar soft delete donde sea apropiado
6. Registrar TODOS los cambios en asset_history
7. Manejar errores con try-catch y respuestas apropiadas
8. Usar transacciones de Prisma para operaciones múltiples

## Formato de RUT Chileno
- Almacenar con puntos y guión: "21.523.308-1"
- Validar dígito verificador
- Función de formateo y validación requerida

## Estados de Activos
- disponible: Listo para asignar
- asignado: En uso por un empleado
- en_mantencion: En proceso de reparación/actualización
- reutilizable: Devuelto, necesita limpieza/revisión
- baja: Para dar de baja (chatarra)
- vendido: Ya vendido

## Generación de PDFs
- Usar @react-pdf/renderer para actas
- Templates para: acta_entrega, acta_devolucion, ficha_empleado, reporte_rrhh

## Historial y Trazabilidad
- CADA cambio de estado debe registrarse en asset_history
- Guardar snapshots JSON del estado anterior y nuevo
- Registrar usuario que realizó el cambio
- Nunca eliminar registros de historial
```

## 5.2 Componentes Específicos a Desarrollar

### Componente: Ficha de Empleado (La Ficha Azul)
```typescript
// Especificación para la IA:
// Crear componente EmployeeCard que muestre:
// - Búsqueda por RUT en header
// - Sección NOTEBOOK con: nombre, correo, equipo, marca, modelo, N° serie,
//   procesador, disco duro, RAM, estado, fecha entrega
// - Sección Kit Bienvenida: estado entregado/pendiente
// - Sección EPP: estado entregado/pendiente  
// - Sección CELULAR con: nombre, marca, modelo, N° serie, IMEI, estado,
//   N° teléfono, fecha entrega, cargador (si/no)
// - Estilo: fondo azul (#0066CC), texto blanco, labels en columna izquierda
// - Debe ser exportable a PDF
// - Debe ser enviable por email a RRHH
```

### Componente: Tabla de Stock
```typescript
// Especificación para la IA:
// Crear DataTable reutilizable con:
// - Columnas configurables
// - Filtros múltiples
// - Ordenamiento por columna
// - Paginación
// - Exportar a Excel
// - Acciones por fila (ver, editar, eliminar)
// - Código de colores por estado:
//   - Verde: disponible
//   - Azul: asignado
//   - Amarillo: en_mantencion
//   - Naranja: reutilizable
//   - Rojo: baja
```

### Componente: Formulario de Asignación
```typescript
// Especificación para la IA:
// Crear wizard de asignación en 4 pasos:
// Paso 1: Buscar/seleccionar empleado por RUT
// Paso 2: Seleccionar activos disponibles (multi-select)
// Paso 3: Completar datos de entrega (fecha, lugar, quien entrega, motivo)
// Paso 4: Confirmar y generar acta
// 
// Validaciones:
// - Empleado debe estar activo
// - Activos deben estar en estado "disponible"
// - Fecha no puede ser futura
// - Campos obligatorios marcados con *
```

## 5.3 APIs a Implementar

```typescript
// Listado de endpoints REST necesarios:

// === ACTIVOS ===
GET    /api/activos                    // Listar con filtros y paginación
GET    /api/activos/:id                // Detalle con historial
POST   /api/activos                    // Crear nuevo
PUT    /api/activos/:id                // Actualizar
DELETE /api/activos/:id                // Soft delete
GET    /api/activos/:id/historial      // Historial completo del activo
POST   /api/activos/importar           // Importar desde Excel
GET    /api/activos/exportar           // Exportar a Excel

// === EMPLEADOS ===
GET    /api/empleados                  // Listar con filtros
GET    /api/empleados/:rut             // Buscar por RUT
GET    /api/empleados/:rut/ficha       // Ficha completa (la azul)
POST   /api/empleados                  // Crear nuevo
PUT    /api/empleados/:id              // Actualizar
GET    /api/empleados/:id/activos      // Activos asignados al empleado
POST   /api/empleados/importar         // Importar desde Excel

// === ASIGNACIONES ===
GET    /api/asignaciones               // Listar todas
POST   /api/asignaciones               // Nueva asignación
PUT    /api/asignaciones/:id/devolver  // Registrar devolución
GET    /api/asignaciones/:id/acta      // Generar acta PDF

// === DESVINCULACIONES ===
GET    /api/desvinculaciones           // Listar pendientes
POST   /api/desvinculaciones           // Iniciar proceso
PUT    /api/desvinculaciones/:id       // Actualizar estados
GET    /api/desvinculaciones/:id/reporte // Reporte para RRHH

// === MANTENCIONES ===
GET    /api/mantenciones               // Listar todas
GET    /api/mantenciones/pendientes    // Próximas/vencidas
POST   /api/mantenciones               // Programar nueva
PUT    /api/mantenciones/:id           // Actualizar/completar

// === COMPRAS ===
GET    /api/compras                    // Listar facturas
POST   /api/compras                    // Registrar factura
POST   /api/compras/:id/activos        // Vincular activos a factura

// === REPORTES ===
GET    /api/reportes/inventario        // Inventario completo
GET    /api/reportes/stock             // Stock por categoría y estado
GET    /api/reportes/trazabilidad/:id  // Historial completo de activo
GET    /api/reportes/rrhh              // Reporte para RRHH

// === DASHBOARD ===
GET    /api/dashboard/stats            // KPIs principales
GET    /api/dashboard/alertas          // Alertas (mantenciones, devoluciones pendientes)
```

## 5.4 Validaciones Zod Requeridas

```typescript
// Ejemplo de schemas que la IA debe implementar:

// RUT Chileno con validación de dígito verificador
const rutSchema = z.string()
  .regex(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/, "Formato RUT inválido")
  .refine(validateRutChileno, "RUT inválido");

// Activo
const assetSchema = z.object({
  categoria_id: z.string().uuid(),
  numero_serie: z.string().min(1).max(50),
  imei: z.string().max(20).optional(),
  marca: z.string().min(1).max(50),
  modelo: z.string().min(1).max(100),
  procesador: z.string().max(100).optional(),
  disco_duro: z.string().max(50).optional(),
  ram: z.string().max(20).optional(),
  pulgadas: z.number().positive().optional(),
  sistema_operativo: z.string().max(50).optional(),
  estado: z.enum(['disponible', 'asignado', 'en_mantencion', 'reutilizable', 'baja', 'vendido']),
  condicion: z.enum(['nuevo', 'usado', 'dañado']),
  ubicacion_fisica: z.string().max(100).optional(),
});

// Empleado
const employeeSchema = z.object({
  rut: rutSchema,
  nombre: z.string().min(1).max(100),
  apellido_paterno: z.string().min(1).max(100),
  apellido_materno: z.string().max(100).optional(),
  correo: z.string().email(),
  cargo: z.string().max(100).optional(),
  jefatura: z.string().max(100).optional(),
  ubicacion: z.string().max(100).optional(),
  tipo_contrato: z.enum(['planta', 'proyecto', 'externo']),
  fecha_ingreso: z.date().optional(),
  fecha_termino: z.date().optional(),
});

// Asignación
const assignmentSchema = z.object({
  asset_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  fecha_entrega: z.date(),
  lugar_entrega: z.string().max(100),
  entregado_por: z.string().max(100),
  tipo_movimiento: z.enum(['ingreso', 'cambio', 'reemplazo', 'temporal']),
  motivo: z.string().optional(),
});
```

---

# PARTE 6: DATOS DE MIGRACIÓN INICIAL

## 6.1 Categorías de Activos (seed)
```typescript
const categories = [
  { nombre: 'Notebook', requiere_serie: true, requiere_imei: false },
  { nombre: 'Celular', requiere_serie: true, requiere_imei: true },
  { nombre: 'Monitor', requiere_serie: true, requiere_imei: false },
  { nombre: 'Impresora', requiere_serie: true, requiere_imei: false },
  { nombre: 'Mouse', requiere_serie: false, requiere_imei: false },
  { nombre: 'Teclado', requiere_serie: false, requiere_imei: false },
  { nombre: 'Docking Station', requiere_serie: true, requiere_imei: false },
  { nombre: 'Webcam', requiere_serie: true, requiere_imei: false },
  { nombre: 'Audífonos', requiere_serie: false, requiere_imei: false },
];
```

## 6.2 Items Kit Bienvenida y EPP (seed)
```typescript
const kitItems = [
  { nombre: 'Mouse', categoria: 'kit_bienvenida' },
  { nombre: 'Teclado', categoria: 'kit_bienvenida' },
  { nombre: 'Audífonos', categoria: 'kit_bienvenida' },
  { nombre: 'Mousepad', categoria: 'kit_bienvenida' },
  { nombre: 'Mochila', categoria: 'kit_bienvenida' },
  { nombre: 'Casco', categoria: 'epp' },
  { nombre: 'Chaleco reflectante', categoria: 'epp' },
  { nombre: 'Zapatos de seguridad', categoria: 'epp' },
  { nombre: 'Guantes', categoria: 'epp' },
  { nombre: 'Lentes de seguridad', categoria: 'epp' },
];
```

## 6.3 Estructura Excel para Importación
```
La IA debe crear un importador que acepte Excel con estas columnas:

Para Activos (notebooks):
RUT | Nombre | Correo | Cargo | Jefatura | Ubicación | Marca | Modelo | Serie | 
Procesador | Disco Duro | RAM | Estado | Tipo | Fecha | Office | O.S | Observaciones

Para Celulares:
RUT | Nombre | Marca | Modelo | N° Serie | IMEI | Nro Activación | Estado | 
Fecha Asig | Cargador | Tipo Plan | Lugar Entrega

Para Empleados:
Jefatura | Supervisor | RUT | Nombre | Apellido P | Apellido M | Correo | Cargo | 
Ubicación | Tipo Contrato | Fecha Ingreso
```

---

# PARTE 7: CHECKLIST DE ENTREGABLES

## Para la IA desarrolladora, verificar que el sistema incluya:

### Funcionalidades Core
- [ ] Login/Logout con roles
- [ ] CRUD completo de activos
- [ ] CRUD completo de empleados
- [ ] Búsqueda de empleado por RUT
- [ ] Ficha de empleado (la azul) con todos sus equipos
- [ ] Asignación de activos a empleados
- [ ] Devolución de activos con registro de estado
- [ ] Historial/trazabilidad por activo
- [ ] Historial/trazabilidad por empleado
- [ ] Proceso de desvinculación
- [ ] Registro de mantenciones
- [ ] Gestión de proveedores y facturas
- [ ] Vinculación factura-activos

### Reportes y Exports
- [ ] Dashboard con KPIs
- [ ] Reporte de inventario completo
- [ ] Reporte de stock disponible
- [ ] Reporte para RRHH (desvinculaciones)
- [ ] Exportar a Excel
- [ ] Generar actas en PDF

### Técnicos
- [ ] Validación RUT chileno
- [ ] Soft delete implementado
- [ ] Registro automático en historial
- [ ] Transacciones en operaciones múltiples
- [ ] Manejo de errores consistente
- [ ] Responsive design

---

# FIN DEL DOCUMENTO DE ESPECIFICACIONES

Versión: 1.2
Fecha: 2026-04-07
Metodología: BMAD + SDD (Spec Driven Design)
Autor: Arquitectura generada para desarrollo por IA
```

---

### 2.7.7 Borrado de activos: el historial no se destruye

Un activo con historial o con asignaciones **no se elimina**. El registro de
auditoría es evidencia (ISO 9001, 7.5.3) y borrarlo junto con el activo destruye
justamente lo que da fe de lo ocurrido.

`DELETE /api/activos/{id}` se comporta así:

| Situación del activo | Respuesta |
|---|---|
| Tiene historial o asignaciones | **409**, indicando que corresponde darlo de baja con `POST /api/activos/{id}/baja` |
| Está asignado a alguien (`estado = asignado`) | **409**: primero se devuelve el equipo |
| Sin historial ni asignaciones (creado por error) | Borrado físico permitido |

**Campo nuevo `deletedAt` (`deleted_at`, `DateTime?`, nullable).** Marca un
activo como retirado de los listados sin borrar su fila ni su historial. Su
razón de ser es el caso concreto que hoy se resuelve borrando: los duplicados
que deja una importación. Reglas:

- `deletedAt = null` es un activo vigente. Es el valor por defecto.
- Un activo con `deletedAt` no aparece en listados, búsquedas, reportes ni
  estadísticas, y no puede asignarse.
- Su ficha y su historial siguen siendo accesibles por id: la trazabilidad no
  se pierde.
- Marcar un activo con `deletedAt` deja un evento `baja` en `AssetHistory`, con
  el motivo y el usuario que lo hizo.
- Sólo `admin` puede marcarlo (acción `delete` sobre el recurso `activos`,
  sección 1.3.1).

**Cómo se marca.** `DELETE /api/activos/{id}?descartar=true&motivo=...`. El
motivo es obligatorio: descartar sin decir por qué deja el mismo vacío de
evidencia que se está corrigiendo. La operación escribe el evento en
`AssetHistory` y marca `deletedAt` en una sola transacción.

`deletedAt` **no reemplaza** al estado `baja`. Son cosas distintas: `baja` es un
estado del ciclo de vida del equipo, con fecha y motivo, y el activo sigue
apareciendo en el inventario como dado de baja. `deletedAt` dice que el registro
nunca debió existir como fila separada.

---

## Changelog SPEC

- **v1.6 (2026-09-10):**
  - Sección 2.1: se documenta el modelo `maintenance_types` (catálogo editable, global, con retiro lógico `activo`) y el cambio de `maintenances.tipo` (enum fijo) a `maintenances.tipo_id` (FK). El refactor se hizo el 9-sep-2026 pero no estaba en el SPEC.
  - Sección 1.3.1: se agrega el recurso `tiposMantencion` a la matriz de permisos (`RWD` para admin y técnico) y la excepción a la regla 2 — el técnico sí puede borrar tipos de mantención, por ser catálogo operativo y no configuración del sistema.
- **v1.5 (2026-09-10):**
  - Sección 2.8 (nueva): Aislamiento por Sede (Multi-Sede) — documenta el modelo `Sede`, la regla de aislamiento (`sedeScope.ts`: `tieneVisibilidadTotal`, `sedeWhere`, `assertSedeAccess`, `sedeIdParaCrear`) y los módulos afectados. Esto ya estaba implementado; el SPEC no lo documentaba pese a que el código cita "SPEC 2.9" desde hace tiempo.
  - Sección 2.9 (nueva): Guías de Despacho (`dispatch_guides`) — rediseño completo: elimina `TipoDespacho` y el vínculo a `Employee` como destinatario (ahora `receptorNombre`/`receptorRut` en texto libre), agrega `otChilexpress` como dato principal obligatorio y `sedeDestinoId` obligatorio, el efecto (traslado de sede + `disponible`) ocurre de inmediato al crear (no hay confirmación de "recibido" que lo gatille), la guía no se puede anular ni eliminar, y se reduce a dos estados (`despachado`/`realizado`, este último solo informativo). Se elimina también la generación de PDF. `asset_history.tipo_evento` agrega el valor `traslado` (un evento por activo despachado, con la sede anterior y la nueva).
- **v1.4 (2026-09-09):**
  - Sección 2.5.2: agrega la acción de cancelación (`cancelada`), disponible para los tres tipos de solicitud mientras no hayan ejecutado ningún efecto secundario (`assignment_ids`/`kit_return_ids` vacíos).
  - Sección 2.5.3: regla 7 -- condiciones y efecto de la cancelación (exige motivo, no toca inventario, no revierte acciones ya ejecutadas).
  - Sección 2.5.3: regla 8 -- un onboarding puede reincorporar a un empleado existente `desvinculado` (en vez de crear uno nuevo, que chocaría con rut/correo únicos); se reactiva automáticamente al crear el ticket.
- **v1.0 (2025):** Versión inicial — 12 modelos, stack definido, metodología BMAD.
- **v1.3 (2026-08-21):**
  - Sección 1.3.1: matriz de permisos ejecutable (13 recursos × 3 acciones × 5 roles) como único punto de verdad de la autorización, consumida por la API y por la UI.
  - Sección 1.3.1: se corrige la divergencia en importación masiva — importar activos y empleados exige `admin` o `tecnico`; el código lo permitía a `supervisor` y `rrhh`, contra el "solo lectura" del SPEC.
  - Sección 2.7.7: borrado de activos con historial prohibido (409, corresponde baja) y campo `deletedAt` para retirar duplicados de importación sin destruir la auditoría.
  - Atomicidad: la actualización de un activo escribe historial y activo en una sola transacción.
- **v1.2 (2026-04-07):**
  - Sección 2.7: Máquina de estados del ciclo de vida de activos con 12 transiciones válidas, precondiciones y efectos.
  - Sección 2.7.3: Proceso de baja con motivos y condición final.
  - Sección 2.7.4: Proceso de venta con datos obligatorios.
  - Sección 2.7.5: Cierre de mantención con resultado estructurado.
  - Sección 2.7.6: Reasignación de equipo (devolución + asignación atómica).
  - Sección 2.7.7: Devolución formalizada con destino automático.
  - Fix bug: devolución danado → baja (era reutilizable).
- **v1.1 (2026-04-07):**
  - Corrección `employees.rut`: NOT NULL → nullable. Razón: sync Microsoft Entra ID.
  - Agrega campos Employee: `microsoft_id`, `origen_microsoft`, `fecha_entrega_epp`, `fecha_entrega_kit`, `proxima_mantencion_epp`.
  - Agrega campos Asset: `antivirus`, `nombre_equipo`, `operador`, `incidencia`, `empleado_actual_id`.
  - Agrega campos Purchase: `tipo_compra`, `metodo_pago`, `descripcion`, `comprado_por`. `numero_factura` pasa a nullable.
  - `asset_history.tipo_evento`: agrega valor `solicitud_workflow`.
  - Sección 2.1 bis: agrega 6 modelos nuevos (`workflow_requests`, `workflow_comments`, `workflow_transitions`, `workflow_pendientes`, `dispatch_guides`, `dispatch_guide_items`).
  - Sección 2.5: Sistema de Solicitudes (Workflow) — máquinas de estado, reglas de negocio, estructura `datos_accion`.
  - Sección 2.6: Integración Microsoft Entra ID — flujo, estrategia de match, campos sincronizados vs manuales.
