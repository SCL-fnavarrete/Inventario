import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { EMPRESA } from '@/shared/pdf/pdfStyles';
import { LogoSCL, azulLogo } from '@/shared/pdf/pdfSclBrand';
import type { FilaEquipoActa } from '@/shared/pdf/TablaEquipoActa';

export type FilaKitGuia = { articulo: string; categoria: string; cantidad: number };

type Props = {
  numero: string;
  fecha: string;
  sedeOrigen: string;
  sedeDestino: string;
  otChilexpress: string;
  emisor: string;
  receptorNombre: string;
  receptorRut: string;
  fechaEstimadaLlegada: string | null;
  equipos: FilaEquipoActa[];
  kit: FilaKitGuia[];
  observaciones: string;
  /** Solo si la guia esta anulada: se imprime la marca y el motivo. */
  anulada: { fecha: string; motivo: string } | null;
};

// Diseno sobrio: azul del logo para titulos, grises para lo secundario, lineas finas.
const AZUL = azulLogo;
const TEXTO = '#1f2937';
const GRIS = '#6b7280';
const LINEA = '#d1d5db';
const CABECERA = '#eef1f5';
const ROJO = '#9b1c1c';

// Sin `lineHeight` en la hoja: con el, el numero de pagina del pie (texto con `render`) no se dibuja.
const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9.5, color: TEXTO, paddingTop: 36, paddingBottom: 60, paddingHorizontal: 40 },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: `1.5px solid ${AZUL}` },
  tituloBloque: { alignItems: 'flex-end' },
  tituloEtiqueta: { fontSize: 9, letterSpacing: 2, color: GRIS, fontFamily: 'Helvetica-Bold' },
  tituloNumero: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: AZUL, marginTop: 2 },
  anulada: { border: '1px solid #9b1c1c', padding: 7, marginTop: 12 },
  anuladaTexto: { color: ROJO, fontFamily: 'Helvetica-Bold', fontSize: 9.5 },

  ruta: { flexDirection: 'row', marginTop: 16, borderBottom: `1px solid ${LINEA}`, paddingBottom: 12 },
  sede: { flex: 1 },
  sedeDerecha: { flex: 1, paddingLeft: 16, borderLeft: `1px solid ${LINEA}` },
  etiqueta: { fontSize: 7.5, letterSpacing: 1.2, color: GRIS, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  sedeNombre: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: AZUL, marginBottom: 3 },
  sedeLinea: { fontSize: 9, lineHeight: 1.35, color: GRIS },
  sedeValor: { color: TEXTO, fontFamily: 'Helvetica-Bold' },

  datos: { flexDirection: 'row', paddingVertical: 10, borderBottom: `1px solid ${LINEA}`, marginBottom: 16 },
  dato: { flex: 1 },
  datoValor: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: TEXTO },

  seccionTitulo: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: AZUL, marginBottom: 5, marginTop: 4 },

  tabla: { marginBottom: 16 },
  tablaCabecera: { flexDirection: 'row', backgroundColor: CABECERA, borderTop: `1px solid ${LINEA}`, borderBottom: `1px solid ${LINEA}`, paddingVertical: 5, paddingHorizontal: 6 },
  cabeceraCelda: { color: AZUL, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6 },
  fila: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, alignItems: 'flex-start', borderBottom: `0.5px solid ${LINEA}` },
  celda: { fontSize: 8.5, lineHeight: 1.35 },
  numeroFila: { color: GRIS },
  principal: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, lineHeight: 1.35, color: TEXTO },
  secundario: { fontSize: 8, lineHeight: 1.35, color: GRIS },
  serie: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  cargador: { fontSize: 7.5, lineHeight: 1.35, color: GRIS, marginTop: 1 },
  cantidad: { fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'center' },

  observaciones: { borderTop: `1px solid ${LINEA}`, paddingTop: 8 },
  pieLinea: { position: 'absolute', left: 40, right: 40, bottom: 40, borderTop: `1px solid ${LINEA}` },
  pie: { position: 'absolute', left: 40, bottom: 26, fontSize: 7.5, color: GRIS },
});

