/** @jest-environment node */

/**
 * El generador es una funcion del snapshot y de nada mas.
 *
 * Antes cada generador leia Prisma en el momento de la descarga y estampaba
 * `new Date()` en el pie: dos descargas del mismo documento daban PDFs
 * distintos, y renombrar una categoria cambiaba un acta ya firmada. Estas
 * pruebas fijan lo contrario y son la base del hash SHA-256 que archiva el
 * documento.
 *
 * `@react-pdf/renderer` es ESM con WASM (yoga) y no carga bajo Jest, asi que
 * se sustituye por primitivas inertes: lo que se verifica aqui es el arbol de
 * props que el generador construye, que es donde vive la logica. El
 * determinismo byte a byte del render real se apoya en `creationDate`, que
 * estas pruebas exigen que venga del snapshot.
 */

jest.mock('@react-pdf/renderer', () => ({
  __esModule: true,
  renderToBuffer: jest.fn(async () => Buffer.from('%PDF-fake')),
  Document: 'DOCUMENT',
  Page: 'PAGE',
  Text: 'TEXT',
  View: 'VIEW',
  Image: 'IMAGE',
  StyleSheet: { create: (estilos: unknown) => estilos },
}));

jest.mock('@/lib/prisma', () => ({
  get prisma(): never {
    throw new Error('El generador de documentos no puede consultar la base de datos');
  },
}));

import { renderToBuffer } from '@react-pdf/renderer';
import { generarPdfDesdeSnapshot } from '@/lib/services/documentGeneratorService';
import {
  actaDevolucionSnapshot,
  anexoEntregaSnapshot,
  comprobanteCambioSnapshot,
  comprobanteEntregaSnapshot,
} from '@/test-utils/documentSnapshot';
import type { DocumentoSnapshot } from '@/lib/documents/snapshot';

const TODOS = () => [
  anexoEntregaSnapshot(),
  comprobanteEntregaSnapshot(),
  comprobanteCambioSnapshot(),
  actaDevolucionSnapshot(),
];

const render = renderToBuffer as unknown as jest.Mock;

type Nodo = unknown;

/**
 * Resuelve el arbol que el generador entrega a `renderToBuffer`.
 *
 * `React.createElement(Plantilla, props)` es perezoso: sin resolver los
 * componentes de funcion, el arbol no tiene ni el `<Document>` ni el texto, y
 * cualquier asercion pasaria por vacuidad. Aqui se ejecutan las plantillas
 * reales con las primitivas de `@react-pdf` inertes.
 */
function resolver(nodo: Nodo): Nodo {
  if (nodo === null || nodo === undefined || typeof nodo !== 'object') return nodo;
  if (Array.isArray(nodo)) return nodo.map(resolver);
  const elemento = nodo as { type?: unknown; props?: Record<string, unknown> };
  if (typeof elemento.type === 'function') {
    return resolver((elemento.type as (p: unknown) => Nodo)(elemento.props));
  }
  if (!elemento.props) return nodo;
  return {
    type: elemento.type,
    props: { ...elemento.props, children: resolver(elemento.props.children) },
  };
}

function arbolRenderizado() {
  const raiz = render.mock.calls[render.mock.calls.length - 1][0];
  return resolver(raiz) as { props: Record<string, unknown> };
}

function textoPlano(nodo: Nodo): string {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return '';
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoPlano).join(' ');
  const props = (nodo as { props?: { children?: Nodo } }).props;
  return props ? textoPlano(props.children) : '';
}

beforeEach(() => {
  render.mockClear();
});

describe('comprobante de cambio — no afirma lo que el snapshot no dice', () => {
  test('imprime el estado con que volvió el equipo, no un "Devolución OK" fijo', async () => {
    // La cláusula del anexo hace responsable al trabajador por daños con valores
    // de reposición tasados. Un documento firmado que dice que el equipo volvió
    // OK cuando volvió dañado borra justo el dato que después se disputa.
    await generarPdfDesdeSnapshot(
      comprobanteCambioSnapshot({
        equipoAnterior: {
          ...comprobanteCambioSnapshot().equipoAnterior!,
          estadoDevolucion: 'danado',
        },
      })
    );

    const texto = textoPlano(arbolRenderizado());
    expect(texto).toMatch(/dañado/i);
    expect(texto).not.toMatch(/Devolución OK/i);
  });

  test('sin equipo anterior no dibuja una devolución que nunca ocurrió', async () => {
    // El builder devolvía `null` correctamente y el generador lo sustituía por
    // una fila de guiones: el documento mostraba la tabla "Equipo Devuelto
    // (Anterior)" completa, con la etiqueta "Devolución OK".
    await generarPdfDesdeSnapshot(comprobanteCambioSnapshot({ equipoAnterior: null }));

    const texto = textoPlano(arbolRenderizado());
    expect(texto).not.toMatch(/Equipo Devuelto/i);
  });
});

