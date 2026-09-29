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
npm run db:seed          # Primer admin (SEED_ADMIN_*) + categorias
npm run db:studio        # Prisma Studio GUI
npm run test:integracion # Tests contra la base de pruebas inventario_it_test
npm run db:test:migrate  # Migraciones en la base de pruebas
```

## Architecture

**Source root:** `app/src/` with path alias `@/*` → `./src/*`

### Rutas

`app/src/app/` con route groups `(auth)` (publico) y `(dashboard)` (autenticado),
mas `api/` con los endpoints REST agrupados por feature.

### Monolito modular

El codigo se organiza por dominio de negocio, no por tipo tecnico:

- `src/modules/<modulo>/`: activos, personas, asignaciones, mantenciones,
  despachos, compras, kit-epp, solicitudes, importacion, configuracion y
  dashboard. Cada uno tiene su logica (`servicio.ts`, `consultas.ts`,
  `validaciones.ts`...) y sus `componentes/`.
- `src/shared/`: lo transversal (prisma, auth y permisos, sedes, auditoria,
  utilidades, validaciones comunes, hooks y `ui/`).
- `src/app/`: solo las rutas de Next.js (pantallas y API).

**Puertas (SPEC 2.118, etapa 4).** Desde fuera de un modulo se importa solo por:
`@/modules/x` (reglas, validaciones y tipos, sin base de datos: sirve en
pantallas), `@/modules/x/servidor` (servicios y consultas con base de datos) y
`@/modules/x/componentes`; los PDF por `@/modules/solicitudes/documentos`.
Dentro del modulo, import libre. `shared/` no importa modulos. Lo exige ESLint
(`eslint.config.mjs`), y `import "server-only"` en `shared/prisma.ts` hace
fallar el build si una pantalla trae codigo de base de datos. Al exponer algo
nuevo, agregarlo a la puerta que corresponde.

### Key Modules

| Path | Purpose |
|------|---------|
| `src/shared/auth/opciones.ts` | NextAuth config: Credentials provider, JWT sessions (duración de Configuración > Seguridad), revisa la cuenta en cada consulta (una desactivada queda fuera), lista negra de sesiones cerradas y "sesiones válidas desde" al desactivar (SPEC 2.112.5), bloqueo por intentos contado en el registro de accesos (SPEC 2.112) |
| `src/shared/auth/accesos.ts` | Registro de accesos (ingresos, intentos fallidos, cierres de sesion) y bloqueo por intentos (SPEC 2.112) |
| `src/shared/errores.ts` | Errores que lanzan los servicios (`NotFoundError`, `ConflictError`, `ValidationError`, `errorDeCampo`...); `handleApiError` los traduce a la respuesta |
| `src/shared/prisma.ts` | Prisma singleton (prevents connection pool exhaustion); lleva `import "server-only"` |
| `src/modules/activos/servicio.ts` | `cambiarEstado()` (unico camino para cambiar el estado de un equipo), crear, editar, eliminar y descartar equipos |
| `src/shared/sedes/filtro.ts` | La sede es un dato, no un candado (SPEC 2.117): todos trabajan con todas las sedes. `filtroSede` (filtro del navbar) y `sedeIdParaCrear`. No agregar reglas de acceso por sede: lo que es solo de admin lo decide la matriz de permisos |
| `src/modules/activos/historial.ts` | Audit trail — logs all asset events with old/new values |
| `src/modules/solicitudes/ejecucion.ts` | Ejecuta acciones de workflow: asignaciones, desvinculaciones, guias al hacer transiciones |
| `src/modules/solicitudes/maquinaEstados.ts` | Define estados válidos y transiciones permitidas por tipo de solicitud |
| `src/modules/solicitudes/crear.ts` y `transicion.ts` | Crear una solicitud (nace cerrada, SPEC 2.82) y avanzar las que quedaron abiertas |
| `src/modules/solicitudes/documentos.ts` | Genera los PDF (actas, comprobantes); se importa por su propia puerta, `@/modules/solicitudes/documentos` |
| `src/modules/activos/maquinaEstados.ts` | Máquina de estados de activos — valida transiciones, precondiciones, estados terminales |
| `src/modules/activos/validacionesTransicion.ts` | Zod schemas para transiciones de activos: baja, venta, mantención, reasignación |
| `src/modules/<modulo>/validaciones.ts` | Zod schemas de cada entidad; las comunes en `src/shared/validaciones/` |
| `src/shared/utilidades/rut.ts` | Chilean RUT format validation |
| `src/proxy.ts` | Proxy de Next.js 16 (antes `middleware.ts`): exige sesión en todas las rutas salvo `/login` y `/api/auth` |
| `prisma/schema.prisma` | 32 modelos y 24 enums (estados de activos, condiciones, contratos, workflow, accesos...) |

### API Route Pattern

Las rutas solo orquestan (SPEC 3.2.2):
1. `requirePermission(recurso, accion)` → 401/403
2. Validar la peticion con el schema Zod del modulo → 400 (`respuestaDatosInvalidos`)
3. Llamar al servicio del modulo (`@/modules/x/servidor`) con datos validados y el usuario
4. Responder con `NextResponse.json()`; los errores los traduce `handleApiError`

La logica de negocio, las transacciones, el historial y la auditoria van en el
servicio, que avisa con los errores de `@/shared/errores` (`NotFoundError`,
`ConflictError`, `ValidationError`, `errorDeCampo`...). Una ruta solo de lectura
puede consultar Prisma directo.

### Modelos y enums

Los 32 modelos y los 24 enums viven en `app/prisma/schema.prisma`, y el SPEC
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

- **Imports:** Always use `@/` path alias (e.g., `@/shared/prisma`, `@/shared/ui/Button`)
- **Validation:** All API input must be validated with Zod schemas (`validaciones.ts` de cada modulo, o `src/shared/validaciones/`)
- **Audit trail:** Any asset mutation must call `assetHistoryService.registrar()` (`src/modules/activos/historial.ts`) with appropriate event type
- **Session checks:** toda ruta de la API abre con `requirePermission` (ver "Autorizacion")
- **Formatting:** Prettier with semicolons, single quotes, 100 char width, es5 trailing commas
- **UI language:** All user-facing text is in Spanish
- **RUT handling:** RUT is optional (`String?`): when unknown it is left blank. Always use null-safe access (`employee.rut || "—"`) and optional chaining (`employee.rut?.toLowerCase()`)
- **Sin sincronización con Microsoft:** se eliminó (SPEC 2.112). Las personas se crean solo en Onboarding.
- **Solo Activos escribe sus tablas (SPEC 2.118):** fuera de `src/modules/activos` nadie escribe en `asset` ni `assetHistory` (lo verifica `__tests__/lib/arquitectura/escriturasActivos.test.ts`). Para cambiar el estado se usa `cambiarEstado()` de `src/modules/activos/servicio.ts`, que valida, protege ante cambios simultáneos y anota el historial.
- **Transiciones de estado de activos:** Toda transición de estado de un activo pasa por `cambiarEstado()` (que usa `validateTransition()` de `src/modules/activos/maquinaEstados.ts`), dentro de su proceso: solicitudes (asignar, devolver, cambiar), mantenciones (la baja pasa siempre por una mantención "No reparable": `/api/mantenciones/baja` o al completar una, SPEC 2.88) y `/api/activos/[id]/venta`. El PUT de `/api/activos/[id]` no cambia el estado: lo rechaza con 409 (SPEC 2.86)
- **Workflow/Solicitudes:** El sistema de solicitudes orquesta flujos completos (onboarding, cambio equipo, devolución por término). `modules/solicitudes/maquinaEstados.ts` valida transiciones; `modules/solicitudes/ejecucion.ts` ejecuta las acciones reales (crea asignaciones, desvinculaciones, guías). Las transiciones quedan en `WorkflowTransition` para auditoría
- **Estilos y tema:** seguir `app/docs/DESIGN_SYSTEM.md`. Nunca colores fijos para superficies o texto (`bg-white`, `text-gray-900`, hex): usar los tokens (`bg-surface`, `text-fg`, `border-line`...) para que funcione el modo oscuro. Tarjetas destacadas con `card-feature` y color derivado de un dato real (`shared/constantes/tonos.ts`); `<Tilt>` solo en pocas tarjetas, nunca en listas grandes
- **Component structure:** los componentes de cada dominio en `src/modules/<modulo>/componentes/`; las piezas reutilizables en `src/shared/ui/`

## Environment Variables

Ver `app/.env.example`. Conexion Neon (`DATABASE_URL` pooled y
`DATABASE_URL_UNPOOLED` directa, requerida por las migraciones), NextAuth
(`NEXTAUTH_URL`, `NEXTAUTH_SECRET` de 32+ caracteres) y el primer admin del seed
(`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`). En local, la base de
`docker-compose.yml` escucha en `127.0.0.1:5433` (no `localhost`).

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

- **La matriz manda.** `src/shared/auth/permisos.ts` es el unico punto de verdad
  (SPEC 1.3.1). No verifiques roles a mano dentro de una ruta: si el permiso
  que necesitas no existe, se cambia la matriz y el SPEC, no la ruta.
- **La UI usa la misma matriz** via `usePermissions()` y `<Can recurso=... accion=...>`.
  Asi un boton visible nunca lleva a un 403.
- **Las transiciones de workflow no pasan por la matriz.** Las autoriza
  `canTransition` (`src/modules/solicitudes/maquinaEstados.ts`), que ya conoce el rol de cada
  transicion. La ruta de transicion solo exige `solicitudes/write`.
- **Formato de error unificado:** `{ error: string, details?: unknown }`.
  `handleApiError` traduce ApiError, ZodError y los codigos de Prisma
  (P2002/P2003/P2025), y acepta un segundo argumento con el mensaje generico de
  la ruta. En el cliente, leer siempre `err.error` primero.
  *(Esto cerro el bug de "Error al actualizar activo": el servidor mandaba
  `error` y el cliente leia `details`/`message`.)*

## Borrado de activos

Un activo con historial o asignaciones **no se borra** (SPEC 2.7.7): su
registro es evidencia de auditoria. `DELETE /api/activos/[id]` responde 409 y
apunta a darlo de baja por Mantenciones (`/api/mantenciones/baja`). Para duplicados de importacion existe
`DELETE /api/activos/[id]?descartar=true&motivo=...`, que marca `deletedAt` y
deja el evento en el historial. Los listados y reportes filtran con
`ACTIVOS_VIGENTES` de `src/modules/activos/consultas.ts`.
