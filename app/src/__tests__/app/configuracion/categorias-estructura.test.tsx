import { fireEvent, render, screen } from '@testing-library/react';
import CategoriasPage from '@/app/(dashboard)/configuracion/categorias/page';

const mockFetch = global.fetch as jest.Mock;

describe('configuración de categorías', () => {
  test('ubica descripción y tipo de devolución bajo sus encabezados correspondientes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'cat-1',
          nombre: 'Laptop',
          descripcion: 'Equipo portátil para consultoría',
          tipoDevolucion: 'notebook',
          requiereSerie: true,
          requiereImei: false,
          _count: { assets: 0 },
        },
      ],
    });

    const { container } = render(<CategoriasPage />);
    await screen.findByText('Equipo portátil para consultoría');

    fireEvent.click(screen.getByTitle('Editar'));

    const headers = Array.from(container.querySelectorAll('thead th')).map((header) =>
      header.textContent?.trim()
    );
    const cells = Array.from(container.querySelectorAll('tbody tr td'));
    const descriptionCell = cells[headers.indexOf('Descripción')];
    const typeCell = cells[headers.indexOf('Tipo devolución')];

    expect(descriptionCell.querySelector('input')?.value).toBe('Equipo portátil para consultoría');
    expect(typeCell.querySelector('select')?.value).toBe('notebook');
  });
});
