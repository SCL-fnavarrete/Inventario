# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IT Asset Inventory Management System (Sistema de Control de Inventario IT) for SCL Consultores. Full-stack Next.js application for tracking equipment (laptops, phones, monitors), employee assignments, maintenance, purchases, and dispatch guides. Chilean business context (RUT validation, Spanish UI).

## Commands

All commands run from the `app/` directory:

```bash
cd app
# los scripts estandar (dev, build, lint, format, typecheck, test) estan en app/package.json
npm run db:migrate       # Prisma dev migration (unica via para cambiar el schema)
npm run db:migrate:prod  # prisma migrate deploy (produccion)
npm run db:status        # prisma migrate status - verificar deriva
npm run db:push          # DESHABILITADO a proposito (ver "Migraciones")
npm run db:seed          # Seed default users + categories
npm run db:studio        # Prisma Studio GUI
```

## Architecture

**Source root:** `app/src/` with path alias `@/*` → `./src/*`

### Rutas

`app/src/app/` con route groups `(auth)` (publico) y `(dashboard)` (autenticado),
mas `api/` con los endpoints REST agrupados por feature.

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

### Modelos y enums

Los 19 modelos y los 23 enums viven en `app/prisma/schema.prisma`, y el SPEC
documenta el proposito de cada uno. No se duplican aqui: la copia se desactualiza.

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

Ver `.env.example`: conexion Neon (`DATABASE_URL` pooled y `DATABASE_URL_UNPOOLED`
directa, requerida por las migraciones), NextAuth y credenciales de Microsoft Entra ID.

## Deployment

Vercel. Build script runs `prisma generate` before `next build`. Root Directory is set to `app` in Vercel project settings. Environment variables must be configured in the Vercel dashboard.

## Proceso SDD (Spec Driven Design)

### Regla de oro

Antes de implementar cualquier cambio que modifique el modelo de datos, agregue una API route, o cambie reglas de negocio: **el SPEC debe actualizarse primero, o simultáneamente en el mismo commit. Nunca después.**

El archivo `SPEC_SISTEMA_INVENTARIO_IT.md` es la fuente de verdad del sistema. El CLAUDE.md es la guía de implementación. Cuando hay contradicción, el SPEC manda.

Los checklists (cambio de modelo, merge de API), el versionado del SPEC y la
ubicacion de los tests estan en la skill `sdd-workflow`
(`.claude/skills/sdd-workflow/SKILL.md`), que se carga al invocarla.

---

## Autorizacion (Ola 1)

**Toda ruta de `src/app/api/**` abre con `requirePermission` y cierra con
`handleApiError`.** No hay excepciones salvo `api/auth/[...nextauth]`, que es
publica. Un test de auditoria (`src/__tests__/lib/auth/rutas-protegidas.test.ts`)
lo verifica en cada corrida: si agregas una ruta y te olvidas, el CI falla.

```ts
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('activos', 'write');
    // ...
  } catch (error) {
    return handleApiError(error, 'Error al crear activo');
  }
}
```

- **La matriz manda.** `src/lib/auth/permissions.ts` es el unico punto de verdad
  (SPEC 1.3.1). No verifiques roles a mano dentro de una ruta: si el permiso
  que necesitas no existe, se cambia la matriz y el SPEC, no la ruta.
- **La UI usa la misma matriz** via `usePermissions()` y `<Can recurso=... accion=...>`.
  Asi un boton visible nunca lleva a un 403.
- **Las transiciones de workflow no pasan por la matriz.** Las autoriza
  `workflowStateMachine.canTransition`, que ya conoce el rol de cada
  transicion. La ruta de transicion solo exige `solicitudes/read`.
- **Formato de error unificado:** `{ error: string, details?: unknown }`.
  `handleApiError` traduce ApiError, ZodError y los codigos de Prisma
  (P2002/P2003/P2025), y acepta un segundo argumento con el mensaje generico de
  la ruta. En el cliente, leer siempre `err.error` primero.
  *(Esto cerro el bug de "Error al actualizar activo": el servidor mandaba
  `error` y el cliente leia `details`/`message`.)*

## Borrado de activos

Un activo con historial o asignaciones **no se borra** (SPEC 2.7.7): su
registro es evidencia de auditoria. `DELETE /api/activos/[id]` responde 409 y
apunta a `/baja`. Para duplicados de importacion existe
`DELETE /api/activos/[id]?descartar=true&motivo=...`, que marca `deletedAt` y
deja el evento en el historial. Los listados y reportes filtran con
`ACTIVOS_VIGENTES` de `src/lib/queries/activos.ts`.
