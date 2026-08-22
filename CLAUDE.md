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
npm run db:migrate       # Prisma dev migration (unica via para cambiar el schema)
npm run db:migrate:prod  # prisma migrate deploy (produccion)
npm run db:status        # prisma migrate status - verificar deriva
npm run db:push          # DESHABILITADO a proposito (ver "Migraciones")
npm run db:seed          # Seed default users + categories
npm run db:studio        # Prisma Studio GUI
```

## Architecture

**Stack:** Next.js 16 (App Router, React 19) / TypeScript / Prisma 5 / PostgreSQL (Neon) / NextAuth 4 / Tailwind CSS 4 / TanStack React Query / Zod 4

**Source root:** `app/src/` with path alias `@/*` → `./src/*`

### Route Groups

- `(auth)/login` — Login page (public)
- `(dashboard)/` — All authenticated pages:
  - `activos/` — listado, `[id]/`, `[id]/editar/`, `nuevo/`, `importar/`
  - `asignaciones/` — listado, `[id]/`, `devolucion/`
  - `compras/` — listado, `nueva/`, `[id]/`
  - `empleados/` — listado, `[id]/`, `[id]/editar/`, `nuevo/`, `importar/`
  - `guias-despacho/` — listado, `[id]/`, `nueva/`
  - `mantenciones/` — listado, `[id]/`, `calendario/`, `programar/`
  - `desvinculaciones/` — listado, `[id]/`, `nueva/`
  - `solicitudes/` — listado, `[id]/`, `nueva/` *(workflow de onboarding/cambio/devolución)*
  - `reportes/` — index, `rrhh/`, `stock/`, `inventario/`, `obsoletos/`, `trazabilidad/`, `empleados/`
  - `configuracion/` — index, `categorias/`, `proveedores/`, `usuarios/`, `parametros/`, `mantenimiento/`, `microsoft-sync/`
- `api/` — 61+ REST endpoints organizados por feature

### Key Modules

| Path | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth config: Credentials provider, JWT sessions (24h), rate limiting (5 attempts/15min) |
| `src/lib/prisma.ts` | Prisma singleton (prevents connection pool exhaustion) |
| `src/lib/services/assetHistoryService.ts` | Audit trail — logs all asset events with old/new values |
| `src/lib/services/microsoftGraphService.ts` | Microsoft Entra ID (Azure AD) sync — fetches users via Graph API (read-only) |
| `src/lib/services/workflowExecutionService.ts` | Ejecuta acciones de workflow: asignaciones, desvinculaciones, guias al hacer transiciones |
| `src/lib/services/workflowStateMachine.ts` | Define estados válidos y transiciones permitidas por tipo de solicitud |
| `src/lib/services/documentGeneratorService.ts` | Genera documentos (actas, reportes) asociados a solicitudes de workflow |
| `src/lib/services/assetStateMachine.ts` | Máquina de estados de activos — valida transiciones, precondiciones, estados terminales |
| `src/lib/validations/assetTransition.ts` | Zod schemas para transiciones de activos: baja, venta, mantención, reasignación |
| `src/lib/validations/` | Zod schemas for all entities (asset, employee, assignment, workflow, etc.) |
| `src/lib/utils/rut.ts` | Chilean RUT format validation |
| `src/middleware.ts` | Auth enforcement: protects all routes except `/login`, `/api/auth` |
| `prisma/schema.prisma` | 19 models with enums for asset states, conditions, contract types, workflow |

### API Route Pattern

Every API route follows this sequence:
1. `getServerSession(authOptions)` → 401 if unauthenticated
2. Validate input with Zod schema → 400 on failure
3. Prisma operations
4. Log to `assetHistoryService` for audit trail (on mutations)
5. Return `NextResponse.json()`

### Database Models (19 total)

**Core:**
- `SystemUser` — usuarios del sistema con roles
- `Employee` — empleados (con soporte Microsoft Entra ID sync)
- `AssetCategory` — categorías de activos
- `Asset` — activos IT
- `Supplier` — proveedores
- `Purchase` / `PurchaseAsset` — facturas y detalle de compra
- `Assignment` — asignaciones activo-empleado
- `WelcomeKitItem` / `KitAssignment` — kit de bienvenida y EPP
- `Maintenance` — mantenciones
- `AssetHistory` — historial/auditoría de activos
- `Termination` — desvinculaciones
- `DispatchGuide` / `DispatchGuideItem` — guías de despacho

**Workflow (solicitudes):**
- `WorkflowRequest` — solicitud de onboarding, cambio de equipo o devolución por término
- `WorkflowComment` — comentarios en solicitudes
- `WorkflowTransition` — registro de cada cambio de estado
- `WorkflowPendiente` — items pendientes de entregar dentro de una solicitud

### Database Key Enums

**Activos:**
- **EstadoActivo:** `disponible`, `asignado`, `en_mantencion`, `reutilizable`, `baja`, `vendido`
- **CondicionActivo:** `nuevo`, `usado`, `danado`

**Empleados:**
- **TipoContrato:** `planta`, `proyecto`, `externo`
- **EstadoEmpleado:** `activo`, `desvinculado`, `licencia`

**Compras:**
- **TipoCompra:** `FACTURA`, `GASTO_MENOR`
- **MetodoPago:** `EFECTIVO`, `TRANSFERENCIA`, `TARJETA_CREDITO`, `CAJA_CHICA`, `REEMBOLSO_PENDIENTE`
- **Moneda:** `CLP`, `USD`

**Asignaciones:**
- **TipoMovimiento:** `ingreso`, `cambio`, `reemplazo`, `temporal`
- **EstadoDevolucion:** `ok`, `danado`, `incompleto`

**Guías de despacho:**
- **TipoDespacho:** `asignacion`, `traslado`, `prestamo`
- **EstadoGuia:** `pendiente`, `despachado`, `recibido`, `anulado`

**Mantenciones:**
- **TipoMantencion:** `preventiva`, `correctiva`, `actualizacion_so`, `limpieza`, `reparacion`
- **EstadoMantencion:** `pendiente`, `en_proceso`, `completada`, `cancelada`

**Historial:**
- **TipoEvento:** `creacion`, `asignacion`, `devolucion`, `mantencion`, `cambio_estado`, `actualizacion_specs`, `baja`, `venta`, `solicitud_workflow`

**Workflow / Solicitudes:**
- **TipoSolicitud:** `onboarding`, `cambio_equipo`, `devolucion_termino`
- **EstadoSolicitud:** onboarding→`solicitud_recibida`→`gestion_ti`→`equipos_entregados`→`registro_rrhh`; cambio→`incidencia_detectada`→`cambio_ejecutado`→`confirmacion_rrhh`; devolución→`solicitud_emitida`→`coordinacion_en_curso`→`equipo_recibido`→`consolidacion_cierre`
- **PrioridadSolicitud:** `baja`, `media`, `alta`, `urgente`
- **TipoPendiente:** `celular`, `audifonos`, `mochila`, `cargador`, `epp_zapatos`, `epp_chaleco`, `epp_casco`, `epp_lentes`, `kit_bienvenida`, `otro`
- **EstadoPendiente:** `pendiente`, `gestionando`, `entregado`, `no_aplica`

**Roles:**
- **SystemRole:** `admin`, `tecnico`, `supervisor`, `rrhh`, `auditor`

### Database Connections

Uses both pooled (`DATABASE_URL`) and unpooled (`DATABASE_URL_UNPOOLED`) Neon connections. The `directUrl` in schema.prisma is required for migrations on Neon.

### Migraciones

**Toda modificacion del schema pasa por una migracion versionada. `db:push` esta deshabilitado.**

Hasta la Ola 0 solo existia `20251211_init` (tabla `system_users`); los otros 18 modelos se
habian creado con `prisma db push`, sin dejar rastro. `20260821000000_baseline` captura ese
estado y esta marcada como aplicada en Neon con `prisma migrate resolve --applied`. El
baseline omite a proposito el enum `SystemRole`, la tabla `system_users` y su indice unico,
porque `20251211_init` ya los crea: asi `prisma migrate deploy` reproduce el schema completo
desde cero sin colisiones.

Flujo para cambiar el schema:

1. Editar `prisma/schema.prisma` **y** `SPEC_SISTEMA_INVENTARIO_IT.md` en el mismo commit.
2. `npm run db:migrate` -- genera la migracion con nombre descriptivo.
3. `npm run db:status` -- debe reportar la base al dia, sin deriva.
4. Commitear el directorio de `prisma/migrations/` junto al cambio.

En produccion (Vercel) se aplica con `npm run db:migrate:prod`.

## Conventions

- **Imports:** Always use `@/` path alias (e.g., `@/lib/prisma`, `@/components/ui/Button`)
- **Validation:** All API input must be validated with Zod schemas from `src/lib/validations/`
- **Audit trail:** Any asset mutation must call `assetHistoryService.registrar()` with appropriate event type
- **Session checks:** All non-auth API routes must verify session via `getServerSession(authOptions)`
- **Formatting:** Prettier with semicolons, single quotes, 100 char width, es5 trailing commas
- **UI language:** All user-facing text is in Spanish
- **RUT handling:** RUT is optional (`String?`). Employees synced from Microsoft may not have RUT. Always use null-safe access (`employee.rut || "—"`) and optional chaining (`employee.rut?.toLowerCase()`)
- **Microsoft Sync:** Read-only integration with Microsoft Entra ID via Graph API. Sync is manual (admin-only button). Employees matched by `correo` on first sync, by `microsoftId` on subsequent syncs. Never writes to Entra ID
- **Transiciones de estado de activos:** Toda transición de estado de un activo debe pasar por `assetStateMachine.validateTransition()`. El PUT de `/api/activos/[id]` ya lo valida. Los procesos de baja, venta y reasignación tienen API routes dedicadas: `/api/activos/[id]/baja`, `/api/activos/[id]/venta`, `/api/activos/[id]/reasignar`
- **Workflow/Solicitudes:** El sistema de solicitudes orquesta flujos completos (onboarding, cambio equipo, devolución por término). `workflowStateMachine` valida transiciones; `workflowExecutionService` ejecuta las acciones reales (crea asignaciones, desvinculaciones, guías). Las transiciones quedan en `WorkflowTransition` para auditoría
- **Component structure:** Feature components in named dirs (`components/activos/`, `components/dashboard/`), reusable primitives in `components/ui/`

## Environment Variables

Required in `.env` (see `.env.example`):
```
DATABASE_URL=postgresql://...         # Neon pooled connection
DATABASE_URL_UNPOOLED=postgresql://... # Neon direct connection (for migrations)
NEXTAUTH_SECRET=<base64-secret>
NEXTAUTH_URL=http://localhost:3000

# Microsoft Entra ID (Azure AD) - Employee Sync
MICROSOFT_TENANT_ID=<azure-tenant-id>
MICROSOFT_CLIENT_ID=<azure-app-client-id>
MICROSOFT_CLIENT_SECRET=<azure-app-client-secret>
```

## Deployment

Vercel. Build script runs `prisma generate` before `next build`. Root Directory is set to `app` in Vercel project settings. Environment variables must be configured in the Vercel dashboard.

## Proceso SDD (Spec Driven Design)

### Regla de oro

Antes de implementar cualquier cambio que modifique el modelo de datos, agregue una API route, o cambie reglas de negocio: **el SPEC debe actualizarse primero, o simultáneamente en el mismo commit. Nunca después.**

El archivo `SPEC_SISTEMA_INVENTARIO_IT.md` es la fuente de verdad del sistema. El CLAUDE.md es la guía de implementación. Cuando hay contradicción, el SPEC manda.

### Versionado del SPEC

El SPEC mantiene un `## Changelog SPEC` al final. Cada actualización significativa agrega una entrada:

```
- v1.x (YYYY-MM-DD): descripción concisa del cambio
```

La versión actual es **v1.1 (2026-04-07)**.

### Checklist antes de implementar un cambio de modelo

```
□ ¿Está el nuevo campo/modelo documentado en SPEC con tipo, restricciones y propósito?
□ ¿Si el campo cambia una restricción existente (ej: NOT NULL → nullable), está la razón documentada?
□ ¿Si hay reglas de negocio asociadas, están en la sección correspondiente del SPEC?
□ ¿Si el cambio afecta al sistema de solicitudes (Workflow), está la sección 2.5 del SPEC actualizada?
□ ¿Se actualizó el Changelog del SPEC con la versión y fecha?
```

### Checklist antes de hacer merge de un cambio a API

```
□ ¿Existe al menos un test que valide el comportamiento de negocio (no solo el tipo Zod)?
□ ¿El test cubre el caso feliz y al menos un caso de error de negocio?
□ ¿Las reglas de negocio del test coinciden con lo documentado en SPEC?
□ ¿`npm run test` pasa sin fallos?
```

### Dónde van los tests de comportamiento

- **Validaciones Zod:** `app/src/__tests__/lib/validations/` — ya existen para asset, employee, assignment, maintenance, rut, workflow
- **Lógica de servicios puros:** `app/src/__tests__/lib/services/` — para funciones sin Prisma (ej: `workflowStateMachine.ts`)
- **API routes:** Excluidas de cobertura por decisión (ver `jest.config.ts`)

---

## Bugs Pendientes

### Bug: "Error al actualizar activo" al editar activos (detectado en Audifonos)
- **Archivos afectados:**
  - `src/app/(dashboard)/activos/[id]/editar/page.tsx` (linea 164) — cliente lee `error.details` y `error.message` pero servidor envia key `error`
  - `src/app/api/activos/[id]/route.ts` — respuestas 401/404 usan key `error`, 400/500 usan `message`/`details` (formato inconsistente)
- **Causa raiz:** El cliente no extrae correctamente el error del servidor. Para 401/404 ambas keys `details` y `message` son undefined, cae al fallback generico y no muestra el error real.
- **Fix necesario:** Unificar formato de respuestas de error en el API y mejorar extraccion en el cliente (`error.error || error.details || error.message || fallback`)
