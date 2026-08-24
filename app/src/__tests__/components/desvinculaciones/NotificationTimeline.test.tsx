import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationTimeline from '@/components/desvinculaciones/NotificationTimeline';

/**
 * La ficha mostraba un badge "RRHH Notificado" y nada más: ni a quién, ni
 * cuándo, ni si el correo salió. Un fallo de envío era invisible.
 *
 * La línea de tiempo muestra la evidencia real y, cuando el aviso falló, deja
 * reintentarlo desde ahí.
 */

const ENVIADA = {
  id: 'notificacion-1',
  tipo: 'cierre_desvinculacion',
  destinatarios: ['rrhh@sclconsultores.com', 'jefatura@sclconsultores.com'],
  asunto: 'Devolución de equipos cerrada — Ada Lovelace',
  estado: 'enviada' as const,
  mensajeError: null,
  enviadaPor: 'Analista RRHH',
  aceptadaEn: '2026-03-05T10:00:00.000Z',
  createdAt: '2026-03-05T09:59:00.000Z',
  documentos: [{ id: 'documento-1', numero: 'DOC-2026-0001', version: 1 }],
};

const FALLIDA = {
  ...ENVIADA,
  id: 'notificacion-2',
  estado: 'fallida' as const,
  aceptadaEn: null,
  mensajeError: 'sendMail: La aplicacion no tiene el permiso Graph necesario (request-id req-9)',
};

const ENVIANDO = {
  ...ENVIADA,
  id: 'notificacion-3',
  estado: 'enviando' as const,
  aceptadaEn: null,
  mensajeError: null,
};

describe('NotificationTimeline', () => {
  test('un aviso en curso no ofrece reintento y dice por qué', () => {
    // El botón aparecía para cualquier estado distinto de `enviada`, incluido el
    // de un envío en vuelo: dos pestañas, o la transición todavía subiendo,
    // bastaban para que RRHH recibiera el acta dos veces. `enviando` significa
    // "no sabemos si salió", y reintentarlo por si acaso es cómo se duplica.
    render(
      <NotificationTimeline notificaciones={[ENVIANDO]} puedeReintentar onReintentar={jest.fn()} />
    );

    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no se pudo confirmar|en curso/i)).toBeInTheDocument();
  });

  test('muestra destinatarios, asunto, actor y la hora en que Graph aceptó', () => {
    render(
      <NotificationTimeline notificaciones={[ENVIADA]} puedeReintentar onReintentar={jest.fn()} />
    );

    expect(screen.getByText('Cierre de desvinculación')).toBeInTheDocument();
    expect(screen.getByText(/rrhh@sclconsultores.com/)).toBeInTheDocument();
    expect(screen.getByText(/jefatura@sclconsultores.com/)).toBeInTheDocument();
    expect(screen.getByText(ENVIADA.asunto)).toBeInTheDocument();
    expect(screen.getByText('Analista RRHH')).toBeInTheDocument();
    expect(screen.getByText(/DOC-2026-0001 v1/)).toBeInTheDocument();
  });

  test('dice qué significa "enviada": Graph la aceptó, no que alguien la leyó', () => {
    render(
      <NotificationTimeline notificaciones={[ENVIADA]} puedeReintentar onReintentar={jest.fn()} />
    );

    expect(screen.getByText(/aceptada por Microsoft Graph/i)).toBeInTheDocument();
  });

  test('un aviso fallido muestra el error y ofrece reintentar', async () => {
    const reintentar = jest.fn();
    render(
      <NotificationTimeline notificaciones={[FALLIDA]} puedeReintentar onReintentar={reintentar} />
    );

    expect(screen.getByText(/permiso Graph necesario/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(reintentar).toHaveBeenCalledWith('notificacion-2');
  });

  test('sin permiso de escritura no aparece el botón de reintento', () => {
    render(
      <NotificationTimeline
        notificaciones={[FALLIDA]}
        puedeReintentar={false}
        onReintentar={jest.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  });

  test('un aviso ya aceptado no ofrece reintento', () => {
    render(
      <NotificationTimeline notificaciones={[ENVIADA]} puedeReintentar onReintentar={jest.fn()} />
    );

    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  });

  test('sin avisos lo dice, en vez de dejar el espacio en blanco', () => {
    render(<NotificationTimeline notificaciones={[]} puedeReintentar onReintentar={jest.fn()} />);

    expect(screen.getByText(/no se ha enviado/i)).toBeInTheDocument();
  });
});
