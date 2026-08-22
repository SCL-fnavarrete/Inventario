import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  use: () => ({ id: 'employee-1' }),
}));

import FichaEmpleadoPage from '@/app/(dashboard)/empleados/[id]/page';

const mockFetch = global.fetch as jest.Mock;

const ficha = {
  empleado: {
    id: 'employee-1',
    rut: null,
    nombreCompleto: 'Ada Lovelace',
    nombres: 'Ada',
    apellidoPaterno: 'Lovelace',
    apellidoMaterno: null,
    correo: 'ada@example.com',
    cargo: 'Analista',
    jefatura: null,
    supervisor: null,
    ubicacion: 'Santiago',
    tipoContrato: 'planta',
    fechaIngreso: null,
    fechaTermino: null,
    estado: 'activo',
    telefonoContacto: null,
    origenMicrosoft: false,
  },
  notebooks: [],
  celulares: [],
  monitores: [],
  otrosEquipos: [],
  kitBienvenida: { entregado: false, fechaEntrega: null },
  epp: { entregado: false, fechaEntrega: null, proximaMantencion: null },
  resumen: {
    totalEquiposAsignados: 0,
    cantidadNotebooks: 0,
    cantidadCelulares: 0,
    cantidadMonitores: 0,
    cantidadOtrosEquipos: 0,
    tieneNotebook: false,
    tieneCelular: false,
    tieneMonitor: false,
    kitBienvenidaEntregado: false,
    eppEntregado: false,
  },
  historial: [],
};

describe('FichaEmpleadoPage — controles de sección accesibles', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ficha });
  });

  test('usa botones toggle en vez de tabs ARIA incompletos', async () => {
    render(<FichaEmpleadoPage params={Promise.resolve({ id: 'employee-1' })} />);

    const resumen = await screen.findByRole('button', { name: 'Resumen' });
    const historial = screen.getByRole('button', { name: 'Historial' });

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(resumen).toHaveAttribute('aria-pressed', 'true');
    expect(historial).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(historial);

    expect(historial).toHaveAttribute('aria-pressed', 'true');
    expect(resumen).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: 'Historial del empleado' })).toBeInTheDocument();
  });
});
