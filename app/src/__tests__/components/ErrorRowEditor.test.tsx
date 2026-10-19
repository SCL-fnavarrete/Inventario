// Corregir una fila con error al importar (SPEC 2.105).
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorRowEditor } from '@/modules/importacion/componentes/ErrorRowEditor';

// La marca sale de un catalogo (SPEC 2.116.4): el selector pide sus opciones.
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ json: async () => [{ id: '1', nombre: 'Dell', activo: true }] });
});

const fila = {
  rowIndex: 0,
  excelRow: 2,
  status: 'error' as const,
  data: { marca: 'Dell', modelo: '', numeroSerie: 'ABC1' },
  errors: [{ type: 'missing_required_field' as const, field: 'modelo', message: 'Campos faltantes: Modelo' }],
  warnings: [],
};
const etiquetas = { marca: 'Marca', modelo: 'Modelo', numeroSerie: 'N° de Serie' };

test('el error de la fila se muestra bajo su campo', async () => {
  render(<ErrorRowEditor row={fila} fieldLabels={etiquetas} sedes={[]} onSave={jest.fn()} />);
  expect(screen.getByText('Campos faltantes: Modelo')).toBeTruthy();
  await screen.findByText('Dell');
});

test('guardar con un obligatorio vacio lo marca y no guarda; corregido, guarda', async () => {
  const onSave = jest.fn();
  render(<ErrorRowEditor row={fila} fieldLabels={etiquetas} sedes={[]} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
  await screen.findAllByText('Dell');
  fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText('Escribe el modelo')).toBeTruthy();
  // El resumen lista el campo como enlace que lleva a el (SPEC 2.162).
  expect(screen.getAllByText((_, el) => el?.textContent === "Faltan o están incorrectos: Modelo.").length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "Modelo" })).toBeTruthy();

  fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Latitude' } });
  fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
  expect(onSave).toHaveBeenCalledWith(0, { marca: 'Dell', modelo: 'Latitude', numeroSerie: 'ABC1' });
});
