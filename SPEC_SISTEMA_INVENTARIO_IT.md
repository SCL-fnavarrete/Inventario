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

El sistema tiene exactamente dos roles de login (enum `SystemRole`):

| Rol | Permisos |
|-----|----------|
| Admin IT (`admin`) | CRUD completo, usuarios, configuración; ve todas las sedes |
| Técnico IT (`tecnico`) | Trabajo operativo de soporte (activos, empleados, solicitudes, mantenciones, compras, guías, Kit/EPP), solo en su propia sede (ver 2.8) |

Los roles `supervisor`, `rrhh` y `auditor` del diseño original se eliminaron (migración `20260909180000_solo_roles_admin_tecnico`): el sistema lo usa solo soporte. RRHH sigue apareciendo como departamento externo que recibe las actas, y en el nombre histórico de algunos estados de solicitud (`registro_rrhh`, `confirmacion_rrhh`), pero no es un usuario del sistema.

### 1.3.1 Matriz de permisos (implementación)

La tabla anterior describe la intención; esta matriz es su forma ejecutable.
Vive en `app/src/lib/auth/permissions.ts` y es el **único** punto de verdad de
la autorización: la consumen tanto las rutas de API (`requirePermission`) como
la interfaz (`usePermissions` y el componente `<Can>`), de modo que ambas no
puedan discrepar.

Lectura (R) · Escritura (W) · Borrado (D).

| Recurso | Admin | Técnico |
|---|---|---|
| activos | RWD | RW |
| empleados | RWD | RW |
| asignaciones | RWD | RW |
| solicitudes | RWD | RW |
| mantenciones | RWD | RW |
| tiposMantencion | RWD | RWD |
| desvinculaciones | RWD | RW |
| guias | RWD | RW |
| compras | RWD | R (desde 2.111: registrar y repartir es solo de admin) |
| categorias | RWD | R |
| kitEpp | RWD | RW |
| usuarios | RWD | — |
| sedes | RWD | R |
| reportes (Dashboard) | R | R |
| configuracion | RWD | — |

**Reglas que la matriz hace cumplir:**

1. **El borrado es exclusivo de `admin`, con una excepción: `tiposMantencion`.**
   El técnico opera el parque, no lo destruye. Para activos con historial el
   borrado además está prohibido por completo (ver 2.7.7). La excepción es el
   catálogo `tiposMantencion` (`maintenance_types`): admin y técnico lo
   crean/editan/eliminan por igual, porque es una lista operativa del día a día
   (no configuración del sistema) y el técnico es quien registra las
   mantenciones. Un tipo en uso se retira con `activo = false`, no se borra.
2. **`usuarios` y `configuracion` quedan fuera del alcance del técnico**: son
   información de identidad y de sistema. `categorias` y `sedes` son datos
   maestros: el técnico los lee, solo admin los cambia. `compras` y `kitEpp`
   sí son alcance del técnico (RW, nunca D): registra lo que llega y entrega
   artículos en terreno (ver 2.10).
3. **`reportes` no tiene escritura para nadie**: controla el Dashboard, que
   se deriva de los datos. Conserva el nombre aunque el módulo Reportes se
   eliminó (2.79).
4. **Las transiciones del workflow no se autorizan con esta matriz.** La regla
   de qué rol puede ejecutar cada transición vive en la máquina de estados de
   solicitudes (sección 2.5) y es la única fuente de esa decisión: la ruta de
   transición sólo exige poder **leer** la solicitud y delega la autorización
   real en la máquina de estados.
5. **El aislamiento por sede no es parte de la matriz**: lo aplica
   `sedeScope.ts` sobre los datos (ver 2.8). La matriz dice qué puede hacer
   cada rol; la sede, sobre qué registros.

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
    fecha_entrega_epp DATE,                    -- Fecha de entrega de EPP al empleado
    fecha_entrega_kit DATE,                    -- Fecha de entrega del kit de bienvenida
    proxima_mantencion_epp DATE,               -- Próxima revisión de EPP programada
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

> **NOTA:** `rut` es opcional: cuando no se conoce se deja en blanco en vez de inventarlo. La sincronización con Microsoft Entra ID, que originó esta regla, se eliminó (2.112).

### CATEGORÍAS DE ACTIVOS (asset_categories)
```sql
CREATE TABLE asset_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(50) NOT NULL,               -- Ej: "Notebook", "Celular", "Monitor", "Impresora", "Mouse", "Teclado", "EPP"
    descripcion TEXT,
    -- requiere_serie y requiere_imei se eliminaron (2.112.7): lo decide tipo_ficha.
    tipo_ficha TEXT NOT NULL DEFAULT 'generico', -- "Qué campos pide" (2.112.7)
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
    -- en_transito: viaja en un despacho (2.108). por_repartir: recien comprado, espera su reparto (2.111).
    estado ENUM('disponible', 'asignado', 'en_mantencion', 'no_devuelto', 'en_transito', 'por_repartir', 'baja', 'vendido') DEFAULT 'disponible',
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
    sede_id UUID REFERENCES sedes(id),         -- Sede de llegada (2.111): donde llega lo comprado. Obligatoria al crear; nullable solo por filas antiguas
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
    llego_con_compra BOOLEAN NOT NULL DEFAULT false,  -- 2.111: comprado en esta compra (pasa por el reparto) o solo vinculado. Vinculos anteriores: false
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### KIT/EPP COMPRADO (purchase_kit_items) y su reparto (purchase_kit_repartos)
```sql
CREATE TABLE purchase_kit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID REFERENCES purchases(id) NOT NULL,
    item_id UUID REFERENCES welcome_kit_items(id) NOT NULL,   -- Articulo del catalogo de la sede de llegada
    cantidad INT NOT NULL,
    cantidad_por_repartir INT NOT NULL DEFAULT 0,  -- 2.111: baja al repartir, sube si se anula un despacho de reparto. Compras anteriores: 0
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2.111: a donde se repartio cada parte de una linea. Sin despacho si la
-- sede es la de llegada; con despacho si viajo a otra sede.
CREATE TABLE purchase_kit_repartos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_kit_item_id UUID REFERENCES purchase_kit_items(id) ON DELETE CASCADE NOT NULL,
    sede_id UUID REFERENCES sedes(id) NOT NULL,
    cantidad INT NOT NULL,
    guide_id UUID REFERENCES dispatch_guides(id) ON DELETE SET NULL,
    repartido_por VARCHAR(100) NOT NULL,
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
    condicion_cargador_entrega ENUM('operativo', 'con_danos', 'no_incluido'),   -- CondicionCargador (2.81)
    condicion_cargador_devolucion ENUM('operativo', 'con_danos', 'no_incluido'),
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
    rol ENUM('admin', 'tecnico') NOT NULL,          -- ver 1.3
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
    -- Nace 'en_transito' (los equipos viajan, siguen siendo de la sede origen).
    -- La sede destino confirma la recepción: 'recibida' o, si faltan equipos,
    -- 'recibida_parcial'. La sede origen puede anularla mientras viaja (2.108).
    estado ENUM('en_transito', 'recibida_parcial', 'recibida', 'anulada') DEFAULT 'en_transito',
    fecha_recepcion TIMESTAMP,
    recibido_por VARCHAR(100),
    fecha_anulacion TIMESTAMP,
    anulada_por VARCHAR(100),
    motivo_anulacion TEXT,
    sede_destino_id UUID NOT NULL REFERENCES sedes(id) ON DELETE RESTRICT,  -- Obligatoria
    sede_id UUID REFERENCES sedes(id),         -- Sede del emisor: determina qué soporte ve el registro
    purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,  -- 2.111: compra cuyo reparto creo el despacho
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
    -- Cada equipo se resuelve por separado (2.108): llegó o se perdió.
    estado ENUM('en_transito', 'recibido', 'perdido') DEFAULT 'en_transito',
    fecha_resolucion TIMESTAMP,
    resuelto_por VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### KIT/EPP EN UN DESPACHO (dispatch_guide_kit_items)
```sql
-- 2.111.4: un articulo y una cantidad. Al recibir, el stock se suma al
-- articulo del mismo nombre y categoria en la sede destino (se crea si no
-- existe). Lo que falta se resuelve despues: llego o se perdio.
CREATE TABLE dispatch_guide_kit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id UUID REFERENCES dispatch_guides(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES welcome_kit_items(id) NOT NULL,        -- Articulo en la sede de origen
    item_destino_id UUID REFERENCES welcome_kit_items(id) ON DELETE SET NULL,  -- Donde se sumo el stock
    cantidad INT NOT NULL,
    cantidad_recibida INT NOT NULL DEFAULT 0,
    cantidad_perdida INT NOT NULL DEFAULT 0,
    estado ENUM('en_transito', 'recibido', 'perdido') DEFAULT 'en_transito',  -- en_transito mientras quede algo sin resolver
    motivo_perdida TEXT,
    fecha_resolucion TIMESTAMP,
    resuelto_por VARCHAR(100),
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
| `onboarding` | Nuevo empleado necesita equipos | Técnico/Admin | Crea `assignments` para cada activo entregado |
| `cambio_equipo` | Reemplazo por falla o pérdida | Técnico/Admin | Devuelve activo viejo + asigna activo nuevo |
| `devolucion_termino` | Empleado se desvincula | Técnico/Admin | Crea `termination` con estados por tipo de equipo |

### 2.5.2 Máquinas de estado por tipo

Desde 2.82 toda solicitud se crea completa y nace en su estado final; estos diagramas describen los estados posibles y las transiciones que quedan para tickets heredados.

```
ONBOARDING:
  solicitud_recibida → [tecnico|admin] → gestion_ti
  gestion_ti         → [tecnico|admin] → equipos_entregados   ← SIDE EFFECT: crea assignments
  equipos_entregados → [tecnico|admin] → registro_rrhh        ← ESTADO FINAL

CAMBIO_EQUIPO:
  incidencia_detectada → [tecnico|admin] → cambio_ejecutado   ← SIDE EFFECT: devuelve + asigna
  cambio_ejecutado     → [tecnico|admin] → confirmacion_rrhh  ← ESTADO FINAL

DEVOLUCION_TERMINO:
  solicitud_emitida     → [tecnico|admin] → coordinacion_en_curso
  coordinacion_en_curso → [tecnico|admin] → equipo_recibido
  equipo_recibido       → [tecnico|admin] → consolidacion_cierre  ← SIDE EFFECT: crea termination
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

1. **Roles por estado:** Solo `tecnico` y `admin` ejecutan transiciones, incluidas las de cierre (RRHH no usa el sistema: los estados `*_rrhh` conservan su nombre histórico). No hay retroceso de estados.
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

> **Eliminada (25-sep-2026, 2.112).** No se sincronizará con Microsoft por ahora. Lo que sigue queda como historia.

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
| `disponible` | `en_transito` | Se incluye en una guía de despacho (2.108) | Sigue en su sede de origen |
| `en_transito` | `disponible` | La sede destino confirma que llegó, o la guía se anula (2.108) | Si llegó: `sedeId` = sede destino. Si se anuló: queda en su sede |
| `en_transito` | `baja` | Se perdió en el despacho: motivo obligatorio (Extravío) (2.108) | Baja con una mantención "Sin reparación", como toda baja (2.88) |
| `en_transito` | `por_repartir` | Se anuló el despacho de un reparto (2.111.5) | Vuelve a esperar en la sede de llegada |
| `por_repartir` | `disponible` | Se reparte a la sede de llegada (2.111.3) | Queda en esa sede |
| `por_repartir` | `en_transito` | Se reparte a otra sede: sale en un despacho automático (2.111.3) | Sigue en la sede de llegada hasta que la destino confirma |
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
| `baja` | `disponible` | **Solo** un equipo perdido en un despacho que apareció, desde ese despacho (`aparecioEnDespacho`, 2.111.4). Una baja por cualquier otro motivo, o registrada fuera de un despacho, sigue siendo definitiva | Queda en la sede destino, sin `fechaBaja`; la mantención de la baja queda como registro |
| `vendido` | — | **Estado terminal.** No se permite ninguna transición. | — |

### 2.7.3 Proceso de Baja

Dar de baja un activo es una operación irreversible (solo puede ir a `vendido` después), con una sola excepción: un equipo que se dio por perdido en un despacho y apareció (2.111.4). Requiere:

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

Registro de que un lote de equipos fue despachado hacia otra sede, vía Chilexpress.

> **Desde el 25-sep-2026 (2.108) los equipos viajan "En tránsito"** y pasan a la sede destino solo cuando esta confirma que llegaron. Lo que sigue en 2.9.2 y 2.9.3 sobre el efecto inmediato, los dos estados y la guía que no se anula quedó reemplazado por 2.108; se deja como historia.

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
| `estado` | Enum `EstadoGuia`: `en_transito` \| `recibida_parcial` \| `recibida` \| `anulada` | Ver 2.108 |
| `fechaAnulacion`, `anuladaPor`, `motivoAnulacion` | DateTime / String / String, opcionales | Se completan al anular (2.108) |
| `fechaRecepcion`, `recibidoPor` | DateTime / String, opcionales | Se completan al confirmar recepción |
| `items` | `DispatchGuideItem[]` | Activos incluidos en la guía. Cada uno con `estado` (`EstadoItemGuia`: `en_transito` \| `recibido` \| `perdido`), `fechaResolucion` y `resueltoPor` (2.108) |

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

> **Reemplazado por 2.111 (25-sep-2026).** La compra ya no es "de una sede": primero se compra y después se reparte a las sedes, y registrar y repartir es solo de admin. Lo que sigue queda como historia.

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

### 2.10.8 La ficha del activo muestra su sede (18-sep-2026)

Javier: *"en el detalle activo sería bueno colocar también su sede."* La ficha no la mostraba en ninguna parte, pese a ser el dato que decide quién puede ver ese equipo (`sedeScope.ts`) y que solo cambia por una Guía de Despacho. Se agrega la sede a la consulta de la página y una tarjeta "Sede" en la fila superior, junto a Condición, Asignado a y Fecha de Compra; la grilla pasa de 4 a 5 columnas para acomodarla.

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

### 2.29.1 REVERSIÓN: el técnico vuelve a quedar amarrado a su sede (18-sep-2026)

**Esta sección revierte la decisión central de 2.29 y de su Etapa 1 (2.30). Todo lo que esas secciones describen sobre la visibilidad del técnico queda superado por lo que sigue; el resto de 2.29 (alcance a Perú, líneas telefónicas) sigue vigente.**

Javier, tras revisar cómo había quedado: *"¿qué tal si por técnico se mantenga esa sede? Por ejemplo, si inicio sesión con un técnico de Santiago, en el navbar automáticamente esté seleccionada esa sede y no se pueda cambiar. Y lo mismo con todos los módulos y todos los formularios que piden la sede."*

Se le advirtió explícitamente que esto deshace el motivo que originó 2.29 -- los ~10 equipos de Perú, para no tener que crear un usuario dedicado solo para verlos -- y que sería la tercera vuelta sobre la misma decisión en cuatro días (2.24 restringía, 2.29 abrió, esto cierra). También se le planteó la disyuntiva de si el candado debía ser solo de interfaz o real; eligió **real, interfaz y backend**, asumiendo la consecuencia: para mirar otra sede hay que entrar como admin o con un usuario de esa sede.

**Backend.** `tieneVisibilidadTotal()` vuelve a ser `role === 'admin'`. Es el único cambio de lógica: `sedeWhere` (listados), `assertSedeAccess` (fichas), `sedeIdParaCrear` (creación) y el parámetro `?sedeId=` de los endpoints de listado ya dependían de esa función y heredan el comportamiento. Con eso, un técnico que llame la API a mano o entre por URL directa a una ficha de otra sede recibe 404, y cualquier `sedeId` que mande al crear se ignora en favor del suyo. Los tests de `sedeScope.test.ts` -- escritos en 2.29 justamente para que nadie revirtiera eso por accidente -- se actualizan al nuevo comportamiento, con la misma intención de dejarlo fijado.

**Selector del nav.** `SedeSeleccionadaProvider` expone `sedeBloqueada` y, para quien no es admin, impone la sede de la sesión ignorando lo que haya en `localStorage` (por ejemplo, otra sede guardada por una sesión anterior en el mismo navegador). El `setSedeSeleccionada` no hace nada si la sede está bloqueada, así que ningún otro llamador puede saltárselo. El `Sidebar` muestra el nombre de la sede en un bloque fijo, con la leyenda "Tu usuario trabaja en esta sede", en vez del `<select>`.

**Formularios.** El campo Sede queda deshabilitado (precargado con la del usuario, que ya venía de antes) para quien no es admin, con el texto de ayuda cambiado a "Es tu sede: ...". Alcanza a: Activos > Nuevo, Activos > Importar, Compras > Nueva, el modal de editar de Compras > Detalle, Solicitudes > Nueva (sus dos selectores), Guías de Despacho > Nueva (sede origen), Kit/EPP y Empleados > Editar. En este último, además, mover un empleado de sede vuelve a ser exclusivo de admin, que es lo que su propio comentario decía desde el 10-sep y el código había dejado de cumplir al cambiar 2.29.

### 2.29.2 Fuga: los server components no pasaban por el aislamiento por sede (18-sep-2026)

Javier, probando 2.29.1 con un usuario técnico de Concepción: *"probé con el link de un activo de la otra sede y sí me deja acceder. Accedí al Samsung Galaxy de Santiago."*

**La causa.** El aislamiento vivía en las rutas de API (`sedeWhere` en los listados, `assertSedeAccess` en las fichas), pero varias pantallas son **server components que consultan Prisma directamente**, sin pasar por ninguna ruta de API. Para ellas, esas funciones simplemente nunca se ejecutaban. El middleware sí exige sesión, así que no era una fuga hacia afuera, pero sí entre sedes. Afectaba a:

- `/activos/:id` -- la ficha del activo, que es la que Javier encontró: ni sesión leía.
- Los cinco reportes en pantalla (`inventario`, `empleados`, `obsoletos`, `stock`, `rrhh`): tampoco filtraban, así que un técnico veía el inventario completo de todas las sedes.
- De paso, tres de los cinco endpoints de Excel (`empleados`, `obsoletos`, `stock`) tampoco aplicaban `sedeWhere`, a diferencia de `inventario` y `rrhh`, que sí lo tenían desde antes. Ese sí era un gap de API.

**La corrección.** La ficha del activo obtiene la sesión con `getServerSession` y responde 404 -- no 403, para no delatar que el registro existe en otra sede -- cuando el equipo no es de la sede del usuario. Los cinco reportes reciben la sesión y aplican `sedeWhere` a su consulta (en RRHH, vía la relación al empleado, ya que `Termination` no tiene sede propia; en Stock, sobre los activos anidados en cada categoría). Los tres endpoints de Excel se alinean con los otros dos.

**Lección para lo que venga:** cualquier pantalla nueva que consulte Prisma desde el servidor tiene que aplicar el filtro por su cuenta; no lo hereda de nada. Las que pasan por `fetch` a una ruta de API sí lo heredan.

### 2.29.3 Fix: el redirect de sesión no autenticada apuntaba a la pantalla genérica de NextAuth (18-sep-2026)

Hallazgo F-1 de la auditoría de seguridad de aislamiento por sede (2026-09-17): un usuario sin sesión que pedía una URL protegida (ej. `/activos`) era redirigido a `/api/auth/signin?callbackUrl=...` -- la pantalla por defecto de NextAuth -- en vez de a `/login`, la pantalla de la app. No era una falla de autorización (seguía exigiendo login), pero contradecía lo documentado ("protege todas las rutas excepto `/login`") y usaba una pantalla que no es la real de la aplicación.

**La causa.** `src/middleware.ts` arma su propia configuración de `withAuth()` pasando solo `callbacks.authorized`, sin el bloque `pages`. El `pages.signIn: "/login"` vive únicamente en `authOptions` (`src/lib/auth.ts`), que usa el propio NextAuth para sus formularios -- el middleware no lo importa ni lo hereda, así que `withAuth` cae en su valor por defecto.

**La corrección.** Se agrega `pages: { signIn: "/login" }` al segundo argumento de `withAuth()` en `middleware.ts`. Confirmado contra el servidor de desarrollo: `GET /activos` y `GET /activos/[id]` sin cookie ahora redirigen a `/login?callbackUrl=...`.

### 2.29.4 Investigación F-2: el status 200 en la ficha de otra sede persiste en build de producción y es una limitación de streaming del App Router, no un artefacto de `next dev` (18-sep-2026)

Hallazgo F-2 de la auditoría de seguridad (2026-09-17), pendiente de confirmar: la ficha de un activo de otra sede (`/activos/[id]`) responde HTTP 200 en vez de 404 pese a que `notFound()` (2.29.2) se dispara correctamente y ningún dato del activo ajeno llega al HTML. Se investigó si esto era exclusivo del servidor de desarrollo.

**Confirmado en producción.** Se corrió `next build && next start` (deteniendo antes el servidor de dev para liberar el lock del motor de Prisma en Windows) y se repitió la prueba con sesión real de un técnico de Santiago contra la ficha de un activo de Concepción: el status sigue siendo `200`. Se inspeccionó el payload RSC completo devuelto -- contiene `"digest":"NEXT_HTTP_ERROR_FALLBACK;404"`, confirmando que Next.js sí resuelve `notFound()` internamente, pero el código de estado HTTP de la respuesta ya se había enviado como 200 antes de eso.

**Causa raíz.** `src/app/(dashboard)/loading.tsx` envuelve automáticamente **toda** la pantalla del dashboard (todas sus rutas hijas, incluida `activos/[id]`) en un `<Suspense>`. Apenas la página empieza a esperar datos (la consulta a Prisma), Next.js transmite el "shell" (sidebar, layout) con status 200 y muestra el *fallback* de `loading.tsx` (el spinner), sin esperar a que la página resuelva. Cuando la página finalmente llama `notFound()`, la cabecera HTTP ya salió: el protocolo no permite corregir un status code después de que la respuesta empezó a transmitirse. No hay fuga de datos -- el HTML final sí es el límite "no encontrado" de Next, verificado buscando explícitamente el número de serie y el modelo del activo ajeno en el documento completo -- pero el código de estado queda mal.

**Se probaron las dos correcciones propuestas en el informe original, ninguna resolvió el status:**
1. Mover el chequeo de sesión/sede a `generateMetadata` (que en teoría se resuelve antes de transmitir el cuerpo de la página): en esta versión de Next.js (16.1.1) el metadata también se transmite de forma asíncrona dentro de su propio `Suspense` (`OutletBoundary`/`MetadataOutlet`), así que el `notFound()` lanzado ahí tampoco alcanza a corregir el status ya enviado.
2. `export const dynamic = "force-dynamic"` en la página: no tiene efecto sobre el streaming ni sobre este comportamiento -- solo afecta caché/revalidación.

Ambos intentos se revirtieron por no resolver el problema (`git diff` de `activos/[id]/page.tsx` queda igual que antes de esta investigación).

**Por qué no se amplía el alcance ahora.** La única corrección que sí eliminaría el streaming para esta ruta es sacarla de debajo de `(dashboard)/loading.tsx` -- por ejemplo, quitando ese `loading.tsx` compartido o reestructurando las rutas para que esta página no herede ningún límite de Suspense ancestro. Eso cambia el comportamiento de carga (el spinner instantáneo) de **todo el dashboard**, no solo de esta pantalla, así que es un cambio de alcance mayor al de este hallazgo puntual y no se aplica sin que Javier lo decida explícitamente.

**Conclusión de la investigación (no era artefacto de `next dev`).** Es una limitación conocida del modelo de streaming del App Router de Next.js al combinar un `loading.tsx` ancestro con un `notFound()` condicional más abajo en el árbol. **No hubo fuga de datos** en ningún momento -- el riesgo de seguridad real (hallazgo original de "Broken Access Control") estaba resuelto desde 2.29.2; lo pendiente era cosmético/semántico (el código de estado HTTP).

**Decisión de Javier (18-sep-2026):** *"corrige el tema del estatus de 200 a 404, ya que no es un error que afecte en sí a la aplicación, pero al final termina informando de mal manera en caso de error"*. Se le planteó explícitamente que la única corrección real implicaba quitar o reestructurar el `loading.tsx` compartido de todo el dashboard, cambiando el spinner instantáneo de navegación en **todas** las pantallas del dashboard, no solo en la ficha de activo -- confirmó proceder con esa opción (404, la opción recomendada, consistente con el resto de la app).

**La corrección aplicada.** Se elimina `src/app/(dashboard)/loading.tsx`. Sin ningún `loading.tsx` en el árbol de `(dashboard)`, Next.js ya no inserta ningún Suspense boundary automático entre el layout y las páginas: el render vuelve a ser bloqueante (sin streaming) para todo el dashboard, así que la respuesta HTTP no se envía hasta que la página completa -- incluido un eventual `notFound()` -- se resuelve. Esto corrige el status code correctamente en **todas** las pantallas que usan `assertSedeAccess`/`notFound()`, no solo en la ficha de activo, cerrando de raíz la misma clase de problema para cualquier pantalla futura. El costo es la pérdida del spinner de navegación instantáneo compartido: al navegar dentro del dashboard, el usuario ya no ve el `<div>` de carga mientras el servidor resuelve la página -- ve la pantalla anterior hasta que la nueva está lista.

**Pendiente de verificación en runtime.** El cambio se verificó con `npx tsc --noEmit` (sin errores) y por análisis del modelo de streaming de Next.js, pero no se pudo confirmar en vivo contra un build de producción real desde este entorno (sin acceso sostenido a un servidor local persistente). Javier debe correr `next build && next start` y repetir la prueba C10 (técnico Santiago pidiendo la ficha de un activo de Concepción) para confirmar que el status ahora es 404, y revisar visualmente que la pérdida del spinner compartido no se sienta mal en el resto del dashboard.

### 2.29.5 Fix: el Dashboard (KPIs y alertas) no filtraba por sede -- F-3 y F-4 de la auditoría (18-sep-2026)

Segunda ronda de la auditoría de seguridad, a pedido de Javier tras revisar el informe de la primera ronda: *"la idea es probar las rutas para que no puedan ser acceder por una sede que no sea suya... eso redactalo para un promp de claude code"*. Se le pidió probar puntualmente dos endpoints que habían quedado fuera del barrido original: `GET /api/dashboard/stats` y `GET /api/dashboard/alertas`.

**F-3 -- Alto -- `/api/dashboard/stats` devolvía KPIs globales, no de la sede del usuario.** Ninguna de sus 11 consultas Prisma (conteos de activos, empleados, mantenciones, desvinculaciones, asignaciones, categorías, más un `$queryRaw` de asignaciones por mes) aplicaba `sedeWhere`. Confirmado en vivo: un técnico de Santiago y uno de Concepción, con inventario real distinto (6 activos/1 empleado vs. 2 activos/2 empleados), recibían exactamente el mismo JSON con los totales de las 3 sedes combinadas.

**F-4 -- Crítico -- `/api/dashboard/alertas` exponía registros individuales de otras sedes.** Las 5 consultas (mantenciones vencidas/próximas, devoluciones pendientes, activos dañados, garantías por vencer) tampoco filtraban por sede. Se demostró de forma concluyente creando una mantención de prueba sobre un activo de Santiago y confirmando que un técnico de Concepción la recibía en su lista de alertas, con marca, modelo, número de serie y link directo a la ficha. El mismo patrón en `devolucionesPendientes` exponía además nombre completo y RUT de empleados de otra sede.

Mismo patrón de bug que 2.29.2 (server component/endpoint agregado que no hereda el filtro de ningún lado): estos dos endpoints simplemente quedaron fuera de ese barrido porque no tienen pantalla propia en la UI, aunque son alcanzables llamándolos directo.

