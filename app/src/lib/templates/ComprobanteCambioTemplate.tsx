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
  fecha: string;
  motivoCambio: string;
  equipoAnterior: AssetInfo;
  equipoNuevo: AssetInfo;
  gestionadoPor: string;
};

/**
 * Comprobante de cambio de equipo. 16-sep-2026 (SPEC 2.49): antes usaba un
 * diseño generico (pdfStyles.ts, sin logo); ahora comparte el mismo
 * formato que el Comprobante de Entrega (onboarding) -- logo SCL, colores,
 * tipografia y tabla -- pedido de Javier, "todas las solicitudes deben
 * seguir el mismo formato que tiene los de onboarding".
 */

function TablaEquipo({ label, asset }: { label: string; asset: AssetInfo }) {
  return (
    <>
      <Text style={styles.equipLabel}>{label}</Text>
      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { width: '18%' }]}>Equipo</Text>
          <Text style={[styles.tableHeaderCell, { width: '15%' }]}>Marca</Text>
          <Text style={[styles.tableHeaderCell, { width: '53%', textAlign: 'left' }]}>
            Descripción de equipo
          </Text>
          <Text style={[styles.tableHeaderCell, { width: '14%' }]}>Estado</Text>
        </View>
        <View style={styles.tableRow}>
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
      </View>
    </>
  );
}

export function ComprobanteCambioTemplate({
  empleadoNombre,
  empleadoRut,
  fecha,
  motivoCambio,
  equipoAnterior,
  equipoNuevo,
  gestionadoPor,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <LogoSCL />

        <Text style={styles.docTitle}>COMPROBANTE DE CAMBIO DE EQUIPOS</Text>

        <Text style={styles.docIntro}>
          A través del presente con fecha {fecha}, <Text style={styles.bold}>{EMPRESA.nombre}</Text>{' '}
          deja constancia del cambio de equipo realizado a{' '}
          <Text style={styles.bold}>{empleadoNombre}</Text> RUT{' '}
          <Text style={styles.bold}>{empleadoRut}</Text>, con motivo de:{' '}
          <Text style={styles.bold}>{motivoCambio}</Text>.
        </Text>

        <TablaEquipo label="Equipo asignado (nuevo):" asset={equipoNuevo} />
        <TablaEquipo label="Equipo devuelto (anterior):" asset={equipoAnterior} />

        <Text style={styles.docObsCompacto}>
          <Text style={styles.italic}>
            Este documento es un respaldo del cambio de equipo realizado. El anexo de contrato
            será generado posteriormente si corresponde.
          </Text>
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
