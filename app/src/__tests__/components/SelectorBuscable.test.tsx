// Lista con buscador para elegir un equipo sin recorrerlos uno por uno (SPEC 2.138).
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { SelectorBuscable } from '@/shared/ui/SelectorBuscable';

type Equipo = { id: string; marca: string; modelo: string; serie: string | null };
const EQUIPOS: Equipo[] = [
  { id: '1', marca: 'Dell', modelo: 'Latitude 5420', serie: 'ABC123' },
  { id: '2', marca: 'HP', modelo: 'ProBook 450', serie: 'XYZ789' },
  { id: '3', marca: 'Lenovo', modelo: 'ThinkPad', serie: null },
];

function Prueba({ alElegir = jest.fn() }: { alElegir?: (id: string) => void }) {
  const [valor, setValor] = useState('');
  return (
    <SelectorBuscable
      opciones={EQUIPOS}
      value={valor}
      onChange={(id) => {
        setValor(id);
        alElegir(id);
      }}
      textoDe={(e) => [e.marca, e.modelo, e.serie]}
      etiquetaElegida={(e) => `${e.marca} ${e.modelo}`}
      renderOpcion={(e) => <span>{e.marca} {e.modelo}</span>}
      placeholder="Elegir equipo"
      buscar="Buscar equipo"
    />
  );
}

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Elegir equipo/ }));

test('muestra todas las opciones al abrir y se acortan al escribir (marca, modelo o serie, sin tildes ni mayúsculas)', () => {
  render(<Prueba />);
  abrir();
  expect(screen.getAllByRole('option')).toHaveLength(3);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'probook' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'abc123' } });
  expect(screen.getByRole('option').textContent).toContain('Dell');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dell 5420' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nada' } });
  expect(screen.queryAllByRole('option')).toHaveLength(0);
  expect(screen.getByText(/Nada coincide/)).toBeTruthy();
});

test('elige con un clic, queda en el botón y se puede quitar', () => {
  const alElegir = jest.fn();
  render(<Prueba alElegir={alElegir} />);
  abrir();
  fireEvent.click(screen.getByRole('option', { name: /HP ProBook/ }));
  expect(alElegir).toHaveBeenCalledWith('2');
  expect(screen.getByRole('button', { name: /HP ProBook 450/ })).toBeTruthy();
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Quitar la elección' }));
  expect(alElegir).toHaveBeenLastCalledWith('');
});

test('con el teclado: escribe, flecha abajo y Enter eligen; Esc cierra sin elegir', () => {
  const alElegir = jest.fn();
  render(<Prueba alElegir={alElegir} />);
  abrir();
  const caja = screen.getByRole('combobox');
  fireEvent.keyDown(caja, { key: 'ArrowDown' });
  fireEvent.keyDown(caja, { key: 'Enter' });
  expect(alElegir).toHaveBeenCalledWith('2');

  fireEvent.click(screen.getByRole('button', { name: /HP ProBook 450/ }));
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(alElegir).toHaveBeenCalledTimes(1);
});
