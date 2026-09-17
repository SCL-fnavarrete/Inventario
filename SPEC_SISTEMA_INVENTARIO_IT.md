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
4. **Correlación con facturas**: Saber con qué factura llegó cada activo (sin correlación financiera ni de proveedor -- ver 2.10, cambio 11-sep-2026)
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
| compras | RWD | RW | R | — | R |
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
3. **`usuarios` y `configuracion` quedan fuera del alcance del técnico**: son
   información de identidad y de sistema. `compras` sí es alcance del técnico
   desde el 11-sep-2026 (ver 2.10) — puede registrar y ver sus propias
   compras (RW, nunca D), sin restricción de campos: el modelo ya no tiene
   proveedor ni dato financiero (monto, moneda, método de pago, precio
   unitario) para ningún rol, admin incluido -- se eliminaron del todo.
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

    -- Conectividad: compartido por Mouse, Teclado, Webcam, Audífonos (11-sep-2026, ver 2.11)
    conectividad VARCHAR(20),                  -- "usb" | "bluetooth" | "cable"

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

Directorio independiente (ver 2.10): hasta el 11-sep-2026 estaba
referenciado desde `purchases`; ya no lo esta, se mantiene como catalogo
propio sin usarse hoy desde ningun otro modulo.

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

Simplificada el 11-sep-2026 (ver 2.10): sin proveedor (catálogo) ni dato
financiero, solo la factura (para relacionarla) y su sede. El mismo día se
agregó `rut_proveedor` (texto libre, validado con dígito verificador, sin
referencia al catálogo `suppliers`) y se eliminó `documento_url`, que ya
no se usaba (ver 2.10.1).

```sql
CREATE TABLE purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sede_id UUID REFERENCES sedes(id),         -- Nullable solo por compatibilidad con filas antiguas: admin ahora debe elegir sede al crear (ver 2.10.1)
    numero_factura VARCHAR(50),                -- Opcional: gastos menores pueden no tener factura
    fecha_factura DATE NOT NULL,
    rut_proveedor VARCHAR(15),                 -- Texto libre validado (dígito verificador), sin catálogo (11-sep-2026)
    tipo_compra ENUM('FACTURA', 'GASTO_MENOR') DEFAULT 'FACTURA',
    descripcion TEXT,                          -- Descripción libre de la compra
    comprado_por VARCHAR(100),                 -- Nombre de quien realizó la compra
    orden_compra VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### DETALLE COMPRA-ACTIVO (purchase_assets)
```sql
CREATE TABLE purchase_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID REFERENCES purchases(id),
    asset_id UUID REFERENCES assets(id),
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

    -- Condición del cargador (solo aplica si el activo es un notebook con
    -- tiene_cargador = true; para el resto de categorías queda NULL). Ver
    -- regla 9 en 2.5.3. No es un activo propio -- es un atributo de esta
    -- entrega/devolución puntual.
    condicion_cargador_entrega ENUM('ok', 'dañado', 'no_aplica', 'pendiente'),
    condicion_cargador_devolucion ENUM('ok', 'dañado', 'no_aplica', 'pendiente'),
    observaciones_cargador TEXT,                -- Ej: "Cable pelado", "No traía cargador"

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
9. **Condición del cargador:** cuando el activo entregado/devuelto en un `assignment` es un notebook con `tiene_cargador = true`, se puede registrar por separado la condición de su cargador (`condicion_cargador_entrega` al crear la asignación, `condicion_cargador_devolucion` al devolverla), con una observación libre opcional (`observaciones_cargador`). El cargador no es un activo propio en el inventario -- es solo un atributo de esa entrega/devolución puntual, igual que cualquier otro dato del acta. A diferencia de `estado_devolucion` del equipo, la condición del cargador **no** cambia el `estado` ni la `condicion` del Activo ni gatilla baja: es puramente informativo, para que quede constancia en el acta y en el historial. Se implementó primero en onboarding (entrega, 15-sep-2026); `cambio_equipo` y `offboarding` se extendieron con el mismo patrón el 16-sep-2026 (ver SPEC 2.48), que además agregó el lado de la *devolución* -- hasta entonces `condicion_cargador_devolucion` existía en el modelo pero ningún flujo lo escribía.

### 2.5.4 Estructura del campo `datos_accion` por transición con efecto

El campo `datos_accion JSONB` en `workflow_transitions` transporta los datos variables de cada transición con efecto secundario:

