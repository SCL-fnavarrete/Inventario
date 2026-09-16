import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { EMPRESA } from './pdfStyles';
import { sclStyles as styles, LogoSCL } from './pdfSclBrand';

type AssetInfo = {
  equipo: string;
  marca: string;
  descripcion: string;
  estado: string;
};

type Props = {
  empleadoNombre: string;
  empleadoRut: string;
  fechaTermino: string;
  fechaDevolucion: string;
  assets: AssetInfo[];
  observacion: string;
  recibidoPor: string;
};

/**
 * Acta de devolucion -- se adjunta al aviso de desvinculacion a RRHH.
 * 16-sep-2026 (SPEC 2.49): antes usaba un diseño generico (pdfStyles.ts,
 * sin logo); ahora comparte el mismo formato que el Comprobante de Entrega
 * (onboarding) -- logo SCL, colores, tipografia y tabla -- pedido de
 * Javier, "todas las solicitudes deben seguir el mismo formato que tiene
 * los de onboarding".
 */

export function ActaDevolucionTemplate({
  empleadoNombre,
  empleadoRut,
  fechaTermino,
  fechaDevolucion,
  assets,
  observacion,
  recibidoPor,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <LogoSCL />

        <Text style={styles.docTitle}>ACTA DE DEVOLUCIÓN DE EQUIPOS</Text>

        <Text style={styles.docIntro}>
          A través del presente con fecha {fechaDevolucion}, <Text style={styles.bold}>{EMPRESA.nombre}</Text>{' '}
          deja constancia de la devolución de equipamiento por parte de{' '}
          <Text style={styles.bold}>{empleadoNombre}</Text> RUT{' '}
          <Text style={styles.bold}>{empleadoRut}</Text>, con motivo de su desvinculación con fecha
          de término <Text style={styles.bold}>{fechaTermino}</Text>:
        </Text>

        <Text style={styles.equipLabel}>Equipo devuelto:</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, { width: '18%' }]}>Equipo</Text>
            <Text style={[styles.tableHeaderCell, { width: '15%' }]}>Marca</Text>
            <Text style={[styles.tableHeaderCell, { width: '53%', textAlign: 'left' }]}>
              Descripción de equipo
            </Text>
            <Text style={[styles.tableHeaderCell, { width: '14%' }]}>Estado</Text>
          </View>
          {assets.map((asset, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '18%', textAlign: 'center' }]}>
                {asset.equipo}
              </Text>
              <Text style={[styles.tableCell, { width: '15%', textAlign: 'center' }]}>
                {asset.marca || '—'}
              </Text>
              <Text style={[styles.tableCell, { width: '53%' }]}>{asset.descripcion || '—'}</Text>
              <Text style={[styles.tableCell, { width: '14%', textAlign: 'center' }]}>
                {asset.estado}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.docObs}>
          <Text style={styles.bold}>Observación: </Text>
          <Text style={styles.italic}>{observacion || 'n/a'}</Text>
        </Text>

        <View style={styles.signatures}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureRole}>Firma del colaborador</Text>
            <Text style={styles.signatureName}>{empleadoNombre}</Text>
            <Text style={styles.signatureRut}>RUT {empleadoRut}</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureRole}>Recepción realizada por:</Text>
            <Text style={styles.signatureName}>{recibidoPor}</Text>
            <Text style={styles.signatureRut}>{EMPRESA.nombre}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
