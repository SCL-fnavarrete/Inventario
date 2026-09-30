import { executeAssignment, executeReturn } from '@/modules/asignaciones/ejecucion';
import { executeKitReturn } from '@/modules/kit-epp/entregas';
import { executeKitDelivery } from '@/modules/solicitudes/ejecucion';
import { ConflictError, NotFoundError } from '@/shared/errores';

jest.mock('@/shared/auditoria', () => ({
  auditLogService: { registrarCreacion: jest.fn(), registrarActualizacion: jest.fn() },
}));

/**
 * Nucleo que ejecuta entregas, devoluciones y Kit/EPP (auditoria 27-sep-2026,
 * 5.2-A). Antes tenia 0 % de cobertura. Se prueba con un `tx` falso: cada
 * test fija que devuelve cada consulta.
 */
type Fn = jest.Mock;
function txFalso() {
  return {
    asset: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    employee: { findUnique: jest.fn() },
    assignment: {
      create: jest.fn().mockResolvedValue({ id: 'asig-1' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'asig-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    assetHistory: { create: jest.fn() },
    welcomeKitItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    kitAssignment: {
      create: jest.fn().mockResolvedValue({ id: 'kit-1' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'kit-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    requestKitItem: { updateMany: jest.fn() },
  };
}
type Tx = ReturnType<typeof txFalso>;
const comoTx = (tx: Tx) => tx as never;

const equipo = (o: Record<string, unknown> = {}) => ({
  id: 'a1', estado: 'disponible', sedeId: 'stgo', tieneCargador: false, empleadoActualId: null, categoria: {}, ...o,
});
const empleado = (o: Record<string, unknown> = {}) => ({
  id: 'e1', estado: 'activo', nombres: 'Ana', apellidoPaterno: 'Pérez', rut: null, ...o,
});
const entrega = { assetId: 'a1', employeeId: 'e1', fechaEntrega: new Date(), tipoMovimiento: 'ingreso' as const, sedeId: 'stgo' };

describe('executeAssignment', () => {
  it('entrega un equipo disponible de la misma sede y deja historial', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo());
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    await executeAssignment(comoTx(tx), entrega);
    expect(tx.asset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'a1', estado: 'disponible' }) })
    );
    expect(tx.assignment.create).toHaveBeenCalled();
    expect(tx.assetHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'asignacion' }) })
    );
  });

  it('rechaza un equipo de otra sede como si no existiera (A01-1)', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo({ sedeId: 'conce' }));
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    await expect(executeAssignment(comoTx(tx), entrega)).rejects.toBeInstanceOf(NotFoundError);
    expect(tx.assignment.create).not.toHaveBeenCalled();
  });

  it.each(['asignado', 'en_mantencion', 'baja', 'vendido', 'no_devuelto', 'en_transito', 'por_repartir'])(
    'no entrega un equipo en estado %s',
    async (estado) => {
      const tx = txFalso();
      (tx.asset.findUnique as Fn).mockResolvedValue(equipo({ estado }));
      await expect(executeAssignment(comoTx(tx), entrega)).rejects.toBeInstanceOf(ConflictError);
    }
  );

  it('no entrega a un empleado desvinculado', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo());
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado({ estado: 'desvinculado' }));
    await expect(executeAssignment(comoTx(tx), entrega)).rejects.toThrow(/desvinculado/);
  });

  it('si otra entrega lo tomó en el intertanto, aborta sin crear la asignación (R2)', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo());
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    (tx.asset.updateMany as Fn).mockResolvedValue({ count: 0 });
    await expect(executeAssignment(comoTx(tx), entrega)).rejects.toThrow(/ya fue entregado/);
    expect(tx.assignment.create).not.toHaveBeenCalled();
  });

  it('solo guarda la condición del cargador si el equipo tiene cargador', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo({ tieneCargador: false }));
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    await executeAssignment(comoTx(tx), { ...entrega, condicionCargadorEntrega: 'operativo' });
    expect((tx.assignment.create as Fn).mock.calls[0][0].data).not.toHaveProperty('condicionCargadorEntrega');
  });

  it('la observación del cargador queda como la de la entrega (SPEC 2.121)', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo({ tieneCargador: true }));
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    await executeAssignment(comoTx(tx), {
      ...entrega,
      condicionCargadorEntrega: 'operativo',
      observacionesCargador: 'Con cable original',
    });
    const datos = (tx.assignment.create as Fn).mock.calls[0][0].data;
    expect(datos).toMatchObject({ observacionesCargadorEntrega: 'Con cable original' });
    expect(datos).not.toHaveProperty('observacionesCargadorDevolucion');
  });

  it('el historial anota el usuario; la asignación guarda el nombre (SPEC 2.122)', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo());
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    await executeAssignment(comoTx(tx), { ...entrega, entregadoPor: 'Javier Soto', usuarioSistema: 'jsoto' });
    expect((tx.assetHistory.create as Fn).mock.calls[0][0].data.usuarioSistema).toBe('jsoto');
    expect((tx.assignment.create as Fn).mock.calls[0][0].data.entregadoPor).toBe('Javier Soto');
  });
});

