import { fireEvent, render, screen } from '@testing-library/react';
import SignaturePad from '@/components/ui/SignaturePad';

const PNG_SIGNATURE = 'data:image/png;base64,firma-de-prueba';

function pointerEvent(type: string, x: number, y: number, pointerId = 7) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

describe('SignaturePad', () => {
  const context = {
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    drawImage: jest.fn(),
    lineCap: 'round',
    lineJoin: 'round',
    lineWidth: 2,
  } as unknown as CanvasRenderingContext2D;

  beforeEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG_SIGNATURE);
    jest.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 150,
      width: 300,
      height: 150,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  test('dibuja con coordenadas CSS de alta densidad y emite un PNG al soltar el puntero', () => {
    const onChange = jest.fn();
    render(<SignaturePad label="Firma de entrega" value={null} onChange={onChange} />);

    const canvas = screen.getByLabelText('Firma de entrega');
    fireEvent(canvas, pointerEvent('pointerdown', 30, 20));
    fireEvent(canvas, pointerEvent('pointermove', 90, 80));
    fireEvent(canvas, pointerEvent('pointerup', 90, 80));

    expect(canvas).toHaveAttribute('width', '600');
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.moveTo).toHaveBeenCalledWith(30, 20);
    expect(context.lineTo).toHaveBeenCalledWith(90, 80);
    expect(onChange).toHaveBeenLastCalledWith(PNG_SIGNATURE);
    expect(HTMLCanvasElement.prototype.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  test('no emite una firma por un toque, cancela el puntero activo y escala coordenadas CSS', () => {
    const onChange = jest.fn();
    jest.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 10, left: 20, right: 170, bottom: 85, width: 150, height: 75, toJSON: () => ({}),
    } as DOMRect);
    render(<SignaturePad label="Firma robusta" value={null} onChange={onChange} />);

    const canvas = screen.getByLabelText('Firma robusta');
    fireEvent(canvas, pointerEvent('pointerdown', 35, 20));
    fireEvent(canvas, pointerEvent('pointerup', 35, 20));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent(canvas, pointerEvent('pointerdown', 35, 20, 1));
    fireEvent(canvas, pointerEvent('pointermove', 50, 35, 2));
    fireEvent(canvas, pointerEvent('pointercancel', 50, 35, 1));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent(canvas, pointerEvent('pointerdown', 35, 20, 3));
    fireEvent(canvas, pointerEvent('pointermove', 50, 35, 3));
    fireEvent(canvas, pointerEvent('pointerup', 50, 35, 3));
    expect(context.moveTo).toHaveBeenCalledWith(30, 20);
    expect(context.lineTo).toHaveBeenCalledWith(60, 50);
    expect(onChange).toHaveBeenLastCalledWith(PNG_SIGNATURE);
  });

  test('limpia el canvas y comunica que ya no hay firma', () => {
    const onChange = jest.fn();
    const { rerender } = render(<SignaturePad label="Firma de devolución" value={null} onChange={onChange} />);

    const canvas = screen.getByLabelText('Firma de devolución');
    fireEvent(canvas, pointerEvent('pointerdown', 30, 20));
    fireEvent(canvas, pointerEvent('pointermove', 31, 21));
    fireEvent(canvas, pointerEvent('pointerup', 31, 21));
    rerender(<SignaturePad label="Firma de devolución" value={PNG_SIGNATURE} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar firma de devolución' }));

    expect(context.clearRect).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test('restaura el valor controlado al montar para no ocultar evidencia detrás de un canvas vacío', () => {
    const nativeImage = global.Image;
    class ImageStub {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { this.onload?.(); }
    }
    Object.defineProperty(global, 'Image', { configurable: true, value: ImageStub });
    try {
      render(<SignaturePad label="Firma restaurada" value={PNG_SIGNATURE} onChange={jest.fn()} />);
      expect(context.drawImage).toHaveBeenCalledWith(expect.any(ImageStub), 0, 0, 300, 150);
      expect(screen.getByRole('button', { name: 'Limpiar firma restaurada' })).not.toBeDisabled();
    } finally {
      Object.defineProperty(global, 'Image', { configurable: true, value: nativeImage });
    }
  });
});