// Ancho de las columnas de equipos y de Kit/EPP (cada una suma 100%).
const COL_EQUIPOS = { n: '5%', equipo: '30%', serie: '22%', specs: '31%', estado: '12%' } as const;
const COL_KIT = { n: '6%', articulo: '54%', categoria: '25%', cantidad: '15%' } as const;

// El estado va en texto; solo "Perdido" se resalta.
const ESTILO_ESTADO: Record<string, { color: string; fontFamily?: string }> = {
  Perdido: { color: ROJO, fontFamily: 'Helvetica-Bold' },
};

const CATEGORIA_KIT: Record<string, string> = { kit_bienvenida: 'Kit de bienvenida', epp: 'EPP' };

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={s.dato}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <Text style={s.datoValor}>{valor}</Text>
    </View>
  );
}

function Seccion({ titulo, cantidad }: { titulo: string; cantidad: string }) {
  return (
    <Text style={s.seccionTitulo} minPresenceAhead={60}>
      {titulo} <Text style={{ color: GRIS, fontFamily: 'Helvetica' }}>({cantidad})</Text>
    </Text>
  );
}

/**
 * Guia de despacho para acompanar el paquete (SPEC 2.108, 2.145, 2.157): diseno
 * sobrio. Dice de donde sale, a donde va, quien recibe, la OT de Chilexpress y
 * lo que viaja (equipos y Kit/EPP). No lleva firmas.
 */