describe('executeKitDelivery', () => {
  const kit = { itemId: 'k1', cantidad: 2, employeeId: 'e1', requestId: 'r1', sedeId: 'stgo' };

  it('descuenta con condición de stock suficiente y marca el requerido como entregado', async () => {
    const tx = txFalso();
    (tx.welcomeKitItem.findUnique as Fn).mockResolvedValue({ id: 'k1', nombre: 'Casco', cantidad: 10, sedeId: 'stgo' });
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    await executeKitDelivery(comoTx(tx), kit);
    expect(tx.welcomeKitItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cantidad: { gte: 2 }, sedeId: 'stgo' }) })
    );
    expect(tx.requestKitItem.updateMany).toHaveBeenCalled();
  });

  it('rechaza un artículo de otra sede (A01-2)', async () => {
    const tx = txFalso();
    (tx.welcomeKitItem.findUnique as Fn).mockResolvedValue({ id: 'k1', nombre: 'Casco', cantidad: 50, sedeId: 'conce' });
    await expect(executeKitDelivery(comoTx(tx), kit)).rejects.toBeInstanceOf(NotFoundError);
    expect(tx.welcomeKitItem.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza stock insuficiente sin crear la entrega (R3)', async () => {
    const tx = txFalso();
    (tx.welcomeKitItem.findUnique as Fn)
      .mockResolvedValueOnce({ id: 'k1', nombre: 'Casco', cantidad: 1, sedeId: 'stgo' })
      .mockResolvedValueOnce({ cantidad: 1 });
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    (tx.welcomeKitItem.updateMany as Fn).mockResolvedValue({ count: 0 });
    await expect(executeKitDelivery(comoTx(tx), kit)).rejects.toThrow(/Stock insuficiente/);
    expect(tx.kitAssignment.create).not.toHaveBeenCalled();
  });
});