**La corrección.** Se extendió `sedeWhere(session)` a las 16 consultas de ambos endpoints, reutilizando exactamente el mismo patrón ya establecido en `/api/activos`, `/api/empleados`, `/api/mantenciones` y el reporte RRHH -- no un parche puntual, sino la misma pieza central que ya usa el resto del código:

- `Asset` (conteos, categorías, `activosDanados`, `garantiaPorVencer`): `{ ...ACTIVOS_VIGENTES, ...sedeWhere(session) }`.
- `Employee`: `sedeWhere(session)` directo (tiene `sedeId` propio).
- `Maintenance`/`Assignment` (sin `sedeId` propio, vía relación a `Asset`): `{ ..., asset: sedeWhere(session) }`.
- `Termination` (sin `sedeId` propio, vía relación a `Employee`): `{ ..., employee: sedeWhere(session) }`.
- El `$queryRaw` de asignaciones por mes: se agregó `JOIN assets` y una condición `AND assets.sede_id = ...` construida con `Prisma.sql`/`Prisma.empty` (nunca interpolación de string), aplicada solo cuando el usuario no tiene visibilidad total.
- Se agregó también el parámetro opcional `?sedeId=` para quien sí tiene visibilidad total (mismo patrón que el resto de los listados), para que un admin pueda acotar el dashboard a una sede específica.

**Fuera de alcance, a pedido explícito de Javier.** `/api/reportes/compras` no se auditó en esta ronda porque el módulo de Reportes se va a rehacer más adelante; cuando se retome, conviene barrer todos sus endpoints por este mismo patrón en vez de asumir que están bien por analogía con `inventario`/`rrhh`.

---

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

> **Ajustado por 2.111 (25-sep-2026):** el Kit/EPP comprado ya no suma stock al registrar la compra; queda "por repartir" y el stock sube al repartirlo (en la sede de llegada) o al recibirlo por Despacho (en otra sede).

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

> **Reemplazado en parte por 2.93 (22-sep-2026):** el correo obligatorio volvió a ser el personal y el de empresa es opcional. Lo del tipo de contrato opcional sigue vigente.

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
// Crear empleado: solo con una solicitud de Onboarding (SPEC 2.94)
PUT    /api/empleados/:id              // Actualizar
GET    /api/empleados/:id/activos      // Activos asignados al empleado

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
// Sin endpoints: la pagina del Dashboard calcula sus datos en el servidor
// (SPEC 2.86 elimino /api/dashboard/stats y /api/dashboard/alertas, sin uso).
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
Desde 2.112.7 cada categoría trae `tipoFicha` ("Qué campos pide"): Notebook → computador, Celular → celular, Monitor → monitor, y Mouse, Teclado, Webcam y Audífonos → periférico (ver `prisma/seed.ts`). `requiere_serie` y `requiere_imei` del ejemplo de abajo ya no existen.
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
| Tiene historial o asignaciones | **409**, indicando que corresponde darlo de baja por Mantenciones (`POST /api/mantenciones/baja`, SPEC 2.88) |
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

## 2.54 Importación de Activos: sede por fila vía columna "Sede", no por comuna (19-sep-2026)

Javier, sobre la importación real (planilla mixta, sede única por archivo hasta ahora): *"actualmente el inventario es registrado en una planilla de excel [...] esta todo mezclado por sede y es dificil e imposible separarlo porque algunos tienen region otro no."* Primer intento: detectar la sede de cada fila a partir de la comuna/región (tabla de 346 comunas de Chile + regla de negocio región→sede). Javier, al revisar el enfoque: *"estuve pensando y en el mejor de los casos la solución sería normalizar los datos debido al desorden de los mismos."* Se descarta la tabla de comunas y se reemplaza por la solución de fondo: la planilla declara la sede explícitamente, en su propia columna "Sede", en vez de que el sistema la infiera de un dato ambiguo. Confirmado que soporte TI es quien mantiene la planilla (*"la persona de soporte TI"*) y que el cambio aplica hacia adelante (*"Hacia adelante (Recomendado)"*); los ~239 registros históricos ya mezclados se resuelven aparte, fuera de esta funcionalidad.

**Diseño:**
- La sede del admin en `/activos/importar` pasa a ser opcional (antes obligatoria). Si el admin la deja en blanco, cada fila se resuelve por separado leyendo su columna "Sede" y comparándola (sin distinguir mayúsculas/minúsculas ni tildes) contra las sedes reales de la base (`Sede.nombre` y `Sede.codigo`), consultadas en vivo en cada importación -- una sede creada después de escribir este código se reconoce sin tocar nada, porque no hay geografía hardcodeada, solo una comparación contra lo que exista en Configuración > Sedes en ese momento (`construirMapaSedes` en `src/lib/importacion/activos.ts`). Pregunta de Javier sobre esto: *"que pasa si agrego otra sede esta como la leeria por el nombre y seria mayuscula minuscula como"* -- respondida con la normalización (sin tildes, minúscula, espacios recortados) que ya usa `clave()` en el mismo archivo.
- Si una fila no matchea ninguna sede real, queda marcada como error ("sede no reconocida") en el panel de revisión existente, con **todos** sus campos mapeados (no solo marca/modelo/serie) para que corregirla y reimportarla no pierda el empleado, las fechas ni el resto de los datos.
- Un técnico sigue amarrado a su sede sin excepción (SPEC 2.29.1): si su archivo trae una fila cuya columna "Sede" declara explícitamente OTRA sede real, la fila se rechaza con un error explícito en vez de reetiquetarla en silencio -- pregunta de Javier: *"me gustaría saber que pasaría si importa un archivo con datos de concepción y santiago siendo un técnico de santiago"*; respuesta implementada: *"si lo hace un admin que lo detecte automáticamente y si lo hace un técnico solo importe lo suyo"* (confirmado por Javier). Si la columna viene vacía, no mapeada, o con un valor que no matchea ninguna sede (typo), la fila se asume de la sede del técnico, igual que el comportamiento previo a esta funcionalidad -- no se penaliza al técnico por un archivo sin esa columna.
- Nuevos tipos de error (`ValidationErrorType`): `sede_no_reconocida` y `sede_ajena`.
- Se agrega el campo "Sede" al mapeo de columnas de `/activos/importar` (alias automático: header "Sede").
- Contrato con soporte TI: la columna "Sede" debe traer el nombre exacto de la sede tal como aparece en Configuración > Sedes (sin apodos como "Bodega Santiago") -- no se resuelven variantes a mano, a diferencia del intento anterior con comunas.
- Se entregó a Javier `Inventario_Normalizado_Con_Sede.xlsx`: las mismas 239 filas de la planilla real, con la columna "Sede" agregada (clasificada con la misma regla comuna→sede usada en el intento anterior, ya que para ese archivo histórico sigue siendo la única forma de reconstruir el dato) -- 151 Santiago, 77 Concepción, 7 Perú, 4 filas quedan con "Sede" en blanco por no traer comuna reconocible, para probar en vivo que el panel de errores las marca correctamente.

---

## 2.55 Solicitudes: se saca el indicador visual de pasos del formulario de creación (19-sep-2026)

Javier: *"en la solicitudes sale un barra de progreso al crear solicitudes, la idea es sacarlo porque la idea al crear la solicitud es que se haga todo de un paso. por eso estoy haciendo todo al inicio en un solo formulario"*.

**Diseño:** se elimina de `src/app/(dashboard)/solicitudes/nueva/page.tsx` el bloque "Step Indicator" (círculos numerados + línea conectora) y la constante `totalSteps`, que ya no se usaba en ningún otro lado. El flujo interno de dos pantallas (elegir tipo de solicitud → formulario completo) y el texto de `stepDescriptions` no cambian -- lo que se saca es únicamente la señal visual de que se trata de un proceso de "varios pasos", porque la intención del formulario (definida en secciones anteriores, 2.42/2.42.1) es que todo se complete de una sola vez.

## 2.56 Importación de Activos: nada se escribe hasta confirmar, con revisión previa de errores (19/20-sep-2026)

Javier probó la importación real y encontró un bug de diseño (transcrito de un mensaje de voz): *"Al realizar la importación de datos se encontró un error, ya que al momento de corregir datos erróneos que faltan códigos, eh, si yo aprieto cancelar, todos los otros datos se importan correctamente. La idea es que primero pueda corregir los datos y ahí confirmar la importación, no que de inmediato se importe. [...] Sobre la importación, la idea es que primero detecte ya los, eh, los campos, luego corrija lo, las filas que debo corregir y ahí un botón para realizar importación. No que se importe todo de inmediato."*

**Causa raíz:** `POST /api/activos/importar` escribía en la base fila por fila, de inmediato, en el mismo request que procesaba el Excel completo. Las filas válidas ya habían sido creadas para cuando el usuario llegaba al panel de corrección de errores -- cancelar en ese punto no revertía nada, porque no había nada pendiente de confirmar: ya estaba escrito. El endpoint `preview` con `mapping` existía desde antes pero el frontend nunca lo invocaba con mapeo, así que ninguna validación real corría antes de la escritura.

**Diseño (elegido por Javier: "Solo las filas con error (Recomendado)" -- ver también la pregunta sobre autocompletado de columnas, respondida aparte sin cambios de código):**
- Se extrae la lógica de negocio por fila -antes duplicada entre `route.ts`, `preview/route.ts` y `batch/route.ts`- a una única función compartida, `procesarFila()` (`src/lib/importacion/procesarFila.ts`), que corre en modo `dryRun` (solo lee, usada por la vista previa) o de escritura real (usada al confirmar). Al ser la misma función en ambos casos, lo que la vista previa aprueba es exactamente lo que se termina escribiendo -- ya no pueden divergir. El parseo del Excel se extrae igual a `leerFilasExcel()` (`src/lib/importacion/leerExcel.ts`).
- Nuevo flujo en `/activos/importar`: **Paso 1** (archivo/hoja/categoría/sede) y **Paso 2** (mapeo de columnas) sin cambios de fondo. **Paso 3**, "Validar N filas", llama a `POST /api/activos/importar/preview` con el mapeo -- corre `procesarFila(dryRun: true)` para cada fila, sin ninguna escritura en la base, y devuelve cuántas filas son válidas y cuántas tienen error. **Paso 4** muestra ese resumen; si hay errores, un botón abre el panel de revisión (`ErrorReviewPanel`) para corregirlos -- el panel ya no reimporta cada fila corregida al toque como antes, solo junta las correcciones en memoria. El único botón que escribe algo es "Realizar importación", que llama una sola vez a `POST /api/activos/importar/batch` con todas las filas que van a importarse (las válidas de la vista previa + las corregidas en el panel); las filas con error que no se corrigieron quedan fuera. Cancelar en cualquier punto antes de ese botón no deja nada escrito.
- `POST /api/activos/importar` (el endpoint de escritura inmediata) se elimina -- `batch/route.ts` pasa a ser el único punto de escritura de esta funcionalidad, usando la misma `procesarFila(dryRun: false)`.
- Efecto colateral del refactor: se corrige una distinción que antes no existía -- un número de serie repetido *dentro del mismo archivo* (ninguna de las dos filas existe todavía en la base) ahora se marca como error `duplicate_in_file`, en vez de reusar el mensaje de `duplicate_in_database` ("ya existe en la base"), que era engañoso para ese caso.
- Se agregan descripciones breves bajo cada campo del mapeo de columnas (Paso 2), a pedido explícito: *"cuando elijo un equipo, los campos no son tan descriptivos. La idea sería el nombre del campo y abajo una breve descripción de qué debería ir en ese campo."* Por ejemplo, "Sede" indica que debe coincidir con el nombre o código de una sede real; "RUT", que puede venir con o sin puntos ni guion.
- Se elimina el campo "Equipo" del mapeo de columnas: era código muerto, sin lector en ningún endpoint ni columna equivalente en el modelo -- el tipo de equipo (Notebook/Celular/etc.) ya se define una sola vez por archivo con el selector de Categoría, no fila por fila. Detectado al preguntar Javier a qué se refería ese campo; confirmado innecesario y retirado: *"si sacala ya que el tipo de equipo si elije al inicio"*.

## 2.57 Nuevo estado del Activo: "No devuelto" (20-sep-2026)

Javier, revisando la planilla real durante la importación: *"hay un estado que no estamos considerando que seria no devuelto revisa el excel ese lo tiene"*, y luego *"esa fila representa el estado del equipo [...] que puedo hacer ante ese nuevo estado"*.

**Qué había realmente en el Excel:** la columna "Estado" de `Consolidado inventario Notebook_23022026.xlsx` solo trae `Nuevo`/`Usado`/`Seminuevo`. El texto "No devuelto" (2 filas), junto con "No esta en oficina" y "Equipo Gerente", está en la columna **"ID-Interno"**, donde soporte TI escribe notas en vez del ID cuando el caso es excepcional. Aun así el dato describe el estado real del equipo, y el sistema no tenía cómo representarlo.

**Qué ya existía:** `executeReturn()` aceptaba `estadoDevolucion: 'no_devuelto'` desde la desvinculación, y la pantalla de Offboarding ya preguntaba por cada equipo "Buen estado / Dañado / No devolvió". Pero al elegir "No devolvió" el Activo **no cambiaba de estado**: quedaba en `asignado`, indistinguible de una asignación vigente normal, por una decisión anterior (dejarlo asignado para no perderle el rastro). El efecto era que esos equipos no se podían contar ni filtrar en ninguna parte. Javier decidió reemplazar ese mecanismo por un estado propio.

**Diseño:**
- `EstadoActivo` gana el valor `no_devuelto` (migración de enum en Postgres). Sigue siendo el mismo enum que valida Zod (`estadoActivoEnum`): el guard `EstadoSincronizado` obliga a que ambos coincidan.
- Máquina de estados (SPEC 2.7): se llega a `no_devuelto` **solo desde `asignado`** (el empleado se desvincula y no devuelve el equipo). Desde `no_devuelto` se puede ir a `disponible` (aparece y se devuelve) o a `baja` (se da por perdido). No es estado terminal. Las tres transiciones exigen `motivo`, igual que el resto de las transiciones excepcionales.
- `executeReturn()`: al calificar una devolución como `no_devuelto`, además de lo que ya hacía (la asignación NO se cierra, el equipo NO deja de estar vinculado al empleado), el Activo pasa a `estado: 'no_devuelto'`. Que la asignación siga activa es lo que permite recuperar el equipo más adelante desde Asignaciones, registrando la devolución normalmente -- ese camino no cambia.
- Importación de Activos: "No devuelto" pasa a ser una palabra reconocida de la columna "Estado" (más los sinónimos "no devolvió", "no se devolvió", "sin devolver"). Además, una fila con ese estado y un RUT **sí** crea el empleado y la asignación, igual que una fila "asignado" -- un equipo no devuelto también está en manos de una persona, y perder ese dato sería perder justamente a quién hay que ir a buscar.
- Visibilidad: el estado se cuenta aparte, nunca mezclado con "Asignado". Tarjeta propia en la barra de estados de `/activos` (con su filtro), porción propia en el gráfico de estados del Dashboard, etiqueta y color propios (naranja) en la ficha del activo, el listado, la exportación a Excel, el reporte de inventario y el detalle de compras.
- Queda fuera de este cambio el módulo antiguo de Desvinculaciones (`/desvinculaciones`, modelo `Termination`), que no pregunta por equipo individual sino por categoría y donde `pendiente` se trata hoy como "ok" -- mismo problema de fondo, pero es un flujo aparte del que se usa hoy (Solicitudes).

## 2.58 Se elimina el módulo antiguo de Desvinculaciones (20-sep-2026)

Javier, al revisar el alcance de SPEC 2.57: *"la 3 ya que no se usa ninguna funcion ni codigo de eso para limpiar codigo que no se usa"*, y sobre el reporte que dependía de él: *"la 3 ya se basa en eso que no se usa luego lo reemplazaremos con los nuevos datos"*.

**Qué era:** el modelo `Termination` con sus pantallas (`/desvinculaciones/nueva`, `/desvinculaciones/[id]`) y endpoints, del diseño anterior a que Desvinculación pasara a ser un tipo de Solicitud (SPEC 2.41 y siguientes). Registraba la devolución de equipos **por categoría** (un estado para "Notebook", otro para "Celular"...) en vez de por equipo individual, y trataba `pendiente` igual que "ok", dejando el equipo en "Disponible" aunque nunca se hubiera devuelto -- el mismo problema de fondo que resuelve 2.57, pero en un flujo paralelo.

**Por qué se elimina:** ningún enlace de la aplicación llevaba a `/desvinculaciones/nueva`, y `POST /api/desvinculaciones` -- lo único que crea registros `Termination` -- ya no se llamaba desde ninguna pantalla. El flujo de Solicitudes que se usa hoy no crea ninguno. Sus registros solo seguían visibles a través del KPI "Devoluciones pendientes" del Dashboard, sus alertas, y el "Reporte para RRHH".

**Alcance de la eliminación:**
- Páginas y endpoints del módulo, `executeTerminationReturn()` en `workflowExecutionService.ts`, y `lib/validations/termination.ts`.
- El "Reporte para RRHH" (`/reportes/rrhh` y `/api/reportes/rrhh/excel`), que estaba construido entero sobre `Termination`, junto con su tarjeta y su botón de Excel en `/reportes`. Decisión explícita de Javier, que quiere rehacerlo más adelante sobre los datos del flujo actual (Solicitudes de offboarding).
- El KPI "Devoluciones Pend." del Dashboard, sus alertas en `AlertsPanel` y el conteo en `/api/dashboard/stats` y `/api/dashboard/alertas`.
- El `include` de `terminations` en la ficha del empleado, la opción "Desvinculaciones" de la herramienta de limpieza de datos (`/configuracion/mantenimiento`) y sus conteos.
- En el schema: `model Termination`, la relación `Employee.terminations` y el campo suelto `WorkflowRequest.terminationId` (que solo escribía el módulo eliminado). Requiere migración: **la tabla `terminations` se elimina con sus datos**.

**Lo que NO se toca:** el enum `EstadoDevolucionTipo` se queda -- no era exclusivo de `Termination`, lo usan también `Assignment.condicionCargadorEntrega` y `condicionCargadorDevolucion`, el estado del cargador de SPEC 2.48. El test de `/reportes` que validaba los filtros de Prisma contra el DMMF se reescribe para cubrir `Asset` y `Employee`, que son los modelos que la página consulta ahora.

## 2.59 Importación de Activos: la fecha de entrega puede quedar como "desconocida" (20-sep-2026)

Javier, probando la importación en vivo: *"que puedo hacer si el activo no tiene fecha de entrega, me la pide obligatorio que puedo colocarle para rellenar"*, y confirmó *"no tienen ninguna fecha registrada nose que hacer en ese caso"* para las filas donde ese dato nunca existió.

**El problema:** una fila con empleado asignado (estado "Asignado" o "No devuelto", SPEC 2.57) exigía una fecha de entrega parseable o rechazaba la fila completa. Eso funcionaba para errores de formato ("32-13-2026"), pero no daba ninguna salida cuando la fecha simplemente **nunca se registró** -- el caso típico de datos históricos migrados a mano. La única alternativa habría sido inventar una fecha, que es exactamente lo que un cambio anterior de esta misma sesión decidió evitar (no hay fecha-por-defecto silenciosa).

**La solución:** se distingue "dato ausente" de "dato inválido". Si la celda de fecha de entrega viene vacía, la fila se importa igual y la asignación queda con `fechaEntrega = null` ("fecha desconocida"), conservando el empleado y la asignación (o sea, quién tiene el equipo). Si la celda trae un valor pero no se puede interpretar como fecha, sigue siendo un error que hay que corregir en el Excel -- eso no cambió.

**Alcance:**
- `Assignment.fechaEntrega` pasa a ser nullable en el schema. Requiere migración.
- `procesarFila.ts`: la fila ya no se rechaza por fecha vacía; la asignación se crea aunque `fechaEntrega` sea `null`.
- La creación manual de asignaciones (`AsignarActivoForm`, `POST /api/asignaciones`) no cambia -- ahí la persona siempre elige una fecha real desde un calendario, así que se sigue exigiendo.
- Pantallas que muestran `fechaEntrega` de una asignación (ficha del empleado, detalle de asignación, tabla de asignaciones del activo, trazabilidad) ahora muestran "fecha desconocida" en vez de fallar cuando no hay valor.
- La validación que compara fecha de devolución contra fecha de entrega (`PATCH /api/asignaciones/[id]`) se omite cuando la entrega es desconocida, ya que no hay con qué comparar.

**Decisión explícita de Javier:** ante tres opciones (permitir fecha desconocida en el sistema, completar una fecha aproximada manualmente en el Excel antes de importar, o quitar el RUT del empleado para no exigir fecha), eligió la primera -- conservar la asignación con la fecha en null, en vez de perder el dato de custodia o inventar una fecha.

## 2.61 Importación de Activos: se conservan tres datos que se perdían en silencio (21-sep-2026)

Javier, verificando el import contra el Excel real: primero sobre "Historial de asignaciones" (contador antiguo tipo "1", "2" o "1+", sin nombre de la persona) -- *"aunque no llevemos datos de la persona que fue asignada, la idea sería, aún así, que quede en el registro que fue asignado una vez"*; luego sobre "Mantención" y "Próxima Mantención" -- *"cuando se hace la mantención se queda registrado. Y en la próxima mantención, la idea es registrar o crear un ticket de mantención utilizando esas fechas"*; y por último sobre "Nombre Equipo" -- *"¿Qué lógica estamos haciendo actualmente para eso?"* (la respuesta, revisando el código: ninguna -- el campo existía en el mapeo del import pero se descartaba en silencio).

**1. Historial de asignaciones.** No alcanza para crear un `Employee` ni una `Assignment` real (no hay con quién vincularlo), pero tampoco se pierde: si la columna trae un valor, se agrega una línea al historial del activo (`AssetHistory`, tipo "asignacion") con el texto literal de la celda -- "Historial previo a la migración: asignado 1+ veces (sin datos de la persona)". Decisión explícita de Javier (opción A, entre dos alternativas): una sola línea informativa por activo, sin inventar una cantidad exacta a partir de un dato que de por sí ya era impreciso ("1+" no es un número).

**2. Ticket de mantención pendiente.** Antes, cuando una fila traía AMBAS fechas (una "Mantención" ya realizada y una "Próxima Mantención" futura), se creaba un solo registro completado y la fecha próxima quedaba solo como un dato informativo dentro de ese mismo registro -- invisible en la cola de mantenciones pendientes del sistema. Ahora se crean DOS registros: uno completado con la fecha realizada, y un ticket pendiente aparte con la fecha próxima, visible como cualquier otra mantención pendiente. Si la fila solo trae una de las dos fechas, el comportamiento no cambia (un único registro, pendiente o completado según corresponda).

**3. Nombre Equipo.** El campo `Asset.nombreEquipo` ya existía en el schema (y ya se mostraba en la ficha del activo, en "Especificaciones Técnicas" -- ver SPEC sobre la vista de detalle) -- lo que faltaba era que el import lo leyera. `procesarFila.ts` nunca llamaba `obtener("nombreEquipo")`: la columna se ofrecía en el mapeo de la pantalla de import y el dato se descartaba en silencio. No requiere migración, solo el fix en el import.

## 2.62 Ficha de Activo: la fecha de entrega ya no se muestra disfrazada de fecha de compra (21-sep-2026)

Javier, revisando la ficha de un activo importado: *"por qué en el detalle de activo la fecha de entrega sale como fecha de compra?"*.

**Causa:** en `procesarFila.ts`, cuando el Excel no traía una columna real de "Fecha de compra" (como el de Notebooks, que solo tiene "Fecha de entrega"), se usaba la fecha de entrega como respaldo para no dejar esa tarjeta vacía -- comportamiento intencional pero mal comunicado: la ficha del activo mostraba esa fecha bajo el rótulo "Fecha Compra" sin ninguna indicación de que era una estimación, dando a entender que el equipo se compró el mismo día que se entregó a la persona.

**Solución:** se elimina el respaldo. Sin un dato real de "Fecha de compra" en el Excel, el campo queda simplemente sin registrar ("No registrada" en la ficha), en vez de mostrar una fecha ajena bajo un rótulo equivocado. No afecta ningún cálculo automático -- "Fin de garantía" es un campo manual independiente, el import nunca lo tocó.

## 2.63 Buscador de Activos: ahora busca por palabras, no por frase completa (21-sep-2026)

Javier, probando el buscador: *"solo me busca, me deja buscar valores individuales, como por ejemplo la serie, marca... pero solo por separado. No me deja ingresar el nombre del equipo completo, como por ejemplo Hp Probook 640 G2"*.

**Causa:** `GET /api/activos` comparaba el termino de busqueda COMPLETO contra cada campo por separado (`numeroSerie contains X` OR `marca contains X` OR `modelo contains X`). Marca ("Hp") y modelo ("ProBook 640 G2") son columnas distintas, asi que ningun campo por si solo contiene jamas la frase completa "Hp Probook 640 G2" -- la busqueda solo funcionaba si el termino coincidia entero con UN campo (ej. buscar solo "Probook" si encontraba modelo).

**Solucion:** el termino se separa en palabras: cada palabra debe aparecer en ALGUNO de los campos (numeroSerie, marca, modelo, nombreEquipo), no necesariamente en el mismo. "Hp Probook 640 G2" ahora matchea un activo con marca="Hp" y modelo="ProBook 640 G2" porque cada palabra encuentra su campo, aunque esten repartidas en columnas distintas.

## 2.64 Historial de Activo: las entradas de mantención muestran la fecha del evento (21-sep-2026)

Javier: *"en el historial de evento... la mantención, la idea es que salga la mantención realizada, la idea es que salga la fecha en que se realizó la mantención. Y si sale mantención programada, la idea es que salga la fecha de esa mantención programada"*.

**Causa:** las entradas de `AssetHistory` para mantención (tipo "mantencion") describían el evento ("Mantención realizada", "Mantención programada", "Mantención completada") sin la fecha real del evento -- solo el `createdAt` de la entrada (el momento en que se hizo el clic o se importó la fila) aparece en la línea de tiempo, que puede ser muy distinta de cuándo se realizó o para cuándo se programó la mantención (esto se nota especialmente en datos importados: una mantención "realizada" el 2025-03-30 se ve en el historial con fecha de creación 2026-09-21).

**Solución:** la fecha del evento se agrega al texto de la descripción en los cuatro lugares que crean una entrada de historial de mantención:
- Import (`procesarFila.ts`): "Mantención realizada el 30-03-2025" / "Mantención programada el 30-03-2026".
- Crear mantención con fecha programada (`POST /api/mantenciones`): "Mantención Preventiva programada para el ...".
- Completar mantención (`POST /api/mantenciones/[id]/completar`): "Mantención Preventiva realizada el ...".
- Editar mantención a completada (`PUT /api/mantenciones/[id]`): "Mantención Preventiva realizada el ...".

## 2.65 Historial de asignaciones importado: una línea por asignación en vez de un contador (21-sep-2026)

Javier, revisando el resultado de SPEC 2.61: *"no se ve tan cómodo el nombre de +1 o +2, ¿no sería mejor crear una fila por cada asignación y poner sin datos de la persona?"*.

**Antes:** una sola línea de historial citando el texto literal del Excel: "Historial previo a la migración: asignado 1+ veces (sin datos de la persona)".

**Ahora:** se crea UNA línea de historial por cada asignación que indique el Excel. Si el valor es un número exacto (1, 2...) se crean esa cantidad de líneas idénticas: "Asignación histórica previa a la migración, sin datos de la persona". Si el valor es impreciso ("1+", que no es un número real), se crea 1 sola línea con el texto original entre paréntesis, para no perder el matiz de "al menos": "... (dato original: \"1+\")". Tope defensivo de 20 líneas por activo, para que un valor absurdo en el Excel no genere cientos de filas de historial.

