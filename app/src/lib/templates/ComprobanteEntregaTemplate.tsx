import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { EMPRESA } from './pdfStyles';
import { sclStyles as styles, LogoSCL } from './pdfSclBrand';

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
 *
 * 16-sep-2026 (SPEC 2.49): el logo/colores/tabla se movieron a
 * pdfSclBrand.tsx para que Acta de Devolucion y Comprobante de Cambio
 * puedan compartir exactamente el mismo formato -- pedido de Javier, "todas
 * las solicitudes deben seguir el mismo formato que tiene los de
 * onboarding". Este archivo no cambio visualmente, solo de donde saca los
 * estilos.
 */

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
