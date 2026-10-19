// Historial de asignaciones de una persona (SPEC 2.132): equipos, Kit/EPP y lineas en una lista.
import { armarHistorialAsignaciones } from '@/modules/personas';

const equipo = (o: Record<string, unknown> = {}) => ({
  id: 'e1',
  fechaEntrega: new Date('2026-03-01'),
  fechaDevolucion: null,
  estadoDevolucion: null,
  activo: true,
  asset: { id: 'a1', marca: { nombre: 'Dell' }, modelo: 'Latitude', numeroSerie: 'SN1', imei: null, categoria: { nombre: 'Notebook' } },
  ...o,
});
const kit = (o: Record<string, unknown> = {}) => ({
  id: 'k1',
  cantidad: 1,
  fechaEntrega: new Date('2026-03-02'),
  estado: 'entregado',
  item: { nombre: 'Mochila', categoria: 'kit_bienvenida' },
  ...o,
});
const tramo = (o: Record<string, unknown> = {}) => ({
  id: 't1',
  desde: new Date('2026-05-01'),
  hasta: null,
  cierre: null,
  motivo: null,
  linea: { id: 'l1', numero: '56912345678' },
  activo: null,
  ...o,
});

test('junta equipos, Kit/EPP y líneas, del más reciente al más antiguo', () => {
  const items = armarHistorialAsignaciones({ equipos: [equipo()], kit: [kit()], lineas: [tramo()] });
  expect(items.map((i) => i.tipo)).toEqual(['linea', 'kit', 'equipo']);
  expect(items[0]).toMatchObject({ titulo: '+56 9 1234 5678', estado: 'En uso', vigente: true, enlace: '/activos/lineas/l1' });
});

test('un equipo: en uso, devuelto, dañado y "no devuelto" (que deja la asignación abierta)', () => {
  const estados = (o: Record<string, unknown>) => armarHistorialAsignaciones({ equipos: [equipo(o)], kit: [], lineas: [] })[0];
  expect(estados({})).toMatchObject({ estado: 'En uso', vigente: true, titulo: 'Notebook Dell Latitude', detalle: 'N° de serie SN1', enlace: '/activos/a1' });
  expect(estados({ activo: false, fechaDevolucion: new Date('2026-04-01'), estadoDevolucion: 'ok' })).toMatchObject({
    estado: 'Devuelto',
    vigente: false,
    hasta: new Date('2026-04-01'),
  });
  expect(estados({ activo: false, estadoDevolucion: 'danado' }).estado).toBe('Devuelto dañado');
  expect(estados({ activo: true, estadoDevolucion: 'no_devuelto' })).toMatchObject({ estado: 'No devuelto', vigente: false });
});

test('un equipo sin número de serie muestra su IMEI', () => {
  const [c] = armarHistorialAsignaciones({
    equipos: [equipo({ asset: { id: 'a2', marca: { nombre: 'Samsung' }, modelo: 'A55', numeroSerie: null, imei: '356789112345671', categoria: { nombre: 'Celular' } } })],
    kit: [],
    lineas: [],
  });
  expect(c.detalle).toBe('IMEI 356789112345671');
});

test('Kit/EPP: cantidad, tipo y estado', () => {
  const [a, b] = armarHistorialAsignaciones({
    equipos: [],
    kit: [kit({ cantidad: 2, item: { nombre: 'Casco', categoria: 'epp' }, estado: 'devuelto' }), kit({ id: 'k2', fechaEntrega: new Date('2026-01-01') })],
    lineas: [],
  });
  expect(a).toMatchObject({ titulo: 'Casco ×2', detalle: 'EPP', estado: 'Devuelto', vigente: false });
  expect(b).toMatchObject({ titulo: 'Mochila', detalle: 'Kit de bienvenida', estado: 'Entregado', vigente: true });
});

test('una línea: cómo terminó cada tramo y dónde estaba', () => {
  const cierre = (c: string | null, o: Record<string, unknown> = {}) =>
    armarHistorialAsignaciones({ equipos: [], kit: [], lineas: [tramo({ hasta: new Date('2026-06-01'), cierre: c, ...o })] })[0];
  expect(cierre('devolucion_telefono', { activo: { marca: { nombre: 'Samsung' }, modelo: 'A55' } })).toMatchObject({
    estado: 'Devuelta (con el teléfono)',
    detalle: 'En Samsung A55',
    vigente: false,
  });
  expect(cierre('entrega_telefono').estado).toBe('Pasó a otra persona');
  expect(cierre('reasignacion', { motivo: { nombre: 'Cambio de persona' } })).toMatchObject({
    estado: 'Reasignada',
    detalle: 'Teléfono personal o eSIM · Cambio de persona',
  });
  expect(cierre(null).estado).toBe('Terminó');
});

test('lo que no tiene fecha de entrega queda al final', () => {
  const items = armarHistorialAsignaciones({ equipos: [equipo({ id: 'sin', fechaEntrega: null }), equipo({ id: 'con' })], kit: [], lineas: [] });
  expect(items.map((i) => i.clave)).toEqual(['equipo-con', 'equipo-sin']);
});