## 2.66 Export de Activos: completo, ordenado y con resumen (21-sep-2026)

Javier: *"hay que hacer el export de los activos, que podrías agregar para que sea intuitivo, fácil de leer y tenga todos los datos de los activos"*.

**Faltaba:** el export (`GET /api/activos/exportar`) no traía **Sede** -- justo el dato más relevante para auditar un sistema multi-sede -- ni Nombre Equipo, Fecha de Baja, Fecha de Venta, Conectividad, Lista de Distribución, Incidencia, N° Activación, Tipo Plan, Tiene Cargador ni Fecha de Creación. Era un subconjunto de la ficha del activo, no el detalle completo.

**Cambios:**
- Se agregan todos los campos del Activo que faltaban (listados arriba).
- Las columnas se reordenan en grupos lógicos: Identificación → Estado y ubicación → Asignación → Especificaciones técnicas → Microsoft/gestión → Fechas → Otros -- en vez del orden en que se habían ido agregando campos históricamente.
- Se activa el filtro de columnas de Excel (`!autofilter`) sobre toda la tabla, para poder filtrar/ordenar cualquier columna sin armar una tabla dinámica aparte.
- Se agrega una segunda hoja "Resumen": conteo de activos por Sede y por Estado, con fila de totales -- el mismo tipo de verificación que se hace a mano al revisar una importación, ahora disponible en cada export.
- El orden de filas pasa a ser por Sede, luego Categoría, luego Marca (antes era por fecha de creación, que no agrupa nada útil para leer).

**No incluido:** estilos de celda (negrita, colores) -- la librería `xlsx` que usa el proyecto (SheetJS, edición gratuita) no persiste estilos personalizados al escribir el archivo; se comprobó directamente que un `.s` con negrita/color no aparece en el archivo generado. El filtro de columnas y la hoja de Resumen sí son soportados y sí funcionan.

## 2.67 Export de Activos: una hoja por Sede (21-sep-2026)

Javier, sobre el export de SPEC 2.66: *"que tal si lo haces más ordenado, una hoja por sede y las columnas con filtro sus títulos"*.

**Cambio:** en vez de una sola hoja "Activos" con todas las sedes mezcladas, el archivo ahora trae una hoja por Sede (más "Resumen" como primera hoja, para ver el total de un vistazo). Cada hoja de sede tiene el mismo detalle completo de columnas de SPEC 2.66 y el mismo filtro de columnas activado. Los activos sin sede asignada quedan en una hoja aparte "(Sin sede)".

**Detalle técnico:** el nombre de cada hoja se sanea (máximo 31 caracteres, sin los símbolos `\ / ? * [ ]`, que Excel no permite en un nombre de hoja) y se numeran si dos sedes distintas truncaran al mismo nombre.

## 2.68 Export de Activos: colores por grupo de columnas y mas datos (22-sep-2026)

Javier, sobre un Excel de referencia (`Inventario_Normalizado_Con_Sede.xlsx`) que subio: *"ponele colores a las columnas que se vea atractivo y sea intuitivo y te faltan mas datos, la idea es que tenga datos como estos"*.

**Sobre los colores:** SPEC 2.66 habia dejado registrado que la libreria `xlsx` (SheetJS, edicion gratuita) no persiste estilos personalizados de celda -- se comprobo de nuevo, dos veces, inspeccionando directamente el `styles.xml` dentro del `.xlsx` generado, sin encontrar el negrita/color aplicado. Se le pregunto a Javier si agregar una libreria nueva (`exceljs`) que si soporta estilos reales, o dejar el export sin colores; eligio agregarla. El proyecto ahora usa `exceljs` en vez de `xlsx` para este export.

**Cambios:**
- Cada grupo de columnas (Identificacion, Estado y ubicacion, Asignacion, Especificaciones tecnicas, Microsoft/gestion, Mantencion, Fechas, Otros) tiene su propio color de encabezado, con texto en negrita.
- Las filas de datos alternan un fondo gris muy claro para que sean mas faciles de seguir con la vista en tablas largas.
- La fila de encabezado queda fija (no se pierde de vista al hacer scroll) en cada hoja.
- Se agregan los campos que Javier senalo en su Excel de referencia y que no vivian en el Activo sino en otras tablas: **Jefatura**, **Supervisor** y **Correo Empresa** (del empleado asignado), **Fecha de Entrega** (de la asignacion vigente del activo) y **Ultima Mantencion Realizada** / **Proxima Mantencion Programada** (calculadas a partir de las mantenciones del activo: la fecha realizada mas reciente entre las completadas, y la fecha programada mas cercana entre las pendientes).
- El filtro de columnas de Excel y la hoja "Resumen" con conteo por Sede y Estado (SPEC 2.66) y la organizacion de una hoja por Sede (SPEC 2.67) se mantienen igual.

## 2.69 Dashboard: alertas de Mantencion no mostraban todas las sedes al elegir "Todas las sedes" (22-sep-2026)

Javier, probando el Dashboard con admin y el selector en "Todas las sedes": *"en dashboard en la zona de alertas al elejir todas las sedes solo me entrega la sedes de santiago"*.

**Causa:** `prisma.maintenance.findMany` (mantenciones pendientes) no tenia `orderBy`, asi que Postgres devolvia las filas en un orden arbitrario (en la practica, orden de insercion). El total contado (`Mantenciones Pend.`, la tarjeta KPI) siempre fue correcto y sumaba las tres sedes -- el problema estaba en el panel de Alertas, que recorta a los primeros 5 "vencidas" y primeros 5 "proximas" con `slice(0, 5)`. Con Santiago siendo la sede con mas historial (y por lo tanto la que aparecia primero en un resultado sin ordenar), sus mantenciones llenaban el cupo de 5 antes de que las de Concepcion o Peru tuvieran oportunidad de aparecer, aunque el filtro de sede en si funcionaba bien (con una sede especifica elegida, sus propias alertas se veian sin problema).

**Solucion:**
- Se agrega `orderBy: { fechaProgramada: "asc" }` a la consulta. Ademas de corregir el sesgo hacia una sola sede, esto es lo correcto para "urgencia": la vencida mas antigua aparece primero, la proxima mas cercana tambien.
- Se agrega la sede de cada alerta directamente en la tarjeta (`asset.sede.nombre` para Mantenciones y Kit/EPP, que si son catalogos por sede) para que, con varias sedes mezcladas en la misma lista, quede claro de donde es cada una sin tener que entrar al detalle. Las alertas de "Stock de Activos por categoria" muestran "Todas las sedes" en vez de una sede especifica -- a diferencia de Kit/EPP, ese stock se cuenta sumando el inventario de todas las sedes junto, no es un catalogo separado por sede.

## 2.70 Alertas y tarjetas de Activos: sin tope fijo, texto que no se corta, y sin encogerse al agrandar la ventana (22-sep-2026)

Javier, tres pedidos seguidos sobre el mismo panel de Alertas del Dashboard y las tarjetas de Activos:
- *"la idea es que muestre todo no una cantidad fijas de alertas"*
- *"haz que las tarjetas que usamos sean responsive y se adaptan al tamaño del contenido"*
- *"el problema es que al agrandar la pantalla las tarjetas se achican y todo aparece afuera"*

**1. Tope fijo de 5 alertas.** `mantencionesVencidas`/`mantencionesProximas` recortaban con `.slice(0, 5)` sin importar cuantas hubiera en realidad (la tarjeta KPI "Mantenciones Pend." si mostraba el total real). Se quita el recorte -- se listan todas. El panel ya era scrolleable (`max-h-96 overflow-y-auto`), asi que una lista larga (68 vencidas en los datos de prueba) no rompe el layout del Dashboard, solo scrollea.

**2. Texto cortado con "...".** Las lineas de detalle de cada alerta (`AlertsPanel.tsx`) y de cada tarjeta de Activo (`AssetCard.tsx`: nombre/modelo, numero de serie, nombre y cargo del empleado asignado) usaban `truncate`, que corta a una sola linea sin importar el largo real del contenido. Se reemplaza por `break-words` para que el texto envuelva en varias lineas y la tarjeta crezca segun su contenido, y se agrega `shrink-0` a los iconos y badges de cada tarjeta para que no se compriman cuando el texto de al lado ocupa mas espacio. No se toco la vista de tabla de Activos (columnas TIPO/N° SERIE/etc.): ahi el recorte con `max-w-xs` mantiene las filas de una tabla densa con alto uniforme, un criterio distinto al de una tarjeta.

**3. Tarjetas que se achican al agrandar la ventana.** Causa real, medida directamente: el Sidebar pasa de overlay a `fixed lg:static` (ocupando 256px fijos del ancho) justo en el mismo breakpoint de Tailwind (`lg`, 1024px) en el que varias grillas de tarjetas subian su numero de columnas (`lg:grid-cols-3`, `lg:grid-cols-6`). Al cruzar los 1024px, dos cosas malas pasaban a la vez: aparecia el Sidebar (menos ancho disponible) Y se repartia ese ancho menor entre mas columnas -- una tarjeta de Activos medida pasaba de 460px a 221px (menos de la mitad) al agrandar la ventana de 1000 a 1030px. La solucion no es dejar de subir columnas, es no hacerlo en el mismo breakpoint en que el Sidebar le quita espacio al contenido: se corren esos saltos de columnas de `lg` a `xl` (1280px) en las cuatro grillas afectadas (KPIs principales, segunda fila de KPIs, Activos por Categoria/Kit/EPP del Dashboard, y las tarjetas de Activos). De paso se corrige que la segunda fila de KPIs declaraba `grid-cols-5` para 4 tarjetas reales.

## 2.71 Importar Activos: el link "Ver activos importados" no mostraba los datos recien importados (22-sep-2026)

Javier, tras una importacion exitosa: *"cuando realiza una importacion y sale exitoso y sale el boton ir activos voy a activos pero la pagina no recarga y solo muestra activo 0 como si no hubiera importado"*.

Causa real: el boton "Ver activos importados ->" en la pantalla de exito era un `<Link>` de `next/link`, que hace navegacion "soft" (del lado del cliente) del App Router. `/activos` es una pagina 100% cliente que carga sus datos (stats, listado) en `useEffect` al montarse -- y como el usuario ya habia visitado `/activos` antes de entrar a Importar, el Router Cache del cliente reutilizaba esa instancia ya montada (con su estado ya resuelto en 0) en vez de remontarla, asi que esos `useEffect` nunca volvian a correr y la pantalla seguia mostrando el conteo de antes de importar. No es un problema de la base de datos ni de la API: los datos si quedaban importados, solo no se reflejaban en pantalla sin un refresh manual (F5).

Se cambia ese link de `<Link href="/activos">` a un `<a href="/activos">` normal, que fuerza una recarga completa del navegador: `/activos` se vuelve a pedir entero al servidor y sus `useEffect` corren de cero, mostrando el conteo real. Alcance acotado a este boton -- el resto de la navegacion de la app sigue usando `Link` para las transiciones rapidas habituales, que es el comportamiento correcto en todas las demas pantallas.

## 2.72 Buscador de Mantenciones: acotado solo a activo/empleado, sin la palabra completa, y con historial completo por defecto (22-sep-2026)

Javier, tres pedidos seguidos sobre el mismo buscador:
- *"en mantencion al ingresar un nombre completo del equipo no funciona"*
- *"el buscador nos deberia dejar buscar por empleado, o por activo y sus propiedades en mantenciones ya que es muy pobre y por defecto el periodo deberia esta en historial completo"*
- *"el buscado de mantencion deberia permitir buscar por el empleado y sus datos o por activo y sus datos, solo eso ya que son los datos involucrados en una mantencion"*

**1. Nombre de equipo completo no encontraba nada.** Mismo bug ya corregido en Activos (SPEC 2.63): el termino de busqueda se comparaba completo contra cada campo por separado, asi que una frase como "Hp ProBook 640 G2" no calzaba en ningun campo individual (marca="Hp", modelo="ProBook 640 G2" viven en columnas distintas). Se aplica la misma solucion: la frase se separa en palabras y cada palabra debe aparecer en ALGUNO de los campos habilitados, no necesariamente el mismo.

**2. Alcance del buscador.** Se acota exclusivamente a los dos datos "involucrados en una mantencion" -- el activo y el empleado que lo tiene asignado -- y se sacan los campos de texto libre propios de la mantencion (`descripcion`, `realizadoPor`, `proveedorExterno`, `resultado`), que Javier no considera parte de lo que se deberia poder buscar ahi. Campos habilitados:
- Del activo: numero de serie, marca, modelo, nombre de equipo, numero de telefono, ubicacion fisica, categoria.
- Del empleado actualmente asignado al activo (`asset.empleadoActual`): nombres, apellido paterno, apellido materno, RUT, correo empresa.

**3. Periodo por defecto.** El selector de periodo (Dia/Semana/Mes/.../Historial completo) partia en "Mes", ocultando en silencio cualquier mantencion fuera de los ultimos 30 dias -- justo lo que hacia parecer "pobre" al buscador cuando en realidad el dato si existia, solo estaba fuera de la ventana. Pasa a partir en "Historial completo" (`dias: 0`, el sentinel ya usado por SPEC 2.51.2 para "sin ventana de tiempo").

## 2.73 Importación de Activos: un equipo podía quedar "En Mantención" sin ningún ticket de Mantención (22-sep-2026)

Javier, al revisar el listado de equipos en mantención: *"no todos los equipos en mantencion tiene la solicitude de mantencion registrada por lo que veo: J8HZGJ3"*.

Causa: la columna `Estado` del Excel y las columnas de fecha (`Mantención`/`Próxima Mantención`) se procesaban de forma independiente en `procesarFila.ts`. Una fila con `Estado = "Mantención"` pero sin ninguna de esas dos fechas dejaba el Activo creado con `estado: en_mantencion`, pero el bloque que crea el registro de `Maintenance` solo se ejecutaba si `fechaMantencionStr || proximaMantencionStr` existía -- sin fecha, no había ticket. El resultado: un equipo "varado" en mantención sin forma de completarlo desde el flujo normal (el botón "Completar Mantención" vive dentro de un ticket, y sin ticket no hay dónde hacer clic), y sin aparecer en la cola de pendientes del módulo de Mantenciones. Se auditaron los equipos actuales en `en_mantencion`: 7 de 9 no tenían ningún ticket asociado.

**Fix del import:** cuando una fila resuelve `estado = "en_mantencion"` y no trae ninguna fecha de mantención, se crea igual un ticket `pendiente` (fecha programada = hoy, como referencia, ya que no se conoce la fecha real de ingreso a mantención), con el mismo tipo "Preventiva" que ya usa el resto del import cuando no hay más información. Confirmado por Javier: *"si tiene estado de mantencion se crea una solicitud"*.

**Corrección de datos existentes:** se creó retroactivamente un ticket `pendiente` (mismo criterio: fecha de hoy, tipo "Preventiva") para cada uno de los 7 activos ya importados que habían quedado sin ticket, incluyendo el caso reportado (`J8HZGJ3`, Dell Inspirion 15 3501). No fue necesario tocar el estado del Activo (ya estaba correctamente en `en_mantencion`): `POST /api/mantenciones` no revalida la transición de estado cuando el activo ya está en mantención, así que crear el ticket no tuvo otro efecto secundario.

## 2.74 Historial de asignaciones importado: filas repetidas indistinguibles entre sí (22-sep-2026)

Tras revisar cómo se representa en la base el "Historial de asignaciones" (contador sin nombre de persona, ver SPEC 2.65), Javier preguntó por qué no se modela como filas de `Assignment` reales -- la respuesta: `Assignment.employeeId` es un campo obligatorio (no acepta `null`), y no hay RUT ni nombre de esa persona en el dato viejo del Excel para vincular una fila a un `Employee` real, así que el registro se sigue guardando en `AssetHistory` (línea de timeline sin dueño), no en `Assignment`. Se evaluó y se descartó crear un `Employee` "No registrado" compartido para poder usar `Assignment` -- decisión explícita de Javier de no crear ese empleado placeholder.

Al revisar cómo se ve eso en pantalla sí apareció un problema real: cuando el Excel trae un número exacto mayor a 1 (ej. "2"), se crean esa cantidad de filas en `AssetHistory`, todas con el texto EXACTO igual y creadas en el mismo milisegundo -- en la línea de tiempo de la ficha del activo se ven una detrás de otra, indistinguibles entre sí, como si fuera un evento duplicado por error en vez de dos asignaciones históricas distintas. Se corrige agregando un contador al texto cuando hay más de una fila: "Asignación histórica previa a la migración, sin datos de la persona (1 de 2)" / "(2 de 2)".

## 2.75 Historial de asignaciones sin persona: también visible en el cuadro "Historial de Asignaciones" (22-sep-2026)

Javier: *"hay que corregir el tema de asignacion, cuando se registran las asignaciones del excel +1 o +2 tambien deberia aparecer en el cuadro de asignaciones llamado historia de asignaciones"*.

Las asignaciones históricas sin persona (SPEC 2.65/2.74 -- el contador "1+"/"2+" del Excel viejo, sin RUT ni nombre) quedan en `AssetHistory`, no en `Assignment` (que exige un empleado real, ver SPEC 2.74 para el porqué). Antes solo aparecían mezcladas dentro de "Historial de Eventos" (la línea de tiempo genérica, más abajo en la ficha); el cuadro "Historial de Asignaciones" (arriba, el que muestra nombre/RUT/fecha con tarjetas) solo leía `asset.assignments` y no las mostraba en absoluto.

Se agrega una marca estructurada (`AssetHistory.datosNuevos = { historicaSinPersona: true, indice, total }`) a esas filas al crearlas en el import, y la ficha del activo las trae aparte y las agrega al mismo cuadro "Historial de Asignaciones" -- con tarjeta visualmente distinta (borde punteado, texto en gris/cursiva) y placeholders explícitos ("Persona no registrada", "RUT: No registrado", "Fecha no registrada", badge "Histórica (sin datos)") en vez de mezclarlas con las asignaciones reales o inventar datos que no existen.

## 2.76 Selector de equipos en Onboarding: mostraba solo 5 de los disponibles (22-sep-2026)

Javier: *"estoy viendo que hay un error al elegir equipos en onboarding cuando hay mas de 40 solo me muestra los primeros 5 la idea es que me permita navegar entre esos que hay"*.

Causa: en el formulario de Nueva Solicitud, al expandir una categoría para elegir un equipo específico a reservar, el fetch de equipos disponibles traía `limit=5` fijo -- el badge de la categoría sí mostraba el total real (ej. "42 disponibles", viene de `pagination.total`), pero la lista desplegable de abajo solo tenía esos primeros 5 resultados y no había forma de llegar a los demás.

Se sube el límite a 100 (mismo orden de magnitud que ya usa `SelectorActivos` en Guías de Despacho, que pide 200) y la lista desplegable gana scroll propio (`max-h-60 overflow-y-auto`) para poder recorrer todos los disponibles sin que la pantalla del formulario crezca sin límite.

## 2.77 Identidad visual SCL, sistema de diseño y formulario único de Activo (22-sep-2026)

Pedido de Javier: alinear el aspecto del sistema con la marca de sclconsultores.com (paleta, tipografía, botones, tarjetas) sin tocar la estructura de un sistema de gestión, y aprovechar para eliminar código duplicado.

**Sistema de diseño.** Los tokens viven en `app/src/app/globals.css` (bloque `@theme` de Tailwind v4, que reemplaza a `tailwind.config`); ningún componente usa colores hex sueltos.
- Paleta tomada del CSS real del sitio: `primary-500 #009CD2`, `primary-600 #0080B0`, `primary-800 #005A7D`, `primary-950 #002B4D` (los demás tonos de la escala son derivados), acento naranjo `accent #D88024`, grises de marca `brand-gray`. Los botones sólidos usan `primary-700`: blanco sobre `primary-600` da 4,45:1, bajo el mínimo AA.
- Tipografía Montserrat vía `next/font` (autohospedada). Antes se cargaba Inter pero una regla `font-family: Arial` la anulaba.
- Primitivas de CSS: `card`, `field-input`, `field-label`, `field-checkbox`, `table-th`, además de radios (`rounded-card`, `rounded-control`), sombras y animaciones con nombre.
- Componentes compartidos en `components/ui/`: `Button` (con `buttonClasses()` para `<Link>` y variante `link` "Ver más →"), `PageHeader`, `StatCard`/`StatGrid`, `Tabs`/`NavTabs`, `Pagination`, `Badge` (`AssetStatusBadge`, `AssetConditionBadge`, `ActiveBadge`).
- Colores literales para lo que no lee clases (gráficos SVG, Excel): `lib/constants/coloresGraficos.ts`, espejo de los tokens.

**Presentación de estados del activo: un único punto de verdad.** `lib/constants/estadosActivo.ts` define etiqueta, color de badge y color de gráfico para cada `EstadoActivo` y `CondicionActivo`. Reemplaza nueve copias que ya se habían separado: "En Mantención" salía amarillo en Activos y naranjo en Reportes, y Reportes > Inventario mostraba el valor crudo del enum (`en_mantencion`, `danado`). Cambio visible: todos los estados usan ahora el mismo color en todas las pantallas.

**Formulario único de Activo.** Nuevo y Editar Activo pasan a usar un solo componente, `components/activos/ActivoForm.tsx`, con `modo: "crear" | "editar"`. Antes eran dos copias que se habían desalineado: Editar pedía Sistema Operativo, Antivirus y Licencia Microsoft 365 como texto libre, mientras Nuevo los tomaba de los catálogos administrables. Decisión (Javier): **en ambos modos se eligen desde los catálogos (`CatalogSelect`), no como texto libre.** Un valor histórico que no esté en el catálogo se sigue mostrando como opción, así que editar un activo antiguo no pierde el dato. Diferencias que se mantienen a propósito, por modo:
- Crear: se elige la Sede (después solo cambia vía Guía de Despacho, 2.8.3); el estado queda fijo en Disponible; el N° de serie es obligatorio.
- Editar: el estado es editable y aparece "Nombre del Equipo" (al crear se define en la asignación, porque se arma con el nombre de quien recibe el equipo).

**API `GET /api/dashboard/stats`.** El arreglo `estadosData` (gráfico de estados) incluye ahora `vendido`, igual que la página del Dashboard desde 2.16; antes lo omitía. `kpis` suma `vendidoAssets`. Los colores de `estadosData` salen de `ESTADO_ACTIVO_COLOR`.

**Correcciones visuales de paso.** Los modales hechos a mano usaban `bg-opacity-50`, que Tailwind v4 eliminó, así que el fondo se veía negro opaco; los modales de confirmación pasan a `ConfirmDialog` y el resto a `bg-black/50`. Se elimina `hooks/useAssetFilters.ts`, que no se importaba en ningún lado y tenía etiquetas obsoletas (`reutilizable`, condiciones `bueno`/`regular`/`malo`).

## 2.78 Rediseño visual: navbar superior, modo oscuro, tarjetas destacadas y logo oficial (23-sep-2026)

Pedido de Javier: rediseño exclusivamente visual (sin tocar lógica, API, validaciones ni modelos), con la paleta y el logo de sclconsultores.com, el patrón de navbar de velt.dev y tarjetas con inclinación 3D y gradiente radial inspiradas en un CodePen de referencia. La guía de uso para pantallas nuevas está en `app/docs/DESIGN_SYSTEM.md`.

**Logo oficial.** `public/logo-scl.png` era un banner promocional oscuro, no el logo. Se reemplaza por el logo oficial (`sclconsultores.com/logo.png`) y el favicon pasa a `app/icon.png` (ícono oficial). El componente `Logo` lo pone sobre una pastilla clara en modo oscuro, porque el "CONSULTORES" gris del logo no se lee sobre fondo oscuro. Los PDFs no cambian: `pdfSclBrand.tsx` ya dibuja la marca.

**Navbar superior en vez de Sidebar.** `components/layout/Navbar.tsx` reemplaza a `Sidebar.tsx` (eliminado): sticky, transparente arriba y con fondo translúcido + blur al hacer scroll; logo a la izquierda, módulos al centro (desde 1280px; bajo eso, menú desplegable), selector de sede, cambio de tema y menú de usuario a la derecha. Los ítems siguen saliendo de la matriz de permisos (SPEC 1.3.1) y el selector de sede conserva el comportamiento de 2.30 (fijo para quien no es admin). El contenido queda centrado con ancho máximo de 1536px. Se corrige de paso `overflow-x: hidden` en `html`/`body`, que rompía `position: sticky` (pasa a `clip`).

**Modo oscuro (nuevo).** La app era solo clara. El tema vive en `<html data-theme>`; un script en `<head>` (`lib/tema.ts`) lo aplica antes de pintar, según la preferencia guardada o la del sistema operativo, y `ThemeToggle` lo cambia. Estrategia:
- Tokens semánticos en `globals.css` (`canvas`, `surface`, `surface-muted`, `fg`, `fg-muted`, `fg-subtle`, `line`, `line-strong`) con valores por tema.
- Migración de los colores fijos de todas las pantallas a esos tokens con `app/scripts/migrar-tokens-tema.mjs` (1.513 reemplazos en 84 archivos; idempotente).
- En oscuro, las escalas de Tailwind se ajustan solas: 50–300 pasan a tintes translúcidos y 700–950 a tonos claros; así badges y avisos siguen legibles sin `dark:` por componente.
- Tokens fijos para rellenos sólidos con texto blanco (`brand`, `navy`, `danger`, `success`), que no se invierten.
- Borde por defecto al token `line` (Tailwind v4 usa `currentColor`, que dejaba líneas oscuras); ejes, grilla y tooltip de Recharts siguen el tema desde `globals.css`.

**Tarjetas destacadas (`card-feature`) con inclinación 3D.** Utilidad `card-feature`: halo radial y círculo del color de acento en la esquina superior derecha, borde teñido hacia esa esquina y círculo que crece al hover. **El color sale de un dato real** (`lib/constants/tonos.ts`: `ESTADO_ACTIVO_TONO`, `TONO_ACENTO`, `TONO_ESTILO`), p. ej. disponible verde, asignado azul, baja rojo. `<Tilt>` agrega la inclinación con `vanilla-tilt` (nueva dependencia, cargada con `import()` dinámico solo donde se usa; se desactiva con `prefers-reduced-motion` y en pantallas táctiles). Dónde se aplica:
- Con inclinación: KPIs de Dashboard, Mantenciones y Compras; tarjetas de estado de Activos (`StatsBar`) y de filtro de Personal; accesos de Reportes y resúmenes de Stock y Obsoletos; secciones de Configuración.
- Solo acento, sin inclinación: vista de tarjetas de Activos (`AssetCard`), porque puede tener cientos.
- Paneles de contenido (formularios, tablas, detalles): superficie normal, sin inclinación, para no mover lo que se está editando.

Cambios visibles de paso: las tarjetas de estado de Activos marcan la seleccionada con un anillo de su color en vez de relleno sólido; el `Toast` pasa a superficie opaca teñida (un fondo `bg-*-50` quedaba translúcido en oscuro); el `Modal` gana borde; "Guías de Despacho" y "Configuración" llevan tilde en el menú.

## 2.79 Se elimina el módulo Reportes (23-sep-2026)

