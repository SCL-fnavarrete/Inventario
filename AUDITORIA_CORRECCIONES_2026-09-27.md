# Correcciones de la auditoría del 27-sep-2026

Inventario IT (SCL Consultores). Rama `fix/hallazgos-qa-interfaz`, correcciones del 27 y 28-sep-2026.
Las reglas que cambian están en la SPEC, sección **2.114**; aquí va el detalle por hallazgo.

**Sobre los números de hallazgo:** el informe original de la auditoría no está en el repositorio. La columna N° usa el ID de la auditoría cuando quedó citado en el código (F1-01, A01-1, R2…). Cuando no quedó, usa el número del plan de corrección (2.4, 2.5…) y la columna "ID auditoría" queda como **"por confirmar"**, para completarla con el informe a mano. No se inventaron IDs.

**Verificación final (28-sep-2026):** `tsc` sin errores, `eslint` sin avisos, 1.232 pruebas en verde con umbrales de cobertura cumplidos (3 de integración se saltan: ver 2.10) y `next build` correcto. Migración aplicada en la base local y `db:status` al día.

## Bloque 1: antes de producción (seguridad y concurrencia)

| N° | ID auditoría | Hallazgo | Problema | Solución aplicada | Archivos |
|---|---|---|---|---|---|
| 1 | F1-01 | Secreto de sesión débil y publicado | `NEXTAUTH_SECRET` corto y escrito en los README: con él se pueden fabricar cookies de sesión válidas | Secreto rotado en `.env` (44 caracteres) y retirado de los README. En producción la app no arranca con menos de 32 caracteres. El secreto ficticio del CI se alargó | `lib/auth.ts`, `README.md`, `app/README.md`, `.github/workflows/ci.yml` |
| 2 | F1-01 | IDs de usuarios del sistema en la API | Las respuestas de solicitudes traían el id interno de usuarios; junto con el secreto basta para fabricar una sesión | Nuevo `sinIdsDeUsuario` (quita `solicitanteId`, `responsableActualId`, `ejecutadoPorId`, `autorId`, `usuarioId`) y `select` sin `id` de personas | `lib/utils/privacidad.ts`, `api/solicitudes/**` |
| 3 | F1-02 | Administrador con clave por defecto | El seed creaba `admin123` y el login mostraba la pista | Seed con `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` y política de clave fuerte; se quita la pista; nuevo `.env.example`; se borran scripts sueltos con credenciales | `prisma/seed.ts`, `(auth)/login/page.tsx`, `.env.example`, `app/.gitignore`; borrados `test-auth.js`, `check-data.js`, `check-users.js`, `conteo_verificacion.js` |
| 4 | F1-03 | Base local expuesta | Postgres de Docker escuchaba en todas las interfaces con clave fija | Puerto `127.0.0.1:5433` y clave desde `POSTGRES_PASSWORD` | `docker-compose.yml`, `.env` |
| 5 | A01-1 | Entrega de equipos de otra sede | Un técnico podía entregar un equipo ajeno poniendo su id en la transición | `executeAssignment` exige la sede y trata lo ajeno como inexistente (404) | `lib/services/workflowExecutionService.ts` y sus 7 llamadas |
| 6 | A01-2 | Stock de Kit de otra sede | Se podía vaciar el stock de otra sede llamando a la API | `executeKitDelivery` exige la sede | `lib/services/workflowExecutionService.ts` |
| 7 | R1 | Doble transición o cancelación | Dos envíos simultáneos aplicaban la transición dos veces | Reclamo con `updateMany` condicionado a `estado` + `updatedAt`; el segundo recibe 409 | `api/solicitudes/[id]/transicion`, `api/solicitudes/[id]/cancelar` |
| 8 | R2 | Doble entrega del mismo equipo | Dos entregas a la vez dejaban dos asignaciones activas | La entrega reclama el equipo solo si sigue `disponible` (verifica `count`) | `lib/services/workflowExecutionService.ts` |
| 9 | R3 | Stock de Kit negativo | Dos entregas a la vez podían dejar el stock bajo 0 | Descuento con `cantidad >= pedida` en la misma sentencia | `lib/services/workflowExecutionService.ts` |
| 10 | por confirmar | Doble devolución | Dos devoluciones de la misma asignación reponían dos veces | `executeReturn` y `executeKitReturn` cierran con `updateMany` condicionado | `lib/services/workflowExecutionService.ts` |
| 11 | A08, B3 | `datosAccion` sin validar | Era un objeto libre leído con `as string[]`: un tipo inesperado daba 500 y una entrega "por Chilexpress" podía quedar sin OT | Esquema estricto (UUID, enums, fechas, largos) y coordinación completa exigida según el medio | `lib/validations/workflow.ts` |
| 12 | 5.1-A, 5.2-A, 5.2-C | Sin pruebas de lo anterior | `workflowExecutionService` tenía 0 % de cobertura y faltaban ramas | 23 pruebas del servicio, 3 de transición por sede y casos nuevos de estado, IMEI y workflow | `__tests__/lib/services/workflowExecution.test.ts`, `__tests__/api/transicionSede.test.ts` y otros |