describe('executeReturn', () => {
  const asignacion = (o: Record<string, unknown> = {}) => ({
    id: 'asig-1', assetId: 'a1', employeeId: 'e1', activo: true,
    asset: { id: 'a1', estado: 'asignado', empleadoActualId: 'e1', tieneCargador: false },
    employee: { nombres: 'Ana', apellidoPaterno: 'Pérez' },
    ...o,
  });
  const devolucion = { assignmentId: 'asig-1', fechaDevolucion: new Date(), estadoDevolucion: 'ok' as const };

  it('en buen estado cierra la asignación y deja el equipo disponible', async () => {
    const tx = txFalso();
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion());
    await executeReturn(comoTx(tx), devolucion);
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', estado: 'asignado', deletedAt: null },
      data: expect.objectContaining({ estado: 'disponible', empleadoActualId: null, condicion: 'usado' }),
    });
  });

  it('rechaza devolver el equipo de otro empleado', async () => {
    const tx = txFalso();
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion({ employeeId: 'otro' }));
    await expect(executeReturn(comoTx(tx), { ...devolucion, expectedEmployeeId: 'e1' })).rejects.toThrow(/no está asignado/);
  });

  it('una asignación ya cerrada no se devuelve de nuevo', async () => {
    const tx = txFalso();
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion({ activo: false }));
    await expect(executeReturn(comoTx(tx), devolucion)).rejects.toThrow(/ya fue devuelta/);
  });

  it('si otra devolución simultánea la cerró, se rechaza', async () => {
    const tx = txFalso();
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion());
    (tx.assignment.updateMany as Fn).mockResolvedValue({ count: 0 });
    await expect(executeReturn(comoTx(tx), devolucion)).rejects.toThrow(/ya fue devuelta/);
    expect(tx.asset.updateMany).not.toHaveBeenCalled();
  });

  it('"no devuelto" deja la asignación activa y el equipo en no_devuelto', async () => {
    const tx = txFalso();
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion());
    await executeReturn(comoTx(tx), { ...devolucion, estadoDevolucion: 'no_devuelto' });
    expect(tx.assignment.updateMany).not.toHaveBeenCalled();
    expect(tx.asset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: 'no_devuelto' } }));
  });

  it('la observación del cargador va a la de la devolución, sin pisar la de la entrega (SPEC 2.121)', async () => {
    const conCargador = { id: 'a1', estado: 'asignado', empleadoActualId: 'e1', tieneCargador: true };
    for (const estadoDevolucion of ['ok', 'no_devuelto'] as const) {
      const tx = txFalso();
      (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion({ asset: conCargador }));
      await executeReturn(comoTx(tx), {
        ...devolucion,
        estadoDevolucion,
        condicionCargadorDevolucion: 'con_danos',
        observacionesCargador: 'Cable pelado',
      });
      const datos = (tx.assignment.update as Fn).mock.calls[0][0].data;
      expect(datos).toMatchObject({ observacionesCargadorDevolucion: 'Cable pelado' });
      expect(datos).not.toHaveProperty('observacionesCargadorEntrega');
    }
  });

  it('"para dar de baja" (cambio de equipo): va a mantención con el motivo, y el motivo queda como comentario (SPEC 2.126)', async () => {
    const tx = {
      ...txFalso(),
      motivoBaja: { findFirst: jest.fn().mockResolvedValue({ id: 'm-robo', nombre: 'Robo', clave: null }) },
      maintenanceType: { findFirst: jest.fn().mockResolvedValue({ id: 't1', nombre: 'Correctiva' }) },
      maintenance: { create: jest.fn().mockResolvedValue({ id: 'mant-1' }) },
    };
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion());
    await executeReturn(comoTx(tx), {
      ...devolucion,
      estadoDevolucion: 'baja',
      motivoBaja: { id: 'm-robo' },
      observacionesDevolucion: 'En el metro',
      contexto: 'cambio',
    });
    // La asignacion se cierra con el motivo como comentario.
    expect((tx.assignment.update as Fn).mock.calls[0][0].data).toMatchObject({
      estadoDevolucion: 'baja',
      observacionesDevolucion: 'Motivo de baja: Robo — En el metro',
    });
    // El equipo va a mantencion (la baja se completa ahi), sin quien lo tenga.
    expect(tx.asset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'en_mantencion', empleadoActualId: null }) })
    );
    // La mantencion nace con el motivo ya elegido.
    expect(tx.maintenance.create.mock.calls[0][0].data).toMatchObject({
      estado: 'en_proceso',
      motivoBajaId: 'm-robo',
      motivoBaja: 'Robo',
      descripcion: 'Dar de baja (Robo): equipo devuelto por Ana Pérez: En el metro',
    });
    const historial = (tx.assetHistory.create as Fn).mock.calls.map((c) => c[0].data.descripcion);
    expect(historial).toContain('Devuelto por Ana Pérez para dar de baja. Motivo: Robo');
  });

  it('"para dar de baja" sin un motivo válido se rechaza antes de escribir', async () => {
    const tx = { ...txFalso(), motivoBaja: { findFirst: jest.fn().mockResolvedValue(null) } };
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion());
    await expect(
      executeReturn(comoTx(tx), { ...devolucion, estadoDevolucion: 'baja', motivoBaja: { id: 'no-existe' } })
    ).rejects.toThrow(/motivo de baja/);
    expect(tx.assignment.updateMany).not.toHaveBeenCalled();
  });

  it('"no devuelto" guarda el valor del equipo en ese momento, para RRHH (SPEC 2.124)', async () => {
    const tx = txFalso();
    const conValor = { id: 'a1', estado: 'asignado', empleadoActualId: 'e1', tieneCargador: false, valor: 850000 };
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion({ asset: conValor }));
    await executeReturn(comoTx(tx), { ...devolucion, estadoDevolucion: 'no_devuelto' });
    expect((tx.assignment.update as Fn).mock.calls[0][0].data.valorNoDevuelto).toBe(850000);
    const historial = (tx.assetHistory.create as Fn).mock.calls[0][0].data;
    expect(historial.descripcion).toContain('Valor al no devolverse: $850.000');
    expect(historial.datosNuevos).toMatchObject({ valor: 850000 });
  });

  it('"no devuelto" sin valor en el equipo queda igual, sin monto', async () => {
    const tx = txFalso();
    const sinValor = { id: 'a1', estado: 'asignado', empleadoActualId: 'e1', tieneCargador: false, valor: null };
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion({ asset: sinValor }));
    await executeReturn(comoTx(tx), { ...devolucion, estadoDevolucion: 'no_devuelto' });
    expect((tx.assignment.update as Fn).mock.calls[0][0].data.valorNoDevuelto).toBeNull();
    expect((tx.assetHistory.create as Fn).mock.calls[0][0].data.descripcion).not.toContain('Valor');
  });

  it('el historial anota el usuario, también en "no devuelto" (SPEC 2.122)', async () => {
    for (const estadoDevolucion of ['ok', 'no_devuelto'] as const) {
      const tx = txFalso();
      (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion());
      await executeReturn(comoTx(tx), { ...devolucion, estadoDevolucion, recibidoPor: 'Javier Soto', usuarioSistema: 'jsoto' });
      expect((tx.assetHistory.create as Fn).mock.calls[0][0].data.usuarioSistema).toBe('jsoto');
    }
  });
});

