import React from 'react';
import { Image, Text, View } from '@react-pdf/renderer';
import { styles, EMPRESA } from './pdfStyles';

/**
 * Partes comunes a las cuatro plantillas de evidencia.
 *
 * Se extraen aqui porque son justo lo que vuelve inmutable a un documento: la
 * fecha de creacion del PDF, el pie con numero y version, y la firma. Repetir
 * eso cuatro veces hacia que un cambio en una plantilla dejara a las otras tres
 * generando documentos distintos.
 */

export type EvidenciaDocumento = {
  numero: string;
  version: number;
  /** Fecha de emision ya formateada; el snapshot manda, nunca el reloj. */
  emitidoEnTexto: string;
  /** Sella `/CreationDate` del PDF: sin esto los bytes cambian en cada render. */
  creationDate: Date;
  firmaPng: string | null;
  firmadaEnTexto: string | null;
  aceptaPoliticaUso: true;
};

const PRODUCTOR = 'Inventario IT SCL';

/** Metadatos que hacen reproducible el PDF byte a byte. */
export function propsDocumento(evidencia: EvidenciaDocumento) {
  return {
    creationDate: evidencia.creationDate,
    producer: PRODUCTOR,
    creator: PRODUCTOR,
    title: `${evidencia.numero} v${evidencia.version}`,
  };
}

export function FirmaEmpleado({ evidencia }: { evidencia: EvidenciaDocumento }) {
  return (
    <View>
      {evidencia.firmaPng ? (
        // `Image` de @react-pdf no es un <img> del DOM: no acepta `alt` y el
        // destino es un PDF, no una pagina que un lector de pantalla recorra.
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={evidencia.firmaPng} style={{ width: 140, height: 44, marginBottom: 2 }} />
      ) : (
        <Text style={{ fontSize: 8, color: '#b91c1c', marginBottom: 2 }}>Sin firma registrada</Text>
      )}
      <View style={styles.signatureLine} />
      {evidencia.firmadaEnTexto && (
        <Text style={{ fontSize: 8, color: '#6b7280' }}>Firmado el {evidencia.firmadaEnTexto}</Text>
      )}
    </View>
  );
}

export function DeclaracionPolitica({ evidencia }: { evidencia: EvidenciaDocumento }) {
  return (
    <Text style={{ fontSize: 8, color: '#374151', marginTop: 6 }}>
      El/la trabajador(a) aceptó explícitamente la política de uso de equipos al firmar este
      documento{evidencia.firmadaEnTexto ? ` el ${evidencia.firmadaEnTexto}` : ''}.
    </Text>
  );
}

export function PieEvidencia({ evidencia }: { evidencia: EvidenciaDocumento }) {
  return (
    <Text style={styles.footer}>
      {EMPRESA.nombre} — {EMPRESA.rut} — Documento {evidencia.numero} v{evidencia.version} emitido
      el {evidencia.emitidoEnTexto}
    </Text>
  );
}
