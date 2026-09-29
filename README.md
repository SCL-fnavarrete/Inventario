# Sistema de Control de Inventario IT

Aplicación web de **SCL Consultores** para llevar el ciclo de vida de los equipos
de TI (notebooks, celulares, monitores, periféricos) y de los artículos de Kit
de Bienvenida y EPP, en todas las sedes de la empresa. Interfaz en español,
contexto chileno (RUT opcional).

La especificación completa, fuente de verdad del sistema, está en
[`SPEC_SISTEMA_INVENTARIO_IT.md`](SPEC_SISTEMA_INVENTARIO_IT.md).

## Qué hace

- **Activos**: alta, edición, historial completo de cada equipo y su estado
  (disponible, asignado, en mantención, en tránsito, por repartir, no devuelto,
  baja, vendido). Filtros combinables y exportación a Excel.
- **Solicitudes**: onboarding, cambio de equipo y desvinculación, que asignan y
  reciben los equipos y generan las actas en PDF.
- **Mantenciones**: programar, iniciar, completar (reparado, espera de
  repuestos o sin reparación) y dar de baja, con calendario y motivos de baja.
- **Despachos** entre sedes, **Compras** (facturas y reparto a las sedes) y
  **Kit/EPP** con stock por sede.
- **Dashboard** con indicadores y alertas; **Configuración** con usuarios,
  sedes, catálogos, seguridad, registro de accesos, auditoría e importación
  inicial desde Excel.

Hay dos roles: **admin** y **técnico**. Todos trabajan con todas las sedes: la
sede es un dato que dice dónde está cada cosa, no una restricción.

## Tecnología

Next.js 16 (App Router, React 19) · TypeScript · Tailwind CSS 4 · PostgreSQL
(Neon en producción) · Prisma 5 · NextAuth 4 · Zod 4 · `@react-pdf/renderer` ·
`exceljs` · Recharts · Jest · Vercel.

## Estructura

```
Inventario/
├── SPEC_SISTEMA_INVENTARIO_IT.md   # Especificación (manda sobre todo lo demás)
├── CLAUDE.md                       # Guía de implementación
└── app/                            # Proyecto Next.js (Root Directory en Vercel)
    ├── prisma/                     # Modelo, migraciones y seed
    └── src/
        ├── app/                    # Rutas: pantallas y API
        ├── modules/                # Un módulo por dominio (activos, solicitudes, ...)
        └── shared/                 # Lo común (base de datos, permisos, ui, ...)
```

Es un **monolito modular**: se publica como una sola aplicación, pero el código
está separado por dominio y cada módulo expone solo sus "puertas"
(`@/modules/x`, `@/modules/x/servidor`, `@/modules/x/componentes`). Las reglas
están en la sección 3.2 del SPEC y las hacen cumplir ESLint, los tests y el build.

## Levantarlo en local

Requisitos: Node.js 22 (la versión del CI), npm y Docker.

```bash
cd app
npm install
cp .env.example .env          # completar los valores (ver abajo)
docker compose up -d          # PostgreSQL en 127.0.0.1:5433
npm run db:migrate            # crea las tablas
npm run db:seed               # primer admin, categorías y sede inicial
npm run dev                   # http://localhost:3000
```

Variables de `app/.env` (detalle en `app/.env.example`):

| Variable | Para qué |
|----------|----------|
| `DATABASE_URL` | Conexión a la base (en Neon, la del pooler) |
| `DATABASE_URL_UNPOOLED` | Conexión directa, la usan las migraciones |
| `POSTGRES_PASSWORD` | Clave de la base local de Docker |
| `NEXTAUTH_URL` | URL de la app (`http://localhost:3000` en local) |
| `NEXTAUTH_SECRET` | Secreto de sesiones, 32+ caracteres (`openssl rand -base64 32`) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Primer administrador; la clave con 12+ caracteres, mayúscula, minúscula, número y símbolo |

En local usa `127.0.0.1` y no `localhost` en las URL de la base: en Windows,
`localhost` prueba primero IPv6 y cada conexión tarda unos 2 segundos.

## Comandos (dentro de `app/`)

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilar y correr en modo producción |
| `npm run typecheck` · `npm run lint` · `npm run format` | Tipos, reglas (incluidos los límites entre módulos) y formato |
| `npm test` · `npm run test:coverage` | Tests unitarios (con cobertura) |
| `npm run db:test:migrate` · `npm run test:integracion` | Preparar la base de pruebas `inventario_it_test` y correr los tests contra ella |
| `npm run db:migrate` | Crear una migración (única vía para cambiar el modelo) |
| `npm run db:status` | Ver si la base está al día |
| `npm run db:seed` · `npm run db:studio` | Datos iniciales · explorador de la base |

`npm run db:push` está deshabilitado a propósito: todo cambio del modelo pasa por
una migración versionada, junto con el SPEC.

## Publicar (Vercel)

1. Proyecto en Vercel con **Root Directory = `app`**. El build ejecuta
   `prisma generate` antes de `next build`.
2. Configurar las variables de entorno de la tabla anterior en Vercel (sin
   `POSTGRES_PASSWORD`), con `NEXTAUTH_URL` apuntando al dominio público.
3. Aplicar las migraciones pendientes en la base de producción:
   `npm run db:migrate:prod` (con las URL de Neon de producción).
4. La primera vez, crear el administrador con `npm run db:seed`.

El CI de GitHub (`.github/workflows/ci.yml`) revisa en cada cambio: auditoría de
dependencias, tipos, lint, tests con cobertura y build.