Pedido de Javier: el módulo no se usa. La pestaña "Reportes" del Dashboard ya estaba oculta (comentada en `DashboardTabs`), pero las pantallas seguían accesibles por URL. Se elimina completo:
- Pantallas `/reportes` (índice), `/reportes/inventario`, `/reportes/stock`, `/reportes/empleados`, `/reportes/obsoletos` y `/reportes/trazabilidad`.
- APIs `/api/reportes/{inventario,stock,empleados,obsoletos}/excel`, `/api/reportes/trazabilidad` y `/api/reportes/compras` (esta última ya no la llamaba ninguna pantalla).
- `components/reportes/EmpleadosSearchList.tsx`, su test (`__tests__/app/reportes/page.test.tsx`) y `DashboardTabs`: con una sola pestaña ("Resumen") la barra no aportaba nada.

Se mantiene el recurso `reportes` de la matriz de permisos (SPEC 1.3.1) con el mismo nombre: sigue controlando el Dashboard (`/`, `/api/dashboard/stats`, `/api/dashboard/alertas`). La exportación de Activos (`/api/activos/exportar`) es independiente y no cambia; el historial de un equipo se sigue viendo en su ficha (`/activos/[id]`).

## 2.80 La sede del navbar es el valor por defecto de los formularios de creación (23-sep-2026)

Pedido de Javier: los listados ya filtraban por la sede del navbar, pero los formularios de creación precargaban solo `session.user.sedeId`. Un admin (sin sede propia) tenía que elegir la sede a mano en cada formulario aunque ya la hubiera elegido en el navbar. Solo es comodidad de interfaz: las reglas de seguridad de `sedeScope.ts` no cambian.

**Regla.** La sede por defecto de un registro nuevo es: (a) la sede efectiva del navbar; (b) si el navbar está en "Todas las sedes", la propia de la sesión; (c) si tampoco hay, vacío, y el formulario exige elegirla. El admin puede cambiarla en el formulario; el técnico sigue fijo en su sede. Un campo que el usuario ya tocó no lo pisa un cambio posterior del navbar; uno sin tocar sí se completa si el valor del navbar llega tarde (hidratación). Los formularios de edición y detalle no cambian: un registro existente conserva su sede. Donde la sede sale del propio dato, gana el dato: en offboarding y cambio de equipo, la sede de la solicitud es la del empleado.

**Implementación (un solo mecanismo).**
- `useSedePorDefecto()` y `useCampoSede()` en `SedeSeleccionadaProvider.tsx`. `useCampoSede` devuelve `[valor, setValor, reiniciar]`: mientras no se use el setter, el valor es la sede por defecto (estado derivado, sin `useEffect`); el setter marca el campo como elegido. Reemplaza los `useEffect` de precarga de Nueva Solicitud, Nueva Compra, Nueva Guía (sede origen; la destino no se precarga), Importar Activos, Kit/EPP (solo al crear) y Nuevo Activo.
- Cuando el formulario ya tiene elecciones que dependen de la sede (equipos de una guía o de una compra, equipo específico o Kit/EPP de un onboarding, archivo ya validado en la importación), la sede queda fijada, para que un cambio del navbar no deje esas elecciones en otra sede.
- Servidor: `sedeWhereConFiltro(session, sedeId)` en `sedeScope.ts` (el filtro solo aplica con `tieneVisibilidadTotal`) y `leerSedeFiltroDesdeCookie()` en `lib/auth/sedeFiltroCookie.ts`. Los usa el Dashboard; la cookie comparte su nombre con el provider vía `lib/constants/sede.ts`.

**Importación de activos.** Para admin, dejar la sede vacía significa "detectar por la columna Sede" del archivo. Con la precarga, un archivo multi-sede quedaría completo en la sede del navbar, así que el texto de ayuda indica elegir "Detectar automáticamente" en ese caso.

**Correcciones de paso.**
- Nueva Solicitud, modal "Crear empleado": no enviaba `sedeId` y `POST /api/empleados` la exige para admin (`sedeIdParaCrear` con `requerido`), así que un admin no podía crear empleados desde ahí. Ahora envía la sede de la solicitud y, para admin, muestra un selector de sede obligatorio.
- Nueva Solicitud, búsqueda de empleado: se acota a la sede del navbar cuando hay una elegida.
- Nueva Solicitud, cambio de equipo: `SeleccionarCambioEquipo` no recibía `sedeId` y ofrecía reemplazos de todas las sedes; ahora recibe la sede de la solicitud.
- Configuración > Usuarios: la descripción del rol Técnico decía "ve todas las sedes"; ahora dice que trabaja solo en su propia sede (SPEC 2.29.1).

`AsignarActivoForm` no se modificó: no lo renderiza ninguna pantalla.

## 2.81 Condición del cargador con enum propio (23-sep-2026)

La condición del cargador (`Assignment.condicionCargadorEntrega` y `condicionCargadorDevolucion`) deja de usar `EstadoDevolucionTipo` y pasa a un enum propio, `CondicionCargador`, con nombres más claros: `ok` → `operativo`, `danado` → `con_danos`, `no_aplica` → `no_incluido`. Se elimina `pendiente`, que ningún flujo usaba. En pantalla y en las actas, `no_incluido` se lee "No incluido" al entregar y "No devuelto" al devolver. Los valores y etiquetas viven en un único lugar, `lib/constants/condicionCargador.ts`, que usan los formularios (`SelectCondicionCargador`), la validación Zod y las actas PDF.

Migración `20260923120000_condicion_cargador`: recrea el tipo convirtiendo los datos existentes con `CASE`, aborta si encuentra filas en `pendiente` (no tienen equivalente) y elimina `EstadoDevolucionTipo`, que solo usaban esas dos columnas.

## 2.82 Las solicitudes se crean y se cierran en el mismo formulario (23-sep-2026)

Pedido de Javier: sin etapas intermedias. Una solicitud se crea completa en `/solicitudes/nueva` y nace cerrada; la página de detalle queda como vista de consulta. Las máquinas de estado de 2.5.2 siguen existiendo (`workflowStateMachine.ts`, `PATCH /api/solicitudes/[id]/transicion`), pero ya no hay botones que las recorran salvo el cierre de tickets heredados.

**`POST /api/solicitudes`: el ticket nace en su estado final o no se crea (400 con el motivo).**
- **Onboarding** → `registro_rrhh` con `fechaCierre`, con o sin equipos. Exige que cada categoría requerida tenga su equipo elegido, fecha y lugar de entrega (u OT y ciudad, si es por Chilexpress) cuando hay equipos, que todo el Kit/EPP requerido se entregue al crear, y que Kit de Bienvenida / EPP marcados tengan al menos un artículo. Antes nacía en `solicitud_recibida`, `gestion_ti` o `equipos_entregados`.
- **Cambio de equipo** → `confirmacion_rrhh` (sin cambios: la validación ya exigía equipo viejo, estado de devolución y equipo nuevo).
- **Offboarding** → `consolidacion_cierre` y empleado desvinculado. Exige calificar la devolución de todas las asignaciones activas y todo el EPP del empleado ("No devolvió" cuenta como calificado). También cierra si el empleado no tiene nada que devolver; antes ese caso quedaba en `solicitud_emitida`.

**Detalle de la solicitud.** Se eliminan el stepper de progreso y los paneles de etapa (Gestión TI, coordinación de entrega, cambio de equipo, recepción de equipos, "Siguiente paso") con sus handlers, y el componente `SeleccionarEquiposOnboarding`, que ya no usaba nadie. Se mantienen el checklist de pendientes, la entrega de Kit/EPP, los documentos, la actividad y la cancelación.

**Tickets heredados.** Un ticket abierto solo puede venir del flujo anterior. El detalle muestra un aviso y, si está a un paso del final (`equipos_entregados`, `cambio_ejecutado`, `equipo_recibido`), un botón "Cerrar ticket" que usa la transición existente con sus validaciones. En etapas anteriores solo queda la cancelación, si el ticket no ejecutó efectos.

## 2.83 Tabla de equipos única en los documentos, con N° de Serie y Especificaciones (23-sep-2026)

Pedido de Javier. Los documentos de los cinco procesos (Comprobante de Entrega, presencial y por OT; Acta de Devolución, presencial y por OT; Comprobante de Cambio) comparten ahora una sola tabla de equipos, `lib/templates/TablaEquipoActa.tsx`. Reemplaza tres copias casi idénticas (la tabla del Comprobante de Entrega, la del Acta de Devolución y el `TablaEquipo` local del Comprobante de Cambio).

- **Columnas:** Equipo · Marca · **N° de Serie** (en negrita, "—" si falta) · Descripción (modelo) · Especificaciones · una última columna cuyo título depende del documento ("Entregado" o "Estado"). El Comprobante de Cambio la usa dos veces, para el equipo nuevo y el devuelto. La condición del cargador va en una tabla pequeña debajo (N° de Serie del equipo · Condición · Observación), solo para los equipos que tienen cargador registrado. En el Comprobante de Cambio las tablas van en modo compacto (letra de 8 pt) y los dos cargadores en una sola tabla al final, para que el documento quepa en una hoja.
- **Especificaciones** salen de `especificacionesActivo` (`lib/utils/assetSpecs.ts`), la misma fuente que usa el resto de la aplicación, una por línea: procesador, RAM, disco y sistema operativo en notebooks; IMEI, número y plan en celulares; pulgadas en monitores. Antes la entrega las juntaba en la descripción y la devolución y el cambio las omitían.
- **Devolución por OT (nuevo) y Cambio por OT:** cuando `medioDevolucion` o `medioCambio` es `chilexpress`, el documento agrega la misma cláusula que ya tenía la entrega por OT ("correspondiente a la Orden de Trabajo (OT) N° …"), con `otChilexpress` u `otCambioChilexpress`.
- **El Acta de Devolución lista solo lo devuelto en ese ticket** (`WorkflowRequest.assignmentIds`). Antes incluía toda devolución histórica del empleado, por ejemplo el equipo devuelto en un cambio de equipo anterior. Los equipos marcados "No devolvió" también aparecen, con estado "No devuelto". Los tickets antiguos sin `assignmentIds` conservan el criterio anterior.
- **Diagramación:** el bloque de firmas no se corta entre hojas y se redujo el espacio antes de las firmas, para que los documentos con filas más altas sigan cabiendo en una hoja A4.

El Anexo de Entrega (`AnexoEntregaTemplate.tsx`) no cambia: tiene otras columnas y otro sistema de estilos (`pdfStyles.ts`).

## 2.84 Cambio de equipo: varios equipos en una misma solicitud (23-sep-2026)

Pedido de Javier: el técnico debe poder cambiar la cantidad de equipos que quiera en un mismo ticket (uno, varios o todos los del empleado), de cualquier categoría.

- **Formulario** (`SeleccionarCambioEquipo`): los equipos activos del empleado aparecen con casillas. Por cada equipo marcado se elige el estado en que vuelve (Buen estado, Dañado, No devolvió), su cargador si lo tiene, el reemplazo y el cargador del reemplazo. El reemplazo sale de los disponibles de la **misma categoría** del equipo que se devuelve, en la sede de la solicitud, y un reemplazo ya elegido no se ofrece para otro equipo. Al menos un equipo marcado y cada uno completo son obligatorios; lo que falta se marca en rojo (mismo mecanismo que 2.82).
- **API** (`POST /api/solicitudes`, tipo `cambio_equipo`): el payload reemplaza los campos de un solo par (`oldAssignmentId`, `newAssetId`, `estadoDevolucionAnterior`…) por una lista `cambios` (mínimo uno). Zod rechaza un equipo o un reemplazo repetido. Todos los pares se ejecutan en la misma transacción: si uno falla, no se aplica ninguno. El ticket sigue naciendo cerrado.
- **`WorkflowRequest.assignmentIds`** guarda los pares en orden `[viejo1, nuevo1, viejo2, nuevo2, …]`; un ticket de un solo par sigue siendo `[viejo, nuevo]`, así que los tickets anteriores se leen igual.
- **Comprobante de Cambio**: las tablas de equipos nuevos y devueltos llevan una fila por equipo y la tabla de cargadores los lista todos. Con dos o más equipos el documento puede pasar a una segunda hoja; las firmas nunca se cortan. De paso, el estado del equipo devuelto es el real ("Devolución OK", "Devuelto dañado" o "No devuelto"); antes decía siempre "Devolución OK".
- Se elimina el modo "Ejecutar cambio" (`onSubmit`) del selector, que solo usaba la página de detalle antes de 2.82.

## 2.85 Textos legibles en historial y pantallas (23-sep-2026)

El historial del activo mostraba el valor interno del estado ("Devuelto por … Estado: danado"). Regla: **ningún texto visible muestra el valor interno de un enum**; se usan las etiquetas de `lib/constants/estadosActivo.ts`.

- Nuevas etiquetas `ESTADO_DEVOLUCION_LABEL` (ok = Buen estado, danado = Dañado, incompleto = Incompleto, no_devuelto = No devuelto) y la función `etiquetaCondicionActivo`.
- `assetHistoryService` y `workflowExecutionService` escriben el historial con etiquetas: estado de devolución, cambio de estado ("de "Disponible" a "En Mantención"") y nombres de especificaciones ("Disco duro", "RAM").
- Migración de datos `20260923180000_historial_etiquetas_legibles` (sin cambios de schema): reescribe con las mismas etiquetas los registros de historial ya guardados.
- Pantallas que mostraban el valor interno: venta de activo, detalle de asignación, programar mantención, detalle de mantención, aviso de "Asignar activo" y medio de devolución en el detalle de la solicitud.
- Faltas de ortografía en textos visibles y mensajes de error de la API (tildes y ñ): alertas del dashboard, importación, formularios de solicitud, catálogos de opciones y validaciones.

## 2.86 Revisión de Solicitudes, Dashboard y Activos (23-sep-2026)

Pedido de Javier: revisar los tres módulos, de código y funcionalmente, en busca de errores. Cada punto se reprodujo antes de corregirlo.

**Activos**
- **El estado no se edita.** En "Editar activo" el estado pasa a ser solo informativo, y `PUT /api/activos/[id]` responde 409 si llega un estado distinto. Antes se podía elegir cualquier estado: "Asignado" dejaba el equipo asignado a nadie, y "Asignado → En Mantención → Disponible" lo dejaba disponible con la asignación todavía activa (se podía entregar a una segunda persona). Cada cambio de estado pasa por su proceso: solicitudes, mantenciones, baja o venta.
- **Tablero (Kanban):** arrastrar a "Baja" un equipo con una mantención abierta lleva a esa mantención, con el aviso de cerrarla como "No reparable". Antes abría el formulario de baja, que el servidor siempre rechazaba.
- **Historial de baja legible:** "Activo dado de baja: Falla irreparable" en vez de "falla_irreparable" (`MOTIVO_BAJA_LABEL` en `lib/constants/estadosActivo.ts`, compartido con el formulario de baja). La migración `20260923200000_historial_motivo_baja` corrige los registros ya guardados.

**Solicitudes**
- **Cambio de equipo, validación en el servidor:** cada reemplazo debe ser de la misma categoría que el equipo devuelto y de la sede de la solicitud; los equipos de un onboarding, de la sede de la solicitud. Antes solo lo limitaba el formulario (la API aceptó cambiar un Notebook por unos Audífonos).
- **Detalle de un cambio:** `GET /api/solicitudes/[id]` entrega `paresCambio` (uno por equipo cambiado, armados por posición desde `assignmentIds`) en vez de `equipoCambioAnterior`/`equipoCambioNuevo`. Antes el detalle mostraba un solo par, y el equipo nuevo desaparecía si se devolvía después.
- **Documentos con los equipos del ticket:** el Comprobante de Entrega y el Anexo listan los equipos entregados en ese onboarding (`assignmentIds`), no los que el empleado tiene hoy. La fecha de los documentos es la de la entrega, cambio o devolución coordinada (o la creación del ticket), en hora de Chile; antes era la del día en que se descargaba. Los tickets antiguos sin `assignmentIds` conservan el criterio anterior.
- **Número de ticket:** se calcula dentro de la transacción que crea el ticket (el mayor del año + 1) y, si choca con otra creación simultánea (P2002 en `numero`), se reintenta hasta 3 veces. Antes era "cuántos hay + 1" fuera de la transacción.
- **Texto del historial** cuando un equipo no se devuelve en un cambio de equipo: "no devolvió el equipo en el cambio de equipo" (`executeReturn` recibe `contexto`). Los mensajes de error muestran el estado legible ("Estado actual: En Mantención").

**Dashboard y Mantenciones**
- **Devoluciones del gráfico de movimientos:** se cuentan por su fecha de devolución, aunque el equipo se haya entregado antes de los 6 meses del gráfico.
- **Mantención vencida:** solo si su fecha es anterior a hoy (`inicioDeHoy()` en `lib/utils/fechas.ts`, en hora de Chile). La programada para hoy es "próxima". Mismo criterio en el Dashboard y en el filtro y la etiqueta de "vencida" de Mantenciones.

**Código eliminado (sin uso)**
- `/api/dashboard/stats` y `/api/dashboard/alertas`: la página del Dashboard calcula sus datos en el servidor.
- `/api/activos/[id]/reasignar` y `assetReassignmentSchema`: cierra el pendiente de 2.18. La reasignación se hace con Solicitudes.
- `AsignarActivoForm`: ninguna pantalla lo usaba.

**Pendiente resuelto en 2.87:** recuperar un equipo "No devuelto" de alguien ya desvinculado.

## 2.87 Equipos no devueltos, acta y devolución dañada (23-sep-2026)

Decisiones de Javier tras probar el flujo: *"cuando se desvincula un empleado y el equipo no lo regresa se queda registrado que el equipo siga asignado al empleado pero el estado es Desvinculado y para sacar el equipo debería hacer otra solicitud; si no regresa el equipo no se debería generar un acta"*, y para un equipo devuelto dañado: *"prefiero mandarlo a mantención y ahí darlo de baja"*.

**Equipo no devuelto (se mantiene).** Al desvincular con "No devolvió", el empleado pasa a desvinculado y el equipo sigue a su nombre, con la asignación activa y el activo en estado `no_devuelto`. Si nunca se devuelve, queda así.

**Recuperación.** Para registrar la entrega posterior se crea otra solicitud de Desvinculación sobre el mismo empleado:
- `POST /api/solicitudes` (tipo `offboarding`) acepta un empleado desvinculado **solo si tiene asignaciones activas con `estadoDevolucion = no_devuelto`**; sin equipos pendientes sigue respondiendo 409 ("ya está desvinculado y no tiene equipos pendientes de devolución").
- Se califican solo esos equipos: Buen estado (vuelve a disponible), Dañado (pasa a mantención, ver abajo) o "Sigue sin devolver" (queda igual, sin historial nuevo). Debe devolverse al menos uno.
- No se pide fecha de desvinculación: el ticket guarda la de la desvinculación original (`fechaDesvinculacion` pasa a opcional en el schema y la exige el servidor en una desvinculación normal).
- El ticket nace cerrado; el empleado sigue desvinculado. La transición inicial lo anota como "Recuperación de equipos de un empleado ya desvinculado".
- En Nueva Solicitud, al elegir un empleado desvinculado en Desvinculación, se muestra el aviso "Recuperación de equipos", se oculta la fecha y la tercera opción se llama "Sigue sin devolver".

**Acta de Devolución solo con lo devuelto.** El acta lista solo los equipos devueltos en ese ticket (Buen estado o Dañado); un "No devuelto" no va en el acta. Si no se devolvió nada, el detalle no muestra el botón y `GET /api/solicitudes/[id]/documento/acta-devolucion` responde 400 "No hay equipos devueltos en esta solicitud". La solicitud de recuperación genera su propia acta con lo que finalmente se devolvió.

**Devolución dañada → mantención.** Un equipo devuelto "Dañado" (desvinculación, cambio de equipo o recuperación) ya no pasa directo a `baja`: queda `en_mantencion` con condición dañado, y se crea una mantención pendiente para hoy, tipo "Correctiva" (o el primer tipo activo si no existe), con la descripción "Evaluar equipo devuelto dañado por …". El historial registra la devolución y el envío a mantención. Desde Mantenciones el técnico la cierra como "Reparado" (vuelve a disponible) o "No reparable" (pasa a baja, con motivo). Antes la baja era automática, sin motivo y sin vuelta atrás.
- `assetStateMachine`: nueva transición `no_devuelto → en_mantencion` (recuperado dañado); el mensaje de `asignado → disponible` con devolución dañada dice ahora "debe ir a mantención".

## 2.88 La baja de un equipo pasa siempre por Mantenciones (23-sep-2026)

Pedido de Javier: *"la idea sería que para dar de baja deba ir a mantención y darlo de baja desde ahí, por ejemplo un botón para darlo de baja pero que lleve a mantención listo con los datos y el equipo para darse de baja; prefiero eso que el formulario que tiene el kanban"*.

**Regla.** Un equipo se da de baja solo con una mantención cerrada como "No reparable", y solo desde `disponible` o `en_mantencion`. Un equipo `asignado` primero se devuelve con una solicitud; uno `no_devuelto`, primero se recupera (SPEC 2.87). La regla vive en `motivoSinBaja()` (`lib/constants/estadosActivo.ts`), que usan la API y los botones.

**Página "Dar de baja equipo"** (`/mantenciones/baja?activoId=`). Llega con el equipo elegido y los datos ya llenos: tipo de mantención (Correctiva por defecto), fecha de hoy y el usuario como "Realizado por". Solo se elige el motivo (Obsolescencia, Falla irreparable, Robo, Extravío u Otro con detalle) y, opcionalmente, observaciones. Si el equipo ya tiene una mantención abierta (por ejemplo, la que se crea al devolverlo dañado, SPEC 2.87), se cierra esa misma en vez de crear otra, y la página lo avisa.

**`POST /api/mantenciones/baja`** (permiso `mantenciones/write`, schema `bajaPorMantencionSchema`). En una transacción: cierra la mantención abierta más antigua, o crea una ya cerrada, con `resultadoTipo = no_reparable` y el motivo; cancela las demás mantenciones abiertas del equipo; pasa el activo a `baja` con `fechaBaja`; registra la baja en el historial ("Mantención Correctiva: Falla irreparable") y en la auditoría. Rechaza con 409 los estados que no admiten baja.

**Por dónde se llega:**
- Botón **"Dar de baja"** en el detalle del equipo. Si no se puede, aparece desactivado y explica por qué.
- Enlace **"Dar de baja"** en las mantenciones abiertas de la lista de Mantenciones.
- Tablero de Activos: arrastrar a "Baja" lleva a esta página.
- Además, en el detalle de un equipo en Baja aparece **"Registrar venta"** (antes solo se llegaba arrastrando en el tablero).

**Se elimina** la baja directa: `POST /api/activos/[id]/baja`, la página `/activos/[id]/baja`, el formulario `BajaActivoForm` (modal del tablero) y `assetBajaSchema`/`condicionFinalBajaEnum`. `motivoBajaEnum` se conserva para el nuevo formulario. `GET /api/activos/[id]` entrega las mantenciones abiertas con su tipo y descripción.

## 2.89 Activos: ver y editar desde las tres vistas (23-sep-2026)

Pedido de Javier: en Activos, solo la vista de tarjetas permitía entrar al detalle y editar un equipo.

- **Tabla:** la columna Acciones (Ver detalle, Editar) queda fija en el borde derecho; antes quedaba fuera de la pantalla porque la tabla es más ancha que la vista. El N° de serie y la marca son enlaces al detalle.
- **Tablero:** un clic en la tarjeta abre el detalle (arrastrar sigue cambiando de columna) y cada tarjeta muestra los íconos Ver detalle y Editar. Se agregan las columnas **No devuelto** y **Vendido**, solo para ver: no aceptan equipos, porque se llega a esos estados por su proceso.
- Solo cambia la interfaz; no hay cambios de datos ni de reglas.

## 2.90 Revisión 2, parte 1: equipos del ticket y búsquedas (23-sep-2026)

Segunda revisión de Solicitudes, Activos y Dashboard, pedida por Javier. Parte 1: errores.

- **Detalle de un onboarding:** nueva sección **"Equipos Entregados"** con los equipos de ese ticket (fecha, quién entregó, cargador y, si ya volvió, cuándo). Antes solo decía la categoría pedida ("Notebook"); el recuadro de equipos del empleado muestra lo que tiene hoy y pasa a llamarse "Equipos actuales del empleado".
- **Equipos de un ticket desde un solo lugar:** `lib/queries/asignacionesTicket.ts` (`asignacionesDelTicket`, `paresDeCambio`) lo usan el detalle de la solicitud y los documentos, que antes tenían cada uno su versión. En la interfaz, `FilaEquipoTicket` muestra un equipo en Entregados, Devueltos y Cambiados (con enlace a su ficha).
- **Equipo recuperado en otro ticket:** si un equipo "No devuelto" se entregó después en otra solicitud (SPEC 2.87), el ticket original lo sigue mostrando como "No devolvió", con "Lo entregó después en WF-…", y su acta no lo incluye (`devueltasDespues`). Antes, como la asignación guarda solo su último estado, el ticket original lo mostraba devuelto en buen estado y volvía a ofrecer acta.
- **Búsqueda por palabras** (`coincideBusqueda` en `lib/utils/text.ts`): Solicitudes, Personal (también el buscador de empleados de Nueva Solicitud), Asignaciones y Guías de Despacho encuentran el nombre completo ("juan perez" encuentra a Juan Pérez, sin distinguir acentos). Antes comparaban el término entero contra cada campo por separado. El RUT se compara sin puntos ni guion y solo si el término tiene dígitos.
- **Activos busca también por la persona que tiene el equipo** (nombre, apellidos, RUT, correo) y por categoría, teléfono y ubicación. La condición (`busquedaActivo` en `lib/queries/activos.ts`) la comparte Mantenciones, que tenía su propia copia.

## 2.91 Revisión 2, parte 2: diseño en escritorio (23-sep-2026)

- **Detalle de solicitud:** los equipos del ticket (entregados, devueltos, EPP devuelto, cambiados), el Kit/EPP entregado y la coordinación pasan a la columna ancha, bajo Documentos. La columna lateral queda para lo corto (Información, Detalle del Tipo, Equipos actuales del empleado, Observaciones) y en celular va primero.
- **Panel principal:** nueva tarjeta **No devuelto** (sin ella las tarjetas de estado no sumaban el total). Cada tarjeta de estado lleva a Activos filtrado por ese estado.
- **Alertas:** el contador dice "N alertas" (antes "N pendientes", que se confundía con "Mantenciones Pend."; cuenta mantenciones vencidas y próximas y alertas de stock).
- **Stock por Categoría:** ya no suma los equipos de Baja (no son stock), muestra solo categorías con equipos y siempre el nombre de cada una.
- **Movimientos:** muestra siempre los 6 meses (el actual incluido), con 0 en los meses sin movimientos.
- **Distribución por Estado:** el gráfico circular muestra solo el porcentaje; el nombre está en la leyenda (con nombre, la etiqueta se cortaba).

## 2.92 Revisión 2, parte 3: celular, detalles visuales y código (23-sep-2026)

- **Activos en celular:** mientras la persona no elija una vista, en pantallas chicas se abre la de tarjetas (la tabla no cabía). Hook compartido `useMediaQuery` (`hooks/useMediaQuery.ts`), sin efectos.
- **Tabla de Activos en escritorio:** cabe en pantalla (1440px) y la columna fija de Acciones ya no tapa a Especificaciones ni a Sede. Fecha de compra y Software pasan a la fila expandible; "Asignado a" y los márgenes de celda se ajustan.
- **Solicitudes en celular:** el número va en una sola línea con el tipo debajo; Estado, Responsable, Fecha y Acciones se ocultan (el número abre el detalle, donde están la descarga y el resto).
- **Tablero de Activos:** la tarjeta muestra el nombre completo a todo el ancho y el estado con los íconos en una segunda fila; antes el nombre se cortaba a mitad de palabra.
- **Avisos** (toast): aparecen bajo la barra de navegación, no encima.
- **Estado inválido en la URL de Activos:** se ignora (antes error 500).
- **Documento de la solicitud:** una sola regla (`documentoDeSolicitud` en `lib/constants/documentosSolicitud.ts`) para la lista y el detalle, que tenían cada uno su copia. La lista ya no ofrece el Acta de Devolución de una desvinculación sin nada devuelto: el servidor entrega `tieneActa` (`desvinculacionesConActa` / `devueltaEnTicket` en `lib/queries/asignacionesTicket.ts`, la misma regla que usa el generador del acta).

