import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

/**
 * Sistema visual compartido de las plantillas PDF de Solicitudes: logo SCL,
 * colores, tipografia y estilo de tabla. 16-sep-2026 (SPEC 2.49): antes
 * solo el Comprobante de Entrega (onboarding) usaba este diseño -- Acta de
 * Devolucion y Comprobante de Cambio usaban el estilo generico de
 * pdfStyles.ts, sin logo. Extraido de ComprobanteEntregaTemplate para que
 * las tres plantillas (entrega, devolucion, cambio) compartan exactamente
 * el mismo formato, en vez de reimplementarlo cada vez. Pedido de Javier:
 * "todas las solicitudes deben seguir el mismo formato que tiene los de
 * onboarding".
 */

export const azulLogo = '#1f3a5f';

export const sclStyles = StyleSheet.create({
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
  docObsCompacto: {
    marginTop: 20,
    marginBottom: 40,
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

export function LogoSCL() {
  return (
    <View style={sclStyles.docHeader}>
      <View style={sclStyles.logoBlock}>
        <View style={sclStyles.logoPixelsCol}>
          {PIXEL_ROWS.map((row, i) => (
            <View key={i} style={sclStyles.pixelRow}>
              {row.map((color, j) => (
                <View key={j} style={[sclStyles.pixel, { backgroundColor: color }]} />
              ))}
            </View>
          ))}
        </View>
        <View style={sclStyles.logoTextBlock}>
          <Text style={sclStyles.logoText}>SCL</Text>
          <Text style={sclStyles.logoTextSmall}>CONSULTORES</Text>
        </View>
        <View style={sclStyles.badgesBlock}>
          <Text style={sclStyles.badge}>
            <Text style={sclStyles.badgeBold}>SAP</Text>® Partner
          </Text>
          <Text style={sclStyles.badgeUipath}>Ui Path</Text>
        </View>
      </View>
    </View>
  );
}
