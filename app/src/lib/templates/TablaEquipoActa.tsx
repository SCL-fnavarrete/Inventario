import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { sclStyles as styles } from './pdfSclBrand';

/** Una fila de la tabla de equipos de un acta o comprobante. */
export type FilaEquipoActa = {
  equipo: string;
  marca: string;
  numeroSerie: string | null;
  /** Modelo del equipo. */
  descripcion: string;
  /** Especificaciones segun la categoria, una por linea (ver assetSpecs). */
  especificaciones: string;
  estado: string;
  /** Solo notebooks con cargador; va en una tabla aparte bajo la principal. */
  cargador: { condicion: string; observacion: string | null } | null;
};

const ANCHO_CARGADOR = { equipo: '40%', condicion: '25%', observacion: '35%' } as const;

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

// Modo compacto (documentos con dos tablas, como el Comprobante de Cambio):
// letra y celdas mas chicas para que todo quepa en una hoja.
const CELDA_COMPACTA = { fontSize: 8, padding: 3, lineHeight: 1.25 } as const;

/**
 * Tabla de equipos compartida por el Comprobante de Entrega, el Acta de
 * Devolucion y el Comprobante de Cambio. El titulo de la ultima columna
 * cambia por documento ("Entregado", "Estado"). Debajo va la tabla de
 * cargadores (TablaCargadorActa), salvo que el documento la ponga aparte.
 */
export function TablaEquipoActa({
  titulo,
  columnaEstado,
  filas,
  compacta = false,
  sinCargador = false,
}: {
  titulo: string;
  columnaEstado: string;
  filas: FilaEquipoActa[];
  /** Letra, celdas y margenes mas chicos, para documentos con dos tablas. */
  compacta?: boolean;
  /** El documento muestra los cargadores en una tabla aparte. */
  sinCargador?: boolean;
}) {
  const conCargador = !sinCargador && filas.some((f) => f.cargador);
  const margenFinal = compacta ? 12 : styles.table.marginBottom;
  const celda = compacta ? CELDA_COMPACTA : {};

  return (
    <>
      <Text style={styles.equipLabel}>{titulo}</Text>
      <View style={[styles.table, { marginBottom: conCargador ? 6 : margenFinal }]}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, celda, { width: ANCHO.equipo }]}>Equipo</Text>
          <Text style={[styles.tableHeaderCell, celda, { width: ANCHO.marca }]}>Marca</Text>
          <Text style={[styles.tableHeaderCell, celda, { width: ANCHO.serie }]}>N° de Serie / IMEI</Text>
          <Text
            style={[styles.tableHeaderCell, celda, { width: ANCHO.descripcion, textAlign: 'left' }]}
          >
            Descripción
          </Text>
          <Text
            style={[
              styles.tableHeaderCell,
              celda,
              { width: ANCHO.especificaciones, textAlign: 'left' },
            ]}
          >
            Especificaciones
          </Text>
          <Text style={[styles.tableHeaderCell, celda, { width: ANCHO.estado }]}>
            {columnaEstado}
          </Text>
        </View>
        {filas.map((fila, i) => (
          <View key={i} style={styles.tableRow} wrap={false}>
            <Text style={[styles.tableCell, celda, { width: ANCHO.equipo, textAlign: 'center' }]}>
              {fila.equipo}
            </Text>
            <Text style={[styles.tableCell, celda, { width: ANCHO.marca, textAlign: 'center' }]}>
              {fila.marca || '—'}
            </Text>
            <Text
              style={[
                styles.tableCell,
                styles.bold,
                celda,
                { width: ANCHO.serie, textAlign: 'center', fontSize: compacta ? 8 : 8.5 },
              ]}
            >
              {fila.numeroSerie || '—'}
            </Text>
            <Text style={[styles.tableCell, celda, { width: ANCHO.descripcion }]}>
              {fila.descripcion || '—'}
            </Text>
            <Text style={[styles.tableCell, celda, { width: ANCHO.especificaciones }]}>
              {fila.especificaciones || '—'}
            </Text>
            <Text style={[styles.tableCell, celda, { width: ANCHO.estado, textAlign: 'center' }]}>
              {fila.estado}
            </Text>
          </View>
        ))}
      </View>

      {conCargador && <TablaCargadorActa filas={filas} compacta={compacta} />}
    </>
  );
}

/**
 * Condicion del cargador, una fila por equipo que lo tiene registrado (se
 * identifica por su N° de serie). No renderiza nada si ninguno tiene.
 */
export function TablaCargadorActa({
  filas,
  compacta = false,
}: {
  filas: FilaEquipoActa[];
  compacta?: boolean;
}) {
  const conCargador = filas.filter((f) => f.cargador);
  if (conCargador.length === 0) return null;
  const celda = compacta ? CELDA_COMPACTA : {};

  return (
    <View
      style={{ width: '70%', marginBottom: compacta ? 12 : styles.table.marginBottom }}
      wrap={false}
    >
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, celda, { width: ANCHO_CARGADOR.equipo }]}>
          Cargador (N° de Serie)
        </Text>
        <Text style={[styles.tableHeaderCell, celda, { width: ANCHO_CARGADOR.condicion }]}>
          Condición
        </Text>
        <Text style={[styles.tableHeaderCell, celda, { width: ANCHO_CARGADOR.observacion }]}>
          Observación
        </Text>
      </View>
      {conCargador.map((fila, i) => (
        <View key={i} style={styles.tableRow}>
          <Text
            style={[
              styles.tableCell,
              styles.bold,
              celda,
              { width: ANCHO_CARGADOR.equipo, textAlign: 'center' },
            ]}
          >
            {fila.numeroSerie || fila.descripcion || '—'}
          </Text>
          <Text
            style={[
              styles.tableCell,
              celda,
              { width: ANCHO_CARGADOR.condicion, textAlign: 'center' },
            ]}
          >
            {fila.cargador!.condicion}
          </Text>
          <Text style={[styles.tableCell, celda, { width: ANCHO_CARGADOR.observacion }]}>
            {fila.cargador!.observacion || '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}