## 2.93 Cambios del 22-sep sin documentar: correo obligatorio y catálogos de activos (23-sep-2026)

El commit del 22-sep-2026 ("Agregar campos seleccionables y catalogos de activos, ajustes de correo…", migración `20260922135420_correo_opcional_y_catalogos_activos`) cambió reglas sin actualizar el SPEC ni las pruebas. Se documenta aquí; lo detectaron 20 pruebas automáticas que fallaban.

**Correo del empleado (reemplaza lo dicho en 2.39).** El obligatorio vuelve a ser el **correo personal**; el de empresa queda opcional. En la base, `correoEmpresa` pasa a `NULL` permitido; `correoPersonal` sigue siendo único y se exige en la aplicación (`createEmployeeSchema`, `importEmployeeSchema`), no en la columna, porque hay filas antiguas sin ese dato. Los empleados que llegan por la sincronización con Microsoft Entra ID traen solo el correo de empresa (`microsoftSyncEmployeeSchema`).

**Catálogos de opciones del activo.** Sistema operativo, antivirus y licencia Microsoft 365 dejan de ser texto libre al elegirlos: se eligen de catálogos (`SistemaOperativo`, `AntivirusOpcion`, `LicenciaMicrosoft365`) administrables en Configuración > Opciones de Activos. El activo sigue guardando el valor como texto; el catálogo solo alimenta el selector.
- `GET`/`POST /api/sistemas-operativos`, `/api/antivirus`, `/api/licencias-m365`: leer (`activos/read`) y agregar (`activos/write`, admin y técnico).
- `PATCH`/`DELETE` de `[id]`: renombrar (propaga el nombre nuevo a los activos que tenían el anterior) o eliminar (los activos conservan su valor). Solo admin (`activos/delete`).

**Pruebas.** Se actualizan las de validación de empleados a la regla vigente del correo, y la auditoría de rutas (`rutas-protegidas.test.ts`) acepta `requirePermission` con comillas simples o dobles: las rutas de catálogos usan dobles y la prueba las contaba como rutas sin permiso, aunque sí lo piden. Suite completa: 908 de 908.

## 2.94 Revisión 2, resto de Activos: crear personas solo en Onboarding, Personal y fechas (23-sep-2026)

- **Crear personas solo en Onboarding** (decisión de Javier: *"crear personas solo quedan en onboarding"*). Se quita el modal "Crear nuevo empleado" de Nueva Solicitud en cambio de equipo y desvinculación (una persona recién creada no tiene equipos que cambiar ni devolver; además repetía el formulario de Onboarding). Se eliminan `POST /api/empleados`, que solo usaba ese modal, y la importación de empleados desde Excel (`/api/empleados/importar`, `/preview`, `/sheets`, `lib/importacion/empleados.ts`, `importEmployeeSchema`), que no tenía pantalla. Siguen cargando personas, como herramientas de datos del administrador: la importación de activos (crea a la persona de un equipo importado como asignado) y la sincronización con Microsoft Entra ID.
- **Personal:** la columna Acciones queda fija a la derecha (la tabla mide unos 2.200px y "Ver ficha"/"Editar" quedaban fuera de la pantalla) y el nombre abre la ficha. La columna fija usa las mismas clases que Activos (`components/ui/tablaStyles.ts`).
- **Fecha de "hoy" en hora de Chile** (`hoyISO()` en `lib/utils/fechas.ts`): venta de activo, factura de compra y "fecha realizada" al completar una mantención proponían por defecto la fecha UTC, que desde las 21:00 en Chile ya es la de mañana; lo mismo el nombre del Excel exportado. La página de baja usa la misma función.
- **Ficha del empleado:** sin correo personal muestra "Sin correo personal" (antes un ícono solo).
- **Dato repetido:** el mensaje genérico de valor único (P2002) nombra el campo en palabras ("N° de serie", "correo personal"); el nombre interno sigue en `details` para marcar el campo en el formulario.

## 2.95 Validación por campo en los formularios de Activos (23-sep-2026)

Pedido de Javier: *"aplica mensajes de datos faltantes en todos los formularios de los módulos dashboard, activos y asignaciones, la misma lógica que se hizo en onboarding"*.

Al enviar con datos faltantes o inválidos: cada campo con error queda en rojo con su mensaje debajo, arriba aparece el resumen ("Faltan o están incorrectos: …") y la vista lleva al primer campo con error. El resumen se acorta a medida que se corrige cada campo. Los errores por campo que devuelve el servidor (un N° de serie, RUT o correo repetido) también marcan su campo.

- **Piezas compartidas:** `useErroresFormulario` (`hooks/useErroresFormulario.ts`), `ResumenErrores`, `textoResumenErrores` y `claseCampo` (`components/ui/CampoFormulario.tsx`). Onboarding usa las mismas (tenía el recuadro del resumen copiado dos veces).
- **Formularios:** Nuevo y Editar activo (categoría, marca, modelo, N° de serie y sede al crear); Registrar venta (comprador, monto, fecha; antes el botón quedaba desactivado sin decir qué faltaba); Editar empleado (nombres, apellido paterno, correo personal, formato de los correos, sede para admin); artículo de Kit de Bienvenida / EPP (nombre y sede al crear, nombre al editar en la fila; un nombre repetido marca el campo); Importar activos (hoja, categoría y sede en el paso 1 — el botón "Detectar campos" ya no se esconde mientras falte algo — y las columnas obligatorias del paso 2, en rojo solo tras intentar seguir).
- `POST`/`PUT /api/activos` con N° de serie repetido responden 409 con `details` del campo `numeroSerie`.
- Dashboard y Asignaciones no tienen formularios de ingreso de datos (solo filtros y búsqueda).

## 2.96 Mantenciones: cuándo entra el equipo a mantención (24-sep-2026)

Pedido de Javier: *"revisa ese módulo bien a fondo… la idea es que funcione, es sencillo su flujo de trabajo"*. Reglas decididas por Javier:

- **Programar no cambia el equipo.** Queda la mantención "Pendiente" con su fecha y una línea en el historial del equipo. Antes, programar una preventiva para dentro de dos meses dejaba el equipo "En Mantención" desde ese mismo día.
- **Iniciar lo pasa a "En Mantención".** Pulsar Iniciar (`PUT /api/mantenciones/[id]` con `estado: en_proceso`) valida el estado del equipo y deja el cambio en el historial. Un equipo puede tener varias mantenciones programadas, pero **solo una en proceso**: iniciar otra responde 409 con el nombre de la que está en curso.
- **Qué equipos admiten mantención:** disponible, asignado o en mantención. No devuelto, baja y vendido no (`motivoSinMantencion` en `lib/constants/estadosActivo.ts`, junto a `motivoSinBaja`). Programar o iniciar con uno de esos responde 409 con el motivo en palabras (antes fallaba al final con "Transición de estado no permitida").
- **Completar solo la que está en proceso** (`POST /completar`). Resultados:
  - *Reparado*: el equipo vuelve a asignado si tiene dueño; si no, a disponible.
  - *Faltan repuestos*: la mantención **sigue abierta, en proceso**, con la nota. El equipo sigue en mantención. Antes se cerraba y el equipo quedaba en mantención sin ninguna mantención abierta.
  - *No reparable*: baja del equipo, y se cancelan sus otras mantenciones abiertas.
- **`PUT` ya no acepta "completada".** Completar por ese camino se saltaba el resultado y devolvía el equipo a disponible sin mirar si tenía dueño. Los campos que no vienen en el `PUT` no se tocan: antes, al pulsar Iniciar, se borraba la fecha programada.
- **Cancelar:** si era la mantención en proceso, el equipo vuelve a su estado de uso. Una pendiente nunca movió el equipo, así que cancelarla o eliminarla no lo toca (antes lo sacaba de mantención aunque otra siguiera en curso).
- **Editar:** solo una mantención pendiente (tipo, fecha, descripción, técnico, costo, proveedor), con el mismo `PUT`. Si cambia la fecha, queda "reprogramada del … al …" en el historial.
- **Baja por Mantenciones (2.88):** cierra la mantención en proceso; si no hay, la pendiente más antigua.
- **Devolución dañada (2.87) e importación con Estado "Mantención":** crean la mantención directamente "En proceso", porque el equipo ya queda en mantención. La importación la crea siempre, venga o no con fechas de mantención.
- **Tarjetas de resumen:** `/api/mantenciones/pendientes` solo cuenta (antes cargaba las listas completas para contarlas) y usa "hoy" en hora de Chile, igual que el filtro de periodo del listado.
- **Piezas compartidas:** `lib/services/mantencionActivoService.ts`, con `estadoTrasMantencion`, `registrarSalidaDeMantencion` y `cancelarAbiertasPorBaja`. Es el único lugar que decide a qué estado vuelve el equipo.
- **Datos existentes:** la migración `20260924120000_mantencion_en_proceso` pasa a "En proceso" la pendiente más antigua de cada equipo que está en mantención, porque con la regla anterior esas mantenciones ya habían movido el equipo. Las demás pendientes siguen programadas.

## 2.97 Onboarding sin "Equipos actuales del empleado" (24-sep-2026)

Pedido de Javier: *"quítalo mejor, confunde"*. El detalle de una solicitud de Onboarding ya no muestra el recuadro "Equipos actuales del empleado" (2.90): repetía "Equipos Entregados" y, si después el empleado cambiaba de equipo, mostraba equipos que no se entregaron en esa solicitud. En las demás solicitudes (cambio de equipo, desvinculación) se mantiene, porque ahí sí sirve saber qué tiene la persona hoy.

## 2.98 Mantenciones: pantallas, hora programada y orden de agenda (24-sep-2026)

Pedido de Javier: *"agrega un nuevo campo con hora al querer programar fechas de mantención"*, más la parte de pantallas de la revisión de 2.96.

- **Hora programada:** nuevo campo `Maintenance.horaProgramada` (texto "HH:MM", hora de Chile, opcional; migración `mantencion_hora_programada`). Va aparte de `fechaProgramada`, que sigue siendo fecha de calendario (medianoche UTC): así la hora no corre el día ni cambia qué mantención está vencida. Se valida en `POST` y `PUT /api/mantenciones`; al editar, si no viene, no se toca. Se muestra como "26-09-2026 a las 14:30" (`formatearFechaConHora`) en la lista, el detalle, el calendario (ordenado por hora dentro del día) y el historial del equipo.
- **Programar en una sola pantalla** (antes eran tres pasos): buscar el equipo en el servidor (mismas reglas que Activos, 20 resultados), y llenar tipo (Preventiva por defecto), fecha (hoy por defecto), hora y descripción. Los equipos que no admiten mantención salen desactivados y dicen por qué (`motivoSinMantencion`). Si se entra con `?activoId=` de uno de ellos, lo avisa. La validación es por campo, como Onboarding (2.95).
- **Detalle:**
  - una mantención pendiente tiene **Editar** (tipo, fecha, hora, descripción) además de Iniciar y Eliminar;
  - Cancelar y Eliminar piden confirmación y dicen qué pasa con el equipo;
  - "Faltan repuestos" muestra el aviso **"Esperando repuestos"** con la nota, y su botón es "Guardar nota";
  - Completar valida por campo;
  - la próxima mantención solo se ofrece con Reparado.
- **Lista:**
  - **orden de agenda** por defecto: en proceso, próximas, vencidas (la más reciente primero) y al final las cerradas. Antes iba por fecha, de la más antigua a la más nueva, y una mantención programada quedaba varias páginas atrás. Pedir `sortBy` sigue ordenando por ese campo. Está en `lib/queries/mantenciones.ts` (`gruposAgenda`, `paginarPorGrupos`);
  - en celular es una tarjeta por mantención, con fecha, estado y acciones a la vista;
  - "Dar de baja" aparece solo si el equipo se puede dar de baja (`motivoSinBaja`).
- **Vencida** = pendiente con la fecha pasada. Una en proceso ya se está haciendo: no cuenta como vencida ni como próxima (tiene su propia tarjeta).
- **Calendario:** cada mantención en su día. Leía la fecha en hora local y en Chile la corría al día anterior.
- **Detalle del activo:** botón "Programar mantención" cuando el equipo admite mantenciones.
- **Tipos de mantención:** el nombre vacío o repetido marca el campo, como el resto de los formularios.
- **Piezas compartidas:** `EstadoMantencionBadge` y `configEstadoMantencion` (`components/mantenciones`), que reemplazan la configuración de estados copiada en la lista y el detalle. `estadoTrasMantencion` pasa a `lib/constants/estadosActivo.ts`, porque la usan la API y la pantalla.

## 2.99 Nombres de los resultados de una mantención (24-sep-2026)

Pedido de Javier: *"reparable, faltan repuestos y no reparable son mensajes muy pobres, propongo buscar mejores palabras más significativas"*. Cada resultado se muestra con un título que dice cómo queda el equipo y, debajo, qué hace el sistema:

| Valor interno (sin cambios) | Nombre | Consecuencia | Botón |
|---|---|---|---|
| `reparado` | Reparado, vuelve a uso | Queda funcionando y vuelve a Asignado o Disponible. | Cerrar como reparado |
| `pendiente_repuestos` | En espera de repuestos | Sigue en mantención hasta que lleguen. | Guardar y esperar repuestos |
| `no_reparable` | Sin reparación | No tiene arreglo: el equipo se da de baja. | Cerrar y dar de baja |

- Los nombres viven en `lib/constants/resultadosMantencion.ts` (`RESULTADO_MANTENCION_LABEL`, `etiquetaResultadoMantencion`). Los usan el detalle, la etiqueta de estado ("En espera de repuestos"), la página de baja, el historial del equipo, la auditoría (que antes guardaba el valor interno) y los mensajes de error.
- El detalle de una mantención cerrada muestra su resultado con el nombre.
- La pregunta del formulario pasa de "¿Qué pasa con el equipo?" a "Resultado de la mantención".

## 2.100 Revisión de Mantenciones, parte 1: errores y código repetido (24-sep-2026)

Revisión de código, diseño y funcionamiento del módulo después de 2.96–2.99. Esta parte corrige los errores y junta el código repetido.

**Errores**
- **Dar de baja nombraba la mantención equivocada.** La página nombraba la abierta más antigua, pero el servidor cerraba la que está en proceso. Ahora ambos usan `mantencionACerrar` (`lib/utils/mantenciones.ts`): la en proceso o, si no hay, la pendiente más antigua. El aviso dice además cuántas de las otras mantenciones programadas se cancelan.
- **El Calendario pintaba "vencida" una mantención en proceso.** Ahora usa la misma regla que la lista: `estaVencida`, que marca solo una pendiente con la fecha pasada, en hora de Chile.
- **Un tipo de mantención con nombre repetido no marcaba el campo.** El servidor responde 409 indicando el campo `nombre` (`assertNombreTipoLibre` en `lib/queries/mantenciones.ts`, que usan crear y editar).
- **Completar con la fecha vacía daba un error genérico.** Ahora responde 400 con el campo: "La fecha es requerida".
- **La próxima mantención que se crea al completar** quedaba con el texto "Mantención programada (siguiente de #67b3b681)" y sin historial. Ahora dice "Siguiente a la mantención Preventiva del 24-09-2026" y deja una línea en el historial del equipo.

**Código repetido**
- Las fechas de `validations/maintenance.ts` (5 copias) pasan a dos reglas: `fechaRequerida(mensaje)` y `fechaOpcional`.
- El Calendario usa los colores y nombres compartidos de los estados (`configEstadoMantencion`, `LEYENDA_ESTADOS_MANTENCION`). La leyenda suma "En espera de repuestos" y el color de "día con mantenciones vencidas".
- La página Dar de baja usa `useErroresFormulario`, con el resumen "Faltan o están incorrectos: …", como el resto de los formularios (2.95).
- `/api/mantenciones/pendientes` deja de calcular dos conteos que ninguna pantalla usaba (por estado y por tipo).

## 2.101 Revisión de Mantenciones, parte 2: diseño e "Iniciar ahora" (24-sep-2026)

- **Iniciar ahora:** Programar tiene una casilla para una reparación que empieza hoy. Programa la mantención y la inicia de una vez, así que el equipo pasa de inmediato a En Mantención; el botón dice "Programar e iniciar". Al arrastrar un equipo a "En Mantención" en el tablero de Activos, la casilla viene marcada (`?iniciar=1`). Si no se puede iniciar, la mantención queda programada y el detalle lo muestra.
- **Fecha pasada:** al programar o editar con una fecha anterior a hoy aparece el aviso "Esa fecha ya pasó: quedará como vencida." (`avisoFechaPasada`). Se puede guardar igual.
- **Lista:**
  - con "Historial completo", las tarjetas dicen "Próximas (todas)" y "Completadas (todas)";
  - se quita el botón "Calendario", que repetía la pestaña.
- **Campos bloqueados en gris:** `claseInput` (`CampoTexto`) muestra en gris un campo que no se puede cambiar, como ya lo hacía `field-input`. Aplica a todos los formularios, por ejemplo "Técnico" y "Realizado por".
- **Dashboard:** las alertas de mantenciones muestran la hora y se ordenan por ella dentro del día.
- **Calendario en celular:** al tocar un día, la pantalla baja hasta el detalle, que queda bajo el calendario.

## 2.102 Validación por campo en todos los formularios, parte 1: Configuración (24-sep-2026)

Pedido de Javier: *"esa validación de que rellenen los campos me gusta, quiero que agregues ese tipo de validación a todos los formularios del software de todos los módulos"*. Se hace por módulo. Esta parte cubre Configuración. La lógica es la misma de Onboarding (2.95): cada campo que falta o está mal queda en rojo con su mensaje, arriba aparece el resumen "Faltan o están incorrectos: …" y la vista lleva al primer error.

- **Sedes:** código y nombre, al crear y al editar en la tabla. "Slug corto" pasa a "Código corto".
- **Categorías y Opciones de activos:** nombre, al crear y al renombrar. En Opciones, renombrar con el nombre vacío antes se cerraba sin decir nada; ahora lo marca.
- **Usuarios:**
  - nombre, email (con formato) y sede cuando el rol la necesita;
  - la contraseña usa la misma regla que el servidor (`validarPasswordFuerte`: al menos 12 caracteres, con mayúscula, minúscula, número y símbolo). Al crear es obligatoria; al editar, solo si se escribe una. La regla se muestra bajo el campo.
- **Parámetros:**
  - RUT de la empresa (dígito verificador), email de contacto y los tres parámetros de seguridad dentro de sus límites: sesión de 1 a 720 horas, de 1 a 20 intentos, de 1 a 1440 minutos de bloqueo;
  - si el error está en la otra sección, la pantalla la abre;
  - pantalla y servidor usan las mismas reglas (`lib/validations/parametros.ts`). Antes el servidor respondía con el nombre interno del campo ("duracionSesionHoras debe ser…") y no revisaba el RUT ni el correo;
  - "login" pasa a "inicio de sesión".
- **Valor repetido marca su campo:**
  - `errorRepetido(campo, mensaje)` (`lib/errors.ts`) responde 409 con el campo, así el formulario lo marca en rojo;
  - se usa en sedes (código), categorías (nombre, al crear y al editar), usuarios (email), empleados (RUT y los dos correos), artículos de Kit/EPP (nombre) y tipos de mantención (nombre). Antes solo mostraban un mensaje general.
- **Piezas compartidas:**
  - `useErroresFormulario` suma `reportarServidor`: marca los campos que devuelve el servidor, y si no trae ninguno se muestra el mensaje general;
  - `esCorreoValido` (`lib/utils/text.ts`) reemplaza la regla del correo, que estaba copiada en Onboarding y en Editar empleado;
  - Tipos de mantención deja su función propia y usa las compartidas.
- Se quitan importaciones sin uso de `api/empleados/route.ts`, que sobraron de 2.94.

## 2.103 Validación por campo en todos los formularios, parte 2: Compras (25-sep-2026)

Continúa 2.102 con el módulo Compras, con la misma lógica de validación.

- **Equipo nuevo desde una compra con el formulario de Activos.** "Nueva compra" tenía su propia copia del formulario de equipo y ya no seguía las reglas de 2.77: el N° de serie era opcional y el sistema operativo, el antivirus y la licencia M365 eran texto libre en vez de los catálogos. Ahora "Crear equipo nuevo" abre una ventana con `ActivoForm`, el mismo de Activos > Nuevo, con sus reglas y su validación. `ActivoForm` suma:
  - `sedeFija`: el equipo queda en la sede de la compra, sin selector;
  - `onCancel`: para cancelar dentro de una ventana.
  La fecha de compra viene con la fecha de la factura. La página bajó de 1.083 a 767 líneas.
- **Datos de la factura:**
  - sede, N° y fecha obligatorios; el RUT del proveedor es opcional, pero si se escribe debe ser válido (misma regla que el servidor);
  - se revisa con `validarDatosFactura` (`lib/validations/purchase.ts`) en Nueva compra y en Editar datos de la factura;
  - los campos son un componente compartido, `CamposFactura` (`components/compras`), que reemplaza las dos copias.
- **Sin equipos ni artículos:** el aviso aparece en rojo y la pantalla lleva a él.
- **Botones que estaban desactivados sin explicación** ("Guardar Compra" y "Agregar" artículo de Kit/EPP, en Nueva y en el detalle): ahora se pueden pulsar y marcan lo que falta. Un N° de factura repetido marca su campo.

## 2.104 Validación por campo en todos los formularios, parte 3: Guías de despacho y Solicitudes; fechas con hora (25-sep-2026)

Continúa 2.102–2.103, con la misma lógica de validación.

- **Nueva guía de despacho:**
  - sede origen, equipos, OT Chilexpress, sede destino, fecha de envío, nombre y RUT del receptor (dígito verificador);
  - pantalla y servidor usan las mismas reglas (`validarNuevaGuia`, `lib/validations/guia.ts`); antes el servidor respondía solo "Faltan campos requeridos";
  - el botón "Crear Guía de Despacho" ya no queda desactivado sin decir qué falta;
  - si la sede destino queda igual a la nueva sede origen, se limpia;
  - el encabezado pasa al estándar (`PageHeader`).
- **Confirmar recepción:** "Recibido por" se marca si falta; el servidor responde con el campo.
- **Solicitudes:**
  - cancelar la solicitud y "No aplica" de un artículo del kit piden el motivo en `VentanaMotivo` (`components/ui`), una ventana del sistema que marca el motivo vacío en rojo;
  - "No aplica" antes usaba la ventanita del navegador (`window.prompt`), y la ventana de cancelar estaba hecha a mano.
- **Fechas con hora (`datetime-local`), dos errores corregidos:**
  - la hora propuesta para envío y recepción era la de Londres (`toISOString().slice(0, 16)`): 3 horas más en Chile. Ahora es `ahoraParaInputFechaHora()`;
  - el texto del campo ("2026-09-25T10:30") se mandaba tal cual y el servidor lo leía en su propia zona horaria. En el equipo local coincidía con Chile, pero en producción (UTC) una entrega a las 10:30 habría quedado a las 07:30. Ahora la pantalla manda el instante exacto (`inputFechaHoraAISO`). Aplica a la fecha de envío y de recepción de guías y a las fechas coordinadas de entrega, cambio y devolución de Solicitudes.
- **Pieza compartida del servidor:** `respuestaErroresCampos` (`lib/auth/guard.ts`) arma la respuesta 400 con los errores por campo; la usan Guías y Parámetros.

## 2.105 Validación por campo en todos los formularios, parte 4: Importación e inicio de sesión (25-sep-2026)

Cierra el pedido de 2.102: con esta parte, todos los formularios de ingreso de datos del sistema usan la misma validación por campo. Los filtros y buscadores de las listas no entran.

- **Corregir una fila con error (Importar activos):**
  - el error que trae la fila se muestra bajo su campo, en rojo; antes solo había un asterisco y la lista de mensajes arriba. Arriba quedan solo los errores que no son de un campo;
  - al guardar, marca, modelo y N° de serie vacíos se marcan con el resumen "Faltan o están incorrectos: …"; antes "Guardar" los dejaba pasar y el error volvía a aparecer al revalidar;
  - un campo ya corregido deja de mostrar el error que traía;
  - los botones usan los estilos estándar.
- **Importación:** cuando faltan marca, modelo o N° de serie, el error indica el campo (`campo` en `procesarFila`), para que la revisión lo marque.
- **Inicio de sesión:** correo (obligatorio y con formato) y contraseña se marcan en rojo con el resumen, en vez del aviso del navegador. Los campos indican al navegador cuál es el usuario y cuál la contraseña, para que pueda recordarlos.

## 2.106 Solo se da de baja un equipo sin empleado asignado (25-sep-2026)

Regla de negocio (Javier): *"solo se puede dar de baja un equipo si no está asignado"*.

**El hueco que había.**
- Un equipo asignado puede estar "En Mantención": se repara y vuelve a su dueño (2.96), así que conserva su empleado.
- `motivoSinBaja` miraba solo el estado y dejaba pasar "En Mantención".
- Las dos rutas que dan de baja (`POST /api/mantenciones/baja` y completar como "Sin reparación") le pasaban `hasActiveAssignment: false` fijo a la regla de estados. Además, la regla de "en_mantencion → baja" no revisaba la asignación.
- Así se podía dar de baja un equipo que el empleado todavía tenía.

**La regla, en un solo lugar.**
- `motivoSinBaja(activo)` (`lib/constants/estadosActivo.ts`) recibe el equipo, no solo su estado, y rechaza un equipo en mantención que tenga empleado: "Está asignado a un empleado: complétalo como 'Reparado, vuelve a uso' o devuélvelo con una solicitud antes de darlo de baja."
- Se mira el empleado y no el estado. Por eso **sí** se puede dar de baja un equipo devuelto dañado: queda "En Mantención" pero sin empleado, porque la devolución lo desvincula (`executeReturn`).

| Equipo | ¿Tiene empleado? | ¿Se da de baja? |
|---|---|---|
| Disponible | No | Sí |
| En Mantención, devuelto dañado | No | Sí |
| En Mantención, reparándose para su dueño | Sí | No |
| Asignado / No devuelto | Sí | No (primero se devuelve con una solicitud) |
| Baja / Vendido | — | No |

**Quién la usa.**
- Las dos rutas que dan de baja. Completar como "Sin reparación" no la revisaba; ahora sí. Rechazan con 409 y ese mensaje.
- Las pantallas avisan **antes** de intentarlo, con la misma regla:
  - el botón "Dar de baja" del detalle del activo queda desactivado y dice por qué;
  - la lista de Mantenciones no ofrece el enlace;
  - la página de baja muestra el aviso en vez del formulario;
  - en Completar mantención, la opción "Sin reparación" aparece desactivada con el motivo.
- Las rutas pasan a `validateTransition` la asignación real (`!!empleadoActualId`) y, si rechaza, responden 409 con su motivo en vez de "Transición no permitida".

## 2.107 Mantenciones: las tarjetas de resumen filtran la lista, y tarjeta "Total" (25-sep-2026)

Pedido de Javier: *"que el filtro se active dependiendo la tarjeta que se apriete, y agrega otra tarjeta donde muestre el total completo"*.

