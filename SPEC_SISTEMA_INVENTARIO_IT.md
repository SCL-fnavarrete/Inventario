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

---

# PARTE 2: MODELO DE DATOS (MODEL)

## 2.1 Entidades Principales

### EMPLEADOS (employees)
```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut VARCHAR(12) UNIQUE NOT NULL,           -- Ej: "21.523.308-1"
    nombre VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100),
    correo VARCHAR(150) UNIQUE NOT NULL,       -- Ej: "bsanjuan@sclconsultores.com"
    cargo VARCHAR(100),
    jefatura VARCHAR(100),                      -- Nombre del jefe directo
    supervisor VARCHAR(100),
    ubicacion VARCHAR(100),                     -- Ej: "Santiago", "Rancagua", "Concepcion"
    tipo_contrato ENUM('planta', 'proyecto', 'externo') NOT NULL,
    fecha_ingreso DATE,
    fecha_termino DATE,                         -- NULL si es planta indefinido
    estado ENUM('activo', 'desvinculado', 'licencia') DEFAULT 'activo',
    telefono_contacto VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

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
    pulgadas DECIMAL(4,1),                     -- Ej: 14.0, 15.6, 27
    sistema_operativo VARCHAR(50),             -- Ej: "Windows 10", "Windows 11 Pro"
    
    -- Specs Celular
    numero_telefono VARCHAR(20),               -- Ej: "56996191268"
    numero_activacion VARCHAR(20),             -- Número de línea activación
    tipo_plan VARCHAR(50),                     -- Ej: "Full"
    tiene_cargador BOOLEAN DEFAULT true,
    
    -- Estado y ubicación
    estado ENUM('disponible', 'asignado', 'en_mantencion', 'reutilizable', 'baja', 'vendido') DEFAULT 'disponible',
    condicion ENUM('nuevo', 'usado', 'dañado') DEFAULT 'nuevo',
    ubicacion_fisica VARCHAR(100),             -- Ej: "Bodega", "Oficina Santiago"
    
    -- Software/Licencias
    microsoft_365 BOOLEAN DEFAULT false,
    intune_enrolled BOOLEAN DEFAULT false,
    lista_distribucion VARCHAR(200),           -- Listas de correo asignadas
    
    -- Fechas importantes
    fecha_compra DATE,
    fecha_garantia_fin DATE,
    fecha_baja DATE,
    
    -- Observaciones
    observaciones TEXT,                        -- Ej: "Pantalla rota, problema BIOS, Teclado malo"
    
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
    numero_factura VARCHAR(50) NOT NULL,
    fecha_factura DATE NOT NULL,
    monto_total DECIMAL(12,2),
    moneda ENUM('CLP', 'USD') DEFAULT 'CLP',
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

### MANTENCIONES (maintenances)
```sql
CREATE TABLE maintenances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id),
    
    tipo ENUM('preventiva', 'correctiva', 'actualizacion_so', 'limpieza', 'reparacion') NOT NULL,
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
        'venta'
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

Versión: 1.0
Fecha: 2025
Metodología: BMAD
Autor: Arquitectura generada para desarrollo por IA
```