## Bloque 2: antes de producción (robustez)

| N° | ID auditoría | Hallazgo | Problema | Solución aplicada | Archivos |
|---|---|---|---|---|---|
| 2.1 | P2 | Conexión a Neon sin parámetros | Sin `sslmode`, `pgbouncer` ni límite de conexiones por instancia | Documentados `sslmode=require&pgbouncer=true&connection_limit=3&pool_timeout=20` | `app/docs/DEPLOYMENT.md` |
| 2.2 | 6.1 | Páginas de error genéricas | Next mostraba sus páginas en inglés y sin menú | `error.tsx` (con `retry`), `loading.tsx`, `not-found.tsx` y `global-error.tsx` en español | `app/(dashboard)/*`, `app/not-found.tsx`, `app/global-error.tsx` |
| 2.3 | 6.2 | Doble envío de formularios | Doble clic o Enter + clic enviaban dos veces | Hook `useEnvio` con candado en un ref, aplicado en 6 pantallas | `hooks/useEnvio.ts`, Usuarios, Sedes, Tipos de mantención, Kit/EPP, Catálogos |
| 2.4 | por confirmar | Importación sin límites | `sheets` no validaba nada; `preview` aceptaba MIME **o** nombre; sin tope de filas; una consulta por fila | Validador común (5 MB, vacío, extensión y firma de Excel); tope de 5.000 filas sin truncar; búsqueda de empleados de una vez; envío en tandas de 200 con barra de avance | `lib/importacion/validarArchivo.ts`, `leerExcel.ts`, `procesarFila.ts`, `api/activos/importar/*`, `activos/importar/page.tsx` |
| 2.5 | por confirmar | Datos sucios | Textos de puros espacios pasaban; fechas en orden imposible; `fechaBaja` editable a mano | `.trim()` en textos obligatorios; término ≥ ingreso y garantía ≥ compra (también al editar, contra lo guardado y en equipos de compras); `fechaBaja` fuera de alta y edición | `lib/validations/{asset,employee,kitItem,workflow,purchase,ordenFechas}.ts`, `api/activos/[id]`, `api/empleados/[id]`, `activoService.ts` |
| 2.6 | por confirmar | Bloqueo de login esquivable | Intentos simultáneos pasaban antes de anotarse; `x-forwarded-for` se podía inventar; bloqueo solo por correo permitía dejar fuera al dueño; sin tope de largo de clave | Intento anotado antes de comparar; correo + IP con tope global 4x; IP solo en Vercel o con `TRUST_PROXY`; clave de 200 como máximo | `lib/auth.ts`, `lib/services/accesoService.ts` |
| 2.7 | por confirmar | Sin logs en producción y cabeceras débiles | El logger no escribía nada en producción; sin CSP ni HSTS; CORS abierto con credenciales | `error`/`warn` en JSON siempre; log del fallo de lista negra; CSP (solo páginas), HSTS, `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, sin `X-Powered-By` ni CORS | `lib/logger.ts`, `api/auth/[...nextauth]`, `next.config.ts` |
| 2.8 | por confirmar | Pérdida de lo escrito al vencer la sesión | Un 401 recargaba la página y se perdía el formulario | Borrador de Nueva Solicitud en `sessionStorage`; un guardado con 401 avisa y conserva el formulario | `hooks/useBorrador.ts`, `solicitudes/nueva/page.tsx`, `SessionProvider.tsx` |
| 2.9 | por confirmar | Reglas de negocio incompletas | Equipos importados "asignados" a desvinculados; traslado de sede con equipos; reactivar desvinculados desde Editar; creación en sedes desactivadas; carrera en "último admin"; número de solicitud leyendo todo el año | Error de fila `empleado_desvinculado`; traslado bloqueado con equipos o a sede inactiva; reactivación solo por Onboarding; sede activa para lo que nace en ella; transacción con `pg_advisory_xact_lock`; máximo calculado en SQL | `procesarFila.ts`, `api/empleados/[id]`, `lib/queries/sedes.ts`, `api/usuarios/[id]`, `lib/services/numeroSolicitud.ts` |
| 2.10 | por confirmar | Concurrencia sin probar contra la base | Las pruebas unitarias simulan la base | Test de integración de entregas, devoluciones y stock simultáneos (solo con base `_test`) | `__tests__/integracion/concurrencia.int.test.ts` |
| 2.11 | por confirmar | Índices faltantes | Consultas frecuentes sin índice; un equipo podía repetirse en una compra | `UNIQUE (purchase_id, asset_id)` y 6 índices | `prisma/schema.prisma`, migración `20260928000000_indices_auditoria` |
| 2.12 | por confirmar | Datos de personas de otra sede en Compras | Un técnico veía nombre y RUT de quien tiene equipos de otra sede | `empleadoActual = null` en equipos ajenos para no admin | `api/compras/[id]/route.ts` |
| 2.13 | por confirmar | Accesibilidad | Errores no anunciados, campos sin unir a su mensaje, 28 botones de solo ícono sin nombre | `role="alert"`, `aria-describedby`, `aria-label` en español | `ApiErrorSummary.tsx`, `CampoFormulario.tsx`, 10 pantallas |
| 2.14 | por confirmar | Sin prueba de carga | No había forma de medir el techo de la aplicación | Locustfile con perfiles normal, pico, estrés y resistencia | `app/scripts/carga/locustfile.py` |
| Extra | por confirmar | Paginación sin tope | `GET /api/guias-despacho` aceptaba `limit=1000000` | `leerPaginacion` compartido (tope 100; 500 en activos) | `lib/utils/paginacion.ts`, 4 rutas |
| Extra | por confirmar | Rutas retiradas sin sesión | Dos stubs 410 respondían sin pedir sesión | Se borran; el test de rutas protegidas ya no admite excepciones 410 | `api/asignaciones/[id]/acta` (borrada), `api/empleados/[id]`, `rutas-protegidas.test.ts` |

## Pendientes justificados

| Pendiente | Por qué no se hizo ahora |
|---|---|
| Correr el test de concurrencia (2.10) | Necesita una base de pruebas aparte (`inventario_it_test`); no se creó sin permiso. Los pasos están al inicio del archivo del test. Hasta que se corra, no está comprobado de punta a punta |
| Correr la prueba de carga (2.14) | Este equipo no tiene Python. Debe correrse contra un ambiente de pruebas, nunca contra producción sin avisar |
| Prueba de dos transiciones simultáneas contra la base | Requiere pasar por la ruta completa con sesión y máquina de estados; el 409 ya lo cubren pruebas unitarias (R1) |
| Probar en navegador el borrador y el aviso de sesión vencida | Cubierto por pruebas automáticas, no por una prueba manual con una sesión vencida real |
| Subir Prisma 5 → 7 | Cambio mayor con riesgo en todas las consultas; merece su propio trabajo y pruebas |
| Autenticación de dos factores (MFA) | Cambia el flujo de inicio de sesión de todos los usuarios; requiere decisión de negocio |
| Dividir `solicitudes/nueva/page.tsx` (2.593 líneas) | Refactor grande de la pantalla más crítica; sin beneficio para el usuario en esta etapa |
| Bloque 3 (caché, dependencias sin uso, CI más estricto, partes de acta compartidas, etc.) | Son mejoras, no fallas; van en commits aparte |
| Completar la columna "ID auditoría" | Falta el informe original de la auditoría |

## Acciones manuales pendientes

1. **Rotar `NEXTAUTH_SECRET` en Vercel** y en cualquier otro ambiente desplegado (el anterior estaba publicado en los README). Rotarlo cierra todas las sesiones abiertas.
2. **Cambiar la clave de la base local:** `docker exec -it inventario_postgres psql -U inventario -d inventario_it_dev -c "ALTER USER inventario PASSWORD 'nueva';"`, actualizar `POSTGRES_PASSWORD`, `DATABASE_URL` y `DATABASE_URL_UNPOOLED` en `app/.env`, y `docker compose up -d` para recrear el contenedor escuchando solo en `127.0.0.1`.
3. **Cambiar la clave del administrador local**, que sigue siendo `admin123`, desde Configuración > Usuarios.
4. **Reiniciar `next dev` y correr `npx prisma generate`** desde `app/`: el motor de Prisma no se pudo regenerar mientras el servidor lo tenía abierto.
5. **Aplicar la migración en producción** con `npm run db:migrate:prod` al desplegar.