- **Tarjetas que filtran:** Vencidas, Próximas, En Proceso y Completadas son botones.
  - Al pulsar una, la lista muestra exactamente lo que cuenta la tarjeta y se quitan los demás filtros (búsqueda, tipo, estado), así el número y la lista coinciden.
  - La tarjeta activa queda marcada; pulsarla de nuevo vuelve a mostrar todas.
  - Elegir un estado a mano en el filtro reemplaza a la tarjeta pulsada.
- **Tarjeta "Total (período)":** cuenta todo lo del período elegido (lo mismo que muestra la lista sin filtros). Al pulsarla limpia los filtros.
- Se quita el botón "Vencidas" de la barra de filtros, que repetía la tarjeta.
- **Una sola regla para contar y filtrar** (`lib/queries/mantenciones.ts`):
  - `VISTAS_MANTENCION` (vencidas, próximas, en proceso, completadas), `ventanaPeriodo` y `filtroPeriodo` los usan las tarjetas (`/api/mantenciones/pendientes`, que suma `total`) y la lista (`/api/mantenciones?vista=…`);
  - antes cada ruta tenía su copia de las condiciones y del período;
  - `whereSedeMantencion` reemplaza el filtro de sede, que las dos rutas repetían, sobre el `sedeWhereConFiltro` que ya existía;
  - el orden de agenda (2.98) usa las mismas condiciones.
- **`StatCard`** suma `onClick` y `activa`: cualquier pantalla puede usar sus tarjetas como filtro.

## 2.108 Guías de despacho: los equipos viajan "En tránsito" y los recibe la sede destino (25-sep-2026)

Idea de Javier: *"que haya una sede destino y una de emisión… cuando se genere la guía la otra sede pueda ver que hay un despacho, pero solo el destinatario puede apretar el botón de que llegó, para que los equipos aparezcan en el inventario de esa sede"*. Reemplaza el efecto inmediato de 2.9.2 y los estados de 2.9.3.

**Estados nuevos.**
- El activo suma el estado `en_transito` ("En tránsito"): va en una guía. No se asigna, no va a mantención y no se edita su estado a mano (columna de solo lectura en el tablero).
- La guía (`EstadoGuia`): `en_transito` → `recibida` o `recibida_parcial` ("Recibida con faltantes"); o `anulada`.
- Cada equipo de la guía (`EstadoItemGuia`): `en_transito` → `recibido` o `perdido`.
- Migración `20260925120000_guias_en_transito`: renombra `despachado` → `en_transito` y `realizado` → `recibida`. Las guías que ya existían quedan `recibida` y sus equipos `recibido` (con el modelo anterior ya estaban en la sede destino).

**Crear la guía** (`POST /api/guias-despacho`).
- Los equipos pasan a "En tránsito" y **siguen en la sede de origen**; se registra el traslado en su historial.
- Si el número de guía choca con otra creada al mismo tiempo, se reintenta solo (hasta 3 veces, `crearGuiaConNumero`). El número usa el año de Chile.
- Se rechaza, marcando el campo: una sede destino inactiva o inexistente; equipos que ya no están disponibles o que no son de la sede origen, **con sus nombres**. Un equipo repetido en la lista se cuenta una vez.
- El selector de equipos busca en el servidor (como Activos), de a 30 resultados, y avisa "Mostrando X de Y" si hay más. La columna "Estado" se llama "Condición", que es lo que muestra.

**Confirmar la recepción** (`PATCH /api/guias-despacho/[id]`, solo sede destino o admin, solo guías "En tránsito").
- Se marca qué equipos llegaron (todos marcados de partida), quién recibió y cuándo. "Quién recibió" se propone con el receptor de la guía.
- La recepción no puede ser anterior al envío (`validarRecepcion`, la misma regla en pantalla y servidor), y hay que marcar al menos un equipo.
- Los que llegaron pasan a "Disponible" en la sede destino. Si faltan equipos, la guía queda "Recibida con faltantes".

**Resolver un faltante** (`POST /api/guias-despacho/[id]/items/[itemId]`, sede destino o admin).
- `{ accion: "llego" }`: llegó después. Solo en una guía con faltantes (antes se usa la recepción).
- `{ accion: "perdido", motivo }`: se da de baja por **Extravío**, con una mantención "Sin reparación" como toda baja (2.88). Usa `darDeBajaEnTransaccion` y `tipoCorrectivaPorDefecto`, que ahora comparten la baja de Mantenciones y la devolución dañada de Solicitudes.
- Cuando no queda ninguno en tránsito, la guía queda "Recibida".

**Anular** (`POST /api/guias-despacho/[id]/anular`, sede origen o admin).
- Solo una guía "En tránsito" que todavía no se recibe. Motivo obligatorio.
- Los equipos vuelven a "Disponible" en su sede de origen; queda la fecha, quién y el motivo.

**Quién ve y quién hace qué** (`lib/auth/permisosGuia.ts`, lo usan servidor y pantallas: un botón visible nunca lleva a un rechazo).
- Ver: la sede origen, la sede destino y admin. Otra sede recibe 404.
- Confirmar recepción y resolver faltantes: sede destino y admin. Anular: sede origen y admin.
- El técnico ve y trabaja solo con los datos de su sede; se corrige el texto de ayuda de Usuarios, que decía que veía todas.

**Pantallas.**
- Lista de Guías: tarjetas que filtran la lista (como 2.107) — Total, "Por recibir en mi sede" (en camino o con faltantes hacia la sede propia; para admin, la elegida en el menú), En tránsito (con cuántos equipos viajan), Con faltantes, Recibidas y Anuladas. Se quita el filtro de estado, que repetía las tarjetas. La página vuelve a 1 al cambiar la búsqueda, la tarjeta o la sede.
- Detalle: estado de la guía y de cada equipo, avisos según el estado, botones "Confirmar recepción" y "Anular guía", y "Llegó" / "Se perdió" por equipo.
- Activos: tarjetas "En tránsito" y **"Por llegar"** (equipos que vienen en camino a mi sede, `whereActivosPorLlegar`; `/api/activos?porLlegar=1`). La sede destino puede abrir la ficha de un equipo que viene hacia ella, aunque todavía sea de la sede origen.

**Código.**
- Una sola regla para contar y filtrar: `VISTAS_GUIA`, `whereGuiaVisible` y `sedePropiaGuias` en `lib/queries/guias.ts`; `GET /api/guias-despacho/resumen` cuenta las tarjetas.
- `recibirEquipos`, `actualizarEstadoGuia`, `buscarGuiaVisible` e `INCLUDE_DETALLE_GUIA` en `guiaDespachoService`, compartidos por las rutas de la guía.
- Se elimina `GET /api/guias-despacho/numero`, que no usaba nadie.
- `errorDeCampo(campo, mensaje)` generaliza `errorRepetido`: un 409 que la pantalla marca en el campo.

**Prueba en el navegador (25-sep-2026).** Con un técnico de cada sede se recorrió todo el flujo: crear, recibir con faltantes, "Llegó", "Se perdió", anular y la vista de admin. Se corrigió:
- Exportar a Excel con el filtro "Por llegar" fallaba: mandaba `estado=por_llegar`, que no es un estado. La lista y la exportación ahora comparten sus filtros (`whereFiltrosActivos` en `lib/queries/activos.ts`), así el archivo trae lo mismo que la pantalla, y un estado desconocido se ignora también al exportar.
- El filtro activo de Activos mostraba "por_llegar"; ahora dice "Por llegar".
- "Se perdió" sin escribir nada decía "Escribe el qué pasó". `VentanaMotivo` acepta `mensajeVacio` y aquí dice "Escribe qué pasó con el equipo", igual que el servidor.
- Faltar el motivo al anular o al marcar perdido respondía 409; ahora es 400 con el campo marcado (es un dato que falta, no un conflicto).
- El encabezado "Condición" del selector de equipos salía cortado.
- Un equipo perdido queda de baja en la sede de origen: nunca llegó a la destino.

**En el celular** (pedido de Javier, mismo patrón que Solicitudes): las tablas ya no se cortan a la derecha.
- Lista: se ven el N° de guía y el Estado; bajo el número, la ruta ("Santiago → Concepción"), la fecha y cuántos equipos lleva. Tocar el número abre el detalle.
- Detalle: se ocultan Tipo, N° de serie y Especificaciones; la serie va bajo el equipo y los botones "Llegó" / "Se perdió" debajo, fáciles de tocar. Es el mismo bloque de botones en celular y escritorio.
- No se hace documento imprimible de la guía: es un registro del despacho dentro del sistema (2.9.5).

## 2.109 Una sola paginación para todas las listas (25-sep-2026)

Pedido de Javier: aplicar la paginación compartida en Guías y en las otras pantallas que tenían su propia copia.

- `components/ui/Pagination` ya existía, pero solo la usaba Activos. Solicitudes, Compras, Mantenciones, Guías de despacho y Auditoría tenían cada una su copia, con textos y botones distintos ("Página X de Y", "Anterior / Siguiente", solo flechas).
- Ahora las seis listas usan el mismo componente: "Mostrando X a Y de Z <registros>", números de página en escritorio y "Página X de Y" en el celular.
- El componente suma `className` (borde o margen según dónde va) y no muestra nada cuando no hay registros (antes habría dicho "Mostrando 1 a 0 de 0").
- Compras, Mantenciones y Guías guardan también el total que ya mandaba el servidor.

## 2.110 "Guías de despacho" pasa a llamarse "Despachos" (25-sep-2026)

Pedido de Javier: *"cambia el nombre guías por Despachos"*. Desde aquí, lo que el SPEC llama "guía de despacho" es un **despacho** para quien usa el sistema.

- **Lo que se ve:** menú "Despachos" (con ícono de camión), "Nuevo despacho", "Despacho GD-2026-00001", "Anular despacho", columna "N° Despacho", el módulo "Despacho" en Auditoría y todos los mensajes y textos del historial.
- **Estados en masculino**, porque ahora se habla de "el despacho": En tránsito, Recibido con faltantes, Recibido y Anulado. Las tarjetas dicen "Recibidos" y "Anulados".
- **Dirección web:** `/despachos` (lista, `/despachos/nueva` y `/despachos/[id]`). La antigua `/guias-despacho` redirige a la nueva (`next.config.ts`), así los enlaces guardados siguen funcionando.
- **Se mantiene igual por dentro**, para no migrar datos: la numeración `GD-<año>-NNNNN` (los números ya emitidos no cambian), las tablas `dispatch_guides` y `dispatch_guide_items`, los estados guardados (`recibida`, `anulada`…), la API `/api/guias-despacho` y el permiso `guias`.
- Los eventos de historial ya registrados conservan su texto ("Guía de despacho …"); los nuevos dicen "Despacho …".

## 2.111 Compras: primero se compra, después se reparte a las sedes (25-sep-2026)

**Estado: implementada (25-sep-2026), en cinco partes (2.111.9).** 2.10 y 2.36 quedan como historia en lo que esta sección reemplaza.

Javier: *"yo había entendido mal y lo documenté como no debía ser. El principio es este: primero se compran los artículos, y luego se ve en qué sede se reparten."* La regla de 2.10 daba la compra por "de una sede": sus equipos nacían en ella y el Kit/EPP sumaba stock ahí mismo, como si al comprar ya se supiera el destino. Hoy lo comprado llega a Santiago y desde ahí se reparte.

### 2.111.1 Registrar la compra (solo admin)
- Datos de la factura, como hoy: N°, fecha, RUT del proveedor y orden de compra.
- **Sede de llegada, obligatoria y elegida explícitamente**, igual que en los demás procesos: donde llega físicamente el pedido. Hoy casi siempre es Santiago, pero el sistema no lo supone, por si cambia a futuro. Es la columna `purchases.sede_id` que ya existe, con este nuevo significado.
  - Viene prellenada con la sede elegida en el menú, como en los demás formularios (2.80); con "Todas las sedes" viene vacía. Se puede cambiar antes de guardar, y después con "Editar datos de la factura" mientras no se haya repartido nada.
- Lo que trajo: equipos (con el formulario de Activos) y cantidades de Kit/EPP.
- La compra es **de la empresa**, no de una sede. El técnico ya no registra compras: `compras` pasa a solo lectura para técnico en la matriz 1.3.1.

### 2.111.2 Lo comprado espera "Por repartir" en la sede de llegada
- **Equipos:** nacen en la sede de llegada con el estado nuevo `por_repartir` ("Por repartir"). Están ahí físicamente, pero todavía no son del inventario de trabajo: no se asignan, no van a mantención ni se despachan a mano. Así nadie en la sede de llegada usa un equipo antes de que el administrador decida a dónde va.
- **Kit/EPP:** queda como cantidad por repartir en su línea de la compra (ej. "10 cascos: 0 repartidos"). No suma al stock de ninguna sede todavía.
- Vincular a una compra un equipo **que ya estaba en el inventario** (facturas de equipos antiguos) se mantiene: solo lo relaciona, no cambia su estado ni su sede.

### 2.111.3 Repartir (solo admin, desde el detalle de la compra)
- Se elige la sede destino de cada equipo y cuántas unidades de cada línea de Kit/EPP van a cada sede. Se puede repartir en partes.
- **Destino = la sede de llegada:** el equipo pasa a "Disponible" y el Kit/EPP suma al stock de esa sede, en el momento.
- **Destino = otra sede:** se crea automáticamente **un Despacho por sede destino** (2.108), desde la sede de llegada, con los equipos **y las cantidades de Kit/EPP** que van a esa sede. Para eso el reparto pide los datos de cada despacho: OT Chilexpress, fecha de envío y receptor (nombre y RUT). Los equipos viajan "En tránsito"; el Kit/EPP viaja como cantidad. Todo queda registrado en el despacho, igual que los equipos.
- La compra muestra su avance: **Por repartir / Repartida en parte / Repartida**, con una tarjeta en Compras para encontrar lo pendiente, y en Activos una tarjeta "Por repartir". Las dos las ven admin y técnico (2.111.6).

### 2.111.4 El Kit/EPP en un Despacho
- Una línea de Kit/EPP en un despacho es un artículo y una cantidad.
- Al confirmar la recepción, la sede destino indica cuántas unidades llegaron. Ese stock se suma al artículo **del mismo nombre y categoría en la sede destino**; si esa sede no lo tiene en su catálogo, se crea con ese stock.
- Si llegan menos, el despacho queda "Recibido con faltantes" y lo que falta se resuelve después, igual que un equipo: "Llegó" (suma el stock) o "Se perdió" (queda registrado como perdido con su motivo; no hay baja porque el Kit/EPP es stock, no un equipo con ficha).
- **"Apareció"** (decisión de Javier, 25-sep-2026: *"si se pierde para siempre se daría de baja con motivo extraviado, y si se encuentra queda en disponible"*):
  - **Kit/EPP perdido que aparece:** pasa de perdido a recibido y suma stock en la sede destino, registrando quién y cuándo.
  - **Equipo perdido que aparece:** sale de la baja por Extravío y queda **Disponible en la sede destino** (apareció donde tenía que llegar); se limpia `fechaBaja` y el historial dice "Apareció: se había dado por perdido en el despacho …". La mantención "Sin reparación" de la baja no se borra.
  - **Solo desde el despacho.** Una baja por extravío registrada fuera de un despacho (por ejemplo, desde Mantenciones) sigue siendo definitiva: esa regla se definirá aparte. Un equipo ya vendido no "aparece".

### 2.111.5 Anular un despacho de reparto
- Si se anula un despacho creado por un reparto, sus equipos vuelven a **"Por repartir"** en la sede de llegada, y sus cantidades de Kit/EPP vuelven a quedar por repartir en la compra: el reparto se deshace y se puede repartir de nuevo.

### 2.111.6 Qué ve el técnico
Javier: *"la idea es que también los técnicos puedan ver lo que hay por repartir, pero no puedan realizar las funciones del admin"*.
- **Ve todas las compras, de todas las sedes, en solo lectura**: como la compra es de la empresa y lo pendiente todavía no tiene sede destino, acotarla a su sede le escondería justo lo que se está por repartir. Ve el detalle de cada compra, qué tiene por repartir y a dónde se repartió lo demás.
- En Activos ve la tarjeta y la lista **"Por repartir"** de todas las sedes, y puede abrir la ficha de esos equipos, en solo lectura.
- **No puede** registrar, editar ni eliminar compras, ni repartir: esos botones no se le muestran (`<Can>` con la matriz 1.3.1) y las rutas se lo rechazan con 403.
- Lo que viene hacia su sede lo sigue viendo con "Por llegar" (Activos) y "Por recibir" (Despachos), y confirma su recepción como en 2.108.

### 2.111.7 Eliminar una compra
- Solo mientras no se haya repartido nada. Una vez repartida (aunque sea en parte), los equipos y el stock ya están en uso o en camino, y la compra es su comprobante.

### 2.111.8 Datos que ya existen
- Las compras actuales: su sede pasa a ser la "sede de llegada" y todo se da por **ya repartido** (los equipos ya están en su sede y el stock ya se sumó). Nada se mueve.

### 2.111.9 Plan por partes
1. **Hecha (25-sep-2026).** Modelo y migración `20260925180000_compras_repartir`:
   - estado `por_repartir` ("Por repartir", morado) y sus transiciones en `assetStateMachine`: → `disponible`, → `en_transito`, y `en_transito` → `por_repartir`;
   - `purchase_kit_items.cantidad_por_repartir` y la tabla `purchase_kit_repartos`;
   - `dispatch_guides.purchase_id` y la tabla `dispatch_guide_kit_items`;
   - todo parte vacío o en 0: las compras existentes quedan ya repartidas;
   - "Por repartir" no se importa desde Excel, no se da de baja ni va a mantención (`motivoSinBaja`, `motivoSinMantencion`);
   - el tono `purple` se suma a las tarjetas.
   Las pantallas y la lógica de compras no cambian todavía.
2. **Hecha (25-sep-2026).** Registrar la compra:
   - **Solo admin registra, edita y elimina** (`compras`: técnico R, admin RWD). `/compras/nueva` tiene un guard del lado del servidor (`layout.tsx`) que devuelve al técnico al listado; en el detalle y el listado los botones van detrás de `<Can>`. El técnico ve **todas** las compras, de todas las sedes (se quitó el aislamiento por sede de lectura).
   - **Los equipos comprados se crean al guardar la compra, no antes.** Antes "Crear equipo nuevo" los daba de alta en el momento, y si se cancelaba la compra quedaban sueltos. Ahora se anotan en la lista y `POST /api/compras` los crea en la misma transacción que la compra, "Por repartir", en la sede de llegada y con la fecha de la factura como fecha de compra. Si uno falla (N° de serie repetido), no queda nada. El N° de serie se revisa antes en la ventana (en la lista y en el inventario) y otra vez en el servidor.
   - "Agregar equipo comprado" también está en el detalle (`POST /api/compras/[id]/activos` con `equiposNuevos`).
   - **"Vincular equipo existente"** se mantiene para facturas de equipos antiguos: `llego_con_compra = false`, no cambia estado ni sede, y no cuenta para el reparto.
   - **Kit/EPP:** la línea queda entera por repartir (`cantidad_por_repartir = cantidad`) y **no suma stock**. El artículo debe ser del catálogo de la sede de llegada.
   - **Quitar de la compra:** un equipo comprado que sigue "Por repartir" se **descarta** (`deletedAt`; su historial queda, SPEC 2.7.7); uno ya repartido no se quita; uno solo vinculado se desvincula. Una línea de Kit/EPP se quita solo si no se repartió nada (no hay stock que revertir).
   - **Eliminar la compra:** solo si no se repartió nada (`exigirSinReparto`, 409 si no); descarta sus equipos por repartir y quita sus líneas de Kit/EPP.
   - **Editar la sede de llegada:** solo si no se repartió nada. Lo que espera "Por repartir" se mueve con ella: los equipos cambian de sede y cada línea de Kit/EPP pasa al mismo artículo (nombre y categoría) en la nueva sede, que se crea sin stock si no existe (`articuloKitEnSede`, que usará también la recepción de Kit/EPP en un despacho).
   - **Avance del reparto** (`avanceReparto`): unidades por repartir y repartidas (cada equipo cuenta 1, el Kit/EPP su cantidad); estado Por repartir / Repartida en parte / Repartida. El detalle lo muestra en su encabezado y en la tarjeta "Reparto"; la tabla de Kit/EPP muestra "Comprado" y "Por repartir".
   - **Código compartido:** `crearActivo` y `descartarActivo` (`lib/services/activoService.ts`) los usan Activos > Nuevo, el descarte de duplicados y las compras, en vez de tener cada uno su copia. `compraService` reúne lo que comparten las rutas de una compra.
   - Migración `20260925190000_compras_llego_con_compra`: la columna `purchase_assets.llego_con_compra`. Sin ella, un equipo existente vinculado (Disponible) no se distinguiría de uno comprado y ya repartido.
3. **Hecha (25-sep-2026).** Repartir:
   - **Botón "Repartir"** en el detalle de la compra (solo admin, mientras quede algo por repartir). Abre la ventana `VentanaReparto`: se reparte **de a una sede por vez**. Se elige la sede destino, se marcan los equipos y se escriben las cantidades de Kit/EPP; cada confirmación es un reparto (y un despacho, si va a otra sede).
   - **A la sede de llegada:** los equipos pasan a "Disponible" (`validateTransition` por_repartir → disponible) y el Kit/EPP suma al stock de esa sede en el momento. No se piden datos de despacho.
   - **A otra sede:** se piden OT Chilexpress, fecha de envío, nombre y RUT de quien recibe, con las mismas reglas que Despachos > Nuevo (`validarDatosDespacho`, que ahora comparten los dos). Se crea el despacho desde la sede de llegada, vinculado a la compra (`purchase_id`), con los equipos y las cantidades de Kit/EPP. El stock **no** se suma todavía: se suma en la sede destino al recibirlo (parte 4).
   - **Lo pendiente se descuenta, lo comprado no:** la línea de Kit/EPP guarda "Comprado" y "Por repartir", y cada reparto queda en `purchase_kit_repartos` ("3 → Santiago", "4 → Concepción (GD-2026-00007)"). El detalle muestra además la lista "Despachos del reparto" con su estado.
   - **Una sola forma de crear un despacho:** `crearDespacho` y `sedeDestinoValida` (`guiaDespachoService`) los usan `POST /api/guias-despacho` y el reparto (`POST /api/compras/[id]/repartir`, `repartirCompra` en `compraService`). El reparto no llama al endpoint del módulo: comparte su lógica, en una sola transacción. De paso, el despacho del módulo ahora también valida cada paso de estado con `validateTransition`.
   - **A prueba de dos repartos a la vez:** lo pendiente de una línea y el estado de cada equipo se actualizan solo si siguen como se leyeron; si otro reparto se adelantó, se cancela todo con un aviso.
   - **Tarjetas:** en Compras, "Por repartir" (compras con algo pendiente) filtra la lista (`?vista=por_repartir`, `WHERE_COMPRA_POR_REPARTIR`) y cada fila muestra su avance en la columna "Reparto". Se quitó la tarjeta "Activos Vinculados", que sumaba solo la página visible. En Activos, la tarjeta "Por repartir" (solo si hay alguno) cuenta los de **todas las sedes**, también para el técnico.
   - **El técnico ve lo que hay por repartir** (2.111.6): la lista de Activos con estado "Por repartir" no se acota a su sede (`whereFiltrosActivos`), y puede abrir la ficha de esos equipos. La regla de qué ficha puede abrir vive en `puedeVerActivo` (`lib/queries/activos.ts`), que usan la API y la página.
4. **Hecha (25-sep-2026).** Kit/EPP en Despachos:
   - **El detalle del despacho** muestra una tabla de Kit/EPP (enviado, recibido, perdido, pendiente) y, si viene de un reparto, un enlace a su compra. La sección de equipos solo aparece si el despacho lleva equipos.
   - **Confirmar la recepción** pide cuántas unidades de cada línea llegaron (parte con lo enviado; no deja más de lo enviado). Un despacho que lleva **solo** Kit/EPP se puede recibir: se exige al menos un equipo o una cantidad.
   - **Lo recibido suma stock** al mismo artículo (nombre y categoría) en la sede destino, que se crea sin stock si esa sede no lo tiene (`articuloKitEnSede`, ahora en `kitService` junto a `sumarStockKit` y `estadoLineaKit`).
   - **Faltantes y "Apareció":** `POST /api/guias-despacho/[id]/kit/[lineaId]` con `llego` / `perdido` (motivo obligatorio) / `aparecio`, por cantidad (ventana `VentanaKitDespacho`). Todo pasa por `resolverKit` (`guiaDespachoService`), que también usa la recepción. El equipo perdido usa `aparecio` en `POST /api/guias-despacho/[id]/items/[itemId]`.
   - **El estado del despacho** cuenta equipos y líneas de Kit/EPP pendientes (`actualizarEstadoGuia`).
   - **Anular:** solo si ningún equipo ni unidad de Kit/EPP se resolvió. Un despacho de reparto devuelve sus equipos a "Por repartir" y su Kit/EPP a lo pendiente de la compra (el registro del reparto queda, marcado "anulado"); uno del módulo deja los equipos Disponibles, como antes. Ambos pasan por `validateTransition`.
   - **A prueba de dos personas a la vez:** cada línea se actualiza solo si sigue como se leyó.
   - La lista de Despachos muestra "+ N Kit/EPP" junto a los equipos.
5. **Hecha (25-sep-2026).** Revisión final, pedida por Javier: *"revisa cada alternativa posible"*.
   - **Huecos encontrados y corregidos:**
     - El **tablero** de Activos no tenía columna "Por repartir": esos equipos no se veían en esa vista. Se agrega, de solo lectura (arrastrarlos avisa que se reparten desde su compra).
     - **Configuración > Mantenimiento > "Eliminar compras"** (herramienta eliminada después, en 2.112) dejaba los equipos "Por repartir" sin compra (nunca se podrían repartir) y no borraba las líneas de Kit/EPP, por lo que fallaba con cualquier compra que tuviera Kit/EPP (esto último, desde 2.36). Ahora descarta esos equipos (queda su historial) y borra las líneas.
     - El **técnico solo veía las compras de su sede** en el listado: el menú le fija su sede y la lista la mandaba como filtro. Como en los demás módulos, la sede del menú solo filtra a quien ve todas (2.111.6).
     - La **ficha de un equipo de otra sede** ("Por repartir" o que viene en camino) le mostraba al técnico "Editar", "Programar mantención" y "Dar de baja", que al usarlos respondían "no encontrado". Ahora dice "Solo lectura: el equipo es de …" y no muestra acciones.
   - **Prueba de punta a punta** con admin y un técnico de cada sede (66 casos, todos OK): registrar (sin sede, sin líneas, serie repetida en la lista o en el inventario sin dejar nada a medias, Kit/EPP de otra sede, técnico, solo Kit/EPP, solo equipos, vincular existente, factura repetida); editar la sede de llegada (ida y vuelta) y la factura; quitar (por repartir, línea, existente); repartir (sin elegir, de más, sin datos, sede inactiva, técnico, a la llegada, solo Kit/EPP, solo equipo, dos repartos a la vez, ya repartido, y lo que se bloquea después de repartir); recibir (sede origen, vacío, de más, parcial, faltante que llega, dos veces); perdido y "Apareció" (equipo, equipo vendido, Kit/EPP parcial, más de lo perdido); anular (destino, origen, repartir de nuevo, ya recibido, despacho del módulo); lo que ve el técnico; otros módulos que no aceptan un equipo "Por repartir" (Despachos > Nuevo, baja, cambio de estado a mano); eliminar (sin reparto, con el reparto anulado) y la compra que termina "Repartida".
   - **"Recibido" significa cerrado** (decisión de Javier, 25-sep-2026: *"dejarlo así"*). Si todo lo de un despacho se marca "Se perdió" antes de confirmar la recepción (por ejemplo, Chilexpress avisa que el paquete se extravió), el despacho queda "Recibido" aunque no llegó nada: ya no queda nada pendiente. En ese caso la tarjeta "Recepción" muestra "Aún no se recibe" y lo perdido se ve en sus tablas y en el historial de cada equipo.

