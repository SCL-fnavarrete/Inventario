# Sistema de Control de Inventario IT

Sistema web para la gestion integral del ciclo de vida de activos tecnologicos, desarrollado para **SCL Consultores**. Permite controlar notebooks, celulares, monitores, perifericos y su asignacion a empleados, mantenciones, compras, desvinculaciones y guias de despacho.

> Contexto empresarial chileno: validacion de RUT, interfaz en espanol, integracion con Microsoft Entra ID.

## Caracteristicas Principales

- **Gestion de Activos** — CRUD completo de notebooks, celulares, monitores, impresoras y perifericos con estados de ciclo de vida (disponible, asignado, en mantencion, reutilizable, baja, vendido)
- **Gestion de Empleados** — Registro con RUT chileno (opcional), tipos de contrato, ubicaciones y cargos
- **Microsoft Entra ID Sync** — Sincronizacion unidireccional (solo lectura) de empleados desde Azure AD via Graph API. Los empleados sincronizados se identifican con badge "Microsoft"
- **Asignaciones** — Flujo completo de entrega y devolucion de equipos con generacion de actas digitales en PDF
- **Mantenciones** — Programacion y seguimiento de mantenciones preventivas y correctivas con calendario
- **Desvinculaciones** — Proceso de devolucion de equipos al termino de contrato con reporte RRHH
- **Compras** — Gestion de proveedores, ordenes de compra y vinculacion con activos
- **Guias de Despacho** — Generacion y seguimiento de guias con PDF descargable
- **Dashboard** — KPIs en tiempo real, graficos y alertas automaticas (mantenciones vencidas, devoluciones pendientes, equipos danados)
- **Reportes** — Exportacion a Excel (inventario, empleados, stock, obsoletos, RRHH) y generacion de PDFs
- **Trazabilidad** — Historial completo de cada activo con registro de todos los eventos
- **Importacion** — Carga masiva de activos y empleados desde archivos Excel

## Stack Tecnologico

| Capa | Tecnologia |
|------|-----------|
| Framework | Next.js 16 (App Router, React 19) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS 4 |
| ORM | Prisma 5 |
| Base de Datos | PostgreSQL (Neon) |
| Autenticacion | NextAuth.js 4 (JWT, Credentials) |
| Validacion | Zod 4 |
| Estado cliente | TanStack React Query |
| Graficos | Recharts |
| Excel | xlsx |
| PDF | jsPDF + jspdf-autotable, PDFDocument |
| Deploy | Vercel |

## Estructura del Proyecto

```
Inventario_Equipo/
├── app/                          # Aplicacion Next.js (Root Directory en Vercel)
│   ├── prisma/
│   │   ├── schema.prisma         # 13+ modelos (Asset, Employee, Assignment, etc.)
│   │   └── seed.ts               # Datos iniciales (usuarios, categorias)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/login/     # Pagina de login (publica)
│   │   │   ├── (dashboard)/      # Paginas autenticadas
│   │   │   │   ├── activos/      # Gestion de activos
│   │   │   │   ├── empleados/    # Gestion de empleados
│   │   │   │   ├── asignaciones/ # Asignaciones de equipos
│   │   │   │   ├── mantenciones/ # Mantenciones preventivas/correctivas
│   │   │   │   ├── desvinculaciones/ # Proceso de desvinculacion
│   │   │   │   ├── compras/      # Ordenes de compra
│   │   │   │   ├── guias-despacho/ # Guias de despacho
│   │   │   │   ├── reportes/     # Reportes exportables
│   │   │   │   └── configuracion/ # Config, categorias, usuarios, Microsoft Sync
│   │   │   └── api/              # ~54 REST endpoints
│   │   │       ├── activos/      # CRUD + importar/exportar
│   │   │       ├── empleados/    # CRUD + ficha + buscar
│   │   │       ├── asignaciones/ # CRUD + acta PDF
│   │   │       ├── mantenciones/ # CRUD + completar + pendientes
│   │   │       ├── desvinculaciones/ # CRUD + procesar + reporte
│   │   │       ├── compras/      # CRUD + vincular activos
│   │   │       ├── guias-despacho/ # CRUD + PDF
│   │   │       ├── microsoft-sync/ # Sync + status
│   │   │       ├── dashboard/    # Stats + alertas
│   │   │       └── reportes/     # Excel exports
│   │   ├── components/
│   │   │   ├── ui/               # Componentes reutilizables
│   │   │   ├── layout/           # Sidebar, Header
│   │   │   ├── dashboard/        # Graficos, alertas
│   │   │   ├── activos/          # Componentes de activos
│   │   │   └── reportes/         # Buscador de empleados
│   │   └── lib/
│   │       ├── auth.ts           # NextAuth config (roles, rate limiting)
│   │       ├── prisma.ts         # Prisma singleton
│   │       ├── services/         # assetHistoryService, microsoftGraphService
│   │       ├── validations/      # Zod schemas
│   │       └── utils/            # RUT validation, formatters
│   └── package.json
├── excel/                        # Archivos Excel fuente
└── CLAUDE.md                     # Instrucciones para Claude Code
```

## Roles de Usuario

| Rol | Permisos |
|-----|----------|
| **admin** | Acceso completo, gestion de usuarios, Microsoft Sync |
| **tecnico** | Asignar/recibir equipos, mantenciones |
| **supervisor** | Ver reportes de su area |
| **rrhh** | Lectura de fichas de empleados, desvinculaciones |
| **auditor** | Solo lectura de todo el sistema |

