import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { styles as base, EMPRESA } from './pdfStyles';

type AssetInfo = {
  equipo: string;
  marca: string;
  descripcion: string;
  entregado: string;
};

type Props = {
  empleadoNombre: string;
  empleadoRut: string;
  fecha: string;
  otNumero: string | null;
  assets: AssetInfo[];
  observacion: string;
  gestionadoPor: string;
};

/**
 * Comprobante de entrega -- pensado para adjuntarse al correo de aviso a
 * RRHH (SPEC 2.5, paso "Informar a RRHH" del cierre de onboarding).
 *
 * IMPORTANTE: este documento debe ser fiel al formato de la herramienta
 * externa "generador_acta_scl" (logo, colores, redaccion exacta, tabla),
 * segun pidio Javier explicitamente -- no reinterpretar el diseño, solo
 * conectarlo a los datos reales de la solicitud en vez de tipeados a mano.
 * Si la coordinacion de la entrega fue "por OT" (medioEntrega/
 * otChilexpressEntrega en WorkflowRequest), se agrega la clausula de OT en
 * la intro -- ver documentGeneratorService.
 */

const azulLogo = '#1f3a5f';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    padding: '25mm 22mm',
    color: '#000',
    lineHeight: 1.45,
  },
  docHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 38,
  },
  logoBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoPixelsCol: {
    marginRight: 10,
  },
  pixelRow: {
    flexDirection: 'row',
  },
  pixel: {
    width: 9,
    height: 9,
    marginRight: 1,
    marginBottom: 1,
  },
  logoTextBlock: {
    marginRight: 8,
  },
  logoText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    color: azulLogo,
  },
  logoTextSmall: {
    fontSize: 7,
    letterSpacing: 2,
    color: azulLogo,
    marginTop: 2,
  },
  badgesBlock: {
    flexDirection: 'column',
  },
  badge: {
    fontSize: 7.5,
    color: azulLogo,
    marginBottom: 3,
  },
  badgeBold: {
    fontFamily: 'Helvetica-Bold',
  },
  badgeUipath: {
    backgroundColor: '#fa4616',
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 6,
    paddingRight: 6,
    alignSelf: 'flex-start',
  },
  docTitle: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 32,
    color: '#000',
  },
  docIntro: {
    marginBottom: 22,
    textAlign: 'justify',
    fontSize: 11,
    color: '#000',
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  equipLabel: {
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
    fontSize: 11.5,
  },
  table: {
    marginBottom: 30,
  },
  tableHeaderRow: {
    flexDirection: 'row',
  },
  tableHeaderCell: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    borderWidth: 0.5,
    borderColor: '#000',
    backgroundColor: '#ffffff',
    padding: 5,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCell: {
    fontSize: 9,
    borderWidth: 0.5,
    borderColor: '#000',
    padding: 5,
  },
  docObs: {
    marginTop: 36,
    marginBottom: 80,
    fontSize: 11,
  },
  italic: {
    fontFamily: 'Helvetica-Oblique',
    color: '#333',
  },
  signatures: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 60,
  },
  signatureBlock: {
    width: '45%',
    textAlign: 'center',
  },
  signatureLine: {
    borderBottomWidth: 0.5,
    borderColor: '#000',
    height: 50,
    marginBottom: 6,
  },
  signatureRole: {
    fontSize: 10,
    marginBottom: 2,
    textAlign: 'center',
  },
  signatureName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10.5,
    marginBottom: 2,
    textAlign: 'center',
  },
  signatureRut: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textAlign: 'center',
  },
});

// Colores del logo pixel, en el mismo orden que .logo-pixels span:nth-child
// del generador_acta_scl (fila por fila, izquierda a derecha).
const PIXEL_ROWS = [
  ['#e84545', '#f5b942', 'transparent'],
  ['#f5b942', '#2a8fd9', '#e84545'],
  ['transparent', '#e84545', '#2a8fd9'],
];

function LogoSCL() {
  return (
    <View style={styles.docHeader}>
      <View style={styles.logoBlock}>
        <View style={styles.logoPixelsCol}>
          {PIXEL_ROWS.map((row, i) => (
            <View key={i} style={styles.pixelRow}>
              {row.map((color, j) => (
                <View key={j} style={[styles.pixel, { backgroundColor: color }]} />
              ))}
            </View>
          ))}
        </View>
        <View style={styles.logoTextBlock}>
          <Text style={styles.logoText}>SCL</Text>
          <Text style={styles.logoTextSmall}>CONSULTORES</Text>
        </View>
        <View style={styles.badgesBlock}>
          <Text style={styles.badge}>
            <Text style={styles.badgeBold}>SAP</Text>® Partner
          </Text>
          <Text style={styles.badgeUipath}>Ui Path</Text>
        </View>
      </View>
    </View>
  );
}

export function ComprobanteEntregaTemplate({
  empleadoNombre,
  empleadoRut,
  fecha,
  otNumero,
  assets,
  observacion,
  gestionadoPor,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <LogoSCL />

        <Text style={styles.docTitle}>COMPROBANTE ENTREGA DE EQUIPOS</Text>

        <Text style={styles.docIntro}>
          A través del presente con fecha {fecha}, <Text style={styles.bold}>{EMPRESA.nombre}</Text>{' '}
          realiza la entrega de equipamiento asignado a <Text style={styles.bold}>{empleadoNombre}</Text>{' '}
          RUT <Text style={styles.bold}>{empleadoRut}</Text>
          {otNumero ? (
            <>
              , correspondiente a la Orden de Trabajo (OT) N° <Text style={styles.bold}>{otNumero}</Text>
            </>
          ) : (
            ''
          )}
          :
        </Text>

        <Text style={styles.equipLabel}>Equipo asignado:</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, { width: '18%' }]}>Equipo</Text>
            <Text style={[styles.tableHeaderCell, { width: '15%' }]}>Marca</Text>
            <Text style={[styles.tableHeaderCell, { width: '53%', textAlign: 'left' }]}>
              Descripción de equipo
            </Text>
            <Text style={[styles.tableHeaderCell, { width: '14%' }]}>Entregado</Text>
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
                {asset.entregado}
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
            <Text style={styles.signatureRole}>Gestión realizada por:</Text>
            <Text style={styles.signatureName}>{gestionadoPor}</Text>
            <Text style={styles.signatureRut}>{EMPRESA.nombre}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
