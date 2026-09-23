import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { sclStyles as styles } from './pdfSclBrand';

/** Una fila de la tabla de equipos de un acta o comprobante. */
export type FilaEquipoActa = {
  equipo: string;
  marca: string;
  numeroSerie: string | null;
  /** Modelo y, si aplica, condicion del cargador. */
  descripcion: string;
  /** Especificaciones segun la categoria, una por linea (ver assetSpecs). */
  especificaciones: string;
  estado: string;
};

// Anchos de columna (suman 100%): el N° de serie es el dato que identifica
// el equipo fisico, por eso va en negrita y con ancho propio. react-pdf solo
// corta lineas en espacios: el ancho alcanza para series e IMEI de 15
// caracteres sin invadir la columna siguiente.
const ANCHO = {
  equipo: '12%',
  marca: '11%',
  serie: '21%',
  descripcion: '17%',
  especificaciones: '27%',
  estado: '12%',
} as const;

/**
 * Tabla de equipos compartida por el Comprobante de Entrega, el Acta de
 * Devolucion y el Comprobante de Cambio. El titulo de la ultima columna
 * cambia por documento ("Entregado", "Estado").
 */
export function TablaEquipoActa({
  titulo,
  columnaEstado,
  filas,
  compacta = false,
}: {
  titulo: string;
  columnaEstado: string;
  filas: FilaEquipoActa[];
  /** Menos espacio bajo la tabla, para documentos con dos tablas. */
  compacta?: boolean;
}) {
  return (
    <>
      <Text style={styles.equipLabel}>{titulo}</Text>
      <View style={[styles.table, compacta ? { marginBottom: 14 } : {}]}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { width: ANCHO.equipo }]}>Equipo</Text>
          <Text style={[styles.tableHeaderCell, { width: ANCHO.marca }]}>Marca</Text>
          <Text style={[styles.tableHeaderCell, { width: ANCHO.serie }]}>N° de Serie</Text>
          <Text style={[styles.tableHeaderCell, { width: ANCHO.descripcion, textAlign: 'left' }]}>
            Descripción de equipo
          </Text>
          <Text
            style={[styles.tableHeaderCell, { width: ANCHO.especificaciones, textAlign: 'left' }]}
          >
            Especificaciones
          </Text>
          <Text style={[styles.tableHeaderCell, { width: ANCHO.estado }]}>{columnaEstado}</Text>
        </View>
        {filas.map((fila, i) => (
          <View key={i} style={styles.tableRow} wrap={false}>
            <Text style={[styles.tableCell, { width: ANCHO.equipo, textAlign: 'center' }]}>
              {fila.equipo}
            </Text>
            <Text style={[styles.tableCell, { width: ANCHO.marca, textAlign: 'center' }]}>
              {fila.marca || '—'}
            </Text>
            <Text
              style={[
                styles.tableCell,
                styles.bold,
                { width: ANCHO.serie, textAlign: 'center', fontSize: 8.5 },
              ]}
            >
              {fila.numeroSerie || '—'}
            </Text>
            <Text style={[styles.tableCell, { width: ANCHO.descripcion }]}>
              {fila.descripcion || '—'}
            </Text>
            <Text style={[styles.tableCell, { width: ANCHO.especificaciones }]}>
              {fila.especificaciones || '—'}
            </Text>
            <Text style={[styles.tableCell, { width: ANCHO.estado, textAlign: 'center' }]}>
              {fila.estado}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}