describe('executeKitReturn', () => {
  const kitEntregado = { id: 'kit-1', itemId: 'k1', employeeId: 'e1', cantidad: 3, estado: 'entregado', observaciones: null, item: { nombre: 'Casco' } };

  it('en buen estado repone el stock una sola vez', async () => {
    const tx = txFalso();
    (tx.kitAssignment.findUnique as Fn).mockResolvedValue(kitEntregado);
    await executeKitReturn(comoTx(tx), { kitAssignmentId: 'kit-1', estadoDevolucion: 'ok' });
    expect(tx.welcomeKitItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cantidad: { increment: 3 } } })
    );
  });

  it('si otra devolución simultánea ya lo cerró, no repone stock', async () => {
    const tx = txFalso();
    (tx.kitAssignment.findUnique as Fn).mockResolvedValue(kitEntregado);
    (tx.kitAssignment.updateMany as Fn).mockResolvedValue({ count: 0 });
    await expect(executeKitReturn(comoTx(tx), { kitAssignmentId: 'kit-1', estadoDevolucion: 'ok' })).rejects.toThrow(/ya fue devuelto/);
    expect(tx.welcomeKitItem.update).not.toHaveBeenCalled();
  });

  it('dañado o no devuelto no reponen stock', async () => {
    for (const estadoDevolucion of ['danado', 'no_devuelto'] as const) {
      const tx = txFalso();
      (tx.kitAssignment.findUnique as Fn).mockResolvedValue(kitEntregado);
      await executeKitReturn(comoTx(tx), { kitAssignmentId: 'kit-1', estadoDevolucion });
      expect(tx.welcomeKitItem.update).not.toHaveBeenCalled();
    }
  });
});
