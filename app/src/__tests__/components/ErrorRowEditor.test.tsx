// Corregir una fila con error al importar (SPEC 2.105).
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorRowEditor } from '@/components/import/ErrorRowEditor';

const fila = {
  rowIndex: 0,
  excelRow: 2,
  status: 'error' as const,
  data: { marca: '', modelo: 'Latitude', numeroSerie: 'ABC1' },
  errors: [{ type: 'missing_required_field' as const, field: 'marca', message: 'Campos faltantes: Marca' }],
  warnings: [],
};
const etiquetas = { marca: 'Marca', modelo: 'Modelo', numeroSerie: 'N° de Serie' };

test('el error de la fila se muestra bajo su campo', () => {
  render(<ErrorRowEditor row={fila} fieldLabels={etiquetas} sedes={[]} onSave={jest.fn()} />);
  expect(screen.getByText('Campos faltantes: Marca')).toBeTruthy();
});

test('guardar con un obligatorio vacio lo marca y no guarda; corregido, guarda', () => {
  const onSave = jest.fn();
  render(<ErrorRowEditor row={fila} fieldLabels={etiquetas} sedes={[]} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
  fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText('Escribe la marca')).toBeTruthy();
  expect(screen.getByText(/Faltan o están incorrectos: Marca/)).toBeTruthy();

  fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Dell' } });
  fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
  expect(onSave).toHaveBeenCalledWith(0, { marca: 'Dell', modelo: 'Latitude', numeroSerie: 'ABC1' });
});
