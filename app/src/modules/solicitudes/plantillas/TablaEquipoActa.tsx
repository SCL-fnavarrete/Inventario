import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { sclStyles as styles } from '@/modules/solicitudes/plantillas/pdfSclBrand';

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
  /** Solo equipos con cargador registrado; va en su propia fila, justo bajo el equipo. */
  cargador: { condicion: string; observacion: string | null } | null;
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

// Modo compacto (documentos con dos tablas, como el Comprobante de Cambio):
// letra y celdas mas chicas para que todo quepa en una hoja.
const CELDA_COMPACTA = { fontSize: 8, padding: 3, lineHeight: 1.25 } as const;

// La fila del cargador no corta palabras ("Lat-itude", "devuel-to"): pasa a
// la linea siguiente entre palabras.
const palabraEntera = (palabra: string) => [palabra];

/**
 * Tabla de equipos compartida por el Comprobante de Entrega, el Acta de
 * Devolucion y el Comprobante de Cambio. El titulo de la ultima columna
 * cambia por documento ("Entregado", "Estado"). El cargador de un equipo va
 * en la misma tabla, en su propia fila justo debajo (SPEC 2.120): Equipo
 * "Cargador", la marca del equipo, sin serie, "Cargador de <modelo>", su
 * observacion y su condicion. Equipo y cargador no se separan entre hojas.
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
  /** Letra, celdas y margenes mas chicos, para documentos con dos tablas. */
  compacta?: boolean;
}) {
  const margenFinal = compacta ? 12 : styles.table.marginBottom;
  const celda = compacta ? CELDA_COMPACTA : {};

  return (
    <>
      <Text style={styles.equipLabel}>{titulo}</Text>
      <View style={[styles.table, { marginBottom: margenFinal }]}>
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
          // El equipo y su cargador van juntos: nunca se separan entre hojas.
          <View key={i} wrap={false}>
            <View style={styles.tableRow}>
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
            {fila.cargador && (
              <View style={styles.tableRow}>
                <Text hyphenationCallback={palabraEntera} style={[styles.tableCell, celda, { width: ANCHO.equipo, textAlign: 'center' }]}>
                  Cargador
                </Text>
                <Text hyphenationCallback={palabraEntera} style={[styles.tableCell, celda, { width: ANCHO.marca, textAlign: 'center' }]}>
                  {fila.marca || '—'}
                </Text>
                <Text hyphenationCallback={palabraEntera} style={[styles.tableCell, celda, { width: ANCHO.serie, textAlign: 'center' }]}>
                  —
                </Text>
                <Text hyphenationCallback={palabraEntera} style={[styles.tableCell, celda, { width: ANCHO.descripcion }]}>
                  {fila.descripcion ? `Cargador de ${fila.descripcion}` : 'Cargador'}
                </Text>
                <Text hyphenationCallback={palabraEntera} style={[styles.tableCell, celda, { width: ANCHO.especificaciones }]}>
                  {fila.cargador.observacion || '—'}
                </Text>
                <Text hyphenationCallback={palabraEntera} style={[styles.tableCell, celda, { width: ANCHO.estado, textAlign: 'center' }]}>
                  {fila.cargador.condicion}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </>
  );
}