## 2.112 Configuración: qué queda y qué se elimina (25-sep-2026)

Pedido de Javier, tras el análisis completo del módulo: *"mejor elimínalo, es peligroso tener la posibilidad de eliminar datos, elimina todo lo relacionado a él"*, *"no se sincronizará con Microsoft de momento así que no sirve de nada"* y quitar los datos de la empresa.

### 2.112.1 Se eliminan (parte 1)
- **Mantenimiento de Datos** (borrado masivo): la pantalla, `/api/mantenimiento/counts` y `/api/mantenimiento/eliminar`. Borraba empleados, asignaciones y mantenciones completas (incluidas las que respaldan cada baja), dejaba equipos "Disponible" sin pasar por la máquina de estados ni dejar historial, no quedaba en Auditoría y mostraba un conteo que no era lo que borraba. Contradecía que el historial es evidencia y no se borra (2.7.7). El descarte puntual de duplicados sigue existiendo en la ficha del equipo.
- **Sincronización con Microsoft Entra ID** (2.6): la pantalla, `/api/microsoft-sync` y `/api/microsoft-sync/status`, `microsoftGraphService`, la validación de empleados sincronizados y la etiqueta "Microsoft" en Personal y en la ficha del empleado. Además de no usarse, creaba empleados (las personas se crean solo en Onboarding) y los desvinculaba sin Offboarding. En la base se quitan `employees.microsoft_id` y `employees.origen_microsoft` (ningún empleado los usaba).
- **Datos de la empresa** en Parámetros: no se usaban en ninguna parte (las actas imprimen el nombre y RUT fijos de `EMPRESA` en `pdfStyles`). En la base se quitan las seis columnas `system_config.empresa_*` (nunca se guardó nada).
- Migración `20260925200000_configuracion_sin_microsoft_ni_empresa`.

### 2.112.2 Lo que queda en Configuración
Todo el módulo es solo de admin (`layout.tsx`, recurso `configuracion`).

| Sección | Qué hace |
|---|---|
| Sedes | Crear, renombrar, activar o desactivar sedes |
| Usuarios | Cuentas de acceso, rol y sede |
| Catálogos de Activos | Una pantalla con pestañas: Categorías, Sistemas operativos, Antivirus y Licencias M365 (2.112.7) |
| Seguridad | Antes "Parámetros Generales": duración de la sesión, intentos de inicio de sesión y minutos de bloqueo |
| Registro de accesos | Inicios de sesión, intentos fallidos, bloqueos, cierres de sesión y sesiones cortadas (2.112.4) |
| Auditoría | Quién hizo qué y cuándo, con páginas exactas y el detalle de lo que cambió (2.112.8) |

El catálogo de Kit/EPP sigue en Activos y los tipos de mantención en Mantenciones, porque el técnico también los maneja.

### 2.112.3 Usuarios: no se eliminan, se desactivan (parte 2)
Decisión de Javier: *"en vez de eliminar un usuario es mejor tener la opción de desactivarlo, y un usuario inactivo no puede iniciar sesión ni entrar a nada"*.
- **Sin eliminar:** se quitan el botón y `DELETE /api/usuarios/[id]`. Su nombre queda en la Auditoría, en las solicitudes y en todo lo que hizo.
- **Activar / Desactivar** es un botón propio con confirmación (antes, un clic sobre la etiqueta de estado, sin confirmar). El formulario de edición ya no cambia el estado.
- **Un usuario inactivo no entra a nada:**
  - no puede iniciar sesión (ya era así);
  - **si tenía la sesión abierta, queda fuera en su siguiente acción.** Antes seguía entrando hasta que vencía la sesión (24 horas), porque el rol, la sede y el estado se guardaban al iniciar sesión y no se volvían a revisar. Ahora la sesión revisa la cuenta en cada consulta al servidor (`jwt` en `lib/auth.ts`): si está desactivada, la invalida; y un cambio de rol o de sede aplica de inmediato;
  - la pantalla vuelve a consultar su sesión cada 30 segundos y al volver a la pestaña, y si ya no vale va al inicio de sesión (`SessionProvider`);
  - desactivar deja en el Registro de accesos "Sesión cortada — Cuenta desactivada por …".
- **Nunca quedarse sin administradores** (`PUT /api/usuarios/[id]`): no te puedes desactivar ni quitar el rol de administrador a ti mismo (el botón no aparece en tu propia fila), y no se puede desactivar ni quitarle el rol al último administrador activo. Responde 409 con el motivo.
- **Duración de la sesión:** se toma de Configuración > Seguridad al iniciar cada sesión (`expiraEn`), sin esperar a que el servidor se reinicie. El JWT tiene un tope fijo de 31 días, mayor que el máximo permitido (720 horas).
- **Ciclo corregido:** con una sesión de una cuenta desactivada, el middleware mandaba de `/login` al inicio y el inicio de vuelta a `/login`. Ahora quien decide si el login redirige es su propio layout, que sí consulta la base.
- Un correo repetido al editar se marca en su campo.

### 2.112.4 Registro de accesos (parte 2)
Idea de Javier: *"un módulo donde salgan los inicios de sesión o intentos, tipo logs"*. Decisiones: guardar la dirección de red y el navegador, y registrar también los cierres de sesión.
- **Tabla `access_logs`** (`AccessLog`, migración `20260925210000_registro_accesos`): correo usado, usuario (si existe), resultado, dirección de red, navegador, detalle y fecha. Resultados (`ResultadoAcceso`): ingresó, contraseña incorrecta, usuario no existe, usuario desactivado, bloqueado por intentos, cerró sesión (desde el menú; cerrar el navegador no queda registrado) y sesión cortada (al desactivar la cuenta).
- **Configuración > Registro de accesos** (`/configuracion/accesos`, `GET /api/accesos`, solo admin): tarjetas que filtran (ingresos, intentos fallidos, bloqueos e intentos de cuentas desactivadas, de hoy en Chile), filtros por usuario, resultado y fechas en hora de Chile, y la lista con fecha y hora, usuario, resultado, dirección de red y navegador en palabras ("Edge en Windows"; el texto completo al pasar el mouse). En Usuarios, cada fila tiene "Ver sus accesos".
- **El bloqueo por intentos se cuenta en este registro** (`minutosDeBloqueo`, `lib/services/accesoService.ts`): los fallos desde el último ingreso correcto, dentro de la ventana de bloqueo. Antes se contaba en la memoria del servidor, que en Vercel (varias copias del servidor) se podía saltar.
- El mensaje de error al iniciar sesión sigue siendo el mismo para correo inexistente, cuenta desactivada y contraseña incorrecta (para no revelar qué cuentas existen); el detalle real queda en el registro.
- `inicioDiaChile` y `rangoDiasChile` (`lib/utils/fechas.ts`) filtran por días en hora de Chile ("hasta" incluye todo ese día); los usará también Auditoría.

### 2.112.5 Sesiones anuladas de verdad: lista negra y "sesiones válidas desde"
En la prueba en el navegador de la parte 2 apareció un hueco: si se desactivaba a un técnico y el navegador conservaba su token, al reactivar la cuenta ese token volvía a valer y entraba sin contraseña. Además, al cerrar sesión el navegador borraba su copia del token, pero una copia guardada antes seguía sirviendo hasta vencer. Idea de Javier: *"una lista negra en el servidor: al cerrar sesión se guarda el token con un vencimiento igual al tiempo que le quedaba de vida, y en cada consulta se revisa que no esté en la lista"*.
- **Identificador de sesión:** al iniciar sesión se crea uno propio (`sesionId`) y se guarda en el token con la hora de inicio. No se usa el `jti` de NextAuth porque cambia cada vez que el token se renueva. Una sesión sin identificador (anterior a este cambio) pide iniciar sesión de nuevo.
- **Lista negra al cerrar sesión** (tabla `sesiones_cerradas`, `SesionCerrada`): el cierre pasa por la ruta de NextAuth (`app/api/auth/[...nextauth]/route.ts`), que antes de borrar la cookie anota la sesión hasta la hora en que su token habría vencido (`cerrarSesion`, `lib/services/accesoService.ts`). Se guarda en Postgres y no en Redis: la aplicación ya consulta la base en cada petición para revisar la cuenta, y la lista va en esa misma consulta, sin sumar tiempo ni un servicio aparte. Como Postgres no tiene vencimiento automático, solo cuentan las filas vigentes y las vencidas se borran al anotar una nueva. Si el sistema crece, la lista se puede pasar a Redis sin cambiar la lógica.
- **"Sesiones válidas desde"** (`SystemUser.sesionesDesde`): la lista negra sola no cubre la desactivación, porque quien desactiva es el admin y el servidor no tiene a mano los tokens del técnico. Al desactivar, la fecha pasa a "ahora" y toda sesión iniciada antes queda anulada para siempre, aunque la cuenta se reactive; para volver a entrar hay que escribir la contraseña.
- **En cada consulta** (`jwt` en `lib/auth.ts`) se rechaza la sesión si la cuenta está desactivada, si su identificador está en la lista negra o si empezó antes de "sesiones válidas desde".
- **Registro de accesos:** cada fila guarda el identificador de sesión (`sesion_id`), que une el ingreso con su cierre. El cierre de sesión ahora queda con dirección de red y navegador, y con su duración en el detalle ("Sesión de 2 h 5 min").
- En celular, la tabla del registro se muestra en fila compacta (la fecha arriba del usuario) para que el resultado no quede fuera de la pantalla.
- Pendiente para más adelante: anular también las sesiones de un usuario cuando se le cambia la contraseña (usa la misma fecha).

### 2.112.6 Seguridad y datos correctos (parte 3)
Salió de una revisión completa del módulo (seguridad, código, pantallas, rendimiento), con pruebas en el navegador y por la API. Decisiones de Javier: sede desactivada = avisar y bloquear la entrada; bloqueo por correo y por equipo; registro de accesos 1 año.
- **Cambiar la contraseña de otro usuario cierra sus sesiones abiertas** (misma fecha `sesionesDesde` de 2.112.5). Si se la robaron, el intruso queda fuera. Queda "Sesión cortada — Contraseña cambiada por …". La sesión de quien cambia su propia contraseña no se corta. El formulario lo avisa.
- **Sede desactivada:**
  - se desactiva con un botón y confirmación que dice cuántos técnicos activos y equipos tiene (`GET /api/sedes?conUso=true`, `USO_SEDE`); ya no con un clic en la etiqueta ni desde la edición;
  - sus técnicos no pueden iniciar sesión (resultado nuevo `sede_inactiva`, "Sede desactivada"; como la contraseña ya es correcta, se les dice el motivo) y los que están dentro salen en su siguiente acción (`jwt` revisa la sede). El admin no tiene sede y no se ve afectado;
  - no se puede asignar un usuario a una sede desactivada (`exigirSedeActiva`, `lib/queries/sedes.ts`); en Usuarios se marca "Sede desactivada: no puede entrar";
  - los equipos y datos de la sede no se tocan.
- **Bloqueo por equipo:** además del bloqueo por correo, los intentos fallidos desde una misma dirección de red, con cualquier correo, bloquean ese equipo (por defecto 20 en 15 minutos; `maxIntentosIp` y `minutosBloqueoIp` en Configuración > Seguridad). Frena a quien prueba muchos correos. Se cuenta en el registro de accesos (índice por dirección y fecha). Un ingreso correcto de otra persona desde la misma red no lo reinicia.
- **El registro de accesos se guarda 1 año:** los registros más antiguos se borran al iniciar sesión (`limpiarRegistroAntiguo`), sin tarea programada.
- **No revelar qué correos existen por el tiempo de respuesta:** con un correo inexistente se compara igual una contraseña de relleno, así todas las respuestas tardan lo mismo.
- **Datos correctos con esquemas Zod** (`lib/validations/sede.ts`, `usuario.ts`):
  - Sedes: código y nombre obligatorios, sin espacios de sobra, código en mayúsculas; no hay dos sedes con el mismo nombre; no se puede dejar el nombre vacío;
  - Usuarios: correo con formato válido, nombre no vacío, contraseña fuerte (vacía al editar = mantenerla), rol válido, sede existente y activa;
  - cada error se marca en su campo.
- **Errores de quien envía no son 500:** un cuerpo que no es JSON o un valor que la base no acepta (por ejemplo un módulo inexistente en el filtro de Auditoría) responden 400 (`handleApiError`), en todo el sistema.
- **Pantalla:**
  - la dirección de red se muestra en palabras: "Este equipo (local)" para `::1` (pruebas en el propio computador) y sin el prefijo `::ffff:`;
  - cada etiqueta de formulario queda unida a su campo (`CampoFormulario`): al tocarla se activa el campo y los lectores de pantalla lo anuncian. Aplica a todos los formularios que usan el componente;
  - el texto de Sedes decía que el técnico ve todas las sedes: trabaja solo con la suya.

### 2.112.7 Catálogos de Activos (parte 4)
Decisiones de Javier: una lista "Qué campos pide" en vez de reconocer la categoría por su nombre; se quitan "Requiere N° de serie / IMEI" y, en cambio, un celular exige IMEI; el técnico sigue pudiendo agregar opciones desde el formulario de activos, pero queda en la auditoría.
- **Una sola pantalla:** Configuración > Catálogos de Activos (`/configuracion/catalogos`) con cuatro pestañas: Categorías, Sistemas operativos, Antivirus y Licencias Microsoft 365. La pestaña queda en la dirección (`?tab=`). `/configuracion/categorias` y `/configuracion/opciones-activos` redirigen (`next.config.ts`). En el menú de Configuración quedan 6 tarjetas.
- **"Qué campos pide"** (`AssetCategory.tipoFicha`, enum `TipoFicha`: computador, celular, monitor, periférico, genérico; migración `20260926010000_categorias_tipo_ficha`, que completa las categorías actuales según su nombre). Decide los campos especiales en el formulario de activos, el detalle de asignación, la ficha del empleado, el selector de equipos del despacho y las columnas de la importación. Antes esos cinco lugares comparaban el nombre con "notebook", "celular", "monitor"... y renombrar la categoría hacía desaparecer sus campos. Ahora se puede renombrar, o crear por ejemplo "Tablet" con los campos de celular.
- **Sin "Requiere N° de serie / IMEI":** primero se hicieron avisos, pero Javier los vio innecesarios, porque "Qué campos pide" ya decide qué muestra el formulario. Se eliminaron de la pantalla, la API y la base (migración `20260926020000_categorias_sin_pide_serie_imei`). El N° de serie sigue obligatorio al crear e importar cualquier activo.
- **El IMEI identifica al celular** (Javier: *"es la propiedad que lo identifica como único, a diferencia del N° de serie de los otros equipos"*). Decisiones: en celulares el N° de serie es opcional; el IMEI se valida con 15 dígitos y su dígito verificador; se guarda solo el IMEI principal (no el segundo de los dual SIM).
  - **Una sola regla** (`reglasIdentificacion`, `lib/services/activoService.ts`): celular → IMEI obligatorio y N° de serie opcional; los demás → N° de serie obligatorio al crear; ningún IMEI se repite. La usan crear en Activos y en Compras (`crearActivo`) y editar (`PUT /api/activos/[id]`); la importación aplica lo mismo por fila (`procesarFila`).
  - **IMEI único en la base** (`assets.imei` único, migración `20260926030000_imei_unico`), guardado solo con dígitos (se aceptan espacios y guiones al escribirlo). Formato en `lib/validations/imei.ts` (`validarImei`, Luhn), usado por la pantalla y por el esquema del activo.
  - **Compras usa el mismo formulario de activos** (`ActivoForm`), así que pide el IMEI igual que Activos; al anotar un equipo revisa que el N° de serie y el IMEI no estén ya en la lista ni en el inventario, y la compra no acepta el mismo IMEI dos veces.
  - **Importación:** en celulares la columna obligatoria es IMEI (el N° de serie es opcional); una fila sin IMEI, con un IMEI inválido o repetido (en la base o en el mismo archivo) es un error marcado en su campo.
  - **Catálogos muestra los campos de cada tipo:** bajo "Qué campos pide", los campos propios del tipo elegido y los de todos los activos, con los obligatorios marcados (*): Marca, Modelo, Sede y N° de serie (este último salvo en celulares), e IMEI en celulares (`TIPOS_FICHA` y `camposComunes`, `lib/constants/categorias.ts`, que siguen al formulario de activos).
  - **Campos del celular** (Javier: *"el teléfono también tiene componentes como memoria RAM"*): IMEI, número de teléfono, N° de activación, tipo de plan, procesador, RAM, almacenamiento, sistema operativo (del mismo catálogo; se agregan opciones como "Android 14") y cargador. Ya existían en la base; el formulario solo mostraba IMEI, número y almacenamiento.
  - **Búsqueda y listas:** Activos busca también por IMEI; donde un equipo no tiene N° de serie se muestra su IMEI (`identificadorActivo`, `lib/utils/identificador.ts`). Aplica a todas las pantallas que identifican un equipo: listas de Activos, Compras, Despachos, Mantenciones, Solicitudes, ficha del empleado, alertas del Dashboard, ficha del activo (con su propia fila IMEI junto al N° de serie), editar y vender un activo, y Auditoría (el nombre del equipo, la búsqueda y el texto "Activo creado" del historial). Las asignaciones se buscan también por IMEI.
  - **Actas:** la columna es "N° de Serie / IMEI": muestra la serie o, si no tiene, el IMEI, que en ese caso no se repite en las especificaciones (`filaEquipo`). El anexo de entrega hace lo mismo.
- **Categorías con datos correctos** (`lib/validations/categoria.ts`): nombre obligatorio y no repetido (sin importar mayúsculas ni espacios), stock mínimo entero de 0 o más (antes aceptaba -5 y un campo vacío se guardaba como 0). Eliminar una con activos responde 409 con cuántos tiene (antes 400), y el botón deshabilitado lo explica. Se crea y edita en un formulario (antes dentro de la fila) y avisa "guardado".
- **Todo queda en la auditoría:** los cambios de categoría guardan también "Pide serie/IMEI", stock mínimo y "Qué campos pide"; crear, reactivar, renombrar y eliminar opciones quedan con el módulo nuevo **Catálogo** (`AuditEntidad.catalogo`), con quién lo hizo (también un técnico que agrega una opción desde el formulario) y cuántos activos corrigió un renombre.
- **Sin código repetido:** las seis rutas de opciones, que eran copias, llaman a un solo servicio (`lib/services/catalogoOpcionesService.ts`). Las direcciones de la API no cambian. Renombrar al nombre de otra opción responde 409 marcado en el campo.

### 2.112.8 Auditoría (parte 5)
Javier notaba que siempre salía el aviso "Hay más eventos de los que se muestran para este filtro". Decisiones: el detalle muestra solo lo que cambió; sin exportar a Excel por ahora.
- **Una sola consulta con páginas exactas** (`lib/services/auditoriaService.ts`): los tres historiales (AuditLog, AssetHistory y WorkflowTransition) se juntan en la base con UNION ALL, se ordenan y se paginan ahí mismo, con el total real. Antes se traían las últimas 300 filas de cada uno y se mezclaban en memoria: el total era falso, los eventos antiguos no se podían ver y el aviso salía siempre. Se quitó el aviso.
- **Fechas en hora de Chile:** "Desde" y "Hasta" filtran por días de Chile (`rangoDiasChile`); "Hasta" incluye todo ese día (antes lo excluía y con Desde = Hasta = hoy no salía nada).
- **Textos claros:** la acción se lee "Creó", "Editó", "Eliminó", "Asignación", "Baja", "Traslado"... y en las solicitudes el cambio de estado con sus nombres ("Gestión TI → Equipos Entregados"). El usuario aparece con su nombre (el correo al pasar el mouse) y se puede buscar por nombre o correo. "Buscar" encuentra también por el equipo (N° de serie) o el número de solicitud.
- **Detalle legible:** en vez del código (JSON), una tabla *Campo · Antes · Después* solo con lo que cambió; al crear o eliminar, los datos del registro. Los identificadores se muestran con su nombre (sede, persona, activo, tipo de mantención), los estados y roles en palabras, las fechas en hora de Chile, y se ocultan datos internos (numeración de la importación, identificadores de enlace).
- **Enlace al registro** afectado cuando tiene pantalla propia (activo, solicitud, compra, despacho, mantención, empleado), salvo si se eliminó.
- **Pantalla:** mismo encabezado que las demás, con flecha para volver; etiquetas unidas a los filtros; en celular, fila compacta con el detalle desplegable. Un módulo desconocido en el filtro responde 400.
- Los módulos del filtro viven en `lib/constants/auditoria.ts` (antes repetidos en la pantalla y la ruta).

### 2.112.9 Pantallas y limpieza (parte 6)
- **Celular:** Usuarios, Sedes y Categorías usan una misma pieza (`TablaAdaptable`, `components/ui/`): en escritorio es una tabla y en celular una fila compacta con sus botones. Antes la tabla se cortaba y en Usuarios no se podía editar ni desactivar desde el teléfono. Accesos y Auditoría ya tenían su fila compacta (2.112.4, 2.112.8).
- **Sedes** se crea y edita en un formulario, como Categorías y Usuarios (antes el nombre se editaba dentro de la fila); el código no se puede cambiar. La lista muestra cuántos técnicos y equipos tiene cada sede.
- **Diálogos de desactivar** (sedes y usuarios) muestran un ícono de apagar o de usuario desactivado en vez de la papelera, que daba a entender que se borra (`ConfirmDialog` acepta `icon`).
- **Mensaje de permisos en palabras:** "Tu rol no permite ver usuarios del sistema" en vez de "El rol "tecnico" no puede read sobre usuarios" (`requirePermission`).
- **Menú de Configuración:** sin la marca "Admin" (todo el módulo es solo de administradores, lo dice el encabezado) y con textos corregidos; todas las pantallas del módulo tienen el mismo encabezado con flecha para volver.
- **Limpieza:** se borran la pantalla y las rutas stub de Proveedores (2.35), `lib/validations/supplier.ts` y la página de redirección de Kit/EPP; las direcciones antiguas redirigen en `next.config.ts`. CLAUDE.md cuenta 30 modelos y 24 enums.
- **Cargador de computadores y celulares:** el formulario de activos pide "Cargador" en los dos, con "Sí" por defecto. Con "Sí", al entregar y devolver el equipo se pregunta su estado (operativo, con daños, no incluido/no devuelto) y va en el acta; es la misma regla para ambos (`tieneCargador`). Antes un computador creado a mano o en Compras quedaba sin cargador y nunca se preguntaba. Los demás tipos no llevan cargador.

## 2.113 Dependencias sin fallas de seguridad y proxy de Next.js 16 (26-sep-2026)
Pedido de Javier antes de desplegar: *"arregla el punto 2 especificando el problema y su solución, el 4 igual"*.

**Dependencias:** `npm audit` reportaba 16 fallas en las librerías de la aplicación (2 críticas, 9 altas, 5 moderadas) y 9 en las herramientas de desarrollo. Quedan en 0.
| Librería | Problema | Solución |
|---|---|---|
| `next` 16.1.1 (crítica) | Caídas del servidor con peticiones armadas (React Server Components y el optimizador de imágenes); además traía `postcss` (lectura de archivos y XSS en CSS) y `sharp` (fallas en libvips/libheif) vulnerables | Se actualiza a 16.3.6 (misma versión mayor), con `eslint-config-next` 16.3.6 |
| `next-auth` 4.24.13 (crítica) | Un correo con caracteres parecidos podía saltarse la validación (afecta al proveedor por correo, que no se usa), y `getToken()` caía con un encabezado de autorización malformado (sí se usa, en el cierre de sesión, 2.112.5); `preact` interno vulnerable | Se actualiza a 4.24.15 |
| `xlsx` 0.18.5 (alta) | Contaminación de prototipos y bloqueo por expresión regular al leer un Excel malicioso en la importación. La versión de npm está abandonada: los arreglos solo se publican en el sitio de SheetJS | Se instala 0.20.3 desde `cdn.sheetjs.com` (fuente oficial del autor) |
| `exceljs` 4.4.0 → `uuid` 8 (moderada) | Falta de control de límites en `uuid` v3/v5/v6 con búfer. exceljs solo usa v4, así que no era aprovechable aquí | `overrides`: exceljs usa `uuid` ^11.1.1 (misma función v4). La "solución" que proponía npm era bajar exceljs a la 3.4, que habría roto la exportación |
| Indirectas (`brace-expansion`, `minimatch`, `flatted`, `js-yaml`, `nanoid`, `ajv`, `@humanfs/node`, `baseline-browser-mapping`) | Bloqueos por entradas armadas (ReDoS/DoS) y contaminación de prototipos | `npm audit fix` (actualizaciones compatibles) |
| Herramientas de desarrollo (`handlebars`, `@babel/core`, `browserslist`, `picomatch`, `ws`, `diff`, `minimatch` de jest) | Mismas clases de fallas; no llegan a la aplicación publicada | `npm audit fix`; el `minimatch` 9.0.5 fijado dentro de `glob` 10 (usado por jest) se fuerza a 9.0.9 con `overrides` (`glob@^10`) |

Verificado: tipos, 1112 pruebas, la compilación de producción (`next build`) y en el navegador el inicio y cierre de sesión, la protección de rutas, la importación (hojas y vista previa) y la exportación a Excel.

**Proxy:** Next.js 16 declaró obsoleta la convención `middleware.ts` y la reemplazó por `proxy.ts`. Se renombra `src/middleware.ts` a `src/proxy.ts` (misma lógica: exige sesión en todo salvo `/login` y `/api/auth`); la compilación lo reconoce como "Proxy" y desaparece el aviso. Una petición a la API sin sesión sigue siendo redirigida al inicio de sesión (no entrega datos), igual que antes.

**Limpieza:** se borra `app/_to_delete/`, una ruta vieja de "revalidar importación" que el desarrollador anterior dejó fuera de la aplicación; no la usaba nada, pero rompía la revisión de tipos de la compilación.

## Changelog SPEC
- **v2.36 (2026-09-25):**
  - Sección 2.112 (nueva): Configuración se reduce a Sedes, Usuarios, Catálogos de Activos, Seguridad, Registro de accesos y Auditoría. Los usuarios no se eliminan, se desactivan, y la desactivación corta la sesión en la siguiente acción; nunca se queda el sistema sin administradores; nuevo Registro de accesos, base también del bloqueo por intentos. Las sesiones se anulan de verdad: lista negra al cerrar sesión y "sesiones válidas desde" al desactivar (2.112.5). Parte 3 (2.112.6): cambiar la contraseña cierra las sesiones, la sede desactivada deja fuera a sus técnicos, bloqueo también por equipo, registro de accesos de 1 año y validación con Zod en Sedes y Usuarios. Parte 4 (2.112.7): Catálogos de Activos en una pantalla con pestañas, "Qué campos pide" en cada categoría, avisos de serie/IMEI, auditoría de catálogos y un solo servicio para las opciones. Parte 6 (2.112.9): tablas que se adaptan al celular, Sedes con formulario, diálogos sin papelera, mensaje de permisos en palabras, limpieza de Proveedores y cargador en computadores y celulares. Parte 5 (2.112.8): Auditoría en una sola consulta con páginas exactas (sin el aviso "Hay más eventos"), fechas de Chile, textos claros y detalle Campo · Antes · Después. Se eliminan Mantenimiento de Datos, la sincronización con Microsoft (2.6 queda como historia) y los datos de la empresa, con sus columnas en la base.
