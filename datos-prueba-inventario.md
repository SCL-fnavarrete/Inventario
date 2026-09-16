# Datos de prueba — Inventario IT SCL

*Actualizado al 15-sep-2026, después de las migraciones (SPEC 2.39 y 2.40).*

Todos los RUT tienen dígito verificador válido — el sistema lo comprueba de
verdad, y con uno inventado al azar el formulario te lo rechaza.

> **Antes de empezar**, asegúrate de haber corrido las migraciones:
> `npx prisma migrate dev` y `npx prisma generate`. Y conviene borrar lo que
> dejé yo probando: el notebook `SERIE-TEST-001`, los artículos "Mochila
> corporativa" y "Casco de prueba", la factura `F-00999` y el usuario
> `tecnico.ccp@sclconsultores.com`.

**Qué cambió respecto de la versión anterior de este documento:** el correo
obligatorio del empleado ahora es el **de empresa** (el personal quedó
opcional); el **tipo de contrato es opcional**, así que puedes dejarlo en
blanco a propósito para ver cómo se comporta; el campo **código interno ya no
existe**; el **nombre del equipo en la red** ya no se pide al crear el activo,
sino al asignarlo; y el estado **reutilizable desapareció** — al devolver un
equipo en buen estado debe quedar en *disponible*.

---

## 1. Empleados

En **Activos → Personal → Nuevo**.

| # | Nombres | Ap. Paterno | Ap. Materno | RUT | Correo empresa (obligatorio) | Cargo | Contrato | Sede |
|---|---|---|---|---|---|---|---|---|
| 1 | Camila Andrea | Rojas | Fuentes | 12.345.678-5 | crojas@sclconsultores.com | Analista de Soporte | contrato | Santiago |
| 2 | Matías Ignacio | Sepúlveda | Moya | 9.876.543-3 | msepulveda@sclconsultores.com | Ingeniero de Redes | *(déjalo vacío)* | Santiago |
| 3 | Valentina Paz | Cárdenas | Llanos | 17.654.321-3 | vcardenas@sclconsultores.com | Operadora de Monitoreo | boleta | Concepción |
| 4 | Diego Alonso | Fuenzalida | Bravo | 21.098.765-7 | dfuenzalida@sclconsultores.com | Técnico N1 | contrato | Concepción |
| 5 | Francisca Belén | Aguilar | Ortiz | 15.432.198-5 | faguilar@sclconsultores.com | Jefa de Proyecto | contrato | Santiago |
| 6 | Sebastián Andrés | Vergara | Ríos | 18.765.432-7 | svergara@sclconsultores.com | Consultor SAP | boleta | Perú |

A Matías déjalo **sin tipo de contrato** a propósito: es el caso que queremos
verificar ahora que el campo es opcional. Debe guardarse sin protestar, y su
ficha debe mostrar algo razonable en vez de romperse.

El correo personal es opcional: puedes llenarlo en uno o dos y dejarlo vacío en
el resto, que es como van a llegar los datos reales del import.

Para probar los mensajes de error por campo: intenta guardar uno sin correo de
empresa, o con un RUT de dígito cambiado (`12.345.678-9`). El cartel debe decir
qué campo falló y por qué.

---

## 2. Activos

En **Activos → Nuevo**. Fíjate que ya no aparecen los campos "Código Interno"
ni "Nombre del Equipo" — eso es lo esperado.

| # | Categoría | Marca | Modelo | N° Serie | Condición | Sede | Especificaciones |
|---|---|---|---|---|---|---|---|
| 1 | Notebook | Lenovo | ThinkPad E14 Gen 4 | PF3XA91K | Nuevo | Santiago | i5-1235U, 16 GB, 512 GB |
| 2 | Notebook | HP | ProBook 440 G9 | 5CG3120XYZ | Usado | Santiago | i7-1255U, 16 GB, 512 GB |
| 3 | Notebook | Asus | Vivobook X1404ZA | S2N0CX01D99101 | Nuevo | Concepción | i5-1235U, 16 GB |
| 4 | Celular | Samsung | Galaxy A54 | R58T90ABCD1 | Nuevo | Santiago | IMEI 353912104567891 |
| 5 | Monitor | Dell | P2422H | CN0D7X2411 | Usado | Concepción | 24 pulgadas |
| 6 | Notebook | Dell | Latitude 3520 | 7KJ2LM3 | Usado | Perú | Para probar la sede Perú |

