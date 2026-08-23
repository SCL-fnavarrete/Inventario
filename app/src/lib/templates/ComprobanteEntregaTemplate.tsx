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
  estado: string;
  imei?: string | null;
  numeroTelefono?: string | null;
  operador?: string | null;
};

type Props = {
  evidencia: EvidenciaDocumento;
  empleadoNombre: string;
  empleadoRut: string;
  fechaEntrega: string;
  assets: AssetInfo[];
  gestionadoPor: string;
};

export function ComprobanteEntregaTemplate({
  evidencia,
  empleadoNombre,
  empleadoRut,
  fechaEntrega,
  assets,
  gestionadoPor,
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
            <Text>Fecha: {fechaEntrega}</Text>
          </View>
        </View>

        <Text style={styles.title}>COMPROBANTE DE ENTREGA DE EQUIPOS</Text>

        <Text style={styles.text}>
          Yo, <Text style={styles.textBold}>{empleadoNombre}</Text>, RUT{' '}
          <Text style={styles.textBold}>{empleadoRut}</Text>, declaro haber recibido los
          siguientes equipos de trabajo de propiedad de {EMPRESA.nombre}:
        </Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { width: '20%' }]}>Tipo</Text>
            <Text style={[styles.tableHeaderCell, { width: '20%' }]}>Marca</Text>
            <Text style={[styles.tableHeaderCell, { width: '20%' }]}>Modelo</Text>
            <Text style={[styles.tableHeaderCell, { width: '25%' }]}>N° Serie / IMEI</Text>
            <Text style={[styles.tableHeaderCell, { width: '15%' }]}>Estado</Text>
          </View>
          {assets.map((asset, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '20%' }]}>{asset.tipo}</Text>
              <Text style={[styles.tableCell, { width: '20%' }]}>{asset.marca}</Text>
              <Text style={[styles.tableCell, { width: '20%' }]}>{asset.modelo}</Text>
              <Text style={[styles.tableCell, { width: '25%' }]}>
                {asset.numeroSerie || asset.imei || '—'}
              </Text>
              <Text style={[styles.tableCell, { width: '15%' }]}>
                {asset.estado === 'nuevo' ? 'Nuevo' : 'Usado'}
              </Text>
            </View>
          ))}
        </View>

        {assets.some((a) => a.numeroTelefono) && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.subtitle}>Datos de Línea Telefónica</Text>
            {assets
              .filter((a) => a.numeroTelefono)
              .map((a, i) => (
                <Text key={i} style={styles.text}>
                  N° Telefónico: {a.numeroTelefono} — Operador: {a.operador || '—'} — IMEI:{' '}
                  {a.imei || '—'}
                </Text>
              ))}
          </View>
        )}

        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}>
            <FirmaEmpleado evidencia={evidencia} />
            <Text style={styles.signatureLabel}>{empleadoNombre}</Text>
            <Text style={styles.signatureLabel}>RUT: {empleadoRut}</Text>
            <Text style={styles.signatureLabel}>Trabajador</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Gestión realizada por:</Text>
            <Text style={styles.signatureLabel}>{gestionadoPor}</Text>
            <Text style={styles.signatureLabel}>{EMPRESA.nombre}</Text>
          </View>
        </View>

        <DeclaracionPolitica evidencia={evidencia} />

        <PieEvidencia evidencia={evidencia} />
      </Page>
    </Document>
  );
}
