# Plan: Sincronizacion de Empleados con Microsoft Entra ID

## Resumen

Integrar el sistema de inventario IT con Microsoft Entra ID (Azure AD) via Graph API para sincronizar empleados de forma unidireccional (solo lectura desde Microsoft). La sincronizacion se ejecuta manualmente mediante un boton en Configuracion, disponible solo para usuarios con rol `admin`.

## Decisiones de Diseno

| Decision | Valor |
|----------|-------|
| Servicio | Microsoft Entra ID via Graph API (`graph.microsoft.com/v1.0/users`) |
| Direccion | Unidireccional: Microsoft -> Sistema (solo lectura) |
| Mecanismo | Boton manual en pagina de configuracion (solo admin) |
| RUT | Opcional para empleados sincronizados (campo `rut` pasa a ser `String?` en schema) |
| Eliminacion | Empleados desactivados en Microsoft se marcan como `desvinculado` automaticamente |
| Dependencias | Sin paquetes externos, usa `fetch` nativo de Node.js |
| Autenticacion Azure | OAuth2 Client Credentials flow (app-only, sin usuario interactivo) |

## Prerequisitos: App Registration en Azure Portal

Antes de ejecutar cualquier tarea de codigo, el administrador debe registrar una aplicacion en Azure:

### Paso a paso

