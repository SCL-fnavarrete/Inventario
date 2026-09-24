// Validacion por campo compartida (SPEC 2.95).
import { act, renderHook } from '@testing-library/react';
import { useErroresFormulario } from '@/hooks/useErroresFormulario';
import { textoResumenErrores } from '@/components/ui/CampoFormulario';

const ETIQUETAS = { marca: 'Marca', modelo: 'Modelo' };

describe('textoResumenErrores', () => {
  test('arma el mismo texto que Onboarding, con la etiqueta de cada campo', () => {
    expect(textoResumenErrores({ marca: 'x', otro: 'y' }, ETIQUETAS)).toBe(
      'Faltan o están incorrectos: Marca, otro.'
    );
  });
});

describe('useErroresFormulario', () => {
  test('reportar muestra los errores y el resumen; devuelve si hay alguno', () => {
    const { result } = renderHook(() => useErroresFormulario(ETIQUETAS));
    let hay = false;
    act(() => {
      hay = result.current.reportar({ marca: 'Escribe la marca', modelo: 'Escribe el modelo' });
    });
    expect(hay).toBe(true);
    expect(result.current.errores.marca).toBe('Escribe la marca');
    expect(result.current.resumen).toBe('Faltan o están incorrectos: Marca, Modelo.');
  });

  test('limpiar quita el campo corregido y el resumen se acorta', () => {
    const { result } = renderHook(() => useErroresFormulario(ETIQUETAS));
    act(() => {
      result.current.reportar({ marca: 'x', modelo: 'y' });
    });
    act(() => {
      result.current.limpiar('marca');
    });
    expect(result.current.errores).toEqual({ modelo: 'y' });
    expect(result.current.resumen).toBe('Faltan o están incorrectos: Modelo.');
  });

  test('sin errores no hay resumen', () => {
    const { result } = renderHook(() => useErroresFormulario(ETIQUETAS));
    let hay = true;
    act(() => {
      hay = result.current.reportar({});
    });
    expect(hay).toBe(false);
    expect(result.current.resumen).toBe('');
  });
});
