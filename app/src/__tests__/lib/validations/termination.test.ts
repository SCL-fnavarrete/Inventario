import { updateTerminationSchema } from '@/lib/validations/termination';

describe('updateTerminationSchema', () => {
  test('preserva la ausencia y distingue null, vacío y fecha de devolución', () => {
    const ausente = updateTerminationSchema.parse({});
    const nulo = updateTerminationSchema.parse({ fechaDevolucionEquipos: null });
    const vacio = updateTerminationSchema.parse({ fechaDevolucionEquipos: '' });
    const fecha = updateTerminationSchema.parse({ fechaDevolucionEquipos: '2026-08-25T00:00:00.000Z' });

    expect(ausente.fechaDevolucionEquipos).toBeUndefined();
    expect(nulo.fechaDevolucionEquipos).toBeNull();
    expect(vacio.fechaDevolucionEquipos).toBeNull();
    expect(fecha.fechaDevolucionEquipos).toEqual(new Date('2026-08-25T00:00:00.000Z'));
  });
});