Un caso para provocar el error de duplicado: intenta crear un séptimo activo
repitiendo la serie `PF3XA91K`. Debe responder nombrando el campo.

En la lista, la columna que antes decía "Código/Serie" ahora es **"N° Serie"** y
muestra la serie como dato principal.

---

## 3. Kit de Bienvenida y EPP

En **Activos → Kit de Bienvenida** y **Activos → EPP**.

**Kit de Bienvenida**

| Artículo | Stock | Stock mínimo | Sede |
|---|---|---|---|
| Mochila corporativa | 15 | 5 | Santiago |
| Set de bienvenida (libreta + lápiz) | 30 | 10 | Santiago |
| Mochila corporativa | 8 | 5 | Concepción |

**EPP**

| Artículo | Stock | Stock mínimo | Sede |
|---|---|---|---|
| Casco de seguridad | 12 | 4 | Concepción |
| Chaleco reflectante talla M | 20 | 6 | Concepción |
| Zapatos de seguridad talla 42 | 6 | 8 | Santiago |

Los zapatos quedan **bajo el mínimo** a propósito (6 de 8), para que veas la
alerta de stock bajo en el Dashboard.

Prueba también crear uno con el menú filtrando por una sede y guardándolo en
otra: debe aparecer el aviso explicando dónde quedó, en vez de desaparecer sin
decir nada.

---

## 4. Compra

En **Compras → Nueva**.

- N° Factura: `F-12045`
- Fecha: la de hoy — **y verifica que la fecha que muestra después sea la misma
  que ingresaste**, no la del día anterior
- RUT proveedor: `11.223.344-K`
- Orden de compra: `OC-2026-0088`
- Sede: Santiago
- Vincula los activos 1 y 4
- Kit/EPP: 10 "Mochila corporativa" y 5 "Set de bienvenida"

El stock de mochilas debe subir de 15 a 25. Después desvincula esa línea y debe
volver a 15 — y la confirmación ahora debe ser un cartel dentro de la página,
no un cuadro del navegador.

---

## 5. Recorrido por módulo

Lo importante no es cargar datos, sino recorrer los flujos que nunca se
probaron.

**Asignaciones — primera asignación.** Asigna el activo 1 a Camila Rojas,
creando una Solicitud (onboarding, con Camila como empleado ya existente y el
activo 1 elegido de una). *(Ya no hay botón "Descargar Acta" aquí ni en el
detalle de la asignación — se sacó el 15-sep, SPEC 2.41. No hay nada que
generar en este paso.)*

