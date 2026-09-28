# Auditoría de 7 fases — Inventario IT (SCL Consultores)

**Fecha:** 28-sep-2026 · **Código revisado:** rama `fix/hallazgos-qa-interfaz`, commit `3660672` (después de las correcciones de la auditoría del 27-sep, SPEC 2.114).
**Cómo se hizo:** lectura directa del código, búsquedas en todo `app/src`, ejecución de `tsc`, `eslint`, `jest --coverage`, `npm audit` y `npm outdated`, y pruebas contra el Postgres local cuando hizo falta. No se ejecutaron ZAP, Burp ni sqlmap; donde se proponen, son pasos para correrlos.

**Despliegue:** hoy solo hay un entorno local (Windows, Postgres en Docker, puerto 5433). El despliegue previsto es Vercel + Neon (`app/docs/DEPLOYMENT.md`), pero **aún no está hecho**: se considera pendiente para la entrega del Capstone.

**Correcciones al contexto entregado** (el código manda):
- Los estados de un activo son 8, no 6: además de los listados existen `por_repartir` (compras, SPEC 2.111) y `en_transito` (despachos, SPEC 2.108). Ver `lib/validations/asset.ts:9`.
- El stock de Kit/EPP es **por artículo y por sede**, no por categoría (`WelcomeKitItem.sedeId`).

**Severidad:** Crítica · Alta · Media · Baja. En cada fase, de mayor a menor.

## Estado de las correcciones (28-sep-2026, después del informe)
Las reglas nuevas están en la SPEC, sección **2.115**. Verificado: `tsc` y `eslint` limpios, 1.256 pruebas en verde con umbrales de cobertura, `next build` correcto y `npm audit` en 0.

