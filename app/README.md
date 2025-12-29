# Sistema de Control de Inventario IT

Sistema web para la gestión integral del ciclo de vida de activos tecnológicos, desarrollado para empresas con alta rotación de personal.

## Características Principales

- **Gestión de Activos**: CRUD completo de notebooks, celulares, monitores, impresoras y periféricos
- **Gestión de Empleados**: Registro con RUT chileno validado, tipos de contrato y ubicaciones
- **Asignaciones**: Flujo completo de entrega y devolución de equipos con actas digitales
- **Mantenciones**: Programación y seguimiento de mantenciones preventivas y correctivas
- **Desvinculaciones**: Proceso de devolución de equipos al término de contrato
- **Compras**: Gestión de proveedores y vinculación con facturas
- **Dashboard**: KPIs en tiempo real y alertas de equipos
- **Reportes**: Exportación a Excel y generación de PDFs
- **Trazabilidad**: Historial completo de cada activo

## Stack Tecnológico

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS
- **UI Components**: shadcn/ui
- **Backend**: Next.js API Routes
- **ORM**: Prisma 5
- **Base de Datos**: PostgreSQL
- **Autenticación**: NextAuth.js
- **Validación**: Zod
- **Estado**: TanStack Query (React Query)
- **Gráficos**: Recharts
- **Excel**: xlsx
- **PDF**: jsPDF + jspdf-autotable

## Requisitos Previos

- Node.js 18+
- PostgreSQL 14+
- npm o yarn

## Instalación

1. **Clonar el repositorio**
```bash
git clone <url-repositorio>
cd inventario-it
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
```

Editar `.env` con las configuraciones:
```env
# Base de datos PostgreSQL
DATABASE_URL="postgresql://usuario:password@localhost:5432/inventario_it?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="tu-secret-seguro-aqui"
```

4. **Ejecutar migraciones de base de datos**
```bash
npm run db:migrate
```

5. **Cargar datos iniciales**
```bash
npm run db:seed
```

6. **Iniciar el servidor de desarrollo**
```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## Usuario por Defecto

Después de ejecutar el seed, podrás acceder con:
- **Email**: admin@inventario.cl
- **Password**: admin123

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia servidor de desarrollo |
| `npm run build` | Compila para producción |
| `npm run start` | Inicia servidor de producción |
| `npm run lint` | Ejecuta ESLint |
| `npm run test` | Ejecuta tests unitarios |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:coverage` | Tests con reporte de cobertura |
| `npm run db:migrate` | Ejecuta migraciones de Prisma |
| `npm run db:push` | Sincroniza schema sin migración |
| `npm run db:seed` | Carga datos iniciales |
| `npm run db:studio` | Abre Prisma Studio |

## Estructura del Proyecto

```
src/
├── app/
│   ├── (auth)/              # Páginas de autenticación
│   │   ├── login/
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/         # Aplicación principal
│   │   ├── page.tsx         # Dashboard
│   │   ├── activos/         # Gestión de activos
│   │   ├── empleados/       # Gestión de empleados
│   │   ├── asignaciones/    # Asignaciones
│   │   ├── desvinculaciones/# Desvinculaciones
│   │   ├── mantenciones/    # Mantenciones
│   │   ├── compras/         # Compras y proveedores
│   │   └── configuracion/   # Configuración
│   │
│   └── api/                 # API Routes
│       ├── activos/
│       ├── empleados/
│       ├── asignaciones/
│       ├── mantenciones/
│       ├── compras/
│       ├── dashboard/
│       └── reportes/
│
├── components/
│   ├── ui/                  # Componentes shadcn/ui
│   ├── charts/              # Gráficos del dashboard
│   ├── layout/              # Layout (Sidebar, Header)
│   └── providers/           # Providers (Session, Query)
│
├── lib/
│   ├── prisma.ts           # Cliente Prisma
│   ├── auth.ts             # Configuración NextAuth
│   ├── utils.ts            # Utilidades
│   ├── validations/        # Schemas Zod
│   └── services/           # Servicios de negocio
│
└── __tests__/              # Tests unitarios
```

## Roles de Usuario

| Rol | Permisos |
|-----|----------|
| **admin** | Acceso completo, gestión de usuarios |
| **tecnico** | Asignar/recibir equipos, mantenciones |
| **supervisor** | Ver reportes de su área |
| **rrhh** | Solo lectura de fichas de empleados |
| **auditor** | Solo lectura de todo el sistema |

