import {
  ACTIVO_FORM_VACIO,
  payloadActivo,
  valoresDesdeActivo,
} from '@/components/activos/ActivoForm';

// SPEC 2.77: Nuevo y Editar Activo comparten formulario; lo que difiere
// por modo es deliberado y se verifica aca.
describe('ActivoForm - payloadActivo', () => {
  const base = {
    ...ACTIVO_FORM_VACIO,
    categoriaId: 'cat-1',
    sedeId: 'sede-1',
    marca: 'Lenovo',
    modelo: 'T14',
    numeroSerie: 'ABC123',
    nombreEquipo: 'NB-SCL-001',
  };

  it('al crear envia la sede y no el nombre de equipo', () => {
    const p = payloadActivo(base, 'crear');
    expect(p).toHaveProperty('sedeId', 'sede-1');
    expect(p).not.toHaveProperty('nombreEquipo');
  });

  it('al editar envia el nombre de equipo y no la sede (solo cambia via Guia de Despacho)', () => {
    const p = payloadActivo(base, 'editar');
    expect(p).toHaveProperty('nombreEquipo', 'NB-SCL-001');
    expect(p).not.toHaveProperty('sedeId');
  });

  it('una sede vacia al crear viaja como undefined para que el backend la rechace', () => {
    expect(payloadActivo({ ...base, sedeId: '' }, 'crear').sedeId).toBeUndefined();
  });

  it('microsoft365 se deriva de si hay licencia cargada', () => {
    expect(payloadActivo(base, 'crear').microsoft365).toBe(false);
    const conLicencia = payloadActivo({ ...base, tipoLicenciaMicrosoft365: 'Business Premium' }, 'editar');
    expect(conLicencia.microsoft365).toBe(true);
    expect(conLicencia.tipoLicenciaMicrosoft365).toBe('Business Premium');
  });

  it('los opcionales vacios viajan como null y almacenamiento se mapea a discoDuro', () => {
    const p = payloadActivo({ ...base, almacenamiento: '512GB' }, 'editar');
    expect(p.procesador).toBeNull();
    expect(p.fechaCompra).toBeNull();
    expect(p.discoDuro).toBe('512GB');
  });
});

describe('ActivoForm - valoresDesdeActivo', () => {
  it('convierte fechas ISO a yyyy-mm-dd y nulos a texto vacio', () => {
    const v = valoresDesdeActivo({
      categoriaId: 'cat-1',
      marca: 'Dell',
      modelo: 'Latitude',
      numeroSerie: null,
      estado: 'asignado',
      condicion: 'usado',
      fechaCompra: '2025-03-15T00:00:00.000Z',
      fechaGarantiaFin: null,
      discoDuro: '256GB',
      pulgadas: 24,
      sistemaOperativo: 'Windows 10 Pro',
    });
    expect(v.fechaCompra).toBe('2025-03-15');
    expect(v.fechaGarantiaFin).toBe('');
    expect(v.numeroSerie).toBe('');
    expect(v.almacenamiento).toBe('256GB');
    expect(v.pulgadas).toBe('24');
    expect(v.estado).toBe('asignado');
    // Un valor historico se conserva aunque no este en el catalogo:
    // CatalogSelect lo muestra como opcion.
    expect(v.sistemaOperativo).toBe('Windows 10 Pro');
  });
});
