# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IT Asset Inventory Management System (Sistema de Control de Inventario IT) for SCL Consultores. Full-stack Next.js application for tracking equipment (laptops, phones, monitors), employee assignments, maintenance, purchases, and dispatch guides. Chilean business context (RUT validation, Spanish UI).

## Commands

All commands run from the `app/` directory:

```bash
cd app
npm run dev              # Dev server on localhost:3000
npm run build            # prisma generate && next build
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier format
npm run format:check     # Prettier check
npm run typecheck        # TypeScript type checking
npm run test             # Jest tests
npm run test:watch       # Jest in watch mode
npm run test:coverage    # Jest with coverage (70% threshold)
npm run db:migrate       # Prisma dev migration
npm run db:push          # Push schema to DB
npm run db:seed          # Seed default users + categories
npm run db:studio        # Prisma Studio GUI
```

## Architecture

**Stack:** Next.js 16 (App Router, React 19) / TypeScript / Prisma 5 / PostgreSQL (Neon) / NextAuth 4 / Tailwind CSS 4 / TanStack React Query / Zod 4

**Source root:** `app/src/` with path alias `@/*` → `./src/*`

### Route Groups

- `(auth)/login` — Login page (public)
- `(dashboard)/` — All authenticated pages (activos, asignaciones, compras, empleados, guias-despacho, mantenciones, desvinculaciones, reportes, configuracion)
- `api/` — ~52 REST endpoints organized by feature

### Key Modules

| Path | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth config: Credentials provider, JWT sessions (24h), rate limiting (5 attempts/15min) |
| `src/lib/prisma.ts` | Prisma singleton (prevents connection pool exhaustion) |
| `src/lib/services/assetHistoryService.ts` | Audit trail — logs all asset events with old/new values |
| `src/lib/validations/` | Zod schemas for all entities (asset, employee, assignment, etc.) |
| `src/lib/utils/rut.ts` | Chilean RUT format validation |
| `src/middleware.ts` | Auth enforcement: protects all routes except `/login`, `/api/auth` |
| `prisma/schema.prisma` | 13+ models with enums for asset states, conditions, contract types |

### API Route Pattern

Every API route follows this sequence:
1. `getServerSession(authOptions)` → 401 if unauthenticated
2. Validate input with Zod schema → 400 on failure
3. Prisma operations
4. Log to `assetHistoryService` for audit trail (on mutations)
5. Return `NextResponse.json()`

### Database Key Enums

- **EstadoActivo:** disponible, asignado, en_mantencion, reutilizable, baja, vendido
- **CondicionActivo:** nuevo, usado, danado
- **SystemRole:** admin, tecnico, supervisor, rrhh, auditor
- **TipoEvento:** 12 event types for full audit trail

### Database Connections

Uses both pooled (`DATABASE_URL`) and unpooled (`DATABASE_URL_UNPOOLED`) Neon connections. The `directUrl` in schema.prisma is required for migrations on Neon.

## Conventions

- **Imports:** Always use `@/` path alias (e.g., `@/lib/prisma`, `@/components/ui/Button`)
- **Validation:** All API input must be validated with Zod schemas from `src/lib/validations/`
- **Audit trail:** Any asset mutation must call `assetHistoryService.registrar()` with appropriate event type
- **Session checks:** All non-auth API routes must verify session via `getServerSession(authOptions)`
- **Formatting:** Prettier with semicolons, single quotes, 100 char width, es5 trailing commas
- **UI language:** All user-facing text is in Spanish
- **Component structure:** Feature components in named dirs (`components/activos/`, `components/dashboard/`), reusable primitives in `components/ui/`

## Environment Variables

Required in `.env` (see `.env.example`):
```
DATABASE_URL=postgresql://...         # Neon pooled connection
DATABASE_URL_UNPOOLED=postgresql://... # Neon direct connection (for migrations)
NEXTAUTH_SECRET=<base64-secret>
NEXTAUTH_URL=http://localhost:3000
```

## Deployment

Vercel. Build script runs `prisma generate` before `next build`. Environment variables must be configured in the Vercel dashboard.

## Bugs Pendientes

### Bug: "Error al actualizar activo" al editar activos (detectado en Audifonos)
- **Archivos afectados:**
  - `src/app/(dashboard)/activos/[id]/editar/page.tsx` (linea 164) — cliente lee `error.details` y `error.message` pero servidor envia key `error`
  - `src/app/api/activos/[id]/route.ts` — respuestas 401/404 usan key `error`, 400/500 usan `message`/`details` (formato inconsistente)
- **Causa raiz:** El cliente no extrae correctamente el error del servidor. Para 401/404 ambas keys `details` y `message` son undefined, cae al fallback generico y no muestra el error real.
- **Fix necesario:** Unificar formato de respuestas de error en el API y mejorar extraccion en el cliente (`error.error || error.details || error.message || fallback`)
