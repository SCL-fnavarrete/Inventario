'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type SignaturePadProps = {
  label: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
};

const WIDTH = 300;
const HEIGHT = 150;

export default function SignaturePad({ label, onChange, disabled = false, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const [hasSignature, setHasSignature] = useState(false);

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

  useEffect(() => {
    setupCanvas();
    return () => {
      drawingRef.current = false;
      pointerIdRef.current = null;
    };
  }, [setupCanvas]);

  const point = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const finish = useCallback(() => {
    const canvas = canvasRef.current;
    if (!drawingRef.current || !canvas) return;
    drawingRef.current = false;
    pointerIdRef.current = null;
    setHasSignature(true);
    onChange(canvas.toDataURL('image/png'));
  }, [onChange]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    drawingRef.current = true;
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || pointerIdRef.current !== event.pointerId || disabled) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || disabled) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current = false;
    pointerIdRef.current = null;
    setHasSignature(false);
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
        onPointerCancel={finish}
        onLostPointerCapture={finish}
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
