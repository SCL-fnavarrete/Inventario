/**
 * Resumen de errores clicable (SPEC 2.162): cada nombre del resumen lleva a su
 * campo, que ya esta en rojo. Vale para el resumen de la pantalla y para el
 * de los errores que devuelve el servidor.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { CampoTexto, ResumenErrores, campoConError } from '@/shared/ui/CampoFormulario';
import { ApiErrorSummary } from '@/shared/ui/ApiErrorSummary';

beforeAll(() => {
  // jsdom no implementa scrollIntoView.
  Element.prototype.scrollIntoView = jest.fn();
});

function Formulario({ resumen }: { resumen: React.ReactNode }) {
  return (
    <div>
      {resumen}
      <CampoTexto label="Marca" obligatorio value="" onChange={() => {}} error="Escribe la marca" />
      <CampoTexto label="Modelo" value="X1" onChange={() => {}} />
      <CampoTexto
        label="IMEI"
        value="123"
        onChange={() => {}}
        error="El IMEI debe tener 15 dígitos"
      />
    </div>
  );
}

describe('ResumenErrores', () => {
  test('cada nombre lleva a su campo con error', () => {
    render(
      <Formulario resumen={<ResumenErrores mensaje="Faltan o están incorrectos: Marca, IMEI." />} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'IMEI' }));
    expect(document.activeElement).toBe(screen.getByLabelText('IMEI'));
    expect(screen.getByLabelText('IMEI')).toHaveAttribute('aria-invalid', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Marca' }));
    expect(document.activeElement).toBe(screen.getByLabelText(/Marca/));
  });

  test('un mensaje que no es de campos se muestra tal cual, sin enlaces', () => {
    render(<ResumenErrores mensaje="No se pudo guardar" />);
    expect(screen.getByText('No se pudo guardar')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ApiErrorSummary', () => {
  test('los campos que rechazó el servidor también llevan a su campo', () => {
    render(
      <Formulario
        resumen={
          <ApiErrorSummary
            error="Datos inválidos"
            fieldErrors={{ imei: 'Ya existe un equipo con ese IMEI' }}
          />
        }
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'IMEI' }));
    expect(document.activeElement).toBe(screen.getByLabelText('IMEI'));
  });
});

describe('campoConError', () => {
  test('si el nombre del resumen no calza con la etiqueta, empareja por orden', () => {
    render(<Formulario resumen={null} />);
    // "Fabricante" no es ninguna etiqueta: queda con el campo con error que sobra.
    expect(campoConError(['Fabricante', 'IMEI'], 0)).toBe(screen.getByLabelText(/Marca/));
    expect(campoConError(['Fabricante', 'IMEI'], 1)).toBe(screen.getByLabelText('IMEI'));
  });
});
