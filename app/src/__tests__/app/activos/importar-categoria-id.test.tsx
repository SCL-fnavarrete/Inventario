import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  test('descarta una vista previa de A si se cambia a B antes de recibirla', async () => {
    let resolvePreview: ((value: { ok: boolean; json: () => Promise<unknown> }) => void) | undefined;
    const previewResponse = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolvePreview = resolve;
    });

    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/categorias') {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: 'cat-a',
              nombre: 'Laptop',
              descripcion: null,
              requiereSerie: true,
              requiereImei: false,
              tipoDevolucion: 'notebook',
            },
            {
              id: 'cat-b',
              nombre: 'Monitor',
              descripcion: null,
              requiereSerie: true,
              requiereImei: false,
              tipoDevolucion: 'monitor',
            },
          ],
        });
      }

      if (url === '/api/activos/importar/sheets') {
        return Promise.resolve({ ok: true, json: async () => ({ sheets: ['Hoja1'] }) });
      }

      return previewResponse;
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
    fireEvent.change(selects[1], { target: { value: 'cat-a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/activos/importar/preview',
        expect.objectContaining({ method: 'POST' })
      )
    );

    fireEvent.change(selects[1], { target: { value: 'cat-b' } });
    await act(async () => {
      resolvePreview?.({
        ok: true,
        json: async () => ({
          headers: ['Marca', 'Modelo', 'Serie'],
          rows: [],
          totalRows: 0,
        }),
      });
      await previewResponse;
    });

    expect(screen.queryByText('Paso 2: Mapeo de Columnas')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vista previa' })).toBeInTheDocument();
  });

  test('mantiene las hojas de B cuando la respuesta tardía de A llega después', async () => {
    let resolveSheetsA:
      | ((value: { ok: boolean; json: () => Promise<{ sheets: string[] }> }) => void)
      | undefined;
    const sheetsA = new Promise<{ ok: boolean; json: () => Promise<{ sheets: string[] }> }>(
      (resolve) => {
        resolveSheetsA = resolve;
      }
    );
    let sheetRequestCount = 0;

    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/categorias') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }

      if (url === '/api/activos/importar/sheets') {
        sheetRequestCount += 1;
        if (sheetRequestCount === 1) return sheetsA;
        return Promise.resolve({ ok: true, json: async () => ({ sheets: ['Hoja B'] }) });
      }

      throw new Error(`Fetch inesperado: ${url}`);
    });

    const { container } = render(<ImportarActivosPage />);
    const fileInput = container.querySelector('input[type="file"]');
    if (!fileInput) throw new Error('Input de archivo no encontrado');

    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(['A'], 'archivo-a.xlsx', {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        ],
      },
    });
    await waitFor(() => expect(sheetRequestCount).toBe(1));

    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(['B'], 'archivo-b.xlsx', {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        ],
      },
    });
    await screen.findByDisplayValue('Hoja B');

    await act(async () => {
      resolveSheetsA?.({ ok: true, json: async () => ({ sheets: ['Hoja A'] }) });
      await sheetsA;
    });

    expect(screen.getByDisplayValue('Hoja B')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Hoja A')).not.toBeInTheDocument();
  });
});
