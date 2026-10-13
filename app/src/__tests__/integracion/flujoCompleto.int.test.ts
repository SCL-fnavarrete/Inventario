/** @jest-environment node */
/**
 * Prueba de punta a punta del ciclo de vida de un equipo, contra Postgres real
 * (solo la base de pruebas), con los mismos servicios que usan las rutas:
 *   compra -> reparto (aqui y a otra sede) -> despacho -> recepcion ->
 *   entrega (onboarding) -> mantencion -> cambio de equipo -> desvinculacion
 *   -> baja directa, y el aviso de garantias del Dashboard.
 * Revisa tambien los bloqueos de reglas de negocio de cada paso (SPEC 2.111,
 * 2.145, 2.148, 2.151, 2.156).
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

import { createPurchaseWithAssetsSchema, repartoCompraSchema } from '@/modules/compras';
import { registrarCompra, repartirCompra, eliminarCompra } from '@/modules/compras/servidor';
import { createKitItemSchema } from '@/modules/kit-epp';
import { crearArticuloKit } from '@/modules/kit-epp/servidor';
import { buscarGuia, confirmarRecepcion } from '@/modules/despachos/servidor';
import { createWorkflowRequestSchema } from '@/modules/solicitudes';
import { crearSolicitud } from '@/modules/solicitudes/servidor';
import { bajaEquipoSchema, completeMaintenanceSchema, createMaintenanceSchema } from '@/modules/mantenciones';
import {
  completarMantencion,
  darDeBajaEquipo,
  iniciarMantencion,
  programarMantencion,
} from '@/modules/mantenciones/servidor';
import { resumenDashboard } from '@/modules/dashboard/resumen';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('ciclo de vida completo de un equipo, en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  const usuario = `tec${s}`;
  const quien = { usuario, nombre: 'Tecnico Prueba' };
  const sistema = () => ({ id: ids.usuario, nombre: 'Tecnico Prueba', usuario });
  const hoy = new Date().toISOString().slice(0, 10);
  const equipo = (serie: string) => ({ categoriaId: ids.categoria, marca: 'Dell', modelo: `Latitude ${s}`, numeroSerie: `${serie}${s}` });
  const estado = async (id: string) => (await prisma.asset.findUniqueOrThrow({ where: { id } })).estado;
  const porSerie = async (serie: string) => (await prisma.asset.findFirstOrThrow({ where: { numeroSerie: `${serie}${s}` } })).id;

  beforeAll(async () => {
    ids.usuario = (await prisma.systemUser.create({ data: { usuario, passwordHash: 'x', nombre: 'Tecnico Prueba', rol: 'tecnico' } })).id;
    ids.llegada = (await prisma.sede.create({ data: { codigo: `L${s}`, nombre: `Llegada ${s}` } })).id;
    ids.otra = (await prisma.sede.create({ data: { codigo: `O${s}`, nombre: `Otra ${s}` } })).id;
    ids.categoria = (await prisma.assetCategory.create({ data: { nombre: `Notebook ${s}`, tipoFicha: 'computador' } })).id;
    ids.tipo = (await prisma.maintenanceType.create({ data: { nombre: `Correctiva ${s}` } })).id;
    ids.motivo = (await prisma.motivoBaja.create({ data: { nombre: `Falla ${s}` } })).id;
    ids.persona = (await prisma.employee.create({
      data: { nombres: 'Flujo', apellidoPaterno: `Prueba${s}`, estado: 'activo', sedeId: ids.llegada },
    })).id;
  });

  afterAll(async () => {
    const equipos = (await prisma.asset.findMany({ where: { categoriaId: ids.categoria }, select: { id: true } })).map((e) => e.id);
    const compras = (await prisma.purchase.findMany({ where: { sedeId: ids.llegada }, select: { id: true } })).map((c) => c.id);
    const guias = (await prisma.dispatchGuide.findMany({ where: { sedeDestinoId: { in: [ids.llegada, ids.otra] } }, select: { id: true } })).map((g) => g.id);
    const solicitudes = (await prisma.workflowRequest.findMany({ where: { employeeId: ids.persona }, select: { id: true } })).map((w) => w.id);
    const articulos = (await prisma.welcomeKitItem.findMany({ where: { sedeId: { in: [ids.llegada, ids.otra] } }, select: { id: true } })).map((a) => a.id);
    const mantenciones = (await prisma.maintenance.findMany({ where: { assetId: { in: equipos } }, select: { id: true } })).map((m) => m.id);

    await prisma.auditLog.deleteMany({ where: { entidadId: { in: [...compras, ...guias, ...solicitudes, ...articulos, ...mantenciones, ...equipos] } } });
    await prisma.workflowTransition.deleteMany({ where: { requestId: { in: solicitudes } } });
    await prisma.workflowRequest.deleteMany({ where: { id: { in: solicitudes } } });
    await prisma.purchaseKitReparto.deleteMany({ where: { guideId: { in: guias } } });
    await prisma.dispatchGuideKitItem.deleteMany({ where: { guideId: { in: guias } } });
    await prisma.dispatchGuideItem.deleteMany({ where: { guideId: { in: guias } } });
    await prisma.purchaseKitReparto.deleteMany({ where: { purchaseKitItem: { purchaseId: { in: compras } } } });
    await prisma.dispatchGuide.deleteMany({ where: { id: { in: guias } } });
    await prisma.purchaseKitItem.deleteMany({ where: { purchaseId: { in: compras } } });
    await prisma.purchaseAsset.deleteMany({ where: { purchaseId: { in: compras } } });
    await prisma.purchase.deleteMany({ where: { id: { in: compras } } });
    await prisma.maintenance.deleteMany({ where: { id: { in: mantenciones } } });
    await prisma.assignment.deleteMany({ where: { assetId: { in: equipos } } });
    await prisma.assetHistory.deleteMany({ where: { assetId: { in: equipos } } });
    await prisma.asset.deleteMany({ where: { id: { in: equipos } } });
    await prisma.welcomeKitItem.deleteMany({ where: { id: { in: articulos } } });
    await prisma.employee.deleteMany({ where: { id: ids.persona } });
    await prisma.motivoBaja.deleteMany({ where: { id: ids.motivo } });
    await prisma.maintenanceType.deleteMany({ where: { id: ids.tipo } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoria } });
    await prisma.sede.deleteMany({ where: { id: { in: [ids.llegada, ids.otra] } } });
    await prisma.systemUser.deleteMany({ where: { id: ids.usuario } });
    await prisma.$disconnect();
  });

  test('1. compra con un artículo de Kit/EPP nuevo: todo queda Por repartir y sin stock', async () => {
    // Una factura sin numero no se acepta (SPEC 2.151).
    expect(
      createPurchaseWithAssetsSchema.safeParse({ sedeId: ids.llegada, numeroFactura: '', fechaFactura: hoy, equiposNuevos: [equipo('A')] }).success
    ).toBe(false);

    // El articulo se crea desde la compra, con stock 0 (SPEC 2.152).
    const casco = await crearArticuloKit(createKitItemSchema.parse({ nombre: `Casco ${s}`, categoria: 'epp', sedeId: ids.llegada }), usuario);
    ids.casco = casco.id;
    expect(casco.cantidad).toBe(0);

    const compra = await registrarCompra(
      createPurchaseWithAssetsSchema.parse({
        sedeId: ids.llegada,
        numeroFactura: `F-${s}`,
        fechaFactura: hoy,
        equiposNuevos: [equipo('A'), equipo('B'), equipo('C'), { ...equipo('G'), fechaGarantiaFin: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10) }],
        kitItems: [{ itemId: casco.id, cantidad: 10 }],
      }),
      usuario
    );
    ids.compra = compra.id;
    expect(compra.reparto).toMatchObject({ estado: 'por_repartir', pendiente: 14, repartido: 0 });
    for (const serie of ['A', 'B', 'C', 'G']) expect(await estado(await porSerie(serie))).toBe('por_repartir');
    expect((await prisma.welcomeKitItem.findUniqueOrThrow({ where: { id: casco.id } })).cantidad).toBe(0);
  });

  test('2. reparto: en la sede de llegada queda disponible; a otra sede sale en despacho y llega', async () => {
    const [a, b, c, g] = await Promise.all(['A', 'B', 'C', 'G'].map(porSerie));
    Object.assign(ids, { a, b, c, g });
    const linea = await prisma.purchaseKitItem.findFirstOrThrow({ where: { purchaseId: ids.compra } });

    await repartirCompra(ids.compra, repartoCompraSchema.parse({ sedeDestinoId: ids.llegada, equipos: [a, g], kit: [{ lineaId: linea.id, cantidad: 4 }] }), { emisor: 'Tecnico Prueba', usuario });
    expect(await estado(a)).toBe('disponible');
    expect((await prisma.welcomeKitItem.findUniqueOrThrow({ where: { id: ids.casco } })).cantidad).toBe(4);

    // Ya se repartio algo: la compra no se puede eliminar.
    await expect(eliminarCompra(ids.compra, usuario)).rejects.toMatchObject({ status: 409 });

    const { despacho } = await repartirCompra(
      ids.compra,
      repartoCompraSchema.parse({
        sedeDestinoId: ids.otra,
        equipos: [b, c],
        kit: [{ lineaId: linea.id, cantidad: 6 }],
        envio: { otChilexpress: `OT${s}`, fechaDespacho: new Date(Date.now() - 60_000).toISOString(), receptorNombre: 'Receptor Prueba', receptorRut: '11.111.111-1' },
      }),
      { emisor: 'Tecnico Prueba', usuario }
    );
    expect(despacho).not.toBeNull();
    expect(await estado(b)).toBe('en_transito');

    const guia = await buscarGuia(despacho!.id);
    await confirmarRecepcion(
      guia.id,
      {
        fechaRecepcion: new Date().toISOString(),
        llegaron: guia.items.map((i) => i.id),
        kitRecibido: guia.kitItems.map((k) => ({ lineaId: k.id, cantidad: k.cantidad })),
      },
      quien
    );
    const llegado = await prisma.asset.findUniqueOrThrow({ where: { id: b } });
    expect(llegado).toMatchObject({ estado: 'disponible', sedeId: ids.otra });
    expect((await prisma.dispatchGuide.findUniqueOrThrow({ where: { id: guia.id } })).estado).toBe('recibida');
    const cascoOtra = await prisma.welcomeKitItem.findFirstOrThrow({ where: { sedeId: ids.otra, nombre: `Casco ${s}` } });
    expect(cascoOtra.cantidad).toBe(6);
  });

  test('3. entrega (onboarding), mantención y sus bloqueos, cambio de equipo, desvinculación y baja', async () => {
    // Entrega: A queda asignado a la persona.
    await crearSolicitud(
      createWorkflowRequestSchema.parse({
        tipo: 'onboarding',
        idTicket: `ON-${s}`,
        employeeId: ids.persona,
        fechaIngreso: hoy,
        cargoSolicitado: 'Analista',
        assetIdsSeleccionados: [ids.a],
        fechaEntregaCoordinada: hoy,
        medioEntrega: 'presencial',
        lugarEntrega: 'Oficina',
      }),
      ids.llegada,
      sistema()
    );
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: ids.a } })).toMatchObject({ estado: 'asignado', empleadoActualId: ids.persona });
    const asignacionA = await prisma.assignment.findFirstOrThrow({ where: { assetId: ids.a, activo: true } });

    // Un equipo asignado no se da de baja directo (SPEC 2.106).
    const baja = bajaEquipoSchema.parse({ motivoBajaId: ids.motivo, fechaBaja: hoy });
    await expect(darDeBajaEquipo(ids.a, baja, usuario)).rejects.toMatchObject({ status: 409 });

    // Mantención: programar e iniciar; sigue a nombre de la persona.
    const mantencion = await programarMantencion(
      createMaintenanceSchema.parse({ assetId: ids.a, tipoId: ids.tipo, descripcion: 'No enciende', fechaProgramada: hoy }),
      usuario
    );
    await iniciarMantencion(mantencion.id, usuario);
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: ids.a } })).toMatchObject({ estado: 'en_mantencion', empleadoActualId: ids.persona });

    // Asignado: no queda en espera de repuestos (SPEC 2.148).
    const cerrar = (resultadoTipo: string) =>
      completeMaintenanceSchema.parse({ fechaRealizada: hoy, realizadoPor: 'Soporte', resultado: 'Revisión', resultadoTipo });
    await expect(completarMantencion(mantencion.id, cerrar('pendiente_repuestos'), usuario)).rejects.toMatchObject({ status: 409 });

    // En mantención no se cambia (SPEC 2.148).
    const cambio = (newAssetId: string) =>
      createWorkflowRequestSchema.parse({
        tipo: 'cambio_equipo',
        idTicket: `CA-${s}-${newAssetId.slice(0, 4)}`,
        employeeId: ids.persona,
        motivoCambio: 'Equipo lento',
        cambios: [{ oldAssignmentId: asignacionA.id, newAssetId, estadoDevolucion: 'ok' }],
      });
    await expect(crearSolicitud(cambio(ids.g), ids.llegada, sistema())).rejects.toMatchObject({ status: 409 });
    expect(await estado(ids.g)).toBe('disponible');

    // Reparado: vuelve a la persona.
    await completarMantencion(mantencion.id, cerrar('reparado'), usuario);
    expect(await estado(ids.a)).toBe('asignado');

    // Cambio de equipo: A vuelve disponible y G queda con la persona.
    await crearSolicitud(cambio(ids.g), ids.llegada, sistema());
    expect(await estado(ids.a)).toBe('disponible');
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: ids.g } })).toMatchObject({ estado: 'asignado', empleadoActualId: ids.persona });

    // Desvinculación: G vuelve dañado y queda de baja con su motivo (SPEC 2.135).
    const asignacionG = await prisma.assignment.findFirstOrThrow({ where: { assetId: ids.g, activo: true } });
    await crearSolicitud(
      createWorkflowRequestSchema.parse({
        tipo: 'offboarding',
        idTicket: `OFF-${s}`,
        employeeId: ids.persona,
        fechaDesvinculacion: hoy,
        devoluciones: [{ assignmentId: asignacionG.id, estadoDevolucion: 'danado', motivoBajaId: ids.motivo }],
      }),
      ids.llegada,
      sistema()
    );
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: ids.g } })).toMatchObject({ estado: 'baja', empleadoActualId: null });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: ids.persona } })).estado).toBe('desvinculado');

    // Baja directa de A, ya disponible.
    await darDeBajaEquipo(ids.a, baja, usuario);
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: ids.a } })).toMatchObject({ estado: 'baja', motivoBajaId: ids.motivo });
  });

  test('4. Dashboard: la garantía por vencer de un equipo vigente avisa; si está de baja, no', async () => {
    // G (garantía en 10 días) quedó de baja: no avisa.
    const r = await resumenDashboard(ids.llegada);
    expect(r.garantiasPorVencer.map((x) => x.id)).not.toContain(ids.g);

    // Uno vigente con garantía en 10 días sí.
    await prisma.asset.update({ where: { id: ids.c }, data: { fechaGarantiaFin: new Date(Date.now() + 10 * 86_400_000) } });
    const otra = await resumenDashboard(ids.otra);
    expect(otra.garantiasPorVencer.map((x) => x.id)).toContain(ids.c);
  });
});
