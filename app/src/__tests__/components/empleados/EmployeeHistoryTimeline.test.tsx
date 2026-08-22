import { render, screen } from '@testing-library/react';
import EmployeeHistoryTimeline from '@/components/empleados/EmployeeHistoryTimeline';

describe('EmployeeHistoryTimeline', () => {
  test('muestra evento, descripción, actor, fecha y snapshots seguros', () => {
    render(
      <EmployeeHistoryTimeline
        historial={[
          {
            id: 'history-1',
            tipoEvento: 'reactivacion',
            descripcion: 'Empleado reactivado desde Microsoft',
            usuarioSistema: 'sync-admin@example.com',
            createdAt: '2026-08-22T12:00:00.000Z',
            datosAnteriores: { estado: 'desvinculado' },
            datosNuevos: { estado: 'activo', microsoftId: 'private-id' },
          },
        ]}
      />
    );

    expect(screen.getByText('Reactivación')).toBeInTheDocument();
    expect(screen.getByText('Empleado reactivado desde Microsoft')).toBeInTheDocument();
    expect(screen.getByText('sync-admin@example.com')).toBeInTheDocument();
    expect(screen.getByText(/22.*08.*2026/)).toBeInTheDocument();
    expect(screen.getByText('desvinculado')).toBeInTheDocument();
    expect(screen.getByText('activo')).toBeInTheDocument();
    expect(screen.queryByText('private-id')).not.toBeInTheDocument();
  });
});
