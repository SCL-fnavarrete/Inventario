import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'request-1' }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));

import SolicitudDetailPage from '@/app/(dashboard)/solicitudes/[id]/page';

const PNG_SIGNATURE = 'data:image/png;base64,firma-ui';
const mockFetch = global.fetch as jest.Mock;

const onboardingInDelivery = {
  id: 'request-1',
  numero: 'WF-2026-0001',
  tipo: 'onboarding',
  estado: 'gestion_ti',
  prioridad: 'media',
  observaciones: null,
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
  fechaCierre: null,
  fechaIngreso: null,
  cargoSolicitado: 'Analista',
  ubicacionDestino: null,
  requiereNotebook: true,
  requiereCelular: false,
  requiereMonitor: false,
  ticketFreshdesk: null,
  motivoCambio: null,
  fechaDesvinculacion: null,
  medioDevolucion: null,
  otChilexpress: null,
  ciudadDevolucion: null,
  assignmentIds: [],
  terminationId: null,
  dispatchGuideId: null,
  employee: {
    id: '550e8400-e29b-41d4-a716-446655440000', rut: null, nombres: 'Ada', apellidoPaterno: 'Lovelace',
    apellidoMaterno: null, cargo: 'Analista', correo: 'ada@example.com', assignments: [],
  },
  solicitante: { id: 'user-1', nombre: 'Técnico TI', rol: 'tecnico' },
  responsableActual: null,
  comments: [],
  transitions: [],
  pendientes: [],
};

describe('detalle de solicitud — evidencia de transición', () => {
  beforeEach(() => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: jest.fn(), clearRect: jest.fn(), beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), stroke: jest.fn(),
    } as unknown as CanvasRenderingContext2D);
    jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG_SIGNATURE);
    jest.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 150, width: 300, height: 150, toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: jest.fn(),
    });
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/activos?estado=disponible&limit=100') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [{ id: '550e8400-e29b-41d4-a716-446655440001', marca: 'Lenovo', modelo: 'T14', numeroSerie: 'SN-001' }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => onboardingInDelivery });
    });
  });

  afterEach(() => jest.restoreAllMocks());

  test('envía todos los datos de una entrega oficial de onboarding, no solo el estado', async () => {
    render(<SolicitudDetailPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Avanzar a Equipos Entregados/i }));
    fireEvent.click(await screen.findByLabelText(/Lenovo T14/i));
    fireEvent.change(screen.getByLabelText('Lugar de entrega'), { target: { value: 'Santiago' } });
    const canvas = screen.getByLabelText('Firma de entrega');
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 22, clientY: 22, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 22, clientY: 22, pointerId: 1 });
    fireEvent.click(screen.getByLabelText(/Acepto la política de uso/i));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar entrega/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/solicitudes/request-1/transicion',
        expect.objectContaining({ method: 'POST' })
      )
    );
    const [, request] = mockFetch.mock.calls.find(([url]) => url === '/api/solicitudes/request-1/transicion');
    expect(JSON.parse(request.body)).toEqual({
      nuevoEstado: 'equipos_entregados',
      datosAccion: {
        assetIds: ['550e8400-e29b-41d4-a716-446655440001'],
        lugarEntrega: 'Santiago',
        firmaEmpleadoEntrega: PNG_SIGNATURE,
        aceptaPoliticaUso: true,
      },
    });
  });

  test('limpia firma y aceptación al cancelar y reabrir el acto de entrega', async () => {
    render(<SolicitudDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Avanzar a Equipos Entregados/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/activos?estado=disponible&limit=100'));
    const canvas = screen.getByLabelText('Firma de entrega');
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 22, clientY: 22, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 22, clientY: 22, pointerId: 1 });
    fireEvent.click(screen.getByLabelText(/Acepto la política de uso/i));
    expect(screen.getByText('Firma capturada.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: /Avanzar a Equipos Entregados/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('Firma capturada.')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Acepto la política de uso/i)).not.toBeChecked();
  });
});
