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
};

type Props = {
  evidencia: EvidenciaDocumento;
  empleadoNombre: string;
  empleadoRut: string;
  fecha: string;
  motivoCambio: string;
  /** `null` cuando no hubo equipo anterior: el bloque entero se omite. */
  equipoAnterior: AssetInfo | null;
  equipoNuevo: AssetInfo | null;
  gestionadoPor: string;
};

export function ComprobanteCambioTemplate({
  evidencia,
  empleadoNombre,
  empleadoRut,
  fecha,
  motivoCambio,
  equipoAnterior,
  equipoNuevo,
  gestionadoPor,
}: Props) {
  // Un bloque sin equipo no se dibuja. Rellenarlo con guiones hacia que el
  // documento afirmara una devolucion que nunca ocurrio.
  const renderEquipoTable = (asset: AssetInfo | null, label: string) =>
    asset === null ? null : (
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.subtitle}>{label}</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { width: '20%' }]}>Tipo</Text>
            <Text style={[styles.tableHeaderCell, { width: '20%' }]}>Marca</Text>
            <Text style={[styles.tableHeaderCell, { width: '25%' }]}>Modelo</Text>
            <Text style={[styles.tableHeaderCell, { width: '20%' }]}>N° Serie</Text>
            <Text style={[styles.tableHeaderCell, { width: '15%' }]}>Estado</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: '20%' }]}>{asset.tipo}</Text>
            <Text style={[styles.tableCell, { width: '20%' }]}>{asset.marca}</Text>
            <Text style={[styles.tableCell, { width: '25%' }]}>{asset.modelo}</Text>
            <Text style={[styles.tableCell, { width: '20%' }]}>{asset.numeroSerie || '—'}</Text>
            <Text style={[styles.tableCell, { width: '15%' }]}>{asset.estado}</Text>
          </View>
        </View>
      </View>
    );

  return (
    <Document {...propsDocumento(evidencia)}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLeft}>{EMPRESA.nombre}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>RUT: {EMPRESA.rut}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text>Fecha: {fecha}</Text>
          </View>
        </View>

        <Text style={styles.title}>COMPROBANTE DE CAMBIO DE EQUIPOS</Text>

        <Text style={styles.text}>
          Se deja constancia del cambio de equipo realizado al/la trabajador(a){' '}
          <Text style={styles.textBold}>{empleadoNombre}</Text>, RUT{' '}
          <Text style={styles.textBold}>{empleadoRut}</Text>.
        </Text>

        <View style={{ marginTop: 12 }}>
          <Text style={styles.subtitle}>Motivo del cambio</Text>
          <Text style={styles.text}>{motivoCambio}</Text>
        </View>

        {renderEquipoTable(equipoNuevo, 'Equipo Asignado (Nuevo)')}
        {renderEquipoTable(equipoAnterior, 'Equipo Devuelto (Anterior)')}

        <View style={{ marginTop: 12, padding: 8, backgroundColor: '#f9fafb', borderRadius: 4 }}>
          <Text style={{ fontSize: 8, color: '#6b7280', fontStyle: 'italic' }}>
            Nota: Este documento es un respaldo del cambio de equipo realizado. El anexo de contrato
            será generado posteriormente si corresponde.
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