**Pendiente (16-sep-2026, sin resolver a propósito, Javier: "dejémoslo
pendiente de momento"):** el campo "Nombre del equipo en la red" con
autosugerencia `SCL-<inicial><apellido>` quedó sin ningún lugar donde
pedirse al asignar. El formulario que lo tenía (`AsignarActivoForm`) nunca se
conectó a ninguna pantalla, y Solicitudes -- que es por donde se asigna todo
ahora, el Kanban de Activos redirige ahí -- no lo pide. Por ahora, si quieres
dejarlo registrado, se completa después entrando a **Editar** el activo ya
asignado.

**Asignaciones — segunda asignación.** Asigna el notebook Asus Vivobook
X1404ZA (serie `S2N0CX01D99101`, activo 3) a Diego Fuenzalida (debe
autosugerir `SCL-DFUENZALIDA`). Para devolverlo, **ya no existe un botón
directo de devolución** — ni en la tabla de Asignaciones, ni en el detalle, ni
en la ficha de Diego (los seis puntos de entrada se sacaron el 15-sep, SPEC
2.41: una devolución solo puede pasar dentro de una Solicitud). Para probar
que el Vivobook quede en **"Baja"**, créale a Diego una Solicitud de **cambio
de equipo**, ejecútala marcando el activo devuelto como dañado, y verifica que
termine en Baja y el equipo nuevo quede asignado. Para probar el camino a
**"Disponible"**, hazlo con una devolución en buen estado dentro de esa misma
solicitud de cambio, o dentro de una desvinculación.

**Cambio de equipo de Diego -- necesita stock de reemplazo primero (16-sep-2026).**
El Vivobook (activo 3) es el **único notebook que hay en Concepción**; desde
SPEC 2.45 elegir el reemplazo es obligatorio para crear el ticket, así que sin
un segundo notebook en esa sede `SeleccionarCambioEquipo` avisa que no hay
stock y la solicitud no se deja crear. Antes de probar el cambio, crea un
activo 7:

| # | Categoría | Marca | Modelo | N° Serie | Condición | Sede | Especificaciones |
|---|---|---|---|---|---|---|---|
| 7 | Notebook | Lenovo | ThinkPad E14 Gen 4 | PF4XB77K | Nuevo | Concepción | i5-1235U, 16 GB, 512 GB |

Con ese stock disponible, ve a **Solicitudes → Nueva → Cambio de Equipo**,
elige a Diego: la Sede queda sola en Concepción y de solo lectura (SPEC 2.45).
En "Equipo a cambiar" selecciona el Vivobook como equipo viejo, márcalo
dañado (para que termine en Baja) y elige el activo 7 como reemplazo. La
tarjeta "Coordinar Entrega del Reemplazo" ya se muestra apenas eliges a Diego,
sin esperar a que termines la selección (SPEC 2.46) -- complétala (Presencial
o Despacho Chilexpress, fecha, lugar u OT+ciudad) y envía. Verifica que el
Vivobook quede en Baja y el activo 7 asignado a Diego.

**Mantenciones.** Programa una preventiva del activo 2 para dentro de un mes, y
otra con fecha ya vencida para que dispare la alerta del Dashboard. Ciérrala con
resultado y costo.

**Guías de Despacho.** Crea una guía de traslado de Santiago a Concepción con el
activo 5. Recíbela y verifica que la sede del activo cambió — es la única vía
por la que un activo cambia de sede.

**Solicitudes (workflow).** El módulo menos probado y el más importante ahora,
porque acá está el arreglo del filtro por sede. Crea un onboarding **para la
sede Concepción** y comprueba que al elegir equipos y Kit/EPP **solo te ofrezca
inventario de Concepción**, aunque tengas Santiago puesto en el selector del
menú. Ese era el bug. Avanza la solicitud por sus estados, entrega kit (debe
descontar del stock de Concepción, no de Santiago) y agrega un comentario.
Después crea una de cambio de equipo y una de desvinculación.

**Desvinculaciones.** Desvincula a Valentina Cárdenas. Debe pedir la devolución
de sus equipos. Genera el reporte RRHH en PDF: fíjate que el correo y el tipo de
contrato salgan bien incluso en el empleado que dejaste sin contrato.

**Reportes.** Exporta inventario, empleados, RRHH, obsoletos y stock. Revisa que
las fechas estén correctas, que ya no aparezca ninguna columna de
"Reutilizables", y que si tienes una sede filtrada el archivo la respete.

---

## 6. Qué mirar mientras pruebas

Tres cosas, porque son donde aparecieron los defectos anteriores:

Que las **fechas** que muestra la pantalla sean las que ingresaste, sin correrse
un día — en pantalla, en los PDF y en los Excel.

Que los **contadores y totales** coincidan con las tablas, sobre todo al cambiar
de sede en el selector del menú, y que el Dashboard no diga "Sin Stock" cuando
hay equipos devueltos disponibles.

Que cuando algo falle, el error diga **qué campo** y **por qué**, y que ya no
aparezca ningún cuadro de diálogo del navegador.

Anota cualquier cosa rara aunque parezca menor: varios de los hallazgos
anteriores salieron de detalles que a primera vista parecían cosméticos.
