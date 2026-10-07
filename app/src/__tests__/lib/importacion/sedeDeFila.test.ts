import { resolverSedeParaFila } from '@/modules/importacion';

// Sede de una fila importada (SPEC 2.117 y 2.133).
describe('resolverSedeParaFila', () => {
  const mapaSedes = { santiago: 's1', concepcion: 's2' };

  it('una Sede vacía deja el equipo sin sede (se completa después en Editar)', () => {
    expect(resolverSedeParaFila({ sedeIdExplicita: null, mapaSedes, valorSede: '' })).toEqual({ sedeId: null });
    expect(resolverSedeParaFila({ sedeIdExplicita: null, mapaSedes, valorSede: '   ' })).toEqual({ sedeId: null });
    expect(resolverSedeParaFila({ sedeIdExplicita: null, mapaSedes, valorSede: undefined })).toEqual({ sedeId: null });
  });

  it('una Sede escrita que no existe es error (no se esconde un error de tipeo)', () => {
    expect(resolverSedeParaFila({ sedeIdExplicita: null, mapaSedes, valorSede: 'Stgo' })).toEqual({
      error: 'sede_no_reconocida',
      valorOriginal: 'Stgo',
    });
  });

  it('reconoce la sede sin distinguir mayúsculas ni tildes', () => {
    expect(resolverSedeParaFila({ sedeIdExplicita: null, mapaSedes, valorSede: 'CONCEPCIÓN' })).toEqual({ sedeId: 's2' });
  });

  it('la sede elegida para todo el archivo gana, aunque la fila venga vacía', () => {
    expect(resolverSedeParaFila({ sedeIdExplicita: 's1', mapaSedes, valorSede: '' })).toEqual({ sedeId: 's1' });
  });
});
