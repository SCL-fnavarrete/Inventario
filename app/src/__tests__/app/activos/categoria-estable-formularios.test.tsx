import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  use: () => ({ id: 'asset-1' }),
}));

import NuevoActivoPage from '@/app/(dashboard)/activos/nuevo/page';
import EditarActivoPage from '@/app/(dashboard)/activos/[id]/editar/page';

const mockFetch = global.fetch as jest.Mock;

type Category = {
  id: string;
  nombre: string;
  tipoDevolucion: 'notebook' | 'monitor' | 'otro';
};

function mockCategoryResponses(category: Category, categoriaId = category.id) {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/categorias') {
      return Promise.resolve({ ok: true, json: async () => [category] });
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({
        categoriaId,
        marca: 'Lenovo',
        modelo: 'T14',
        estado: 'disponible',
        condicion: 'nuevo',
      }),
    });
  });
}

function categorySelect(container: HTMLElement): HTMLSelectElement {
  const select = container.querySelector<HTMLSelectElement>('select[name="categoriaId"]');
  if (!select) throw new Error('Selector de categoría no encontrado');
  return select;
}

describe('formularios de activo — categoría estable', () => {
  test('alta muestra especificaciones notebook para Laptop cuando su enum es notebook', async () => {
    mockCategoryResponses({ id: 'cat-laptop', nombre: 'Laptop', tipoDevolucion: 'notebook' });
    const { container } = render(<NuevoActivoPage />);

    await waitFor(() => expect(categorySelect(container).options).toHaveLength(2));
    fireEvent.change(categorySelect(container), { target: { value: 'cat-laptop' } });

    expect(
      screen.getByRole('heading', { name: 'Especificaciones Tecnicas - Notebook' })
    ).toBeInTheDocument();
  });

  test('alta no muestra especificaciones notebook para Notebook cuando su enum es otro', async () => {
    mockCategoryResponses({ id: 'cat-otro', nombre: 'Notebook', tipoDevolucion: 'otro' });
    const { container } = render(<NuevoActivoPage />);

    await waitFor(() => expect(categorySelect(container).options).toHaveLength(2));
    fireEvent.change(categorySelect(container), { target: { value: 'cat-otro' } });

    expect(
      screen.queryByRole('heading', { name: 'Especificaciones Tecnicas - Notebook' })
    ).not.toBeInTheDocument();
  });

  test('edición muestra especificaciones notebook para Laptop cuando su enum es notebook', async () => {
    mockCategoryResponses({ id: 'cat-laptop', nombre: 'Laptop', tipoDevolucion: 'notebook' });

    render(<EditarActivoPage params={Promise.resolve({ id: 'asset-1' })} />);

    expect(
      await screen.findByRole('heading', { name: 'Especificaciones Tecnicas - Notebook' })
    ).toBeInTheDocument();
  });

  test('edición no muestra especificaciones notebook para Notebook cuando su enum es otro', async () => {
    mockCategoryResponses({ id: 'cat-otro', nombre: 'Notebook', tipoDevolucion: 'otro' });

    render(<EditarActivoPage params={Promise.resolve({ id: 'asset-1' })} />);

    await screen.findByRole('heading', { name: 'Informacion General' });
    expect(
      screen.queryByRole('heading', { name: 'Especificaciones Tecnicas - Notebook' })
    ).not.toBeInTheDocument();
  });

  test('alta limpia especificaciones notebook ocultas al cambiar la categoría a monitor', async () => {
    const categories: Category[] = [
      { id: 'cat-laptop', nombre: 'Laptop', tipoDevolucion: 'notebook' },
      { id: 'cat-monitor', nombre: 'Monitor', tipoDevolucion: 'monitor' },
    ];
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/categorias') {
        return Promise.resolve({ ok: true, json: async () => categories });
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: 'asset-1' }) });
    });
    const { container } = render(<NuevoActivoPage />);

    await waitFor(() => expect(categorySelect(container).options).toHaveLength(3));
    fireEvent.change(categorySelect(container), { target: { value: 'cat-laptop' } });
    fireEvent.change(container.querySelector('input[name="procesador"]')!, {
      target: { value: 'Intel Core Ultra' },
    });
    fireEvent.change(categorySelect(container), { target: { value: 'cat-monitor' } });
    fireEvent.change(container.querySelector('input[name="marca"]')!, { target: { value: 'Dell' } });
    fireEvent.change(container.querySelector('input[name="modelo"]')!, { target: { value: 'P2723' } });
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/activos',
        expect.objectContaining({ method: 'POST' })
      )
    );
    const createCall = mockFetch.mock.calls.find(([url]) => url === '/api/activos');
    expect(JSON.parse(createCall?.[1]?.body)).toMatchObject({
      categoriaId: 'cat-monitor',
      procesador: null,
      ram: null,
      discoDuro: null,
      sistemaOperativo: null,
    });
  });

  test('edición limpia especificaciones notebook ocultas al cambiar la categoría a monitor', async () => {
    const categories: Category[] = [
      { id: 'cat-laptop', nombre: 'Laptop', tipoDevolucion: 'notebook' },
      { id: 'cat-monitor', nombre: 'Monitor', tipoDevolucion: 'monitor' },
    ];
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/categorias') {
        return Promise.resolve({ ok: true, json: async () => categories });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          categoriaId: 'cat-laptop',
          marca: 'Lenovo',
          modelo: 'T14',
          estado: 'disponible',
          condicion: 'nuevo',
          procesador: 'Intel Core Ultra',
          ram: '32 GB',
          discoDuro: '1 TB',
          sistemaOperativo: 'Windows 11',
        }),
      });
    });
    const { container } = render(<EditarActivoPage params={Promise.resolve({ id: 'asset-1' })} />);

    await screen.findByRole('heading', { name: 'Especificaciones Tecnicas - Notebook' });
    fireEvent.change(categorySelect(container), { target: { value: 'cat-monitor' } });
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/activos/asset-1',
        expect.objectContaining({ method: 'PUT' })
      )
    );
    const updateCall = mockFetch.mock.calls.find(
      ([url, options]) => url === '/api/activos/asset-1' && options?.method === 'PUT'
    );
    expect(JSON.parse(updateCall?.[1]?.body)).toMatchObject({
      categoriaId: 'cat-monitor',
      procesador: null,
      ram: null,
      discoDuro: null,
      sistemaOperativo: null,
    });
  });
});
