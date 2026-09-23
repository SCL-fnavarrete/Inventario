import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { EMPRESA } from './pdfStyles';
import { sclStyles as styles, LogoSCL } from './pdfSclBrand';
import { TablaCargadorActa, TablaEquipoActa, type FilaEquipoActa } from './TablaEquipoActa';

type Props = {
  empleadoNombre: string;
  empleadoRut: string;
  fecha: string;
  motivoCambio: string;
  /** N° de OT si el cambio se coordino por despacho (Chilexpress). */
  otNumero: string | null;
  equipoAnterior: FilaEquipoActa;
  equipoNuevo: FilaEquipoActa;
  gestionadoPor: string;
};

/**
 * Comprobante de cambio de equipo. Comparte el mismo formato (logo SCL,
 * colores, tipografia y tabla) que el Comprobante de Entrega de onboarding.
 * Si el cambio se coordino "por OT" se agrega la clausula de OT en la intro.
 */

export function ComprobanteCambioTemplate({
  empleadoNombre,
  empleadoRut,
  fecha,
  motivoCambio,
  otNumero,
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
          <Text style={styles.bold}>{empleadoRut}</Text>
          {otNumero ? (
            <>
              , correspondiente a la Orden de Trabajo (OT) N° <Text style={styles.bold}>{otNumero}</Text>
            </>
          ) : (
            ''
          )}
          , con motivo de: <Text style={styles.bold}>{motivoCambio}</Text>.
        </Text>

        {/* Dos tablas compactas y un solo bloque de cargadores al final, para
            que todo (firmas incluidas) quepa en una hoja. */}
        <TablaEquipoActa
          titulo="Equipo asignado (nuevo):"
          columnaEstado="Estado"
          filas={[equipoNuevo]}
          compacta
          sinCargador
        />
        <TablaEquipoActa
          titulo="Equipo devuelto (anterior):"
          columnaEstado="Estado"
          filas={[equipoAnterior]}
          compacta
          sinCargador
        />
        <TablaCargadorActa filas={[equipoNuevo, equipoAnterior]} compacta />

        <Text style={styles.docObsCompacto}>
          <Text style={styles.italic}>
            Este documento es un respaldo del cambio de equipo realizado. El anexo de contrato
            será generado posteriormente si corresponde.
          </Text>
        </Text>

        {/* Las firmas nunca se cortan entre hojas. */}
        <View style={styles.signatures} wrap={false}>
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
