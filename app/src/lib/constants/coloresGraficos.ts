/**
 * Colores de marca en hex para lo que no puede leer clases de Tailwind:
 * graficos SVG (Recharts) y celdas de Excel. Espejo de los tokens de
 * globals.css (@theme); si cambia la paleta, se cambia en ambos lados.
 */
export const COLOR_MARCA = {
  primario: '#0080b0', // --color-primary-600
  primarioOscuro: '#005a7d', // --color-primary-800
  acento: '#d88024', // --color-accent
  grisTexto: '#6b7280', // gray-500
} as const;