## Flujos Principales

### 1. Asignación de Equipo

1. Buscar empleado por RUT
2. Seleccionar equipo(s) disponible(s)
3. Completar datos de entrega
4. Generar acta de entrega
5. Equipo cambia a estado "asignado"

### 2. Devolución de Equipo

1. Buscar asignación activa
2. Registrar estado de devolución (OK/Dañado/Incompleto)
3. Agregar observaciones si aplica
4. Equipo cambia a "disponible" o "reutilizable"

### 3. Proceso de Desvinculación

1. RRHH notifica desvinculación
2. Sistema lista equipos asignados
3. Técnico registra devolución de cada equipo
4. Si hay daños, se calcula descuento
5. Se genera reporte para RRHH

## Estados de Activos

| Estado | Descripción | Color |
|--------|-------------|-------|
| `disponible` | Listo para asignar | Verde |
| `asignado` | En uso por empleado | Azul |
| `en_mantencion` | En reparación | Amarillo |
| `reutilizable` | Devuelto, necesita revisión | Naranja |
| `baja` | Para dar de baja | Rojo |
| `vendido` | Vendido (chatarra) | Gris |

## API Endpoints

### Activos
- `GET /api/activos` - Listar con filtros y paginación
- `POST /api/activos` - Crear nuevo
- `GET /api/activos/:id` - Obtener detalle
- `PUT /api/activos/:id` - Actualizar
- `DELETE /api/activos/:id` - Eliminar
- `POST /api/activos/importar` - Importar desde Excel
- `GET /api/activos/exportar` - Exportar a Excel

### Empleados
- `GET /api/empleados` - Listar con filtros
- `POST /api/empleados` - Crear nuevo
- `GET /api/empleados/:id` - Obtener detalle
- `GET /api/empleados/:id/ficha` - Ficha completa
- `GET /api/empleados/buscar?rut=XX.XXX.XXX-X` - Buscar por RUT

### Asignaciones
- `GET /api/asignaciones` - Listar asignaciones
- `POST /api/asignaciones` - Nueva asignación
- `PUT /api/asignaciones/:id` - Registrar devolución
- `GET /api/asignaciones/:id/acta` - Generar acta PDF

### Dashboard
- `GET /api/dashboard/stats` - Estadísticas principales
- `GET /api/dashboard/alertas` - Alertas del sistema

## Validación de RUT Chileno

El sistema valida automáticamente el formato y dígito verificador de RUTs chilenos:
- Formato aceptado: `XX.XXX.XXX-X` o `XXXXXXXX-X`
- Se formatea automáticamente con puntos y guión
- Acepta dígito verificador numérico o K

## Importación desde Excel

### Formato para Activos (Notebooks)
| RUT | Nombre | Correo | Marca | Modelo | Serie | Procesador | RAM | Estado |
|-----|--------|--------|-------|--------|-------|------------|-----|--------|

### Formato para Empleados
| RUT | Nombres | Apellido P | Apellido M | Correo | Cargo | Tipo Contrato | Ubicación |
|-----|---------|------------|------------|--------|-------|---------------|-----------|

## Configuración de Producción

### Variables de Entorno
```env
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="https://tu-dominio.com"
NEXTAUTH_SECRET="secret-muy-seguro-de-produccion"
```

### Despliegue en Vercel
```bash
npm run build
vercel deploy --prod
```

### Despliegue en Railway
1. Conectar repositorio
2. Configurar variables de entorno
3. Railway detecta Next.js automáticamente

## Respaldo de Base de Datos

### Backup manual
```bash
pg_dump -U usuario -d inventario_it > backup_$(date +%Y%m%d).sql
```

### Restaurar backup
```bash
psql -U usuario -d inventario_it < backup_20240101.sql
```

## Troubleshooting

### Error de conexión a base de datos
- Verificar que PostgreSQL está corriendo
- Verificar credenciales en `DATABASE_URL`
- Ejecutar `npx prisma db push` para sincronizar schema

### Error de autenticación
- Verificar `NEXTAUTH_SECRET` está configurado
- Verificar `NEXTAUTH_URL` coincide con la URL de acceso
- Limpiar cookies del navegador

### Migraciones pendientes
```bash
npx prisma migrate deploy
```

## Contribución

1. Fork del repositorio
2. Crear branch: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m 'Agregar nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

## Licencia

Este proyecto es de uso interno y propietario de la empresa.

---

Desarrollado con Next.js y PostgreSQL
