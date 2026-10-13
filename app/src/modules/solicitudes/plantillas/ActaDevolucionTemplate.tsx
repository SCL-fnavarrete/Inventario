import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { EMPRESA } from '@/modules/solicitudes/plantillas/pdfStyles';
import { sclStyles as styles, LogoSCL } from '@/modules/solicitudes/plantillas/pdfSclBrand';
import { TablaEquipoActa, type FilaEquipoActa } from '@/modules/solicitudes/plantillas/TablaEquipoActa';
import { TablaLineasActa, type FilaLineaActa } from '@/modules/solicitudes/plantillas/TablaLineasActa';

type Props = {
  empleadoNombre: string;
  empleadoRut: string;
  fechaTermino: string;
  fechaDevolucion: string;
  /** N° de OT si la devolucion fue por despacho (Chilexpress). */
  otNumero: string | null;
  assets: FilaEquipoActa[];
  /** Lineas que vuelven con los celulares y eSIM que quedan disponibles (SPEC 2.143). */
  lineas?: FilaLineaActa[];
  observacion: string;
  recibidoPor: string;
};

/**
 * Acta de devolucion -- se adjunta al aviso de desvinculacion a RRHH.
 * Comparte el mismo formato (logo SCL, colores, tipografia y tabla) que
 * el Comprobante de Entrega de onboarding. Si la devolucion se coordino
 * "por OT" se agrega la clausula de OT en la intro, igual que en la entrega.
 */

export function ActaDevolucionTemplate({
  empleadoNombre,
  empleadoRut,
  fechaTermino,
  fechaDevolucion,
  otNumero,
  assets,
  lineas = [],
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
          de término <Text style={styles.bold}>{fechaTermino}</Text>
          {otNumero ? (
            <>
              , correspondiente a la Orden de Trabajo (OT) N° <Text style={styles.bold}>{otNumero}</Text>
            </>
          ) : (
            ''
          )}
          :
        </Text>

        <TablaEquipoActa titulo="Equipo devuelto:" columnaEstado="Estado" filas={assets} />
        <TablaLineasActa titulo={lineas.length > 1 ? 'Líneas devueltas:' : 'Línea devuelta:'} filas={lineas} />

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
            <Text style={styles.signatureRole}>Recepción realizada por:</Text>
            <Text style={styles.signatureName}>{recibidoPor}</Text>
            <Text style={styles.signatureRut}>{EMPRESA.nombre}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