## Estados de Activos

| Estado | Descripcion |
|--------|-------------|
| `disponible` | Listo para asignar |
| `asignado` | En uso por un empleado |
| `en_mantencion` | En reparacion o mantencion |
| `reutilizable` | Devuelto, necesita revision |
| `baja` | Dado de baja |
| `vendido` | Vendido o descartado |

## Requisitos Previos

- Node.js 18+
- PostgreSQL 14+ (o cuenta en [Neon](https://neon.tech))
- npm

## Instalacion

```bash
# 1. Clonar el repositorio
git clone https://github.com/nanonroses/inventario.git
cd inventario/app

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con las credenciales de base de datos y NextAuth

# 4. Ejecutar migraciones
npm run db:migrate

# 5. Cargar datos iniciales (usuario admin + categorias)
npm run db:seed

# 6. Iniciar servidor de desarrollo
npm run dev
```

La aplicacion estara disponible en `http://localhost:3000`

### Usuario por Defecto

Despues del seed:
- **Email:** admin@inventario.cl
- **Password:** admin123

## Variables de Entorno

```env
# Base de datos PostgreSQL (Neon)
DATABASE_URL="postgresql://..."           # Conexion pooled
DATABASE_URL_UNPOOLED="postgresql://..."   # Conexion directa (migraciones)

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="tu-secret-seguro"

# Microsoft Entra ID (opcional - sincronizacion de empleados)
MICROSOFT_TENANT_ID=""
MICROSOFT_CLIENT_ID=""
MICROSOFT_CLIENT_SECRET=""
```

## Microsoft Entra ID Sync

Integracion unidireccional (solo lectura) con Microsoft Entra ID (Azure AD) para sincronizar empleados automaticamente.

**Funcionalidades:**
- Sincronizacion manual via boton en Configuracion (solo admin)
- Crea empleados nuevos, actualiza existentes, desactiva los eliminados de Entra
- Vinculacion por correo electronico en la primera sincronizacion, por Microsoft ID en las siguientes
- Los empleados sincronizados se muestran con badge "Microsoft" y pueden no tener RUT
- Alertas si un empleado desactivado tiene equipos asignados

**Configuracion en Azure Portal:**
1. Registrar aplicacion en Azure Portal > App registrations
2. Agregar permiso `User.Read.All` (Application) y otorgar consentimiento admin
3. Crear Client Secret
4. Configurar las 3 variables de entorno (`MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`)

## Scripts Disponibles

Todos desde el directorio `app/`:

| Comando | Descripcion |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilar para produccion (`prisma generate && next build`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Verificacion de tipos TypeScript |
| `npm run test` | Tests unitarios (Jest) |
| `npm run test:coverage` | Tests con cobertura (umbral 70%) |
| `npm run db:migrate` | Crear migracion Prisma |
| `npm run db:push` | Sincronizar schema sin migracion |
| `npm run db:seed` | Cargar datos iniciales |
| `npm run db:studio` | Abrir Prisma Studio |

## Despliegue

**Vercel** con git integration. Cada push a `main` despliega automaticamente.

- **Root Directory:** `app` (configurado en Vercel Project Settings)
- **Build Command:** `prisma generate && next build`
- **Variables de entorno:** configurar en Vercel Dashboard

## API Endpoints

### Activos
- `GET /api/activos` — Listar con filtros y paginacion
- `POST /api/activos` — Crear nuevo
- `GET /api/activos/:id` — Detalle
- `PUT /api/activos/:id` — Actualizar
- `DELETE /api/activos/:id` — Eliminar
- `POST /api/activos/importar` — Importar desde Excel
- `GET /api/activos/exportar` — Exportar a Excel

### Empleados
- `GET /api/empleados` — Listar con filtros
- `POST /api/empleados` — Crear nuevo
- `GET /api/empleados/:id` — Detalle
- `GET /api/empleados/:id/ficha` — Ficha completa con equipos
- `GET /api/empleados/buscar?rut=XX.XXX.XXX-X` — Buscar por RUT

### Asignaciones
- `GET /api/asignaciones` — Listar
- `POST /api/asignaciones` — Nueva asignacion
- `PUT /api/asignaciones/:id` — Registrar devolucion
- `GET /api/asignaciones/:id/acta` — Generar acta PDF

### Mantenciones
- `GET /api/mantenciones` — Listar
- `POST /api/mantenciones` — Programar mantencion
- `PUT /api/mantenciones/:id/completar` — Completar mantencion

### Desvinculaciones
- `GET /api/desvinculaciones` — Listar
- `POST /api/desvinculaciones` — Crear
- `PUT /api/desvinculaciones/:id/procesar-devolucion` — Procesar devolucion
- `GET /api/desvinculaciones/:id/reporte-rrhh` — Reporte PDF

### Microsoft Sync
- `GET /api/microsoft-sync/status` — Estado de configuracion y estadisticas
- `POST /api/microsoft-sync` — Ejecutar sincronizacion (solo admin)

### Dashboard
- `GET /api/dashboard/stats` — Estadisticas principales
- `GET /api/dashboard/alertas` — Alertas del sistema

## Licencia

Proyecto de uso interno y propietario de SCL Consultores.
