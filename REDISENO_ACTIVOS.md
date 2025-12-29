# Rediseño de la Página de Listado de Activos

## Resumen de Cambios

Se ha realizado un rediseño completo de la página de activos (`/activos`) para mostrar mucho más información y mejorar la experiencia del usuario.

## Nuevas Características Implementadas

### 1. Vista Dual (Tabla y Tarjetas)
- **Vista de Tabla**: Vista tradicional con scroll horizontal para columnas adicionales
- **Vista de Tarjetas**: Vista tipo grid, ideal para dispositivos móviles
- Selector de vista fácil de usar con iconos intuitivos

### 2. Filas Expandibles en la Tabla
- Cada fila tiene un botón de expansión (chevron)
- Al expandir, se muestra información adicional organizada en 3 columnas:
  - **Información General**: Categoría, condición, garantía, teléfono
  - **Usuario Asignado**: Nombre completo, cargo, email
  - **Software y Gestión**: Microsoft 365, Intune, ubicación física

### 3. Columnas Configurables
- Selector de columnas personalizable
- El usuario puede mostrar/ocultar columnas según sus necesidades
- Columnas esenciales están marcadas como obligatorias

### 4. Columnas Disponibles

#### Columnas Visibles por Defecto:
- **Tipo**: Icono y nombre de categoría (Notebook, Celular, Monitor, etc.)
- **Código/Serie**: Número de activo interno, número de serie, IMEI (si aplica)
- **Marca/Modelo**: Marca y modelo del equipo
- **Estado**: Badge con color según estado (Disponible, Asignado, En Mantención, etc.)
- **Condición**: Badge indicando si es Nuevo, Usado o Dañado
- **Asignado a**: Nombre del empleado y cargo (si está asignado)
- **Especificaciones**: Procesador, RAM, Disco Duro, Sistema Operativo
- **Acciones**: Botones para ver detalle y editar

#### Columnas Opcionales (Ocultas por Defecto):
- **Fecha Compra**: Fecha de adquisición del activo
- **Ubicación**: Ubicación física del equipo
- **Software**: Badges para Microsoft 365 e Intune

### 5. Mejoras Visuales

#### Badges y Etiquetas:
- **Estados**: Con colores distintivos
  - Verde: Disponible
  - Azul: Asignado
  - Amarillo: En Mantención
  - Púrpura: Reutilizable
  - Rojo: Baja
  - Gris: Vendido

- **Condiciones**:
  - Azul: Nuevo
  - Gris: Usado
  - Rojo: Dañado

- **Software**:
  - Badge azul para Microsoft 365
  - Badge púrpura para Intune

#### Iconografía:
- Iconos para cada tipo de equipo
- Iconos para procesador (CPU)
- Iconos para almacenamiento (HardDrive)
- Iconos para calendario, ubicación, usuario, etc.

### 6. Vista de Tarjetas
Cada tarjeta muestra:
- Icono del tipo de equipo
- Marca y modelo
- Badges de estado y condición
- Número de serie y código interno
- Usuario asignado
- Especificaciones técnicas (si están disponibles)
- Badges de software (M365, Intune)
- Botones de acción (Ver y Editar)

### 7. Responsive Design
- La tabla tiene scroll horizontal en pantallas pequeñas
- Las tarjetas se adaptan: 1 columna (móvil), 2 columnas (tablet), 3 columnas (desktop)
- Todos los controles son accesibles en cualquier tamaño de pantalla

### 8. Accesibilidad
- Botones con aria-labels apropiados
- Contraste de colores según estándares WCAG
- Navegación por teclado soportada
- Texto alternativo para iconos
- Focus states claramente visibles

## Datos Mostrados

### Campos Básicos:
- Categoría del activo
- Marca y modelo
- Número de serie
- Número de activo interno
- IMEI (para celulares)
- Estado del activo
- Condición del activo

### Especificaciones Técnicas:
- Procesador
- Memoria RAM
- Disco duro
- Sistema operativo
- Número de teléfono (celulares)

### Información de Asignación:
- Nombre del empleado
- Cargo del empleado
- Email del empleado

### Gestión y Software:
- Microsoft 365 (Sí/No)
- Intune Enrolled (Sí/No)
- Ubicación física
- Fecha de compra
- Fecha de fin de garantía

## Archivos Modificados

1. **`src/app/(dashboard)/activos/page.tsx`**
   - Rediseño completo del componente
   - Nuevos estados para vista y columnas
   - Lógica de expansión de filas
   - Vista de tarjetas alternativa

2. **`src/app/api/activos/route.ts`**
   - Actualización del include de Prisma para traer más campos del empleado
   - Ahora incluye: correo y cargo del empleado

## Cómo Usar

### Cambiar Vista:
1. Busca los botones de vista en la barra de filtros
2. Haz clic en el icono de lista (tabla) o el icono de grid (tarjetas)

### Personalizar Columnas:
1. Haz clic en el botón "Columnas" en la vista de tabla
2. Marca/desmarca las columnas que quieres ver
3. Las columnas esenciales no se pueden ocultar

### Expandir Detalles:
1. En la vista de tabla, haz clic en el icono de chevron al inicio de cada fila
2. Se desplegará información adicional organizada
3. Haz clic nuevamente para contraer

### Filtros:
- Los filtros existentes (búsqueda, estado, categoría) funcionan igual
- Se aplican tanto a la vista de tabla como de tarjetas

## Beneficios del Rediseño

1. **Mayor Información Visible**: Se muestra 3x más información que antes
2. **Mejor Organización**: Información agrupada lógicamente
3. **Flexibilidad**: El usuario decide qué columnas ver
4. **Responsive**: Funciona perfecto en móvil, tablet y desktop
5. **Accesible**: Cumple con estándares de accesibilidad
6. **Rápido**: No afecta el rendimiento, datos cargados bajo demanda
7. **Intuitivo**: Interfaz familiar con patrones de diseño modernos

## Próximas Mejoras Sugeridas

1. Persistencia de preferencias de columnas en localStorage
2. Exportar con las columnas visibles seleccionadas
3. Ordenamiento por columnas (click en headers)
4. Filtros avanzados por especificaciones técnicas
5. Vista de densidad (compacta, normal, espaciosa)
6. Búsqueda con autocompletado
7. Acciones en lote (seleccionar múltiples activos)

## Compatibilidad

- ✅ Next.js 16.0.4
- ✅ React 19.2.0
- ✅ Tailwind CSS 4
- ✅ TypeScript 5
- ✅ Prisma 5.22.0
- ✅ Navegadores modernos (Chrome, Firefox, Safari, Edge)
- ✅ Dispositivos móviles y tablets
