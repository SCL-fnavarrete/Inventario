# Datos de prueba — Inventario IT SCL

Todos los RUT de este documento tienen dígito verificador válido (el sistema lo
comprueba de verdad; con un RUT inventado al azar el formulario te lo rechaza).

Están pensados para ejercitar los cinco módulos que **todavía no se han
probado**: Solicitudes, Guías de Despacho, Mantenciones, Desvinculaciones y
Reportes.

> **Antes de empezar**: conviene borrar lo que dejé yo probando ayer — el
> notebook `SERIE-TEST-001`, los artículos "Mochila corporativa" y "Casco de
> prueba", la factura `F-00999` y el usuario `tecnico.ccp@sclconsultores.com`.

---

## 1. Empleados

Crear en **Activos → Personal → Nuevo**, o desde Empleados.

| # | Nombres | Ap. Paterno | Ap. Materno | RUT | Correo | Cargo | Contrato | Sede |
|---|---|---|---|---|---|---|---|---|
| 1 | Camila Andrea | Rojas | Fuentes | 12.345.678-5 | crojas@sclconsultores.com | Analista de Soporte | contrato | Santiago |
| 2 | Matías Ignacio | Sepúlveda | Moya | 9.876.543-3 | msepulveda@sclconsultores.com | Ingeniero de Redes | contrato | Santiago |
| 3 | Valentina Paz | Cárdenas | Llanos | 17.654.321-3 | vcardenas@sclconsultores.com | Operadora de Monitoreo | boleta | Concepción |
| 4 | Diego Alonso | Fuenzalida | Bravo | 21.098.765-7 | dfuenzalida@sclconsultores.com | Técnico N1 | contrato | Concepción |
| 5 | Francisca Belén | Aguilar | Ortiz | 15.432.198-5 | faguilar@sclconsultores.com | Jefa de Proyecto | contrato | Santiago |
| 6 | Sebastián Andrés | Vergara | Ríos | 18.765.432-7 | svergara@sclconsultores.com | Consultor SAP | boleta | Perú |

Si quieres probar el tope de caracteres o los mensajes de error por campo,
mete un cargo de más de 100 caracteres o un RUT con dígito cambiado
(`12.345.678-9`) y mira que el cartel diga exactamente qué campo falló.

---

## 2. Activos

Crear en **Activos → Nuevo**. Deja algunos disponibles para poder asignarlos
después.

| # | Categoría | Marca | Modelo | N° Serie | Condición | Sede | Notas |
|---|---|---|---|---|---|---|---|
| 1 | Notebook | Lenovo | ThinkPad E14 Gen 4 | PF3XA91K | Nuevo | Santiago | Procesador i5-1235U, 16 GB, 512 GB |
| 2 | Notebook | HP | ProBook 440 G9 | 5CG3120XYZ | Usado | Santiago | i7-1255U, 16 GB, 512 GB |
| 3 | Notebook | Asus | Vivobook X1404ZA | S2N0CX01D99101 | Nuevo | Concepción | i5-1235U, 16 GB |
| 4 | Celular | Samsung | Galaxy A54 | R58T90ABCD1 | Nuevo | Santiago | IMEI 353912104567891 |
| 5 | Monitor | Dell | P2422H | CN0D7X2411 | Usado | Concepción | 24 pulgadas |
| 6 | Notebook | Dell | Latitude 3520 | 7KJ2LM3 | Usado | Perú | Para probar la sede Perú |

Un caso a propósito para probar el error de duplicado: intenta crear un
séptimo activo repitiendo el N° de serie `PF3XA91K`. Debe responder que ya
existe, nombrando el campo.

---

## 3. Kit de Bienvenida y EPP

En **Activos → Kit de Bienvenida** y **Activos → EPP**. Ojo con el selector de
sede del menú: si creas en una sede distinta a la filtrada, ahora aparece el
aviso que agregamos.

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

Los zapatos quedan a propósito **bajo el mínimo** (6 de 8), para que veas la
alerta de stock bajo en el Dashboard.

---

## 4. Compra

En **Compras → Nueva**.

- N° Factura: `F-12045`
- Fecha: la de hoy
- RUT proveedor: `11.223.344-K`
- Orden de compra: `OC-2026-0088`
- Sede: Santiago
- Vincula los activos 1 y 4 de la tabla de arriba
- Agrega Kit/EPP: 10 "Mochila corporativa" y 5 "Set de bienvenida"

Verifica que el stock de mochilas suba de 15 a 25. Después desvincula la línea
de mochilas y comprueba que vuelva a 15.

---

## 5. Recorrido sugerido, por módulo

Lo importante no es cargar datos, sino recorrer los flujos que nunca se
probaron. En el orden en que tiene sentido hacerlo:

**Asignaciones.** Asigna el activo 1 a Camila Rojas y el activo 3 a Diego
Fuenzalida. Comprueba que el activo cambie a "Asignado" y que aparezca en la
ficha del empleado. Genera el acta de entrega en PDF y revisa que la fecha sea
la correcta (esto es lo que estaba fallando con el bug de fechas).

**Devoluciones.** Devuelve el activo 3, marcándolo como dañado. Debe quedar en
estado "Baja", no "Reutilizable" — esa regla está en la SPEC y conviene
confirmarla.

**Mantenciones.** Programa una mantención preventiva del activo 2 para dentro
de un mes, y otra con fecha ya vencida para que dispare la alerta del
Dashboard. Después ciérrala con resultado y costo.

**Guías de Despacho.** Crea una guía de traslado de Santiago a Concepción con
el activo 5. Recíbela y verifica que la sede del activo efectivamente cambió —
esa es la única vía por la que un activo cambia de sede.

**Solicitudes (workflow).** Es el módulo más complejo y el menos probado. Crea
un onboarding para un empleado nuevo, avánzalo por sus estados, agrega un
comentario y entrégale kit/EPP desde la solicitud (debe descontar stock).
Después crea una de cambio de equipo y una de desvinculación.

**Desvinculaciones.** Desvincula a Valentina Cárdenas. Debe pedir la devolución
de sus equipos y dejar registro.

**Reportes.** Exporta los reportes de inventario, empleados, RRHH y obsoletos.
Revisa que las fechas dentro de los Excel estén correctas y que, si tienes una
sede filtrada en el menú, el archivo respete ese filtro.

---

## 6. Qué mirar mientras pruebas

Más allá de que cada flujo funcione, vale la pena vigilar tres cosas, porque
son justo donde aparecieron los defectos de ayer:

Que las **fechas** que muestra la pantalla sean las que ingresaste, sin correrse
un día — en pantalla, en los PDF y en los Excel.

Que los **contadores y totales** coincidan con lo que muestran las tablas,
sobre todo al cambiar de sede en el selector del menú.

Que cuando algo falle, el error diga **qué campo** y **por qué**, en vez de un
"Datos inválidos" pelado.

Anota cualquier cosa rara aunque parezca menor y me la pasas; ayer varios de
los hallazgos salieron justamente de detalles que a primera vista parecían
cosméticos.
