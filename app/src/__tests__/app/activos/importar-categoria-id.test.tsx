import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportarActivosPage from '@/app/(dashboard)/activos/importar/page';

const mockFetch = global.fetch as jest.Mock;

describe('importación de activos — categoría estable', () => {
  test('resuelve la categoría elegida del catálogo y envía su categoriaId a la vista previa', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/categorias') {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: 'cat-laptop',
              nombre: 'Laptop',
              descripcion: null,
              requiereSerie: true,
              requiereImei: false,
              tipoDevolucion: 'notebook',
            },
          ],
        });
      }

      if (url === '/api/activos/importar/sheets') {
        return Promise.resolve({ ok: true, json: async () => ({ sheets: ['Hoja1'] }) });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ headers: ['Marca', 'Modelo', 'Serie'], rows: [], totalRows: 0 }),
      });
    });

    const { container } = render(<ImportarActivosPage />);
    const file = new File(['contenido'], 'activos.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = container.querySelector('input[type="file"]');
    if (!fileInput) throw new Error('Input de archivo no encontrado');

    fireEvent.change(fileInput, { target: { files: [file] } });
    await screen.findByDisplayValue('Hoja1');

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'cat-laptop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/activos/importar/preview',
        expect.objectContaining({ method: 'POST' })
      )
    );

    const previewCall = mockFetch.mock.calls.find(
      ([url]) => url === '/api/activos/importar/preview'
    );
    const body = previewCall?.[1]?.body as FormData;
    expect(body.get('categoriaId')).toBe('cat-laptop');
    expect(body.get('categoria')).toBeNull();
  });
});
