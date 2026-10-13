import { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/shared/ui/Modal';

// Un modal con la funcion de cerrar escrita en linea (nueva en cada dibujo del
// padre), como en las pantallas: escribir no debe quitarle el foco al campo.
function Pantalla() {
  const [abierto, setAbierto] = useState(false);
  const [contador, setContador] = useState(0);
  return (
    <div>
      <button onClick={() => setAbierto(true)}>Abrir</button>
      <span data-testid="contador">{contador}</span>
      <Modal isOpen={abierto} onClose={() => setAbierto(false)} title="Ventana">
        <input aria-label="Marca" onChange={() => setContador((c) => c + 1)} />
        <input aria-label="Modelo" />
      </Modal>
    </div>
  );
}

describe('Modal', () => {
  beforeEach(() => {
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  test('al escribir con el padre redibujándose, el foco se queda en el campo', async () => {
    const user = userEvent.setup();
    render(<Pantalla />);
    await user.click(screen.getByText('Abrir'));
    const modelo = screen.getByLabelText('Modelo');
    await user.click(modelo);
    expect(modelo).toHaveFocus();
    await user.keyboard('abc');
    expect(screen.getByTestId('contador')).toHaveTextContent('0');
    await act(async () => {
      await user.type(screen.getByLabelText('Marca'), 'xyz');
    });
    expect(screen.getByTestId('contador')).toHaveTextContent('3');
    expect(screen.getByLabelText('Marca')).toHaveFocus();
    expect(screen.getByLabelText('Marca')).toHaveValue('xyz');
  });

  test('al cerrar devuelve el foco al botón que lo abrió', async () => {
    const user = userEvent.setup();
    render(<Pantalla />);
    const abrir = screen.getByText('Abrir');
    await user.click(abrir);
    await user.keyboard('{Escape}');
    expect(abrir).toHaveFocus();
  });
});
