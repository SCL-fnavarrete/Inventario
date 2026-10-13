import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { EMPRESA } from '@/modules/solicitudes/plantillas/pdfStyles';
import { sclStyles as styles, LogoSCL } from '@/modules/solicitudes/plantillas/pdfSclBrand';
import { TablaEquipoActa, type FilaEquipoActa } from '@/modules/solicitudes/plantillas/TablaEquipoActa';
import { TablaLineasActa, type FilaLineaActa } from '@/modules/solicitudes/plantillas/TablaLineasActa';

type Props = {
  empleadoNombre: string;
  empleadoRut: string;
  fecha: string;
  otNumero: string | null;
  assets: FilaEquipoActa[];
  /** Lineas que se entregan con el equipo o a la persona (SPEC 2.143). */
  lineas?: FilaLineaActa[];
  observacion: string;
  gestionadoPor: string;
};

/**
 * Comprobante de entrega para adjuntar al aviso a RRHH al cierre de un
 * onboarding. Si la entrega se coordino "por OT" se agrega la clausula de
 * OT en la intro (ver documentGeneratorService). Logo, colores y tabla se
 * comparten con las demas plantillas via pdfSclBrand.tsx.
 */

export function ComprobanteEntregaTemplate({
  empleadoNombre,
  empleadoRut,
  fecha,
  otNumero,
  assets,
  lineas = [],
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

        <TablaEquipoActa titulo="Equipo asignado:" columnaEstado="Entregado" filas={assets} />
        <TablaLineasActa titulo={lineas.length > 1 ? 'Líneas asignadas:' : 'Línea asignada:'} filas={lineas} />

        <Text style={styles.docObs}>
          <Text style={styles.bold}>Observación: </Text>
          <Text style={styles.italic}>{observacion || 'n/a'}</Text>
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
