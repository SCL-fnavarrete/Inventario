# GEMINI.md - Contexto de Desarrollo y Bitácora

Este archivo sirve como punto de anclaje para la IA (Gemini) y el desarrollador. Contiene el contexto técnico, las convenciones del proyecto y el historial de la sesión de trabajo actual.

## 1. Resumen del Proyecto
**Nombre:** Sistema de Control de Inventario IT
**Objetivo:** Gestión del ciclo de vida de activos tecnológicos (notebooks, celulares, periféricos), asignaciones a empleados, desvinculaciones y mantenciones.
**Plataforma:** Web App (Next.js) desplegada en Vercel/Railway.

## 2. Stack Tecnológico
- **Frontend/Backend:** Next.js 14+ (App Router)
- **Lenguaje:** TypeScript (Strict Mode)
- **Estilos:** Tailwind CSS + shadcn/ui
- **Base de Datos:** PostgreSQL
- **ORM:** Prisma
- **Autenticación:** NextAuth.js
- **Validación:** Zod

## 3. Reglas de Desarrollo (Branch: `gemini`)
1.  **Rama de Trabajo:** Todos los cambios se realizan en la rama `gemini`.
2.  **Protección de Main:** NO hacer merge a `main` sin instrucción explícita del usuario.
3.  **Ubicación de Código:** El código fuente principal está en la carpeta `/app`.
4.  **Schema de BD:** El archivo maestro es `app/prisma/schema.prisma`.

## 4. Estructura de Directorios Clave
- `/app`: Raíz de la aplicación Next.js.
    - `/app/src/app`: Páginas y rutas (App Router).
    - `/app/src/components`: Componentes React.
    - `/app/prisma/schema.prisma`: Definición de la Base de Datos (Source of Truth).
- `SPEC_SISTEMA_INVENTARIO_IT.md`: Especificaciones funcionales completas.

## 5. Comandos Operativos (dentro de `/app`)
- **Instalar dependencias:** `npm install`
- **Servidor desarrollo:** `npm run dev`
- **Base de Datos:**
    - Aplicar cambios (Dev): `npx prisma db push` o `npx prisma migrate dev`
    - Generar cliente: `npx prisma generate`
    - Studio (GUI): `npx prisma studio`

## 6. Bitácora de Cambios (Rama `gemini`)

### Sesión: Implementación "Caja Chica / Gastos Menores"
**Fecha:** 02 Enero 2026
**Objetivo:** Permitir el registro de compras menores, insumos y reembolsos sin requerir factura formal o proveedor registrado.

**Cambios Realizados:**
1.  **Base de Datos (`app/prisma/schema.prisma`):**
    - Se modificó el modelo `Purchase`.
    - Campos `supplierId` y `numeroFactura` ahora son opcionales (`?`).
    - Nuevos Enums agregados: `TipoCompra` (FACTURA, GASTO_MENOR) y `MetodoPago` (EFECTIVO, CAJA_CHICA, REEMBOLSO_PENDIENTE, etc.).
    - Nuevos campos agregados: `tipoCompra`, `metodoPago`, `descripcion`, `compradoPor`.

**Próximos Pasos (To-Do):**
- [ ] Crear página de listado de gastos: `/compras/gastos`.
- [ ] Crear formulario de "Registro Rápido de Gasto".
- [ ] Validar flujo de creación sin proveedor.
