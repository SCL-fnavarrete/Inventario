import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles, EMPRESA } from './pdfStyles';
import {
  DeclaracionPolitica,
  FirmaEmpleado,
  PieEvidencia,
  propsDocumento,
  type EvidenciaDocumento,
} from './evidencia';

type AssetInfo = {
  tipo: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  estadoDevolucion: string;
};

type Props = {
  evidencia: EvidenciaDocumento;
  empleadoNombre: string;
  empleadoRut: string;
  fechaInicio: string;
  fechaTermino: string;
  fechaDevolucion: string;
  assets: AssetInfo[];
  observaciones: string | null;
  recibidoPor: string;
};

const ESTADO_DEVOLUCION_LABEL: Record<string, string> = {
  ok: 'OK',
  danado: 'Dañado',
  incompleto: 'Incompleto',
};

export function ActaDevolucionTemplate({
  evidencia,
  empleadoNombre,
  empleadoRut,
  fechaInicio,
  fechaTermino,
  fechaDevolucion,
  assets,
  observaciones,
  recibidoPor,
}: Props) {
  return (
    <Document {...propsDocumento(evidencia)}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLeft}>{EMPRESA.nombre}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>RUT: {EMPRESA.rut}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text>Fecha: {fechaDevolucion}</Text>
          </View>
        </View>

        <Text style={styles.title}>ACTA DE DEVOLUCIÓN DE EQUIPOS</Text>

        <Text style={styles.text}>
          Se deja constancia de la devolución de equipos de trabajo por parte del/la trabajador(a){' '}
          <Text style={styles.textBold}>{empleadoNombre}</Text>, RUT{' '}
          <Text style={styles.textBold}>{empleadoRut}</Text>.
        </Text>

        <View style={{ marginTop: 8 }}>
          <Text style={styles.text}>
            Fecha ingreso: <Text style={styles.textBold}>{fechaInicio}</Text>
          </Text>
          <Text style={styles.text}>
            Fecha término: <Text style={styles.textBold}>{fechaTermino}</Text>
          </Text>
          <Text style={styles.text}>
            Fecha devolución equipos: <Text style={styles.textBold}>{fechaDevolucion}</Text>
          </Text>
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={styles.subtitle}>Equipos Devueltos</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { width: '20%' }]}>Tipo</Text>
              <Text style={[styles.tableHeaderCell, { width: '20%' }]}>Marca</Text>
              <Text style={[styles.tableHeaderCell, { width: '25%' }]}>Modelo</Text>
              <Text style={[styles.tableHeaderCell, { width: '20%' }]}>N° Serie</Text>
              <Text style={[styles.tableHeaderCell, { width: '15%' }]}>Estado</Text>
            </View>
            {assets.map((asset, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '20%' }]}>{asset.tipo}</Text>
                <Text style={[styles.tableCell, { width: '20%' }]}>{asset.marca}</Text>
                <Text style={[styles.tableCell, { width: '25%' }]}>{asset.modelo}</Text>
                <Text style={[styles.tableCell, { width: '20%' }]}>
                  {asset.numeroSerie || '—'}
                </Text>
                <Text style={[styles.tableCell, { width: '15%' }]}>
                  {ESTADO_DEVOLUCION_LABEL[asset.estadoDevolucion] ?? asset.estadoDevolucion}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {observaciones && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.subtitle}>Observaciones</Text>
            <Text style={styles.text}>{observaciones}</Text>
          </View>
        )}

        <View style={{ marginTop: 12, padding: 8, backgroundColor: '#f9fafb', borderRadius: 4 }}>
          <Text style={{ fontSize: 9, color: '#374151' }}>
            Recepción de equipos realizada por:{' '}
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{recibidoPor}</Text>
          </Text>
        </View>

        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}>
            <FirmaEmpleado evidencia={evidencia} />
            <Text style={styles.signatureLabel}>{empleadoNombre}</Text>
            <Text style={styles.signatureLabel}>RUT: {empleadoRut}</Text>
            <Text style={styles.signatureLabel}>Trabajador</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Recepción realizada por:</Text>
            <Text style={styles.signatureLabel}>{recibidoPor}</Text>
            <Text style={styles.signatureLabel}>{EMPRESA.nombre}</Text>
          </View>
        </View>

        <DeclaracionPolitica evidencia={evidencia} />

        <PieEvidencia evidencia={evidencia} />
      </Page>
    </Document>
  );
}
