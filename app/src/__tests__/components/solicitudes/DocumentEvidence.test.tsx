import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentEvidence from '@/components/solicitudes/DocumentEvidence';

/**
 * La ficha de la solicitud no mostraba nada de los documentos emitidos, y las
 * rutas de descarga y reintento no tenían ningún consumidor. Si SharePoint caía
 * durante la entrega, los documentos quedaban `fallido`, el operador veía una
 * solicitud que avanzó normalmente, y nadie podía repararlo desde la aplicación.
 */

const ARCHIVADO = {
  id: 'documento-1',
  numero: 'DOC-2026-0001',
  tipo: 'anexo_entrega',
  version: 1,
  archivoEstado: 'archivado' as const,
  archivoError: null,
  intentosArchivo: 1,
  emitidoPor: 'Tecnico TI',
  emitidoEn: '2026-03-04T12:34:56.000Z',
  motivoReemision: null,
};

const FALLIDO = {
  ...ARCHIVADO,
  id: 'documento-2',
  numero: 'DOC-2026-0002',
  tipo: 'comprobante_entrega',
  archivoEstado: 'fallido' as const,
  archivoError: 'No se pudo archivar el documento en SharePoint: 403 (request-id req-9)',
  intentosArchivo: 2,
};

describe('DocumentEvidence', () => {
  test('un documento archivado se puede descargar por la ruta que ya existía', () => {
    render(
      <DocumentEvidence
        solicitudId="request-1"
        documentos={[ARCHIVADO]}
        puedeReintentar
        onReintentar={jest.fn()}
      />
    );

    const enlace = screen.getByRole('link', { name: /descargar/i });
    expect(enlace).toHaveAttribute('href', '/api/solicitudes/request-1/documento/anexo_entrega');
    expect(screen.getByText(/DOC-2026-0001 v1/)).toBeInTheDocument();
  });

  test('un documento que no se pudo archivar muestra el error y deja reintentar', async () => {
    const reintentar = jest.fn();
    render(
      <DocumentEvidence
        solicitudId="request-1"
        documentos={[FALLIDO]}
        puedeReintentar
        onReintentar={reintentar}
      />
    );

    // El error saneado de Graph y la etiqueta del estado son dos cosas: la
    // etiqueta dice que fallo, el error dice por que.
    expect(screen.getByText(/request-id req-9/)).toBeInTheDocument();
    expect(screen.getByText(/DOC-2026-0002 v1 .* No se pudo archivar/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /reintentar archivo/i }));
    expect(reintentar).toHaveBeenCalledWith('comprobante_entrega');
  });

  test('distingue "falta archivarlo" de "no hay documento"', () => {
    // El documento existe, es válido y su contenido es inmutable: lo que falta
    // es la copia externa. Leerlo como "no hay acta" llevaría a reemitir, que es
    // justo lo que no corresponde.
    render(
      <DocumentEvidence
        solicitudId="request-1"
        documentos={[FALLIDO]}
        puedeReintentar
        onReintentar={jest.fn()}
      />
    );

    expect(screen.getByText(/está emitido y su contenido es inmutable/i)).toBeInTheDocument();
  });

  test('un archivado no ofrece reintento', () => {
    render(
      <DocumentEvidence
        solicitudId="request-1"
        documentos={[ARCHIVADO]}
        puedeReintentar
        onReintentar={jest.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  });

  test('sin permiso de escritura no aparece el reintento', () => {
    render(
      <DocumentEvidence
        solicitudId="request-1"
        documentos={[FALLIDO]}
        puedeReintentar={false}
        onReintentar={jest.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  });

  test('sin documentos lo dice, y dice cuándo se emiten', () => {
    render(
      <DocumentEvidence
        solicitudId="request-1"
        documentos={[]}
        puedeReintentar
        onReintentar={jest.fn()}
      />
    );

    expect(screen.getByText(/todavía no ha emitido documentos/i)).toBeInTheDocument();
  });
});