1. Ir a [Azure Portal](https://portal.azure.com) > **Microsoft Entra ID** > **App registrations** > **New registration**
2. Nombre: `SCL Inventario IT Sync` (o cualquier nombre descriptivo)
3. Supported account types: **Single tenant** (solo esta organizacion)
4. Redirect URI: dejar vacio (no se necesita, es client credentials flow)
5. Click **Register**

### Obtener credenciales

6. En la pagina de la app registrada, copiar:
   - **Application (client) ID** -> sera `MICROSOFT_CLIENT_ID`
   - **Directory (tenant) ID** -> sera `MICROSOFT_TENANT_ID`
7. Ir a **Certificates & secrets** > **New client secret**
   - Descripcion: `inventario-sync`
   - Expiracion: 24 meses (o segun politica de la empresa)
   - Copiar el **Value** (solo visible una vez) -> sera `MICROSOFT_CLIENT_SECRET`

### Configurar permisos

8. Ir a **API permissions** > **Add a permission** > **Microsoft Graph** > **Application permissions**
9. Buscar y agregar:
   - `User.Read.All` — Leer perfiles de todos los usuarios
10. Click **Grant admin consent for [Organizacion]** (requiere Global Admin)

### Variables de entorno resultantes

```env
MICROSOFT_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Mapeo de Campos: Microsoft Graph -> Employee

| Microsoft Graph (`/users`) | Employee (Prisma) | Notas |
|---|---|---|
| `id` | `microsoftId` (nuevo) | UUID de Microsoft, clave de matching |
| `displayName` | Se parsea a `nombres` + `apellidoPaterno` + `apellidoMaterno` | Split por espacios: primer token = nombres, segundo = apellidoPaterno, resto = apellidoMaterno |
| `givenName` | `nombres` | Preferido sobre displayName si existe |
| `surname` | `apellidoPaterno` | Preferido sobre displayName si existe |
| `mail` o `userPrincipalName` | `correo` | `mail` tiene prioridad; fallback a `userPrincipalName` |
| `jobTitle` | `cargo` | Puede ser null |
| `officeLocation` | `ubicacion` | Puede ser null |
| `businessPhones[0]` o `mobilePhone` | `telefonoContacto` | Primer telefono disponible |
| `department` | `jefatura` | Mapeo directo |
| `manager.displayName` (via `$expand`) | `supervisor` | Requiere `$expand=manager` en la query |
| `accountEnabled` | Si `false` -> estado `desvinculado` | Solo si el empleado ya existe en el sistema |
| — | `tipoContrato` | Default: `externo` para empleados sincronizados |
| — | `rut` | `null` para empleados sincronizados |
| — | `origenMicrosoft` (nuevo) | `true` para empleados sincronizados |

### Algoritmo de parseo de nombre

```
Si givenName existe:
  nombres = givenName
  apellidoPaterno = surname || "(sin apellido)"
  apellidoMaterno = null
Sino si displayName existe:
  tokens = displayName.split(" ")
  si tokens.length == 1: nombres = tokens[0], apellidoPaterno = "(sin apellido)"
  si tokens.length == 2: nombres = tokens[0], apellidoPaterno = tokens[1]
  si tokens.length >= 3: nombres = tokens[0], apellidoPaterno = tokens[1], apellidoMaterno = tokens.slice(2).join(" ")
```

---

## Algoritmo de Sincronizacion

```
1. Obtener token OAuth2 (client credentials)
2. Fetch usuarios de Microsoft Graph (/v1.0/users con paginacion)
3. Para cada usuario de Microsoft:
   a. Buscar Employee con microsoftId == user.id
   b. Si existe:
      - Si user.accountEnabled == false Y employee.estado == "activo":
        -> Marcar employee.estado = "desvinculado"
        -> Si tiene activos asignados, incluir en reporte de alertas
      - Si user.accountEnabled == true:
        -> Actualizar campos mapeados (correo, cargo, ubicacion, etc.)
   c. Si no existe Y user.accountEnabled == true:
      - Buscar por correo (employee.correo == user.mail)
      - Si match por correo:
        -> Vincular: setear microsoftId, origenMicrosoft = true
        -> Actualizar campos mapeados
      - Si no hay match:
        -> Crear nuevo Employee con datos de Microsoft
        -> rut = null, tipoContrato = "externo", origenMicrosoft = true
4. Retornar resumen: { creados, actualizados, desactivados, errores, alertas[] }
```

---

## Tareas de Implementacion

---

### Tarea 1: Migracion de base de datos

**Objetivo:** Modificar el schema de Prisma para soportar empleados sincronizados desde Microsoft.

**Archivos a modificar:**
- `app/prisma/schema.prisma`

**Dependencias:** Ninguna (ejecutar primero)

**Instrucciones detalladas:**

1. En el modelo `Employee`, cambiar `rut` de required a opcional:
   ```prisma
   rut String? @unique  // Era: rut String @unique
   ```

2. Agregar nuevos campos al modelo `Employee`:
   ```prisma
   microsoftId      String?  @unique @map("microsoft_id")
   origenMicrosoft   Boolean  @default(false) @map("origen_microsoft")
   ```

3. Agregar indice para `microsoftId`:
   ```prisma
   @@index([microsoftId])
   ```

4. Generar y aplicar la migracion:
   ```bash
   cd app
   npx prisma migrate dev --name add_microsoft_sync_fields
   ```

**Estado actual del campo `rut` en schema (linea 27):**
```prisma
rut String @unique
```

**Criterios de verificacion:**
- [ ] `npx prisma validate` pasa sin errores
- [ ] Migracion SQL generada correctamente en `prisma/migrations/`
- [ ] Empleados existentes (con RUT) no son afectados
- [ ] `npx prisma generate` genera el client actualizado
- [ ] `npm run build` compila sin errores de tipo

---

### Tarea 2: Actualizar validaciones Zod y tipos

**Objetivo:** Hacer RUT opcional en los schemas de validacion y agregar campos Microsoft al tipo Employee.

**Archivos a modificar:**
- `app/src/lib/validations/employee.ts`
- `app/src/lib/validations/rut.ts` (verificar que rutOptionalSchema existe)

**Dependencias:** Tarea 1

**Instrucciones detalladas:**

1. En `employee.ts`, modificar `createEmployeeSchema`:
   - Cambiar `rut: rutSchema` a `rut: rutOptionalSchema` (ya importado en linea 2)
   - Agregar campo: `origenMicrosoft: z.boolean().default(false)`
   - Agregar campo: `microsoftId: z.string().optional().nullable()`

2. En `updateEmployeeSchema`:
   - Ya tiene `rut: rutSchema.optional()`, cambiar a `rut: rutOptionalSchema`

3. Agregar nuevo schema para sincronizacion Microsoft:
   ```typescript
   export const microsoftSyncEmployeeSchema = z.object({
     microsoftId: z.string().min(1),
     nombres: z.string().min(1).max(100),
     apellidoPaterno: z.string().min(1).max(100),
     apellidoMaterno: z.string().max(100).optional().nullable(),
     correo: z.string().email().max(150),
     cargo: z.string().max(100).optional().nullable(),
     jefatura: z.string().max(100).optional().nullable(),
     supervisor: z.string().max(100).optional().nullable(),
     ubicacion: z.string().max(100).optional().nullable(),
     telefonoContacto: z.string().max(20).optional().nullable(),
   });
   ```

4. Exportar tipo: `export type MicrosoftSyncEmployeeInput = z.infer<typeof microsoftSyncEmployeeSchema>;`

**Estado actual de createEmployeeSchema (linea 9-10):**
```typescript
export const createEmployeeSchema = z.object({
  rut: rutSchema,  // <-- cambiar a rutOptionalSchema
```

**Criterios de verificacion:**
- [ ] `npm run typecheck` pasa sin errores
- [ ] Se puede crear un empleado sin RUT via el nuevo schema
- [ ] Empleados existentes con RUT siguen validando correctamente
- [ ] `npm run build` compila sin errores

---

### Tarea 3: Servicio de Microsoft Graph

**Objetivo:** Crear el servicio que se comunica con Microsoft Graph API para obtener y transformar datos de usuarios.

**Archivos a crear:**
- `app/src/lib/services/microsoftGraphService.ts`

**Archivos a modificar:**
- `app/.env.example` (agregar variables Microsoft)

**Dependencias:** Tarea 1 (schema con microsoftId)

**Instrucciones detalladas:**

1. Crear `microsoftGraphService.ts` con las siguientes funciones:

   **`getAccessToken()`** — Obtener token OAuth2:
   ```
   POST https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token
   Body (x-www-form-urlencoded):
     client_id={CLIENT_ID}
     client_secret={CLIENT_SECRET}
     scope=https://graph.microsoft.com/.default
     grant_type=client_credentials
   ```
   - Usar `fetch` nativo
   - Parsear response JSON, extraer `access_token`
   - Lanzar error descriptivo si falla

   **`fetchAllUsers(accessToken)`** — Obtener todos los usuarios con paginacion:
   ```
   GET https://graph.microsoft.com/v1.0/users
   Headers: Authorization: Bearer {token}
   Query params:
     $select=id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,officeLocation,businessPhones,mobilePhone,department,accountEnabled
     $expand=manager($select=displayName)
     $top=100
     $filter=userType eq 'Member'
   ```
   - Seguir `@odata.nextLink` para paginacion (loop hasta que no haya mas paginas)
   - Retornar array completo de usuarios
   - Filtrar cuentas de servicio: excluir usuarios sin `mail` ni `userPrincipalName`, o cuyo `userPrincipalName` contenga `#EXT#`

   **`transformUser(graphUser)`** — Transformar usuario de Graph al formato Employee:
   - Aplicar algoritmo de parseo de nombre (ver seccion Mapeo)
   - `correo`: `mail || userPrincipalName`
   - `cargo`: `jobTitle || null`
   - `ubicacion`: `officeLocation || null`
   - `telefonoContacto`: `businessPhones?.[0] || mobilePhone || null`
   - `jefatura`: `department || null`
   - `supervisor`: `manager?.displayName || null`
   - Retornar objeto tipado compatible con `microsoftSyncEmployeeSchema`

   **`checkConfiguration()`** — Verificar que las 3 variables de entorno existen:
   - Retornar `{ configured: boolean, missing: string[] }`

2. Agregar a `app/.env.example`:
   ```env
   # Microsoft Entra ID (Azure AD) - Sincronizacion de empleados
   # Ver PLAN_MICROSOFT_SYNC.md para instrucciones de configuracion
   MICROSOFT_TENANT_ID=""
   MICROSOFT_CLIENT_ID=""
   MICROSOFT_CLIENT_SECRET=""
   ```

**Criterios de verificacion:**
- [ ] `npm run typecheck` pasa sin errores
- [ ] `checkConfiguration()` retorna `configured: false` cuando faltan variables
- [ ] Funcion `transformUser` maneja correctamente usuarios con datos parciales (sin givenName, sin mail, etc.)
- [ ] Paginacion maneja correctamente `@odata.nextLink`
- [ ] No se importan paquetes externos (solo `fetch` nativo)

---

### Tarea 4: API endpoint de sincronizacion

**Objetivo:** Crear el endpoint REST que ejecuta la sincronizacion y retorna un resumen.

**Archivos a crear:**
- `app/src/app/api/microsoft-sync/route.ts`
- `app/src/app/api/microsoft-sync/status/route.ts`

**Dependencias:** Tarea 1, Tarea 2, Tarea 3

**Instrucciones detalladas:**

1. **`POST /api/microsoft-sync`** — Ejecutar sincronizacion:
   - Verificar sesion con `getServerSession(authOptions)` -> 401 si no autenticado
   - Verificar rol admin: `session.user.role !== 'admin'` -> 403
   - Verificar configuracion Microsoft con `checkConfiguration()` -> 400 si no configurado
   - Ejecutar algoritmo de sincronizacion (ver seccion Algoritmo):

   ```typescript
   // Pseudocodigo del handler
   const token = await getAccessToken();
   const msUsers = await fetchAllUsers(token);

   const resultado = { creados: 0, actualizados: 0, desactivados: 0, errores: [], alertas: [] };

   for (const msUser of msUsers) {
     try {
       const datos = transformUser(msUser);
       const validated = microsoftSyncEmployeeSchema.parse(datos);

       // Buscar por microsoftId
       let employee = await prisma.employee.findUnique({
         where: { microsoftId: msUser.id },
         include: { activosActuales: true }
       });

       if (employee) {
         if (!msUser.accountEnabled && employee.estado === 'activo') {
           // Desactivar
           await prisma.employee.update({
             where: { id: employee.id },
             data: { estado: 'desvinculado' }
           });
           resultado.desactivados++;
           if (employee.activosActuales.length > 0) {
             resultado.alertas.push({
               tipo: 'equipos_pendientes',
               empleado: `${employee.nombres} ${employee.apellidoPaterno}`,
               equipos: employee.activosActuales.length
             });
           }
         } else if (msUser.accountEnabled) {
           // Actualizar
           await prisma.employee.update({
             where: { id: employee.id },
             data: { ...validated, microsoftId: msUser.id }
           });
           resultado.actualizados++;
         }
       } else if (msUser.accountEnabled) {
         // Buscar por correo
         employee = await prisma.employee.findUnique({
           where: { correo: validated.correo }
         });

         if (employee) {
           // Vincular existente
           await prisma.employee.update({
             where: { id: employee.id },
             data: { ...validated, microsoftId: msUser.id, origenMicrosoft: true }
           });
           resultado.actualizados++;
         } else {
           // Crear nuevo
           await prisma.employee.create({
             data: {
               ...validated,
               microsoftId: msUser.id,
               origenMicrosoft: true,
               tipoContrato: 'externo',
               estado: 'activo',
             }
           });
           resultado.creados++;
         }
       }
     } catch (error) {
       resultado.errores.push({ usuario: msUser.displayName, error: error.message });
     }
   }

   return NextResponse.json(resultado);
   ```

   - Manejar errores globales (token invalido, red, etc.) con try/catch externo -> 500

2. **`GET /api/microsoft-sync/status`** — Estado de configuracion:
   - Verificar sesion y rol admin
   - Retornar `checkConfiguration()` result
   - Agregar estadisticas: total empleados Microsoft, ultimo sync (si se implementa campo)

   ```json
   {
     "configured": true,
     "missing": [],
     "stats": {
       "totalEmpleadosMicrosoft": 45,
       "totalEmpleadosManuales": 12
     }
   }
   ```

**Patron de API existente (referencia):**
Cada API route sigue: session check -> validate input -> prisma ops -> response.
Ver cualquier archivo en `app/src/app/api/` para el patron exacto.

**Criterios de verificacion:**
- [ ] `POST /api/microsoft-sync` retorna 401 sin sesion
- [ ] `POST /api/microsoft-sync` retorna 403 si no es admin
- [ ] `POST /api/microsoft-sync` retorna 400 si variables no configuradas
- [ ] Sync crea empleados nuevos correctamente (sin RUT, con origenMicrosoft=true)
- [ ] Sync actualiza empleados existentes vinculados por microsoftId
- [ ] Sync vincula empleados por correo si no tienen microsoftId
- [ ] Sync marca como desvinculado si accountEnabled=false
- [ ] Alertas incluyen empleados desactivados que tienen equipos asignados
- [ ] `GET /api/microsoft-sync/status` retorna estado de configuracion
- [ ] `npm run build` compila sin errores

---

### Tarea 5: Pagina de configuracion Microsoft Sync

**Objetivo:** Crear la pagina de UI donde el admin puede ver el estado y ejecutar la sincronizacion.

**Archivos a crear:**
- `app/src/app/(dashboard)/configuracion/microsoft-sync/page.tsx`

**Archivos a modificar:**
- `app/src/app/(dashboard)/configuracion/page.tsx` (agregar tarjeta)

**Dependencias:** Tarea 4

**Instrucciones detalladas:**

1. **Agregar tarjeta en `configuracion/page.tsx`:**
   - Agregar al array `configSections` (despues de "Parametros Generales", antes de "Mantenimiento de Datos"):
   ```typescript
   {
     title: "Microsoft Sync",
     description: "Sincroniza empleados desde Microsoft Entra ID (Azure AD)",
     href: "/configuracion/microsoft-sync",
     icon: Cloud, // importar de lucide-react
     color: "bg-sky-100 text-sky-600",
     adminOnly: true,
   },
   ```
   - Agregar import de `Cloud` de lucide-react en linea 3

2. **Crear pagina `microsoft-sync/page.tsx`:**

   Componente client (`"use client"`) con las siguientes secciones:

   **a. Estado de configuracion:**
   - Al montar, hacer `GET /api/microsoft-sync/status`
   - Si `configured: false`: mostrar banner amarillo con las variables faltantes y link a este documento
   - Si `configured: true`: mostrar badge verde "Configurado"
   - Mostrar stats: X empleados sincronizados desde Microsoft, Y empleados manuales

   **b. Boton de sincronizacion:**
   - Boton "Sincronizar empleados" (deshabilitado si no configurado)
   - Al click: dialogo de confirmacion "Esto sincronizara todos los empleados desde Microsoft Entra ID. Los empleados desactivados en Microsoft seran marcados como desvinculados. Continuar?"
   - Durante sync: spinner + "Sincronizando..." (deshabilitar boton)
   - `POST /api/microsoft-sync`

   **c. Resultado de sincronizacion:**
   - Despues del sync, mostrar resumen:
     - Empleados creados: N (verde)
     - Empleados actualizados: N (azul)
     - Empleados desactivados: N (naranja)
     - Errores: N (rojo, con detalle expandible)
   - Si hay alertas de equipos pendientes: mostrar banner rojo con lista de empleados desactivados que tienen equipos asignados

   **d. Instrucciones de configuracion:**
   - Seccion colapsable "Como configurar" con resumen de los pasos de Azure Portal
   - Explicar que las variables van en `.env` o en Vercel Dashboard

   **Estilos:** Usar las mismas clases Tailwind del proyecto (bg-white, rounded-lg, shadow, etc.). Ver paginas existentes en configuracion para referencia.

**Estado actual de configSections (linea 12-53 de configuracion/page.tsx):**
5 secciones: Categorias, Usuarios, Proveedores, Parametros, Mantenimiento.
La nueva tarjeta va entre Parametros (indice 3) y Mantenimiento (indice 4).

**Criterios de verificacion:**
- [ ] Pagina de configuracion muestra 6 tarjetas (la nueva con icono Cloud y badge Admin)
- [ ] Click en tarjeta navega a `/configuracion/microsoft-sync`
- [ ] Si no hay variables configuradas, muestra banner de advertencia
- [ ] Boton de sync deshabilitado si no configurado
- [ ] Sync muestra spinner durante ejecucion
- [ ] Resultado muestra contadores correctos
- [ ] Alertas de equipos pendientes visibles en rojo
- [ ] Solo accesible para rol admin (verificar en API)
- [ ] UI en espanol
- [ ] `npm run build` compila sin errores

---

### Tarea 6: Adaptar UI de empleados para empleados sin RUT

**Objetivo:** Asegurar que la lista y ficha de empleados funcionen correctamente con empleados que no tienen RUT (sincronizados desde Microsoft).

**Archivos a modificar:**
- `app/src/app/(dashboard)/empleados/page.tsx` — Lista de empleados
- `app/src/app/(dashboard)/empleados/[id]/page.tsx` — Ficha de empleado
- `app/src/app/(dashboard)/empleados/nuevo/page.tsx` — Formulario de creacion (si existe)
- `app/src/app/(dashboard)/empleados/[id]/editar/page.tsx` — Formulario de edicion (si existe)

**Dependencias:** Tarea 1, Tarea 2

**Instrucciones detalladas:**

1. **Lista de empleados (`empleados/page.tsx`):**
   - Donde se muestra `employee.rut`, agregar fallback: `employee.rut || "—"`
   - Si `employee.origenMicrosoft === true`, mostrar badge pequeno junto al nombre:
     ```html
     <span class="inline-flex items-center text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">
       Microsoft
     </span>
     ```

2. **Ficha de empleado (`empleados/[id]/page.tsx`):**
   - Linea 277 muestra `{ficha.empleado.rut}` directamente. Cambiar a:
     ```tsx
     <p className="text-blue-200 font-mono">
       {ficha.empleado.rut || "Sin RUT (Microsoft)"}
     </p>
     ```
   - Agregar indicador de origen si `origenMicrosoft`:
     ```tsx
     {ficha.empleado.origenMicrosoft && (
       <span className="inline-flex items-center text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full ml-2">
         Sincronizado desde Microsoft
       </span>
     )}
     ```

3. **Formulario de creacion (si existe):**
   - RUT ya no es obligatorio en el schema, pero el formulario puede tener validacion client-side
   - Si el campo RUT tiene `required`, cambiarlo a opcional
   - Mostrar hint: "Opcional para empleados sincronizados desde Microsoft"

4. **Formulario de edicion (si existe):**
   - Si el empleado tiene `origenMicrosoft === true`, mostrar aviso: "Los datos de este empleado se sincronizan desde Microsoft. Los cambios manuales seran sobreescritos en la proxima sincronizacion."
   - Campos sincronizados (nombre, correo, cargo, etc.) podrian mostrarse como read-only con un candado visual, pero esto es opcional (mejora UX)

5. **Tipo Employee en frontend:**
   - Verificar que el tipo `Employee` usado en el frontend incluya `rut` como opcional (`rut?: string | null`) y los nuevos campos `microsoftId` y `origenMicrosoft`
   - Si hay un type definition local, actualizarlo

**Estado actual de la ficha (linea 277):**
```tsx
<p className="text-blue-200 font-mono">{ficha.empleado.rut}</p>
```

**Criterios de verificacion:**
- [ ] Lista de empleados no muestra "undefined" ni "null" para empleados sin RUT
- [ ] Badge "Microsoft" visible en empleados sincronizados
- [ ] Ficha de empleado muestra "Sin RUT (Microsoft)" en lugar de vacio
- [ ] Formularios de creacion/edicion permiten RUT vacio
- [ ] Empleados manuales (con RUT) se ven exactamente igual que antes
- [ ] No hay errores de TypeScript por campos opcionales
- [ ] `npm run build` compila sin errores

---

### Tarea 7: Verificacion integral y limpieza

**Objetivo:** Verificar que todo el sistema funciona end-to-end y no hay regresiones.

**Archivos a verificar (no necesariamente modificar):**
- Todos los archivos de API que usan `employee.rut` (buscar con grep)
- `app/src/app/api/empleados/route.ts` — CRUD de empleados
- `app/src/app/api/empleados/[id]/route.ts` — Detalle/update empleado
- `app/src/app/api/asignaciones/route.ts` — Asignaciones (usan employee)
- `app/src/app/api/desvinculaciones/route.ts` — Desvinculaciones
- `app/src/app/api/guias-despacho/route.ts` — Guias de despacho (muestran RUT destinatario)
- `app/src/lib/services/assetHistoryService.ts` — Audit trail

**Dependencias:** Tareas 1-6 completadas

**Instrucciones detalladas:**

1. **Buscar todas las referencias a `employee.rut` o `.rut` en el codebase:**
   ```bash
   cd app && grep -rn "\.rut" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".rutSchema"
   ```
   - Para cada referencia, verificar que maneja `null`/`undefined` correctamente
   - Poner especial atencion a:
     - Guias de despacho: `destinatarioRut` puede venir del employee
     - Reportes/exports: si algun export a Excel asume RUT presente
     - Busqueda: si el filtro de busqueda busca por RUT

2. **Verificar API de empleados:**
   - `POST /api/empleados` debe aceptar body sin `rut`
   - `GET /api/empleados?search=xxx` debe funcionar sin errores si empleados no tienen RUT
   - `GET /api/empleados/[id]` debe retornar empleado sin RUT correctamente

3. **Verificar que las APIs existentes no se rompen:**
   - Asignaciones: al asignar equipo a empleado sin RUT
   - Desvinculaciones: al desvincular empleado sin RUT
   - Guias de despacho: `destinatarioRut` puede ser null

4. **Build completo:**
   ```bash
   cd app
   npm run typecheck
   npm run lint
   npm run build
   ```

5. **Verificar flujo completo (manual con Azure real):**
   - Configurar variables de entorno con tenant real
   - Ir a Configuracion > Microsoft Sync
   - Verificar que muestra "Configurado"
   - Ejecutar sync
   - Verificar empleados creados en lista
   - Verificar ficha de empleado sincronizado
   - Verificar que empleados manuales no fueron afectados

**Criterios de verificacion:**
- [ ] `npm run build` pasa sin errores
- [ ] `npm run typecheck` pasa sin errores
- [ ] `npm run lint` pasa sin errores
- [ ] Pagina de configuracion muestra tarjeta Microsoft Sync
- [ ] Pagina microsoft-sync muestra estado de configuracion
- [ ] Boton sync funciona con tenant Azure AD real
- [ ] Empleados creados aparecen sin RUT con badge "Microsoft"
- [ ] Empleados manuales no afectados (RUT intacto, sin badge)
- [ ] Desactivacion marca como desvinculado
- [ ] Si empleado desactivado tiene equipos, aparece alerta
- [ ] Guias de despacho funcionan con empleados sin RUT
- [ ] Busqueda de empleados funciona correctamente

---

## Orden de Ejecucion

```
Tarea 1 (schema)
   |
   +-- Tarea 2 (validaciones) --+
   |                             |
   +-- Tarea 3 (servicio MS) ---+-- Tarea 4 (API endpoint)
                                       |
                                 Tarea 5 (pagina UI)
                                       |
                      Tarea 6 (adaptar UI empleados)
                                       |
                      Tarea 7 (verificacion integral)
```

Tareas 2 y 3 pueden ejecutarse en paralelo despues de Tarea 1.
Tarea 4 requiere 1, 2 y 3.
Tareas 5 y 6 pueden ejecutarse en paralelo despues de Tarea 4 (Tarea 6 solo requiere 1 y 2 realmente).
Tarea 7 es la final.

---

## Notas Importantes

- **No instalar paquetes:** Todo se implementa con `fetch` nativo. No usar `@azure/identity`, `@microsoft/microsoft-graph-client`, ni ningun SDK.
- **Seguridad:** El `MICROSOFT_CLIENT_SECRET` nunca debe exponerse al frontend. Todas las llamadas a Graph API se hacen server-side.
- **Rate limits de Graph API:** Microsoft Graph tiene un limite de ~10,000 requests por 10 minutos. Con paginacion de 100 usuarios por request, esto soporta hasta 1,000,000 de usuarios sin problemas.
- **Paginacion:** Siempre seguir `@odata.nextLink`. No asumir que todos los usuarios caben en una sola respuesta.
- **Empleados manuales:** La sincronizacion NUNCA debe borrar ni modificar empleados que no tienen `microsoftId` (a menos que se vincule por correo).
- **RUT retrocompatibilidad:** Hacer `rut` opcional afecta potencialmente a todas las partes del sistema que asumen RUT presente. La Tarea 7 es critica para detectar regresiones.