**`gestion_ti → equipos_entregados` (onboarding):**
```typescript
{
  assetIds: string[]       // requerido: IDs de activos a asignar
  lugarEntrega?: string    // opcional: lugar de entrega
  // Condición del cargador por activo entregado (solo se usa para los
  // assetIds que sean notebook con tiene_cargador = true; el resto se
  // ignora). Ver regla 9 en 2.5.3.
  condicionCargador?: Record<string, {
    condicion: 'ok' | 'danado' | 'no_aplica'
    observaciones?: string
  }>
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

La sede de un registro **no se elige libremente en su formulario**: se hereda de la sede del usuario que lo crea. Un `admin` sin sede propia debe elegirla explícitamente -- el selector que ve (en activos, empleados y solicitudes) no ofrece una opción "sin sede"/en blanco, y el backend rechaza la creación si de todos modos llega vacía. Antes se permitía dejarlo transversal (sin sede), pero en la práctica eso dejaba el registro visible solo para ese admin: el filtro por sede de un técnico nunca calza con `sedeId = null`, así que ningún técnico llegaba a verlo ni gestionarlo -- quedaba huérfano sin que nadie lo notara. Ver nota (11-sep-2026) en `sedeIdParaCrear`.

Único punto de verdad: `src/lib/auth/sedeScope.ts`, con cuatro funciones que consumen todas las rutas de API afectadas:
- `tieneVisibilidadTotal(session)` — true solo para `admin`.
- `sedeWhere(session)` — fragmento de `where` para listados: `{}` para admin, `{ sedeId: session.user.sedeId }` para técnico.
- `assertSedeAccess(session, registroSedeId, mensaje)` — exige que un registro ya cargado pertenezca a la sede de la sesión; lanza 404 (no 403) para no revelar que el registro existe en otra sede.
- `sedeIdParaCrear(session, sedeIdSolicitada?, opts?)` — decide la sede de un registro nuevo: la del técnico (ignorando cualquier valor del body), o la que el admin haya elegido. Con `opts.requerido = true` (activo en los cinco módulos operativos que ofrecen el selector a admin: activos, empleados, solicitudes, guías de despacho -- sede origen -- y compras, desde el 11-sep-2026), rechaza la creación con 400 si el admin no eligió ninguna.

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

Precondición: todos los activos seleccionados deben existir, pertenecer a la sede del emisor y estar en estado `disponible`. Si alguno no cumple, la creación se rechaza completa (400).

La sede emisora ya no puede quedar en blanco para admin (cambio 11-sep-2026, igual que en 2.8.2): el formulario de Nueva Guía de Despacho le pide elegir explícitamente una "Sede origen" antes de mostrarle el inventario disponible, que además queda acotado a esa sede (no puede mezclar equipos de sedes distintas en un mismo despacho). `POST /api/guias-despacho` usa `sedeIdParaCrear(session, body.sedeId, { requerido: true })`.

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

### 2.9.6 Fix UI: nombre de categoría oculto en el selector de equipos (18-sep-2026)

Javier, probando el módulo: *"Sería bueno que en eso del guía de despacho salga el tipo de equipo. Sale el ícono, pero la idea es que también salga por nombre."* En `SelectorActivos` (el listado de equipos disponibles al crear una guía), el ícono de categoría siempre se mostraba, pero el nombre de la categoría al lado (`asset.categoria.nombre`) tenía la clase `hidden lg:inline` -- solo visible en pantallas ≥1024px, invisible en las demás. Se saca esa condición: el nombre queda siempre visible, sin importar el ancho de pantalla.

**Segunda ubicación, mismo día:** Javier: *"¿Dónde se supone que agregaste el nombre ya que no sale acá en el guía de despacho? Cuando la estoy creando."* El primer fix solo tocó la tabla completa de equipos disponibles -- la franja de "equipos seleccionados" (los chips que aparecen arriba apenas se elige uno o más, que es lo que se ve de inmediato al crear la guía) tenía el mismo problema pero nunca mostraba el nombre de categoría, con o sin `hidden`: solo icono + marca/modelo + serie. Se agrega el nombre de categoría también ahí.

### 2.9.7 Se quitan los botones de filtrar/limpiar del listado (18-sep-2026)

Javier, probando el listado: *"En el dashboard de guía de despacho hay como dos íconos. Uno para filtro y otro para resetear. Encuentro que no es necesario ya que hay tan pocos filtros que se puede hacer de manera manual."* Se quitan ambos botones del listado (`/guias-despacho`): el de enviar el formulario (ícono `Filter`, redundante desde que la búsqueda ya debouncea sola, SPEC 2.14.1) y el de "Limpiar filtros" (ícono `RefreshCw`), que con solo un buscador de texto y un `<select>` de estado no aporta frente a limpiarlos a mano. El formulario sigue aceptando Enter (`handleSearch` no se tocó) y la búsqueda sigue debounceando automáticamente; solo se sacaron los botones.

### 2.9.8 El listado respeta el selector de sede del nav, por ambas puntas (18-sep-2026)

Javier: *"también quiero que resuelvas el mismo problema con la sede del navbar en la guía de despacho, ya que no lo toma."* `GET /api/guias-despacho` no leía ningún `sedeId`, así que el listado no reaccionaba al selector del menú -- el mismo gap que tenía Compras (2.10.5), por otra causa: acá no había un selector propio, simplemente no estaba implementado.

Se filtra por **ambas puntas**, origen y destino: `OR: [{ sedeId }, { sedeDestinoId }]`. Una guía le interesa a las dos sedes involucradas (ver 2.9.4), así que elegir Concepción en el menú muestra tanto las que salen de ahí como las que llegan ahí -- misma regla que ya aplicaba `guiaWhereVisible` para un rol con visibilidad restringida. El parámetro solo tiene efecto para quien tiene visibilidad total, igual que en el resto de las rutas de listado.

### 2.9.9 La sede origen se muestra en el listado y en el detalle (18-sep-2026)

Javier: *"falta la sede de origen, que igual es un dato importante."* Tanto el listado como el detalle mostraban solo la sede destino. En el detalle el dato ya venía de la API (`sede`), simplemente no se renderizaba; en el listado ni siquiera se consultaba -- el `include` de `GET /api/guias-despacho` traía `sedeDestino` pero no `sede`.

Se agrega en los dos: una columna "Sede origen" antes de "Sede destino" en la tabla, y una fila equivalente en "Datos del Despacho". Es especialmente relevante desde 2.9.8, donde el filtro del nav muestra las guías por ambas puntas: sin ver el origen, no se distingue si una guía aparece porque sale de la sede filtrada o porque llega a ella.

---

## 2.10 Compras (`purchases`): acceso de técnico y modelo simplificado (11-sep-2026)

Registrar una compra pasó de ser exclusivo de `admin` a ser trabajo operativo compartido con `tecnico` (matriz 1.3.1: `compras` es `RW` para técnico, no solo `R`). El caso de uso: llega un despacho de otra sede y el técnico necesita dejarlo registrado — con qué factura vino y para qué activos — igual que cualquier otro módulo con aislamiento por sede (2.8), sin depender de que el administrador lo cargue.

**Aislamiento por sede.** Igual que el resto de 2.8: un técnico solo ve y crea compras de su propia sede (`sedeWhere`/`sedeIdParaCrear` en `GET`/`POST /api/compras`, `assertSedeAccess` en las rutas de detalle `[id]` y `[id]/activos`). La sede es obligatoria para admin (11-sep-2026, ver 2.8.2): `sedeIdParaCrear` se usa con `{ requerido: true }`, igual que en activos/empleados/solicitudes/guías -- el selector no ofrece "sin sede" y el backend rechaza la creación (y también el intento de vaciarla al editar) si de todos modos llega en blanco. Antes de este ajuste se permitía dejarla transversal; se corrigió por el mismo motivo que en los demás módulos (2.8.2): un registro sin sede sólo lo veía el admin que lo creó, ningún técnico.

**Vinculación de activos restringida a la propia sede.** Un técnico solo puede vincular a una compra activos cuyo `sedeId` coincida con el suyo (`POST /api/compras` y `POST /api/compras/:id/activos` rechazan con 400 "Algunos activos no pertenecen a tu sede" si no calza). Admin no tiene esa restricción.

**El modelo se redujo a solo dos datos (mismo día, pedido explícito de Javier, minutos después del cambio anterior).** La primera versión de este cambio dejó los campos financieros (`montoTotal`, `moneda`, `metodoPago`, `precioUnitario`) visibles solo para admin. Javier pidió ir más allá: "el tema del dinero no es un dato que nos interese" — ni para admin ni para técnico. Al área de soporte solo le importan dos cosas: **la factura, para relacionarla, y los equipos que vinieron con ella.** Tampoco le importa el proveedor ("los proveedores tampoco importa, la verdad").

Por eso, `Purchase` **ya no tiene** `supplierId`/`supplier`, `montoTotal`, `moneda` ni `metodoPago`, y `PurchaseAsset` **ya no tiene** `precioUnitario` — no es una restricción de UI por rol, los campos no existen en el modelo (migración `20260911200000_compras_solo_factura_y_equipos`, sin backfill posible porque el dato deja de tener uso). Es igual para admin y técnico — ya no hay ningún campo que restringir por rol dentro de compras; el único límite entre ambos es el aislamiento por sede de arriba, y el botón "Eliminar" en el detalle, detrás de `<Can recurso="compras" accion="delete">` porque borrar sigue siendo exclusivo de `admin`.

**El directorio de proveedores (`Supplier`/`suppliers`) no se borró, se desvinculó.** Sigue existiendo como catálogo independiente con su propio CRUD (`/api/proveedores`, `/configuracion/proveedores`), simplemente ya no lo referencia `Purchase` ni se usa desde el flujo de compras. Se conservó porque no hay endpoints que romper al mantenerlo — no porque haya un plan concreto de reutilizarlo.

El endpoint de reportes `GET /api/reportes/compras` no tiene ninguna pantalla que lo consuma (no hay un "Reportes → Compras" en `/reportes`); se simplificó igual, a conteos por período y resumen, para que compilara contra el modelo nuevo en vez de dejarlo roto o borrarlo.

### 2.10.1 RUT del proveedor, eliminación del documento y alta de equipos en el mismo formulario (11-sep-2026)

Mismo día, cambio posterior al de arriba, también pedido explícito de Javier: *"en el registro de la factura, yo aplicaría la borrada del documento, pero agregaría el RUT del proveedor. Y también la idea es que en esa misma formulario pueda agregar los equipos que me llegaron."*

**Se eliminó `documentoUrl`.** El campo "URL del Documento (PDF)" no se usaba y se sacó por completo del modelo (`Purchase.documentoUrl`), del formulario de creación, de la vista de detalle (botón "Ver Documento") y de la vista de lista. Migración `20260911210000_compras_rut_proveedor_sin_documento`.

**Se agregó `rutProveedor` como texto libre, sin catálogo.** Igual criterio que la desvinculación de `Supplier` en 2.10: Javier fue explícito en que no quiere un selector contra el catálogo de proveedores ("texto simple, obviamente, algún tipo de validación para validar que el rut es válido"). El campo es opcional, valida formato y dígito verificador con la misma utilidad que el RUT de un empleado (`rutOptionalSchema` en `src/lib/validations/rut.ts`, reutilizada tal cual — no se escribió una validación nueva), y no referencia `suppliers.id`. Se agregó a los filtros de búsqueda de la lista (`GET /api/compras?search=`) y a la vista de detalle (bajo "Datos de la Factura", solo si tiene valor).

**Alta de equipos nuevos dentro del mismo formulario de compra.** Antes, "Vincular Activos" en `/compras/nueva` solo permitía buscar y enlazar activos ya existentes. Ahora hay un segundo modo, "Crear Equipo Nuevo": un mini-formulario inline (categoría, marca, modelo, N° de serie opcional) que llama a `POST /api/activos` — el mismo endpoint que usa `/activos/nuevo` — en vez de duplicar la lógica de creación dentro de la transacción de compras. Esto significa que el activo creado desde compras hereda automáticamente las mismas reglas que un activo creado desde su propio formulario: asignación de sede (`sedeIdParaCrear` con `{ requerido: true }`), validación de N° de serie duplicado, y registro en el historial (`assetHistoryService.registrarCreacion`). El botón "Crear Equipo Nuevo" está deshabilitado para admin hasta que elija una sede (la compra necesita saber a qué sede pertenece el activo nuevo antes de poder crearlo), con un aviso explicando por qué.

### 2.10.2 El campo Sede aparece en todos los formularios de creación, para cualquier rol (18-sep-2026)

Javier, preguntando cómo se comporta la sede para un técnico: *"estoy en el usuario de administrador y siempre voy a tener que elegir una sede. Pero si, por ejemplo, fuera el técnico, ¿la sede también tengo que elegirla o la toma automática?"* La respuesta destapó que tres módulos habían quedado desalineados con SPEC 2.29.

**El problema.** Antes de SPEC 2.29 (14-sep-2026), un técnico heredaba su sede automáticamente en el backend y por eso a varios formularios no se les puso el campo. Ese cambio invirtió la regla —`sedeIdParaCrear` pasó a exigir la sede explícita también al técnico, porque desde entonces tiene visibilidad total— pero solo se actualizó Activos > Nuevo. Los que quedaron atrás:

1. **Compras > Nueva** (roto): el campo estaba tras `isAdmin &&` y el `sedeId` ni se enviaba, así que un técnico llenaba toda la compra y al guardar recibía *"Debes seleccionar una sede"* refiriéndose a un campo que no está en su pantalla. Sin salida posible desde la interfaz. Contradictorio además con el propio `POST /api/compras`, que unas líneas más abajo ya asume que el técnico trabaja en su sede (valida que los activos y artículos de Kit/EPP vinculados sean de ella).
2. **Activos > Importar** (roto): mismo patrón, el selector de sede era admin-only y la validación previa (`if (isAdmin && !sedeId)`) dejaba pasar al técnico hasta chocar con el backend.
3. **Kit/EPP** (silencioso, peor): ahí `sedeIdParaCrear` se llama sin `requerido`, así que no falla — le creaba los artículos **sin sede**, y después no aparecían al filtrar por sede en el menú, sin ningún aviso.

**La solución.** El campo Sede pasa a mostrarse a cualquier rol en los tres, como selector editable precargado con la sede del usuario (`session.user.sedeId`), idéntico al patrón que ya usaban Activos > Nuevo, Solicitudes > Nueva y Guías de Despacho > Nueva. En Compras, los bloqueos de "primero elige la sede" (vincular activos, crear equipo nuevo, catálogo de Kit/EPP) dejan de depender del rol y dependen solo de si hay sede elegida. En Kit/EPP la precarga aplica solo al crear, nunca al editar: ahí manda la sede que ya tiene el artículo, para no moverlo de sede sin querer. En esa misma pantalla, la **columna** Sede de la tabla también deja de ser admin-only -- si el técnico puede elegir la sede al crear, tiene que poder ver en cuál quedó cada artículo. Eliminar sigue siendo solo de admin, que es un permiso y no un tema de visibilidad.

No se tocó la visibilidad ni `sedeIdParaCrear`: esto solo completa SPEC 2.29 donde había quedado a medias. Queda pendiente, como decisión aparte, si el técnico debería tener ese campo **bloqueado** en su propia sede en vez de editable.

### 2.10.3 El buscador de equipos de una compra se acota a su sede (18-sep-2026)

Javier, probando el módulo: *"si hay que hacer ese filtro, pero se supone que eso se debería aplicar automáticamente al elegirlo por el navbar, ¿no?"* No: el selector del nav es un filtro de vista; lo que manda acá es la **sede de la compra**, que es un dato del registro. Con el nav en "todas" no filtraría nada, y con el nav en otra sede ofrecería equipos que no corresponden a la compra.

El problema: `searchAssets()` llamaba a `GET /api/activos?search=` sin ningún `sedeId`, tanto en `/compras/nueva` como en el detalle. Un admin podía entonces vincular a una compra de Santiago un equipo de Concepción. El backend no lo impide porque esa validación (`Algunos activos no pertenecen a tu sede`) solo corre para quien no es admin. En el detalle, además, era inconsistente consigo mismo: el catálogo de Kit/EPP de esa misma pantalla ya se filtraba con la sede de la compra.

Se corrige en las dos pantallas pasando la sede de la compra al buscador. En `/compras/nueva` eso implica tres ajustes más: el botón "Buscar Existente" pasa a exigir sede elegida (antes solo la exigía "Crear Equipo Nuevo"), el aviso ámbar se reescribe para cubrir ambos, y cambiar la sede a mitad del formulario limpia los equipos y artículos ya elegidos, que son de la sede anterior -- mismo criterio que Nueva Guía de Despacho al cambiar la sede origen.

### 2.10.4 Una compra exige al menos un equipo o artículo (18-sep-2026)

Javier, probando el módulo: *"hay un problema que me deja crear una factura sin colocar equipos o kits."* Correcto: en `createPurchaseWithAssetsSchema` tanto `assets` como `kitItems` eran opcionales con `[]` por defecto, y el formulario tampoco lo exigía, así que se podía guardar una factura vacía -- un registro que no relaciona nada, justo lo contrario del propósito del módulo ("la factura, para relacionarla, y los equipos que vinieron con ella", ver 2.10).

Se exige al menos una línea, de cualquiera de los dos tipos, en los dos lados: un `superRefine` en el schema (que rechaza con un mensaje que nombra el campo) y, en `/compras/nueva`, el botón Guardar deshabilitado con un aviso que explica por qué, más una guarda en `handleSubmit`.

Se evaluó y descartó la alternativa de permitirla con una confirmación, pensando en registrar la factura antes de que lleguen los equipos: en el flujo real la compra se registra cuando el despacho llega, así que no aporta. Agregar equipos o artículos **después** de creada sigue siendo posible desde el detalle, eso no cambió.

### 2.10.5 Editar una factura, y la sede del listado pasa al selector del nav (18-sep-2026)

Tres hallazgos de Javier probando el módulo:

**No se podía editar una compra ya creada.** El detalle no tenía ningún botón de edición, pese a que `PUT /api/compras/:id` existe desde siempre: un número de factura mal tipeado o una fecha equivocada solo se arreglaban eliminando la compra y rehaciéndola. Se agrega un botón "Editar" en el detalle que abre un modal con N° de factura, fecha, RUT proveedor, orden de compra y sede. Cambiar la sede de la compra no mueve los equipos ya vinculados: cada activo conserva la suya.

**El listado ignoraba el selector de sede del nav.** Era la única pantalla con su **propio** `<select>` de sede ("Todas las sedes"), heredado de antes de que existiera el selector global. Se quita el propio y pasa a usar `useSedeSeleccionada`, igual que Activos, Mantenciones, Solicitudes y Personal -- un solo lugar en toda la app donde se elige sede.

**"Limpiar filtros" pasaba desapercibido.** Existía, junto a las fechas, pero solo se renderizaba si había algún filtro puesto y era un link de texto. Queda siempre visible, con aspecto de botón, deshabilitado cuando no hay nada que limpiar.

### 2.10.6 El número de factura es único en todo el sistema (18-sep-2026)

Javier: *"solo puede existir un n de factura único."* Se evaluaron tres alcances (único por sede, global, o por RUT de proveedor) y se eligió **global**: no puede existir dos veces el mismo número, sin importar sede ni proveedor.

Se valida en `POST /api/compras` y en `PUT /api/compras/:id` (excluyendo la propia compra que se edita), devolviendo el error asociado al campo `numeroFactura`. No se agregó un índice único en la base a propósito, para no exigir una migración; el número sigue siendo opcional en el esquema, así que la comprobación solo corre cuando viene con valor.

### 2.10.7 La ficha del activo muestra con qué compra llegó (18-sep-2026)

Javier: *"agregar una tarjeta donde salga su asociación a una compra."* `/activos/:id` no mencionaba la compra en ninguna parte -- solo el campo suelto "Fecha Compra" y, si acaso, un evento `compra` perdido en el historial -- aunque el vínculo existe como `PurchaseAsset` desde que se creó el módulo.

Se agrega una tarjeta "Compra asociada" en la columna lateral, sobre el historial, con el número de factura, la fecha, la orden de compra, el RUT del proveedor, la sede y un link a la compra. Solo aparece si el equipo está vinculado a alguna: los cargados a mano o por importación no tienen ninguna. La consulta se extendió en la propia página (es un server component que consulta Prisma directo, no pasa por `/api/activos/:id`).

---

## 2.11 Formulario de Activos: especificaciones por categoría (11-sep-2026)

Pedido explícito de Javier, mientras revisaba el formulario de Activos: *"tenemos audífonos, celular, impresora, monitor, mouse, etcétera... deberíamos hacer un formulario específico para cada activo... un formulario general con... y luego, aparte, dependiendo qué seleccionamos, desplegar otro tipo de formulario."*

**El patrón ya existía para tres categorías antes de este cambio.** `/activos/nuevo` y `/activos/:id/editar` tienen una sección "Información General" (categoría, marca, modelo, N° de serie, etc.) común a todo activo, y debajo, condicionada a `selectedCategory.nombre`, una sección de especificaciones propia para Notebook (procesador, RAM, disco, sistema operativo, antivirus, nombre de equipo), Celular (IMEI, teléfono, almacenamiento, operador) y Monitor (pulgadas). Lo que faltaba era extender ese mismo patrón al resto de las categorías del catálogo (`Impresora`, `Mouse`, `Teclado`, `Docking Station`, `Webcam`, `Audífonos`), que hasta ahora solo tenían el formulario general.

**Se agregó, y en el mismo día se revirtió, una sección propia para Impresora.** La primera versión de este cambio agregaba tipo (`laser`/`tinta`), conexión (`usb`/`red`) e IP. Javier la revisó y decidió que no era necesaria ("no creo que sea necesario para una impresora"): se eliminaron los tres campos de `Asset`, su sección en el formulario y la validación (migración `20260911220000_activos_specs_impresora_perifericos` que los agregó, revertida por `20260911230000_activos_revertir_specs_impresora`). Impresora queda con solo el formulario general, igual que antes de este cambio.

**Para los periféricos simples (Mouse, Teclado, Webcam, Audífonos) se agregó un solo campo compartido: Conectividad** (`usb`/`bluetooth`/`cable`), en vez de cuatro secciones casi idénticas. Javier fue explícito en que a estos "no es necesario" un formulario propio -- textualmente: *"basta con colocar su identificador único que cada equipo lo tiene"* (el N° de serie, que ya vive en la sección general) -- y luego confirmó que sí quería agregar este único campo a los cuatro. Campo nuevo en `Asset`: `conectividad`. Este campo no se revirtió.

**Docking Station queda sin campos propios por ahora.** No se mencionó explícitamente en la conversación que originó este cambio; si en el futuro se necesita, sigue el mismo patrón (condicional por `selectedCategory.nombre`, campo(s) nuevo(s) en `Asset`, migración).

**La vista de detalle (`/activos/:id`) tenía un gap que se corrigió de paso.** El bloque "Especificaciones Técnicas" solo mostraba `procesador`/`discoDuro`/`ram`/`pulgadas`/`sistemaOperativo` -- ni siquiera los campos de Celular (IMEI, teléfono, operador) se veían ahí, a pesar de estar guardados. Se amplió para incluir también `antivirus`, `nombreEquipo`, `imei`, `numeroTelefono`, `operador` y `conectividad` -- todos condicionados a que el activo tenga el dato, sin asumir su categoría. Este ajuste no se revirtió: sigue vigente aunque Impresora ya no tenga specs propias.

**Fuera de alcance de este cambio:** los reportes de exportación (`GET /api/reportes/inventario/excel`), las actas/anexos de entrega y los selectores de equipos en Guías de Despacho/Solicitudes no se tocaron -- siguen mostrando solo las specs de Notebook.

### 2.11.1 `prisma/seed.ts`: de datos de ejemplo a seed mínimo de producción (11-sep-2026)

Javier preguntó dónde se definen los activos que se crean automáticamente al inicializar la base de datos, y en un primer momento pidió que por defecto ya existieran algunos. Respuesta: `prisma/seed.ts` -- y de hecho ya creaba 8 activos de ejemplo (3 notebooks, 2 celulares, 3 monitores), además de 2 usuarios, 4 empleados y un catálogo de Kit de Bienvenida/EPP.

**Primer hallazgo: el seed nunca creaba ninguna `Sede`.** El usuario técnico de ejemplo, los 4 empleados y los 8 activos quedaban con `sedeId = null`. Con el aislamiento por sede obligatorio desde 2.8.2/2.9, eso significa que iniciar sesión con ese técnico en una base recién inicializada no mostraba ni un activo ni un empleado (`sedeWhere()` filtra por la sede propia, que nunca calza con `null`); solo el admin, con visibilidad total, veía algo. Como primer arreglo se agregaron dos sedes de ejemplo (Santiago, Rancagua) y se les asignó `sedeId` a todo lo demás.

**Javier reconsideró el enfoque completo poco después:** pidió redefinir el seed "como ha cambiado tanto la app", y al revisar qué necesitaba realmente quedar ahí, decidió sacar todo lo que ya se puede crear a mano desde la propia aplicación -- sedes y catálogo de Kit/EPP tienen pantalla en Configuración (`/configuracion/sedes`, `/configuracion/kit-epp`, con sus respectivos `POST /api/sedes` y `POST /api/kit-items`), y empleados/activos los va a cargar él mismo con datos reales. No tiene sentido que el sistema arranque con datos de mentira que hay que borrar antes de usarlo en serio.

**El seed quedó reducido a lo mínimo sin lo cual la aplicación no se puede operar desde la UI:**
1. El catálogo de categorías de activos (Notebook, Celular, Monitor, Impresora, Mouse, Teclado, Docking Station, Webcam, Audífonos). ~~La única pieza de este archivo que **no** tiene pantalla propia para crearla en Configuración (se verificó explícitamente: no existe ningún `POST` para `AssetCategory` fuera de este seed).~~ **Corrección (11-sep-2026, v1.17): esta afirmación es incorrecta.** Sí existe un CRUD completo en Configuración > Categorías (`GET/POST/PUT/DELETE /api/categorias`, con su propia pantalla en `configuracion/categorias`) -- no se verificó bien en su momento. Se mantiene igual como parte mínima del seed porque es un dato de arranque razonable, no porque sea la única forma de crearlas.
2. Un único usuario administrador (`admin@sclconsultores.com`, contraseña por defecto `admin123` -- el seed ahora imprime un recordatorio de cambiarla).

Ya no se crean aquí: sedes, catálogo de Kit/EPP, empleados ni activos de ejemplo. Los imports de Prisma que esos bloques necesitaban (`CategoriaKit`, `TipoContrato`, `EstadoActivo`, `CondicionActivo`) se quitaron del archivo junto con el código que los usaba.

### 2.11.2 `prisma/seed.ts`: se sacan "Impresora" y "Docking Station" del catálogo de categorías por defecto (11-sep-2026)

Pedido explícito de Javier, por voz: *"solamente quiero inicializar con el usuario administrador y con las categorías de los activos que están por defecto, pero quitando el que se llama... e impresora"* -- la transcripción no permitía identificar con certeza el nombre de la segunda categoría (no existe ninguna llamada "documentation" en el catálogo), así que se preguntó explícitamente antes de tocar el archivo. Javier confirmó: **Docking Station** e **Impresora**.

El catálogo que crea `prisma/seed.ts` (2.11.1) queda en 7 categorías: Notebook, Celular, Monitor, Mouse, Teclado, Webcam, Audífonos. El resto del seed (usuario admin) no cambia.

**Esto no elimina la categoría del sistema, solo del seed.** `AssetCategory` es una tabla, no un enum fijo. Si más adelante se necesita "Impresora" o "Docking Station", **se pueden recrear directamente desde Configuración > Categorías** (ver corrección en 2.11.1, punto 1) sin tocar este archivo ni la base de datos a mano; nacerían sin ninguna sección de especificaciones propia en el formulario de Activos, igual que hoy. Una base de datos que ya tenga activos con esas categorías (creados antes de este cambio, o por un seed anterior) no se ve afectada: el seed usa `upsert` y nunca borra categorías existentes.

## 2.12 Activos: se saca la reasignación directa y el panel de Acciones Rápidas (11-sep-2026)

Pedido explícito de Javier, revisando la pantalla de Activos: de las tres acciones por fila en el listado (`/activos`) -- Ver detalle, Editar, y Reasignar/Iniciar solicitud según el estado del equipo -- pidió sacar la de **reasignar**, porque *"la idea es hacerlo desde solicitudes"*. Ver detalle y Editar quedan igual.

**Se quitó el botón "Reasignar a otra persona"** (visible solo para activos en estado `asignado`) de la columna de acciones de `/activos`, junto con el modal que abría (`ReasignarActivoForm` dentro de un `Modal`) y el estado que lo controlaba (`reasignarModalAssetId`). El botón "Iniciar solicitud de entrega" (para `disponible`/`reutilizable`) no se tocó en este punto -- ver 2.12.1, donde se termina sacando también.

**Se quitó también el panel completo "Acciones Rápidas"** de `/activos/:id` (detalle del activo) -- un activo en estado `asignado` mostraba ahí cuatro botones (Registrar devolución, Reasignar equipo, Dar de baja, Enviar a mantención); Javier lo vio y pidió sacarlo, indicando que ya no es necesario. Antes de borrarlo se verificó que ninguna de esas acciones quedara inalcanzable: **Dar de baja**, **Registrar venta** y **Enviar a mantención** ya existían como acciones de fila en el listado `/activos` (modal o `router.push`, independientes de este panel), y **Registrar devolución** también (`router.push` a `/asignaciones/devolucion`). Solo **Reasignar equipo** perdía su único acceso -- que es exactamente el que se retiró a propósito en el punto anterior. **Asignar a empleado** enlazaba a `/solicitudes/nueva`, ya cubierto por "Iniciar solicitud de entrega" en el listado.

**Queda como código huérfano, sin decisión tomada todavía:** la página `/activos/:id/reasignar`, el componente `ReasignarActivoForm` y el endpoint `PUT /api/activos/:id/reasignar` -- ya no los enlaza ninguna pantalla, pero no se borraron (Javier no lo pidió). Si la reasignación directa queda completamente reemplazada por el flujo de Solicitudes, valdría la pena eliminarlos en un cambio aparte.

### 2.12.1 Aclaración: en el listado de Activos solo quedan dos acciones por fila (11-sep-2026)

Javier aclaró el mismo día que el cambio anterior se quedó corto: la idea no era sacar solo "Reasignar", sino dejar **únicamente dos** acciones por fila en `/activos` -- Ver detalle y Editar -- y sacar cualquier otra que aparezca o pueda aparecer, "tanto del código como de la parte visual".

Se quitó también el botón **"Iniciar solicitud de entrega"** (visible para `disponible`/`reutilizable`, enlazaba a `/solicitudes/nueva`) de la columna de acciones, junto con el ícono `UserPlus` (sin otro uso en el archivo, se sacó del import). La fila queda con exactamente dos acciones para cualquier estado del activo: Ver detalle y Editar.

**Se revisaron las otras dos vistas de la lista de Activos (tarjetas y kanban) y ninguna necesitó cambios:** la vista de tarjetas usa `AssetCard` en modo no compacto, que ya mostraba solo Ver y Editar (nunca tuvo una tercera acción). La vista kanban usa `AssetCard` en modo `compact`, que no muestra ninguna acción -- el cambio de estado ahí es por arrastrar la tarjeta a otra columna, no por botones.

## 2.13 Asignaciones pasa a ser una pestaña propia dentro de Activos, y se corrige su buscador (11-sep-2026)

Pedido explícito de Javier, viendo la segunda tabla al fondo de `/activos`: *"tenía pensado mejor sacarla de ahí y agregar otra sub pestaña, al igual que Personal y [Kit de Bienvenida/]EPP, etcétera. Sería mucho más ordenado."*

**`AsignacionesTable` se saca del fondo de `/activos` y pasa a vivir en `/activos/asignaciones`, como quinta pestaña de `ActivosTabs`** (Equipos, Asignaciones, Personal, Kit de Bienvenida, EPP). El componente en sí no cambió, solo dónde se renderiza -- la nueva página (`activos/asignaciones/page.tsx`) sigue el mismo patrón que `activos/empleados/page.tsx` y `activos/epp|kit-bienvenida/page.tsx`: `<ActivosTabs />` seguido del contenido. Sin header de página propio, porque `AsignacionesTable` ya trae su propio título "Asignaciones" como encabezado de tarjeta -- agregar otro arriba lo hubiera duplicado.

Esto es un vaivén respecto a una decisión anterior (documentada en el comentario de cabecera de `AsignacionesTable.tsx`): esa tabla había reemplazado a un módulo standalone "Asignaciones" en el Sidebar, sacado de la navegación por duplicar lo que ya vivía en Activos. La diferencia es que ahora **sigue siendo parte del módulo Activos** (una pestaña más, no un ítem de navegación aparte) -- no se reabre el módulo standalone, solo se le da su propio espacio dentro de Activos en vez de compartir página con Equipos.

### 2.13.1 El buscador de Asignaciones no encontraba por RUT

Javier reportó que el buscador de la tabla ("Buscar por RUT, nombre o equipo...") "parece que no busca por RUT de la persona". Causa: `GET /api/asignaciones` comparaba el término escrito **tal cual** contra `employee.rut` con un `contains` de Prisma -- pero `Employee.rut` se guarda siempre formateado ("12.345.678-9", ver `rutSchema`/`rutOptionalSchema` en `lib/validations/rut.ts`), y un usuario casi nunca escribe los puntos al buscar. `"123456789"` nunca es substring de `"12.345.678-9"`.

Este mismo problema ya se había resuelto para el buscador de Empleados (`GET /api/empleados`): trae los registros ya acotados por sede/filtros, y compara en memoria contra el RUT normalizado (`normalizeRut`, sin puntos ni guión) y el resto de los campos sin distinguir acentos. Las funciones locales que hacían esa segunda parte (`removeAccents`, `matchNoAccent`) vivían solo en `api/empleados/route.ts`; se extrajeron a `lib/utils/text.ts` para poder reutilizarlas, y `api/empleados/route.ts` ahora importa de ahí en vez de tener su propia copia.

`GET /api/asignaciones` se corrigió con el mismo patrón: cuando hay término de búsqueda, trae las asignaciones ya acotadas por sede y por los demás filtros (`activo`, `tipoMovimiento`, fechas, etc.) y filtra en memoria por RUT normalizado del empleado, nombre/apellido sin acentos, y N° de serie/marca/modelo del activo sin acentos. Sin término de búsqueda, sigue usando la consulta paginada de Prisma tal como antes. No se creó columna ni índice normalizado -- la cantidad de asignaciones de esta empresa es chica, igual que se justificó para Empleados.

**No se revisó si el mismo problema existe en otros buscadores del sistema** (Guías de Despacho, Solicitudes, el listado de Activos, etc.) -- quedó fuera de alcance de este cambio, que se limitó a lo que Javier reportó.

## 2.14 Buscadores de Asignaciones, Personal y Equipos: mismo comportamiento, con debounce (11-sep-2026)

Javier notó, comparando Asignaciones contra Personal y Equipos, que los tres buscadores se comportaban distinto: *"tengo que presionar enter para que se apliquen [los filtros]... en asignaciones es instantáneo"*. Investigando, los tres resultaron tener una regla distinta:

- **Asignaciones** buscaba en cada tecla, sin ningún freno: un `useEffect` con `search` (el estado que cambia en cada `onChange`) como dependencia. Se sentía instantáneo, pero significaba una petición completa al servidor por cada letra escrita.
- **Personal** y **Equipos** exigían enviar el formulario (Enter) para aplicar la búsqueda: el `useEffect` que dispara el fetch no incluía el estado del input entre sus dependencias, solo se ejecutaba desde el `onSubmit`.

Ninguna de las dos reglas es la ideal: una desperdicia peticiones, la otra obliga a un paso extra que el usuario no espera. Se preguntó a Javier cuál prefería y su respuesta fue **debounce en las tres** -- buscar automáticamente, pero recién ~350ms después de que el usuario deja de escribir, no en cada tecla.

**Se creó `useDebouncedValue` (`src/hooks/useDebouncedValue.ts`)**, un hook genérico (`useDebouncedValue<T>(value, delayMs = 350)`) que devuelve `value` retrasado ese tiempo, para no repetir el mismo `setTimeout`/`clearTimeout` tres veces. Se aplicó en:

- **`AsignacionesTable.tsx`**: el `useEffect` que pedía los datos pasa a depender de `debouncedSearch` en vez de `search` (que sigue actualizándose en cada tecla, para que el input no se sienta trabado).
- **`activos/empleados/page.tsx`** (Personal): mismo cambio -- el `useEffect` del fetch ahora incluye `debouncedSearch`. El formulario (`handleSearch`, Enter) se mantiene y sigue funcionando, pero ahora fuerza la búsqueda de inmediato con el valor actual del input (`fetchEmployees(search)`) en vez de depender del valor debounced, que podría estar desactualizado si el usuario presiona Enter antes de que venza la pausa.
- **`activos/page.tsx`** (Equipos): caso más particular porque la búsqueda se guarda en la URL (`?search=...`), no solo en estado local -- así el filtro sobrevive a recargar la página o compartir el link. Se agregó `debouncedSearchInput` (debounce de `searchInput`, lo que el usuario escribe) y un `useEffect` que empuja ese valor a la URL vía `updateUrlParams` cuando difiere de `searchQuery` (el valor ya confirmado en la URL). El formulario/Enter existente sigue funcionando igual, actualizando la URL al toque.

**No se tocó el buscador de ninguna otra pantalla** (Guías de Despacho, Solicitudes, Mantenciones, etc.) -- ninguno fue mencionado, y cada uno tendría que revisarse por separado para saber cuál de las dos reglas tenía.

### 2.14.1 El mismo debounce se extiende a Solicitudes, Guías de Despacho, Mantenciones y Compras (11-sep-2026)

Pedido explícito de Javier: aplicar el mismo debounce a esos cuatro módulos. Se revisó cada uno para ver cuál de las dos reglas tenía (igual que se hizo para Asignaciones/Personal/Equipos en 2.14):

- **Solicitudes, Mantenciones y Compras** buscaban en cada tecla sin ningún freno (una petición por letra) -- mismo caso que Asignaciones antes de 2.14. Se agregó `debouncedSearch` (`useDebouncedValue(search, 350)`) y se reemplazó `search` por `debouncedSearch` en la dependencia que dispara el fetch (el `useEffect` en Mantenciones/Compras, el `useCallback`+`useEffect` en Solicitudes) y en el parámetro que se manda a la API. Ninguno de los tres tenía un botón "buscar ahora" ni un flujo que necesitara bypasear el debounce, así que no se agregó parámetro de override.
- **Guías de Despacho** exigía Enter (`<form onSubmit={handleSearch}>`) -- mismo caso que Personal/Equipos antes de 2.14. Se agregó `debouncedSearchTerm` a la dependencia del fetch, y `fetchGuides` gana un parámetro opcional `searchOverride` para los dos casos que necesitan el valor exacto del input en el momento, sin esperar el debounce: el Enter explícito (`handleSearch`) y el botón "Limpiar filtros" (que antes llamaba `fetchGuides()` justo después de vaciar `searchTerm`, y sin el override habría buscado todavía con el término debounced anterior).

No se tocaron los filtros que no son de texto libre (estado, tipo, sede, fechas, `showVencidas`) en ninguno de los cuatro -- siguen aplicándose de inmediato al cambiar, como ya funcionaban.

## 2.15 Reportes pasa a ser una subpestaña del Dashboard (11-sep-2026)

Pedido explícito de Javier: *"la idea sería mover ese módulo de reportes a dashboard como subpestaña, y el botón de ver reporte que hay en el dashboard, quítalo"*. El módulo Reportes (`/reportes`, generación de Excel de inventario/stock/trazabilidad/empleados/RRHH/obsoletos) vivía como una sección aparte: entrada propia en el menú lateral y un botón "Ver Reportes" en el Dashboard que llevaba ahí.

- **Se creó `DashboardTabs` (`src/components/dashboard/DashboardTabs.tsx`)**, siguiendo el mismo patrón ya usado en Activos (`ActivosTabs`): una barra con dos pestañas, "Resumen" (`/`) y "Reportes" (`/reportes`). Se agregó a las dos páginas de nivel superior (`app/(dashboard)/page.tsx` y `app/(dashboard)/reportes/page.tsx`). Las páginas de detalle de cada reporte (`/reportes/inventario`, `/reportes/stock`, etc.) no la necesitan: ya tienen su propio link "Volver" hacia `/reportes`.
- **Se quitó el botón "Ver Reportes"** del header del Dashboard (junto con el ícono `FileText`, que quedaba sin otro uso en ese archivo) -- ya no es necesario, la navegación ahora es por la pestaña.
- **Se quitó la entrada "Reportes" del menú lateral** (`Sidebar.tsx`, junto con el ícono `BarChart3`): se preguntó explícitamente a Javier si debía sacarse o dejarse como acceso adicional, y confirmó sacarla -- mismo criterio que Personal/Kit de Bienvenida/EPP dentro de Activos, que tampoco tienen entrada propia en el menú. El recurso de permisos `reportes` no cambió (sigue controlando quién ve el Dashboard); solo cambió el punto de entrada en la UI. Se ajustó además el cálculo de "item activo" del menú: la entrada "Dashboard" (href `/`) ahora también queda resaltada estando en `/reportes`, por ser su subpestaña.
- **No se tocaron las rutas** (`/reportes` y sus sub-páginas siguen existiendo tal cual, incluida la exportación a Excel) ni el contenido de la página de Reportes -- el pedido era de organización/navegación, no de datos ni de URLs.

## 2.16 Resumen del Dashboard: se corrige el estado "vendido", se agrega su tarjeta y se optimizan las consultas (11-sep-2026)

Javier pidió un análisis de la pestaña Resumen buscando errores y bugs de código, y luego pidió aplicar todas las correcciones detectadas. El análisis encontró un bug de datos y varias ineficiencias de consultas; el pedido de aplicarlas vino con una aclaración sobre el bug: la lógica de que un activo **vendido** no sume en las tarjetas operativas ni en "Stock por Categoría" está bien tal como estaba -- *"al final hacer un activo vendido ya no debería aparecer más"* -- pero faltaba una tarjeta que mostrara cuántos equipos se han vendido, y el estado "vendido" no aparecía en ningún gráfico pese a que el propio `EstadosChart` ya tenía lista la etiqueta "Vendidos" sin usar.

**Bug de datos corregido (parcialmente, según lo pedido):**

- El pie chart "Distribución por Estado" no incluía "vendido" -- se agrega como sexto estado (`estadosData`), con color gris para diferenciarlo de los otros cinco.
- "Stock por Categoría" (barras apiladas) solo sumaba disponible/asignado/en_mantención/baja, dejando afuera **reutilizable** -- por eso su suma no calzaba con "Activos por Categoría" (que sí cuenta todos los estados). Se agrega "Reutilizable" a ese gráfico. "Vendido" queda deliberadamente **afuera** de "Stock por Categoría", igual que del desglose de tarjetas -- un equipo vendido no es stock, según lo confirmado con Javier.
- **Nueva tarjeta "Equipos Vendidos"**, reemplazando a "Empleados Activos" en la segunda fila de KPIs (enlaza a `/activos?estado=vendido`). Los conteos de empleados que esa tarjeta usaba (`totalEmployees`/`activeEmployees`) se eliminan por completo: ningún otro lugar del Resumen los necesitaba.

**Optimizaciones de consultas** (`getStats()` + `getAlertas()` se fusionan en una única `getDashboardData()`):

- Antes eran dos funciones independientes llamadas en secuencia (`await getStats(); await getAlertas();`) sin necesidad -- ninguna depende de la otra. Al fusionarlas en un solo `Promise.all`, además se eliminan consultas duplicadas que existían *entre* ambas: el `OR` de Termination "pendiente" se pedía dos veces (un `count()` en `getStats` y un `findMany(take:5)` en `getAlertas`), y "Mantenciones pendientes" se pedía como `count()` más dos `findMany(take:5)` adicionales para vencidas/próximas -- las tres con el mismo `estado: "pendiente"`.
- El desglose de activos por estado (6 `count()` sueltos: total, disponible, asignado, en_mantención, baja, reutilizable) y el de "Stock por Categoría" (un N+1: hasta 4 `count()` más *por cada categoría*, es decir 4×N consultas) se reemplazan por un único `prisma.asset.groupBy(["categoriaId", "estado"])`, agregado en memoria -- mismo patrón que ya usa `reportes/page.tsx` con un solo campo de agrupación. "Activos por Categoría" (el total por categoría, todos los estados) también sale de este mismo groupBy en vez de un `_count` de Prisma aparte.
- Mantenciones y devoluciones pendientes se piden una sola vez cada una (sin el límite de 5 en la consulta); el conteo total y los primeros 5 de cada alerta se derivan en memoria -- mismo patrón de "traer y filtrar en JS" ya usado en `/api/empleados` y `/api/asignaciones`.
- "Asig. Últimos 30 días" deja de ser una consulta aparte: se deriva filtrando en memoria el resultado de "Asignaciones últimos 6 meses" (los 30 días son un subconjunto).
- Resultado: de hasta ~46 consultas por carga del Resumen (con 7 categorías) a **8 consultas fijas**, sin importar cuántas categorías o activos existan.
- Corrección menor de consistencia: las consultas de Mantenciones y Asignaciones no excluían activos con `deletedAt` (duplicados descartados de una importación, SPEC 2.7.7) como sí lo hacen todas las consultas de Asset -- se agrega `ACTIVOS_VIGENTES` también ahí.

No se tocó nada fuera de la pestaña Resumen (Reportes, Activos, etc. quedan igual).

## 2.17 El bug de búsqueda por RUT se extiende a Solicitudes y Guías de Despacho (14-sep-2026)

Pedido explícito de Javier, retomando un pendiente que había quedado fuera de alcance en la sección 2.13.1: revisar si el mismo bug de búsqueda por RUT (comparar el texto escrito tal cual contra un RUT guardado formateado, con un `contains` simple) existía en otros buscadores del sistema.

**Se revisaron los cuatro módulos pendientes:**

- **Solicitudes** (`/api/solicitudes`) -- **tenía el mismo bug.** Buscaba con `{ employee: { rut: { contains: filters.search, mode: 'insensitive' } } }` contra `employee.rut`, que se guarda formateado ("12.345.678-9"). Corregido con el mismo patrón ya usado en Empleados/Asignaciones: cuando hay término de búsqueda, se trae todo lo demás ya acotado por los filtros no-textuales (sede, tipo, estado, fechas) sin paginar, y se filtra en memoria comparando `normalizeRut` para el RUT y `matchNoAccent` para número de ticket/nombre/apellido/observaciones; sin término de búsqueda, sigue el camino paginado original de Prisma.
- **Guías de Despacho** (`/api/guias-despacho`) -- **también tenía el bug**, sobre `receptorRut` (formateado al crear la guía con `formatearRut`). Misma corrección: en memoria con `normalizeRut` para el RUT y `matchNoAccent` para número de guía/OT Chilexpress/nombre del receptor.
- **Activos** (`/api/activos`) -- **no tenía el bug, porque no aplica**: su buscador filtra por `numeroSerie`/`marca`/`modelo`/`numeroActivoInterno`, campos propios del activo; no busca por RUT de ningún empleado.
- **Mantenciones** -- mismo caso que Activos: su buscador no incluye ningún campo de RUT.

**Resultado:** el bug quedaba en 2 de 4 módulos revisados; ambos corregidos con el mismo patrón ya establecido (no se inventó una solución nueva). Empleados y Asignaciones ya estaban corregidos desde antes (2.13.1); con esto, todos los buscadores del sistema que comparan contra un RUT usan la misma lógica.

## 2.18 Código huérfano de la reasignación directa: confirmado y desconectado, pendiente de borrar (14-sep-2026)

Pedido explícito de Javier: resolver el pendiente de la sección 2.12 sobre la página `/activos/:id/reasignar`, el componente `ReasignarActivoForm` y el endpoint `PUT /api/activos/:id/reasignar`.

**Se confirmó de nuevo que están completamente huérfanos.** Se revisó el listado de Activos y su vista de detalle (los dos lugares que antes enlazaban a esto) y ningún otro archivo del proyecto los menciona, aparte del export en el índice de componentes.

**Se quitó el export de `ReasignarActivoForm`** de `src/components/activos/index.ts` -- ya nada fuera de su propio archivo puede importarlo, aunque el archivo en sí sigue existiendo.

**No se pudieron borrar los 3 archivos/carpetas en el momento.** El workspace del dispositivo de Javier seguía sin poder abrirse (mismo problema de la actualización de Windows del 8-sep, ver regla operativa #1 de esta sesión) y el flujo de respaldo (`device_stage_files` → editar la copia → `device_commit_files`) solo permitía leer y **escribir** archivos, no borrarlos. En ese momento quedaron pendientes de eliminar a mano:

- `app/src/app/(dashboard)/activos/[id]/reasignar/` (carpeta completa)
- `app/src/app/api/activos/[id]/reasignar/` (carpeta completa)
- `app/src/components/activos/ReasignarActivoForm.tsx`

**Corrección (14-sep-2026, auditoría de la sección 2.24):** al revisar el módulo Asignaciones se confirmó que los 3 ya no existen en el disco de Javier -- se borraron en algún momento entre esta sección y la auditoría (probablemente a mano), pero esta nota nunca se actualizó para reflejarlo. Se deja esta corrección en vez de reescribir el texto original, para no perder el rastro de qué pasó.

## 2.19 Se extienden las specs por categoría a Excel y a los selectores de Guías/Solicitudes (14-sep-2026)

Javier retomó el pendiente que había quedado "fuera de alcance" en la sección 2.11: *"ahora el tema de extender las especificaciones"*. Antes de tocar nada se le preguntó qué quería decir exactamente con eso, porque la frase con la que lo planteó ("definir qué activos estarán por defecto al iniciar el sistema") sonaba a reabrir 2.11.1 (el seed ya no crea activos de ejemplo, a propósito). Confirmó que no era eso: era decidir qué categorías/specs se extienden a los tres lugares que 2.11 había dejado afuera, y pidió una recomendación de qué specs agregar y por qué.

**Se revisaron los 5 archivos involucrados antes de recomendar nada:**

- `GET /api/reportes/inventario/excel` -- ya tenía IMEI y N° Teléfono (Celular), pero le faltaban Pulgadas (Monitor), Plan/Operador (Celular) y Conectividad (Mouse/Teclado/Webcam/Audífonos).
- `SelectorActivos.tsx` (equipos en Nueva Guía de Despacho) -- su columna "Info" solo cubría Notebook (RAM+Disco) y Celular (teléfono); Monitor y periféricos no mostraban nada, y el tipo `Asset` del componente ni siquiera tenía los campos `pulgadas`/`operador`/`conectividad`.
- `SeleccionarCambioEquipo.tsx` y `SeleccionarEquiposOnboarding.tsx` (selectores de Solicitudes) -- resultaron ser los más completos: ya mostraban Procesador/RAM/Disco/SO/IMEI/Teléfono/Plan/Operador/Pulgadas. Les faltaba solo Conectividad, y estaban inconsistentes entre sí (Onboarding con etiquetas tipo "RAM: 8GB", Cambio de Equipo con los valores pegados sin etiqueta), pese a compartir casi el mismo código.
- **`AnexoEntregaTemplate.tsx` -- hallazgo no pedido: es código huérfano, nunca conectado a ningún endpoint.** Se buscó en todo el proyecto quién lo importa y no hay ningún resultado fuera de su propio archivo -- ninguna ruta de API genera este PDF con `renderToBuffer`/`renderToStream` ni lo sirve de ninguna forma. Extenderle las specs habría sido trabajo sobre código que nadie ejecuta. **No se tocó.** De paso se encontró que los otros tres templates de `lib/templates/` (`ComprobanteEntregaTemplate.tsx`, `ComprobanteCambioTemplate.tsx`, `ActaDevolucionTemplate.tsx`) están en la misma situación -- ninguno tiene un caller. Esto queda como pendiente sin decisión (ver Changelog): no se sabe si estos cuatro archivos son trabajo a medio conectar o quedaron obsoletos tras el rediseño de Guías de Despacho de la v1.5 (2.9.5 documenta explícitamente que ese módulo se quedó "sin documento PDF").

**Se creó `lib/utils/assetSpecs.ts`** como fuente única de "qué specs le corresponden a un activo según su categoría" (`especificacionesActivo`, con etiqueta; `especificacionesActivoTexto`, en texto plano unido con " · "; `etiquetaConectividad`, para el valor legible de `usb`/`bluetooth`/`cable`) -- mismo criterio que ya se usó para `normalizeRut`/`matchNoAccent` en 2.13.1: una sola función que las pantallas consumen, en vez de que cada una mantenga su propia lista a medio completar.

**Cambios aplicados, todos usando ese helper (salvo Excel, ver nota):**

- `GET /api/reportes/inventario/excel`: se agregan columnas Pulgadas, Plan, Operador y Conectividad. Se mantienen como columnas separadas (no como un solo texto unido) porque en Excel eso es lo que permite filtrar/ordenar por cada dato -- a diferencia de las otras cuatro pantallas, aquí no se usa `especificacionesActivoTexto` completo, solo `etiquetaConectividad` para el valor de Conectividad.
- `SelectorActivos.tsx`: se agregan `pulgadas`/`operador`/`conectividad` al tipo `Asset`, y la columna "Info" ahora también muestra pulgadas para Monitor y la conectividad para cualquier periférico que la tenga.
- `SeleccionarCambioEquipo.tsx` y `SeleccionarEquiposOnboarding.tsx`: sus funciones locales de especificaciones se reemplazan por el helper compartido -- ambos quedan con Conectividad incluida y con el mismo formato etiquetado (se unifica hacia el de Onboarding, que era el más claro).
- `/activos/:id` (vista de detalle): de paso se notó que el bloque "Especificaciones Técnicas" (ampliado en 2.11) no incluía `tipoPlan` pese a mostrar el resto de los campos de Celular -- se agrega.

**Fuera de alcance de este cambio:** no se decidió nada sobre los 4 templates PDF huérfanos (Anexo de Entrega, Comprobante de Entrega, Comprobante de Cambio, Acta de Devolución) -- ni conectarlos, ni borrarlos, ni extenderles las specs. Queda pendiente de que Javier decida qué hacer con ellos.

## 2.20 Se elimina el campo Operador de Celular (14-sep-2026)

Pedido explícito de Javier, planteado por voz mientras se revisaba el tema de Proveedores en Compras (sección aparte, ver nota al final): *"y si mejor le quitamos el proveedor al teléfono?"*. Se le preguntó explícitamente para confirmar, porque "proveedor" podía referirse al catálogo `Supplier` que se estaba discutiendo justo antes -- confirmó que se refería al campo **Operador** de la categoría Celular (Entel/Movistar/WOM/Claro), no al proveedor de Compras.

**Se optó por el borrado completo** (columna en `Asset` + formularios + migración), no solo ocultarlo de las pantallas, porque Javier confirmó de memoria que ningún Celular existente tiene el dato cargado. Esto no se pudo verificar directamente contra la base de datos -- el workspace del dispositivo seguía sin poder abrirse (mismo problema de Windows del 8-sep, ver regla operativa #1 de esta sesión) -- así que la confirmación quedó en la palabra de Javier, no en una consulta.

**Se quitó `operador` de:**
- `Asset` en `schema.prisma` (migración `20260914000000_activos_quitar_operador_celular`, `ALTER TABLE assets DROP COLUMN operador`).
- `lib/validations/asset.ts` (ya no se valida).
- Formularios `/activos/nuevo` y `/activos/:id/editar` -- se quita el campo entero (label + `<select>` con las opciones Entel/Movistar/WOM/Claro/Otro) de la sección de specs de Celular, y su entrada en el estado del formulario.
- `POST /api/activos` y `PUT /api/activos/:id` -- ya no lo escriben.
- Vista de detalle `/activos/:id` -- ya no aparece en "Especificaciones Técnicas".
- Los 4 lugares tocados el mismo día en la sección 2.19 (`lib/utils/assetSpecs.ts`, el Excel de inventario, y los tipos de `SelectorActivos.tsx`/`SeleccionarCambioEquipo.tsx`/`SeleccionarEquiposOnboarding.tsx`) -- alcanzaron a tener este campo unas horas antes de que se pidiera sacarlo.

**El resto de las specs de Celular no se tocó**: IMEI, N° Teléfono, N° Activación, Tipo de Plan y Tiene Cargador siguen igual.

**Nota sobre Proveedores en Compras:** la conversación había empezado revisando si convenía agregar un selector de Proveedor (catálogo `Supplier`) a Nueva Compra, con una subpestaña dentro de Compras como la de Kit/EPP en Activos. Javier decidió dejarlo así por ahora -- **no se implementó nada de eso**, `Supplier`/`/api/proveedores`/`/configuracion/proveedores` siguen exactamente como estaban (catálogo independiente, desvinculado de Compras desde la v1.9).

## 2.21 El alta rápida de equipo en Nueva Compra gana las specs por categoría (14-sep-2026)

Javier preguntó, revisando el módulo de Compras: *"en el módulo de las compras no implementaste los formularios personalizados para agregar nuevos equipos en caso de comprar y para qué equipos hay formularios?"*. Se confirmó el gap: el "Crear Equipo Nuevo" embebido en `/compras/nueva` (agregado en la v1.11, sección 2.10.1) solo pedía **Categoría, Marca, Modelo y N° de Serie** -- los mismos 4 campos sin importar la categoría elegida, a diferencia de `/activos/nuevo` y `/activos/:id/editar`, que sí tienen secciones propias por categoría desde la sección 2.11.

**Se respondió primero qué categorías tienen formulario propio (sin tocar nada):** Notebook (procesador, RAM, disco, sistema operativo, antivirus, nombre de equipo), Celular (IMEI, teléfono, almacenamiento -- ver nota abajo), Monitor (pulgadas), y Mouse/Teclado/Webcam/Audífonos comparten un solo campo (Conectividad); Impresora y Docking Station no tienen specs propias. Javier confirmó que quería exactamente eso replicado en Compras.

**Se extendió el alta rápida de `/compras/nueva`** para mostrar las mismas secciones condicionales por categoría que `/activos/nuevo`, con el mismo criterio de detección (nombre de categoría en minúscula) y los mismos campos -- reutilizando `POST /api/activos`, que ya aceptaba estos campos desde siempre (el formulario simplemente no los estaba mandando). No se agregaron `numeroActivacion` ni `tipoPlan` de Celular porque **tampoco existen en el formulario de origen** (`/activos/nuevo`/editar) -- ese es un gap previo, no introducido por este cambio, y queda fuera de alcance a menos que Javier lo pida.

**No se tocó nada del resto de Compras:** los campos generales de la factura (N° factura, fecha, RUT proveedor, orden de compra), la búsqueda de activos existentes, ni el flujo de guardado de la compra.

## 2.22 El importador de Excel de Activos ahora respeta la Sede (14-sep-2026)

Javier subió dos Excel para evaluar si podían importarse (*"estos son los excels que debere importar para el sistema, dime como voy y si esposible realizar la importacion de alguno"*) y, antes de intentar una importación real, se revisó `/api/activos/importar` (y su ruta hermana de reintento, `/api/activos/importar/batch`) contra el aislamiento por Sede (2.8/2.9): **ninguna de las dos asignaba `sedeId`** a los activos ni a los empleados que crea -- exactamente el mismo bug que 2.11.1 encontró en `seed.ts`. Un activo o empleado con `sedeId = null` es invisible para cualquier técnico (solo admin, con visibilidad total, lo ve): una importación de 239 notebooks habría quedado así, sin que nadie lo notara hasta buscarlos y no encontrarlos. Javier confirmó arreglar esto antes de importar (*"Sí, arréglalo primero"*).

**Cambios:**
- `/activos/importar` (pantalla): gana un selector de "Sede" -- visible y obligatorio solo para admin (un técnico hereda la suya, igual que en Nuevo Activo/Nueva Compra/Nuevo Empleado); bloquea "Vista previa" e "Importar" hasta elegirla.
- `POST /api/activos/importar`: resuelve la sede con `sedeIdParaCrear(session, sedeId, { requerido: true })` y la asigna tanto al `Employee` que crea (si el Excel trae un empleado nuevo) como al `Asset`.
- `POST /api/activos/importar/batch` (reintento de filas corregidas desde el panel de errores): mismo fix -- recibe `sedeId` en el body y lo aplica igual, para que una fila reimportada no quede en una sede distinta (o sin sede) respecto del resto del lote.
- `GET /api/activos/importar/preview` no se tocó: solo lee y previsualiza el Excel, no escribe nada en la base.

**Sobre los dos Excel evaluados** (sin importar nada todavía):
- `Consolidado inventario Notebook 2026.xlsx` (239 notebooks): compatible con el importador actual, con tres salvedades detectadas al inspeccionar los datos reales: (1) la columna "ID-Interno" es la que en realidad trae el Estado (Activo/Baja/Disponible/Mantención/etc.) pese a su nombre, y la columna literal "Estado" trae la Condición (Usado/Nuevo/Seminuevo) -- hay que mapearlas manualmente al revés de lo que el auto-mapeo sugeriría; (2) unas 4 filas traen un estado no reconocido por el vocabulario actual y quedarán para corrección manual vía el panel de errores; (3) 1 fila sin Marca será rechazada. Pendiente de que Javier ejecute la importación real con estos mapeos.
- `Conciliacion_lineas_celulares Final 2.xlsx`: **no se puede importar como Activos** -- es conciliación de líneas telefónicas/facturación (número de línea, plan, tráfico de datos/voz/SMS, estado de la línea), sin ninguna columna de Marca/Modelo/N° de Serie/IMEI, que el importador exige siempre. Javier confirmó que no tiene, por ahora, otro archivo con los datos físicos de los celulares -- queda pendiente de que aparezca ese archivo.

**Fuera de alcance:** no se tocó la lógica de interpretación de Estado/Condición/RUT/Microsoft 365 (`lib/importacion/activos.ts`), ni la búsqueda de empleados existentes por RUT (que no se acota por sede -- un empleado ya cargado en otra sede se sigue encontrando y reutilizando tal cual estaba antes de este cambio).

## 2.23 Se agrega el tipo de licencia de Microsoft 365 (14-sep-2026)

Al revisar el Excel de Notebooks para la importación (2.22), Javier notó que la columna "Microsoft 365 Empresa" trae el nombre del plan (*"Premium"* en 179 filas) y pidió explícitamente: *"recuerda considerar los datos como decir el tipo de licencia microsoft 365 empresa"*. Hasta ahora el sistema solo guardaba un booleano Sí/No (`microsoft365`) -- tanto en la base como en los tres lugares que ya leían esa columna (`lib/importacion/activos.ts` vía `tieneMicrosoft365`, usado por ambas rutas de importación), así que el nombre del plan se perdía siempre, no solo al importar. Se le preguntó a Javier qué hacer y confirmó agregar un campo nuevo.

**Se agrega `tipoLicenciaMicrosoft365`** (texto libre, opcional) al modelo `Asset` (migración `20260914010000_activos_agregar_tipo_licencia_microsoft365`), junto al `microsoft365` booleano existente -- no lo reemplaza, porque ese booleano ya se usa en el listado de Activos y en los reportes/exportaciones para filtrar.

**Cambios:**
- `lib/validations/asset.ts`, `POST /api/activos`, `PUT /api/activos/:id`: aceptan y persisten el campo nuevo, igual que el resto de las specs de Notebook.
- `/activos/nuevo`, `/activos/:id/editar` y el alta rápida de `/compras/nueva` (sección de Notebook): ganan el campo "Licencia Microsoft 365". **Hallazgo no pedido:** ninguno de estos tres formularios tenía forma de setear el booleano `microsoft365` -- solo se podía cargar por importación o directo por API. En vez de agregar un checkbox aparte, se decidió derivar `microsoft365` de si este campo viene con texto (`Boolean(tipoLicenciaMicrosoft365)`): más simple para quien carga el dato, un solo campo en vez de dos. **Advertencia:** un activo que ya tuviera `microsoft365 = true` sin este campo cargado (por ejemplo, seteado directo por API antes de este cambio) se vería con el toggle en "No" la próxima vez que se edite desde estas pantallas hasta que se le cargue el plan -- no se conocen casos así hoy (el sistema recién se está poblando), pero queda documentado por si aparece.
- `POST /api/activos/importar` y `POST /api/activos/importar/batch`: guardan el valor tal cual venía en la columna mapeada a "Microsoft 365" del Excel, además de seguir derivando el booleano con `tieneMicrosoft365` como ya hacían.
- `lib/utils/assetSpecs.ts`: se agrega a la lista de specs de Notebook (etiqueta "Microsoft 365") -- lo heredan automáticamente `/activos/:id`, `SeleccionarCambioEquipo.tsx` y `SeleccionarEquiposOnboarding.tsx` (ver SPEC 2.19).
- `GET /api/reportes/inventario/excel` y `GET /api/activos/exportar`: se agrega la columna "Licencia Microsoft 365" junto a la columna booleana existente.

**Fuera de alcance:** el badge "M365" del listado de Activos (`/activos`) no se tocó -- sigue mostrando solo Sí/No, no el nombre del plan. `SelectorActivos.tsx` (selector de equipos de Guías de Despacho) tampoco -- no usa el helper de `assetSpecs.ts`, tiene su propia lógica de "Info" enfocada en pulgadas/conectividad.

## 2.24 Auditoría de los 9 módulos y corrección de 5 fugas de aislamiento por sede (14-sep-2026)

Javier preguntó *"de momento que hemos corregido? ... están todos los módulos listos?"* y, al aclarársele que las correcciones del día habían sido puntuales (no una auditoría completa), pidió expresamente esa auditoría: *"empieza por todos"*.

**Se revisaron los 9 módulos del sistema** (Activos, Empleados, Asignaciones, Solicitudes, Guías de Despacho, Compras, Mantenciones, Dashboard/Reportes, Configuración) contra 6 dimensiones fijas: CRUD completo vs. lo documentado, aislamiento por sede, validaciones/manejo de errores, código huérfano, consistencia entre pantallas, y transacciones/historial. Metodología: lectura de código (no pruebas funcionales en navegador -- el workspace del dispositivo seguía sin poder abrirse, mismo problema del 8-sep).

**Se confirmó que Configuración > Usuarios ya existe** (contrario a la suposición inicial de Javier de que "falta la parte de configuración"): CRUD completo en `/configuracion/usuarios` y `/api/usuarios`, con sede obligatoria para cualquier rol no-admin.

**Se encontraron 5 fugas críticas de aislamiento por sede** -- rutas que nunca aplicaban `sedeWhere`/`assertSedeAccess`, así que un técnico podía ver, exportar o accionar sobre datos de otras sedes. Javier confirmó corregirlas de inmediato (*"si, aplica los filtros necesarios"*):

- `GET /api/activos/exportar`: el Excel de exportación de Activos no filtraba por sede. Se agrega `sedeWhere(session)` al `where`.
- `GET /api/empleados/buscar`: la búsqueda de empleado por RUT no filtraba por sede -- un técnico podía consultar la ficha completa (con todos sus equipos) de un empleado de cualquier sede. Se agrega `assertSedeAccess(session, employee.sedeId, ...)` tras encontrarlo.
- `GET /api/reportes/inventario/excel`, `GET /api/reportes/rrhh/excel`, `GET /api/reportes/trazabilidad`: ninguno de los tres reportes filtraba por sede, pese a que `tecnico` tiene permiso de lectura sobre `reportes` -- la más seria de las cinco, porque es una descarga completa de la empresa. Se agrega `sedeWhere(session)` al Excel de inventario; `{ employee: sedeWhere(session) }` al de RRHH (`Termination` no tiene `sedeId` propio, se filtra vía su relación a `Employee`, mismo criterio que Asignaciones/Mantenciones/Dashboard); y un `AND` con `sedeWhere(session)` a la búsqueda de trazabilidad.
- `POST /api/activos/[id]/baja` y `POST /api/activos/[id]/venta`: ninguna de las dos validaba sede antes de ejecutar la acción -- un técnico que conociera o adivinara el id de un activo de otra sede podía darlo de baja o venderlo igual. Se agrega `assertSedeAccess(session, asset.sedeId, ...)` en ambas, justo después de cargar el activo.
- `GET /api/solicitudes/stats`: las 4 consultas de estadísticas (por tipo, por estado, total, abiertas) no filtraban por sede, a diferencia del listado normal de Solicitudes que sí lo hacía. Se agrega `sedeWhere(session)` a las 4.

**Hallazgos adicionales de la auditoría, NO corregidos todavía (fuera de alcance de este pedido puntual, quedan para que Javier priorice):**

- **Venta de activos:** el formulario pide moneda, fecha de venta y documento, pero `assetHistoryService.registrarVenta` los descarta -- nunca se persisten, y la fecha de venta guardada siempre es la de hoy, no la ingresada.
- **Mantenciones:** marcar un resultado como "no reparable" o "pendiente de repuestos" no dispara las transiciones que documenta 2.7.5 (`baja` en el primer caso, quedar abierta en el segundo) -- siempre cierra a "completada".
- **Solicitudes:** `POST /api/solicitudes/[id]/transicion` (que muta el estado del ticket) usa el permiso `'read'` en vez de `'write'`, inconsistente con el resto de rutas de escritura del módulo. Además, `POST /api/solicitudes/[id]/kit-epp` no verifica que el ticket no esté ya cerrado antes de entregar (el `PATCH` de "no aplica" sí lo hace).
- **Empleados:** ninguna acción (crear, editar, reasignar de sede, dar de baja) deja registro en un historial/auditoría, a diferencia de Activos.
- **Compras:** vincular un activo ya existente a una compra no deja registro en `AssetHistory` (solo lo hace la creación de un activo nuevo).
- Hallazgos menores (documentados por los agentes de auditoría, sin acción): política de contraseña más débil al editar un usuario que al crearlo; la vista de detalle de una Guía de Despacho no muestra specs de Monitor/periféricos aunque el selector de activos sí las tiene; un endpoint duplicado sin uso en Guías (`/api/guias-despacho/numero`); botones de Editar/Borrar visibles para técnico en Categorías/Proveedores/Sedes aunque el servidor los bloquea igual (403 al hacer clic); y la sección 2.18 de este mismo documento quedó desactualizada -- los 3 archivos que decía "pendientes de borrar" ya no existen en el disco.

**Fuera de alcance:** no se tocó nada del modelo de Compras (su regla de sede es intencionalmente distinta al resto, ver 2.10) ni de Mantenciones/Dashboard más allá de lo ya confirmado sólido en la auditoría.

## 2.25 Se corrigen 4 de los hallazgos "medios" de la auditoría 2.24 (14-sep-2026)

Javier revisó la lista de hallazgos medios de la sección 2.24 y dio instrucciones puntuales para cada uno: *"al vender un activo no es necesario documento, solo basta con poner la fecha en la que fue vendido, deberia dar de baja lo del mantenimiento en caso a ver un boton que diga no reparable y lo de debaja, en solicitudes entonces cambialo a write para que sea mejor, empleado no es necesario historial, el activo si, lo del kit no te entendi"*.

**Venta de activos:** se saca por completo el campo "Documento de venta" (URL) del formulario y del schema (`assetVentaSchema`) -- Javier confirmó que no hace falta. Se agrega la columna `fecha_venta` a `Asset` (migración `20260914020000_activos_agregar_fecha_venta`): antes no existía ningún lugar donde guardar esa fecha, y `assetHistoryService.registrarVenta` siempre grababa `new Date()` (la fecha de hoy) en el historial, ignorando la fecha que la persona ingresaba en el formulario. Ahora se persiste la fecha real, tanto en la columna del activo como en el historial (junto con la moneda, que tampoco se guardaba antes).

**Mantenciones -- "No reparable" ahora da de baja el equipo:** se agrega un selector de resultado (Reparado / Faltan repuestos / No reparable) al formulario de "Completar Mantención", reemplazando la lógica anterior que SIEMPRE devolvía el activo a disponible/asignado/reutilizable sin importar lo que dijera el texto libre de "Resultado" -- si alguien escribía "no reparable" a mano, el equipo igual quedaba operativo. Se agregan las columnas `resultado_tipo` y `motivo_baja` a `Maintenance` (migración `20260914030000_mantenciones_resultado_estructurado`). Al completar con "No reparable" (motivo obligatorio), el activo pasa a `baja` en la misma transacción -- se reutiliza `validateTransition('en_mantencion', 'baja', ...)`, que ya existía en `assetStateMachine.ts` con este caso exacto documentado ("Mantención: no reparable") pero nunca había sido invocado desde esta ruta. Con "Faltan repuestos", el activo se queda en `en_mantencion` (no vuelve a servicio) en vez de disponible/asignado/reutilizable. Se elimina `maintenanceCloseSchema` de `assetTransition.ts`, que planteaba la misma idea pero nunca estuvo conectado a la ruta real (código huérfano) -- `completeMaintenanceSchema` en `maintenance.ts` reutiliza directamente el enum `resultadoMantencionEnum`.

**Solicitudes -- permiso de transición:** `POST /api/solicitudes/[id]/transicion` pasa de `requirePermission('solicitudes', 'read')` a `'write'`, consistente con el resto de rutas de escritura del módulo (cancelar, kit-epp, etc.).

**Empleados:** Javier confirmó que no hace falta historial ahí -- se deja como está, sin cambios.

**Compras -- historial al vincular un activo existente:** antes solo quedaba registro en `AssetHistory` cuando un activo se creaba desde el alta rápida de Nueva Compra; vincular uno ya existente (`POST /api/compras/[id]/activos`) no dejaba ningún rastro. Se agrega el valor `compra` a `TipoEvento` (migración `20260914040000_asset_history_agregar_evento_compra`) y un nuevo método `assetHistoryService.registrarVinculacionCompra`, invocado por cada activo vinculado dentro de la misma transacción.

**Sin resolver, pendiente de que Javier lo explique de nuevo:** el hallazgo de Kit/EPP (`POST /api/solicitudes/[id]/kit-epp` no verifica que el ticket no esté ya cerrado antes de entregar, a diferencia del `PATCH` de "no aplica" que sí lo hace) -- Javier indicó que no entendió la explicación original, así que no se tocó nada todavía.

**Corrección (14-sep-2026, mismo día):** al revisar el código para implementar este último punto, se confirmó que **la validación ya existía** en `kit-epp/route.ts` líneas 45-47, igual que en el `PATCH`. El hallazgo original de la auditoría 2.24 era incorrecto -- no había ningún bug ahí. No se hizo ningún cambio.

## 2.26 Se corrigen los 5 hallazgos "menores" de la auditoría 2.24 (14-sep-2026)

Javier pidió explícitamente bloquear el acceso al módulo de administración para técnico (*"el modulo de administracion no puede ser accedido por ningun tecnico hay que bloquear esa vista como un guard, los botones se dejan pero no deberia pasar nadie a esa vista solo admin"*), hacer más informativa la vista de detalle de Guías de Despacho, y resolver el resto de los hallazgos menores "usando tu criterio pensando en soluciones escalables y eficientes".

**Guard de Configuración -- ya existía, otro hallazgo de la auditoría 2.24 que era incorrecto.** Al revisar `app/src/app/(dashboard)/configuracion/layout.tsx` para implementar el guard pedido, se confirmó que ya existe: un chequeo del lado del servidor (`can(session.user.role, "configuracion", "read")`) que redirige a `/` a cualquier usuario que no sea admin, aplicado a TODO el árbol de Configuración (sedes, categorías, proveedores, usuarios, kit-epp, parámetros, microsoft-sync, mantenimiento de datos) desde un único layout -- exactamente la solución "escalable" que se hubiera propuesto. El Sidebar tampoco muestra el link a técnico. El hallazgo de la auditoría 2.24 (que un técnico podía *abrir* estas pantallas) era incorrecto -- la auditoría solo miró cada `page.tsx` por separado y no vio que el layout padre ya bloqueaba el acceso antes de que cualquier página se renderizara. No se hizo ningún cambio de código para esto -- ya estaba resuelto.

**Guías de Despacho -- vista de detalle ahora muestra las specs completas.** La tabla de equipos de una guía armaba las "Especificaciones" a mano, con una rama para Notebook y otra para Celular únicamente -- un Monitor o un periférico mostraban "-" aunque la API ya traía sus datos (pulgadas, conectividad). Se reemplaza esa lógica por `especificacionesActivoTexto()`, el mismo helper compartido que ya usan el detalle de Activos y el selector de equipos de esta misma pantalla (`assetSpecs.ts`, SPEC 2.19) -- una sola fuente de verdad en vez de una tercera copia de la lista de campos. Se completa también el tipo `DispatchGuideAsset` (`types/guia-despacho.ts`), al que le faltaban `pulgadas`, `conectividad` y `tipoLicenciaMicrosoft365` -- la API ya los devolvía, solo el tipo de TypeScript no los declaraba.

**Contraseña de usuario -- misma regla al crear y al editar.** Antes crear un usuario exigía 12+ caracteres con mayúscula/minúscula/número/símbolo, pero editar uno solo exigía 6 caracteres sin ninguna otra regla -- se podía debilitar la contraseña de un usuario al editarlo. Se extrae la regla a una función compartida (`lib/validations/password.ts`, `validarPasswordFuerte`) y ambas rutas (`POST` y `PUT /api/usuarios`) la reutilizan, para que no puedan volver a desincronizarse.

**Endpoint duplicado en Guías -- unificado en vez de borrado.** `GET /api/guias-despacho/numero` tenía la misma lógica de generar el próximo número de guía que ya vivía, duplicada, dentro de `POST /api/guias-despacho` -- sin ningún caller real. Como no se puede borrar archivos por el flujo de respaldo actual (ver regla operativa #1), se optó por la solución más útil: extraer la lógica a `lib/services/guiaDespachoService.ts` (`generarNumeroGuia`) y hacer que **ambas** rutas la llamen -- el endpoint deja de estar duplicado y de paso queda disponible por si una futura pantalla necesita previsualizar el número antes de crear la guía.

**Corrección de la nota desactualizada (sección 2.18):** se agregó una nota confirmando que los 3 archivos de la reasignación directa que quedaron "pendientes de borrar" ya no existen en el disco de Javier -- se borraron en algún momento sin que se actualizara el documento.

---

## 2.27 Corrección de errores de compilación (TypeScript) detectados por CI al subir la rama (14-sep-2026)

Javier subió la rama con todo el trabajo de las secciones 2.24-2.26 a GitHub y el job `npm run lint` falló por un error de comillas sin escapar (`react/no-unescaped-entities`) que resultó ser de un commit viejo -- su copia local ya estaba corregida, bastó con subir de nuevo. Al resolver eso, un segundo job (`tsc`, compilación de TypeScript) sí encontró errores reales, la mayoría **preexistentes** -- código que quedó desincronizado por cambios de schema de días anteriores y que nunca se había detectado porque no se corría el build/typecheck antes de este punto.

**Causados por los cambios de esta sesión (2.24-2.26):**
- `activos/[id]/page.tsx`: el mapa de etiquetas de `TipoEvento` (`tipoEventoLabels`) no tenía entrada para el nuevo valor `compra` (agregado en SPEC 2.25) -- se agregó `compra: "Compra"`.
- `guias-despacho/nueva/page.tsx`: tiene su propio tipo local `Asset` (duplicado del de `SelectorActivos.tsx` a propósito, para no acoplar ambos componentes) que quedó desalineado al agregarle `pulgadas`/`conectividad` al tipo de `SelectorActivos` en la sección 2.26 -- TypeScript trata dos tipos con el mismo nombre pero campos distintos como incompatibles. Se agregaron los mismos dos campos al tipo local.
- `__tests__/lib/validations/assetTransition.test.ts`: probaba `maintenanceCloseSchema` (eliminado en SPEC 2.25) y el campo `documentoVenta` de `assetVentaSchema` (también eliminado). Se quitó el import y el `describe` completo de `maintenanceCloseSchema`, y las 2 pruebas de `documentoVenta`.

**Preexistentes, sin relación con esta sesión (destapados ahora porque el CI corre `tsc` por primera vez):**
- `documentGeneratorService.ts` seguía leyendo `asset.operador` para armar la descripción del equipo en los documentos PDF (Anexo de Entrega, Comprobante de Entrega) -- ese campo se eliminó del modelo `Asset` el 14-sep-2026 más temprano en esta misma sesión (ver SPEC 2.20, migración `20260914000000_activos_quitar_operador_celular`), pero este archivo no se había tocado. Se quitó `operador` de la firma de `descripcionAsset()` y de donde se arma el objeto `assets` en `generateAnexoEntrega()`; los documentos generados simplemente ya no incluyen ese dato (coherente con que el campo ya no existe en ningún otro lugar del sistema).
- `api/proveedores/route.ts`, `api/proveedores/[id]/route.ts` y la pantalla `configuracion/proveedores/page.tsx` seguían usando `_count.purchases` (cantidad de compras de un proveedor) y bloqueando el borrado de un proveedor si tenía compras asociadas -- pero `Supplier` y `Purchase` están desvinculados desde el 11-sep-2026 (`Purchase` solo guarda un `rutProveedor` de texto libre, no una relación real al catálogo de proveedores; ver nota en el modelo `Purchase` de `schema.prisma`). Esa relación de Prisma ya no existe, por lo que este código directamente no compilaba. Se quitó `_count.purchases` de las 4 rutas de `/api/proveedores` y la columna "Compras" + el bloqueo de borrado en la pantalla de Configuración → Proveedores -- ya no hay forma de saber cuántas compras tiene un proveedor del catálogo, así que se puede eliminar cualquiera sin esa restricción.

**Fuera de alcance:** no se investigó si el desacople Supplier/Purchase (decisión del 11-sep-2026) fue intencional a largo plazo o si en algún momento se quiere volver a relacionar ambos modelos -- si Javier quiere retomar esa relación, es una decisión de diseño aparte.

**Changelog SPEC:**

**v1.33 (2026-09-14):** Corregidos 8 errores de compilación TypeScript que bloqueaban el CI de GitHub: 3 causados por los cambios de esta sesión (label de evento `compra` faltante, tipo `Asset` desalineado en Nueva Guía de Despacho, test obsoleto) y 5 preexistentes destapados por primera corrida de `tsc` en CI (referencia a campo `Asset.operador` eliminado en `documentGeneratorService.ts`; uso de la relación inexistente `Supplier.purchases` en 3 rutas de `/api/proveedores` y en la pantalla de Configuración → Proveedores, donde también se quitó el bloqueo de borrado basado en esa relación).

---

## 2.28 Corrección de pruebas y cobertura que bloqueaban el paso "Tests" del CI (14-sep-2026)

Después de que el CI pasara Typecheck y Lint, falló el paso "Tests + umbrales de cobertura" (`jest --coverage --ci`): 5 pruebas rotas y 3 umbrales de cobertura no alcanzados.

**Pruebas desactualizadas por el cambio de mantención (SPEC 2.25):** `completeMaintenanceSchema.test.ts` seguía probando datos sin el campo `resultadoTipo`, que se volvió obligatorio al agregar el flujo de "No reparable" -- las 3 pruebas fallaban porque la validación real ahora rechaza esos datos (correctamente). Se corrigió el fixture y se agregaron pruebas nuevas para las ramas que trajo ese cambio: `resultadoTipo` faltante, `pendiente_repuestos` sin motivo, `no_reparable` sin motivo (rechaza), y `no_reparable` con motivo (acepta).

**Pruebas incorrectas, no relacionadas con esta sesión:** `permissions.test.ts` esperaba que técnico NO pudiera leer `compras`, pero la matriz de permisos (`permissions.ts`) documenta explícitamente desde el 11-sep-2026 que registrar una compra es trabajo operativo del técnico ("pedido explícito de Javier"), con lectura y escritura para ambos roles. La prueba nunca se había corrido en CI para detectar el desajuste. Se corrigió: se sacó `compras` de la prueba "no toca datos maestros" (no es un dato maestro) y se agregó una prueba separada que confirma que técnico sí puede leer/escribir compras pero no borrarlas.

**Umbrales de cobertura de rama no alcanzados:** `assetTransition.ts` (80% requerido, 71.42% real) y `maintenance.ts` (74% branches / 90% functions requerido, 72%/0% real) tienen ramas de "fecha inválida lanza error" (`fechaVenta`, `fechaReasignacion`) y el `.refine()` de `no_reparable` que ninguna prueba ejercitaba -- en el caso de `maintenance.ts` la cobertura de funciones caía a 0% porque, al faltar `resultadoTipo`, la validación fallaba antes de llegar a ejecutar las funciones internas de transformación/refine. Se agregaron pruebas puntuales para esas ramas.

**Sin verificar:** no se pudo correr `npm run test:coverage` en este entorno para confirmar los porcentajes finales -- se recomienda que Javier lo corra en local antes de subir de nuevo la rama.

**Changelog SPEC:**

**v1.34 (2026-09-14):** Corregidas 5 pruebas rotas y agregadas pruebas para 3 umbrales de cobertura de rama no alcanzados, que bloqueaban el paso "Tests + umbrales de cobertura" del CI: 3 pruebas de `completeMaintenanceSchema` desactualizadas por SPEC 2.25 (falta `resultadoTipo`), 2 pruebas de `permissions.ts` incorrectas sobre el acceso de técnico a `compras` (ya documentado como intencional desde el 11-sep-2026), y cobertura de rama agregada para fechas inválidas en `assetTransition.ts` y el `.refine()` de `no_reparable` en `maintenance.ts`.

**v1.35 (2026-09-14):** Registro de diseño (sin código todavía, ver sección 2.29): alcance ampliado a Perú (confirmado por don Fernando, ~10 equipos), rediseño de la visibilidad por sede de técnico (acceso total a todos los recursos salvo Configuración, selector de sede único en el nav, creación siempre con sede explícita -- revierte a propósito parte de SPEC 2.24), nuevo registro de auditoría genérico para Empleados/Compras/Usuarios (Proveedores queda excluido explícitamente), y 3 preguntas pendientes sobre el diseño de Líneas telefónicas.

---

## 2.29 Ampliación de alcance a Perú y rediseño de la visibilidad por sede de técnico (DISEÑO ACORDADO -- PENDIENTE DE IMPLEMENTAR) (14-sep-2026)

**Este es un registro de diseño, no una sección de código ya construido.** Se conversó con Javier (quien a su vez consultó a don Fernando) y se llegó a un diseño concreto, pero nada de esto está implementado todavía -- queda para una sesión de trabajo aparte, coordinada para no pisarse con el análisis no funcional que Claude Code está corriendo en paralelo sobre el mismo repo.

**Origen de la conversación:** al revisar el Excel real de Notebooks para preparar la importación, Javier notó equipos con dirección de Perú y notebooks asignados a múltiples ubicaciones, lo que abrió la duda de si el sistema debía limitarse a Chile. Le preguntó a don Fernando, quien respondió: *"si tenemos equipos en Perú son como 10 ... Eso son parte tb del inventario ... En si la plataforma es para registrar todos los activos digitales q nosotros gobernamos ... Pantallas, mouse, impresoras etc y en cuanto a los pc tb los de Perú"*. Sobre las líneas telefónicas, confirmó que se reasignan de forma independiente del celular y que no todos los celulares tienen línea (*"Se reasignan ... Hay algunos q no tienen línea telefónica etc ... Y otros si"*).

**1. Alcance ampliado a Perú.** El sistema deja de ser "Chile únicamente" -- pasa a cubrir todos los activos que la empresa gobierna, Perú incluido (~10 equipos: notebooks, pantallas, mouse, impresoras). Implica:
   - Crear la(s) sede(s) de Perú en el catálogo (Configuración → Sedes) antes de importar -- cuántas sedes depende de cuántas ubicaciones físicas reales haya en Perú, dato aún no confirmado.
   - El campo `Employee.ubicacion` y `Asset.ubicacionFisica` (texto libre, ya existían antes del sistema de sedes -- ver SPEC 2.9) siguen siendo el lugar correcto para el detalle fino (ej. "Perú - Oficina Lima"), separado de `sedeId` que sigue siendo estructurado. No se necesita ningún campo nuevo para esto.

**2. Líneas telefónicas -- diseño todavía sin cerrar.** Confirmado que una línea no siempre está pegada 1:1 a un celular (se reasignan de forma independiente, y hay celulares sin línea). Esto apunta a necesitar un modelo `Linea` independiente del `Asset` Celular, con su propio estado e historial, y relación opcional a un celular. Quedan sin responder 3 preguntas necesarias antes de diseñar el schema: (1) ¿una línea puede quedar asignada directamente a un empleado sin celular de por medio, o siempre pasa por un celular? (2) ¿necesita historial de reasignación igual que un Activo, o basta el estado actual? (3) ¿entra al mismo flujo de Solicitudes (onboarding/cambio/offboarding) o es un proceso aparte? Esto se retoma en una conversación futura.

**3. Rediseño de la visibilidad por sede de técnico.** Decisión explícita de Javier: *"dejaremos que cualquier tecnico puedo meterse a cualquier sede"* y *"me refiero a todo, tendra acceso a todos excepto la configuracion que ese es de admin"*. Razón: como ya no tiene sentido crear un usuario dedicado solo para ver 10 equipos de Perú, y como toda acción queda igualmente ligada al usuario que la ejecutó (ver punto 4), el aislamiento estricto por sede deja de ser necesario para técnico.

   **IMPORTANTE -- esto revierte, a propósito, parte de SPEC 2.24.** Hace 2 días blindamos 5 rutas para que un técnico NO pudiera ver/tocar datos de otra sede (fuga de aislamiento). Con este nuevo diseño, ese comportamiento pasa a ser el querido, no una fuga. Se deja esta nota para que nadie lo "corrija" de vuelta pensando que es un bug -- es un cambio de rumbo deliberado, decidido después de conocer el alcance real (Perú) y la escala (10 equipos, no amerita usuarios separados).

   Diseño acordado:
   - `tieneVisibilidadTotal(session)` (`sedeScope.ts`) pasa a devolver `true` para técnico igual que para admin, sin distinción por recurso -- técnico ve y gestiona todo, en todas las sedes, en todos los módulos operativos. Lo único que se mantiene admin-only es Configuración (ya resuelto por la matriz de permisos, `permissions.ts` -- no tiene relación con `sedeScope.ts` y no cambia).
   - Un **selector de sede único, en el Sidebar/nav** (no uno por pantalla) -- opciones "Todas las sedes" + cada sede del catálogo. Se mantiene mientras el usuario navega entre módulos (persistido en cookie o almacenamiento del navegador).
   - Cada pantalla de listado (Activos, Empleados, Asignaciones, Solicitudes, Mantenciones, Compras, Desvinculaciones, Kit/EPP) respeta la sede seleccionada como filtro. El mecanismo YA EXISTE parcialmente: `/api/activos` ya acepta `?sedeId=` como query param cuando `tieneVisibilidadTotal(session)` es true (se usa hoy para el selector de equipos de una Guía de Despacho) -- falta extender ese mismo patrón al resto de los endpoints de listado.
   - El selector filtra listados, no bloquea el acceso a un registro puntual: si un técnico abre por link directo un activo que no es de la sede seleccionada, igual debe poder verlo.
   - Al **crear** cualquier registro, la sede deja de asignarse automáticamente según la sede del técnico -- pasa a exigirse una elección explícita, igual que ya le pasa a admin hoy (`sedeIdParaCrear` con `requerido: true`).

**4. Nuevo registro de auditoría genérico (para sostener el punto 3).** Javier justifica abrir el acceso entre sedes en que "cualquier cosa queda un registro" ligado al usuario que la ejecutó. Eso es cierto hoy solo para Activos (`AssetHistoryService`) y Solicitudes (historial de actividad) -- editar un Empleado, una Compra o un Usuario del sistema hoy solo deja `updatedAt` en la fila, sin quién ni qué cambió. Se agrega una tabla de auditoría genérica (quién, qué acción, sobre qué registro, cuándo) enganchada en los endpoints de escritura de Empleados, Compras y Usuarios.

   **Excluido explícitamente: Proveedores.** Javier fue explícito: *"aclarar que proveedor no va a estar ya que es un dato que no tiene relevancia para el area de soporte"*. No se audita ese módulo.

**Fuera de alcance de este registro:** el diseño de `Linea` (punto 2) queda pendiente hasta tener las 3 respuestas señaladas. La cantidad exacta de sedes que necesita Perú tampoco está confirmada.

---

## 2.30 Etapa 1 de implementación de SPEC 2.29 (visibilidad de técnico) (14-sep-2026)

Implementación por etapas, acordada con Javier (*"el objetivo es una buena integración sin romper el sistema así que será en etapas, siempre que haga el cambio realizas un test para buscar fallos"*), para no romper el sistema de una vez. Esta es la Etapa 1: el cambio de base en `sedeScope.ts` más el selector global de sede, aplicado a los tres módulos que ya tenían formulario de creación con sede.

- **`sedeScope.ts`:** `tieneVisibilidadTotal(session)` ahora devuelve `true` para `admin` **y** `tecnico` por igual (antes: solo `admin`). Es la única función que cambia -- `sedeWhere`, `assertSedeAccess` y `sedeIdParaCrear` no se tocaron, heredan el nuevo comportamiento porque ya dependían de `tieneVisibilidadTotal`. Se agrega `sedeScope.test.ts` (nuevo) cubriendo el cambio explícitamente.
- **Selector de sede global (nav):** nuevo `SedeSeleccionadaProvider` (contexto + `localStorage`, persiste entre pantallas y refresh), montado una sola vez en `(dashboard)/layout.tsx`. La UI vive en el `Sidebar`, no en cada pantalla -- pedido explícito de Javier (*"porque en cada pantalla? basta con agregarlo al nav y así se reutiliza"*). Se agrega `SedeSeleccionadaProvider.test.tsx` (nuevo) cubriendo el contrato del contexto.
- **`/activos` (listado):** ya respeta la sede elegida en el nav (se agregó `sedeId` a los dos `fetch` existentes). El endpoint `/api/activos` ya soportaba `?sedeId=` desde antes (se usaba para el selector de Guía de Despacho) -- no hubo que tocar el backend.
- **`/activos/nuevo`:** el campo Sede, antes visible solo para admin, ahora es obligatorio y visible para cualquier rol.
- **`/solicitudes/nueva`:** mismo cambio -- el campo Sede (aparecía dos veces en el archivo, una para Onboarding y otra para el resto de tipos de solicitud) deja de estar detrás de `isAdmin` y pasa a ser siempre obligatorio. La validación de "Debes seleccionar una sede" también deja de ser exclusiva de admin.
- **`/guias-despacho/nueva`:** mismo cambio, con una particularidad -- esta pantalla maneja DOS sedes (origen y destino). La sección "Sede origen" (antes solo-admin) ahora es siempre visible y obligatoria; se quita el supuesto de que un técnico despacha siempre desde `session.user.sedeId` (ya no aplica, un técnico puede despachar desde cualquier sede). El backend (`POST /api/guias-despacho`) no necesitó cambios: ya usaba `sedeIdParaCrear(session, body.sedeId, { requerido: true })`, que hereda el nuevo comportamiento automáticamente.
- **`/activos/empleados` (antes `/empleados`, movido dentro de Activos):** revisado, **sin cambios necesarios**. Esta pantalla es de solo consulta (el módulo Empleados ya no tiene alta manual -- los empleados se crean únicamente desde Solicitudes → Onboarding, ver comentario en el propio archivo). La visibilidad de técnico se hereda automáticamente vía `sedeWhere(session)` en `GET /api/empleados`, sin tocar el frontend. Queda pendiente para la Etapa 2 conectar el selector del nav a esta pantalla (hoy sus `fetch` no mandan `sedeId` y la API tampoco lo lee todavía en el `GET`).

**Nota de proceso:** durante esta etapa se detectó que `app/src/app/(dashboard)/empleados/page.tsx` ya no existía -- investigación inicial (con la ruta antigua) generó una falsa alarma de pérdida de datos. Se confirmó con `git status` (limpio) y con `dir` nativo de Windows que el archivo simplemente se había reubicado a `app/src/app/(dashboard)/activos/empleados/page.tsx` como parte de la reorganización de Empleados como subpestaña de Activos. No hubo ninguna pérdida real.

**Ajuste sobre la marcha -- sede por defecto al crear.** Javier aclaró que, aunque el campo Sede ya no está oculto para técnico, no quiere que el técnico tenga que elegirla a mano cada vez: *"cuando un tecnico de tal sede quiera hacer algo crear activo, una solicitud etc, pues eso se crea con la sede del tecnico"*. Se agrega un `useEffect` en los 3 formularios (`/activos/nuevo`, `/solicitudes/nueva`, `/guias-despacho/nueva`) que precarga el dropdown con `session.user.sedeId` apenas la sesión está disponible, sin pisar una elección manual ya hecha (`prev || session.user.sedeId`). El campo sigue siendo un `<select>` editable -- el técnico puede cambiarlo si esta vez necesita crear algo para otra sede (ej. Perú) -- solo cambia el valor con el que arranca.

**Pendiente (Etapa 2 en adelante):** extender el filtro `?sedeId=` a los endpoints de listado que todavía no lo soportan (empleados, asignaciones, solicitudes, mantenciones, compras, desvinculaciones, kit-items); actualizar las pantallas de creación restantes si corresponde.

## 2.31 Auditoría genérica (Empleados/Compras/Usuarios) -- adelantada de la Etapa 4 (14-sep-2026)

Javier expresó preocupación explícita después de ver la Etapa 1 funcionando: *"me preocupa el tema de los tecnicos aun porque pueden modificar cosas que no son de su sede"*. Como este era justamente el riesgo que el punto 4 de SPEC 2.29 estaba pensado para compensar (que "cualquier cosa quede un registro" ligado al usuario), se adelanta esa pieza en vez de dejarla para el final del plan por etapas.

- **Modelo `AuditLog`** (`schema.prisma`, migración `20260914050000_agrega_audit_log`): tabla genérica/polimórfica -- `entidad` (enum `AuditEntidad`: `empleado` | `compra` | `usuario`), `entidadId`, `accion` (enum `AuditAccion`: `crear` | `actualizar` | `eliminar`), `descripcion`, `datosAnteriores`/`datosNuevos` (JSON), `usuarioSistema` (texto libre, igual que `AssetHistory.usuarioSistema`), `createdAt`. Sin relación FK a cada modelo -- Prisma no soporta una FK que apunte a "uno de varios modelos posibles", así que se sigue el mismo criterio que `AssetHistory` (texto libre en vez de relación) pero generalizado a 3 entidades.
- **`auditLogService.ts`** (nuevo, `src/lib/services/`): mismo patrón que `assetHistoryService.ts` -- `registrar`, `registrarCreacion`, `registrarActualizacion`, `registrarEliminacion`, todos con `tx` opcional para que el registro se confirme o descarte junto con el cambio que documenta.
- **Enganchado en los 6 endpoints de escritura:**
  - `POST /api/empleados`, `PUT /api/empleados/[id]`, `DELETE /api/empleados/[id]` (el DELETE es soft-delete -- cambia `estado` a `desvinculado` -- pero se audita como `eliminar` porque así lo percibe quien lo hace).
  - `POST /api/compras`, `PUT /api/compras/[id]`, `DELETE /api/compras/[id]` (el DELETE de Compras SÍ es un borrado físico de la fila -- el registro de auditoría queda como el único rastro de que existió).
  - `POST /api/usuarios`, `PUT /api/usuarios/[id]`, `DELETE /api/usuarios/[id]`.
- **Excluido explícitamente: Proveedores.** Sin cambios en `/api/proveedores` -- Javier fue explícito en que ese dato no tiene relevancia para el área de soporte (ver SPEC 2.29 punto 4).
- **Regla de seguridad, sin excepción: `passwordHash` nunca entra al snapshot de Usuario.** Las rutas de `/api/usuarios` arman `datosAnteriores`/`datosNuevos` a mano (solo `email`, `nombre`, `rol`, `activo`, `sedeId`) en vez de pasar el registro completo -- documentado también como comentario en el modelo `AuditLog` para que nadie lo agregue por accidente más adelante.
- **Snapshots parciales, no el registro completo.** Igual que `assetHistoryService`, cada snapshot solo guarda los campos "de negocio" relevantes (ej. en Empleado: nombre, RUT, correo, cargo, estado, sede -- no cada columna administrativa como `updatedAt`).
- **Sin test unitario nuevo**, por el mismo motivo que `assetHistoryService` tampoco tiene uno: son servicios que solo envuelven una escritura a Prisma, sin lógica propia que valga la pena aislar -- se revisó el código a mano en vez de forzar un mock de Prisma nuevo para el patrón.
- **No leído todavía en ninguna pantalla.** Este cambio solo agrega el registro (la escritura); falta construir la vista de consulta (quién hizo qué, cuándo) -- queda pendiente para cuando Javier la pida.

## 2.32 Auditoría genérica extendida a todos los módulos restantes (14-sep-2026)

Javier pidió explícitamente ampliar el alcance: *"la idea es que registre el historial de todos los modulos, todas las acciones del sistema"*. Antes de ejecutar se confirmaron dos cosas con él:

1. **Activos y Solicitudes quedan aparte, sin cambios.** Ya tienen su propio historial -- `AssetHistory.usuarioSistema` (texto libre) y `WorkflowTransition.ejecutadoPorId` (relación real a `SystemUser`, de hecho más completo que `AuditLog`). Javier no pidió unificarlos.
2. **Proveedores sigue excluido.** Confirmó que esa tabla se va a eliminar por estar sin uso, así que no tiene sentido auditarla.

Con eso, se extiende `AuditEntidad` (migración `20260914060000_audit_log_mas_entidades`) con los 7 valores que cubren los módulos que hoy no tenían ningún registro de quién hizo qué:

- **`mantencion`**: `POST /api/mantenciones` (crear ticket), `PUT /api/mantenciones/[id]` (actualizar), `POST /api/mantenciones/[id]/completar` (completar), `DELETE /api/mantenciones/[id]` (eliminar, solo pendientes).
- **`guia_despacho`**: `POST /api/guias-despacho` (crear) y `PATCH /api/guias-despacho/[id]` (confirmar recepción -- único cambio posible sobre una guía ya creada, no se puede editar ni anular).
- **`desvinculacion`**: `POST /api/desvinculaciones` (crear), `PUT /api/desvinculaciones/[id]` (actualizar), `POST /api/desvinculaciones/[id]/procesar-devolucion` (procesar devolución de equipos), `DELETE /api/desvinculaciones/[id]` (eliminar, solo sin devoluciones procesadas).
- **`kit_item`**: `POST /api/kit-items`, `PUT /api/kit-items/[id]`, `DELETE /api/kit-items/[id]` -- el catálogo de artículos de Kit de Bienvenida/EPP. No cubre la entrega puntual de un kit a un empleado (eso vive en `Employee.fechaEntregaKit`/`fechaEntregaEpp`, fuera de este alcance).
- **`sede`**: `POST /api/sedes` (crear) y `PATCH /api/sedes/[id]` (editar nombre/activar-desactivar -- sin `DELETE`, las sedes no se borran).
- **`categoria`**: `POST /api/categorias`, `PUT /api/categorias/[id]`, `DELETE /api/categorias/[id]` (solo si no tiene activos asociados).
- **`tipo_mantencion`**: `POST /api/mantenciones/tipos`, `PUT /api/mantenciones/tipos/[id]`, `DELETE /api/mantenciones/tipos/[id]` (solo si ninguna mantención lo usa).

Mismo criterio que SPEC 2.31 en todos: `auditLogService`, snapshots parciales (solo campos de negocio), y dentro de la misma `$transaction` cuando la operación ya usaba una (mantenciones, guías, desvinculación al crear).

**Cobertura total de AuditLog ahora:** empleado, compra, usuario, mantencion, guia_despacho, desvinculacion, kit_item, sede, categoria, tipo_mantencion (10 entidades). Junto con AssetHistory (Activos) y WorkflowTransition (Solicitudes), todos los módulos del sistema quedan con trazabilidad de quién hizo qué, salvo Proveedores (sin uso, se elimina).

## 2.33 Etapa 2 de SPEC 2.29: selector de sede del nav conectado a los demás listados (14-sep-2026)

Tras confirmar que la trazabilidad genérica (2.31/2.32) ya estaba lista, Javier preguntó *"bien ya tenemos trazabilidad, con que seguimos?"* y eligió continuar con la Etapa 2 del plan por etapas de SPEC 2.29: hasta ahora solo `/activos` respetaba el selector de sede global del nav (`SedeSeleccionadaProvider`, construido en la Etapa 1 / sección 2.30); el resto de los listados lo ignoraba por completo, así que elegir una sede ahí no cambiaba nada fuera de Activos.

- **Backend -- mismo patrón que `GET /api/activos` en todos los endpoints de listado:** se lee `sedeId` de la query string y, solo si `tieneVisibilidadTotal(session)` (admin o técnico, ver 2.30), se agrega al `where` -- para quien no tiene visibilidad total, `sedeWhere(session)` ya lo deja fijo en su propia sede y el parámetro no aplica.
  - `GET /api/empleados`, `GET /api/asignaciones` (vía `where.asset.sedeId`, porque `Assignment` no tiene `sedeId` propio), `GET /api/solicitudes` (`where.sedeId` directo), `GET /api/mantenciones` (vía `where.asset.sedeId`), `GET /api/desvinculaciones` (vía `where.employee.sedeId`), `GET /api/kit-items` (`where.sedeId` directo).
  - `GET /api/compras` no necesitó cambios: ya leía `sedeId` de la query desde antes (tiene su propio selector de sede en la UI, ver abajo).
- **Frontend -- se conecta `useSedeSeleccionada()` y se manda `sedeId` en cada fetch:**
  - `/activos/empleados` (Personal), `/solicitudes`, `/mantenciones`.
  - `AsignacionesTable` (pestaña "Asignaciones" de Activos) y `KitEppCategoriaView` (pestañas "Kit de Bienvenida" y "EPP" de Activos).
- **Sin cambios en Compras:** ya tenía su propio selector de sede local (`filterSede`, independiente del nav) desde antes -- no se tocó para no duplicar ni pisar ese patrón ya existente.
- **Desvinculaciones: solo backend.** `GET /api/desvinculaciones` ya soporta `?sedeId=`, pero no existe hoy ninguna pantalla que liste desvinculaciones (el módulo solo tiene `/desvinculaciones/nueva` y el detalle `/desvinculaciones/[id]`) -- no hay ningún fetch en el frontend a auditar ni conectar. Queda listo para cuando se construya esa vista.
- **Verificación:** se revisó cada endpoint tocado a mano contra el mismo criterio que ya funcionaba en Activos (filtro solo aplica con `tieneVisibilidadTotal`, nunca se lo salta un técnico) y se confirmó que los tipos de `Prisma.*WhereInput` usados (`AssetWhereInput`, `EmployeeWhereInput`) coinciden con las relaciones reales del schema.

## 2.34 Reorganización de Configuración: Parámetros reales y Auditoría unificada (14-sep-2026)

Javier pidió dejar listo el módulo Configuración, que encontraba "un poco pobre en cuanto a funciones". Antes de construir nada se declaró explícitamente, con él, qué debía tener cada sección -- ver el intercambio previo a este punto. Resultado: el menú de Configuración queda en 6 secciones -- Sedes, Categorías de Activos, Usuarios del Sistema, Parámetros Generales, Auditoría y Mantenimiento de Datos. Se sacan del menú **Proveedores** (la tabla se va a eliminar por no usarse) y **Microsoft Sync** (sin certeza de que la integración se vaya a usar) -- ninguna de las dos rutas se borró, solo dejan de listarse en `configuracion/page.tsx`.

**Hallazgo previo a implementar:** "Parámetros Generales" era 100% decorativa -- datos de ejemplo hardcodeados ("SLC Consultores", RUT con X) y el botón Guardar solo simulaba un delay de 1 segundo sin persistir nada. Se confirmó con Javier que las actas/reportes no necesitan mostrar estos datos (quedan solo como referencia guardada).

- **Nuevo modelo `SystemConfig`** (`schema.prisma`, migración `20260914070000_agrega_system_config`): fila única (`id = "singleton"`), con datos de empresa (nombre, RUT, dirección, teléfono, email, sitio web -- todos opcionales, sin conectar a documentos) y seguridad (`duracionSesionHoras`, `maxIntentosLogin`, `minutosBloqueoLogin`, todos con default = a los valores que el sistema ya usaba hardcodeados). `GET`/`PUT /api/configuracion/parametros` (admin-only, recurso `configuracion`) hacen upsert sobre esa fila única; el `PUT` valida rangos razonables (enteros positivos, tope de 720 horas de sesión) y queda auditado en `AuditLog` (nuevo valor de entidad `configuracion`).
- **`lib/auth.ts` ahora lee la configuración real** en vez de las constantes hardcodeadas que tenía (`MAX_ATTEMPTS=5`, `LOCKOUT_DURATION=15min`, `session.maxAge=24h`):
  - Intentos de login / minutos de bloqueo: se consultan en cada intento (`getConfigLogin()`, dentro de `authorize()`) -- un cambio en Configuración aplica de inmediato al siguiente login.
  - Duración de sesión: NextAuth necesita este valor de forma síncrona al construir `authOptions`, y `getServerSession(authOptions)` se usa en decenas de archivos -- reestructurar eso para volver a consultar la base en cada request quedaba fuera de alcance razonable para este cambio. Se implementó con una variable cacheada (`cachedSesionMaxAgeSegundos`) que arranca en el default y se actualiza en segundo plano (fire-and-forget) apenas la consulta a `SystemConfig` responde; `session.maxAge` es un getter que siempre lee el valor cacheado más reciente. **Consecuencia práctica, explicada a Javier:** cambiar la duración de sesión aplica recién después de que el servidor se reinicie/redespliegue (o, como mucho, unos segundos después si el proceso lleva rato corriendo) -- no es instantáneo como los intentos de login, y tampoco puede "cortar" una sesión ya activa (su expiración ya quedó grabada en el JWT al momento de emitirlo).
  - Si `SystemConfig` todavía no tiene fila guardada, o la consulta falla por cualquier motivo, se usan los mismos valores que el sistema tenía antes -- el login nunca se puede caer por esto.
- **Parámetros Generales, reescrita por completo** (`configuracion/parametros/page.tsx`): se sacan las secciones decorativas "Notificaciones", "Mantenciones", "Documentos" y "Sistema" que tenía la versión vieja (Javier confirmó que solo quiere Empresa + Seguridad); las dos que quedan leen/escriben de verdad contra la API nueva, con mensaje de éxito/error real y fecha + usuario de la última actualización.
- **Auditoría (`configuracion/auditoria/page.tsx`, nueva) + `GET /api/auditoria`:** pantalla que unifica en una sola línea de tiempo los tres lugares donde el sistema guarda "quién hizo qué" -- `AuditLog` (10 módulos, SPEC 2.31/2.32), `AssetHistory` (Activos) y `WorkflowTransition` (Solicitudes). Pedido explícito de Javier: *"todo junto para tener todo el historial del sistema en un solo lugar pero obviamente no saques nada de activo ni solicitudes"* -- las pestañas de historial que ya existen en el detalle de cada Activo y cada Solicitud siguen exactamente iguales, esta pantalla solo agrega una vista combinada adicional.
  - Prisma no permite un `UNION` entre modelos con columnas distintas: la ruta consulta las tres tablas por separado (cada una acotada por los filtros que apliquen, con un tope de 300 filas por fuente), las mapea a una forma común (`EventoAuditoria`: módulo, acción, descripción, usuario, fecha, datos anteriores/nuevos, contexto) y las combina/ordena/pagina en memoria -- mismo criterio ya usado en Empleados/Asignaciones/Solicitudes para la búsqueda de texto.
  - Filtros: módulo (los 10 de `AuditLog` + Activo + Solicitud), usuario (email o nombre), texto libre en la descripción, y rango de fechas. Si el tope de 300 filas por fuente se alcanza para el filtro elegido, la pantalla avisa que hay más eventos de los mostrados y sugiere acotar el filtro.
  - Solo admin (recurso `configuracion`) -- no hace falta aislar por sede porque quien entra ya ve todas las sedes.
  - Sin test unitario nuevo, mismo criterio que `auditLogService`/`assetHistoryService`: es una consulta/transformación sin lógica de negocio propia que justifique un mock de Prisma.

## 2.35 Eliminación de la tabla Proveedores y sede Perú en el seed (14-sep-2026)

Pedido explícito de Javier: *"elimina la tabla de proveedores, y otra sede Seria la de peru agregala al seed"*.

**Proveedores:**
- La tabla `Supplier` ya estaba desvinculada de `Purchase` desde el 11-sep-2026 (SPEC de esa fecha, migración `20260911200000_compras_solo_factura_y_equipos`) y Javier había confirmado que no se estaba usando. Al sacarse del menú de Configuración (SPEC 2.34) quedó pendiente eliminar la tabla en sí, que es lo que se hace acá.
- **Migración `20260914080000_elimina_proveedores`:** `DROP TABLE "suppliers"`. Sin FKs entrantes, se pudo eliminar directo.
- **`schema.prisma`:** se saca el modelo `Supplier` por completo, se deja un comentario apuntando a esta sección y a la migración.
- **Permisos (`lib/auth/permissions.ts`):** se saca `'proveedores'` del arreglo `RECURSOS` y su bloque en `RESOURCE_PERMISSIONS` -- ya no es un recurso válido del sistema. Se actualizaron los tests de `permissions.test.ts` que lo referenciaban.
- **Rutas API (`/api/proveedores`, `/api/proveedores/[id]`):** en vez de eliminarse los archivos (limitación del flujo de respaldo actual, sin capacidad de borrar archivos), quedan como stubs que devuelven `410 Gone` con un mensaje explícito, para que cualquier llamada vieja falle claro en vez de con un error 500 de Prisma contra una tabla inexistente.
- **Página `configuracion/proveedores/page.tsx`:** mismo criterio -- en vez de borrarse, muestra un mensaje "Proveedores fue eliminado" con link de vuelta a Configuración, por si alguien entra por un enlace o favorito guardado.
- `lib/validations/supplier.ts` queda huérfano (sin nada que lo importe) -- se deja igual que otros archivos huérfanos existentes en el proyecto, no se toca salvo que Javier lo pida.

**Sede Perú:**
- Se agrega a `prisma/seed.ts` como excepción puntual a la regla vigente desde el 11-sep-2026 de que las sedes no se crean por seed (se crean a mano desde Configuración > Sedes). Es la única sede nueva que Javier pidió incluir directamente en el seed.
- `codigo: "PERU"`, `nombre: "Perú"`, `activa: true` -- confirmado por Javier.
- Santiago y Concepción **no** se agregan al seed: ya existen en la base real (creadas a mano desde Configuración), y no se conoce con certeza el código exacto (`Sede.codigo`, campo único) con el que quedaron guardadas. Agregarlas acá adivinando el código arriesgaba crear una sede duplicada en vez de coincidir con la existente. Queda pendiente confirmar esos códigos con Javier si más adelante se quiere que el seed también las cree/actualice.

## 2.36 Compras: soporte para Kit de Bienvenida / EPP (14-sep-2026)

Pedido explícito de Javier: *"no pero me doy cuenta que aveces el kit de bievenida o epp tambien lo compran y aqui al registrar una factura con sus productos solo funciona con los equipos pero no con el kitt de bievenida o epp"*. Antes, "Nueva Compra" solo permitía vincular la factura a Activos (equipos con serie); si una factura traía EPP o artículos del Kit de Bienvenida, no había forma de reflejarlo -- había que ir aparte a editar el stock a mano en Activos > Kit de Bienvenida.

- **Nuevo modelo `PurchaseKitItem`** (migración `20260914090000_agrega_purchase_kit_items`): a diferencia de `PurchaseAsset` (que vincula una unidad de Activo ya existente 1 a 1), esta tabla registra una **cantidad** comprada de un artículo del catálogo `WelcomeKitItem` -- porque Kit/EPP es stock contable, no unidades individuales rastreables (ver SPEC 2.9).
- **Al agregar una línea de Kit/EPP a una compra** (`POST /api/compras` al crear, o `POST /api/compras/[id]/kit-items` después), el stock del artículo (`WelcomeKitItem.cantidad`) sube automáticamente en esa cantidad, en la sede que le corresponde al artículo -- mismo aislamiento por sede que ya tenía la vinculación de Activos (un técnico solo puede sumar stock a artículos de su propia sede).
- **Al desvincular una línea** (`DELETE /api/compras/[id]/kit-items`) **o eliminar la compra completa**, el stock se resta de vuelta -- pero nunca baja de 0, por si parte de ese stock ya se entregó a un empleado mientras tanto.
- Cada suma/resta de stock por una compra queda auditada contra el propio artículo (entidad `kit_item`, igual que una edición manual de stock desde Activos > Kit de Bienvenida) -- así se ve en Auditoría (SPEC 2.34) de dónde salió cada cambio de stock, sin necesitar una entidad de auditoría nueva.
- **UI:** "Nueva Compra" y el detalle de una compra (`compras/[id]`) ahora tienen una segunda sección, "Kit de Bienvenida / EPP Comprado", paralela a la de Activos: se elige un artículo del catálogo de la sede (mismo `GET /api/kit-items` que usa Activos > Kit de Bienvenida) y una cantidad -- no hay alta rápida de artículo nuevo acá, el catálogo se administra desde esa pantalla.
- Una misma factura puede traer equipos y Kit/EPP mezclados en la misma compra -- no son mutuamente excluyentes.

## 2.37 Errores de formulario por campo, en todo el sistema (14-sep-2026)

Pedido explícito de Javier: *"cuando ocurre un error ya sea ingresar un dato incorrecto o etc, simplemente sale dato invalido cosa que no deberia ser asi, si hay error en un campo debe indicar el error, el tipo de error y cual es el campo que genero ese error"*.

**Diagnóstico:** el backend ya mandaba el detalle útil del error (los `issues` de Zod, con el campo exacto y por qué falló) en casi todas las rutas API -- el problema era que ~22 formularios del frontend lo ignoraban por completo y mostraban un cartel genérico ("Datos inválidos" / "Error al crear X"). La única pantalla que lo hacía bien era "Nueva Solicitud" (`solicitudes/nueva`), pero con el parseo copiado dentro de ese único archivo, no como algo reutilizable.

**Backend:**
- `src/lib/auth/guard.ts` -- nueva función `respuestaDatosInvalidos(error: ZodError)`, que arma la respuesta con `details` ya en un formato uniforme: `{ field: string, message: string }[]` (antes era el array de `issues` de Zod tal cual, con `path` en vez de `field`). Reemplaza el bloque `NextResponse.json({ error: "Datos inválidos", details: validationResult.error.issues }, { status: 400 })` que estaba repetido manualmente en 21 rutas API (24 ocurrencias en total, algunas rutas validan tanto query params como body). `handleApiError` (el traductor de errores no controlados, usado en casi todas las rutas) también se actualizó para usar el mismo formato.
- El error de Prisma P2002 (valor único duplicado, ej. RUT o número de serie repetido) ahora también manda `details` con el/los campo(s) que causaron el conflicto, no solo el mensaje de texto.
- Los errores de negocio lanzados a mano (`ConflictError`, `ValidationError`, ej. "RUT duplicado") ya soportaban un `details` opcional desde antes, pero en la práctica casi nadie lo usaba -- queda como mejora pendiente ir agregándolo caso a caso donde se identifique el campo (no se tocó de forma masiva en este cambio, para no reescribir reglas de negocio sin necesidad).

**Frontend:** dos piezas nuevas y reutilizables, para no repetir el parseo en cada pantalla:
- `src/lib/utils/apiErrors.ts` -- `parseApiError(res, mensajePorDefecto)`, que lee la respuesta de un fetch fallido y devuelve el mensaje general más un mapa `campo -> mensaje` ya parseado (soporta tanto el formato nuevo como el viejo de Zod, por compatibilidad).
- `src/components/ui/ApiErrorSummary.tsx` -- `<ApiErrorSummary error fieldErrors fieldLabels? />`, el cartel de error (mismo estilo visual que ya tenían casi todos los formularios) que ahora, si hay errores por campo, los lista uno por uno con su nombre; si no, muestra el mensaje general como antes.
- Aplicado a los ~21 formularios que lo necesitaban (Activos, Empleados, Compras, Configuración completa, Mantenciones, Guías de Despacho, Solicitudes -- detalle). `solicitudes/nueva` no se tocó: ya funcionaba bien con su propio código, aunque queda pendiente migrarlo a estas piezas comunes en algún momento por consistencia.
- Alcance: esto es el cartel de error mostrando el campo y el motivo tal como pidió Javier. No incluye validación en tiempo real en el cliente (antes de enviar) ni resaltar el borde del input específico -- quedó fuera de este cambio, se puede agregar después si hace falta.

---

## 2.38 Correcciones de la primera prueba funcional end-to-end (15-sep-2026)

Pedido explícito de Javier: *"antes de importar datos quiero que hagas pruebas funcionales para ver si funciona todo correctamente"*, y después de recibir los hallazgos: *"si, hay que arreglar las 9"*.

**Contexto:** primera pasada de QA manual sobre el sistema corriendo (navegador contra `localhost:3000`, base de datos vacía), recorriendo login, Activos, Kit/EPP, Compras, Configuración y Auditoría, como administrador y como técnico de una sede. Confirmó que lo entregado los días anteriores funciona (errores por campo de 2.37, stock de Kit/EPP por compra de 2.36 sumando y revirtiendo, auditoría registrando cada acción con su responsable, permisos de técnico bloqueados con 403 en Configuración) y dejó 9 defectos, todos corregidos acá.

**1. Fechas mostradas un día antes (el más grave).** Una factura guardada como `2026-09-15T00:00:00.000Z` se mostraba en pantalla como "14 de septiembre de 2026". Las fechas de calendario se guardan a medianoche UTC y Chile está en UTC-3/-4, así que `new Date(x).toLocaleDateString("es-CL")` las corría un día hacia atrás. Estaba repetido en 30 archivos sin ningún punto común donde corregirlo, afectando fecha de factura, de entrega, de compra, fin de garantía, próxima mantención y fecha de ingreso, tanto en pantalla como en los Excel exportados y los PDF generados.
- Nuevo `src/lib/utils/fechas.ts`, único punto de verdad, con la distinción explícita entre los dos tipos de fecha del sistema: `formatearFecha` (fecha de calendario, se lee en UTC) y `formatearFechaHora` (marca de tiempo real como `createdAt` o último acceso, que sí se muestra en hora local de quien mira). También `formatearFechaLarga`, `formatearFechaCorta` y `aValorInputDate`.
- Convertidos 32 usos en 21 archivos. Se dejaron deliberadamente en hora local los 9 casos que son marcas de tiempo reales (`createdAt` de solicitudes y kit, fecha de cierre, último acceso de usuarios) y los `new Date()` de "documento generado el ..." en las plantillas PDF.

**2. Los contadores de Activos ignoraban el selector de sede.** Con "Concepción" elegido, la tabla decía "No se encontraron activos" mientras las tarjetas seguían mostrando "Total 1" y "Notebook 1" (el activo de Santiago). `/api/activos/stats` no leía el parámetro `sedeId` y el frontend lo llamaba en 4 lugares sin mandarlo ni re-pedirlo al cambiar de sede. Se agrega el filtro al endpoint (mismo criterio que `/api/activos`: solo se acepta para quien tiene visibilidad total) y en el frontend se centraliza en un helper `urlStats(sedeSeleccionada)`, con `sedeSeleccionada` en las dependencias del efecto.

**3. El Dashboard ignoraba el selector de sede.** Mismo síntoma, causa distinta: el Resumen es un server component y consulta la base en el servidor, donde no existe `localStorage`. La sede elegida ahora viaja además en una cookie (`SedeSeleccionadaProvider` la escribe junto con `localStorage`), que el Dashboard lee con `cookies()`. El setter llama a `router.refresh()` para que el server component se vuelva a renderizar al cambiar de sede. La cookie es solo un filtro de presentación, no una credencial: el backend sigue validando con la sesión (`sedeScope.ts`), así que una cookie manipulada no da acceso a nada nuevo.

**4. Exportar a Excel ignoraba el selector de sede.** El botón armaba el link sin `sedeId`, así que la pantalla mostraba una sede y el archivo descargado traía todas. Se agrega el parámetro al link y el soporte correspondiente en `/api/activos/exportar`.

**5. Textos de ayuda que contradecían el rediseño de visibilidad (SPEC 2.29).** Siete textos en cinco pantallas (Configuración > Sedes, Configuración > Usuarios, el modal de Kit/EPP, Compras > Nueva e Importar Activos) seguían diciendo que el técnico "está restringido a su propia sede" o que "hereda automáticamente la suya", cuando desde el 14-sep el técnico ve todas las sedes y elige la sede explícitamente al crear. Reescritos para describir lo que el sistema hace hoy.

**6. Guardar en una sede distinta a la filtrada parecía un error.** Al crear un artículo de Kit/EPP en Santiago con el menú filtrando por Concepción, se guardaba correctamente (201) pero desaparecía de la lista sin ningún mensaje -- el usuario asumía que había fallado y lo creaba de nuevo, duplicando stock. Ahora aparece un aviso que dice dónde quedó guardado y por qué no se ve en esa lista.

**7. El login revelaba qué correos existen.** Respondía "Usuario no encontrado o inactivo" para un correo inexistente y "Contraseña incorrecta" para uno real, lo que permite descubrir qué cuentas existen probando correos uno por uno (enumeración de usuarios). Ahora los tres casos (correo inexistente, cuenta desactivada, contraseña incorrecta) responden "Correo o contraseña incorrectos". El bloqueo por intentos fallidos sigue con su mensaje propio, y el registro interno de intentos no cambia.

**8. El detalle de Compras usaba `confirm()` y `alert()` del navegador.** Era la única pantalla que lo hacía: bloquean la ventana entera y no pueden mostrar el detalle por campo que el backend ya devuelve desde 2.37. Los 4 `alert()` pasan al cartel `<ApiErrorSummary>` en pantalla y los 2 `confirm()` a un modal propio, con el mismo formato que el modal de eliminar factura que ya existía en esa pantalla.

**9. El cartel de error mostraba el nombre interno del campo.** Decía "marca: Maximo 50 caracteres" en vez de "Marca: Máximo 50 caracteres". `<ApiErrorSummary>` ya aceptaba un `fieldLabels`, pero ningún formulario se lo pasaba; se agrega un diccionario base con los ~45 campos que se repiten en todo el sistema (que cada formulario puede pisar), con soporte para rutas anidadas de Zod (`kitItems.0.cantidad`). Además se corrigen 20 mensajes de `validations/asset.ts` que decían "Maximo" sin tilde.

**Dato confirmado durante la prueba:** los códigos reales de las sedes son `STGO` (Santiago), `CCP` (Concepción) y `PERU`. Queda pendiente decidir si se agregan Santiago y Concepción al `seed.ts` (ver la nota de la v1.41, que las dejó fuera justamente por no conocer sus códigos).


---

## 2.39 El correo de empresa pasa a ser el obligatorio; tipo de contrato opcional (15-sep-2026)

Pedido explícito de Javier, al revisar el modelo antes de importar el inventario real: *"el del correo tendría que ser al revés. El del correo personal, opcional, y el del correo de la empresa, obligatorio"*, y sobre el tipo de contrato: *"como no está en el Excel, lo que podríamos hacer es dejarlo opcional... si lo dejamos opcional, inserta de manera correcta los datos ahora y más adelante los técnicos tendrán que ingresarla"*.

**El problema:** el modelo pedía como obligatorio el `correoPersonal` y dejaba opcional el `correoEmpresa`, justo al revés de como son los datos reales. El consolidado de inventario de la empresa (y cualquier planilla de soporte) trae la cuenta corporativa, que es la que siempre existe y con la que TI identifica a cada persona; el correo particular no lo registró nadie. Lo mismo con `tipoContrato`, que era obligatorio y la planilla no lo trae: cumplirlo obligaba a inventar un valor para ~110 personas.

**Cambios** (migración `20260915000000_correo_empresa_obligatorio_y_contrato_opcional`):
- `Employee.correoEmpresa` pasa a `String @unique` (obligatorio); `Employee.correoPersonal` pasa a `String? @unique` (opcional). La migración incluye un paso de respaldo que completa el correo de empresa con el personal en las filas que ya existieran, para que el `NOT NULL` no falle en una base con empleados cargados.
- `Employee.tipoContrato` pasa a `TipoContrato?`. Es un campo que solo se usa como etiqueta y filtro en pantalla: no condiciona permisos ni ninguna regla de negocio.
- Se invierte cuál de los dos correos se valida y contra cuál se comprueba el duplicado, en el alta y la edición de empleados, y en los dos formularios de empleado que viven dentro de Solicitudes.
- Las dos rutas de importación masiva de activos, que crean empleados al vuelo, generan ahora el correo automático sobre `correoEmpresa` (misma estrategia anti-duplicado: `nombre@empresa.cl`, y si choca, `nombre.rut@empresa.cl`).
- Las ~10 pantallas que mostraban el correo como identificador de la persona (buscadores para asignar equipo, tarjetas, kanban, acta de entrega en PDF) muestran ahora `correoEmpresa ?? correoPersonal`, y las consultas que las alimentan piden ambos campos.

---

## 2.40 Correcciones y simplificaciones de la segunda pasada de QA (15-sep-2026)

Hallazgos de Javier probando el sistema a mano, y las decisiones de modelo que salieron de esa conversación.

**1. El onboarding ofrecía equipos y stock de todas las sedes.** Al ejecutar una solicitud de onboarding, el selector de equipos pedía `/api/activos?categoriaId=X&estado=disponible` sin mandar ninguna sede, y el catálogo de Kit/EPP hacía `fetch('/api/kit-items')` igual de abierto: eran 9 llamadas en 4 archivos. El técnico veía —y podía entregar— inventario de las tres sedes, y el descuento de Kit/EPP podía restar de la bodega equivocada. Ahora todas filtran por la **sede de la solicitud**, que es la correcta: no el selector del menú, que es solo un filtro de pantalla. Si el onboarding es de alguien de Concepción, se ofrece stock de Concepción aunque el menú esté en Santiago.

**2. Se elimina el estado `reutilizable`.** Observación de Javier mirando el Kanban: *"disponibles son todos los equipos que se pueden asignar. Y reutilizables son los equipos usados que también se pueden usar. O sea, no tiene lógica tener esos dos"*. Tenía razón, y además estaba causando un defecto: el formulario de asignación ya aceptaba ambos estados por igual (`ESTADOS_ASIGNABLES = ["disponible", "reutilizable"]`), pero las alertas de stock del Dashboard contaban **solo** los `disponible` — con diez notebooks devueltos y listos para entregar, el sistema igual avisaba "Sin Stock: Notebook". De fondo era el mismo error que Javier ya había detectado con el estado y la condición: `reutilizable` metía *cómo está el equipo* (usado) dentro de *en qué punto de su ciclo de vida está*, cuando eso ya lo dice el campo `condicion`. Migración `20260915010000_elimina_estado_reutilizable`: las filas pasan a `disponible` y se recrea el enum sin ese valor (Postgres no permite quitar un valor de un enum con `ALTER TYPE`). Devolver un equipo en buen estado ahora lo deja directo en `disponible`; dañado sigue yendo a `baja`. Los estados quedan en cinco: disponible, asignado, en mantención, baja, vendido.

**3. Se elimina el campo "Código Interno" del activo.** Pedido explícito: *"borrar campo código interno - no se usa"*. Se verificó que además no tiene datos de origen: la columna del consolidado llamada "ID-Interno" no contiene un código sino el estado del equipo (Activo/Baja/Disponible/Mantención). Los equipos se identifican por número de serie. Migración `20260915020000_elimina_codigo_interno_activo`.

**4. El nombre de red del equipo se pide al entregarlo, no al crearlo.** Observación de Javier: *"ese es un nombre de equipo que se coloca cuando se asigna a la persona, no al crear el activo"*. El campo sale del formulario de alta de activo (y del alta rápida dentro de Compras) y aparece en el formulario de asignación, donde **se propone solo** a partir de la persona que recibe el equipo. La convención se tomó de los datos reales: de 106 equipos con nombre en el consolidado, 98 siguen exactamente `SCL` + inicial del nombre + apellido paterno (`SCL-CROJAS`, `SCL-ALEIVA`); las excepciones son choques de apellido, donde se agrega la inicial del materno — por eso el campo queda editable en vez de calcularse solo. Sigue siendo opcional y editable después desde la ficha del activo, que es por donde entran los 121 nombres que trae el Excel.

**5. Los 14 `alert()` y `confirm()` nativos que quedaban.** Pedido explícito: *"cambiar los alerts por mensajes con estilo"*. Repartidos en 7 pantallas (Activos, Compras, Guías de Despacho, Kit/EPP, Tipos de Mantención, Usuarios y Categorías). Todos pasan al cartel `<ApiErrorSummary>` en pantalla y al modal de confirmación propio, con textos que explican la consecuencia real de la acción en vez de "¿Está seguro?".

**Queda pendiente de decisión:** la pantalla de venta aceptaba activos en estado `baja` **o** `reutilizable`; al desaparecer el segundo quedó aceptando solo `baja`, que es lo conservador. Falta confirmar con la empresa si se venden equipos usados que aún funcionan sin darlos de baja antes.


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

## 2.41 La devolución deja de ser una acción suelta, y limpieza de la ficha del empleado (15-sep-2026)

Tercera pasada de QA de Javier, ya con el sistema corriendo. Todo lo de esta sección viene de una misma idea suya, dicha primero como regla de negocio y después aplicada pantalla por pantalla.

**1. Una devolución solo ocurre dentro de un proceso.** Palabras de Javier: *"en asignaciones la unica manera de devolver un equipo es dando de baja a una persona o cambiando su equipo"*. Hasta ahora había un botón "Registrar Devolución" suelto en tres lugares — la flecha de la tabla de Asignaciones, el botón del detalle de la asignación, y cuatro botones "Devolver" en la ficha del empleado — que permitían devolver un equipo sin que existiera una desvinculación ni un cambio de equipo detrás. Eso deja devoluciones sin causa registrada: el equipo vuelve a `disponible` y no queda rastro de por qué dejó de estar con esa persona. Se quitan los seis puntos de entrada. La devolución se sigue ejecutando exactamente igual, pero solo desde el flujo de Solicitudes (desvinculación o cambio de equipo), que es donde sí queda el motivo, el documento y la transición.

**2. Se elimina el acta de entrega por asignación.** Pedido explícito: *"el tema de crear esa acta con ese formato, bórralo. No se va a usar. Ya que ya lo tenemos en solicitudes"*. Era un segundo generador de documentos, hecho con jsPDF en vez de las plantillas React-PDF del resto del sistema, que producía un formato distinto para el mismo hecho. No deja hueco: Solicitudes ya genera los tres documentos del proceso (`generateAnexoEntrega`, `generateComprobanteCambio`, `generateActaDevolucion`). La ruta `/api/asignaciones/[id]/acta` queda como stub 410 con el mensaje que explica dónde está ahora, mismo criterio que se usó con Proveedores en 2.35.

**3. La flecha de volver del detalle de asignación no llevaba a ninguna parte.** Apuntaba a `/asignaciones`, que no existe como página; el listado real es `/activos/asignaciones`. Corregido en los dos lugares donde aparecía.

**4. Microsoft 365 en la ficha del empleado mostraba un Sí/No.** Pedido de Javier: *"la idea es que la licencia, más que un booleano, salga el texto que indica el tipo de licencia"*. El dato ya existía en el modelo (`tipoLicenciaMicrosoft365`, SPEC 2.23) y ya salía en la exportación a Excel, pero la API de la ficha no lo devolvía. Ahora la ficha muestra el nombre del plan; el Sí/No solo se usa como respaldo cuando hay licencia marcada pero sin plan registrado.

**5. Las tarjetas de Kit de Bienvenida y EPP mostraban la fecha de entrega.** Razón de Javier para sacarla: *"eso se entrega el día que viene, que se coordina la entrega de equipo, así que no es necesario ese dato ahí"*. La fecha no aporta nada en esa vista porque coincide siempre con la entrega del equipo. Queda solo el estado (Entregado / Pendiente). **Corrección del mismo día:** la "Próxima Mantención" del EPP, que en un primer momento se dejó por ser la única fecha que "dice cuándo hay que hacer algo", también se sacó a pedido de Javier -- la ficha del empleado queda mostrando solo el estado en ambas tarjetas, sin ninguna fecha.

**6. Se elimina también la página suelta `/asignaciones/devolucion`.** Al revisar el punto 1, quedaban tres accesos más que llevaban a la misma pantalla de devolución directa sin pasar por Solicitudes: el drag del Kanban de Activos (arrastrar un equipo asignado a "Disponible" o "Baja"), y el aviso de "tiene una asignación activa" al intentar dar de baja un activo (frontend y backend). Los tres ahora redirigen a `/solicitudes/nueva`, mismo criterio que ya usaba el propio Kanban para el drag de "entregar" (`disponible → asignado`). La página se elimina (no queda stub porque no tenía URL pública documentada ni enlaces externos, a diferencia del acta y el reporte RRHH).

**7. Se elimina la dependencia `jspdf` / `jspdf-autotable` del `package.json`.** Javier lo pidió (*"conviene sacar la dependencia ya que solo estamos usando la de solicitudes"*). El único uso que quedaba era `/api/desvinculaciones/[id]/reporte-rrhh` (reporte RRHH en PDF de una desvinculación, botón en su detalle), que no tiene plantilla React-PDF equivalente todavía. Ese reporte también queda como stub 410 -- Javier decidió sacarlo ahora en vez de mantener la dependencia solo para esa ruta (*"borralo ya no sera necesario"*). Se elimina también `ReturnAssetModal.tsx`, componente que había quedado sin ningún lugar que lo usara tras el punto 1.


---

## 2.42 La coordinación de fecha/medio/lugar se fusiona con la asignación del equipo (15-sep-2026)

Pedido de Javier probando Solicitudes: *"el tema de coordinar fecha... dejarlo para definirlo al inicio también cuando se asigna el equipo, para así hacemos todo de una en vez de varios pasos"*, confirmado para los tres tipos de solicitud, no solo onboarding.

**El problema.** Los tres flujos (Onboarding, Cambio de Equipo, Desvinculación) tenían una etapa de workflow dedicada solo a coordinar fecha, medio (presencial u OT de despacho) y lugar de entrega/cambio/devolución, **separada** del paso en el que se elegía o ejecutaba el equipo:

- Onboarding: `gestion_ti` (elegir/entregar equipos) → `coordinando_entrega` (fecha/medio/lugar) → `equipos_entregados`.
- Cambio de equipo: `incidencia_detectada` (fecha/medio/lugar) → `coordinando_cambio` → `cambio_ejecutado` (elegir equipo nuevo y devolver el viejo).
- Desvinculación: `solicitud_emitida` (fecha/medio/lugar) → `coordinacion_en_curso` → `equipo_recibido` (calificar cada equipo devuelto).

Eso obligaba a un click y una pantalla extra por ticket, sin que la fecha dependiera de nada que se supiera recién en el paso siguiente.

**La solución.** Se elimina la etapa de coordinación como estado propio en los tres flujos; los campos de fecha/medio/lugar se piden en la misma pantalla y se guardan en la misma transición que ya asignaba/ejecutaba el equipo:

- Onboarding: `gestion_ti → equipos_entregados` directo. La tarjeta "Gestión TI" pasa a incluir el formulario de fecha/medio/lugar una vez cubiertas todas las categorías requeridas, con un solo botón para cerrar la etapa.
- Cambio de equipo: `incidencia_detectada → cambio_ejecutado` directo. La misma tarjeta que hoy elige el equipo nuevo (`SeleccionarCambioEquipo`) ahora también pide fecha/medio/lugar arriba, y el botón que ya ejecutaba el cambio manda todo junto.
- Desvinculación: `solicitud_emitida → equipo_recibido` directo. La tarjeta "Recibir Equipos" pasa a incluir fecha/medio/lugar además de la calificación de cada equipo/EPP devuelto.

Los campos en sí (`fechaEntregaCoordinada`, `medioEntrega`, `lugarEntrega`, `otChilexpressEntrega`, `ciudadEntrega` y sus equivalentes para cambio/devolución) no cambiaron -- siguen siendo las mismas columnas de `WorkflowRequest` de SPEC 2.5.2 regla 9. Lo único que cambió es en qué transición se piden.

**Estados eliminados del enum `EstadoSolicitud`:** `coordinando_entrega`, `coordinando_cambio`, `coordinacion_en_curso`. Postgres no permite quitar valores de un enum con `ALTER TYPE`, así que la migración (`20260915030000_fusiona_coordinacion_con_asignacion`) recrea el tipo, igual que se hizo con `reutilizable` en 2.40: las solicitudes de prueba que estuvieran en alguno de esos tres estados retroceden al estado anterior (el que ahora asume también la coordinación), y el historial de transiciones (`WorkflowTransition`, que sí conserva registros con esos valores) se remapea de la misma forma solo para que la conversión de columna no falle -- el texto de cada transición pasada no se reescribe.

**Un efecto colateral corregido de paso:** `POST /api/solicitudes` (crear una solicitud de onboarding con equipos ya elegidos al momento de crear el ticket) saltaba directo a `coordinando_entrega` si esos equipos ya cubrían todas las categorías requeridas. Como esa etapa ya no existe, ahora ese caso también arranca en `gestion_ti` -- que es exactamente donde, con este cambio, se termina pidiendo la fecha/medio/lugar.


## 2.42.1 La coordinación también se puede completar al crear el ticket, no solo después (15-sep-2026)

Javier, probando la 2.42 con un onboarding real: *"pero se supone que eso me debería salir solamente en las nuevas solicitudes, porque tengo una creada que aún me pide la fecha"*. Al aclarar, el pedido real era otro: *"yo quería que eso se ingresara al inicio cuando se crea la solicitud y asigno equipos"* -- no que la fecha se pida en Gestión TI (como quedó en 2.42), sino en el mismo formulario de "Nueva Solicitud", en el momento en que ya se están eligiendo los equipos, para no tener que volver a abrir el ticket después. Confirmado para los tres flujos.

**La solución.** `/solicitudes/nueva` gana los mismos campos de fecha/medio/lugar de la 2.42, mostrados justo debajo de la selección de equipo de cada flujo:

- Onboarding: aparecen en cuanto se reserva al menos un equipo en "Equipos Requeridos". Si al enviar el formulario esos equipos cubren **todas** las categorías requeridas, el ticket nace directo en `equipos_entregados` (se salta Gestión TI por completo). Si falta alguna categoría, los datos igual se guardan -- Gestión TI, al completar lo que falta, ya no vuelve a pedirlos (quedan precargados desde `WorkflowRequest`).
- Cambio de equipo: aparecen en cuanto se completa la selección de equipo viejo + nuevo (`SeleccionarCambioEquipo`, modo embebido). El ticket ya nacía en `confirmacion_rrhh` de inmediato en ese caso; ahora además queda con la coordinación guardada desde el principio.
- Desvinculación: se agregan `fechaDevolucionCoordinada` y "Lugar de devolución" junto a los campos de devolución que ya existían ahí (`medioDevolucion`, `otChilexpress`, `ciudadDevolucion` -- SPEC 2.5.2 regla 9, sin cambios).

No se agregaron campos nuevos a `WorkflowRequest`: son exactamente las mismas columnas de la 2.42, ahora aceptadas también por `POST /api/solicitudes` (antes solo la transición las guardaba). El caso de la 2.42 sigue intacto para cuando NO se coordina al crear (p.ej. onboarding con categorías sin equipo todavía, a la espera de stock): ahí la coordinación se sigue pidiendo en Gestión TI, exactamente como quedó en 2.42.

**Sobre el ticket de prueba que Javier vio pidiendo la fecha:** era el mismo caso de siempre -- se creó con equipos elegidos pero sin este cambio todavía, así que entró a Gestión TI (2.42) a esperar la coordinación ahí. No es un bug: los tickets nuevos, creados después de este cambio, ya no necesitan ese paso si se coordina la entrega de una vez al crearlos.

## 2.43 Desvincular deja de ser una edición del empleado (16-sep-2026)

Javier, probando el módulo Personal: *"al editar los datos de empleado sale el botón de desvincular, este botón se debe sacar"*. Al preguntarle por el atajo equivalente que había más abajo en el mismo formulario, confirmó: *"si sacar eso y también el formulario de kit de bienvenida y epp"*.

**El problema.** El formulario de editar empleado (`/empleados/[id]/editar`) permitía desvincular por dos caminos, ninguno de los cuales pasaba por una Solicitud:

1. Un botón rojo "Desvincular" en el encabezado, que llamaba a `DELETE /api/empleados/[id]` -- un *soft delete* que dejaba al empleado en estado `desvinculado`.
2. El desplegable "Estado", que ofrecía `Desvinculado` como una opción más, junto a Activo y En Licencia.

Es la misma clase de agujero que SPEC 2.41 cerró para las devoluciones: una desvinculación no es un cambio de dato, es un proceso -- hay equipos que devolver, un estado en que vuelven y un motivo que registrar. Hacerlo desde el formulario dejaba al empleado marcado como desvinculado sin nada de eso. El `DELETE` al menos se negaba si el empleado tenía equipos activos, pero el desplegable ni eso: guardaba el estado sin mirar.

**La solución.** Se saca el botón (con su modal de confirmación y su `handleDelete`) y se saca `Desvinculado` del desplegable, que queda en Activo / En Licencia. `PUT /api/empleados/[id]` rechaza ahora el *cambio* a `desvinculado` con un 400 que apunta a `/solicitudes/nueva`, y `DELETE /api/empleados/[id]` queda como stub 410 (mismo criterio que proveedores en 2.35 y el acta de asignación en 2.41: la ruta se retiró a propósito, no es un 404 de ruteo). La Solicitud de desvinculación no se ve afectada -- actualiza al empleado con Prisma dentro de la misma transacción que procesa las devoluciones, no a través de esta ruta.

Un empleado que **ya** está desvinculado se sigue pudiendo editar: en ese caso el campo Estado se muestra de solo lectura, con la nota de que se reincorpora creando un onboarding. Sin eso, al haber sacado la opción del desplegable, guardar cualquier otro cambio lo habría devuelto a "activo" sin que nadie lo pidiera. El guard del backend distingue lo mismo: rechaza la transición a desvinculado, no el hecho de que el empleado ya lo esté.

**Kit de Bienvenida y EPP.** Se saca también del formulario esa sección completa (Fecha Entrega Kit de Bienvenida, Fecha Entrega EPP, Próxima Mantención EPP) y los tres campos dejan de escribirse desde `PUT /api/empleados/[id]`. Eran tres fechas sueltas escritas a mano, sin relación con las entregas reales: una entrega hecha desde una Solicitud crea un `KitAssignment` y descuenta stock, pero nunca tocaba esas fechas.

Eso destapó un defecto que ya existía: `GET /api/empleados/[id]/ficha` calculaba `kitEntregado`/`eppEntregado` **desde esas fechas**, así que las tarjetas Kit/EPP de la ficha decían "Pendiente" aunque el kit se hubiera entregado de verdad desde una Solicitud -- solo se ponían en "Entregado" si alguien escribía la fecha a mano. Ahora se deducen de los `KitAssignment` del empleado (`estado: 'entregado'`, separados por `item.categoria`), que es donde la entrega real queda registrada. La ficha ya consultaba esa relación; solo no la usaba para esto. De paso, la respuesta deja de mandar `fechaEntrega`/`proximaMantencion` en esas dos tarjetas, que el frontend ya no muestra desde 2.41.

**Sin migración.** Las columnas `fechaEntregaKit`, `fechaEntregaEpp` y `proximaMantencionEpp` de `Employee` quedan en la base pero ya nadie las lee ni las escribe (siguen aceptadas en `employee.ts` por las validaciones de crear/actualizar, sin efecto). Se dejan a propósito para no meter una migración en medio de las pruebas manuales; quedan pendientes de eliminar junto con sus campos de validación cuando Javier lo decida.

---

## 2.44 Orden visual y consistencia en el formulario de Desvinculación (16-sep-2026)

Javier, probando la Desvinculación de Valentina Cárdenas (caso 3 de la nueva coordinación al crear, SPEC 2.42.1): *"hay dos errores, primero hay que usar algo tipo hr para separar las cosas en el formulario separando coordinar devolucion, además solo deben haber dos metodo de devolucion chilexpress y presencial se coloca lugar de ubicacion y fecha y hora de devolucion, si es chilexpress el ot, la ubicacion destino y la fecha estimada de llegada, sale el campo sede pero como es de un empleado ya asignado a una sede este campo deberia estar marcado automaticamente"*.

Tres correcciones puntuales al formulario de creación (`/solicitudes/nueva`, tipo Desvinculación):

1. **Separación visual.** La coordinación de devolución (medio/fecha/lugar) vivía mezclada, en la misma grilla de 2 columnas, con "Fecha Desvinculación". Ahora queda en su propia tarjeta, separada con un `<hr>` y el título "Coordinar Devolución" -- mismo criterio de agrupar que ya usan Onboarding y Cambio de Equipo (SPEC 2.42.1), donde la coordinación vive en su propio bloque dentro de la tarjeta del equipo.
2. **Dos medios, no tres.** "Medio de Devolución" era un `<select>` con Presencial / Chilexpress / **Otro Courier** -- el tercero no tenía campos propios (compartía "Ubicación" con Chilexpress) y quedaba fuera del patrón presencial-o-despacho de los otros dos flujos. Se saca, y el campo pasa a ser un radio (Presencial / Despacho Chilexpress) igual que en Onboarding y Cambio de Equipo. Con eso, "Ubicación" -- que antes se mostraba siempre, sin relación con el medio elegido -- ahora es exclusiva de Chilexpress ("Ubicación de destino"), y ya no compite con "Lugar de devolución" (exclusivo de Presencial, agregado en 2.42.1).
3. **Sede automática.** El selector de Sede, en este formulario, decide a qué sede queda ligada la solicitud -- tiene sentido para Cambio de Equipo (que lo comparte) y para Onboarding, donde recién se está definiendo. Pero en Desvinculación el empleado **ya pertenece** a una sede, así que dejarla editable permitía armar, por descuido, un ticket con una sede distinta a la del empleado. Ahora se fija sola al elegir al empleado (misma sede que tiene registrada) y se muestra de solo lectura. Cambio de Equipo, que comparte el mismo bloque de Sede en el código, no se tocó -- Javier no pidió cambiar ese flujo y ahí sí tiene sentido que sea elegible (puede haber traslados en curso).

Sin cambios de modelo ni de validaciones del backend -- son ajustes de formulario. `medioDevolucion` sigue siendo texto libre en el schema (`z.string()`, no un enum), como ya era desde antes de este cambio; solo la UI deja de ofrecer un tercer valor.

---

## 2.45 Elegir el equipo a cambiar deja de ser opcional (16-sep-2026)

Javier, probando Cambio de Equipo, encontró el mismo problema que 2.44 ya había corregido en Desvinculación (la sede editable de un empleado que ya pertenece a una) y pidió, además: *"hay que implementar validaciones como si no hay un equipo disponible para cambiar simplemente no permite realizar el cambio y que si o si se deba elegir un equipo para cambiar para crear la solicitud por eso borra el mensaje que dice: Equipo a cambiar (opcional -- si no lo eliges ahora, se hace después)"*.

**Sede.** Mismo fix que 2.44, extendido a Cambio de Equipo: al elegir al empleado, la Sede se fija sola a la suya y queda de solo lectura. Antes solo se había corregido en Desvinculación porque Javier no había pedido tocar Cambio de Equipo en ese momento; con este pedido, la razón (el empleado ya pertenece a una sede, no tiene sentido dejarla elegible aparte) aplica igual.

**Equipo a cambiar, obligatorio.** Antes, el equipo viejo + su estado + el reemplazo eran opcionales al crear el ticket: si no se completaban, la solicitud nacía en `incidencia_detectada` para resolverse después desde el detalle. Ahora hacen falta los tres para poder crear la solicitud -- se saca el mensaje "(opcional -- si no lo eliges ahora, se hace después)" y `handleSubmit` bloquea el envío si `cambioSeleccion` no está completo. La validación se refuerza también en el backend: `oldAssignmentId`, `newAssetId` y `estadoDevolucionAnterior` pasan de opcionales a obligatorios en `cambioEquipoFields` (el superRefine que exigía "si viene alguno, deben venir los tres" queda redundante y se saca).

Consecuencia directa, que es justo lo pedido: si no hay equipo de reemplazo disponible en el inventario de la sede, `SeleccionarCambioEquipo` ya avisaba "No hay equipo disponible de X" -- ahora, al ser obligatorio completar la selección, esa falta de stock bloquea la creación de la solicitud completa, no solo el cambio. Se agrega una línea al aviso ("No podrás crear la solicitud hasta que haya stock") cuando el componente se usa embebido en el formulario de creación.

El estado inicial `incidencia_detectada` de `TipoSolicitud.cambio_equipo` no se eliminó -- las transiciones manuales que ya usaba (para tickets creados antes de este cambio) siguen funcionando igual desde el detalle. Lo que cambia es que, de ahora en adelante, ningún ticket nuevo nace ahí: siempre llega ya con el cambio ejecutado (`confirmacion_rrhh`), porque el equipo es obligatorio desde la creación.

---

## 2.46 Coordinar el cambio deja de depender de completar la selección de equipo (16-sep-2026)

Javier, probando Cambio de Equipo tras 2.45: *"En el cambio de equipo también falta especificar, básicamente coordinar el cambio. Si va a ser presencial, lo mismo que con entrega o devolución, pero en este caso para cambio. Y la idea es que también se hagan el mismo formulario."*

La tarjeta "Coordinar Entrega del Reemplazo" (fecha/medio/lugar u OT+ciudad) ya existía desde 2.42.1, pero solo se mostraba una vez completada la selección del equipo (`cambioSeleccion`: equipo viejo + su estado + reemplazo elegidos) -- a diferencia de Onboarding y Desvinculación, donde la coordinación se muestra siempre, apenas se elige al empleado. Si en la sede de prueba no había stock de reemplazo disponible, `cambioSeleccion` nunca llegaba a completarse y la tarjeta de coordinación no aparecía nunca, lo que la hacía parecer inexistente.

Se saca esa dependencia: la tarjeta de coordinación ahora se muestra siempre que hay un empleado seleccionado (igual que en los otros dos flujos), separada con `<hr>` + `<h4>` en vez del `<h3>` suelto que tenía -- mismo patrón visual que "Coordinar Devolución" (2.44). Sin cambios de validación ni de modelo: `handleSubmit` seguía (y sigue) exigiendo `cambioSeleccion` completo antes de llegar a chequear los campos de coordinación, así que el comportamiento de creación de la solicitud no cambia, solo la visibilidad del formulario.

---

## 2.47 Documentos disponibles en los tres procesos (16-sep-2026)

Javier: *"cierto que cada proceso genera una plantilla. Ya, por lo que veo, solo esa plantilla solo está en un boarding. Eso debería estar en los tres procesos, onboarding, offboarding y cambio de equipo."*

Los cuatro documentos PDF (Anexo/Comprobante de Entrega, Comprobante de Cambio, Acta de Devolución) ya existían en el backend desde antes -- `documentGeneratorService.ts` y la ruta `GET /api/solicitudes/[id]/documento/[tipo]` los generaban los cuatro sin problema. Lo que faltaba era el botón: el detalle del ticket (`/solicitudes/[id]`) solo tenía el link de descarga ("Generar plantilla") en la tarjeta de cierre de Onboarding -- Offboarding y Cambio de Equipo no tenían ningún lugar en la pantalla desde donde pedir su comprobante.

Se junta en una sola tarjeta "Documentos", independiente de la máquina de estados (antes el botón vivía pegado al paso previo a cerrar el ticket; para Cambio de Equipo, que desde SPEC 2.45 se ejecuta y cierra de inmediato al crearse, no existe ese "paso previo" al que engancharse). Aparece apenas el equipo ya se entregó/devolvió/cambió (`equipos_entregados`/`equipo_recibido`/`cambio_ejecutado`, o sus estados de cierre), y se mantiene visible después de cerrado el ticket por si hay que volver a descargar el documento.

El mismo hueco existía también en el listado (`/solicitudes`): el ícono de descarga directa en la tabla, sin entrar al detalle, tenía el mismo comentario "por ahora solo onboarding" y el mismo criterio pendiente de extender. Se corrige con el mismo mapeo tipo→documento y el mismo criterio de "listo para descargar" que la tarjeta del detalle.

---

## 2.48 Estado del cargador al devolver, extendido a los tres procesos (16-sep-2026)

Javier: *"cuando se cambia un equipo, o sea, en este caso en específico, cuando se cambia un notebook, normalmente también se pregunta el estado del cargador. Y eso también se imprime en la plantilla. Así que siempre que se elige un notebook, habría que hacer que se ingrese el cargador."* Al preguntarle en qué momentos y con qué formato: *"en los 3 procesos"*, con las mismas opciones que ya se usan para calificar el equipo mismo (Ok/Dañado/No aplica al entregar, Ok/Dañado/No aplica al devolver).

Investigando, esto ya estaba parcialmente construido: el modelo `Assignment` tiene `condicionCargadorEntrega`, `condicionCargadorDevolucion` y `observacionesCargador` desde antes (regla 9 de SPEC 2.5.3), y Onboarding ya pedía el cargador al entregar equipos desde la pantalla de Gestión TI (`SeleccionarEquiposOnboarding.tsx`). Pero la regla decía explícitamente *"se implementa primero en onboarding (entrega); cambio_equipo y offboarding quedan pendientes"* -- y ni siquiera el lado de la **devolución** estaba conectado en ningún flujo: `executeReturn()` no tenía parámetro para el cargador, así que `condicionCargadorDevolucion` nunca se escribía, para ningún proceso.

Se completa el patrón en las tres direcciones que faltaban:

1. **`executeReturn()`** (workflowExecutionService.ts) acepta ahora `condicionCargadorDevolucion`/`observacionesCargador`, y los guarda solo si el activo es un notebook con `tieneCargador` (igual criterio que `executeAssignment`).
2. **Offboarding:** se pide el estado del cargador junto a la calificación de cada equipo devuelto (Buen estado/Dañado/No devolvió), tanto al crear el ticket con los equipos ya en mano (`/solicitudes/nueva`) como en el paso "Recibir Equipos" del detalle.
3. **Cambio de Equipo:** `SeleccionarCambioEquipo.tsx` (compartido entre creación y detalle) pide el cargador del equipo que se devuelve *y* del equipo de reemplazo, cada uno solo si ese equipo puntual tiene cargador.
4. **Onboarding, al crear el ticket:** la selección de equipos en `/solicitudes/nueva` (que hasta ahora solo mandaba `assetIdsSeleccionados`, una lista plana de ids) también pide el cargador por equipo reservado -- antes solo se pedía en Gestión TI, un paso posterior; ahora se puede completar desde el inicio, igual que el resto de los datos (SPEC 2.42.1).
5. **En las plantillas:** el Comprobante de Entrega (que debe ser fiel al formato de la herramienta externa, sin columnas nuevas) suma el dato como una línea más de la descripción del equipo ("Cargador: Ok"); el Acta de Devolución y el Comprobante de Cambio, que no tienen esa restricción, suman una columna "Cargador" a su tabla.

El campo sigue siendo puramente informativo -- no cambia el estado ni la condición del Activo, ni gatilla baja, igual que ya establecía la regla 9. El Anexo de Entrega (`AnexoEntregaTemplate`/`generateAnexoEntrega`) no se tocó: es una plantilla que ya estaba sin ningún botón que la generara desde la interfaz (huérfana), fuera del alcance de este pedido.

---

## 2.49 Mismo formato visual en los tres documentos (16-sep-2026)

Javier: *"todas las solicitudes deben seguir el mismo formato que tiene los de onboarding"*. Al confirmar el alcance: mismo diseño visual completo -- logo, colores, tipografía y tabla, no solo la redacción.

El Comprobante de Entrega (onboarding) tenía un diseño propio -- logo SCL, paleta de colores, badges "SAP Partner"/"UiPath", tabla con bordes finos -- fiel a como lo pedía Javier desde que se implementó (debía calzar con la herramienta externa que reemplazó). El Acta de Devolución y el Comprobante de Cambio, en cambio, usaban el estilo genérico de `pdfStyles.ts`: sin logo, encabezado de texto plano, tabla con header azul sólido. Quedaban visualmente como dos sistemas de documentos distintos.

Se extrae el logo, los colores y el estilo de tabla del Comprobante de Entrega a un módulo nuevo, `pdfSclBrand.tsx` (componente `LogoSCL` + estilos `sclStyles`), y se reescriben las otras dos plantillas sobre esa misma base: mismo encabezado con el logo, mismo título centrado, misma redacción de intro ("A través del presente con fecha..."), misma tabla de 4 columnas (Equipo / Marca / Descripción de equipo / Estado) y mismas firmas. El Comprobante de Entrega no cambió visualmente -- solo pasó a importar los estilos desde el módulo compartido en vez de tenerlos duplicados.

La columna "Descripción de equipo" se usa distinto según el documento, a propósito: en la entrega (onboarding) sigue mostrando las especificaciones técnicas del equipo nuevo (procesador, RAM, etc. -- lo que ya tenía). En devolución y cambio, donde lo que importa es identificar el equipo físico concreto que se devuelve, muestra modelo y N° de serie. En ambos casos, si el equipo es un notebook con cargador, se agrega "Cargador: Ok/Dañado/No aplica" al final de la descripción (SPEC 2.48) -- se descarta el enfoque de columna aparte para Cargador que se había probado primero, porque el formato de la herramienta externa no tiene esa columna.

---

## 2.50 Bug: equipo devuelto vacío en Comprobante de Cambio, y firma sin correo (16-sep-2026)

Javier, probando el Comprobante de Cambio: *"no sale la información del equipo devuelto. También en gestión realizada la idea es que solamente salga el nombre del usuario. No es necesario que salga el correo entre paréntesis."*

**Equipo devuelto vacío.** `generateComprobanteCambio` buscaba el equipo anterior leyendo `datosAccion.oldAssignmentId` de la transición histórica `cambio_ejecutado` -- eso solo existe para tickets ejecutados manualmente desde el detalle (`incidencia_detectada` → `cambio_ejecutado`). Desde SPEC 2.45, un ticket creado con el equipo ya elegido se ejecuta y cierra de inmediato al crearse, sin pasar nunca por esa transición -- así que para todo ticket nuevo `datosAccion` venía vacío y "Equipo devuelto (anterior)" salía en blanco. Se corrige leyendo directamente `WorkflowRequest.assignmentIds`, que en los dos caminos de ejecución (creación directa y transición manual) guarda `[oldAssignmentId, newAssignmentId]` en ese orden -- sin depender del historial de transiciones.

**Firma con correo.** El Comprobante de Cambio y el Acta de Devolución firmaban "Gestión realizada por: Nombre (correo@...)" -- el Comprobante de Entrega, en cambio, ya firmaba solo con el nombre, a pedido explícito de Javier desde que se implementó. Se uniforman los tres (y de paso el Anexo de Entrega, que aunque no tiene botón que lo genere, usa el mismo helper) para firmar solo con el nombre. Se elimina `nombreConCorreo()`, que quedó sin uso.

---

## 2.51 Filtro de período en las tarjetas de Mantenciones (16-sep-2026)

Javier, probando el módulo de Mantenciones: *"Las tarjetas de mantenciones también [siguen el mismo formato]. Sin embargo, me gustaría cambiar dos tarjetas en particular. La tarjeta que dice próximas mantenciones y mantenciones completadas. Por defecto están por mes. Sin embargo, pienso que sería mejor una buena idea colocar como un filtro donde pueda indicar, por ejemplo, el día, semana, mes, trimestre, seis meses y el año. Pienso que sería un buen filtro, en vez de algo estático."*

Las tarjetas "Próximas" y "Completadas" tenían una ventana fija: "Próximas (30 días)" y "Completadas (mes)". Primer intento: un selector de período en cada tarjeta -- Javier corrigió el lugar: *"la idea es que el filtro esté con los demás filtros, no en la tarjeta... y ya poniendo ese filtro del día, se va adaptando las tarjetas"*. Queda como un solo selector (Día / Semana / Mes / Trimestre / 6 meses / Año) en la barra de filtros de arriba, junto a Tipo y Estado, que controla las dos tarjetas a la vez -- no dos filtros independientes.

De paso, revisando el endpoint (`GET /api/mantenciones/pendientes`), aparecieron dos bugs preexistentes que se corrigen de encargo:

1. **"Completadas (mes)" nunca tuvo ventana de tiempo real.** El número salía de `porEstado`, un conteo agrupado por estado sin ningún filtro de fecha -- contaba **todas** las mantenciones completadas desde siempre, aunque la tarjeta dijera "(mes)". Se agrega un conteo propio, acotado por `fechaRealizada` dentro del período elegido.
2. **La ruta no respetaba el selector de sede del nav.** A diferencia de `/api/mantenciones` (el listado), `pendientes` no leía ningún `sedeId` de la URL -- las cuatro tarjetas no cambiaban al elegir otra sede en el menú. Se agrega el mismo patrón que ya usa el listado (`sedeId` solo se aplica si la sesión tiene visibilidad total).

### 2.51.3 El calendario de Mantenciones también respeta el selector de sede (18-sep-2026)

Al revisar qué otras pantallas ignoraban el selector del nav apareció `/mantenciones/calendario`: llamaba a `GET /api/mantenciones` con `fechaDesde`, `fechaHasta` y `limit`, sin `sedeId`. Como `sedeWhere()` no restringe a admin ni a técnico (SPEC 2.29), eso significaba mostrar las mantenciones de todas las sedes sin importar el menú -- era la última pantalla del módulo que no lo miraba. Se le pasa `sedeId` y se recarga al cambiar de sede, igual que el listado y las tarjetas.

---

## 2.52 Programar Mantención: el punto de entrada pasa a ser el equipo, no el empleado (18-sep-2026)

Javier, probando el módulo de Mantenciones: *"de hecho, las mantenciones solo se pueden hacer por empleados. Cosa que está bien, pero yo diría que lo mejor podría ser, eh, debería estar las dos opciones. Seleccionar el empleado y su equipo y otra solamente el equipo. ¿Qué opinas de eso?"* Repensándolo después: *"nos estamos guiando por el empleado, cosa que no debería ser así, ya que en sí el activo principal de este programa es el activo, o sea, los equipos. Yo diría que se debería buscar por equipo y no por empleado, para empezar."*

El modelo `Maintenance` nunca tuvo `employeeId` -- se guarda solo por `assetId`, así que el backend ya soportaba programar una mantención sobre cualquier equipo sin pasar por un empleado. La limitación era puramente del wizard `/mantenciones/programar`: su Paso 1 exigía elegir primero un empleado para ver solo sus activos asignados, dejando fuera los equipos en bodega o sin asignar.

Se reemplaza ese Paso 1 por un buscador de equipos directo (mismo patrón que `SelectorActivos` de Guías de Despacho): campo de texto por marca/modelo/serie/empleado asignado, más un filtro de categoría, sobre el listado completo de inventario (`GET /api/activos?limit=500`, sin filtro de estado -- un equipo disponible, asignado o incluso en mantención previa debe poder encontrarse ahí). Si el equipo tiene un empleado asignado, se muestra como dato informativo en la fila y en el resumen de los pasos 2 y 3, pero ya no es el punto de entrada ni un paso separado. El flujo por `?activoId=` (usado desde la ficha de un activo) no cambió.

Pedido explícito de Javier, con corrección posterior del propio Javier sobre el diseño (single-mode por activo, no dos modos con empleado como alternativa).

### 2.52.1 Fix: el buscador de equipos no respetaba la sede del nav (18-sep-2026)

Javier probando el cambio anterior: *"Nos falta la opción de sede. Porque si no, vamos a ver todos los activos. Tengo dos opciones: agregar otro filtro indicando la sede, o que lo tome de manera automática con el selector que tenemos para todo."* Se optó por la segunda: se conecta `useSedeSeleccionada()` (el selector del nav) al buscador de equipos, igual que ya hacen Activos, Mantenciones (listado), Solicitudes, Asignaciones y Kit/EPP -- ninguna de esas pantallas tiene un filtro de sede propio, solo Guías de Despacho, donde la sede es un dato del documento y no un filtro de lista. `fetchAssets()` ahora manda `sedeId` a `GET /api/activos` cuando hay una sede elegida, y se re-ejecuta cada vez que el selector cambia.

---

## 2.51.1 Fix: el filtro de período (2.51) solo acotaba las tarjetas, no la tabla (18-sep-2026)

Javier, probando Mantenciones: *"Si, por ejemplo, aprieto día, me salen las mantenciones de cualquier fecha. Semana también. Por lo que veo, solamente le está aplicando este filtro a las tarjetas. Cosa que debería hacer a todo, a todo el módulo mantenciones."* Correcto: el selector de período (SPEC 2.51) solo viajaba a `GET /api/mantenciones/pendientes` (las tarjetas "Próximas"/"Completadas"); el listado de abajo (`GET /api/mantenciones`) no lo recibía y seguía mostrando todas las mantenciones sin ninguna ventana de tiempo.

Se extiende `GET /api/mantenciones` con los mismos parámetros `dias`/`diasCompletadas` que ya acepta `/pendientes`, aplicando la misma lógica: vencidas y en proceso se listan siempre, sin ventana (una vencida sigue siendo relevante sin importar hace cuánto venció, y lo mismo una en proceso); próximas quedan dentro de `dias` (por `fechaProgramada`); completadas quedan dentro de `diasCompletadas` (por `fechaRealizada`); canceladas y pendientes sin fecha programada tampoco tienen una ventana natural que aplicarles, así que también se mantienen siempre visibles. La pantalla manda el mismo valor de período que ya usaba para las tarjetas, y ahora también resetea a la página 1 al cambiarlo.

---

## 2.53 Completar Mantención: el formulario pasa a estar siempre visible, sin botón que lo abra (18-sep-2026)

Javier: *"¿Qué tal si al iniciar la mantención no tenga que apretar el botón completar para llenar el formulario? Sino que el formulario ya esté ahí con los demás datos del activo y yo solo tengo que rellenarlo... Puede estar de inmediato con el detalle de la mantención. Yo lo lleno y listo. Y aprieto completar y listo. Nada más."*

En `/mantenciones/:id`, el formulario de "Completar Mantención" vivía en un modal que solo aparecía al apretar el botón "Completar" en el header. Se saca el modal y el botón que lo abría: cuando la mantención está `en_proceso`, el formulario completo (fecha realizada, técnico, resultado, qué pasa con el equipo, motivo de baja si aplica, próxima mantención) se renderiza siempre como una tarjeta más en la columna izquierda del detalle, junto a "Información de la Mantención" y con los datos del activo ya visibles al costado derecho -- se llena y se aprieta "Completar Mantención" directamente, sin un paso previo para abrir el formulario. El botón "Cancelar" (que cancela la mantención completa, no cierra el formulario) se mantiene en el header. La lógica de envío (`POST /api/mantenciones/:id/completar`) no cambió, solo dónde vive el formulario en la página.

### 2.53.1 "Realizado por" se llena solo, con el usuario de la sesión (18-sep-2026)

Javier: *"hay un campo que dice quién realizó esta mantención... eso debería llenarse automáticamente. Al igual que donde sale la información de la mantención tiene asignado, eso se llena automático."* El campo "Realizado por" del formulario de completar pasa de ser un texto libre obligatorio a llenarse solo con el nombre de quien tiene la sesión abierta, igual que ya hace "Técnico Asignado" en `/mantenciones/programar` -- de solo lectura, sin que haya que escribirlo.

### 2.51.2 Opción "Todas" en el filtro de período (18-sep-2026)

Javier, tras el fix de 2.51.1: *"Al filtro de fechas nos falta un filtro, un valor universal que diga como todos, que muestre todas las mantenciones sin importar la fecha."* Se agrega "Historial completo" a las opciones del selector de período (junto a Día/Semana/Mes/Trimestre/6 meses/Año) -- nombre elegido con Javier tras descartar "Todas" por poco descriptivo. Internamente manda `dias=0`/`diasCompletadas=0`, que tanto `GET /api/mantenciones` como `GET /api/mantenciones/pendientes` interpretan como "sin ventana de tiempo": en el listado, `0 || 0` es falsy y el bloque de filtro de período no se aplica en absoluto (se ve todo, igual que antes de 2.51); en las tarjetas, "Próximas" deja de tener `fechaProgramada.lte` (cualquier fecha futura cuenta) y "Completadas" deja de tener el `fechaRealizada.gte` (cualquier fecha pasada cuenta).

**Bug al probarlo, mismo día:** Javier: *"elijo filtro todas y no me sale nada."* `maintenanceFiltersSchema` validaba `dias`/`diasCompletadas` con `.min(1)` -- rechazaba el propio `0` que "Todas" mandaba, `GET /api/mantenciones` devolvía 400, y `fetchMaintenances()` no revisaba `res.ok`, así que la tabla simplemente quedaba vacía sin ningún error visible. Se corrige a `.min(0)` y se agrega el chequeo de `res.ok` (con `console.error` si falla) para que un fallo como este no vuelva a pasar desapercibido.

---

## Changelog SPEC

- **v1.73 (2026-09-18):**
  - Sección 2.51.3 (nueva): el calendario de Mantenciones pasa a respetar el selector de sede del nav -- llamaba a la API sin `sedeId` y mostraba todas las sedes. Detectado al revisar qué otras pantallas lo ignoraban, a pedido de Javier.
- **v1.72 (2026-09-18):**
  - Sección 2.9.9 (nueva): la sede origen se muestra en el listado (columna nueva) y en el detalle de una guía -- antes solo aparecía el destino. Pedido de Javier.
- **v1.71 (2026-09-18):**
  - Sección 2.9.8 (nueva): el listado de Guías de Despacho pasa a respetar el selector de sede del nav, filtrando por ambas puntas (origen y destino), porque una guía le interesa a las dos sedes involucradas. Pedido de Javier tras el mismo arreglo en Compras.
- **v1.70 (2026-09-18):**
  - Secciones 2.10.5, 2.10.6 y 2.10.7 (nuevas): cinco mejoras a Compras pedidas por Javier tras probar el módulo -- botón para editar una factura ya creada, el listado pasa a usar el selector de sede del nav (tenía uno propio y era la única pantalla que lo ignoraba), "Limpiar filtros" siempre visible junto a las fechas, N° de factura único en todo el sistema, y una tarjeta en la ficha del activo con la compra con la que llegó.
- **v1.69 (2026-09-18):**
  - Sección 2.10.4 (nueva): una compra ya no se puede crear sin equipos ni artículos de Kit/EPP -- se exige al menos una línea, validado en el schema y en el formulario. Pedido de Javier tras detectarlo probando: *"me deja crear una factura sin colocar equipos o kits"*.
- **v1.68 (2026-09-18):**
  - Sección 2.10.3 (nueva): el buscador de equipos de una compra se acota a la sede de la compra, en creación y en detalle -- antes buscaba en todo el inventario y un admin podía vincular equipos de otra sede. "Buscar Existente" pasa a exigir sede elegida y cambiar la sede limpia lo ya seleccionado. Pedido de Javier tras notar que el botón estaba habilitado sin sede.
- **v1.67 (2026-09-18):**
  - Sección 2.10.2 (nueva): el campo Sede pasa a mostrarse a cualquier rol en Compras > Nueva, Activos > Importar y Kit/EPP -- eran los tres que habían quedado atrás tras SPEC 2.29 y por eso un técnico no podía crear una compra ni importar equipos (400 "Debes seleccionar una sede" sobre un campo que no estaba en pantalla), y sus artículos de Kit/EPP se creaban sin sede. Pedido de Javier tras preguntar cómo se comporta la sede para un técnico.
- **v1.66 (2026-09-18):**
  - Sección 2.9.7 (nueva): se quitan los botones de "filtrar" (Filter) y "Limpiar filtros" (RefreshCw) del listado de Guías de Despacho -- el primero es redundante desde que la búsqueda debouncea sola, el segundo no aporta con solo dos filtros. Pedido de Javier: *"hay tan pocos filtros que se puede hacer de manera manual"*.
- **v1.65 (2026-09-18):**
  - Sección 2.9.6: segunda ubicación con el mismo problema -- los chips de "equipos seleccionados" (lo primero que se ve al crear una guía) nunca mostraron el nombre de categoría, solo ícono + marca/modelo + serie. Se agrega ahí también. Javier: *"¿Dónde se supone que agregaste el nombre ya que no sale acá?"*.
- **v1.64 (2026-09-18):**
  - Sección 2.9.6 (nueva): en el selector de equipos de Guías de Despacho, el nombre de la categoría junto al ícono estaba oculto bajo `lg` -- solo el ícono se veía en pantallas más chicas. Se saca la condición de ancho, queda siempre visible. Pedido de Javier: *"sale el ícono, pero la idea es que también salga por nombre"*.
- **v1.63 (2026-09-18):**
  - Sección 2.51.2: bugfix el mismo día -- "Todas" no mostraba nada. `maintenanceFiltersSchema` rechazaba `dias=0`/`diasCompletadas=0` con `.min(1)` (400 silencioso, `fetchMaintenances()` no revisaba `res.ok`). Se corrige a `.min(0)` y se agrega el chequeo de `res.ok`.
- **v1.62 (2026-09-18):**
  - Sección 2.51.2 (nueva): se agrega la opción "Todas" al selector de período de Mantenciones -- manda `dias=0`/`diasCompletadas=0`, que tanto el listado como las tarjetas interpretan como "sin ventana de tiempo". Pedido de Javier: *"nos falta un filtro, un valor universal que diga como todos, que muestre todas las mantenciones sin importar la fecha"*.
- **v1.61 (2026-09-18):**
  - Sección 2.53.1 (nueva): "Realizado por", en el formulario de Completar Mantención, pasa de texto libre obligatorio a llenarse solo con el usuario de la sesión (de solo lectura), igual que "Técnico Asignado" en Programar Mantención. Pedido de Javier: *"eso debería llenarse automáticamente... igual [que] tiene asignado, eso se llena automático"*.
- **v1.60 (2026-09-18):**
  - Sección 2.53 (nueva): en el detalle de una mantención `en_proceso`, el formulario de "Completar Mantención" deja de ser un modal detrás de un botón -- pasa a estar siempre visible como una tarjeta más de la página, junto al detalle del activo. Pedido de Javier: *"el formulario ya esté ahí... yo lo lleno y listo. Y aprieto completar y listo. Nada más"*.
- **v1.59 (2026-09-18):**
  - Sección 2.51.1 (nueva): el filtro de período de Mantenciones solo llegaba a las tarjetas "Próximas"/"Completadas" -- se extiende `GET /api/mantenciones` (el listado) con los mismos parámetros `dias`/`diasCompletadas`, misma lógica que las tarjetas. Pedido de Javier: *"solamente le está aplicando este filtro a las tarjetas... debería hacerlo a todo el módulo mantenciones"*.
- **v1.58 (2026-09-18):**
  - Sección 2.52.1 (nueva): el buscador de equipos de Programar Mantención (2.52) mostraba el inventario de todas las sedes -- se conecta al selector de sede del nav, igual que el resto de las pantallas de listado. Pedido de Javier: *"nos falta la opción de sede... que lo tome de manera automática con el selector que tenemos para todo"*.
- **v1.57 (2026-09-18):**
  - Sección 2.52 (nueva): en `/mantenciones/programar`, el Paso 1 deja de exigir elegir un empleado primero -- pasa a ser un buscador de equipos directo (marca/modelo/serie/empleado asignado + filtro de categoría), igual que `SelectorActivos` en Guías de Despacho. El backend (`Maintenance` no tiene `employeeId`) ya soportaba mantención sobre cualquier equipo; el gap era solo del wizard. Pedido de Javier, con una corrección propia sobre el diseño: primero pidió dos modos (por empleado / por equipo), luego decidió que el punto de entrada debía ser directamente el equipo -- *"el activo principal de este programa es el activo... se debería buscar por equipo y no por empleado, para empezar"*.
- **v1.56 (2026-09-16):**
  - Sección 2.51 (nueva): las tarjetas "Próximas" y "Completadas" de Mantenciones ganan un selector de período cada una (Día/Semana/Mes/Trimestre/6 meses/Año), en vez de una ventana fija (30 días / el mes). Pedido de Javier: *"colocar un filtro donde pueda indicar el día, semana, mes, trimestre, seis meses y el año, en vez de algo estático"*. De paso se corrigen dos bugs en `GET /api/mantenciones/pendientes`: "Completadas" nunca tuvo ventana de tiempo real (contaba todas las completadas de siempre), y la ruta no respetaba el selector de sede del nav.
- **v1.55 (2026-09-16):**
  - Sección 2.50 (nueva): dos bugs encontrados por Javier probando Comprobante de Cambio. (1) "Equipo devuelto" salía vacío para tickets creados por SPEC 2.45 (ejecución inmediata al crear) porque la búsqueda dependía de una transición `cambio_ejecutado` que esos tickets nunca generan -- se corrige leyendo `WorkflowRequest.assignmentIds` directamente. (2) La firma "Gestión realizada por" mostraba nombre y correo entre paréntesis en Comprobante de Cambio y Acta de Devolución, inconsistente con Comprobante de Entrega (que ya firmaba solo con nombre); se uniforman los tres y se elimina `nombreConCorreo()`.
- **v1.54 (2026-09-16):**
  - Sección 2.49 (nueva): Acta de Devolución y Comprobante de Cambio pasan a compartir el mismo diseño visual que el Comprobante de Entrega (onboarding) -- logo SCL, colores, tipografía y tabla, extraídos a `pdfSclBrand.tsx`. Antes usaban un estilo genérico sin logo. Pedido de Javier: *"todas las solicitudes deben seguir el mismo formato que tiene los de onboarding"*. Se revierte el enfoque de columna "Cargador" aparte (agregado en 2.48) a favor de sumarlo como texto dentro de "Descripción de equipo", igual que ya hacía la entrega, para no romper la tabla de 4 columnas del formato compartido.
- **v1.53 (2026-09-16):**
  - Sección 2.47 (nueva): tarjeta "Documentos" unificada en el detalle del ticket, con el link de descarga del comprobante correspondiente para los tres tipos de solicitud -- antes solo existía para Onboarding. Pedido de Javier: *"cada proceso genera una plantilla... eso debería estar en los tres procesos"*.
  - Sección 2.48 (nueva): estado del cargador (Ok/Dañado/No aplica) al devolver un notebook, extendido a Offboarding y Cambio de Equipo (antes solo se pedía al entregar, y solo en Onboarding) -- `executeReturn()` gana el parámetro que le faltaba, y se agrega la UI en `/solicitudes/nueva`, el detalle del ticket y `SeleccionarCambioEquipo.tsx`. También se agrega en la creación de Onboarding, que hasta ahora no lo pedía (solo Gestión TI, un paso posterior). Se imprime en las plantillas PDF: como línea de la descripción en el Comprobante de Entrega (para no alterar su formato, fiel a una herramienta externa), y como columna nueva en el Acta de Devolución y el Comprobante de Cambio. Pedido de Javier: *"siempre que se elige un notebook, habría que hacer que se ingrese el cargador"*, confirmado para los tres procesos.
- **v1.52 (2026-09-16):**
  - Sección 2.46 (nueva): la tarjeta "Coordinar Entrega del Reemplazo" de Cambio de Equipo, agregada en 2.42.1, solo se mostraba tras completar la selección del equipo (`cambioSeleccion`), a diferencia de Onboarding/Desvinculación donde la coordinación se ve siempre. Pedido de Javier probando el flujo: *"también falta especificar... coordinar el cambio... la idea es que también se hagan el mismo formulario"* -- si no había stock de reemplazo en la sede de prueba, la tarjeta nunca llegaba a aparecer. Se saca esa dependencia (se muestra siempre que hay empleado elegido) y se le da el mismo estilo `<hr>` + `<h4>` que "Coordinar Devolución" (2.44). Sin cambios de validación ni de modelo.
- **v1.51 (2026-09-16):**
  - Sección 2.45 (nueva): en Cambio de Equipo, mismo fix de sede que 2.44 (se fija sola a la del empleado, solo lectura) y, a pedido explícito de Javier, elegir el equipo a cambiar deja de ser opcional -- *"si o si se deba elegir un equipo para cambiar para crear la solicitud"*. Se saca el mensaje "(opcional...)", `handleSubmit` bloquea el envío sin `cambioSeleccion` completo, y `oldAssignmentId`/`newAssetId`/`estadoDevolucionAnterior` pasan a obligatorios en el schema (el superRefine que los exigía en conjunto queda redundante). Consecuencia pedida explícitamente: si no hay equipo de reemplazo disponible en la sede, la falta de stock ahora bloquea la creación de la solicitud completa, no solo el cambio -- `SeleccionarCambioEquipo` lo avisa. Ningún ticket nuevo nace ya en `incidencia_detectada`; las transiciones manuales de tickets viejos en ese estado no se tocaron.
- **v1.50 (2026-09-16):**
  - Sección 2.44 (nueva): tres ajustes al formulario de creación de Desvinculación, pedidos por Javier probando el caso 3 de la coordinación al crear (2.42.1): la coordinación de devolución pasa a su propia tarjeta separada con un `<hr>` ("Coordinar Devolución"), en vez de mezclada en la misma grilla que "Fecha Desvinculación"; el "Medio de Devolución" pasa de `<select>` con tres opciones (Presencial/Chilexpress/Otro Courier) a un radio con solo Presencial/Chilexpress, igual que Onboarding y Cambio de Equipo, y "Ubicación" pasa a ser exclusiva de Chilexpress en vez de mostrarse siempre; y el selector de Sede, que en este flujo no tiene sentido dejar editable (el empleado ya pertenece a una), se fija solo al elegir al empleado y queda de solo lectura -- Cambio de Equipo, que comparte ese mismo bloque, sigue con el selector editable.
- **v1.49 (2026-09-16):**
  - Sección 2.43 (nueva): desvincular deja de ser una edición del empleado. Pedido de Javier probando el módulo Personal: *"al editar los datos de empleado sale el botón de desvincular, este botón se debe sacar"*, y al preguntarle por el atajo equivalente del desplegable Estado, *"si sacar eso y también el formulario de kit de bienvenida y epp"*. Se quitan los dos caminos que permitían desvincular sin Solicitud (el botón con su `DELETE`, ahora stub 410, y la opción `Desvinculado` del desplegable), y `PUT /api/empleados/[id]` rechaza el cambio a ese estado. Un empleado ya desvinculado se sigue pudiendo editar, con el campo Estado de solo lectura. Se saca además la sección Kit de Bienvenida / EPP del formulario (tres fechas escritas a mano, sin relación con las entregas reales), lo que destapó que la ficha del empleado calculaba el estado de esas tarjetas desde esas mismas fechas -- decía "Pendiente" aunque el kit se hubiera entregado desde una Solicitud; ahora se deduce de los `KitAssignment`. Sin migración: las tres columnas quedan en la base, sin lectores ni escritores, pendientes de eliminar.
- **v1.48 (2026-09-15):**
  - Sección 2.42.1 (nueva): la coordinación de fecha/medio/lugar (2.42) ahora también se puede completar en el mismo formulario de "Nueva Solicitud", al momento de elegir el equipo -- no solo después, en Gestión TI/Cambio/Recibir Equipos. Pedido de Javier tras probar un onboarding real: *"yo quería que eso se ingresara al inicio cuando se crea la solicitud y asigno equipos"*, confirmado para los tres flujos. Onboarding salta directo a `equipos_entregados` al crear si los equipos elegidos cubren todas las categorías y se coordinó la entrega; cambio de equipo y desvinculación guardan la coordinación desde ya (sin cambiar de estado, ya se ejecutaban/cerraban de inmediato). Sin campos nuevos en el modelo ni migración -- son las mismas columnas de 2.42, ahora también aceptadas por `POST /api/solicitudes`.
- **v1.47 (2026-09-15):**
  - Sección 2.42 (nueva): se fusiona la coordinación de fecha/medio/lugar con el paso en que se asigna/ejecuta el equipo, en los tres flujos de Solicitudes. Pedido de Javier: *"el tema de coordinar fecha... dejarlo para definirlo al inicio también cuando se asigna el equipo, para así hacemos todo de una en vez de varios pasos"*, confirmado para los tres tipos. Se eliminan del enum `EstadoSolicitud` los estados `coordinando_entrega`, `coordinando_cambio` y `coordinacion_en_curso` (migración `20260915030000`); las transiciones pasan a ser `gestion_ti → equipos_entregados`, `incidencia_detectada → cambio_ejecutado` y `solicitud_emitida → equipo_recibido` directas, cada una pidiendo fecha/medio/lugar en la misma pantalla y la misma transición que ya hacía el trabajo. De paso, se corrige la sección 2.40/2.41 (ítem 5): la "Próxima Mantención" del EPP, que se había dejado en la ficha del empleado, también se sacó a pedido de Javier -- esa tarjeta queda mostrando solo el estado.
- **v1.46 (2026-09-15):**
  - Sección 2.41 (nueva): la devolución deja de existir como acción suelta. Regla de Javier: *"en asignaciones la unica manera de devolver un equipo es dando de baja a una persona o cambiando su equipo"*. Se quitan los seis puntos de entrada del módulo de Asignaciones que permitían devolver sin proceso detrás (flecha de la tabla, botón del detalle, cuatro botones "Devolver" en la ficha del empleado), más los tres accesos a la página suelta `/asignaciones/devolucion` (drag del Kanban, aviso al dar de baja en frontend y backend), que se elimina; todo redirige ahora a `/solicitudes/nueva`. Se elimina el acta de entrega por asignación (*"bórralo. No se va a usar. Ya que ya lo tenemos en solicitudes"*), un segundo generador hecho con jsPDF que duplicaba en otro formato lo que ya hacen las tres plantillas React-PDF de Solicitudes; la ruta queda como stub 410. Se corrige la flecha de volver del detalle de asignación, que apuntaba a una página inexistente. En la ficha del empleado, Microsoft 365 ahora muestra el nombre del plan en vez de un Sí/No, y las tarjetas de Kit/EPP dejan solo el estado, sin la fecha de entrega. Se elimina la dependencia `jspdf`/`jspdf-autotable` del `package.json` junto con el reporte RRHH de desvinculaciones que era su único uso restante (también queda como stub 410), y el componente `ReturnAssetModal.tsx`, huérfano tras la limpieza.
- **v1.45 (2026-09-15):**
  - Sección 2.39 (nueva): se invierte cuál de los dos correos del empleado es obligatorio — pasa a serlo `correoEmpresa` y `correoPersonal` queda opcional (*"el del correo tendría que ser al revés"*), porque las planillas de TI traen la cuenta corporativa y el correo particular no lo registra nadie. `tipoContrato` pasa a opcional por la misma razón (*"como no está en el Excel... lo dejamos opcional"*), en vez de inventar un valor para ~110 personas. Migración `20260915000000`.
  - Sección 2.40 (nueva): segunda pasada de QA manual. El onboarding ofrecía equipos y Kit/EPP de todas las sedes (9 llamadas sin `sedeId` en 4 archivos) y ahora filtra por la sede de la solicitud. Se elimina el estado `reutilizable`, que era indistinguible de `disponible` para entregar pero no contaba como stock en el Dashboard, y que metía la condición del equipo dentro de su ciclo de vida (migración `20260915010000`); los estados quedan en cinco. Se elimina el campo "Código Interno", que no tenía datos de origen (migración `20260915020000`). El nombre de red del equipo se pide al asignarlo, con autosugerencia `SCL-<inicial><apellido>` deducida de los datos reales (98 de 106 equipos siguen esa convención). Y se reemplazan los 14 `alert()`/`confirm()` nativos que quedaban en 7 pantallas.
- **v1.44 (2026-09-15):**
  - Sección 2.38 (nueva): primera prueba funcional end-to-end sobre el sistema corriendo, pedida explícitamente por Javier (*"antes de importar datos quiero que hagas pruebas funcionales"*), y corrección de los 9 defectos que encontró (*"si, hay que arreglar las 9"*). El más grave: todas las fechas de calendario se mostraban un día antes por leer en hora local una marca guardada a medianoche UTC -- repetido en 30 archivos, ahora centralizado en `lib/utils/fechas.ts` con la distinción entre fecha de calendario (UTC) y marca de tiempo real (hora local). Además: los contadores de Activos, el Dashboard y la exportación a Excel ignoraban el selector de sede (el Dashboard, por ser server component, ahora lee la sede de una cookie); 7 textos de ayuda contradecían el rediseño de visibilidad de 2.29; crear un registro en una sede distinta a la filtrada parecía fallar; el login permitía enumerar qué correos existen; el detalle de Compras usaba `confirm()`/`alert()` nativos; y el cartel de error mostraba el nombre interno del campo. Se confirman los códigos reales de sede: `STGO`, `CCP`, `PERU`.
- **v1.43 (2026-09-14):**
  - Sección 2.37 (nueva): pedido explícito de Javier, *"si hay error en un campo debe indicar el error, el tipo de error y cual es el campo que genero ese error"*. El backend ya mandaba el detalle util (issues de Zod) pero ~22 formularios lo ignoraban y mostraban un cartel generico. Nueva funcion `respuestaDatosInvalidos` en `guard.ts` (formato uniforme `{field, message}[]`, reemplaza 24 ocurrencias repetidas a mano en 21 rutas), mas dos piezas reutilizables en el frontend (`parseApiError` en `lib/utils/apiErrors.ts` y `<ApiErrorSummary>` en `components/ui/`), aplicadas a los formularios de Activos, Empleados, Compras, Configuracion, Mantenciones, Guias de Despacho y Solicitudes (detalle). `solicitudes/nueva` no se toco, ya funcionaba bien con codigo propio.
- **v1.42 (2026-09-14):**
  - Sección 2.36 (nueva): pedido explícito de Javier, *"el kit de bievenida o epp tambien lo compran y aqui al registrar una factura con sus productos solo funciona con los equipos pero no con el kitt de bievenida o epp"*. Nuevo modelo `PurchaseKitItem` (migración `20260914090000_agrega_purchase_kit_items`): cada línea suma una cantidad al stock (`WelcomeKitItem.cantidad`) del artículo comprado, en vez de crear una unidad como Activo. Al desvincular una línea o eliminar la compra, el stock se revierte (sin bajar de 0). "Nueva Compra" y el detalle de compra ahora tienen una sección "Kit de Bienvenida / EPP Comprado" paralela a la de Activos, y cada cambio de stock por compra queda en Auditoría igual que una edición manual.
- **v1.41 (2026-09-14):**
  - Sección 2.35 (nueva): pedido explícito de Javier, *"elimina la tabla de proveedores, y otra sede Seria la de peru agregala al seed"*. Se elimina la tabla `Supplier` (migración `20260914080000_elimina_proveedores`, sin FKs entrantes), se saca `'proveedores'` de los recursos de permisos, y las rutas/página quedan como stubs (410 Gone / mensaje "eliminado") en vez de borrarse, por la misma limitación de respaldo sin borrado de archivos usada antes en `kit-epp`. Se agrega la sede Perú (`codigo: "PERU"`) a `prisma/seed.ts` como excepción puntual; Santiago y Concepción quedan fuera del seed porque no se conoce con certeza su `codigo` real y adivinarlo arriesgaba duplicar sedes existentes.
- **v1.40 (2026-09-14):**
  - Sección 2.34 (nueva): reorganización de Configuración, pedido explícito de Javier ("dejar listo el módulo Configuración... lo encuentro un poco pobre en cuanto a funciones"). Se sacan del menú Proveedores y Microsoft Sync (sin borrar las rutas). Parámetros Generales, que era 100% decorativa, ahora persiste de verdad (nuevo modelo `SystemConfig`, migración `20260914070000_agrega_system_config`): datos de empresa (solo referencia) y seguridad (duración de sesión, intentos/bloqueo de login), estos últimos ahora leídos por `lib/auth.ts` en vez de estar hardcodeados. Se agrega Auditoría, pantalla nueva que unifica `AuditLog` + `AssetHistory` + `WorkflowTransition` en una sola línea de tiempo consultable (filtros por módulo/usuario/texto/fecha), sin tocar los historiales que ya existían en el detalle de Activos y Solicitudes -- pedido explícito de Javier de "tener todo el historial del sistema en un solo lugar" sin sacar nada de ahí.
- **v1.39 (2026-09-14):**
  - Sección 2.33 (nueva): Etapa 2 de SPEC 2.29. El selector de sede del nav (`SedeSeleccionadaProvider`) ahora filtra también Empleados (Personal), Asignaciones, Solicitudes, Mantenciones y Kit/EPP -- antes solo afectaba a Activos. Mismo patrón backend que ya usaba `/api/activos` (`?sedeId=`, solo aplica con `tieneVisibilidadTotal`). Compras no se tocó (ya tenía su propio selector local). Desvinculaciones queda con el soporte listo en el backend pero sin pantalla de listado que lo consuma todavía. Pedido explícito de Javier: *"Etapa 2: conectar el selector de sede del nav a los demás listados"*.
- **v1.38 (2026-09-14):**
  - Sección 2.32 (nueva): se extiende `AuditLog` a los 7 módulos restantes sin trazabilidad -- Mantenciones, Guías de Despacho, Desvinculaciones, Kit/EPP, Sedes, Categorías y Tipos de Mantención (migración `20260914060000_audit_log_mas_entidades`). Pedido explícito de Javier: *"la idea es que registre el historial de todos los modulos, todas las acciones del sistema"*. Activos y Solicitudes quedan aparte (ya tienen historial propio, más detallado); Proveedores sigue excluido (tabla sin uso, se va a eliminar).
- **v1.37 (2026-09-14):**
  - Sección 2.31 (nueva): se adelanta la auditoría genérica de SPEC 2.29 (punto 4), pedida por Javier tras preocuparse de que un técnico pueda modificar datos de otra sede sin dejar rastro. Nuevo modelo `AuditLog` (genérico/polimórfico, migración `20260914050000_agrega_audit_log`) y `auditLogService.ts`, enganchados en los 6 endpoints de escritura de Empleados, Compras y Usuarios (Proveedores queda excluido). `passwordHash` nunca entra al snapshot de Usuario.
- **v1.36 (2026-09-14):**
  - Sección 2.30 (nueva): Etapa 1 de la implementación de SPEC 2.29. `tieneVisibilidadTotal` ahora es `true` para técnico igual que para admin; nuevo selector de sede global en el Sidebar (`SedeSeleccionadaProvider`); `/activos` respeta la sede elegida; el campo Sede pasa a ser obligatorio para cualquier rol en `/activos/nuevo`, `/solicitudes/nueva` y `/guias-despacho/nueva`, precargado con la sede propia del usuario (editable) para no obligarlo a elegir en el caso común. Se agregan `sedeScope.test.ts` y `SedeSeleccionadaProvider.test.tsx`. Se confirma que `/activos/empleados` no necesita cambios (solo consulta, los empleados se crean desde Onboarding) y que el archivo `empleados/page.tsx` que parecía perdido en realidad se había movido ahí -- falsa alarma, sin pérdida de datos.
- **v1.32 (2026-09-14):**
  - Corrección al hallazgo de Kit/EPP de la sección 2.25: al revisar el código para arreglarlo se confirmó que la validación de ticket cerrado ya existía en el `POST` -- el hallazgo original era incorrecto, no había bug.
  - Sección 2.26 (nueva): se resuelven los 5 hallazgos "menores" de la auditoría 2.24. Dos resultaron ser hallazgos incorrectos de la propia auditoría (el guard de Configuración ya bloqueaba a técnico del lado del servidor, vía `configuracion/layout.tsx` -- nunca se necesitó código nuevo). Los otros tres sí se corrigen: la vista de detalle de Guías de Despacho ahora muestra specs completas de cualquier categoría (reutilizando `assetSpecs.ts`); la contraseña de un usuario exige la misma fortaleza al editar que al crear (`validarPasswordFuerte` compartida); y el endpoint duplicado `/api/guias-despacho/numero` se unifica con la lógica real en vez de quedar como código muerto (`generarNumeroGuia`). Se corrige también la nota desactualizada de la sección 2.18.
- **v1.31 (2026-09-14):**
  - Sección 2.25 (nueva): se corrigen 4 de los hallazgos "medios" que dejó abierta la auditoría 2.24, con instrucciones puntuales de Javier para cada uno. Venta de activos: se saca el campo "documento" (innecesario) y se persiste la fecha real de venta (antes se descartaba y el historial siempre usaba la fecha de hoy) -- nueva columna `Asset.fechaVenta`. Mantenciones: un resultado "No reparable" ahora efectivamente da de baja el equipo (antes SIEMPRE volvía a servicio sin importar el texto libre) -- nuevas columnas `Maintenance.resultadoTipo`/`motivoBaja`, reutilizando una transición que la máquina de estados ya documentaba pero que nunca se invocaba. Solicitudes: se corrige el permiso incorrecto (`read`→`write`) en la ruta de transición. Compras: se registra en `AssetHistory` cuando se vincula un activo ya existente (antes solo quedaba rastro al crear uno nuevo) -- nuevo valor `compra` en `TipoEvento`. Empleados: sin cambios, Javier confirmó que no hace falta historial ahí. El hallazgo de Kit/EPP queda sin resolver -- Javier no entendió la explicación original.
- **v1.30 (2026-09-14):**
  - Sección 2.24 (nueva): auditoría de código de los 9 módulos del sistema, pedida explícitamente por Javier (*"empieza por todos"*) tras preguntar qué estaba corregido hasta el momento. Se confirma que Configuración > Usuarios ya existe (no era un gap). Se encuentran y corrigen 5 fugas críticas de aislamiento por sede -- rutas que no filtraban por sede en absoluto: exportar Activos, buscar Empleado por RUT, los 3 reportes Excel/trazabilidad, dar de baja/vender un activo por id, y las estadísticas de Solicitudes. Quedan documentados varios hallazgos adicionales (datos de venta descartados, resultado de mantención sin efecto, permiso incorrecto en transición de solicitudes, falta de historial en Empleados y en vinculación de Compras, más hallazgos menores) sin corregir, pendientes de que Javier priorice.
- **v1.29 (2026-09-14):**
  - Sección 2.23 (nueva): se agrega `tipoLicenciaMicrosoft365` (texto libre) a `Asset` -- el Excel de Notebooks trae el nombre del plan ("Premium") y se perdía siempre, no solo al importar, porque el sistema solo guardaba un booleano Sí/No. Se agrega a validaciones, API, formularios de Notebook (`/activos/nuevo`, `/activos/:id/editar`, alta rápida de `/compras/nueva`), al helper compartido de specs, al importador y a los dos reportes Excel. De paso se resuelve que ninguno de esos tres formularios podía setear el booleano `microsoft365` manualmente -- se deriva ahora de si hay un plan cargado, en vez de agregar un checkbox aparte. Pedido explícito de Javier, al revisar el Excel de Notebooks.
- **v1.28 (2026-09-14):**
  - Sección 2.22 (nueva): `POST /api/activos/importar` y `POST /api/activos/importar/batch` no asignaban `sedeId` a los activos ni empleados creados (mismo bug que 2.11.1 en `seed.ts`), dejándolos invisibles para cualquier técnico. Se agrega selector de Sede (obligatorio para admin) a `/activos/importar` y se resuelve con `sedeIdParaCrear` en ambas rutas. De paso, evaluación de los dos Excel que Javier subió: el de Notebooks (239 filas) es compatible con salvedades de mapeo manual Estado/Condición; el de conciliación de líneas de Celular no se puede importar como Activos porque no trae Marca/Modelo/Serie/IMEI. Pedido explícito de Javier, antes de una importación real.
- **v1.27 (2026-09-14):**
  - Sección 2.21 (nueva): el alta rápida de equipo en `/compras/nueva` ("Crear Equipo Nuevo") gana las mismas secciones condicionales por categoría que `/activos/nuevo` (Notebook, Celular, Monitor, periféricos con Conectividad) -- antes solo pedía categoría/marca/modelo/serie sin importar la categoría. Reutiliza `POST /api/activos`, que ya aceptaba estos campos. No se agregó `numeroActivacion`/`tipoPlan` de Celular porque tampoco están en el formulario de origen (`/activos/nuevo`). Pedido explícito de Javier, tras preguntar por qué no estaban y para qué categorías existen formularios propios.
- **v1.26 (2026-09-14):**
  - Sección 2.20 (nueva): se elimina el campo Operador (operador telefónico) de la categoría Celular -- columna en `Asset` (migración `20260914000000_activos_quitar_operador_celular`), validación, formularios de Activos, vista de detalle, y los 4 lugares donde se había agregado unas horas antes en la 2.19. Javier confirmó de memoria que no había datos que perder; no se pudo verificar contra la base porque el workspace del dispositivo seguía caído. De paso se descarta -- por ahora -- la idea de agregar un selector de Proveedor (`Supplier`) a Compras con su propia subpestaña, que fue lo que abrió la conversación; `Supplier`/Compras quedan exactamente como estaban. Pedido explícito de Javier.
- **v1.25 (2026-09-14):**
  - Sección 2.19 (nueva): se extienden las specs por categoría (dejadas "fuera de alcance" en 2.11) a `GET /api/reportes/inventario/excel` (Pulgadas, Plan, Operador, Conectividad), al selector de equipos de Nueva Guía de Despacho (Monitor y periféricos, que no mostraban nada) y a los dos selectores de Solicitudes (les faltaba solo Conectividad; se unifica el formato entre ambos). Se crea `lib/utils/assetSpecs.ts` como fuente única de estas specs, consumida por las cuatro pantallas. Se agrega `tipoPlan` a la vista de detalle de Activos, que había quedado afuera de la ampliación de la 2.11. Pedido explícito de Javier, con recomendación previa de qué specs extender y por qué.
  - Hallazgo no pedido, sin acción tomada: `AnexoEntregaTemplate.tsx` (y los otros tres templates PDF de `lib/templates/`: `ComprobanteEntregaTemplate`, `ComprobanteCambioTemplate`, `ActaDevolucionTemplate`) son código huérfano -- ningún endpoint los importa ni los renderiza. No se extendieron ni se tocaron; queda pendiente que Javier decida si se conectan, se completan o se eliminan.
- **v1.24 (2026-09-14):**
  - Sección 2.17 (nueva): el bug de búsqueda por RUT (2.13.1) se confirma también presente en Solicitudes (`employee.rut`) y Guías de Despacho (`receptorRut`) -- se corrige con el mismo patrón en memoria (`normalizeRut` + `matchNoAccent`) ya usado en Empleados/Asignaciones. Activos y Mantenciones no lo tenían porque sus buscadores no incluyen ningún campo de RUT. Pedido explícito de Javier.
  - Sección 2.18 (nueva): se confirma que la reasignación directa (`/activos/:id/reasignar`, `ReasignarActivoForm`, `PUT /api/activos/:id/reasignar`) sigue completamente huérfana; se quita su export del índice de componentes, pero no se pudieron borrar los 3 archivos porque el workspace del dispositivo seguía caído (mismo problema del 8-sep) y el flujo de respaldo no permite borrar, solo escribir. Pedido explícito de Javier.
- **v1.23 (2026-09-11):**
  - Sección 2.16 (nueva): análisis de la pestaña Resumen a pedido de Javier -- se corrige que "vendido" no aparecía en ningún gráfico (se agrega al pie chart; se confirma con Javier que NO debe sumar en "Stock por Categoría" ni en las tarjetas operativas, misma lógica de siempre), se agrega "Reutilizable" a "Stock por Categoría" (faltaba, por eso no calzaba con "Activos por Categoría"), se agrega la tarjeta "Equipos Vendidos" (reemplaza a "Empleados Activos"), y se fusionan `getStats()`/`getAlertas()` en una sola `getDashboardData()` que reduce hasta ~46 consultas por carga a 8 fijas (elimina el N+1 de Stock por Categoría, las consultas duplicadas de Mantenciones/Devoluciones entre ambas funciones, y la ejecución secuencial). Pedido explícito de Javier.
- **v1.22 (2026-09-11):**
  - Sección 2.15 (nueva): el módulo Reportes pasa a ser una subpestaña del Dashboard (`DashboardTabs`, mismo patrón que `ActivosTabs`), en vez de una sección aparte. Se quita el botón "Ver Reportes" del Dashboard y la entrada "Reportes" del menú lateral (confirmado explícitamente con Javier); el item "Dashboard" del menú ahora también queda activo en `/reportes`. Pedido explícito de Javier.
- **v1.21 (2026-09-11):**
  - Sección 2.14.1 (nueva): se extiende el debounce de 2.14 a Solicitudes, Guías de Despacho, Mantenciones y Compras. Solicitudes/Mantenciones/Compras buscaban en cada tecla sin freno; Guías de Despacho exigía Enter. Los cuatro quedan con `useDebouncedValue`; Guías de Despacho además gana un parámetro de override en `fetchGuides` para el Enter explícito y "Limpiar filtros". Pedido explícito de Javier.
- **v1.20 (2026-09-11):**
  - Sección 2.14 (nueva): se unifica el comportamiento de los buscadores de Asignaciones, Personal y Equipos, que eran inconsistentes entre sí (Asignaciones buscaba en cada tecla sin freno, Personal y Equipos exigían Enter). Se crea `useDebouncedValue` (`src/hooks/useDebouncedValue.ts`) y se aplica en los tres: buscan solos, ~350ms después de que el usuario deja de escribir. Pedido explícito de Javier tras comparar los tres comportamientos.
- **v1.19 (2026-09-11):**
  - Sección 2.13 (nueva): `AsignacionesTable` se saca del fondo de `/activos` y pasa a ser una quinta pestaña propia (`/activos/asignaciones`) en `ActivosTabs`, junto a Equipos/Personal/Kit de Bienvenida/EPP. Pedido explícito de Javier: "sería mucho más ordenado". El componente no cambió, solo dónde vive.
  - Sección 2.13.1 (nueva): se corrige el buscador de esa tabla, que no encontraba por RUT -- comparaba el texto escrito tal cual contra `employee.rut` (guardado formateado con puntos) con un `contains` simple. Se aplica el mismo patrón ya usado en `/api/empleados` (filtrar en memoria por RUT normalizado + texto sin acentos). Se extrajeron `removeAccents`/`matchNoAccent` de `api/empleados/route.ts` a `lib/utils/text.ts` para no duplicar la lógica entre ambas rutas.
- **v1.18 (2026-09-11):**
  - Sección 2.12.1 (nueva): Javier aclaró que la v1.17 se quedó corta -- la idea era dejar solo dos acciones por fila en `/activos` (Ver detalle, Editar), no solo sacar Reasignar. Se quita también "Iniciar solicitud de entrega" de la columna de acciones del listado (junto con el ícono `UserPlus`, sin otro uso). Se revisaron las vistas de tarjetas y kanban: ninguna necesitó cambios, ya cumplían la regla.
- **v1.17 (2026-09-11):**
  - Sección 2.12 (nueva): en `/activos` se quita el botón "Reasignar a otra persona" de la columna de acciones (pedido explícito de Javier: "la idea es hacerlo desde solicitudes"), junto con su modal (`ReasignarActivoForm`) y su estado. En `/activos/:id` se quita el panel completo "Acciones Rápidas" (Javier: "ya no es necesario"), verificando primero que Dar de baja, Registrar venta, Enviar a mantención y Registrar devolución siguen alcanzables desde el listado -- solo Reasignar equipo perdía su único acceso, a propósito. La página `/activos/:id/reasignar`, `ReasignarActivoForm` y su endpoint quedan huérfanos sin borrar, pendiente de decisión.
  - Corrección a la sección 2.11.1, punto 1: la afirmación de que no existe pantalla/endpoint para crear `AssetCategory` fuera del seed es **falsa** -- existe CRUD completo en Configuración > Categorías (`/api/categorias`, con GET/POST/PUT/DELETE). No se verificó bien en su momento (repite el mismo tipo de error ya corregido para Sedes/Kit-EPP en la v1.15). Se corrige también la sección 2.11.2, que heredaba la misma afirmación.
- **v1.16 (2026-09-11):**
  - Sección 2.11.2 (nueva): `prisma/seed.ts` deja de incluir "Impresora" y "Docking Station" en el catálogo de categorías por defecto -- queda en 7 (Notebook, Celular, Monitor, Mouse, Teclado, Webcam, Audífonos). Pedido explícito de Javier por voz; la transcripción no identificaba con certeza la segunda categoría a quitar ("documentation" no existe en el catálogo), se preguntó explícitamente y se confirmó Docking Station. No hay migración -- es solo dato de seed, no schema; no afecta bases de datos que ya tengan activos en esas categorías.
- **v1.15 (2026-09-11):**
  - Sección 2.11.1: se reemplaza el enfoque de la v1.14 (agregar sedes de ejemplo al seed) por uno más profundo, a pedido explícito de Javier ("vamos a definir el seed nuevamente, como ha cambiado tanto la app"). `prisma/seed.ts` ya no crea sedes, catálogo de Kit/EPP, usuario técnico, empleados ni activos de ejemplo -- todo eso se crea a mano desde la aplicación (Configuración > Sedes/Kit-EPP, o los formularios de Empleados/Activos con datos reales). Queda solo lo que la UI no puede crear por sí sola: el catálogo de categorías de activos y un único usuario admin.
  - Se corrige una afirmación incorrecta de la v1.14: sí existe pantalla y endpoint (`POST /api/sedes`, `POST /api/kit-items`) para crear sedes y artículos de Kit/EPP a mano; no hacía falta el seed para eso.
- **v1.14 (2026-09-11):**
  - Sección 2.11.1 (nueva): `prisma/seed.ts` no creaba ninguna `Sede`, dejando al usuario técnico de ejemplo, los 4 empleados y los 8 activos de ejemplo con `sedeId = null` -- con el aislamiento por sede vigente (2.8/2.8.2), eso significa que ese técnico no veía nada al iniciar sesión en una base recién inicializada. Se agregan dos sedes (Santiago, Rancagua) y se asignan a esos registros según su `ubicacion`/`ubicacionFisica`. Sin migración: `Sede` ya existía, es solo dato de seed. Pedido explícito de Javier: preguntó dónde se definen los activos que se crean al inicializar la base y pidió que por defecto ya existan algunos -- que, de hecho, ya existían; el gap era la sede.
  - `WelcomeKitItem` tiene el mismo tipo de gap (también es "por sede" y el seed no le asigna una) y queda sin corregir en este cambio -- no fue parte de lo pedido.
- **v1.13 (2026-09-11):**
  - Sección 2.11: se revierte la sección de specs propias de Impresora agregada en la v1.12 (`tipoImpresora`, `conexionImpresora`, `ipImpresora`) -- Javier la revisó y decidió que no era necesaria ("no creo que sea necesario para una impresora"). Migración `20260911230000_activos_revertir_specs_impresora`, que elimina las tres columnas agregadas por `20260911220000_activos_specs_impresora_perifericos`. El campo `conectividad` (Mouse/Teclado/Webcam/Audífonos) y la ampliación de specs en la vista de detalle, ambos de la v1.12, no se tocaron.
  - Apéndice de SQL histórico (Parte 2): se quitan `tipo_impresora`, `conexion_impresora` e `ip_impresora` de la definición de `assets` (quedan como si la v1.12 nunca los hubiera agregado); `conectividad` se mantiene.
- **v1.12 (2026-09-11):**
  - Sección 2.11 (nueva): en `Asset` se agregan specs propias de Impresora (`tipoImpresora`, `conexionImpresora`, `ipImpresora`) y un campo compartido `conectividad` para los periféricos simples (Mouse, Teclado, Webcam, Audífonos). Migración `20260911220000_activos_specs_impresora_perifericos`. Extiende a estas categorías el patrón de formulario general + sección condicional por categoría que ya existía para Notebook/Celular/Monitor. Pedido explícito de Javier: "deberíamos hacer un formulario específico para cada activo... un formulario general con... y luego, aparte, dependiendo qué seleccionamos, desplegar otro tipo de formulario."
  - Sección 2.11: se corrige un gap en `/activos/:id` -- el bloque "Especificaciones Técnicas" no mostraba los campos de Celular (IMEI, teléfono, operador) ni antivirus/nombre de equipo, aunque estuvieran guardados. Se amplía para incluir esos campos más los cuatro nuevos de este cambio.
  - Apéndice de SQL histórico (Parte 2): se agregan `tipo_impresora`, `conexion_impresora`, `ip_impresora` y `conectividad` a la definición de `assets`.
- **v1.11 (2026-09-11):**
  - Sección 2.10.1 (nueva): en `Purchase` se elimina `documentoUrl` (no se usaba) y se agrega `rutProveedor` (texto libre, opcional, validado con dígito verificador vía `rutOptionalSchema` -- reutilizada de `src/lib/validations/rut.ts`, sin referencia al catálogo `Supplier`). Migración `20260911210000_compras_rut_proveedor_sin_documento`. Pedido explícito de Javier: "aplicaría la borrada del documento, pero agregaría el RUT del proveedor... texto simple, algún tipo de validación para validar que el rut es válido."
  - Sección 2.10.1: `/compras/nueva` ahora permite crear un activo nuevo (categoría, marca, modelo, N° de serie) sin salir del formulario, reutilizando `POST /api/activos` en vez de duplicar su lógica -- hereda asignación de sede, validación de N° de serie duplicado e historial. Pedido explícito de Javier: "la idea es que en esa misma formulario pueda agregar los equipos que me llegaron."
  - Apéndice de SQL histórico (Parte 2): se actualiza la definición de `purchases` -- se agrega `rut_proveedor`, se elimina `documento_url`.
- **v1.10 (2026-09-11):**
  - Sección 2.8.2/2.10: la sede pasa a ser obligatoria para admin también en `compras` (`sedeIdParaCrear` ahora se usa con `{ requerido: true }`, igual que en activos/empleados/solicitudes/guías) -- el selector de Nueva Compra ya no ofrece "Sin sede (transversal)", y `PUT /api/compras/:id` rechaza que admin la vacíe explícitamente. Pedido explícito de Javier: la lógica de sede en compras debía ser "la misma, al final" que en el resto de los módulos -- admin elige entre las sedes existentes, un técnico queda registrado con la suya automáticamente.
- **v1.9 (2026-09-11):**
  - Sección 2.10: se reduce aún más el modelo `Purchase` -- se eliminan `supplierId`/`supplier`, `montoTotal`, `moneda` y `metodoPago`, y de `PurchaseAsset` se elimina `precioUnitario` (migración `20260911200000_compras_solo_factura_y_equipos`). No es una restricción de UI por rol como en la v1.8: los campos ya no existen para ningún rol, admin incluido. Pedido explícito de Javier el mismo día, minutos después de la v1.8: "el tema del dinero no es un dato que nos interese" y "los proveedores tampoco importa". Al área de soporte solo le sirve la factura (para relacionarla) y los equipos que vinieron con ella.
  - Sección 1.3.1, regla 3: se actualiza para reflejar que ya no hay campos que restringir por rol dentro de `compras` -- el único límite entre admin y técnico es el aislamiento por sede (2.8).
  - Sección 1.2: el objetivo de negocio "Correlación financiera: vincular activos con facturas y proveedores" se reescribe como "Correlación con facturas", sin dato financiero ni de proveedor.
  - El modelo `Supplier`/tabla `suppliers` no se eliminó -- queda como catálogo independiente sin usarse desde compras (su API y su pantalla en Configuración siguen intactas). El endpoint `GET /api/reportes/compras`, sin ninguna pantalla que lo consuma, se simplificó a conteos por período en vez de romperse o eliminarse.
  - Apéndice de SQL histórico (Parte 2): se corrigen las definiciones de `purchases` y `purchase_assets`, que habían quedado desactualizadas desde antes de este cambio (les faltaba incluso `sede_id`, de la v1.5).
- **v1.8 (2026-09-11):**
  - Sección 2.10 (nueva): Compras — acceso de técnico. `compras` pasa de `R` a `RW` para técnico en la matriz 1.3.1 (regla 3 actualizada); el técnico queda acotado a las compras y activos de su propia sede (2.8), pero sin visibilidad de los campos financieros (`montoTotal`, `moneda`, `metodoPago`, `precioUnitario`), reservados a `admin` en la UI y en la API. Borrado sigue siendo exclusivo de `admin`. (Superado por la v1.9 el mismo día: esos campos se eliminaron del modelo por completo.)
- **v1.7 (2026-09-11):**
  - Sección 2.8.2: la sede deja de ser opcional para `admin` en `activos`, `empleados`, `solicitudes` y guías de despacho (sede origen) -- el selector ya no ofrece "sin sede" y `sedeIdParaCrear` acepta un tercer parámetro `opts.requerido` que rechaza la creación con 400 si admin no eligió ninguna. Antes, un registro creado por admin sin sede quedaba huérfano: ningún técnico lo veía, porque el filtro por sede nunca calza con `sedeId = null`.
  - Sección 2.9.2: Nueva Guía de Despacho gana un campo "Sede origen" obligatorio para admin (antes no existía ningún selector de sede emisora en el flujo de admin); el selector de equipos queda acotado a esa sede.
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
