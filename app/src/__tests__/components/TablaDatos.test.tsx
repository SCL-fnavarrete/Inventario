// La tabla común de las listas: filas, estados, acciones, fila que se expande y paginación.
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { TablaDatos, type ColumnaDatos } from '@/shared/ui/TablaDatos';

type Fila = { id: string; nombre: string; cargo: string };
const FILAS: Fila[] = [
  { id: '1', nombre: 'Ana', cargo: 'Analista' },
  { id: '2', nombre: 'Beto', cargo: 'Jefe' },
];
const COLUMNAS: ColumnaDatos<Fila>[] = [
  { titulo: 'Nombre', celda: (f) => f.nombre },
  { titulo: 'Cargo', celda: (f) => f.cargo },
];

describe('TablaDatos', () => {
  test('muestra el encabezado y una fila por elemento', () => {
    render(<TablaDatos items={FILAS} clave={(f) => f.id} columnas={COLUMNAS} vacio="Sin datos" />);
    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Beto')).toBeInTheDocument();
    expect(screen.getByText('Jefe')).toBeInTheDocument();
  });

  test('sin filas dice el mensaje; cargando muestra el indicador', () => {
    const { rerender } = render(<TablaDatos items={[]} clave={(f: Fila) => f.id} columnas={COLUMNAS} vacio="Sin datos" />);
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
    rerender(<TablaDatos items={[]} clave={(f: Fila) => f.id} columnas={COLUMNAS} vacio="Sin datos" cargando />);
    expect(screen.queryByText('Sin datos')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
  });

  test('las acciones salen en cada fila', () => {
    render(<TablaDatos items={FILAS} clave={(f) => f.id} columnas={COLUMNAS} vacio="x" acciones={(f) => <button>Ver {f.nombre}</button>} />);
    expect(screen.getByText('Acciones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver Ana' })).toBeInTheDocument();
  });

  test('la fila se expande y se contrae', () => {
    function Prueba() {
      const [abierta, setAbierta] = useState<string | null>(null);
      return (
        <TablaDatos
          items={FILAS}
          clave={(f) => f.id}
          columnas={COLUMNAS}
          vacio="x"
          expandible={{
            abierta: (f) => abierta === f.id,
            alternar: (f) => setAbierta(abierta === f.id ? null : f.id),
            contenido: (f) => <p>Detalle de {f.nombre}</p>,
          }}
        />
      );
    }
    render(<Prueba />);
    expect(screen.queryByText('Detalle de Ana')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Expandir' })[0]);
    expect(screen.getByText('Detalle de Ana')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Contraer' }));
    expect(screen.queryByText('Detalle de Ana')).not.toBeInTheDocument();
  });

  test('con tarjeta, en celular también lista cada fila', () => {
    render(<TablaDatos items={FILAS} clave={(f) => f.id} columnas={COLUMNAS} vacio="x" tarjeta={(f) => <span>Tarjeta {f.nombre}</span>} />);
    expect(screen.getByText('Tarjeta Ana')).toBeInTheDocument();
  });

  test('la paginación avisa la página elegida', () => {
    const alCambiar = jest.fn();
    render(
      <TablaDatos
        items={FILAS}
        clave={(f) => f.id}
        columnas={COLUMNAS}
        vacio="x"
        paginacion={{ current: 1, pages: 3, total: 50, limit: 20, itemLabel: 'personas', onPageChange: alCambiar }}
      />
    );
    expect(screen.getByText(/Mostrando 1 a 20 de 50 personas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(alCambiar).toHaveBeenCalledWith(2);
  });
});