describe('plantillas de entrega y devolución — etiquetas de evidencia', () => {
  test.each([
    ['nuevo', 'Nuevo'],
    ['usado', 'Usado'],
    ['danado', 'Dañado'],
  ])('traduce la condición %s como %s en los documentos de entrega', async (condicion, etiqueta) => {
    const activo = { ...anexoEntregaSnapshot().activos[0], condicion };

    await generarPdfDesdeSnapshot(anexoEntregaSnapshot({ activos: [activo] }));
    expect(textoPlano(arbolRenderizado())).toContain(etiqueta);

    await generarPdfDesdeSnapshot(comprobanteEntregaSnapshot({ activos: [activo] }));
    expect(textoPlano(arbolRenderizado())).toContain(etiqueta);
  });

  test('traduce incompleto en el acta de devolución sin filtrar el enum crudo', async () => {
    await generarPdfDesdeSnapshot(
      actaDevolucionSnapshot({
        activos: [{ ...actaDevolucionSnapshot().activos[0], estadoDevolucion: 'incompleto' }],
      })
    );

    const texto = textoPlano(arbolRenderizado());
    expect(texto).toContain('Incompleto');
    expect(texto).not.toMatch(/\bincompleto\b/);
  });

  test('conserva No OK para un equipo devuelto dañado', async () => {
    // Cambiar esta etiqueta altera una redacción existente del acta que no es
    // parte del quick win de `incompleto`.
    await generarPdfDesdeSnapshot(
      actaDevolucionSnapshot({
        activos: [{ ...actaDevolucionSnapshot().activos[0], estadoDevolucion: 'danado' }],
      })
    );

    expect(textoPlano(arbolRenderizado())).toContain('No OK');
  });
});

describe('generarPdfDesdeSnapshot — el snapshot es el documento', () => {
  test('no consulta la base de datos para ninguno de los cuatro tipos', async () => {
    for (const snapshot of TODOS()) {
      await expect(generarPdfDesdeSnapshot(snapshot)).resolves.toBeInstanceOf(Buffer);
    }
  });

  test('sella la fecha de creacion del PDF con la emision del snapshot', async () => {
    for (const snapshot of TODOS()) {
      await generarPdfDesdeSnapshot(snapshot);
      expect(arbolRenderizado().props.creationDate).toEqual(new Date(snapshot.emitidoEn));
    }
  });

  test('fija productor y creador para que no dependan de la version del entorno', async () => {
    await generarPdfDesdeSnapshot(anexoEntregaSnapshot());
    const props = arbolRenderizado().props;
    expect(props.producer).toBe('Inventario IT SCL');
    expect(props.creator).toBe('Inventario IT SCL');
  });

  test('dos renders del mismo snapshot construyen el mismo arbol', async () => {
    const snapshot = anexoEntregaSnapshot();
    await generarPdfDesdeSnapshot(snapshot);
    const primero = arbolRenderizado();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await generarPdfDesdeSnapshot(snapshot);
    expect(arbolRenderizado()).toEqual(primero);
  });

  test('el pie declara la emision del snapshot, no el momento de la descarga', async () => {
    for (const snapshot of TODOS()) {
      await generarPdfDesdeSnapshot(snapshot);
      const texto = textoPlano(arbolRenderizado());
      expect(texto).toContain('DOC-2026-0001');
      expect(texto).toContain('04-03-2026');
    }
  });

  test('la categoria que muestra es la observada al emitir, no la actual', async () => {
    await generarPdfDesdeSnapshot(
      anexoEntregaSnapshot({
        activos: [
          { ...anexoEntregaSnapshot().activos[0], categoriaNombre: 'Notebook corporativo 2026' },
        ],
      })
    );
    expect(textoPlano(arbolRenderizado())).toContain('Notebook corporativo 2026');
  });

  test('dibuja la firma del snapshot y declara la aceptacion de la politica', async () => {
    await generarPdfDesdeSnapshot(anexoEntregaSnapshot());
    const texto = textoPlano(arbolRenderizado());
    expect(texto).toMatch(/política de uso/i);
    expect(JSON.stringify(arbolRenderizado())).toContain('data:image/png;base64,');
  });

  test('un snapshot sin firma no inventa una: lo declara', async () => {
    await generarPdfDesdeSnapshot(
      anexoEntregaSnapshot({ firma: { imagenPng: null, firmadaEn: null } })
    );
    expect(JSON.stringify(arbolRenderizado())).not.toContain('data:image/png;base64,');
  });

  test('acepta una firma ausente pero rechaza una firma que no cumple el contrato PNG', async () => {
    await expect(
      generarPdfDesdeSnapshot(anexoEntregaSnapshot({ firma: { imagenPng: null, firmadaEn: null } }))
    ).resolves.toBeInstanceOf(Buffer);

    await expect(
      generarPdfDesdeSnapshot(
        anexoEntregaSnapshot({
          firma: {
            imagenPng: 'https://example.com/firma.png',
            firmadaEn: '2026-03-04T12:30:00.000Z',
          },
        })
      )
    ).rejects.toThrow();
  });

  test('rechaza un tipo de snapshot desconocido en vez de emitir un PDF vacio', async () => {
    await expect(
      generarPdfDesdeSnapshot({
        ...anexoEntregaSnapshot(),
        tipo: 'inventado',
      } as unknown as DocumentoSnapshot)
    ).rejects.toThrow(/tipo de documento/i);
  });
});