- **v2.35 (2026-09-25):**
  - Sección 2.111 (nueva, regla aprobada, se implementa por partes; implementada en cinco partes: modelo; registrar; repartir; Kit/EPP en despachos y "Apareció"; revisión final con 4 huecos corregidos y 66 casos probados): en Compras primero se compra y después se reparte. El técnico ve todas las compras y lo que hay por repartir, en solo lectura. Sede de llegada obligatoria, estado "Por repartir", reparto solo de admin con despachos automáticos que llevan equipos y Kit/EPP. Se marcan 2.10 y 2.36 como reemplazadas en lo que corresponde, y `compras` pasa a solo lectura para técnico en 1.3.1.
- **v2.34 (2026-09-25):**
  - Sección 2.110 (nueva): "Guías de despacho" pasa a llamarse "Despachos" en pantallas, mensajes e historial; dirección `/despachos` con redirección desde la antigua; estados en masculino. Por dentro (datos, API, permiso, numeración GD) no cambia.
- **v2.33 (2026-09-25):**
  - Sección 2.109 (nueva): Solicitudes, Compras, Mantenciones, Guías y Auditoría usan la paginación compartida de Activos; se borran sus cinco copias.
- **v2.32 (2026-09-25):**
  - Sección 2.108 (nueva, con su prueba en navegador): las guías de despacho dejan los equipos "En tránsito" hasta que la sede destino confirma qué llegó; faltantes que llegan después o se dan de baja por Extravío; anular mientras viaja; tarjetas que filtran y "Por llegar" en Activos. Se actualizan 2.7.2 (transiciones de `en_transito`), 2.9 y las tablas de guías.
- **v2.31 (2026-09-25):**
  - Sección 2.107 (nueva): en Mantenciones, cada tarjeta de resumen filtra la lista y se agrega la tarjeta "Total"; tarjetas y lista usan las mismas condiciones.
- **v2.30 (2026-09-25):**
  - Sección 2.106 (nueva): solo se da de baja un equipo sin empleado asignado; `motivoSinBaja` mira el empleado además del estado y la usan las dos rutas de baja y las pantallas, que avisan antes.
- **v2.29 (2026-09-25):**
  - Sección 2.105 (nueva): validación por campo al corregir filas de importación y al iniciar sesión; el error de campos faltantes de la importación indica el campo. Con esto todos los formularios usan la misma validación.
- **v2.28 (2026-09-25):**
  - Sección 2.104 (nueva): validación por campo en Guías de despacho y en los motivos de Solicitudes (ventana propia en vez de window.prompt); las fechas con hora se proponen y se envían en hora de Chile.
- **v2.27 (2026-09-25):**
  - Sección 2.103 (nueva): Compras con validación por campo; el equipo nuevo usa el formulario de Activos (N° de serie obligatorio, catálogos) y los datos de la factura quedan compartidos entre Nueva y Editar compra.
- **v2.26 (2026-09-24):**
  - Sección 2.102 (nueva): validación por campo en Configuración (sedes, categorías, opciones de activos, usuarios, parámetros), el valor repetido marca su campo en toda la API y las reglas de correo, contraseña y parámetros quedan compartidas.
- **v2.25 (2026-09-24):**
  - Sección 2.101 (nueva): revisión de Mantenciones, parte 2. "Iniciar ahora" al programar (marcada desde el Kanban), aviso de fecha pasada, "Próximas (todas)", sin botón Calendario repetido, campos bloqueados en gris, hora en el Dashboard y calendario en celular.
- **v2.24 (2026-09-24):**
  - Sección 2.100 (nueva): revisión de Mantenciones, parte 1. Baja y servidor cierran la misma mantención, "vencida" igual en calendario y lista, nombre de tipo repetido marca el campo, fecha vacía al completar, texto e historial de la próxima mantención, reglas de fecha y estados sin repetir.
- **v2.23 (2026-09-24):**
  - Sección 2.99 (nueva): nombres de los resultados de una mantención con su consecuencia (Reparado, vuelve a uso · En espera de repuestos · Sin reparación), en un solo lugar compartido.
- **v2.22 (2026-09-24):**
  - Sección 2.98 (nueva): hora programada de las mantenciones (campo nuevo), Programar en una pantalla, Editar pendientes, aviso de repuestos, orden de agenda en la lista, vencida = pendiente atrasada, calendario sin correr el día y validación por campo en Tipos.
- **v2.21 (2026-09-24):**
  - Sección 2.97 (nueva): el detalle de un Onboarding ya no muestra "Equipos actuales del empleado".
- **v2.20 (2026-09-24):**
  - Sección 2.96 (nueva): el equipo entra a mantención al iniciarla, no al programarla; una sola mantención en proceso por equipo; "Faltan repuestos" la deja abierta; completar solo por /completar; editar las pendientes; migración de datos.
- **v2.19 (2026-09-23):**
  - Sección 2.95 (nueva): validación por campo, igual que Onboarding, en los formularios de Activos (activo, venta, empleado, Kit/EPP, importación), con piezas compartidas.
- **v2.18 (2026-09-23):**
  - Sección 2.94 (nueva): crear personas solo con Onboarding (se quitan el modal de Nueva Solicitud, POST /api/empleados y la importación de empleados sin pantalla); Personal con acciones a la vista; fecha de hoy en hora de Chile; ficha sin correo personal; mensaje de dato repetido legible.
- **v2.17 (2026-09-23):**
  - Sección 2.93 (nueva): se documentan los cambios del 22-sep (correo personal obligatorio, reemplaza 2.39; catálogos de sistema operativo, antivirus y licencia M365) y se ponen al día las pruebas. Suite completa sin fallas.
- **v2.16 (2026-09-23):**
  - Sección 2.92 (nueva): Activos y Solicitudes usables en celular; tabla de Activos que cabe en escritorio; tarjetas del tablero legibles; avisos bajo la barra; estado inválido ignorado; documento de la solicitud con una sola regla y sin acta vacía en la lista.
- **v2.15 (2026-09-23):**
  - Sección 2.91 (nueva): detalle de solicitud con los equipos en la columna ancha; tarjeta No devuelto y tarjetas que filtran en el panel; alertas, stock, movimientos y distribución corregidos.
- **v2.14 (2026-09-23):**
  - Sección 2.90 (nueva): equipos entregados en el detalle de un onboarding; equipos del ticket desde una sola función; un equipo recuperado en otro ticket sigue como "No devolvió" en el original; búsquedas por palabras en Solicitudes, Personal, Asignaciones, Guías y Activos (también por persona).
- **v2.13 (2026-09-23):**
  - Sección 2.89 (nueva): en Activos se entra al detalle y a editar desde la tabla, el tablero y las tarjetas; el tablero muestra las columnas No devuelto y Vendido (solo lectura).
- **v2.12 (2026-09-23):**
  - Sección 2.88 (nueva): la baja de un equipo pasa siempre por Mantenciones. Página "Dar de baja equipo" con los datos listos y `POST /api/mantenciones/baja`; botones "Dar de baja" y "Registrar venta" en el detalle del equipo; se elimina la baja directa (`/api/activos/[id]/baja` y su formulario).
- **v2.11 (2026-09-23):**
  - Sección 2.87 (nueva): recuperación de equipos "No devuelto" con una nueva desvinculación sobre el empleado ya desvinculado; el Acta de Devolución lista solo lo devuelto (sin devolución, no hay acta); un equipo devuelto dañado pasa a mantención (Correctiva) en vez de ir directo a baja.
- **v2.10 (2026-09-23):**
  - Sección 2.86 (nueva): revisión de Solicitudes, Dashboard y Activos. El estado del activo no se edita; validación del reemplazo en el cambio de equipo; detalle con todos los pares; documentos con los equipos y la fecha del ticket; número de ticket sin choques; devoluciones y vencidas corregidas; historial de baja legible; se elimina código sin uso.
- **v2.9 (2026-09-23):**
  - Sección 2.85 (nueva): el historial y las pantallas muestran etiquetas legibles en vez del valor interno de los estados; migración de datos que corrige el historial existente; correcciones de ortografía en textos visibles.
- **v2.8 (2026-09-23):**
  - Sección 2.84 (nueva): cambio de equipo de uno o varios equipos en la misma solicitud (lista `cambios` en la API, todos en una transacción); el comprobante muestra todos los pares y el estado real de cada equipo devuelto.
- **v2.7 (2026-09-23):**
  - Sección 2.83 (nueva): tabla de equipos única (`TablaEquipoActa`) en Comprobante de Entrega, Acta de Devolución y Comprobante de Cambio, con columnas nuevas N° de Serie y Especificaciones; cláusula de OT en la devolución y el cambio por Chilexpress.
- **v2.6 (2026-09-23):**
  - Sección 2.82 (nueva): toda solicitud nace cerrada al crearse (onboarding pasa a cerrarse también) o la API la rechaza con 400; offboarding sin nada que devolver también cierra. El detalle pierde el stepper y los paneles de etapa; los tickets heredados abiertos muestran un aviso y, si están a un paso del final, "Cerrar ticket".
- **v2.5 (2026-09-23):**
  - Sección 2.81 (nueva): la condición del cargador pasa a un enum propio `CondicionCargador` (`operativo`, `con_danos`, `no_incluido`), con migración que convierte los datos existentes.
- **v2.4 (2026-09-23):**
  - Sección 2.80 (nueva): la sede del navbar precarga los formularios de creación (navbar > sede propia > vacío; sin pisar una elección manual) con `useCampoSede`; helpers de servidor `sedeWhereConFiltro` y `leerSedeFiltroDesdeCookie`. Corrige el modal "Crear empleado" de Nueva Solicitud (no enviaba la sede), acota la búsqueda de empleados a la sede del navbar y pasa la sede a `SeleccionarCambioEquipo`.
- **v2.3 (2026-09-23):**
  - Sección 2.79 (nueva): se elimina el módulo Reportes completo (pantallas, exportaciones a Excel, trazabilidad, `/api/reportes/compras` sin uso y `DashboardTabs`). El recurso de permisos `reportes` se conserva porque controla el Dashboard.
- **v2.2 (2026-09-23):**
  - Sección 2.78 (nueva): rediseño visual. Logo oficial de SCL y favicon; `Navbar` superior sticky con blur en reemplazo del `Sidebar`; modo oscuro con tokens semánticos, script de migración de colores fijos (`scripts/migrar-tokens-tema.mjs`) y escalas de color ajustadas por tema; tarjetas `card-feature` con color derivado del estado real e inclinación 3D (`<Tilt>`, `vanilla-tilt` con import dinámico) en KPIs y accesos, nunca en listas grandes. Guía en `app/docs/DESIGN_SYSTEM.md`.
- **v2.1 (2026-09-22):**
  - Sección 2.77 (nueva): identidad visual SCL (tokens en `globals.css` @theme, Montserrat, componentes compartidos `PageHeader`/`StatCard`/`Tabs`/`Pagination`/badges), presentación de estados del activo centralizada en `lib/constants/estadosActivo.ts` (mismo color en todas las pantallas), formulario único `ActivoForm` para Nuevo/Editar Activo con Sistema Operativo/Antivirus/Licencia M365 desde catálogos en ambos modos (decisión de Javier), y `GET /api/dashboard/stats` suma `vendido` a `estadosData` y `vendidoAssets` a `kpis`.
- **v2.0 (2026-09-22):**
  - Sección 2.76 (nueva): el selector de equipos específicos en el formulario de Onboarding (Nueva Solicitud) traía un `limit=5` fijo al listar los disponibles de una categoría, mientras el badge mostraba el total real -- con más de 5 en stock no había forma de ver ni elegir el resto. Se sube el límite a 100 y la lista gana scroll propio. Reportado por Javier con una categoría con más de 40 disponibles.
- **v1.99 (2026-09-22):**
  - Sección 2.75 (nueva): las asignaciones históricas sin persona del import viejo ("1+"/"2+") no aparecían en el cuadro "Historial de Asignaciones" de la ficha del activo, solo mezcladas dentro de "Historial de Eventos". Se marcan con un flag estructurado en `AssetHistory.datosNuevos` y se agregan a ese cuadro con tarjetas placeholder distinguibles ("Persona no registrada", etc.), sin crear ningún empleado inventado. Pedido de Javier.
- **v1.98 (2026-09-22):**
  - Sección 2.74 (nueva): las filas de "Historial de asignaciones" importado (SPEC 2.65) quedaban indistinguibles entre sí cuando el Excel indicaba más de una -- mismo texto exacto, mismo instante de creación, se veían como un evento duplicado en la línea de tiempo del activo. Se agrega un contador "(1 de 2)"/"(2 de 2)" al texto. Se documenta también la decisión de mantenerlas en `AssetHistory` en vez de `Assignment` real, dado que `employeeId` es obligatorio y no hay persona real que vincular -- Javier descartó explícitamente crear un empleado "No registrado" placeholder para forzar ese vínculo.
- **v1.97 (2026-09-22):**
  - Sección 2.73 (nueva): la importación de Activos podía dejar un equipo en estado "En Mantención" sin crear ningún ticket de `Maintenance` -- pasaba cuando el Excel traía `Estado = "Mantención"` sin columnas de fecha de mantención, porque ambas cosas se procesaban de forma independiente. El equipo quedaba sin forma de completarse desde el flujo normal. Se corrige el import para crear un ticket pendiente automático en ese caso, y se generan retroactivamente los tickets faltantes para los 7 de 9 equipos ya importados que estaban en esta situación. Reportado por Javier al notar el caso real "J8HZGJ3".
- **v1.96 (2026-09-22):**
  - Sección 2.72 (nueva): el buscador de Mantenciones tenia el mismo bug de "termino completo vs. campo individual" ya corregido en Activos (no encontraba nombres de equipo compuestos), buscaba en el texto libre de la mantencion en vez de en el activo/empleado involucrados, y partia con el filtro de periodo en "Mes" en vez de "Historial completo". Se corrige el matching por palabras, se acota la busqueda a datos de activo y empleado asignado (RUT, nombre, categoria, ubicacion, etc.), y el periodo por defecto pasa a "Historial completo". Tres pedidos seguidos de Javier sobre el mismo buscador.
- **v1.95 (2026-09-22):**
  - Sección 2.71 (nueva): el botón "Ver activos importados" tras una importación exitosa usaba `Link` (navegación soft de Next.js), que reutilizaba la instancia ya montada de `/activos` con su conteo viejo en vez de recargar los datos. Se cambia a un `<a>` normal para forzar una recarga completa. Pedido de Javier al notar que tras importar la página seguía mostrando 0 activos.

- **v1.94 (2026-09-22):**
  - Sección 2.70 (nueva): el panel de Alertas ya no recorta a 5 items (se listan todas), el texto largo en las alertas y en las tarjetas de Activos ya no se corta con "..." (envuelve en varias lineas), y se corrige que varias grillas de tarjetas subian su numero de columnas justo en el breakpoint en que el Sidebar pasa a ocupar ancho fijo, lo que hacia que las tarjetas se achicaran a menos de la mitad al agrandar la ventana. Tres pedidos seguidos de Javier sobre el mismo panel.
- **v1.93 (2026-09-22):**
  - Sección 2.69 (nueva): el panel de Alertas del Dashboard no mostraba mantenciones de todas las sedes al elegir "Todas las sedes" -- faltaba `orderBy` en la consulta y el recorte a 5 alertas dejaba fuera a las sedes con menos antigüedad en la base. Se ordena por fecha y se agrega la etiqueta de sede a cada alerta. Pedido de Javier tras notar que el selector "Todas las sedes" solo entregaba datos de Santiago.
- **v1.92 (2026-09-22):**
  - Sección 2.68 (nueva): el export de Activos suma color por grupo de columnas y bandeado de filas (via `exceljs`, ya que `xlsx` no soporta estilos de celda) y nuevos campos: Jefatura, Supervisor, Correo Empresa, Fecha de Entrega, Ultima Mantencion Realizada y Proxima Mantencion Programada. Pedido de Javier: que el export se vea atractivo e intuitivo y tenga mas datos, senalando un Excel de referencia.
- **v1.91 (2026-09-21):**
  - Sección 2.67 (nueva): el export de Activos pasa de una hoja unica con todas las sedes mezcladas a una hoja por Sede (mas "Resumen" primero), cada una con su propio filtro de columnas. Pedido de Javier para que el archivo quede mas ordenado.
- **v1.90 (2026-09-21):**
  - Sección 2.66 (nueva): el export de Activos gana los campos que le faltaban (Sede, Nombre Equipo, Fecha Baja/Venta, Conectividad, Lista Distribucion, Incidencia, N° Activacion, Tipo Plan, Tiene Cargador, Fecha Creacion), columnas reordenadas por grupos logicos, filtro de columnas de Excel activado, y una hoja "Resumen" con conteo por Sede y Estado. Pedido de Javier: que el export sea intuitivo, facil de leer y tenga todos los datos.
- **v1.89 (2026-09-21):**
  - Sección 2.65 (nueva): el historial de asignaciones importado (SPEC 2.61) pasa de una sola linea con el contador literal ("1+") a una linea por asignacion ("Asignacion historica... sin datos de la persona"), con tope de 20 por activo. Pedido de Javier: encontro el contador literal poco prolijo.
- **v1.88 (2026-09-21):**
  - Sección 2.64 (nueva): las entradas de historial de mantención (import, crear, completar, editar) ahora incluyen la fecha del evento en el propio texto -- antes solo decian "realizada"/"programada"/"completada" sin fecha, y solo el `createdAt` de la entrada (momento del clic o de la importacion) aparecia en la linea de tiempo, que puede no tener nada que ver con cuando se realizo o para cuando se programo la mantencion. Pedido de Javier al revisar el historial de un activo importado.
- **v1.87 (2026-09-21):**
  - Sección 2.63 (nueva): el buscador de Activos ahora separa el termino en palabras y exige que cada una aparezca en algun campo (serie, marca, modelo o nombre de equipo), no que el texto completo coincida con uno solo. Antes "Hp Probook 640 G2" no encontraba nada porque marca y modelo estan en columnas separadas. Pedido de Javier al probar el buscador.
- **v1.86 (2026-09-21):**
  - Sección 2.62 (nueva): se elimina el respaldo que usaba la fecha de entrega como fecha de compra cuando el Excel no traia esa columna -- la ficha del activo mostraba esa fecha bajo el rotulo equivocado, sin avisar que era una estimacion. Ahora queda "No registrada" si no hay un dato real. Pedido de Javier al revisar la ficha de un activo importado.
  - Sección 2.61 (nueva): tres datos del Excel que se perdian en silencio durante el import ahora se conservan -- "Historial de asignaciones" (contador antiguo sin nombre de persona) queda como una linea informativa en el historial del activo; "Proxima Mantencion" ahora crea un ticket de mantencion pendiente aparte cuando tambien hay una mantencion ya realizada en la misma fila (antes quedaba solo como dato informativo, invisible en la cola de pendientes); y "Nombre Equipo" -- un campo que ya existia en el Asset y ya se mostraba en la ficha, pero que el import nunca leia -- ahora se guarda correctamente. No requiere migracion. Pedido de Javier al verificar el import contra el Excel real.
- **v1.85 (2026-09-20):**
  - Sección 2.59 (nueva): `Assignment.fechaEntrega` pasa a ser nullable -- una fila de importación sin ese dato ya no se rechaza, se guarda como "fecha desconocida" en vez de inventar una fecha o perder la asignación. La creación manual de asignaciones sigue exigiendo una fecha real. Requiere migración. Pedido de Javier, que encontró filas de datos históricos sin ese campo al probar la importación en vivo.
- **v1.84 (2026-09-20):**
  - Sección 2.58 (nueva): se elimina el módulo antiguo de Desvinculaciones (modelo `Termination`, sus páginas y endpoints, `executeTerminationReturn`, sus validaciones), que ya no era alcanzable desde ninguna pantalla y duplicaba, peor, lo que hoy hace el flujo de Solicitudes. Se van con él el "Reporte para RRHH" y su Excel (construidos enteros sobre ese modelo, a rehacer más adelante sobre los offboarding de Solicitudes), el KPI "Devoluciones Pend." del Dashboard con sus alertas, y la opción de limpieza de datos correspondiente. Se conserva el enum `EstadoDevolucionTipo`, que también usa el estado del cargador (SPEC 2.48). Requiere migración: elimina la tabla `terminations`. Pedido de Javier para limpiar código sin uso.
- **v1.83 (2026-09-20):**
  - Sección 2.57 (nueva): `EstadoActivo` gana el valor `no_devuelto`, para los equipos que quedaron en manos de alguien que se desvinculó y no los devolvió. Reemplaza el mecanismo anterior, que los dejaba en "Asignado" y por lo tanto invisibles en cualquier conteo o filtro. Transiciones: se entra solo desde `asignado`; se sale a `disponible` (aparece) o `baja` (se da por perdido), siempre con motivo. `executeReturn()` ahora sí cambia el estado del Activo al calificar "No devolvió" en Offboarding, sin cerrar la asignación (que es lo que permite recuperarlo después). La importación reconoce "No devuelto" en la columna Estado y conserva el empleado y la asignación de esas filas. Se muestra como categoría propia en la barra de estados, el gráfico del Dashboard, la ficha, el listado, la exportación y los reportes. Requiere migración de Prisma. Pedido de Javier tras encontrar el caso en la planilla real.
- **v1.82 (2026-09-20):**
  - Sección 2.56 (nueva): la importación de Activos deja de escribir en la base de inmediato. Se extrae la lógica de negocio por fila a una función compartida (`procesarFila`, con modo `dryRun`) usada tanto por la vista previa como por la escritura real, así ambas quedan garantizadas de coincidir. Nuevo flujo: detectar campos -> corregir filas con error en un panel que ya no escribe nada por su cuenta -> un único botón "Realizar importación" que confirma todo de una vez. Se elimina el endpoint de escritura inmediata (`POST /api/activos/importar`). Se agregan descripciones bajo cada campo del mapeo de columnas y se retira el campo "Equipo" (código muerto). Pedido explícito de Javier tras encontrar que cancelar a mitad de la corrección de errores no evitaba que el resto ya se hubiera importado.
  - Sección 2.55 (nueva): se saca el indicador visual de pasos (círculos numerados) del formulario de creación de Solicitudes -- el formulario ya se completa de una sola vez, la barra de progreso sugería lo contrario. Pedido de Javier.
- **v1.81 (2026-09-19):**
  - Sección 2.54 (nueva): importación de Activos -- la sede de cada fila se lee de una columna "Sede" propia (comparada contra las sedes reales de la base, sin importar mayúsculas/tildes), no de la comuna. Admin: sede opcional, detección automática por fila si se deja en blanco. Técnico: sigue amarrado a su sede; si una fila declara otra sede real, se rechaza en vez de reetiquetarla. Nuevos tipos de error `sede_no_reconocida`/`sede_ajena`. Reemplaza un primer intento (mismo día) basado en una tabla de 346 comunas de Chile, descartado a pedido de Javier por atacar el síntoma y no la causa. Se entrega `Inventario_Normalizado_Con_Sede.xlsx` con la columna nueva ya poblada para los 239 registros reales.

- **v1.80 (2026-09-18):**
  - Sección 2.29.4 actualizada: se corrige F-2 (status 200 en vez de 404 al pedir por URL directa un activo de otra sede) a pedido explícito de Javier. Se elimina `src/app/(dashboard)/loading.tsx`, quitando el Suspense boundary compartido de todo el dashboard, para que el render deje de hacer streaming y la respuesta HTTP espere a que `notFound()` se resuelva. Corrige el status code en todas las pantallas que usan `assertSedeAccess`, no solo en la ficha de activo. Costo aceptado: se pierde el spinner de navegación instantáneo compartido en todo el dashboard. Pendiente que Javier verifique en runtime (`next build && next start`, prueba C10) ya que no se pudo confirmar en vivo desde este entorno.
- **v1.79 (2026-09-18):**
  - Sección 2.29.5 (nueva): corrige F-3 (Alto) y F-4 (Crítico) de la segunda ronda de la auditoría de seguridad -- `/api/dashboard/stats` devolvía KPIs globales (no de la sede del usuario) y `/api/dashboard/alertas` exponía alertas individuales (marca/modelo/serie de equipos, nombre y RUT de empleados) de cualquier sede a cualquier técnico. Se extiende `sedeWhere(session)` a las 16 consultas de ambos endpoints, reutilizando el mismo patrón ya establecido en `/api/activos`, `/api/empleados`, `/api/mantenciones` y el reporte RRHH; el `$queryRaw` de asignaciones por mes se corrige con `JOIN assets` + `Prisma.sql`/`Prisma.empty` condicional. Se agrega también el `?sedeId=` opcional para quien tiene visibilidad total. `/api/reportes/compras` queda fuera a pedido explícito de Javier (el módulo de Reportes se rehará más adelante).
- **v1.78 (2026-09-18):**
  - Sección 2.29.4 (nueva): investigación del hallazgo F-2 de la auditoría de seguridad (status 200 en vez de 404 al pedir la ficha de un activo de otra sede). Confirmado en build de producción, no es artefacto de `next dev`. Causa raíz: `(dashboard)/loading.tsx` envuelve la página en un `Suspense` que transmite el shell con status 200 antes de que `notFound()` pueda corregirlo. Se probaron las dos correcciones propuestas (`generateMetadata`, `dynamic = "force-dynamic"`); ninguna resolvió el status en Next.js 16.1.1, y se revirtieron. Sin fuga de datos confirmada. Queda documentado como limitación conocida; el cambio que sí lo resolvería (sacar la página del `loading.tsx` compartido) excede el alcance de este hallazgo y queda pendiente de decisión de Javier.
- **v1.77 (2026-09-18):**
  - Sección 2.29.3 (nueva): corrige el hallazgo F-1 de la auditoría de seguridad de aislamiento por sede (2026-09-17) -- el redirect de sesión no autenticada apuntaba a `/api/auth/signin` (pantalla genérica de NextAuth) en vez de `/login`. Se agrega `pages: { signIn: "/login" }` a `withAuth()` en `middleware.ts`. Verificado contra dev: ahora redirige a `/login?callbackUrl=...`.
- **v1.76 (2026-09-18):**
  - Sección 2.29.2 (nueva): fuga entre sedes detectada por Javier probando con un usuario técnico -- podía abrir por URL la ficha de un activo de otra sede. Los server components que consultan Prisma directo (la ficha del activo y los cinco reportes) no pasaban por `sedeWhere`/`assertSedeAccess`, que viven en las rutas de API. Se corrigen los seis, más tres endpoints de Excel que tampoco filtraban.
- **v1.75 (2026-09-18):**
  - Sección 2.10.8 (nueva): la ficha del activo muestra su sede, dato que no aparecía en ninguna parte pese a decidir quién puede ver el equipo. Pedido de Javier.
- **v1.74 (2026-09-18):**
  - Sección 2.29.1 (nueva): REVERSIÓN de la visibilidad de técnico definida en 2.29/2.30. Un técnico vuelve a quedar amarrado a su sede, en la interfaz y en el backend: `tieneVisibilidadTotal` es de nuevo solo `admin`, el selector del nav queda fijo en su sede y todos los formularios muestran el campo Sede deshabilitado. Decisión explícita de Javier, tomada sabiendo que deshace el motivo original (los equipos de Perú) y que es la tercera vuelta sobre la misma decisión. Se actualizan `sedeScope.test.ts` en consecuencia.
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
