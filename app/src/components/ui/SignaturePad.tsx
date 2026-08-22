'use client';

import { useCallback, useEffect, useRef } from 'react';

type SignaturePadProps = {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
};

const WIDTH = 300;
const HEIGHT = 150;

function releasePointerCaptureSafely(canvas: HTMLCanvasElement, pointerId: number | null) {
  if (pointerId === null) return;
  try {
    if (!canvas.hasPointerCapture || canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
  } catch {
    // A cancelled pointer may already have released capture. That is harmless.
  }
}

export default function SignaturePad({ label, value, onChange, disabled = false, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const valueRef = useRef(value);
  const hasSignature = Boolean(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${HEIGHT}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 2;
  }, []);

  const restoreValue = useCallback((signature: string | null) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (!signature) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      const currentCanvas = canvasRef.current;
      const currentContext = currentCanvas?.getContext('2d');
      if (!currentCanvas || !currentContext || valueRef.current !== signature) return;
      currentContext.drawImage(image, 0, 0, WIDTH, HEIGHT);
    };
    image.src = signature;
  }, []);

  const resetPointer = useCallback((release = true) => {
    const canvas = canvasRef.current;
    if (canvas && release) releasePointerCaptureSafely(canvas, pointerIdRef.current);
    drawingRef.current = false;
    pointerIdRef.current = null;
    startPointRef.current = null;
    movedRef.current = false;
  }, []);

  useEffect(() => {
    setupCanvas();
    restoreValue(value);
    return () => resetPointer();
  }, [resetPointer, restoreValue, setupCanvas, value]);

  const point = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (WIDTH / rect.width),
      y: (event.clientY - rect.top) * (HEIGHT / rect.height),
    };
  }, []);

  const finish = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current || pointerIdRef.current !== event.pointerId) return;
    const changed = movedRef.current;
    resetPointer();
    if (!changed) return;
    onChange(canvas.toDataURL('image/png'));
  }, [onChange, resetPointer]);

  const cancel = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || pointerIdRef.current !== event.pointerId) return;
    resetPointer();
    // The parent value remains authoritative, so partial strokes never become evidence.
    restoreValue(valueRef.current);
  }, [resetPointer, restoreValue]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || drawingRef.current) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    pointerIdRef.current = event.pointerId;
    drawingRef.current = true;
    movedRef.current = false;
    const pointValue = point(event);
    startPointRef.current = pointValue;
    context.beginPath();
    context.moveTo(pointValue.x, pointValue.y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || pointerIdRef.current !== event.pointerId || disabled) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const pointValue = point(event);
    const start = startPointRef.current;
    if (!start || pointValue.x !== start.x || pointValue.y !== start.y) movedRef.current = true;
    context.lineTo(pointValue.x, pointValue.y);
    context.stroke();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || disabled) return;
    resetPointer();
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        aria-label={label}
        aria-describedby={`${label.replace(/\s+/g, '-').toLowerCase()}-help`}
        className="block max-w-full touch-none rounded border border-gray-300 bg-white cursor-crosshair disabled:cursor-not-allowed"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        role="img"
        tabIndex={0}
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasSignature}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`Limpiar ${label.toLowerCase()}`}
        >
          Limpiar firma
        </button>
        <p id={`${label.replace(/\s+/g, '-').toLowerCase()}-help`} className="text-xs text-gray-500">
          Dibuje la firma con mouse, lápiz o dedo.
        </p>
      </div>
    </div>
  );
}