export function GuiaDespachoTemplate(p: Props) {
  const unidadesKit = p.kit.reduce((suma, k) => suma + k.cantidad, 0);
  return (
    <Document title={`Guía de despacho ${p.numero}`} author={EMPRESA.nombre}>
      <Page size="A4" style={s.page}>
        <View style={s.encabezado}>
          <LogoSCL margenInferior={0} />
          <View style={s.tituloBloque}>
            <Text style={s.tituloEtiqueta}>GUÍA DE DESPACHO</Text>
            <Text style={s.tituloNumero}>N° {p.numero}</Text>
          </View>
        </View>

        {p.anulada && (
          <View style={s.anulada}>
            <Text style={s.anuladaTexto}>
              GUÍA ANULADA el {p.anulada.fecha}: {p.anulada.motivo}
            </Text>
          </View>
        )}

        <View style={s.ruta}>
          <View style={s.sede}>
            <Text style={s.etiqueta}>ORIGEN</Text>
            <Text style={s.sedeNombre}>{p.sedeOrigen}</Text>
            <Text style={s.sedeLinea}>
              Despacha: <Text style={s.sedeValor}>{p.emisor}</Text>
            </Text>
          </View>
          <View style={s.sedeDerecha}>
            <Text style={s.etiqueta}>DESTINO</Text>
            <Text style={s.sedeNombre}>{p.sedeDestino}</Text>
            <Text style={s.sedeLinea}>
              Recibe: <Text style={s.sedeValor}>{p.receptorNombre}</Text>
            </Text>
            <Text style={s.sedeLinea}>RUT {p.receptorRut}</Text>
          </View>
        </View>

        <View style={s.datos}>
          <Dato etiqueta="FECHA DE DESPACHO" valor={p.fecha} />
          <Dato etiqueta="TRANSPORTE" valor="Chilexpress" />
          <Dato etiqueta="OT N°" valor={p.otChilexpress} />
          <Dato etiqueta="LLEGADA ESTIMADA" valor={p.fechaEstimadaLlegada ?? 'Por confirmar'} />
        </View>

        {p.equipos.length > 0 && (
          <>
            <Seccion titulo="Equipos despachados" cantidad={String(p.equipos.length)} />
            <View style={s.tabla}>
              <View style={s.tablaCabecera} fixed>
                <Text style={[s.cabeceraCelda, { width: COL_EQUIPOS.n }]}>N°</Text>
                <Text style={[s.cabeceraCelda, { width: COL_EQUIPOS.equipo }]}>EQUIPO</Text>
                <Text style={[s.cabeceraCelda, { width: COL_EQUIPOS.serie }]}>N° DE SERIE / IMEI</Text>
                <Text style={[s.cabeceraCelda, { width: COL_EQUIPOS.specs }]}>ESPECIFICACIONES</Text>
                <Text style={[s.cabeceraCelda, { width: COL_EQUIPOS.estado }]}>ESTADO</Text>
              </View>
              {p.equipos.map((e, i) => (
                <View key={i} style={s.fila} wrap={false}>
                  <Text style={[s.celda, s.numeroFila, { width: COL_EQUIPOS.n }]}>{i + 1}</Text>
                  <View style={{ width: COL_EQUIPOS.equipo, paddingRight: 6 }}>
                    <Text style={s.principal}>
                      {e.marca} {e.descripcion}
                    </Text>
                    <Text style={s.secundario}>{e.equipo}</Text>
                    {e.cargador && (
                      <Text style={s.cargador}>
                        Incluye cargador ({e.cargador.condicion}
                        {e.cargador.observacion ? `: ${e.cargador.observacion}` : ''})
                      </Text>
                    )}
                  </View>
                  <Text style={[s.celda, s.serie, { width: COL_EQUIPOS.serie, paddingRight: 6 }]}>{e.numeroSerie || '—'}</Text>
                  <Text style={[s.celda, { width: COL_EQUIPOS.specs, paddingRight: 6, color: GRIS }]}>{e.especificaciones || '—'}</Text>
                  <Text style={[s.celda, { width: COL_EQUIPOS.estado }, ESTILO_ESTADO[e.estado] ?? {}]}>{e.estado}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {p.kit.length > 0 && (
          <>
            <Seccion titulo="Kit / EPP despachado" cantidad={`${unidadesKit} ${unidadesKit === 1 ? 'unidad' : 'unidades'}`} />
            <View style={s.tabla}>
              <View style={s.tablaCabecera} fixed>
                <Text style={[s.cabeceraCelda, { width: COL_KIT.n }]}>N°</Text>
                <Text style={[s.cabeceraCelda, { width: COL_KIT.articulo }]}>ARTÍCULO</Text>
                <Text style={[s.cabeceraCelda, { width: COL_KIT.categoria }]}>TIPO</Text>
                <Text style={[s.cabeceraCelda, { width: COL_KIT.cantidad, textAlign: 'center' }]}>CANTIDAD</Text>
              </View>
              {p.kit.map((k, i) => (
                <View key={i} style={s.fila} wrap={false}>
                  <Text style={[s.celda, s.numeroFila, { width: COL_KIT.n }]}>{i + 1}</Text>
                  <Text style={[s.celda, s.principal, { width: COL_KIT.articulo, paddingRight: 6 }]}>{k.articulo}</Text>
                  <Text style={[s.celda, { width: COL_KIT.categoria, color: GRIS }]}>{CATEGORIA_KIT[k.categoria] ?? k.categoria}</Text>
                  <Text style={[s.cantidad, { width: COL_KIT.cantidad }]}>{k.cantidad}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {p.observaciones.trim() !== '' && (
          <View style={s.observaciones} wrap={false}>
            <Text style={s.etiqueta}>OBSERVACIONES</Text>
            <Text style={s.celda}>{p.observaciones}</Text>
          </View>
        )}

        {/* Pie en cada hoja. Ojo: si la hoja lleva `lineHeight`, el texto con `render` (numero de
            pagina) no se dibuja; por eso la hoja no define interlineado. */}
        <View fixed style={s.pieLinea} />
        <Text
          fixed
          style={s.pie}
          render={({ pageNumber, totalPages }) =>
            `${EMPRESA.nombre} · RUT ${EMPRESA.rut} · Guía ${p.numero} · Página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
