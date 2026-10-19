/**
 * Cambio de equipo con eSIM <-> chip fisico, de punta a punta (SPEC 2.143): se crea la
 * solicitud contra la base de pruebas y se revisa lo que el acta imprime (equipos y lineas).
 * El PDF se reemplaza por sus datos: react-pdf no corre dentro de Jest.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';

jest.mock('@react-pdf/renderer', () => ({
  renderToBuffer: async (element: unknown) => element,
  Document: 'Document',
  Page: 'Page',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (s: unknown) => s },
}));

import { crearSolicitud, detalleSolicitud } from '@/modules/solicitudes/servidor';
import { generateComprobanteCambio } from '@/modules/solicitudes/documentos';
import { createWorkflowRequestSchema } from '@/modules/solicitudes';
import { crearEquipo } from '@/test-utils/catalogos';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

const numeroAlAzar = () => `5698${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

describir('acta de cambio con lineas en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const numeros: string[] = [];
  const nuevo = () => {
    const n = numeroAlAzar();
    numeros.push(n);
    return n;
  };
  const ids: Record<string, string> = {};
  let activa: string;
  let fisico: string;
  let esim: string;

  const celular = (modelo: string, extra: object = {}) =>
    crearEquipo({ categoriaId: ids.categoria, sedeId: ids.sede, marca: 'Samsung', modelo: `${modelo} ${s}`, estado: 'disponible', ...extra });
  const linea = (extra: object) =>
    prisma.lineaTelefonica.create({ data: { numero: nuevo(), estadoId: activa, ...extra } });
  const usuario = () => ({ id: ids.usuario, nombre: 'Tecnico Prueba', usuario: `tec${s}` });

  beforeAll(async () => {
    activa = (await prisma.estadoLinea.findUniqueOrThrow({ where: { clave: 'activa' } })).id;
    fisico = (await prisma.tipoChip.findUniqueOrThrow({ where: { nombre: 'Físico' } })).id;
    esim = (await prisma.tipoChip.findUniqueOrThrow({ where: { nombre: 'eSIM / MFF' } })).id;
    ids.usuario = (await prisma.systemUser.create({ data: { usuario: `tec${s}`, passwordHash: 'x', nombre: 'Tecnico Prueba', rol: 'admin' } })).id;
    ids.sede = (await prisma.sede.create({ data: { codigo: `A${s}`, nombre: `Sede Acta ${s}` } })).id;
    ids.categoria = (await prisma.assetCategory.create({ data: { nombre: `Cel Acta ${s}`, tipoFicha: 'celular' } })).id;
    ids.persona = (await prisma.employee.create({ data: { nombres: 'Acta', apellidoPaterno: `Prueba${s}`, estado: 'activo', sedeId: ids.sede } })).id;
  });

  afterAll(async () => {
    const lineas = await prisma.lineaTelefonica.findMany({ where: { numero: { in: numeros } }, select: { id: true } });
    const idsLineas = lineas.map((l) => l.id);
    const solicitudes = await prisma.workflowRequest.findMany({ where: { employeeId: ids.persona }, select: { id: true } });
    await prisma.workflowTransition.deleteMany({ where: { requestId: { in: solicitudes.map((x) => x.id) } } });
    await prisma.workflowRequest.deleteMany({ where: { employeeId: ids.persona } });
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: idsLineas } } });
    await prisma.lineaHistorial.deleteMany({ where: { lineaId: { in: idsLineas } } });
    await prisma.lineaTenencia.deleteMany({ where: { lineaId: { in: idsLineas } } });
    await prisma.lineaTelefonica.deleteMany({ where: { id: { in: idsLineas } } });
    const equipos = await prisma.asset.findMany({ where: { categoriaId: ids.categoria }, select: { id: true } });
    const idsEquipos = equipos.map((e) => e.id);
    await prisma.assignment.deleteMany({ where: { assetId: { in: idsEquipos } } });
    await prisma.assetHistory.deleteMany({ where: { assetId: { in: idsEquipos } } });
    await prisma.asset.deleteMany({ where: { id: { in: idsEquipos } } });
    await prisma.assetCategory.delete({ where: { id: ids.categoria } });
    await prisma.employee.delete({ where: { id: ids.persona } });
    await prisma.sede.delete({ where: { id: ids.sede } });
    await prisma.systemUser.delete({ where: { id: ids.usuario } });
    await prisma.$disconnect();
  });

  const pedido = (extra: object) =>
    createWorkflowRequestSchema.parse({
      tipo: 'cambio_equipo',
      idTicket: `T-${s}`,
      employeeId: ids.persona,
      motivoCambio: 'Prueba de actas',
      cambios: [],
      cambiosLinea: [],
      ...extra,
    });

  test('eSIM -> chip físico: el acta lista el celular que se entrega y las dos líneas', async () => {
    const miEsim = await linea({ tipoChipId: esim, empleadoId: ids.persona });
    const cel = await celular('Entrega');
    const chip = await linea({ tipoChipId: fisico, activoId: cel.id });

    const creada = await crearSolicitud(pedido({ cambiosLinea: [{ lineaId: miEsim.id, newAssetId: cel.id }] }), ids.sede, usuario());
    const detalle = await detalleSolicitud(creada.id);
    expect(detalle.paresCambio).toHaveLength(1);
    expect(detalle.paresCambio[0].anterior).toBeNull();
    expect(detalle.paresCambio[0].nuevo?.asset.id).toBe(cel.id);

    const acta = (await generateComprobanteCambio(creada.id)) as unknown as { props: { equiposNuevos: { descripcion: string }[]; equiposAnteriores: unknown[]; lineas: { numero: string; movimiento: string; ubicacion: string }[] } };
    expect(acta.props.equiposNuevos.map((e) => e.descripcion)).toEqual([`Entrega ${s}`]);
    expect(acta.props.equiposAnteriores).toHaveLength(0);
    expect(acta.props.lineas.map((l) => l.movimiento).sort()).toEqual(['Asignada', 'Devuelta (queda disponible)']);
    expect(acta.props.lineas.find((l) => l.movimiento === 'Asignada')?.ubicacion).toContain(`Entrega ${s}`);
    expect(chip.id).toBeTruthy();
  });

  test('chip físico -> eSIM: el acta lista el celular que se devuelve, con su línea, y la eSIM nueva', async () => {
    const cel = await celular('Devuelve');
    const chip = await linea({ tipoChipId: fisico, activoId: cel.id });
    // La persona tiene el celular (entrega directa en la base, sin pasar por una solicitud).
    await prisma.asset.update({ where: { id: cel.id }, data: { estado: 'asignado', empleadoActualId: ids.persona } });
    const asignacion = await prisma.assignment.create({
      data: { assetId: cel.id, employeeId: ids.persona, fechaEntrega: new Date(), tipoMovimiento: 'ingreso', activo: true },
    });
    const nuevaEsim = await linea({ tipoChipId: esim });

    const creada = await crearSolicitud(
      pedido({ cambios: [{ oldAssignmentId: asignacion.id, newEsimLineaId: nuevaEsim.id, estadoDevolucion: 'ok' }] }),
      ids.sede,
      usuario()
    );
    const detalle = await detalleSolicitud(creada.id);
    expect(detalle.paresCambio[0].anterior?.asset.id).toBe(cel.id);
    expect(detalle.paresCambio[0].nuevo).toBeNull();

    const acta = (await generateComprobanteCambio(creada.id)) as unknown as { props: { equiposNuevos: unknown[]; equiposAnteriores: { descripcion: string; estado: string }[]; lineas: { numero: string; movimiento: string }[] } };
    expect(acta.props.equiposNuevos).toHaveLength(0);
    expect(acta.props.equiposAnteriores).toMatchObject([{ descripcion: `Devuelve ${s}`, estado: 'Buen estado' }]);
    expect(acta.props.lineas.map((l) => l.movimiento).sort()).toEqual(['Asignada', 'Devuelta con el celular']);
    expect(chip.id).toBeTruthy();
  });
});
