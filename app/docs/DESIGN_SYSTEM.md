# Sistema de diseño — Inventario IT SCL

Guía corta para que una pantalla nueva siga el mismo lenguaje visual sin
tener que leer el código de otras. Todo vive en `src/app/globals.css`
(tokens) y `src/shared/ui/` (componentes). SPEC 2.77 y 2.78.

## Regla principal

**Nunca uses colores fijos para superficies ni texto.** Nada de `bg-white`,
`text-gray-900`, `border-gray-200` ni hex sueltos. Usa los tokens
semánticos: cambian solos entre modo claro y oscuro.

## Tokens semánticos (siguen el tema)

| Clase | Uso | Claro | Oscuro |
|---|---|---|---|
| `bg-canvas` | Fondo de la app (el `body` ya lleva el gradiente radiant) | gris 50 | navy 17% |
| `bg-surface` | Tarjetas, tablas, modales, inputs | blanco | navy 21% |
| `bg-surface-muted` | Cabeceras de tabla, footers, hover de filas | gris 50 | navy 24% |
| `text-fg` | Texto principal, títulos | gris 900 | casi blanco |
| `text-fg-muted` | Texto secundario, descripciones | gris 600 | gris claro |
| `text-fg-subtle` | Ayudas, placeholders, metadatos | gris 500 | gris medio |
| `border-line` | Bordes y separadores (`divide-line` también) | gris 200 | navy 31% |
| `border-line-strong` | Bordes de inputs, bordes con más peso | gris 300 | navy 38% |

Un `border` sin color ya usa `line` por defecto.

## Colores fijos (iguales en ambos temas)

Para **rellenos sólidos con texto blanco encima**. La escala `primary-*`,
`red-*`, etc. se invierte en modo oscuro (ver abajo), así que un
`bg-primary-700 text-white` quedaría celeste claro con texto blanco.

| Clase | Uso |
|---|---|
| `bg-brand` / `hover:bg-brand-hover` | Botón primario, avatar, elementos sólidos de marca |
| `bg-navy` | Fondos de marca oscuros (login) |
| `bg-danger` / `hover:bg-danger-hover` | Botón destructivo |
| `bg-success` / `hover:bg-success-hover` | Botón de confirmación verde |
| `text-accent`, `bg-accent` | Naranjo de marca: indicadores, detalles (no texto largo) |

## Escalas de color (badges, avisos, íconos)

Las escalas de Tailwind (`emerald-*`, `amber-*`, `red-*`, `primary-*`…) se
pueden usar para estados. En modo oscuro se ajustan solas:

- **50–300** (fondos suaves de badges y avisos) → tintes translúcidos.
- **700–950** (texto de color) → tonos claros legibles.
- **400–600** no cambian: sirven como relleno sólido o ícono.
- Como **texto**, `text-*-600` usa el tono 700 de su escala (regla en `globals.css`, SPEC 2.158): así se lee en ambos temas.
- Solo se usan escalas con versión oscura (`paletaTemas.test.ts`): nada de `violet`, `indigo`, `fuchsia` ni `pink`.

Ejemplo correcto de badge: `bg-emerald-50 text-emerald-800 border-emerald-200`.
Mejor aún: usa `ESTADO_ACTIVO_BADGE` de `lib/constants/estadosActivo.ts`.

> Ojo: un fondo `bg-*-50` es translúcido en oscuro. Para algo que flota
> sobre el contenido (toast, popover), usa `bg-surface` o `card-feature`.

## Tonos semánticos — `lib/constants/tonos.ts`

`Tono = neutral | primary | success | warning | orange | danger`.

- `TONO_ACENTO[tono]` fija el color de una `card-feature`.
- `TONO_ESTILO[tono]` trae `{ valor, suave, icono }` para números, bloques
  suaves e íconos en círculo.
- `ESTADO_ACTIVO_TONO[estado]` da el tono de cada estado del activo. **El
  color de una tarjeta debe salir de un dato real**, no ser decorativo.

## Superficies y tarjetas

| Qué | Cómo |
|---|---|
| Panel de contenido (formulario, tabla, detalle) | utilidad `card` o `<Card>` |
| Tarjeta destacada (KPI, acceso a sección, resumen) | utilidad `card-feature` + `TONO_ACENTO`, o `<Card variant="feature" accent="success">` |
| Indicador numérico | `<StatCard label value tone icon />` dentro de `<StatGrid cols={n}>` |
| Inclinación 3D al hover | `tilt` en `StatCard`/`Card`, o envolver con `<Tilt>` |

`card-feature` pinta un halo radial y un círculo del color de acento en la
esquina superior derecha, con un borde que se tiñe hacia esa esquina. El
círculo crece al hover.

### Cuándo usar tilt

- **Sí:** filas de KPIs, secciones de Configuración, filtros por estado.
  Pocas tarjetas a la vez.
- **No:** listas o grillas grandes (vista de tarjetas de Activos, Kanban),
  ni formularios o paneles donde se escribe.

`<Tilt>` carga `vanilla-tilt` con `import()` dinámico (solo en las pantallas
que lo usan) y no se activa con `prefers-reduced-motion` ni en pantallas
táctiles. Dentro de un `Tilt`, los hijos directos de `card-feature` se
adelantan en Z al inclinar.

## Formularios

`field-label`, `field-input` (`field-input-sm` para compacto) y
`field-checkbox` en los elementos nativos. Ya siguen el tema.

## Componentes compartidos (`components/ui/`)

`Button` (variantes primary, secondary, outline, ghost, danger, link;
`buttonClasses()` para un `<Link>`), `PageHeader`, `StatCard`/`StatGrid`,
`Card`, `Tabs`/`NavTabs`, `Pagination`, `Badge` (`AssetStatusBadge`,
`AssetConditionBadge`, `ActiveBadge`), `Modal`, `ConfirmDialog`, `Toast`
(`useToast`), `Logo`, `ThemeToggle`, `Tilt`.

## Tema claro/oscuro

- El tema vive en `<html data-theme="light|dark">`. Lo fija un script en
  `<head>` (`lib/tema.ts`) antes de pintar: la preferencia guardada o, si
  no hay, la del sistema operativo.
- `ThemeToggle` (navbar y login) lo cambia y lo guarda.
- `dark:` existe pero es excepcional: si necesitas mucho `dark:`, falta un
  token.

## Gráficos

Recharts: las series usan `COLOR_MARCA` (`lib/constants/coloresGraficos.ts`)
y `ESTADO_ACTIVO_COLOR`. Ejes, grilla y tooltip se adaptan al tema desde
`globals.css`; no hace falta pasarles colores.

## Navegación

Un solo `components/layout/Navbar.tsx`: sticky, transparente arriba y con
fondo translúcido + blur al hacer scroll. Los ítems salen de la matriz de
permisos. Bajo 1280px pasa a un menú desplegable.
