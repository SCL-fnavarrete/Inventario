import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuscadorEquipoExistente } from '@/modules/compras/componentes';

const equipo = (id: string, marca: string) => ({
  id,
  marca: { nombre: marca },
  modelo: 'X1',
  numeroSerie: `S-${id}`,
  estado: 'disponible',
  categoria: { nombre: 'Notebook' },
});

describe('BuscadorEquipoExistente', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [equipo('1', 'Dell'), equipo('2', 'HP')], pagination: { total: 2 } }),
    }) as unknown as typeof fetch;
  });

  test('muestra la lista al abrir, sin escribir, acotada a la sede', async () => {
    render(<BuscadorEquipoExistente sedeId="sede-1" excluirIds={[]} onElegir={jest.fn()} onCerrar={jest.fn()} />);
    expect(await screen.findByText('Dell X1')).toBeInTheDocument();
    expect(screen.getByText('HP X1')).toBeInTheDocument();
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('sedeId=sede-1');
  });

  test('deja fuera los equipos que ya están en la compra', async () => {
    render(<BuscadorEquipoExistente sedeId="sede-1" excluirIds={['1']} onElegir={jest.fn()} onCerrar={jest.fn()} />);
    expect(await screen.findByText('HP X1')).toBeInTheDocument();
    expect(screen.queryByText('Dell X1')).not.toBeInTheDocument();
  });

  test('al escribir busca con ese texto, y elegir entrega el equipo', async () => {
    const user = userEvent.setup();
    const onElegir = jest.fn();
    render(<BuscadorEquipoExistente sedeId="sede-1" excluirIds={[]} onElegir={onElegir} onCerrar={jest.fn()} />);
    await screen.findByText('Dell X1');
    await user.type(screen.getByLabelText('Buscar equipo'), 'dell');
    await waitFor(() =>
      expect((global.fetch as jest.Mock).mock.calls.some(([u]) => String(u).includes('search=dell'))).toBe(true)
    );
    await user.click(await screen.findByText('Dell X1'));
    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });
});