| Hallazgo | Estado | Cómo |
|---|---|---|
| 7.A-1 Carreras en venta, baja y mantenciones | **Corregido** | `siSigueIgual`: el `update` exige el estado leído; si cambió, 409. Aplicado en venta, baja, iniciar, editar, cancelar y completar mantención. Probado contra Postgres (P2025) y con pruebas |
| 1.1 Asignación visible en Compras | **Corregido (por decisión)** | Compras ya no muestra estado ni asignación, para nadie (SPEC 2.111.6) |
| 1.2 Sin límite de uso | **Corregido, con alcance** | `exigirCupo` por usuario (429) en exportar, PDF e importar, y `maxDuration = 60`. Cuenta por instancia: en Vercel no es un tope global (para eso, Upstash) |
| 7.A-2 Fecha inválida borra la guardada | **Corregido** | Error "Fecha inválida" en el campo |
| 7.A-3 Fechas de activo sin validar | **Corregido** | `fechaTextoOpcional` |
| 7.B Números y textos sin tope, teléfono | **Corregido** | `lib/validations/comunes.ts` (`cantidad`, `textoLibre`) y formato de teléfono |
| 3.1 Búsqueda en memoria | **Mejorado** | Filtra solo las columnas de búsqueda y trae completa solo la página (se conserva la búsqueda sin acentos) |
| 3.2 Importación lee toda la tabla | **Corregido** | `armarContextoImportacion` compartido; solo las series e IMEI de las filas. Probado contra Postgres |
| 3.3 Dependencias y archivos sin uso | **Corregido** | 6 paquetes, 4 componentes y 5 SVG retirados |
| 3.5 Usuario buscado por correo | **Corregido** | `usuarioDeSesion` en las 7 llamadas |
| 4.1 Dashboard trae todas las mantenciones | **Corregido** | Solo las que muestra, más un `count` |
| 1.5 Sesión cada 30 s | **Corregido** | Cada 5 minutos |
| 5.1 Pruebas faltantes | **Parcial** | Nuevas: `privacidad` (100 %), `useEnvio` (100 %), `proxy.ts` (quién pasa sin sesión, redirecciones y matcher), concurrencia, límites, venta, contexto de importación, búsqueda y cupo. Sin pruebas todavía: `documentGeneratorService` |
| 6.1 Etiquetas sin unir | **Corregido** | 30 campos unidos en Editar empleado y Nueva solicitud, y 3 grupos "Medio" con nombre |
| 6.2 Tablas cortadas en celular | **Corregido** | `overflow-x-auto` en las 3 |
| 6.3 Límites solo en el servidor | **Parcial** | `maxLength` en observaciones y motivo de cambio de Nueva solicitud |
| A05 Comodines en Auditoría | **Corregido** | `contiene()` escapa `%`, `_` y `\` |
| A03 Dependencias en el CI | **Corregido** | `npm audit --omit=dev --audit-level=high` en el CI |
| 1.3 CSP con `'unsafe-inline'` | **Corregido y probado** | Nonce nuevo en cada visita desde `proxy.ts` (`lib/seguridad/csp.ts`), sin `'unsafe-inline'` en scripts. Probado con la app compilada: login y 10 páginas con sesión (dashboard con sus 12 gráficos, listas, Nueva solicitud, Configuración) sin ningún bloqueo; los scripts sin nonce son partes de Next que carga uno con nonce (`'strict-dynamic'`); un `<script>` inyectado en el HTML queda **bloqueado** |
| 4.7 Caché de PDF y KPI | **Pendiente** | La API de caché cambió en Next 16; el límite de uso ya frena el abuso. Mejora futura |
| 3.4 Dos librerías de Excel | **Corregido** | La importación lee con `exceljs` (la misma de la exportación) y se desinstala `xlsx`. Solo se aceptan `.xlsx` (los 19 Excel del proyecto ya lo eran); un `.xls` se rechaza con un mensaje que explica cómo convertirlo. Hoja inexistente o archivo ilegible: 400 claro. Se borra `scripts/migrate_excel_feb2026.js` (migración antigua que borraba todos los datos). SPEC 2.115.10 |
| 3.6 Páginas muy grandes | **Corregido en Nueva Solicitud** | De 2.698 a 1.684 líneas: coordinación (3 copias → 1 componente, 15 estados → 3), buscador de empleado (2 copias → 1), Kit/EPP, formulario del empleado nuevo, calificación de devoluciones (6 copias → 1) y datos auxiliares, en `components/solicitudes/nueva/`. Mismos datos al servidor; probado en el navegador creando una desvinculación. SPEC 2.115.11. Las demás páginas grandes quedan para después |
| A09 Alertas sobre los logs | **Pendiente (no es código)** | Configurar una Log Drain con alertas al desplegar en Vercel |
| 4.3 Test de concurrencia | **Ejecutado: 6 de 6** | Contra Postgres real (`inventario_it_test`, migrada desde cero): entregas, devoluciones, stock de Kit, venta, baja y completar mantención. En cada par una gana y la otra recibe 409. `npm run test:integracion` |
| Nuevo: conexión local lenta | **Corregido** | Con Docker solo en IPv4, `localhost` en Windows probaba IPv6 primero y cada conexión nueva tardaba ~2 s (fallaban las transacciones simultáneas). `.env` y `.env.example` usan `127.0.0.1` |
| Nuevo: `npm run db:seed` no funcionaba en Windows | **Corregido** | `cmd` quitaba las comillas de `--compiler-options {"module":"CommonJS"}` y `ts-node` no arrancaba. Las opciones van en `prisma/tsconfig.seed.json`. Probado: el seed crea el administrador, 7 categorías y la sede Perú |
| 4.3 Prueba de carga | **Pendiente (no se puede aquí)** | Falta Python. Nota: con el límite de uso nuevo, Locust con una sola cuenta recibirá 429 si incluye exportaciones; usar varias cuentas de prueba |

---

## FASE 1 — Seguridad general

**Resumen:** no hay hallazgos críticos. La autenticación, el hashing, la invalidación de sesiones y la autorización por matriz están bien resueltos. Los problemas que quedan son de alcance acotado: una fuga de datos personales entre sedes, falta de límite de uso en operaciones pesadas y una CSP que todavía permite scripts en línea.

### 1.1 [Media] Un técnico ve nombre y RUT de personas de otra sede en los equipos de una compra
> **Resuelto (28-sep-2026), con otra solución:** por decisión de Javier, Compras ya no muestra el estado ni la asignación de sus equipos, para nadie (SPEC 2.111.6). Se quitó la columna "Estado" y "Asignado a" de la pantalla y la asignación de las dos rutas de la API.

- **Archivo:** `app/src/app/api/compras/[id]/activos/route.ts:23-47` (`INCLUDE_EQUIPO` y `GET`).
- **Evidencia:**
  ```ts
  const INCLUDE_EQUIPO = {
    asset: { include: {
      categoria: true,
      sede: { select: { id: true, nombre: true } },
      empleadoActual: { select: { id: true, rut: true, nombres: true, apellidoPaterno: true } },
    } },
  } as const;
  // GET: await requirePermission('compras', 'read');  <- sin filtrar por sede
  ```
- **Por qué es un problema:** la corrección 2.12 de ayer ocultó `empleadoActual` en `GET /api/compras/[id]`, pero esta ruta hermana devuelve lo mismo sin filtrar. El técnico ve todas las compras (SPEC 2.111.6), así que puede leer RUT y nombre de personas de cualquier sede.
- **Cómo lo explotaría un atacante:** (1) inicia sesión como técnico de la sede A; (2) abre Compras y toma el id de una compra repartida a varias sedes; (3) llama `GET /api/compras/<id>/activos` desde la consola del navegador; (4) obtiene RUT y nombre de quien tiene cada equipo en las sedes B y C.
- **Corrección:** reutilizar la misma regla en un helper y aplicarla en ambas rutas.
  ```ts
  // lib/queries/compras.ts
  export function ocultarPersonasDeOtraSede<T extends { asset: { sedeId: string | null; empleadoActual: unknown } }>(
    session: SesionAutenticada, filas: T[]
  ): T[] {
    if (tieneVisibilidadTotal(session)) return filas;
    return filas.map((pa) =>
      pa.asset.sedeId === session.user.sedeId ? pa : { ...pa, asset: { ...pa.asset, empleadoActual: null } }
    );
  }
  // compras/[id]/activos/route.ts (GET)
  const session = await requirePermission('compras', 'read');
  ...
  return NextResponse.json({ data: ocultarPersonasDeOtraSede(session, purchaseAssets), ... });
  ```
  Además: agregar el caso a `__tests__/api/compraOtraSede.test.ts`.

### 1.2 [Media] Sin límite de uso en las operaciones más caras (exportar, PDF, importar)
- **Archivos:** `app/src/app/api/activos/exportar/route.ts:164-201` (carga todos los activos visibles), `app/src/app/api/solicitudes/[id]/documento/[tipo]/route.ts` (genera el PDF en cada petición), `app/src/app/api/activos/importar/*`. No hay ningún `rateLimit` en el proyecto (búsqueda en `src/` sin resultados).
- **Por qué es un problema:** cualquier usuario autenticado (o una sesión robada) puede repetir en bucle la exportación o la generación de PDF y saturar la CPU y la base. El bloqueo por intentos solo protege el login.
- **Cómo lo explotaría un atacante:** con una sesión válida, `for i in $(seq 500); do curl -s -b cookies.txt https://app/api/activos/exportar > /dev/null & done`. Cada petición arma un Excel completo en memoria; en Vercel eso multiplica instancias y costo, y en un servidor propio agota memoria.
- **Corrección:** limitador por usuario en las rutas pesadas, contado en la base (funciona con varias instancias, igual que el bloqueo de login):
  ```ts
  // lib/services/limiteUso.ts
  export async function exigirCupo(usuarioId: string, accion: string, max: number, ventanaSeg: number) {
    const desde = new Date(Date.now() - ventanaSeg * 1000);
    const usados = await prisma.auditLog.count({ where: { usuarioId, accion, createdAt: { gte: desde } } });
    if (usados >= max) throw new ApiError(429, 'Demasiadas solicitudes. Espera un momento.');
  }
  // exportar/route.ts
  await exigirCupo(session.user.id, 'exportar_activos', 5, 60);
  ```
  (O Upstash Ratelimit si se despliega en Vercel.)

### 1.3 [Baja] La CSP permite scripts en línea (`'unsafe-inline'`)
- **Archivo:** `app/next.config.ts:16` — `` `script-src 'self' 'unsafe-inline'...` ``.
- **Por qué es un problema:** si algún día aparece un XSS, la CSP no lo frena, porque cualquier `<script>` inyectado en la página se ejecuta. Hoy no se encontró ningún punto de inyección (ver 2.3), así que el riesgo es bajo.
- **Corrección:** CSP con *nonce* generado en `proxy.ts` (Next 16 lo propaga a sus propios scripts) y el nonce en el script del tema:
  ```ts
  // proxy.ts
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; ...`;
  const res = NextResponse.next({ request: { headers: new Headers({ ...req.headers, 'x-nonce': nonce }) } });
  res.headers.set('Content-Security-Policy', csp);
  // layout.tsx
  <script nonce={(await headers()).get('x-nonce') ?? undefined} dangerouslySetInnerHTML={{ __html: temaInitScript }} />
  ```
  Antes de hacerlo, revisar `node_modules/next/dist/docs/` (guía de CSP de Next 16), porque obliga a que las páginas sean dinámicas.

### 1.4 [Baja] Credenciales antiguas en el historial de git
- **Evidencia:** `git log -S "NEXTAUTH_SECRET="` encuentra el secreto antiguo en versiones previas de los README, y el historial contiene `admin123`. `.env` nunca se subió.
- **Por qué es un problema:** si el repositorio se vuelve público o se comparte, esos valores quedan a la vista. Mientras se roten (acciones manuales pendientes), no sirven.
- **Corrección:** rotar el secreto en todos los ambientes (pendiente, ver informe del 27-sep) y cambiar la clave del administrador local. Reescribir el historial no hace falta si se rota.

### 1.5 [Baja] La sesión consulta la base en cada petición y el navegador la pide cada 30 s
- **Archivos:** `app/src/lib/auth.ts:225-236` (callback `jwt`), `app/src/components/providers/SessionProvider.tsx` (`refetchInterval={30}`).
- **Por qué es un problema:** no es una vulnerabilidad. Es el costo de poder cortar sesiones al instante (SPEC 2.112.5). Con muchos usuarios, suma una consulta por petición más 2 por minuto por pestaña abierta. Ver Fase 4.
- **Corrección:** subir `refetchInterval` a 300 s (las cuentas desactivadas quedan fuera igual en su siguiente acción, porque la API revisa en cada llamada) y cachear el resultado con `React.cache` dentro de una misma petición.

### Revisado y correcto (sin hallazgo)
| Tema | Evidencia |
|---|---|
| Hashing | bcrypt costo 12 (`api/usuarios/[id]/route.ts:78`, seed); comparación contra un hash de relleno si la cuenta no existe (`lib/auth.ts`, `HASH_RELLENO`), así no se pueden descubrir correos por tiempo de respuesta |
| Tokens | JWT cifrado por NextAuth; vence según Configuración > Seguridad (`expiraEn`); lista negra al cerrar sesión; "sesiones válidas desde" al desactivar o cambiar la clave |
| Bloqueo | intento anotado antes de revisar la clave, correo + IP con tope global 4x, IP confiable solo detrás de un proxy (2.114.2) |
| Autorización | `requirePermission` en todas las rutas salvo NextAuth, verificado por `rutas-protegidas.test.ts`; matriz única en `lib/auth/permissions.ts` |
| IDOR | las 31 rutas con `[id]` revisadas: sede validada con `assertSedeAccess`, `buscarGuiaVisible`, `puedeVerActivo` o permiso solo de admin (catálogos, compras en escritura). Única fuga: 1.1 |
| Secretos | `.env` ignorado y nunca subido; secreto de 32+ caracteres exigido en producción |
| Cookies | NextAuth: `HttpOnly`, `SameSite=Lax`, `Secure` y prefijo `__Secure-` con HTTPS |
| CSRF | las rutas de NextAuth usan token CSRF; la API recibe JSON con cookie `SameSite=Lax`, que el navegador no envía en un POST desde otro sitio |
| Errores | `handleApiError` responde mensajes genéricos; las páginas de error muestran solo el `digest` |
| Dependencias | `npm audit`: 0 vulnerabilidades (producción y desarrollo). Para seguirlo: `npm audit --omit=dev` en el CI y OWASP Dependency-Check (`dependency-check --scan app --format HTML`) |
| Subida de archivos | solo la importación: 5 MB, `.xlsx`/`.xls`, firma real de Excel y 5.000 filas; no se guarda en disco |
| Logs | errores en JSON en producción; accesos y auditoría con quién, cuándo e IP; no se registran contraseñas ni cuerpos de petición |

---

## FASE 2 — OWASP Top 10 (edición 2025)

La edición 2025 agrupa SSRF dentro de A01; aquí se evalúa por separado igual, como pide el encargo.

### A01 Control de acceso roto — **Posiblemente vulnerable (Media)**
- **Dónde:** `lib/auth/permissions.ts`, `lib/auth/sedeScope.ts`, las 59 rutas de `app/api`.
- **Estado:** matriz aplicada en el servidor y aislamiento por sede correcto en las 31 rutas con id, salvo la fuga de datos 1.1.
- **Casos de ataque para probar:**
  - Como técnico de la sede A: `GET /api/activos/<id-de-sede-B>` → debe dar 404. `GET /api/compras/<id>/activos` → hoy muestra `empleadoActual` de otras sedes (hallazgo 1.1).
  - `POST /api/solicitudes/<id>/transicion` con un `assetIds` de otra sede → 404 (A01-1, corregido).
  - Como técnico: `PUT /api/usuarios/<id>` con `{"rol":"admin"}` → 403.
- **Con ZAP/Burp:** iniciar sesión con dos usuarios (técnico A y técnico B), grabar la navegación de A y repetir cada petición con la cookie de B usando la extensión *Autorize* (Burp) o *Access Control Testing* (ZAP). Toda respuesta 200 con datos de otra sede es un hallazgo.
- **SSRF — No aplica:** el servidor no hace peticiones a URLs externas (no hay `fetch` hacia `http` ni `axios` en el código de servidor).
- **Corrección:** 1.1.

### A02 Configuración de seguridad incorrecta — **Protegido, con un detalle (Baja)**
- **Dónde:** `next.config.ts`, `proxy.ts`, `docker-compose.yml`.
- CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, sin `X-Powered-By` ni CORS abierto; base local solo en `127.0.0.1`. El detalle: `'unsafe-inline'` (1.3).
- **Prueba:** `curl -sI https://app/login | grep -iE "content-security|strict-transport|x-frame"`; en ZAP, *Passive Scan* marca las cabeceras faltantes.

### A03 Fallas en la cadena de suministro (componentes) — **Protegido**
- `npm audit`: 0. `xlsx` se instala desde el CDN oficial de SheetJS (la versión de npm está abandonada). Pendiente: Prisma 5.22 → 7.x (sin fallas conocidas, pero fuera de soporte activo a futuro).
- **Prueba:** `npm audit --omit=dev`; `npx better-npm-audit audit`; Dependency-Check en el CI.
- **Corrección preventiva:** agregar `npm audit --omit=dev --audit-level=high` al CI.

### A04 Fallas criptográficas — **Protegido**
- bcrypt 12, JWT cifrado con un secreto de 32+ caracteres, HTTPS obligatorio (HSTS) y `sslmode=require` hacia Neon. No se guardan datos de tarjetas ni claves en texto plano.

### A05 Inyección (SQL, comandos, plantillas y XSS) — **Protegido**
- **SQL:** todo pasa por Prisma. El SQL crudo usa plantillas con parámetros: `auditoriaService.ts:61-102` (`Prisma.sql`), `numeroSolicitud.ts:19`, `usuarios/[id]:117`. No hay `$queryRawUnsafe`, `$executeRawUnsafe` ni `Prisma.raw`.
- **Comandos:** no hay `child_process` ni `exec`.
- **Plantillas y XSS:** React escapa todo. El único `dangerouslySetInnerHTML` es el script fijo del tema (`app/layout.tsx:30`, texto constante). Los PDF se arman con `@react-pdf` (sin HTML).
- **Payloads para probar:** en búsquedas y formularios, `' OR 1=1 --`, `"; DROP TABLE assets; --`, `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `{{7*7}}`. Deben aparecer como texto literal.
- **sqlmap:** `sqlmap -u "https://app/api/activos?search=dell" --cookie="__Secure-next-auth.session-token=..." --level=3 --risk=2`; debe terminar sin parámetros inyectables.
- **Detalle menor:** en `auditoriaService.ts:84-88`, `ILIKE` con el texto del usuario no escapa `%` ni `_`. Buscar `%` trae todo, pero no es inyección.

### A06 Diseño inseguro — **Posiblemente vulnerable (Media)**
- **Dónde:** las operaciones de estado que leen fuera de la transacción: venta, baja y completar mantención (7.A-1). Es un fallo de diseño (revisar y después escribir) y no de sintaxis.
- **Caso de ataque:** enviar en paralelo `POST /api/activos/<id>/venta` y una entrega del mismo equipo; se puede terminar con un equipo "vendido" que tiene una asignación activa.
- **Corrección:** ver 7.A-1.

### A07 Fallas de autenticación — **Protegido**
- Bloqueo por correo + IP con tope global, clave de 12+ caracteres con complejidad, sin clave por defecto, cierre de sesión que invalida el token y expiración configurable.
- **Pruebas:** 6 intentos fallidos seguidos → el sexto responde "Demasiados intentos"; reutilizar una cookie copiada antes del cierre de sesión → 401; usar la cookie de una cuenta desactivada → 401 en la siguiente acción.
- **Pendiente (decisión de negocio):** MFA.

### A08 Fallas de integridad de software y datos — **Protegido**
- Dependencias con `package-lock.json` y `npm ci` en el CI; migraciones versionadas (`db:push` bloqueado); no se deserializan objetos no confiables (solo `JSON.parse` de JSON validado con Zod).

### A09 Fallas de registro y alertas — **Posiblemente vulnerable (Baja)**
- Se registran accesos, auditoría y errores en JSON, pero **nadie recibe una alerta**: un bloqueo masivo de cuentas o una ola de 500 no avisa a nadie.
- **Corrección:** en Vercel, una *Log Drain* hacia un servicio con alertas (Better Stack, Datadog) con reglas para `"nivel":"error"` y para `resultado = bloqueado` más de N veces en 5 minutos.

### A10 Manejo incorrecto de condiciones excepcionales — **Posiblemente vulnerable (Baja)**
- `handleApiError` cubre errores de la API, Zod y los códigos P2002, P2003 y P2025 de Prisma. Lo que no reconoce responde 500 con un mensaje genérico. Un número fuera del rango de `int` de Postgres (7.B, Kit con `cantidad: 3000000000`) termina en ese 500 en vez de un 400 claro.
- **Corrección:** `.max(1_000_000)` en los enteros de los esquemas (7.B-2).

### Tabla resumen
| Categoría (OWASP 2025) | Estado | Severidad |
|---|---|---|
| A01 Control de acceso roto (incluye SSRF) | Posiblemente vulnerable (fuga 1.1); SSRF no aplica | Media |
| A02 Configuración incorrecta | Protegido ('unsafe-inline' pendiente) | Baja |
| A03 Cadena de suministro / componentes | Protegido | — |
| A04 Fallas criptográficas | Protegido | — |
| A05 Inyección y XSS | Protegido | — |
| A06 Diseño inseguro | Posiblemente vulnerable (carreras en venta, baja y mantención) | Media |
| A07 Fallas de autenticación | Protegido (MFA pendiente) | — |
| A08 Integridad de software y datos | Protegido | — |
| A09 Registro y alertas | Posiblemente vulnerable (sin alertas) | Baja |
| A10 Condiciones excepcionales | Posiblemente vulnerable (500 ante enteros enormes) | Baja |

---

## FASE 3 — Código: eficiencia, reducción y buenas prácticas

### 3.1 [Media] Búsqueda en memoria en Despachos y Solicitudes
- **Archivos:** `app/src/app/api/guias-despacho/route.ts:74-90`, `app/src/app/api/solicitudes/route.ts:107-127`.
- **Antes:**
  ```ts
  const todas = await prisma.dispatchGuide.findMany({ where, orderBy: { createdAt: "desc" }, include: includeGuia });
  const filtradas = todas.filter((g) => coincideBusqueda(terminoBusqueda, { rut: g.receptorRut, campos: [...] }));
  total = filtradas.length;
  guides = filtradas.slice((page - 1) * limit, (page - 1) * limit + limit);
  ```
- **Por qué:** con un término de búsqueda se traen **todas** las filas visibles para mostrar 10. Hoy son pocas; con años de uso crece sin límite.
- **Después:** filtrar en la base. Para los acentos, crear la extensión `unaccent` en la migración y usar un `$queryRaw` con parámetros, o guardar una columna `busqueda` normalizada al escribir:
  ```ts
  const palabras = palabrasDeBusqueda(terminoBusqueda); // ya existe en lib/queries/activos
  where.AND = palabras.map((p) => ({
    OR: [
      { numero: { contains: p, mode: 'insensitive' } },
      { otChilexpress: { contains: p, mode: 'insensitive' } },
      { receptorNombre: { contains: p, mode: 'insensitive' } },
      { receptorRutLimpio: { contains: limpiarRut(p) } }, // columna nueva, se llena al escribir
    ],
  }));
  const [guides, total] = await Promise.all([
    prisma.dispatchGuide.findMany({ where, include: includeGuia, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.dispatchGuide.count({ where }),
  ]);
  ```
- **Reducción:** unas 15 líneas por ruta (desaparece la rama duplicada con y sin búsqueda).

### 3.2 [Media] La importación carga todos los números de serie e IMEI de la base en cada petición
- **Archivos:** `app/src/app/api/activos/importar/preview/route.ts:111-133`, `batch/route.ts:83-105`.
- **Antes:**
  ```ts
  const existingSeries = await prisma.asset.findMany({ where: { numeroSerie: { not: null } }, select: { numeroSerie: true } });
  existingImeiSet: new Set((await prisma.asset.findMany({ where: { imei: { not: null } }, select: { imei: true } })).map((a) => a.imei!)),
  ```
- **Por qué:** con el envío en tandas (2.4), una importación de 5.000 filas hace 25 llamadas a `batch`, y cada una lee **todas** las series e IMEI de la tabla de activos. Además la lógica está copiada en las dos rutas.
- **Después:** buscar solo las series e IMEI que trae la tanda, con la misma técnica que la precarga de empleados:
  ```ts
  // lib/importacion/contexto.ts (compartido por preview y batch)
  export async function seriesEImeiExistentes(filas: Record<string, string>[]) {
    const series = [...new Set(filas.map((f) => f.numeroSerie?.trim()).filter(Boolean))];
    const imeis = [...new Set(filas.map((f) => normalizarImei(f.imei ?? '')).filter(Boolean))];
    const [conSerie, conImei] = await Promise.all([
      prisma.asset.findMany({ where: { numeroSerie: { in: series, mode: 'insensitive' } }, select: { numeroSerie: true } }),
      prisma.asset.findMany({ where: { imei: { in: imeis } }, select: { imei: true } }),
    ]);
    return {
      existingSeriesSet: new Set(conSerie.map((a) => a.numeroSerie!.toUpperCase())),
      existingImeiSet: new Set(conImei.map((a) => a.imei!)),
    };
  }
  ```
- **Reducción:** unas 30 líneas duplicadas entre `preview` y `batch` (que además comparten los mapas de sedes y catálogos: todo el contexto cabe en un `armarContextoImportacion()`).

### 3.3 [Baja] Dependencias, componentes y archivos sin uso
- **Evidencia (búsqueda de imports en `src/`):**
  - Dependencias sin ningún import: `@tanstack/react-query`, `class-variance-authority`, `date-fns`, `qrcode`, `qrcode.react` (y `@types/qrcode`).
  - Componentes sin importar: `components/ui/Card.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `ui/index.ts`.
  - Íconos de ejemplo de Next en `public/`: `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`.
- **Corrección:** `npm uninstall @tanstack/react-query class-variance-authority date-fns qrcode qrcode.react @types/qrcode`, borrar los 4 componentes y los 5 SVG, y agregar `knip` al CI para detectarlo en adelante (`npx knip`).
- **Reducción:** alrededor de 250 líneas y 6 paquetes menos en `node_modules`.

### 3.4 [Baja] Dos librerías de Excel
- `xlsx` (lectura en la importación) y `exceljs` (escritura en la exportación). Funciona, pero son dos dependencias grandes para el mismo formato. `exceljs` también lee: unificar en ella elimina `xlsx` (y su instalación desde el CDN). Esfuerzo medio, porque `leerExcel.ts` usa `sheet_to_json`.

### 3.5 [Baja] Siete rutas buscan al usuario por correo en vez de usar la sesión
- **Evidencia:** 7 apariciones de `prisma.systemUser.findUnique({ where: { email: session.user.email } })` en `app/api` (solicitudes, transición, comentarios, etc.).
- **Antes:**
  ```ts
  const systemUser = await prisma.systemUser.findUnique({ where: { email: session.user.email! } });
  if (!systemUser) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  ... solicitante: { connect: { id: systemUser.id } }
  ```
- **Después:** `session.user.id` ya viene validado en cada petición (el callback `jwt` revisa la cuenta):
  ```ts
  ... solicitante: { connect: { id: session.user.id } }
  ```
- **Reducción:** 4 a 6 líneas y una consulta por ruta (unas 35 líneas y 7 consultas en total).

### 3.6 [Baja] Archivos demasiado grandes
| Archivo | Líneas | Responsabilidades mezcladas |
|---|---|---|
| `solicitudes/nueva/page.tsx` | 2.698 | 3 formularios (onboarding, cambio, desvinculación), búsqueda, stock, Kit, coordinación, borrador |
| `solicitudes/[id]/page.tsx` | 1.301 | detalle, transiciones, documentos, comentarios |
| `compras/[id]/page.tsx` | 1.243 | detalle, reparto, Kit, búsqueda de activos |
| `activos/importar/page.tsx` | 1.201 | subida, mapeo, validación, revisión, envío en tandas |
| `activos/page.tsx` | 1.057 | 3 vistas, filtros, acciones |
| `api/solicitudes/route.ts` | 719 | listado, búsqueda y creación de 3 tipos |

- **Propuesta (sin cambiar el comportamiento):** en `solicitudes/nueva`, un componente por tipo (`FormOnboarding`, `FormCambioEquipo`, `FormDesvinculacion`) y un `SeccionCoordinacion` compartido. Hoy la coordinación (fecha, medio, lugar, OT y ciudad) está repetida 3 veces con 5 estados cada una: 15 `useState` que caben en uno por tipo.
  ```tsx
  // Antes (x3): fechaEntregaCoordinada, medioEntrega, lugarEntrega, otChilexpressEntrega, ciudadEntrega...
  // Después
  type Coordinacion = { fecha: string; medio: 'presencial' | 'chilexpress'; lugar: string; ot: string; ciudad: string };
  const [coordinacion, setCoordinacion] = useState<Coordinacion>(COORDINACION_VACIA);
  <SeccionCoordinacion valor={coordinacion} onChange={setCoordinacion} errores={fieldErrors} />
  ```
  Reduce unas 400 líneas en la página. Es un cambio de riesgo alto en la pantalla más usada, así que conviene después de tener pruebas de componente.

### 3.7 [Baja] La lógica de las transiciones de solicitud está en la ruta
- `api/solicitudes/[id]/transicion/route.ts` decide qué efecto ejecutar para cada transición con condicionales anidados. Una tabla de efectos en `lib/services` (`EFECTOS: Record<\`${tipo}:${desde}→${hasta}\`, Efecto>`) la haría probable sin pasar por HTTP. Esfuerzo medio.

### Estructura general
Bien separada: `lib/validations` (Zod), `lib/services` (reglas), `lib/queries` (consultas reutilizables), `lib/auth` (permisos) y rutas delgadas en la mayoría. Las excepciones son las rutas de solicitudes (3.7) y las páginas grandes (3.6). Índices: se agregaron los que faltaban (2.114.7).

---

## FASE 4 — Rendimiento bajo estrés

### 4.1 Operaciones más costosas
| Operación | Costo | Por qué |
|---|---|---|
| `GET /api/activos/exportar` | Alto | Todos los activos visibles con relaciones → Excel en memoria. Sin límite ni cupo (1.2) |
| `GET /api/solicitudes/[id]/documento/[tipo]` | Alto (CPU) | `renderToBuffer` de `@react-pdf` en cada petición, sin caché. Un acta de una solicitud cerrada nunca cambia |
| `POST /api/activos/importar/batch` | Alto | 200 filas por llamada, cada una con su transacción, más la lectura completa de series e IMEI (3.2) |
| Búsqueda en Despachos y Solicitudes | Medio → alto con el tiempo | Filtro en memoria (3.1) |
| `/` (Dashboard) | Medio | 7 consultas en paralelo (bien), pero trae **todas** las mantenciones pendientes sin `take` (`app/(dashboard)/page.tsx:74`) |
| Cada petición autenticada | Bajo, pero constante | 1 consulta de sesión (1.5) |

### 4.2 Cuellos de botella
- **N+1:** no se encontraron en listados (usan `include`). La importación era N+1 por empleado (corregido en 2.4) y lo sigue siendo en series e IMEI de forma inversa (lee de más, 3.2).
- **Paginación:** todos los listados tienen tope (2.114.8). Quedan sin paginar los catálogos pequeños (sedes, categorías, tipos), que está bien.
- **Pool de conexiones:** Prisma con `connection_limit=3` por instancia más el pooler de Neon (`pgbouncer=true`). Es lo correcto en serverless.
- **Síncrono que podría ser asíncrono:** la generación de PDF y la exportación. A esta escala basta con caché (4.7), sin colas.
- **Caché:** no hay ninguna (ni `unstable_cache`, ni de PDF, ni de los KPI).

### 4.3 Pruebas de carga
El script ya existe: `app/scripts/carga/locustfile.py`, con perfiles `normal` (20 usuarios, 5 min), `pico` (80), `estres` (+25 cada 2 min hasta 250) y `resistencia` (40 durante 60 min). Solo lee y usa credenciales desde variables de entorno.
```bash
pip install locust
export CARGA_EMAIL=tecnico.prueba@empresa.cl CARGA_PASSWORD='...'
PERFIL=normal locust -f app/scripts/carga/locustfile.py --host https://staging... --headless --csv normal
PERFIL=estres locust -f app/scripts/carga/locustfile.py --host https://staging... --headless --csv estres
```
**Falta agregar:** una tarea de exportación y otra de PDF con peso bajo (`@task(1)`), porque son las más caras. **No se ha ejecutado:** este equipo no tiene Python.

### 4.4 Métricas
| Métrica | Objetivo (perfil normal) | Dónde medir |
|---|---|---|
| p50 / p95 / p99 de páginas | < 0,5 s / < 2 s / < 4 s | CSV de Locust |
| p95 de la API | < 1 s (PDF < 3 s) | CSV de Locust |
| Peticiones por segundo | Registrar el máximo estable | Locust |
| Tasa de error | 0 % en normal y pico; en estrés, anotar dónde empieza | Locust |
| CPU y memoria | < 70 % sostenido | Vercel → Observability (o `docker stats` en local) |
| Conexiones a la base | Estables en resistencia, sin crecer | Neon → Monitoring → *Connections*; `SELECT count(*) FROM pg_stat_activity` |

### 4.5 Estimación con 100, 500 y 1.000 usuarios concurrentes
**Supuestos (no medidos):** Vercel con Fluid Compute, Neon con 0,25–1 CU y un usuario que hace una acción cada 5 s (unas 5 consultas por acción, contando la de sesión).

| Usuarios | Carga aprox. | Qué pasaría | Qué falla primero |
|---|---|---|---|
| 100 | ~20 acciones/s, ~100 consultas/s | Sin problemas | — |
| 500 | ~100 acciones/s, ~500 consultas/s | Neon de 0,25 CU se acerca al límite; p95 sube. Si varios usuarios generan PDF o exportan a la vez, se notan esperas | CPU de la base; después el tiempo de los PDF |
| 1.000 | ~200 acciones/s, ~1.000 consultas/s, más ~33/s solo por el refresco de sesión | Sin caché, la base es el cuello: timeouts de `pool_timeout=20` y errores 500 | Base de datos (conexiones y CPU), luego el límite de duración de las funciones en exportar e importar |

**Contexto:** SCL Consultores tiene decenas de usuarios del sistema (técnicos y administradores), no cientos. Con 100 usuarios hay margen de sobra; los escenarios de 500 y 1.000 solo aplican si el sistema se abre a más personas.

### 4.6 Condiciones de carrera
| Operación | Estado |
|---|---|
| Entregar el mismo equipo dos veces | Protegido (`updateMany` condicionado, 2.114.3) |
| Devolver dos veces | Protegido |
| Stock de Kit | Protegido |
| Transición o cancelación de solicitud | Protegido (`updatedAt`) |
| Número de solicitud | Protegido (única + reintento) |
| Último administrador | Protegido (candado) |
| **Venta de activo** | **Vulnerable** (7.A-1) |
| **Baja por Mantenciones** | **Vulnerable** (7.A-1) |
| **Completar mantención** | **Vulnerable** (7.A-1) |
| Edición simultánea de un activo o empleado | Gana el último; no hay control de versión (aceptable para datos maestros; mejora futura: `updatedAt` en el `PUT`) |

El test `__tests__/integracion/concurrencia.int.test.ts` cubre los tres primeros casos contra Postgres real, pero **no se ha ejecutado**: falta crear la base `_test`.

### 4.7 Optimizaciones con código
1. **Caché de PDF de solicitudes cerradas:**
   ```ts
   // documento/[tipo]/route.ts
   if (solicitud.estado === 'cerrada') {
     const pdf = await unstable_cache(() => generar(tipo, id), ['pdf', id, tipo], { tags: [`solicitud:${id}`] })();
     return new NextResponse(pdf, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=3600' } });
   }
   ```
   (Revisar primero la guía de caché de Next 16 en `node_modules/next/dist/docs/`, porque la API cambió.)
2. **KPI del dashboard con caché de 60 s** por sede: `unstable_cache(getDashboardData, ['dashboard', sedeId], { revalidate: 60 })`.
3. **Dashboard:** `take: 20` en las mantenciones pendientes (o `count` + las 5 más próximas).
4. **Sesión:** `refetchInterval={300}` (1.5).
5. **Búsqueda en la base** (3.1) y **series e IMEI de la tanda** (3.2).
6. **Duración de funciones en Vercel:** `export const maxDuration = 60;` en `importar/batch`, `exportar` y `documento`.

---

## FASE 5 — Calidad del software

### 5.1 Cobertura y calidad de las pruebas
- **Números (hoy):** 1.232 pruebas en verde y 3 de integración omitidas. Cobertura sobre `lib/` y `hooks/`: **81,65 % de líneas, 81,56 % de ramas, 77,13 % de funciones**. Las rutas de la API y las páginas **no se miden** (`jest.config.ts:44-52`).
- **Bien probado:** matriz de permisos, máquinas de estado de activos y solicitudes (umbral 90 %), validaciones Zod, reglas de importación, bloqueo de login, sesión y lista negra, `workflowExecutionService` y los servicios de sede.
- **Rutas de la API:** solo 14 de las 59 se prueban llamando al handler directamente.
- **Sin pruebas o casi sin ellas (lógica que importa):**
| Archivo | Cobertura | Riesgo |
|---|---|---|
| `lib/utils/privacidad.ts` | 43 % | Es la corrección F1-01; si falla, vuelven a salir los ids |
| `hooks/useEnvio.ts` | 0 % | Evita el doble envío (6.2) |
| `proxy.ts` | 0 % | Decide quién pasa sin sesión |
| `lib/services/documentGeneratorService.ts` | 27 % | Actas legales |
| `lib/importacion/procesarFila.ts` | 45 % | Toda la importación |
| `lib/utils/apiErrors.ts` | 0 % | Cómo el cliente lee cada error |
- **Pruebas que verifican poco:** las de `rutas-protegidas.test.ts` confirman que el texto `requirePermission(` aparece en cada handler, no que el permiso sea el correcto. Cumplen su función de auditoría, pero no reemplazan pruebas de comportamiento por rol.

### 5.2 Pruebas faltantes (listas para usar, Jest)
```ts
// __tests__/lib/utils/privacidad.test.ts
import { sinIdsDeUsuario } from '@/lib/utils/privacidad';
test('quita los ids de usuario en cualquier nivel, sin tocar fechas', () => {
  const fecha = new Date('2026-09-28');
  const r = sinIdsDeUsuario({
    solicitanteId: 'u1', fecha,
    transiciones: [{ ejecutadoPorId: 'u2', estado: 'x' }],
    comentarios: [{ autorId: 'u3', autor: { nombre: 'Ana' } }],
  });
  expect(r).toEqual({ fecha, transiciones: [{ estado: 'x' }], comentarios: [{ autor: { nombre: 'Ana' } }] });
  expect(r.fecha).toBeInstanceOf(Date);
});

// __tests__/hooks/useEnvio.test.ts
import { act, renderHook } from '@testing-library/react';
import { useEnvio } from '@/hooks/useEnvio';
test('un segundo envío mientras el primero corre se ignora', async () => {
  let terminar!: () => void;
  const accion = jest.fn(() => new Promise<void>((r) => (terminar = r)));
  const { result } = renderHook(() => useEnvio());
  act(() => { result.current.ejecutar(accion); result.current.ejecutar(accion); });
  expect(accion).toHaveBeenCalledTimes(1);
  expect(result.current.enviando).toBe(true);
  await act(async () => terminar());
  expect(result.current.enviando).toBe(false);
});

// __tests__/api/ventaCarrera.test.ts (después de corregir 7.A-1)
test('si el equipo cambió de estado entre la lectura y la venta, responde 409', async () => {
  db.asset.findUnique.mockResolvedValue({ id: 'a1', estado: 'disponible', sedeId: 's1', assignments: [], categoria: {} });
  db.asset.updateMany.mockResolvedValue({ count: 0 }); // otra operación lo tomó
  const res = await POST(pedir({ fechaVenta: '2026-09-28', ... }), ctx('a1'));
  expect(res.status).toBe(409);
});
```

### 5.3 Mantenibilidad
- **Complejidad:** las rutas y las páginas grandes (3.6) concentran la complejidad. No hay reglas de complejidad en ESLint.
- **Acoplamiento:** bajo entre capas. La lógica de negocio está en `lib/services` y se prueba sin HTTP.
- **Documentación:** muy buena. La SPEC tiene más de 4.000 líneas con el porqué de cada regla, y los comentarios del código explican decisiones y no solo el qué. En algunos archivos es incluso excesiva.

### 5.4 Consistencia
- **Errores de la API:** uniformes (`{ error, details? }` vía `handleApiError`).
- **Estilo:** Prettier está configurado pero **no se cumple**; hay archivos con comillas simples y otros con dobles, y finales de línea mixtos (LF y CRLF). No afecta el funcionamiento, pero ensucia los diffs.
- **Validación en ambos lados:** el servidor valida todo con Zod. El cliente valida los obligatorios y marca los campos, pero no reutiliza los esquemas de Zod: las reglas pueden desalinearse (por ejemplo, el cliente no conoce el máximo de 1.000 caracteres del motivo de cambio).

### 5.5 Herramientas de calidad continua
```yaml
# .github/workflows/ci.yml, en el job verify
- run: npm run format:check                 # Prettier (hoy fallaría: primero correr npm run format una vez)
- run: npx knip                             # código y dependencias sin uso
- run: npx jscpd src --threshold 2          # duplicación
- run: npm audit --omit=dev --audit-level=high
```
```js
// eslint.config.mjs: avisos de complejidad (sin bloquear al inicio)
{ rules: { complexity: ['warn', 15], 'max-lines-per-function': ['warn', 150], 'max-depth': ['warn', 4] } }
```
Opcional: SonarCloud (gratis para repositorios públicos) con `sonar.javascript.lcov.reportPaths=app/coverage/lcov.info`.

### 5.6 Calificación
| Dimensión | Nota | Justificación |
|---|---|---|
| Pruebas | 7/10 | 1.232 pruebas y 81 % en la lógica, pero la API y la interfaz casi no se prueban y hay piezas de seguridad sin cubrir |
| Mantenibilidad | 6/10 | Buena separación en `lib/`; páginas de más de 1.000 líneas |
| Consistencia | 7/10 | Errores y permisos uniformes; formato sin aplicar |
| Validación | 8/10 | Zod en toda la API, validación de reglas entre campos; el cliente no reutiliza los esquemas |
| Documentación | 9/10 | SPEC y comentarios excelentes |
| Seguridad del código | 8/10 | Sin inyecciones; matriz única; queda la fuga 1.1 y las carreras de 7.A-1 |

---

## FASE 6 — Frontend

Priorizado por impacto en el usuario.

### 6.1 [Media] Etiquetas sin unir a su campo en Editar empleado y en Nueva solicitud
- **Evidencia:** `empleados/[id]/editar/page.tsx`: 16 `<label>` y 0 `htmlFor`. `solicitudes/nueva/page.tsx`: 40 `<label>` y 0 `htmlFor` (unos 28 campos ya usan `CampoFormulario`, que sí los une). En total, alrededor de 129 campos del proyecto no tienen `id` ni `aria-label` propio; muchos están dentro de `CampoFormulario`, que se los asigna, así que el número real es menor.
- **Impacto:** un lector de pantalla anuncia "campo de edición" sin decir cuál; hacer clic en el texto no activa el campo.
- **Corrección:**
  ```tsx
  // Antes
  <label className="field-label">Cargo</label>
  <input value={form.cargo} onChange={...} className={claseInput(errores.cargo)} />
  // Después
  <CampoFormulario label="Cargo" error={errores.cargo}>
    <input value={form.cargo} onChange={...} className={claseInput(errores.cargo)} />
  </CampoFormulario>
  ```

### 6.2 [Baja] Tres tablas se cortan en el celular
- **Archivos:** `mantenciones/tipos/page.tsx`, `components/configuracion/OpcionesCatalogo.tsx`, `components/kit-epp/KitEppCategoriaView.tsx`. Las otras tablas usan `overflow-x-auto` o `TablaAdaptable`.
- **Corrección:** envolver con `<div className="overflow-x-auto">…</div>` o migrarlas a `TablaAdaptable`, como Usuarios y Sedes.

### 6.3 [Baja] El cliente no conoce todos los límites del servidor
- Ejemplo: el motivo de cambio acepta más de 1.000 caracteres en pantalla y el servidor lo rechaza al enviar. Agregar `maxLength` en los `<input>` y `<textarea>`, o reutilizar los esquemas de Zod en el cliente.

### 6.4 [Baja] `console.error` en el cliente
- 50 llamadas `console.*` en componentes y páginas (en `catch`). No exponen datos sensibles, pero ensucian la consola. Cambiarlas por el mensaje en pantalla que ya existe.

### Revisado y correcto
| Tema | Estado |
|---|---|
| Retroalimentación | Los botones de envío revisados tienen `loading` o `disabled` mientras envían, `useEnvio` contra el doble envío, carteles de error con `role="alert"`, páginas de carga y de error propias |
| Diálogos | Sin `alert()` ni `confirm()` del navegador: se usa `ConfirmDialog` |
| Modo oscuro | Los colores "fijos" (`bg-red-50`, etc.) están redefinidos para el tema oscuro en `globals.css`; los blancos restantes son intencionales (logo y login) |
| Imágenes | Una sola `<Image>` (el logo) y tiene `alt`; se sirve con `next/image` |
| Encabezados | Cada página tiene un `h1` vía `PageHeader` |
| Botones de solo ícono | 28 con nombre (2.114.8) |
| Seguridad en el cliente | Sin datos sensibles en el HTML: ids de usuario fuera de la API; React escapa todo |
| Rendimiento | Fuente con `next/font` y un único script en línea. Mejora posible: cargar los gráficos del Dashboard (`recharts`) con `next/dynamic` para no bloquear la primera carga |

---

## FASE 7 — Reglas de negocio y errores de usuario

### Parte A — Reglas de negocio
| Regla | ¿Se cumple? | Dónde | Observación |
|---|---|---|---|
| Estados de ciclo de vida | Sí (8 estados, no 6) | `assetStateMachine.ts` | Toda transición pasa por `validateTransition` |
| Baja o vendido sin asignación activa | **Sí en el caso normal, no bajo concurrencia** | `venta/route.ts:59`, `motivoSinBaja` | 7.A-1 |
| Tipos de solicitud con su máquina de estados por rol | Sí | `workflowStateMachine.ts` (`canTransition`) | Sin saltos de pasos: la transición exige el estado actual |
| Cargador con condición propia | Sí | `condicionCargador.ts`, `leerCondicionCargador` (rechaza valores inválidos) | Solo se guarda si el equipo tiene cargador |
| Kit y EPP con stock | Sí (por artículo y sede) | `executeKitDelivery` | Stock nunca negativo; no se entrega a contratos a honorarios |
| Entrega presencial o por envío | Sí | `datosAccionSchema.superRefine` | Chilexpress exige OT y ciudad |
| Aislamiento por sede | Sí, salvo la fuga 1.1 | `sedeScope.ts` | — |
| Expiración configurable y lista negra | Sí | `lib/auth.ts` | — |

#### 7.A-1 [Media] Venta, baja y completar mantención revisan el estado fuera de la transacción
- **Archivos:**
  - `app/src/app/api/activos/[id]/venta/route.ts:29-35` (lee), `:59` (revisa asignaciones), `:84` (`tx.asset.update` sin condición).
  - `app/src/app/api/mantenciones/baja/route.ts:31-48` (lee y revisa) → `lib/services/mantencionActivoService.ts:44` (`tx.asset.update` sin condición).
  - `app/src/app/api/mantenciones/[id]/completar/route.ts:60-72` (revisa `en_proceso`) → `:80` y `:130` (`tx.maintenance.update` sin condición).
- **Evidencia:**
  ```ts
  const asset = await prisma.asset.findUnique({ where: { id }, include: { assignments: { where: { activo: true } } } });
  if (asset.assignments.length > 0) { ... 409 }
  ...
  await prisma.$transaction(async (tx) => {
    const updated = await tx.asset.update({ where: { id }, data: { estado: 'vendido', ... } });
  ```
- **Cómo se rompe:** dos personas (o dos pestañas) al mismo tiempo: A registra la venta del equipo X mientras B lo entrega en una solicitud. La venta leyó "disponible, sin asignaciones", la entrega lo toma, y la venta lo pisa con "vendido": queda un equipo vendido **con una asignación activa**, contra la regla principal. Con completar mantención, un doble clic desde dos pestañas registra dos cierres y dos eventos en el historial.
- **Corrección:** el mismo patrón de reclamo que ya usan las entregas (2.114.3):
  ```ts
  // venta/route.ts, dentro de la transacción
  const { count } = await tx.asset.updateMany({
    where: { id, estado: asset.estado, empleadoActualId: null, deletedAt: null },
    data: { estado: 'vendido', fechaVenta: data.fechaVenta },
  });
  if (count !== 1) throw new ConflictError('El equipo cambió de estado. Vuelve a cargar la página.');

  // mantencionActivoService.ts (baja)
  const { count } = await tx.asset.updateMany({
    where: { id: asset.id, estado: asset.estado, empleadoActualId: null },
    data: { estado: nuevoEstado },
  });
  if (count !== 1) throw new ConflictError('El equipo cambió de estado. Vuelve a cargar la página.');

  // completar/route.ts
  const { count } = await tx.maintenance.updateMany({ where: { id, estado: 'en_proceso' }, data: { ... } });
  if (count !== 1) throw new ConflictError('La mantención ya fue completada o cambió de estado.');
  ```
  Y sumar estos tres casos a `concurrencia.int.test.ts`.

#### 7.A-2 [Baja] Una fecha inválida enviada a la API **borra** la fecha guardada de un empleado
- **Archivo:** `app/src/lib/validations/employee.ts:18-26`.
- **Evidencia:**
  ```ts
  const fecha = new Date(val);
  return isNaN(fecha.getTime()) ? null : fecha;
  ```
- **Alcance:** desde la pantalla no pasa, porque el selector de fecha envía vacío (que ya significa "borrar") y nunca un texto inválido. Sí pasa con un cliente de la API, un script de carga o una integración futura.
- **Cómo se rompe:** `PUT /api/empleados/<id>` con `{"fechaIngreso":"31-02-2026"}` (o cualquier texto) responde 200 y deja la fecha de ingreso **vacía**, sin avisar. Aplica a ingreso, término, entrega de Kit y EPP y próxima mantención de EPP.
- **Corrección:** rechazar en vez de convertir a `null`:
  ```ts
  const fechaOpcional = z
    .union([z.string(), z.null()])
    .optional()
    .transform((val, ctx) => {
      if (val === undefined) return undefined;
      if (val === null || val === '') return null;
      const fecha = new Date(val);
      if (isNaN(fecha.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'Fecha inválida' });
        return z.NEVER;
      }
      return fecha;
    });
  ```

#### 7.A-3 [Baja] Las fechas de activo no se validan como fecha
- **Archivo:** `lib/validations/asset.ts` (`fechaCompra`, `fechaGarantiaFin` como `z.string()` sin formato). Un texto cualquiera llega a `new Date("abc")` y Prisma lo rechaza con un 400 genérico ("Algún dato enviado no es válido") en vez de marcar el campo. Aplicar el mismo `refine` de fecha que `workflow.ts`.

#### Reglas que solo están en la interfaz
No se encontró ninguna regla de negocio aplicada solo en la interfaz: la matriz, las transiciones, el stock, la sede y las fechas se validan en el servidor. Las únicas diferencias van en el otro sentido: el servidor exige más que la pantalla (6.3).

#### Roles
Confirmado por la matriz y su prueba: el técnico no crea usuarios, sedes ni compras, no cambia catálogos maestros y solo ve su sede. Las transiciones de solicitud las autoriza `workflowStateMachine.canTransition` según el rol.

### Parte B — Errores de usuario y casos límite

| Caso | Entrada | Resultado esperado | Resultado probable según el código | ¿Cubierto? |
|---|---|---|---|---|
| Campo obligatorio vacío | Activo sin marca | 400, campo marcado | 400 con `details` y campo en rojo | Sí |
| Solo espacios | Marca `"   "` | 400 | 400 (`.trim()`, 2.114.4) | Sí |
| Nulo en campo obligatorio | `nombres: null` en empleado | 400 | 400 (Zod) | Sí |
| Texto muy largo en campo con límite | Modelo de 5.000 caracteres | 400 | 400 ("Máximo 100 caracteres") | Sí |
| Texto muy largo sin límite | `observaciones` o `incidencia` de 1 MB en un activo | 400 | **Se guarda** (sin `.max`) | No → agregar `.max(2000)` |
| Emojis, tildes y ñ | `"Ñuñoa 💻 José"` | Se guarda igual | Se guarda (UTF-8); la búsqueda ignora acentos | Sí |
| Caracteres especiales | `<script>` en un nombre | Se muestra como texto | Se muestra como texto (React escapa) | Sí |
| Número negativo | Kit `cantidad: -1` | 400 | 400 | Sí |
| Cero | Entrega de Kit con `cantidad: 0` | 400 | 400 (`min(1)`) | Sí |
| Decimal donde va entero | `cantidad: 1.5` | 400 | 400 (`.int()`) | Sí |
| Entero enorme | Kit `cantidad: 3000000000` | 400 | **500** (se pasa del `int` de Postgres) | No → `.max(1_000_000)` |
| Fecha inválida (activo) | `fechaCompra: "abc"` | 400 en el campo | 400 genérico sin campo | Parcial (7.A-3) |
| Fecha inválida (empleado, vía API) | `fechaIngreso: "31-02-2026"` | 400 | **200 y la fecha queda vacía** | No (7.A-2) |
| Fecha futura en entrega | `fechaEntrega` en 2030 | 400 | 400 ("no puede ser futura", 1 día de margen) | Sí |
| Fecha pasada lejana | `fechaCompra: 1900-01-01` | Aceptar o advertir | Se acepta | Aceptable |
| Orden de fechas | Término antes del ingreso | 400 | 400 (2.114.4) | Sí |
| Correo mal formado | `ana@` | 400 | 400 | Sí |
| RUT mal formado | `12.345.678-0` (dígito verificador malo) | 400 | 400 (`rutOptionalSchema`) | Sí |
| Teléfono mal formado | `"abc"` | 400 | Se guarda (solo `max(20)`) | No → regex `^\+?[0-9 ]{8,15}$` |
| Doble clic en enviar | Guardar dos veces | Un solo registro | Uno (`useEnvio` en 6 pantallas; 409 en entregas y transiciones) | Parcial (no todas las pantallas usan `useEnvio`) |
| Recargar tras enviar | F5 después de crear | Sin duplicado | Sin duplicado: se navega al detalle (no hay reenvío de formulario) | Sí |
| Botón atrás | Volver a Nueva solicitud tras crearla | Formulario limpio | Limpio (el borrador se borra al crear) | Sí |
| Sesión vencida al guardar | Guardar con la sesión vencida | Aviso sin perder datos | Aviso y datos conservados (2.114.1) | Sí (sin prueba manual) |
| Dos pestañas, misma solicitud | Transición en ambas | Una gana | La segunda recibe 409 | Sí |
| Dos pestañas, venta y entrega | Mismo equipo | Una gana | **Ambas pueden ganar** | No (7.A-1) |
| Registro que ya no existe | `PUT /api/activos/<id borrado>` | 404 | 404 | Sí |
| Borrar algo en uso | Borrar un activo con historial | 409 | 409 (se da de baja, SPEC 2.7.7) | Sí |
| Borrar un tipo de mantención en uso | Tipo con mantenciones | 409 | 409 | Sí |
| Archivo vacío | `.xlsx` de 0 bytes | 400 | 400 ("El archivo está vacío") | Sí |
| Archivo muy grande | 20 MB | 413 | 413 | Sí |
| Extensión falsa | `.exe` renombrado a `.xlsx` | 400 | 400 (firma de Excel) | Sí |
| Demasiadas filas | 6.000 filas | 400 claro | 400 ("Divídelo en partes") | Sí |

### Fallos más probables que vería un usuario real
1. **Un técnico ve datos de personas de otra sede en Compras** (1.1). Corrección: el mismo filtro que ya tiene el detalle.
2. **Doble clic desde dos pestañas al completar una mantención** deja dos cierres en el historial; y, excepcionalmente, vender y entregar el mismo equipo a la vez deja un equipo vendido con asignación (7.A-1). Corrección: el mismo patrón de las entregas.
3. **Búsquedas lentas en Despachos y Solicitudes con el tiempo** (3.1).
4. **Campos que no se anuncian con lector de pantalla** en Editar empleado y Nueva solicitud (6.1).
5. **Mensajes genéricos** ("Algún dato enviado no es válido") ante una fecha de activo mal escrita vía API (7.A-3); y una fecha inválida enviada por API borra la guardada (7.A-2).

---

## ENTREGA FINAL

### 1. Resumen ejecutivo
La aplicación está en **buen estado**. La autenticación, la autorización por matriz, el aislamiento por sede, la validación en el servidor y las protecciones de concurrencia de los flujos principales son sólidas y están documentadas en la SPEC. No se encontraron vulnerabilidades críticas ni altas: no hay inyección SQL ni XSS explotable, y `npm audit` está en 0.

**¿Lista para producción? Con condiciones.**
1. Corregir los 2 hallazgos medios de datos: la fuga 1.1 y las carreras 7.A-1 (y de paso el borrado de fechas vía API, 7.A-2). Son cambios pequeños con patrones que ya existen en el código.
2. Hacer las acciones manuales pendientes: rotar `NEXTAUTH_SECRET` en Vercel **antes** de desplegar (sin eso la app no arranca), cambiar las claves locales y aplicar la migración en Neon.
3. Ejecutar al menos una vez el test de concurrencia contra una base `_test` y el perfil `normal` de Locust contra un ambiente de pruebas, porque hoy ninguno de los dos se ha ejecutado.

Con el volumen real de SCL Consultores (decenas de usuarios), el rendimiento no es un bloqueo. Las mejoras de la Fase 4 importan si el sistema crece.

### 2. Los 15 hallazgos más importantes
| N° | Fase | Hallazgo | Severidad | Esfuerzo |
|---|---|---|---|---|
| 1 | 7 | Venta, baja y completar mantención con carrera (equipo vendido con asignación activa posible) | Media | Bajo |
| 2 | 1 | `GET /api/compras/[id]/activos` expone nombre y RUT de personas de otra sede | Media | Bajo |
| 3 | 7 | Fecha inválida enviada por API borra la fecha guardada de un empleado (la pantalla no lo permite) | Baja | Bajo |
| 4 | 1 | Sin límite de uso en exportar, PDF e importar | Media | Medio |
| 5 | 6 | Etiquetas sin unir a su campo en Editar empleado y Nueva solicitud | Media | Medio |
| 6 | 3 | Búsqueda en memoria en Despachos y Solicitudes | Media | Medio |
| 7 | 3 | La importación lee todas las series e IMEI en cada tanda | Media | Bajo |
| 8 | 5 | Piezas de seguridad sin pruebas (`privacidad` 43 %, `useEnvio` 0 %, `proxy` 0 %); 14 de 59 rutas probadas | Media | Medio |
| 9 | 4 | Test de concurrencia y prueba de carga nunca ejecutados | Media | Bajo |
| 10 | 2 | Entero enorme en Kit termina en 500 | Baja | Bajo |
| 11 | 7 | `observaciones` e `incidencia` sin largo máximo; teléfono sin formato | Baja | Bajo |
| 12 | 1 | CSP con `'unsafe-inline'` en scripts | Baja | Medio |
| 13 | 4 | Sin caché (PDF de solicitudes cerradas, KPI del dashboard) y sesión cada 30 s | Baja | Bajo |
| 14 | 3 | 5 dependencias, 4 componentes y 5 archivos públicos sin uso | Baja | Bajo |
| 15 | 2 | Sin alertas sobre los logs (bloqueos masivos, olas de errores) | Baja | Bajo |

### 3. Plan de acción
**Corregir de inmediato (1 a 2 días):**
- N° 1: reclamo con `updateMany` condicionado en venta, baja y completar mantención, con pruebas.
- N° 2: filtrar `empleadoActual` en `compras/[id]/activos`, con prueba.
- N° 3: `fechaOpcional` rechaza fechas inválidas, con prueba.
- N° 10 y 11: `.max` en enteros y textos, y formato de teléfono.

**Corregir antes de producción:**
- Acciones manuales: secreto en Vercel, claves locales, migración en Neon y parámetros de `DATABASE_URL`.
- N° 9: crear `inventario_it_test`, correr la integración y correr Locust `normal` y `pico` en staging.
- N° 4: cupo por usuario en exportar, PDF e importar; `maxDuration` en esas rutas.
- N° 8: pruebas de `privacidad`, `useEnvio`, `proxy` y de las rutas de venta, baja y completar.
- N° 7: series e IMEI solo de la tanda.
- N° 15: alertas sobre los logs en Vercel.

**Mejoras a futuro:**
- N° 5 y 6.2: etiquetas y tablas responsivas.
- N° 6: búsqueda en la base (con `unaccent` o una columna normalizada).
- N° 12: CSP con nonce.
- N° 13: caché de PDF y KPI; sesión cada 300 s.
- N° 14 y 3.4: limpiar dependencias y unificar la librería de Excel.
- CI: `format:check`, `knip`, `jscpd`, `npm audit` y reglas de complejidad.
- Dividir `solicitudes/nueva/page.tsx` (con pruebas de componente antes).
- Decisiones de negocio: MFA y actualizar Prisma 5 a 7.
