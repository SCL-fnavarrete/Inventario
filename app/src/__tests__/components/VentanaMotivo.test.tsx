// Ventana que pide un motivo obligatorio (SPEC 2.104): reemplaza window.prompt.
import { fireEvent, render, screen } from '@testing-library/react';
import { VentanaMotivo } from '@/components/ui/VentanaMotivo';

function abrir(onConfirm = jest.fn()) {
  render(
    <VentanaMotivo
      isOpen
      onClose={() => {}}
      onConfirm={onConfirm}
      titulo="Cancelar solicitud"
      textoConfirmar="Confirmar cancelación"
    />
  );
  return onConfirm;
}

test('sin motivo no confirma: marca el campo en rojo', () => {
  const onConfirm = abrir();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByText('Escribe el motivo')).toBeTruthy();
  expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
});

test('con motivo confirma, sin espacios sobrantes', () => {
  const onConfirm = abrir();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Ticket duplicado ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
  expect(onConfirm).toHaveBeenCalledWith('Ticket duplicado');
});
