import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles, EMPRESA } from './pdfStyles';

type AssetInfo = {
  tipo: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  procesador: string | null;
  discoDuro: string | null;
  ram: string | null;
  estado: string;
  imei?: string | null;
  numeroTelefono?: string | null;
  operador?: string | null;
};

type Props = {
  empleadoNombre: string;
  empleadoRut: string;
  cargo: string;
  fechaContrato: string;
  fechaEntrega: string;
  assets: AssetInfo[];
  gestionadoPor: string;
};

export function AnexoEntregaTemplate({
  empleadoNombre,
  empleadoRut,
  cargo,
  fechaContrato,
  fechaEntrega,
  assets,
  gestionadoPor,
}: Props) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLeft}>{EMPRESA.nombre}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>RUT: {EMPRESA.rut}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text>Fecha: {fechaEntrega}</Text>
          </View>
        </View>

        <Text style={styles.title}>ANEXO DE ENTREGA DE EQUIPOS</Text>

        {/* PRIMERO */}
        <View style={styles.clausula}>
          <Text style={styles.clausulaTitle}>PRIMERO: Antecedentes</Text>
          <Text style={styles.clausulaText}>
            En conformidad al contrato de trabajo celebrado con fecha {fechaContrato}, entre{' '}
            {EMPRESA.nombre}, RUT {EMPRESA.rut}, y el/la trabajador(a) {empleadoNombre}, RUT{' '}
            {empleadoRut}, para desempeñar el cargo de {cargo}, se hace entrega de los
            siguientes equipos de trabajo.
          </Text>
        </View>

        {/* SEGUNDO */}
        <View style={styles.clausula}>
          <Text style={styles.clausulaTitle}>SEGUNDO: Equipos entregados</Text>
          <Text style={styles.clausulaText}>
            Con fecha {fechaEntrega}, se hace entrega de los siguientes equipos:
          </Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { width: '15%' }]}>Tipo</Text>
              <Text style={[styles.tableHeaderCell, { width: '15%' }]}>Marca</Text>
              <Text style={[styles.tableHeaderCell, { width: '15%' }]}>Modelo</Text>
              <Text style={[styles.tableHeaderCell, { width: '15%' }]}>N° Serie</Text>
              <Text style={[styles.tableHeaderCell, { width: '12%' }]}>Procesador</Text>
              <Text style={[styles.tableHeaderCell, { width: '10%' }]}>Disco</Text>
              <Text style={[styles.tableHeaderCell, { width: '8%' }]}>RAM</Text>
              <Text style={[styles.tableHeaderCell, { width: '10%' }]}>Estado</Text>
            </View>
            {assets.map((asset, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '15%' }]}>{asset.tipo}</Text>
                <Text style={[styles.tableCell, { width: '15%' }]}>{asset.marca}</Text>
                <Text style={[styles.tableCell, { width: '15%' }]}>{asset.modelo}</Text>
                <Text style={[styles.tableCell, { width: '15%' }]}>{asset.numeroSerie || '—'}</Text>
                <Text style={[styles.tableCell, { width: '12%' }]}>{asset.procesador || '—'}</Text>
                <Text style={[styles.tableCell, { width: '10%' }]}>{asset.discoDuro || '—'}</Text>
                <Text style={[styles.tableCell, { width: '8%' }]}>{asset.ram || '—'}</Text>
                <Text style={[styles.tableCell, { width: '10%' }]}>
                  {asset.estado === 'nuevo' ? 'Nuevo' : 'Usado'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* TERCERO */}
        <View style={styles.clausula}>
          <Text style={styles.clausulaTitle}>TERCERO: Obligaciones del trabajador</Text>
          <Text style={styles.clausulaText}>
            El/la trabajador(a) se obliga a cuidar, mantener y usar los equipos entregados
            exclusivamente para fines laborales. Deberá informar de inmediato cualquier desperfecto,
            pérdida o daño que sufran los equipos.
          </Text>
        </View>

        {/* CUARTO */}
        <View style={styles.clausula}>
          <Text style={styles.clausulaTitle}>CUARTO: Valores de reposición</Text>
          <Text style={styles.clausulaText}>
            En caso de pérdida, extravío o daño por negligencia, el/la trabajador(a) deberá
            responder por los siguientes valores de reposición: Notebook $500.000 CLP, Cargador
            $50.000 CLP, Celular $200.000 CLP, Monitor $150.000 CLP. Los valores podrán ser
            actualizados según mercado al momento de la reposición.
          </Text>
        </View>

        {/* QUINTO */}
        <View style={styles.clausula}>
          <Text style={styles.clausulaTitle}>QUINTO: Devolución</Text>
          <Text style={styles.clausulaText}>
            Al término de la relación laboral, el/la trabajador(a) deberá devolver todos los equipos
            en un plazo máximo de 4 días hábiles. De no cumplir con la devolución, se autoriza el
            descuento de los valores de reposición de su liquidación final.
          </Text>
        </View>

        {/* SEXTO */}
        <View style={styles.clausula}>
          <Text style={styles.clausulaTitle}>SEXTO: Firmas</Text>
          <Text style={styles.clausulaText}>
            El presente anexo se firma en dos copias de igual tenor y fecha, quedando una en poder
            de cada parte.
          </Text>
        </View>

        {/* Signatures */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
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

        <Text style={styles.footer}>{EMPRESA.nombre} — {EMPRESA.rut} — Documento generado el {new Date().toLocaleDateString('es-CL')}</Text>
      </Page>
    </Document>
  );
}
