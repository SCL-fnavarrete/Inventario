import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { sclStyles as styles } from '@/shared/pdf/pdfSclBrand';

/** Una fila de la tabla de lineas de un acta o comprobante. */
export type FilaLineaActa = {
  numero: string;
  tipoChip: string;
  operador: string;
  /** El celular donde esta la linea, o "Persona (eSIM)". */
  ubicacion: string;
  /** Que paso con la linea en esta solicitud ("Asignada", "Devuelta con el celular"...). */
  movimiento: string;
};

const ANCHO = { numero: '20%', tipo: '15%', operador: '15%', ubicacion: '26%', movimiento: '24%' } as const;

const CELDA_COMPACTA = { fontSize: 8, padding: 3, lineHeight: 1.25 } as const;

// Igual que en la tabla de equipos: nunca corta una palabra con guion.
const palabraEntera = (palabra: string) => [palabra];

/**
 * Lineas telefonicas que se entregaron, cambiaron o devolvieron en la
 * solicitud (SPEC 2.143). Va debajo de la tabla de equipos en el Comprobante de
 * Entrega, el de Cambio y el Acta de Devolucion; sin filas, no se imprime.
 */
export function TablaLineasActa({
  titulo,
  filas,
  compacta = false,
}: {
  titulo: string;
  filas: FilaLineaActa[];
  compacta?: boolean;
}) {
  if (filas.length === 0) return null;
  const celda = compacta ? CELDA_COMPACTA : {};
  const margenFinal = compacta ? 12 : styles.table.marginBottom;
  const centrada = { textAlign: 'center' } as const;

  return (
    <>
      <Text style={styles.equipLabel}>{titulo}</Text>
      <View style={[styles.table, { marginBottom: margenFinal }]}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, celda, { width: ANCHO.numero }]}>Línea</Text>
          <Text style={[styles.tableHeaderCell, celda, { width: ANCHO.tipo }]}>Tipo de chip</Text>
          <Text style={[styles.tableHeaderCell, celda, { width: ANCHO.operador }]}>Operador</Text>
          <Text style={[styles.tableHeaderCell, celda, { width: ANCHO.ubicacion, textAlign: 'left' }]}>
            Celular / Persona
          </Text>
          <Text style={[styles.tableHeaderCell, celda, { width: ANCHO.movimiento }]}>Movimiento</Text>
        </View>
        {filas.map((fila, i) => (
          <View key={i} style={styles.tableRow} wrap={false}>
            <Text hyphenationCallback={palabraEntera} style={[styles.tableCell, styles.bold, celda, { width: ANCHO.numero, ...centrada }]}>
              {fila.numero}
            </Text>
            <Text hyphenationCallback={palabraEntera} style={[styles.tableCell, celda, { width: ANCHO.tipo, ...centrada }]}>
              {fila.tipoChip}
            </Text>
            <Text hyphenationCallback={palabraEntera} style={[styles.tableCell, celda, { width: ANCHO.operador, ...centrada }]}>
              {fila.operador}
            </Text>
            <Text hyphenationCallback={palabraEntera} style={[styles.tableCell, celda, { width: ANCHO.ubicacion }]}>
              {fila.ubicacion}
            </Text>
            <Text hyphenationCallback={palabraEntera} style={[styles.tableCell, celda, { width: ANCHO.movimiento, ...centrada }]}>
              {fila.movimiento}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}
